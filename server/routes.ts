import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { z } from "zod";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { storage, generateAccessToken } from "./storage";
import { 
  extractDischargeContent, 
  extractFromImage, 
  simplifyContent, 
  translateContent 
} from "./services/openai";
import { sendCarePlanEmail, sendCheckInEmail } from "./services/resend";
import { SUPPORTED_LANGUAGES, insertPatientSchema } from "@shared/schema";
import { isDemoMode } from "./index";

// Helper to generate a 4-digit PIN for patient verification
function generatePin(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// Helper to extract last name from full name
function extractLastName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : parts[0];
}

// Demo token store (in-memory, expires after 5 minutes)
const demoTokens = new Map<string, { accessToken: string; expiresAt: Date }>();

// Generate a secure demo token for clinician preview
function generateDemoToken(accessToken: string): string {
  const demoToken = crypto.randomBytes(32).toString("hex");
  demoTokens.set(demoToken, {
    accessToken,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
  });
  return demoToken;
}

// Validate demo token
function validateDemoToken(demoToken: string, accessToken: string): boolean {
  const entry = demoTokens.get(demoToken);
  if (!entry) return false;
  if (new Date() > entry.expiresAt) {
    demoTokens.delete(demoToken);
    return false;
  }
  if (entry.accessToken !== accessToken) return false;
  return true;
}
// Import pdfjs-dist legacy build for Node.js compatibility (no DOM APIs needed)
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

// Helper function to extract text from PDF buffer
async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const data = new Uint8Array(buffer);
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  let text = "";
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item: any) => item.str || "")
      .join(" ");
    text += pageText + "\n";
  }
  
  return text.trim();
}

