import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { z } from "zod";
import bcrypt from "bcrypt";
import { storage, generateAccessToken } from "./storage";
import { 
  extractDischargeContent, 
  extractFromImage, 
  simplifyContent, 
  translateContent 
} from "./services/openai";
import { sendCarePlanEmail, sendCheckInEmail } from "./services/resend";
import { SUPPORTED_LANGUAGES, insertPatientSchema } from "@shared/schema";
import * as pdfParseModule from "pdf-parse";
const pdfParse = (pdfParseModule as any).default || pdfParseModule;

// ============= Rate Limiting for Patient Verification =============
const verificationAttempts = new Map<string, { count: number; lockedUntil?: Date }>();

function checkVerificationLock(token: string): boolean {
  const attempt = verificationAttempts.get(token);
  if (!attempt) return false;
  if (attempt.lockedUntil && new Date() < attempt.lockedUntil) {
    return true; // Still locked
  }
  if (attempt.lockedUntil && new Date() >= attempt.lockedUntil) {
    verificationAttempts.delete(token); // Lock expired
    return false;
  }
  return false;
}

function recordVerificationAttempt(token: string, success: boolean): { locked: boolean; attemptsRemaining: number } {
  if (success) {
    verificationAttempts.delete(token);
    return { locked: false, attemptsRemaining: 3 };
  }
  
  const attempt = verificationAttempts.get(token) || { count: 0 };
  attempt.count++;
  
  if (attempt.count >= 3) {
    const lockTime = new Date();
    lockTime.setMinutes(lockTime.getMinutes() + 15);
    attempt.lockedUntil = lockTime;
    verificationAttempts.set(token, attempt);
    return { locked: true, attemptsRemaining: 0 };
  }
  
  verificationAttempts.set(token, attempt);
  return { locked: false, attemptsRemaining: 3 - attempt.count };
}

// ============= Validation Schemas =============
const processCarePlanSchema = z.object({
  language: z.string().min(2).max(5),
});

const sendCarePlanSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  phone: z.string().optional(),
  yearOfBirth: z.number().int().min(1900).max(2100),
  preferredLanguage: z.string().min(2).max(5),
});

const verifyPatientSchema = z.object({
  yearOfBirth: z.number().int().min(1900).max(2100),
});

const checkInResponseSchema = z.object({
  response: z.enum(["green", "yellow", "red"]),
});

// ============= Session-based Auth Middleware =============
function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  (req as any).userId = req.session.userId;
  (req as any).userRole = req.session.userRole;
  (req as any).userName = req.session.userName;
  next();
}

function requireClinicianAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  if (req.session.userRole !== "clinician" && req.session.userRole !== "admin") {
    return res.status(403).json({ error: "Access denied. Clinician or admin role required." });
  }
  (req as any).clinicianId = req.session.userId;
  next();
}

function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  if (req.session.userRole !== "admin") {
    return res.status(403).json({ error: "Access denied. Admin role required." });
  }
  (req as any).adminId = req.session.userId;
  next();
}

// Helper to safely get first value from query param
function getQueryString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

