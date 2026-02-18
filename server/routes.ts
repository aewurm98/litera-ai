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
  lastName: z.string().optional(), // Required in production mode (unless using password)
  pin: z.string().length(4).optional(), // 4-digit PIN, required in production mode (unless using password)
  password: z.string().optional(), // Alternative to PIN for returning patients
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

const checkInResponseSchema = z.object({
  response: z.enum(["green", "yellow", "red"]),
});

const setPatientPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
});

// ============= Session-based Auth Middleware =============
function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  (req as any).userId = req.session.userId;
  (req as any).userRole = req.session.userRole;
  (req as any).userName = req.session.userName;
  (req as any).tenantId = req.session.tenantId;
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
  (req as any).tenantId = req.session.tenantId;
  next();
}

function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  if (req.session.userRole !== "admin" && req.session.userRole !== "super_admin") {
    return res.status(403).json({ error: "Access denied. Admin role required." });
  }
  (req as any).adminId = req.session.userId;
  (req as any).tenantId = req.session.tenantId;
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
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif", "image/heic"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Unsupported file type. Please upload a PDF or image (JPEG, PNG, WebP)."));
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
      
      // Verify tenant for authenticated users (patients access via token, no tenant check needed)
      if (isAuthenticated && req.session?.tenantId && carePlan.tenantId !== req.session.tenantId) {
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
      req.session.tenantId = user.tenantId ?? undefined;
      
      res.json({ 
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId
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
  
  // Change password (requires authentication)
  app.post("/api/auth/change-password", validateBody(changePasswordSchema), async (req: Request, res: Response) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const { currentPassword, newPassword } = req.body;
      
      // Get user and verify current password
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const passwordMatch = await bcrypt.compare(currentPassword, user.password);
      if (!passwordMatch) {
        return res.status(401).json({ error: "Current password is incorrect" });
      }
      
      // Hash new password and update
      const hashedNewPassword = await bcrypt.hash(newPassword, 10);
      await storage.updateUserPassword(userId, hashedNewPassword);
      
      res.json({ success: true, message: "Password changed successfully" });
    } catch (error) {
      console.error("Password change error:", error);
      res.status(500).json({ error: "Failed to change password" });
    }
  });
  
  // Get current user
  app.get("/api/auth/me", async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    
    // Get tenant info if user has a tenantId
    let tenant = null;
    if (req.session.tenantId) {
      tenant = await storage.getTenant(req.session.tenantId);
    }
    
    res.json({
      id: req.session.userId,
      name: req.session.userName,
      role: req.session.userRole,
      tenantId: req.session.tenantId,
      tenant: tenant ? { id: tenant.id, name: tenant.name, slug: tenant.slug, isDemo: tenant.isDemo } : null,
    });
  });
  
  // ============= Care Plans API (Clinician) =============
  
  // Get all care plans (for clinician dashboard)
  app.get("/api/care-plans", requireClinicianAuth, async (req: Request, res: Response) => {
    try {
      const clinicianId = req.session.userId;
      const userRole = req.session.userRole;
      const tenantId = req.session.tenantId;
      
      let carePlans = await storage.getAllCarePlans(tenantId);
      
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
      
      // Validate file type
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (!allowedTypes.includes(file.mimetype)) {
        return res.status(400).json({ error: "Unsupported file type. Please upload a PDF or image (JPEG, PNG, WebP)." });
      }
      
      // Validate file size (must have content)
      if (file.size < 100) {
        return res.status(400).json({ error: "File appears to be empty or too small. Please upload a valid discharge document." });
      }
      
      // Validate max file size (20MB)
      if (file.size > 20 * 1024 * 1024) {
        return res.status(400).json({ error: "File is too large. Maximum size is 20MB." });
      }
      
      const clinicianId = (req as any).clinicianId || "clinician-1";
      const tenantId = req.session.tenantId;
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
          
          // Auto-match patient by extracted name
          let matchedPatientId: string | undefined = undefined;
          if (extracted.patientName) {
            const matchedPatient = await storage.findPatientByName(extracted.patientName, tenantId);
            if (matchedPatient) {
              matchedPatientId = matchedPatient.id;
              console.log(`Auto-matched patient: ${matchedPatient.name} (${matchedPatient.id})`);
            }
          }
          
          const carePlan = await storage.createCarePlan({
            clinicianId,
            patientId: matchedPatientId,
            tenantId,
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
            details: { fileName: file.originalname, fileType: file.mimetype, method: "ai-fallback", patientName: extracted.patientName, autoMatchedPatientId: matchedPatientId },
            ipAddress: req.ip || null,
            userAgent: req.get("user-agent") || null,
          });

          // Include matched patient in response for language pre-fill
          const matchedPatient = matchedPatientId ? await storage.getPatient(matchedPatientId) : undefined;
          return res.json({ ...carePlan, patient: matchedPatient });
        }
      } else {
        // For images, we'll use GPT-4o Vision
        const base64Image = file.buffer.toString("base64");
        const extracted = await extractFromImage(base64Image);
        
        // Auto-match patient by extracted name
        let matchedPatientId: string | undefined = undefined;
        if (extracted.patientName) {
          const matchedPatient = await storage.findPatientByName(extracted.patientName, tenantId);
          if (matchedPatient) {
            matchedPatientId = matchedPatient.id;
            console.log(`Auto-matched patient: ${matchedPatient.name} (${matchedPatient.id})`);
          }
        }
        
        // Create care plan with extracted content
        const carePlan = await storage.createCarePlan({
          clinicianId,
          patientId: matchedPatientId,
          tenantId,
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
          details: { fileName: file.originalname, fileType: file.mimetype, patientName: extracted.patientName, autoMatchedPatientId: matchedPatientId },
          ipAddress: req.ip || null,
          userAgent: req.get("user-agent") || null,
        });

        // Include matched patient in response for language pre-fill
        const matchedPatient = matchedPatientId ? await storage.getPatient(matchedPatientId) : undefined;
        return res.json({ ...carePlan, patient: matchedPatient });
      }

      // For PDFs, extract structured content
      const extracted = await extractDischargeContent(extractedText);
      
      // Auto-match patient by extracted name
      let matchedPatientId: string | undefined = undefined;
      if (extracted.patientName) {
        const matchedPatient = await storage.findPatientByName(extracted.patientName, tenantId);
        if (matchedPatient) {
          matchedPatientId = matchedPatient.id;
          console.log(`Auto-matched patient: ${matchedPatient.name} (${matchedPatient.id})`);
        }
      }
      
      const carePlan = await storage.createCarePlan({
        clinicianId,
        patientId: matchedPatientId,
        tenantId,
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
        details: { fileName: file.originalname, fileType: file.mimetype, patientName: extracted.patientName, autoMatchedPatientId: matchedPatientId },
        ipAddress: req.ip || null,
        userAgent: req.get("user-agent") || null,
      });

      // Include matched patient in response for language pre-fill
      const matchedPatient = matchedPatientId ? await storage.getPatient(matchedPatientId) : undefined;
      res.json({ ...carePlan, patient: matchedPatient });
    } catch (error: any) {
      console.error("Error uploading file:", error);
      const message = error?.message?.includes("OpenAI") || error?.message?.includes("API")
        ? "AI processing failed. The document may be unreadable or in an unsupported format. Please try a clearer scan."
        : error?.message?.includes("timeout") || error?.message?.includes("ETIMEDOUT")
        ? "Processing timed out. Please try again."
        : "Failed to process upload. Please try again with a different file.";
      res.status(500).json({ error: message });
    }
  });

  // Process care plan (simplify + translate)
  app.post("/api/care-plans/:id/process", requireClinicianAuth, validateBody(processCarePlanSchema), async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const { language } = req.body;
      const clinicianId = (req as any).clinicianId || "clinician-1";
      const tenantId = req.session.tenantId;

      const carePlan = await storage.getCarePlan(id);
      if (!carePlan) {
        return res.status(404).json({ error: "Care plan not found" });
      }
      
      // Verify tenant access
      if (tenantId && carePlan.tenantId !== tenantId) {
        return res.status(403).json({ error: "Access denied" });
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
    } catch (error: any) {
      console.error("Error processing care plan:", error);
      const message = error?.message?.includes("rate") || error?.status === 429
        ? "AI service is temporarily busy. Please wait a moment and try again."
        : error?.message?.includes("timeout") || error?.message?.includes("ETIMEDOUT")
        ? "Processing timed out. This can happen with large documents. Please try again."
        : "Failed to simplify and translate content. Please try again.";
      res.status(500).json({ error: message });
    }
  });

  // Approve care plan
  app.post("/api/care-plans/:id/approve", requireClinicianAuth, async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const clinicianId = (req as any).clinicianId || "clinician-1";
      const tenantId = req.session.tenantId;

      const carePlan = await storage.getCarePlan(id);
      if (!carePlan) {
        return res.status(404).json({ error: "Care plan not found" });
      }
      
      // Verify tenant access
      if (tenantId && carePlan.tenantId !== tenantId) {
        return res.status(403).json({ error: "Access denied" });
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
      const tenantId = req.session.tenantId;

      const carePlan = await storage.getCarePlan(id);
      if (!carePlan) {
        return res.status(404).json({ error: "Care plan not found" });
      }
      
      // Verify tenant access
      if (tenantId && carePlan.tenantId !== tenantId) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Generate PIN for patient verification (production security)
      const patientPin = generatePin();
      const lastName = extractLastName(name);
      
      // Create or update patient (scoped by tenant)
      let patient = await storage.getPatientByEmail(email, tenantId);
      if (!patient) {
        patient = await storage.createPatient({
          name,
          lastName,
          email,
          phone,
          yearOfBirth,
          pin: patientPin,
          preferredLanguage,
          tenantId,
        });
      } else {
        // Update patient lastName but preserve existing PIN
        patient = await storage.updatePatient(patient.id, {
          lastName,
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

      let emailSent = true;
      try {
        // Include PIN in email for production auth (patient will need lastName + yearOfBirth + PIN)
        await sendCarePlanEmail(email, name, accessLink, patientPin);
      } catch (emailError) {
        console.error("Email sending failed:", emailError);
        emailSent = false;
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
      res.json({ ...updated, patient, checkIns, emailSent });
    } catch (error) {
      console.error("Error sending care plan:", error);
      res.status(500).json({ error: "Failed to send care plan" });
    }
  });

  // Generate demo token for clinician preview (requires clinician auth)
  app.post("/api/care-plans/:id/demo-token", requireClinicianAuth, async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const tenantId = req.session.tenantId;
      const carePlan = await storage.getCarePlan(id);
      
      if (!carePlan) {
        return res.status(404).json({ error: "Care plan not found" });
      }
      
      // Verify tenant access
      if (tenantId && carePlan.tenantId !== tenantId) {
        return res.status(403).json({ error: "Access denied" });
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
      const tenantId = req.session.tenantId;
      const carePlan = await storage.getCarePlan(id);
      
      if (!carePlan) {
        return res.status(404).json({ error: "Care plan not found" });
      }
      
      // Verify tenant access
      if (tenantId && carePlan.tenantId !== tenantId) {
        return res.status(403).json({ error: "Access denied" });
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
      const { yearOfBirth, lastName, pin, password } = req.body;

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
        // Production mode: require lastName + yearOfBirth + (PIN or password)
        const hasPatientPassword = patient.password !== null && patient.password !== undefined;
        
        // If patient has set a password, they can use either PIN or password
        if (!lastName) {
          return res.status(400).json({ 
            error: "Last name and year of birth are required",
            requiresFullAuth: true,
            hasPassword: hasPatientPassword
          });
        }
        
        if (!pin && !password) {
          return res.status(400).json({ 
            error: hasPatientPassword ? "Please enter your PIN or password" : "Please enter your PIN",
            requiresFullAuth: true,
            hasPassword: hasPatientPassword
          });
        }
        
        // Case-insensitive last name comparison
        const patientLastName = (patient.lastName || extractLastName(patient.name)).toLowerCase();
        const providedLastName = lastName.toLowerCase().trim();
        const lastNameMatches = patientLastName === providedLastName;
        const yearMatches = patient.yearOfBirth === yearOfBirth;
        
        // Check PIN or password
        let credentialValid = false;
        if (password && hasPatientPassword) {
          credentialValid = await bcrypt.compare(password, patient.password!);
        } else if (pin) {
          credentialValid = patient.pin === pin;
        }
        
        isValid = lastNameMatches && yearMatches && credentialValid;
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

      // Check if access token has expired
      if (carePlan.accessTokenExpiry && new Date(carePlan.accessTokenExpiry) < new Date()) {
        return res.status(410).json({ error: "This care plan link has expired. Please contact your clinic for a new link." });
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

      const safePatient = patient ? {
        id: patient.id,
        name: patient.name,
        lastName: patient.lastName,
        email: patient.email,
        phone: patient.phone,
        yearOfBirth: patient.yearOfBirth,
        preferredLanguage: patient.preferredLanguage,
        tenantId: patient.tenantId,
        createdAt: patient.createdAt,
        hasPassword: !!patient.password,
      } : null;

      res.json({ ...carePlan, patient: safePatient, checkIns });
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
    } catch (error: any) {
      console.error("Error submitting check-in:", error);
      const message = error?.message?.includes("response") || error?.message?.includes("enum")
        ? "Invalid response value. Please select a valid health status (Good, Needs Follow-up, or Urgent)."
        : "Failed to submit check-in response. Please try again.";
      res.status(500).json({ error: message });
    }
  });

  // Set patient password (for repeat access without PIN)
  app.post("/api/patient/:token/set-password", validateBody(setPatientPasswordSchema), async (req: Request, res: Response) => {
    try {
      const token = req.params.token as string;
      const { password } = req.body;
      
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
      
      // Hash the password and save
      const hashedPassword = await bcrypt.hash(password, 10);
      await storage.updatePatientPassword(patient.id, hashedPassword);
      
      await storage.createAuditLog({
        carePlanId: carePlan.id,
        action: "password_set",
        details: { patientId: patient.id },
      });
      
      res.json({ success: true, message: "Password set successfully" });
    } catch (error) {
      console.error("Error setting patient password:", error);
      res.status(500).json({ error: "Failed to set password" });
    }
  });

  // ============= Admin API =============

  // Get all care plans with full details (admin view)
  app.get("/api/admin/care-plans", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = req.session.tenantId;
      const carePlans = await storage.getAllCarePlans(tenantId);
      
      const enrichedPlans = await Promise.all(
        carePlans.map(async (plan) => {
          const patient = plan.patientId ? await storage.getPatient(plan.patientId) : undefined;
          const clinician = plan.clinicianId ? await storage.getUser(plan.clinicianId) : undefined;
          const approver = plan.approvedBy ? await storage.getUser(plan.approvedBy) : undefined;
          const checkIns = await storage.getCheckInsByCarePlanId(plan.id);
          const auditLogs = await storage.getAuditLogsByCarePlanId(plan.id);
          return { 
            ...plan, 
            patient, 
            clinician: clinician ? { id: clinician.id, name: clinician.name } : undefined,
            approver: approver ? { id: approver.id, name: approver.name } : undefined,
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
      const tenantId = req.session.tenantId;
      const alerts = await storage.getAlerts(tenantId);
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
      const tenantId = req.session.tenantId;
      
      const checkIn = await storage.getCheckIn(id);
      if (!checkIn) {
        return res.status(404).json({ error: "Alert not found" });
      }
      
      if (tenantId) {
        const carePlan = await storage.getCarePlan(checkIn.carePlanId);
        if (!carePlan || carePlan.tenantId !== tenantId) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
      
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
      const tenantId = req.session.tenantId;
      const carePlans = await storage.getAllCarePlans(tenantId);
      
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
  // Reset the database to demo state (available in demo mode, or for super admins always)
  app.post("/api/admin/reset-demo", requireAuth, async (req: Request, res: Response) => {
    try {
      const isSuperAdmin = req.session.userRole === "super_admin";
      
      // Block demo reset in production mode unless user is super_admin
      if (!isDemoMode && !isSuperAdmin) {
        return res.status(403).json({ 
          error: "Demo reset is disabled in production mode",
          isDemoMode: false
        });
      }
      
      const { resetDemoTenant } = await import("./seed");
      await resetDemoTenant();
      
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
      console.error("Error resetting demo data:", error);
      res.status(500).json({ error: "Failed to reset demo data" });
    }
  });

  // Public reset endpoint for login page (no auth required, only in demo mode)
  app.post("/api/public/reset-demo", async (req: Request, res: Response) => {
    try {
      if (!isDemoMode) {
        return res.status(403).json({ 
          error: "Demo reset is disabled in production mode",
          isDemoMode: false
        });
      }
      
      const { resetDemoTenant } = await import("./seed");
      await resetDemoTenant();
      
      res.json({ success: true, message: "Demo data reset successfully" });
    } catch (error) {
      console.error("Error resetting demo data:", error);
      res.status(500).json({ error: "Failed to reset demo data" });
    }
  });

  // ============= Admin User & Tenant Management =============
  
  // Get all users (admin only) - scoped by tenant for non-super-admins
  app.get("/api/admin/users", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const isSuperAdmin = req.session.userRole === "super_admin";
      const tenantId = isSuperAdmin ? undefined : req.session.tenantId;
      
      const allUsers = await storage.getAllUsers(tenantId || undefined);
      const allTenants = await storage.getAllTenants();
      const tenantMap = new Map(allTenants.map(t => [t.id, t]));
      
      const usersWithTenant = allUsers.map(user => ({
        ...user,
        password: undefined,
        tenant: user.tenantId ? tenantMap.get(user.tenantId) : null,
      }));
      
      res.json(usersWithTenant);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });
  
  // Create user (admin only) - non-super-admins can only create users in their own tenant
  app.post("/api/admin/users", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const { username, password, name, role, tenantId } = req.body;
      const isSuperAdmin = req.session.userRole === "super_admin";
      
      if (!username || !password || !name) {
        return res.status(400).json({ error: "Username, password, and name are required" });
      }
      
      // Non-super-admins cannot create super_admin users
      if (role === "super_admin" && !isSuperAdmin) {
        return res.status(403).json({ error: "Only super admins can create super admin accounts" });
      }
      
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(409).json({ error: "Username already exists" });
      }
      
      const { hashPassword } = await import("./auth");
      const hashedPassword = await hashPassword(password);
      
      // For non-super-admins, auto-assign to their tenant
      const assignedTenantId = isSuperAdmin ? (tenantId || null) : req.session.tenantId;
      
      const user = await storage.createUser({
        username,
        password: hashedPassword,
        name,
        role: role || "clinician",
        tenantId: assignedTenantId,
      });
      
      res.json({ ...user, password: undefined });
    } catch (error) {
      console.error("Error creating user:", error);
      res.status(500).json({ error: "Failed to create user" });
    }
  });
  
  // Update user (admin only) - super_admin can change tenantId, regular admins cannot
  app.patch("/api/admin/users/:id", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { name, role, tenantId } = req.body;
      const isSuperAdmin = req.session.userRole === "super_admin";
      
      // Check if user exists
      const existingUser = await storage.getUser(id);
      if (!existingUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Non-super-admins can only edit users in their own tenant
      if (!isSuperAdmin && existingUser.tenantId !== req.session.tenantId) {
        return res.status(403).json({ error: "Cannot edit users outside your tenant" });
      }
      
      // Prevent non-super-admins from creating super_admins or changing tenant
      const updateData: { name?: string; role?: string; tenantId?: string | null } = {};
      if (name) updateData.name = name;
      if (role) {
        if (role === "super_admin" && !isSuperAdmin) {
          return res.status(403).json({ error: "Only super admins can create super admin accounts" });
        }
        updateData.role = role;
      }
      if (tenantId !== undefined && isSuperAdmin) {
        updateData.tenantId = tenantId || null;
      }
      
      const user = await storage.updateUser(id, updateData);
      res.json({ ...user, password: undefined });
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ error: "Failed to update user" });
    }
  });
  
  // Delete user (admin only)
  app.delete("/api/admin/users/:id", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const isSuperAdmin = req.session.userRole === "super_admin";
      
      // Prevent deleting yourself
      if (id === req.session.userId) {
        return res.status(400).json({ error: "Cannot delete your own account" });
      }
      
      // Check if user exists and belongs to same tenant (for non-super-admins)
      const existingUser = await storage.getUser(id);
      if (!existingUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      if (!isSuperAdmin && existingUser.tenantId !== req.session.tenantId) {
        return res.status(403).json({ error: "Cannot delete users outside your tenant" });
      }
      
      const success = await storage.deleteUser(id);
      if (!success) {
        return res.status(404).json({ error: "User not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ error: "Failed to delete user" });
    }
  });
  
  // Get all tenants (super admin only)
  app.get("/api/admin/tenants", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const isSuperAdmin = req.session.userRole === "super_admin";
      if (!isSuperAdmin) {
        return res.status(403).json({ error: "Only super admins can manage tenants" });
      }
      const allTenants = await storage.getAllTenants();
      res.json(allTenants);
    } catch (error) {
      console.error("Error fetching tenants:", error);
      res.status(500).json({ error: "Failed to fetch tenants" });
    }
  });
  
  // Create tenant (super admin only)
  app.post("/api/admin/tenants", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const isSuperAdmin = req.session.userRole === "super_admin";
      if (!isSuperAdmin) {
        return res.status(403).json({ error: "Only super admins can create tenants" });
      }
      
      const { name, slug, isDemo } = req.body;
      
      if (!name || !slug) {
        return res.status(400).json({ error: "Name and slug are required" });
      }
      
      // Check for slug uniqueness
      const existingTenants = await storage.getAllTenants();
      if (existingTenants.some(t => t.slug === slug)) {
        return res.status(409).json({ error: "Tenant slug already exists" });
      }
      
      const tenant = await storage.createTenant({
        name,
        slug,
        isDemo: isDemo || false,
      });
      
      res.json(tenant);
    } catch (error) {
      console.error("Error creating tenant:", error);
      res.status(500).json({ error: "Failed to create tenant" });
    }
  });
  
  // Update tenant (super admin only)
  app.patch("/api/admin/tenants/:id", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const isSuperAdmin = req.session.userRole === "super_admin";
      if (!isSuperAdmin) {
        return res.status(403).json({ error: "Only super admins can update tenants" });
      }
      
      const { id } = req.params;
      const { name, isDemo } = req.body;
      
      const tenant = await storage.updateTenant(id, { name, isDemo });
      if (!tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }
      
      res.json(tenant);
    } catch (error) {
      console.error("Error updating tenant:", error);
      res.status(500).json({ error: "Failed to update tenant" });
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