// Helper to extract string param safely
function getParam(params: Record<string, string | string[]>, key: string): string {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

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

// Production patient verification requires lastName + yearOfBirth + PIN
// Demo mode only requires yearOfBirth for backward compatibility
const verifyPatientSchema = z.object({
  yearOfBirth: z.number().int().min(1900).max(2100),
  lastName: z.string().optional(), // Required in production mode
  pin: z.string().length(4).optional(), // 4-digit PIN, required in production mode
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
  
  // ============= Serve Mock PDFs =============
  // Route to serve PDF files from attached_assets/mock_pdfs
  app.get("/api/documents/:filename", requireClinicianAuth, async (req: Request, res: Response) => {
    try {
      const { filename } = req.params;
      const path = await import("path");
      const fs = await import("fs");
      
      // Sanitize filename to prevent directory traversal
      const sanitizedFilename = path.basename(filename);
      const filePath = path.join(process.cwd(), "attached_assets", "mock_pdfs", sanitizedFilename);
      
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "Document not found" });
      }
      
      // Serve the PDF
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${sanitizedFilename}"`);
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
    } catch (error) {
      console.error("Error serving document:", error);
      res.status(500).json({ error: "Failed to serve document" });
    }
  });

  // Serve PDF from care plan's stored data (for both clinician and patient portal)
  // Authorization: requires either clinician session OR valid patient access token
  app.get("/api/care-plans/:id/document", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { token } = req.query; // Patient access token from query param
      
      const carePlan = await storage.getCarePlan(id);
      
      if (!carePlan) {
        return res.status(404).json({ error: "Care plan not found" });
      }
      
      // Check authorization: clinician/admin session OR valid patient access token
      const isAuthenticated = req.session?.userId && (req.session?.userRole === "clinician" || req.session?.userRole === "admin");
      const hasValidToken = token && carePlan.accessToken === token && 
        (!carePlan.accessTokenExpiry || new Date(carePlan.accessTokenExpiry) > new Date());
      
      if (!isAuthenticated && !hasValidToken) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      // If we have stored file data, serve it
      if (carePlan.originalFileData) {
        const buffer = Buffer.from(carePlan.originalFileData, "base64");
        const filename = carePlan.originalFileName || "document.pdf";
        const isPdf = filename.toLowerCase().endsWith(".pdf");
        
        res.setHeader("Content-Type", isPdf ? "application/pdf" : "image/png");
        res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
        res.send(buffer);
        return;
      }
      
      // Fallback: try to serve from mock_pdfs folder for seed data
      if (carePlan.originalFileName) {
        const path = await import("path");
        const fs = await import("fs");
        const sanitizedFilename = path.basename(carePlan.originalFileName);
        const filePath = path.join(process.cwd(), "attached_assets", "mock_pdfs", sanitizedFilename);
        
        if (fs.existsSync(filePath)) {
          res.setHeader("Content-Type", "application/pdf");
          res.setHeader("Content-Disposition", `inline; filename="${sanitizedFilename}"`);
          const fileStream = fs.createReadStream(filePath);
          fileStream.pipe(res);
          return;
        }
      }
      
      return res.status(404).json({ error: "Document file not found" });
    } catch (error) {
      console.error("Error serving care plan document:", error);
      res.status(500).json({ error: "Failed to serve document" });
    }
  });

  // Serve sample documents for upload dialog
  app.get("/sample-docs/:filename", async (req: Request, res: Response) => {
    try {
      const { filename } = req.params;
      const path = await import("path");
      const fs = await import("fs");
      
      const sanitizedFilename = path.basename(filename);
      const filePath = path.join(process.cwd(), "attached_assets", "mock_pdfs", sanitizedFilename);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "Sample document not found" });
      }
      
      res.setHeader("Content-Type", "application/pdf");
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
    } catch (error) {
      console.error("Error serving sample document:", error);
      res.status(500).json({ error: "Failed to serve sample document" });
    }
  });

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
      const clinicianId = req.session.userId;
      const userRole = req.session.userRole;
      
      let carePlans = await storage.getAllCarePlans();
      
      // Clinicians only see their own care plans; admins see all
      if (userRole === "clinician" && clinicianId) {
        carePlans = carePlans.filter(plan => plan.clinicianId === clinicianId);
      }
      
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
      
      // Validate file size (must have content)
      if (file.size < 100) {
        return res.status(400).json({ error: "File appears to be empty or too small. Please upload a valid discharge document." });
      }
      
      const clinicianId = (req as any).clinicianId || "clinician-1";
      let extractedText = "";

      // Extract text based on file type
      if (file.mimetype === "application/pdf") {
        // Try parsing PDF using pdfjs-dist, fall back to AI extraction
        try {
          extractedText = await extractTextFromPdf(file.buffer);
          // If PDF had no text (empty or scanned), use AI
          if (!extractedText || extractedText.trim().length < 50) {
            throw new Error("PDF appears empty or scanned");
          }
        } catch (pdfError) {
          console.log("PDF parsing failed, falling back to AI extraction:", pdfError);
          // Fall back to AI extraction - treat PDF as an image-like document
          const base64Doc = file.buffer.toString("base64");
          const extracted = await extractFromImage(base64Doc);
          
          const carePlan = await storage.createCarePlan({
            clinicianId,
            status: "draft",
            originalContent: JSON.stringify(extracted),
            originalFileName: file.originalname,
            originalFileData: file.buffer.toString("base64"),
            extractedPatientName: extracted.patientName,
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
            details: { fileName: file.originalname, fileType: file.mimetype, method: "ai-fallback", patientName: extracted.patientName },
            ipAddress: req.ip || null,
            userAgent: req.get("user-agent") || null,
          });

          return res.json(carePlan);
        }
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
          originalFileData: base64Image,
          extractedPatientName: extracted.patientName,
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
          details: { fileName: file.originalname, fileType: file.mimetype, patientName: extracted.patientName },
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
        originalFileData: file.buffer.toString("base64"),
        extractedPatientName: extracted.patientName,
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
        details: { fileName: file.originalname, fileType: file.mimetype, patientName: extracted.patientName },
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
      const id = req.params.id as string;
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

      // For English, skip translation - just use simplified content
      // For other languages, translate the simplified content
      let translated;
      if (language === "en") {
        // English patients only need simplification, no translation
        translated = {
          diagnosis: simplified.diagnosis,
          medications: simplified.medications,
          appointments: simplified.appointments,
          instructions: simplified.instructions,
          warnings: simplified.warnings,
          backTranslatedDiagnosis: null,
          backTranslatedInstructions: null,
          backTranslatedWarnings: null,
        };
      } else {
        const languageName = SUPPORTED_LANGUAGES.find(l => l.code === language)?.name || language;
        translated = await translateContent(simplified, languageName);
      }

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
      const id = req.params.id as string;
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
      const id = req.params.id as string;
      const { name, email, phone, yearOfBirth, preferredLanguage } = req.body;
      const clinicianId = (req as any).clinicianId || "clinician-1";

      const carePlan = await storage.getCarePlan(id);
      if (!carePlan) {
        return res.status(404).json({ error: "Care plan not found" });
      }

      // Generate PIN for patient verification (production security)
      const patientPin = generatePin();
      const lastName = extractLastName(name);
      
      // Create or update patient
      let patient = await storage.getPatientByEmail(email);
      if (!patient) {
        patient = await storage.createPatient({
          name,
          lastName,
          email,
          phone,
          yearOfBirth,
          pin: patientPin,
          preferredLanguage,
        });
      } else {
        // Update patient with new PIN and lastName for this care plan
        patient = await storage.updatePatient(patient.id, {
          lastName,
          pin: patientPin,
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

      // Send email with magic link and PIN (for production mode verification)
      const baseUrl = process.env.REPLIT_DEV_DOMAIN 
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : "http://localhost:5000";
      const accessLink = `${baseUrl}/p/${accessToken}`;

      try {
        // Include PIN in email for production auth (patient will need lastName + yearOfBirth + PIN)
        await sendCarePlanEmail(email, name, accessLink, patientPin);
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

  // Generate demo token for clinician preview (requires clinician auth)
  app.post("/api/care-plans/:id/demo-token", requireClinicianAuth, async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const carePlan = await storage.getCarePlan(id);
      
      if (!carePlan) {
        return res.status(404).json({ error: "Care plan not found" });
      }
      
      if (!carePlan.accessToken) {
        return res.status(400).json({ error: "Care plan has no access token" });
      }
      
      const demoToken = generateDemoToken(carePlan.accessToken);
      res.json({ demoToken });
    } catch (error) {
      console.error("Error generating demo token:", error);
      res.status(500).json({ error: "Failed to generate demo token" });
    }
  });

  // Delete care plan
  app.delete("/api/care-plans/:id", requireClinicianAuth, async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const carePlan = await storage.getCarePlan(id);
      
      if (!carePlan) {
        return res.status(404).json({ error: "Care plan not found" });
      }
      
      // Only allow deletion if not yet sent
      if (carePlan.status === "sent" || carePlan.status === "completed") {
        return res.status(400).json({ error: "Cannot delete a care plan that has been sent to the patient" });
      }
      
      const deleted = await storage.deleteCarePlan(id);
      if (deleted) {
        res.json({ success: true });
      } else {
        res.status(500).json({ error: "Failed to delete care plan" });
      }
    } catch (error) {
      console.error("Error deleting care plan:", error);
      res.status(500).json({ error: "Failed to delete care plan" });
    }
  });

  // ============= Patient Portal API =============

  // Validate demo token (for clinician preview mode)
  app.post("/api/patient/:token/validate-demo", async (req: Request, res: Response) => {
    try {
      const accessToken = req.params.token as string;
      const { demoToken } = req.body;
      
      if (!demoToken) {
        return res.status(400).json({ valid: false });
      }
      
      const valid = validateDemoToken(demoToken, accessToken);
      res.json({ valid });
    } catch (error) {
      console.error("Error validating demo token:", error);
      res.status(500).json({ valid: false });
    }
  });

  // Verify patient access (with server-side rate limiting)
  // In demo mode: only yearOfBirth required
  // In production mode: lastName + yearOfBirth + PIN required
  app.post("/api/patient/:token/verify", validateBody(verifyPatientSchema), async (req: Request, res: Response) => {
    try {
      const token = req.params.token as string;
      const { yearOfBirth, lastName, pin } = req.body;

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

      const patient = carePlan.patientId ? await storage.getPatient(carePlan.patientId) : null;
      if (!patient) {
        return res.status(404).json({ error: "Patient not found" });
      }
      
      // In production mode, verify lastName + yearOfBirth + PIN
      // In demo mode, only verify yearOfBirth for backward compatibility
      let isValid = false;
      
      if (isDemoMode) {
        // Demo mode: only year of birth required
        isValid = patient.yearOfBirth === yearOfBirth;
      } else {
        // Production mode: require all three fields
        if (!lastName || !pin) {
          return res.status(400).json({ 
            error: "Last name, year of birth, and PIN are required",
            requiresFullAuth: true
          });
        }
        
        // Case-insensitive last name comparison
        const patientLastName = (patient.lastName || extractLastName(patient.name)).toLowerCase();
        const providedLastName = lastName.toLowerCase().trim();
        
        isValid = patientLastName === providedLastName && 
                  patient.yearOfBirth === yearOfBirth && 
                  patient.pin === pin;
      }
      
      if (!isValid) {
        const result = recordVerificationAttempt(token, false);
        
        await storage.createAuditLog({
          carePlanId: carePlan.id,
          action: "verification_failed",
          details: { attemptsRemaining: result.attemptsRemaining, mode: isDemoMode ? "demo" : "production" },
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
          error: isDemoMode ? "Incorrect year of birth" : "Incorrect verification details",
          attemptsRemaining: result.attemptsRemaining
        });
      }

      // Successful verification
      recordVerificationAttempt(token, true);

      await storage.createAuditLog({
        carePlanId: carePlan.id,
        action: "verified",
        details: { mode: isDemoMode ? "demo" : "production" },
        ipAddress: req.ip || null,
        userAgent: req.get("user-agent") || null,
      });

      res.json({ verified: true, isDemoMode });
    } catch (error) {
      console.error("Error verifying patient:", error);
      res.status(500).json({ error: "Verification failed" });
    }
  });

  // Get care plan by token (for patient view)
  app.get("/api/patient/:token", async (req: Request, res: Response) => {
    try {
      const token = req.params.token as string;

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
      const token = req.params.token as string;
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
          const clinician = plan.clinicianId ? await storage.getUser(plan.clinicianId) : undefined;
          const checkIns = await storage.getCheckInsByCarePlanId(plan.id);
          const auditLogs = await storage.getAuditLogsByCarePlanId(plan.id);
          return { 
            ...plan, 
            patient, 
            clinician: clinician ? { id: clinician.id, name: clinician.name } : undefined,
            checkIns, 
            auditLogs 
          };
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
      const id = req.params.id as string;
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

  // ============= Environment Info Endpoint =============
  // Returns environment info for frontend feature flags
  app.get("/api/env-info", (req: Request, res: Response) => {
    res.json({ 
      isDemoMode,
      isProduction: process.env.NODE_ENV === "production"
    });
  });

  // ============= Demo Reset Endpoint =============
  // Reset the database to demo state (only available in demo mode)
  app.post("/api/admin/reset-demo", requireAuth, async (req: Request, res: Response) => {
    try {
      // Block demo reset in production mode
      if (!isDemoMode) {
        return res.status(403).json({ 
          error: "Demo reset is disabled in production mode",
          isDemoMode: false
        });
      }
      
      // Set ALLOW_SEED temporarily for demo reset
      process.env.ALLOW_SEED = "true";
      
      const { seedDatabase } = await import("./seed");
      await seedDatabase(true); // force=true to reseed even if data exists
      
      // Clear the flag after seeding
      delete process.env.ALLOW_SEED;
      
      // Clear session data first to ensure no stale userId even if destroy fails
      delete req.session.userId;
      delete req.session.userRole;
      
      // Destroy the session since user IDs have changed
      req.session.destroy((err) => {
        if (err) {
          console.error("Error destroying session:", err);
          // Session data already cleared, so return success but log the error
        }
        res.json({ success: true, message: "Demo data reset successfully", requiresRelogin: true });
      });
    } catch (error) {
      // Clear the flag on error too
      delete process.env.ALLOW_SEED;
      console.error("Error resetting demo data:", error);
      res.status(500).json({ error: "Failed to reset demo data" });
    }
  });

  // Public reset endpoint for login page (no auth required, only in demo mode)
  app.post("/api/public/reset-demo", async (req: Request, res: Response) => {
    try {
      // Block demo reset in production mode
      if (!isDemoMode) {
        return res.status(403).json({ 
          error: "Demo reset is disabled in production mode",
          isDemoMode: false
        });
      }
      
      // Set ALLOW_SEED temporarily for demo reset
      process.env.ALLOW_SEED = "true";
      
      const { seedDatabase } = await import("./seed");
      await seedDatabase(true);
      
      // Clear the flag after seeding
      delete process.env.ALLOW_SEED;
      
      res.json({ success: true, message: "Demo data reset successfully" });
    } catch (error) {
      // Clear the flag on error too
      delete process.env.ALLOW_SEED;
      console.error("Error resetting demo data:", error);
      res.status(500).json({ error: "Failed to reset demo data" });
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