// Validation middleware helper
function validateBody<T extends z.ZodSchema>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ 
        error: "Validation failed", 
        details: result.error.errors 
      });
    }
    req.body = result.data;
    next();
  };
}

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/heic"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only PDF and images are allowed."));
    }
  },
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // ============= Authentication API =============
  
  // Login
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ error: "Username and password required" });
      }
      
      const user = await storage.getUserByUsername(username);
      
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      const passwordMatch = await bcrypt.compare(password, user.password);
      if (!passwordMatch) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      req.session.userId = user.id;
      req.session.userRole = user.role;
      req.session.userName = user.name;
      
      res.json({ 
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role 
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });
  
  // Logout
  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Logout failed" });
      }
      res.json({ success: true });
    });
  });
  
  // Get current user
  app.get("/api/auth/me", (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    res.json({
      id: req.session.userId,
      name: req.session.userName,
      role: req.session.userRole,
    });
  });
  
  // ============= Care Plans API (Clinician) =============
  
  // Get all care plans (for clinician dashboard)
  app.get("/api/care-plans", requireClinicianAuth, async (req: Request, res: Response) => {
    try {
      const carePlans = await storage.getAllCarePlans();
      
      // Enrich with patient data
      const enrichedPlans = await Promise.all(
        carePlans.map(async (plan) => {
          const patient = plan.patientId ? await storage.getPatient(plan.patientId) : undefined;
          const checkIns = await storage.getCheckInsByCarePlanId(plan.id);
          return { ...plan, patient, checkIns };
        })
      );
      
      res.json(enrichedPlans);
    } catch (error) {
      console.error("Error fetching care plans:", error);
      res.status(500).json({ error: "Failed to fetch care plans" });
    }
  });

  // Upload discharge document
  app.post("/api/care-plans/upload", requireClinicianAuth, upload.single("file"), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const file = req.file;
      const clinicianId = (req as any).clinicianId || "clinician-1";
      let extractedText = "";

      // Extract text based on file type
      if (file.mimetype === "application/pdf") {
        // Parse PDF
        const pdfData = await pdfParse.default(file.buffer);
        extractedText = pdfData.text;
      } else {
        // For images, we'll use GPT-4o Vision
        const base64Image = file.buffer.toString("base64");
        const extracted = await extractFromImage(base64Image);
        
        // Create care plan with extracted content
        const carePlan = await storage.createCarePlan({
          clinicianId,
          status: "draft",
          originalContent: JSON.stringify(extracted),
          originalFileName: file.originalname,
          diagnosis: extracted.diagnosis,
          medications: extracted.medications,
          appointments: extracted.appointments,
          instructions: extracted.instructions,
          warnings: extracted.warnings,
        });

        // Create audit log
        await storage.createAuditLog({
          carePlanId: carePlan.id,
          userId: clinicianId,
          action: "uploaded",
          details: { fileName: file.originalname, fileType: file.mimetype },
          ipAddress: req.ip || null,
          userAgent: req.get("user-agent") || null,
        });

        return res.json(carePlan);
      }

      // For PDFs, extract structured content
      const extracted = await extractDischargeContent(extractedText);
      
      const carePlan = await storage.createCarePlan({
        clinicianId,
        status: "draft",
        originalContent: extractedText,
        originalFileName: file.originalname,
        diagnosis: extracted.diagnosis,
        medications: extracted.medications,
        appointments: extracted.appointments,
        instructions: extracted.instructions,
        warnings: extracted.warnings,
      });

      await storage.createAuditLog({
        carePlanId: carePlan.id,
        userId: clinicianId,
        action: "uploaded",
        details: { fileName: file.originalname, fileType: file.mimetype },
        ipAddress: req.ip || null,
        userAgent: req.get("user-agent") || null,
      });

      res.json(carePlan);
    } catch (error) {
      console.error("Error uploading file:", error);
      res.status(500).json({ error: "Failed to process upload" });
    }
  });

  // Process care plan (simplify + translate)
  app.post("/api/care-plans/:id/process", requireClinicianAuth, validateBody(processCarePlanSchema), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { language } = req.body;
      const clinicianId = (req as any).clinicianId || "clinician-1";

      const carePlan = await storage.getCarePlan(id);
      if (!carePlan) {
        return res.status(404).json({ error: "Care plan not found" });
      }

      // Simplify content
      const simplified = await simplifyContent({
        diagnosis: carePlan.diagnosis || "",
        medications: carePlan.medications || [],
        appointments: carePlan.appointments || [],
        instructions: carePlan.instructions || "",
        warnings: carePlan.warnings || "",
      });

      // Translate content
      const languageName = SUPPORTED_LANGUAGES.find(l => l.code === language)?.name || language;
      const translated = await translateContent(simplified, languageName);

      // Update care plan
      const updated = await storage.updateCarePlan(id, {
        status: "pending_review",
        simplifiedDiagnosis: simplified.diagnosis,
        simplifiedMedications: simplified.medications,
        simplifiedAppointments: simplified.appointments,
        simplifiedInstructions: simplified.instructions,
        simplifiedWarnings: simplified.warnings,
        translatedLanguage: language,
        translatedDiagnosis: translated.diagnosis,
        translatedMedications: translated.medications,
        translatedAppointments: translated.appointments,
        translatedInstructions: translated.instructions,
        translatedWarnings: translated.warnings,
        backTranslatedDiagnosis: translated.backTranslatedDiagnosis,
        backTranslatedInstructions: translated.backTranslatedInstructions,
        backTranslatedWarnings: translated.backTranslatedWarnings,
      });

      await storage.createAuditLog({
        carePlanId: id,
        userId: clinicianId,
        action: "processed",
        details: { language },
        ipAddress: req.ip || null,
        userAgent: req.get("user-agent") || null,
      });

      res.json(updated);
    } catch (error) {
      console.error("Error processing care plan:", error);
      res.status(500).json({ error: "Failed to process care plan" });
    }
  });

  // Approve care plan
  app.post("/api/care-plans/:id/approve", requireClinicianAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const clinicianId = (req as any).clinicianId || "clinician-1";

      const carePlan = await storage.getCarePlan(id);
      if (!carePlan) {
        return res.status(404).json({ error: "Care plan not found" });
      }

      const updated = await storage.updateCarePlan(id, {
        status: "approved",
        approvedBy: clinicianId,
        approvedAt: new Date(),
      });

      await storage.createAuditLog({
        carePlanId: id,
        userId: clinicianId,
        action: "approved",
        ipAddress: req.ip || null,
        userAgent: req.get("user-agent") || null,
      });

      res.json(updated);
    } catch (error) {
      console.error("Error approving care plan:", error);
      res.status(500).json({ error: "Failed to approve care plan" });
    }
  });

  // Send care plan to patient
  app.post("/api/care-plans/:id/send", requireClinicianAuth, validateBody(sendCarePlanSchema), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { name, email, phone, yearOfBirth, preferredLanguage } = req.body;
      const clinicianId = (req as any).clinicianId || "clinician-1";

      const carePlan = await storage.getCarePlan(id);
      if (!carePlan) {
        return res.status(404).json({ error: "Care plan not found" });
      }

      // Create or update patient
      let patient = await storage.getPatientByEmail(email);
      if (!patient) {
        patient = await storage.createPatient({
          name,
          email,
          phone,
          yearOfBirth,
          preferredLanguage,
        });
      }

      // Generate access token
      const accessToken = generateAccessToken();
      const accessTokenExpiry = new Date();
      accessTokenExpiry.setDate(accessTokenExpiry.getDate() + 30); // 30 days

      // Update care plan
      const updated = await storage.updateCarePlan(id, {
        status: "sent",
        patientId: patient.id,
        accessToken,
        accessTokenExpiry,
        dischargeDate: new Date(),
      });

      // Schedule check-in for T+24 hours
      const scheduledFor = new Date();
      scheduledFor.setHours(scheduledFor.getHours() + 24);
      
      await storage.createCheckIn({
        carePlanId: id,
        patientId: patient.id,
        scheduledFor,
        attemptNumber: 1,
      });

      // Send email with magic link
      const baseUrl = process.env.REPLIT_DEV_DOMAIN 
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : "http://localhost:5000";
      const accessLink = `${baseUrl}/p/${accessToken}`;

      try {
        await sendCarePlanEmail(email, name, accessLink);
      } catch (emailError) {
        console.error("Email sending failed:", emailError);
        // Continue even if email fails - care plan is still sent
      }

      await storage.createAuditLog({
        carePlanId: id,
        userId: clinicianId,
        action: "sent",
        details: { patientEmail: email },
        ipAddress: req.ip || null,
        userAgent: req.get("user-agent") || null,
      });

      // Return enriched plan
      const checkIns = await storage.getCheckInsByCarePlanId(id);
      res.json({ ...updated, patient, checkIns });
    } catch (error) {
      console.error("Error sending care plan:", error);
      res.status(500).json({ error: "Failed to send care plan" });
    }
  });

  // ============= Patient Portal API =============

  // Verify patient access (with server-side rate limiting)
  app.post("/api/patient/:token/verify", validateBody(verifyPatientSchema), async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const { yearOfBirth } = req.body;

      // Check if locked out
      if (checkVerificationLock(token)) {
        return res.status(429).json({ 
          error: "Too many attempts. Please try again in 15 minutes.",
          locked: true,
          attemptsRemaining: 0
        });
      }

      const carePlan = await storage.getCarePlanByToken(token);
      if (!carePlan) {
        return res.status(404).json({ error: "Care plan not found" });
      }

      // Check token expiry
      if (carePlan.accessTokenExpiry && new Date() > new Date(carePlan.accessTokenExpiry)) {
        return res.status(403).json({ error: "Access link has expired" });
      }

      // Verify year of birth
      const patient = carePlan.patientId ? await storage.getPatient(carePlan.patientId) : null;
      if (!patient || patient.yearOfBirth !== yearOfBirth) {
        const result = recordVerificationAttempt(token, false);
        
        await storage.createAuditLog({
          carePlanId: carePlan.id,
          action: "verification_failed",
          details: { attemptsRemaining: result.attemptsRemaining },
          ipAddress: req.ip || null,
          userAgent: req.get("user-agent") || null,
        });

        if (result.locked) {
          return res.status(429).json({ 
            error: "Too many attempts. Please try again in 15 minutes.",
            locked: true,
            attemptsRemaining: 0
          });
        }

        return res.status(401).json({ 
          error: "Incorrect year of birth",
          attemptsRemaining: result.attemptsRemaining
        });
      }

      // Successful verification
      recordVerificationAttempt(token, true);

      await storage.createAuditLog({
        carePlanId: carePlan.id,
        action: "verified",
        ipAddress: req.ip || null,
        userAgent: req.get("user-agent") || null,
      });

      res.json({ verified: true });
    } catch (error) {
      console.error("Error verifying patient:", error);
      res.status(500).json({ error: "Verification failed" });
    }
  });

  // Get care plan by token (for patient view)
  app.get("/api/patient/:token", async (req: Request, res: Response) => {
    try {
      const { token } = req.params;

      const carePlan = await storage.getCarePlanByToken(token);
      if (!carePlan) {
        return res.status(404).json({ error: "Care plan not found" });
      }

      // Log view
      await storage.createAuditLog({
        carePlanId: carePlan.id,
        action: "viewed",
        ipAddress: req.ip || null,
        userAgent: req.get("user-agent") || null,
      });

      const patient = carePlan.patientId ? await storage.getPatient(carePlan.patientId) : null;
      const checkIns = await storage.getCheckInsByCarePlanId(carePlan.id);

      res.json({ ...carePlan, patient, checkIns });
    } catch (error) {
      console.error("Error fetching patient care plan:", error);
      res.status(500).json({ error: "Failed to fetch care plan" });
    }
  });

  // Submit check-in response
  app.post("/api/patient/:token/check-in", validateBody(checkInResponseSchema), async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const { response } = req.body; // green, yellow, red

      const carePlan = await storage.getCarePlanByToken(token);
      if (!carePlan) {
        return res.status(404).json({ error: "Care plan not found" });
      }

      // Find pending check-in
      const checkIns = await storage.getCheckInsByCarePlanId(carePlan.id);
      const pendingCheckIn = checkIns.find(c => !c.respondedAt);

      if (pendingCheckIn) {
        await storage.updateCheckIn(pendingCheckIn.id, {
          response,
          respondedAt: new Date(),
          alertCreated: response === "yellow" || response === "red",
        });

        // Update care plan status if completed
        if (response === "green") {
          await storage.updateCarePlan(carePlan.id, {
            status: "completed",
          });
        }

        await storage.createAuditLog({
          carePlanId: carePlan.id,
          action: "check_in_responded",
          details: { response },
          ipAddress: req.ip || null,
          userAgent: req.get("user-agent") || null,
        });
      }

      res.json({ success: true, response });
    } catch (error) {
      console.error("Error submitting check-in:", error);
      res.status(500).json({ error: "Failed to submit check-in" });
    }
  });

  // ============= Admin API =============

  // Get all care plans with full details (admin view)
  app.get("/api/admin/care-plans", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const carePlans = await storage.getAllCarePlans();
      
      const enrichedPlans = await Promise.all(
        carePlans.map(async (plan) => {
          const patient = plan.patientId ? await storage.getPatient(plan.patientId) : undefined;
          const checkIns = await storage.getCheckInsByCarePlanId(plan.id);
          const auditLogs = await storage.getAuditLogsByCarePlanId(plan.id);
          return { ...plan, patient, checkIns, auditLogs };
        })
      );
      
      res.json(enrichedPlans);
    } catch (error) {
      console.error("Error fetching admin care plans:", error);
      res.status(500).json({ error: "Failed to fetch care plans" });
    }
  });

  // Get alerts
  app.get("/api/admin/alerts", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const alerts = await storage.getAlerts();
      res.json(alerts);
    } catch (error) {
      console.error("Error fetching alerts:", error);
      res.status(500).json({ error: "Failed to fetch alerts" });
    }
  });

  // Resolve alert
  app.post("/api/admin/alerts/:id/resolve", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const adminId = (req as any).adminId || "admin-1";
      await storage.resolveAlert(id, adminId);
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error resolving alert:", error);
      res.status(500).json({ error: "Failed to resolve alert" });
    }
  });

  // Export CSV
  app.post("/api/admin/export", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const carePlans = await storage.getAllCarePlans();
      
      const rows: string[] = [
        "patient_name,mrn,discharge_date,discharge_diagnosis,approved_by,approved_at,sent_at,first_contact_at,response_at,response_type,audit_log_id,suggested_cpt_code",
      ];

      for (const plan of carePlans) {
        const patient = plan.patientId ? await storage.getPatient(plan.patientId) : null;
        const checkIns = await storage.getCheckInsByCarePlanId(plan.id);
        const respondedCheckIn = checkIns.find(c => c.respondedAt);
        const auditLogs = await storage.getAuditLogsByCarePlanId(plan.id);
        
        const row = [
          patient?.name || "",
          "", // MRN not available
          plan.dischargeDate ? new Date(plan.dischargeDate).toISOString().split("T")[0] : "",
          (plan.diagnosis || "").replace(/,/g, ";").replace(/\n/g, " "),
          plan.approvedBy || "",
          plan.approvedAt ? new Date(plan.approvedAt).toISOString() : "",
          plan.status === "sent" || plan.status === "completed" ? new Date(plan.updatedAt).toISOString() : "",
          checkIns[0]?.sentAt ? new Date(checkIns[0].sentAt).toISOString() : "",
          respondedCheckIn?.respondedAt ? new Date(respondedCheckIn.respondedAt).toISOString() : "",
          respondedCheckIn?.response || "",
          auditLogs[0]?.id || "",
          respondedCheckIn ? "99495" : "99496",
        ];
        
        rows.push(row.join(","));
      }

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=tcm-export.csv");
      res.send(rows.join("\n"));
    } catch (error) {
      console.error("Error exporting CSV:", error);
      res.status(500).json({ error: "Failed to export" });
    }
  });

  // ============= Check-in Email Scheduler Endpoint =============
  // This endpoint can be called by a cron job or external scheduler
  app.post("/api/internal/send-pending-check-ins", async (req: Request, res: Response) => {
    try {
      const pendingCheckIns = await storage.getPendingCheckIns();
      let sentCount = 0;

      for (const checkIn of pendingCheckIns) {
        const carePlan = await storage.getCarePlan(checkIn.carePlanId);
        if (!carePlan || !carePlan.accessToken) continue;

        const patient = checkIn.patientId ? await storage.getPatient(checkIn.patientId) : null;
        if (!patient) continue;

        const baseUrl = process.env.REPLIT_DEV_DOMAIN 
          ? `https://${process.env.REPLIT_DEV_DOMAIN}`
          : "http://localhost:5000";
        const accessLink = `${baseUrl}/p/${carePlan.accessToken}`;

        try {
          await sendCheckInEmail(patient.email, patient.name, accessLink, checkIn.attemptNumber);
          await storage.updateCheckIn(checkIn.id, { sentAt: new Date() });
          
          await storage.createAuditLog({
            carePlanId: carePlan.id,
            action: "check_in_sent",
            details: { attemptNumber: checkIn.attemptNumber },
          });
          
          sentCount++;
        } catch (emailError) {
          console.error("Failed to send check-in email:", emailError);
        }
      }

      res.json({ success: true, sent: sentCount });
    } catch (error) {
      console.error("Error sending pending check-ins:", error);
      res.status(500).json({ error: "Failed to send check-ins" });
    }
  });

  return httpServer;
}
