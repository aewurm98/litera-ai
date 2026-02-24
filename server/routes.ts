import type { Express, Request, Response, NextFunction } from "express";
import { type Server } from "http";
import multer from "multer";
import { z } from "zod";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { storage, generateAccessToken } from "./storage";
import { hashPassword } from "./auth";
import { 
  extractDischargeContent, 
  extractFromImage, 
  simplifyContent, 
  translateContent 
} from "./services/openai";
import { sendCarePlanEmail, sendCheckInEmail, sendTeamInviteEmail, sendPasswordResetEmail, getUncachableResendClient } from "./services/resend";
import { SUPPORTED_LANGUAGES, insertPatientSchema, type Patient } from "@shared/schema";
import { isDemoMode } from "./index";
import { isSandboxTenant, getAdminEmailForTenant, pseudonymizePatientData, scrubCarePlanData, createSandboxAdapter, findSandboxCarePlanByToken, clearSandboxData } from "./sandbox";

// Helper to generate a 4-digit PIN for patient verification
function generatePin(): string {
  return crypto.randomInt(1000, 10000).toString();
}

// Helper to extract last name from full name
function extractLastName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : parts[0];
}

// Shared helper: patient-match + care plan create + audit log for all upload paths
async function createCarePlanFromExtracted(
  clinicianId: string,
  tenantId: string | undefined,
  extracted: Awaited<ReturnType<typeof extractDischargeContent>>,
  originalContent: string,
  fileData: string,
  file: { originalname: string; mimetype: string },
  req: Request,
  auditMethod?: string,
) {
  const sandbox = tenantId ? await isSandboxTenant(tenantId) : false;
  const store = sandbox && tenantId ? createSandboxAdapter(tenantId) : storage;

  let matchedPatientId: string | undefined = undefined;
  if (extracted.patientName) {
    const matchedPatient = await store.findPatientByName(extracted.patientName, tenantId);
    if (matchedPatient) {
      matchedPatientId = matchedPatient.id;
      console.log(`Auto-matched patient: ${matchedPatient.name} (${matchedPatient.id})`);
    }
  }

  let pseudoName: string | undefined;
  if (sandbox && tenantId) {
    const adminEmail = await getAdminEmailForTenant(tenantId);
    const pseudoData = pseudonymizePatientData(
      { name: extracted.patientName || "Unknown", email: "placeholder@sandbox", yearOfBirth: 1970, tenantId },
      tenantId,
      adminEmail
    );
    pseudoName = pseudoData.name;
  } else if (matchedPatientId) {
    pseudoName = (await store.getPatient(matchedPatientId))?.name;
  }

  let cpData: any = {
    clinicianId,
    patientId: matchedPatientId,
    tenantId,
    status: "draft",
    originalContent,
    originalFileName: file.originalname,
    originalFileData: fileData,
    extractedPatientName: extracted.patientName,
    diagnosis: extracted.diagnosis,
    medications: extracted.medications,
    appointments: extracted.appointments,
    instructions: extracted.instructions,
    warnings: extracted.warnings,
  };

  if (sandbox) {
    const scrubbed = scrubCarePlanData(cpData, pseudoName);
    cpData = { ...cpData, ...scrubbed, originalFileData: null, originalFileName: null };
  }

  const carePlan = await store.createCarePlan(cpData);

  const auditDetails: Record<string, unknown> = {
    fileName: sandbox ? "upload.pdf" : file.originalname,
    fileType: file.mimetype,
    patientName: sandbox ? (pseudoName || "Unknown") : extracted.patientName,
    autoMatchedPatientId: matchedPatientId,
  };
  if (auditMethod) auditDetails.method = auditMethod;

  await store.createAuditLog({
    carePlanId: carePlan.id,
    userId: clinicianId,
    action: "uploaded",
    details: auditDetails,
    ipAddress: sandbox ? null : (req.ip || null),
    userAgent: sandbox ? null : (req.get("user-agent") || null),
  });

  const matchedPatient = matchedPatientId ? await store.getPatient(matchedPatientId) : undefined;
  return { ...carePlan, patient: matchedPatient };
}

// Demo token store (in-memory, expires after 5 minutes)
const demoTokens = new Map<string, { accessToken: string; expiresAt: Date }>();

// [M1.8] Periodic cleanup of expired demo tokens to prevent memory leak
setInterval(() => {
  const now = new Date();
  demoTokens.forEach((value, key) => {
    if (now > value.expiresAt) demoTokens.delete(key);
  });
}, 60_000);

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
  // [M1.2] Timing-safe comparison for demo token
  if (!timingSafeCompare(entry.accessToken, accessToken)) return false;
  return true;
}

function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, "");
}

// [M1.2] Constant-time string comparison to prevent timing attacks
function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

// [M1.1] Rate limiting for staff login
const loginAttempts = new Map<string, { count: number; lockedUntil?: Date }>();

function checkLoginLock(username: string): boolean {
  const attempt = loginAttempts.get(username);
  if (!attempt) return false;
  if (attempt.lockedUntil && new Date() < attempt.lockedUntil) return true;
  if (attempt.lockedUntil && new Date() >= attempt.lockedUntil) {
    loginAttempts.delete(username);
    return false;
  }
  return false;
}

function recordLoginAttempt(username: string, success: boolean): void {
  if (success) {
    loginAttempts.delete(username);
    return;
  }
  const attempt = loginAttempts.get(username) || { count: 0 };
  attempt.count++;
  if (attempt.count >= 5) {
    const lockUntil = new Date();
    lockUntil.setMinutes(lockUntil.getMinutes() + 15);
    attempt.lockedUntil = lockUntil;
  }
  loginAttempts.set(username, attempt);
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
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  preferredLanguage: z.string().min(2).max(5),
});

// Production patient verification requires lastName + dateOfBirth + PIN
// Demo mode only requires dateOfBirth (or yearOfBirth for legacy patients)
const verifyPatientSchema = z.object({
  yearOfBirth: z.number().int().min(1900).max(2100).optional(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  lastName: z.string().optional(),
  pin: z.string().length(4).optional(),
  password: z.string().optional(),
}).refine(data => data.dateOfBirth || data.yearOfBirth, {
  message: "Either dateOfBirth or yearOfBirth is required",
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string()
    .min(8, "New password must be at least 8 characters")
    .regex(/[A-Z]/, "Must contain at least one uppercase letter")
    .regex(/[a-z]/, "Must contain at least one lowercase letter")
    .regex(/[0-9]/, "Must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Must contain at least one special character"),
});

const checkInResponseSchema = z.object({
  response: z.enum(["green", "yellow", "red"]),
});

const setPatientPasswordSchema = z.object({
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Must contain at least one uppercase letter")
    .regex(/[a-z]/, "Must contain at least one lowercase letter")
    .regex(/[0-9]/, "Must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Must contain at least one special character"),
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

function getUserRoles(req: Request): string[] {
  if (req.session.userRoles && req.session.userRoles.length > 0) {
    return req.session.userRoles;
  }
  return req.session.userRole ? [req.session.userRole] : [];
}

function requireClinicianAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  const roles = getUserRoles(req);
  if (!roles.includes("clinician") && !roles.includes("admin") && !roles.includes("super_admin")) {
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
  const roles = getUserRoles(req);
  if (!roles.includes("admin") && !roles.includes("super_admin")) {
    return res.status(403).json({ error: "Access denied. Admin role required." });
  }
  (req as any).adminId = req.session.userId;
  (req as any).tenantId = req.session.tenantId;
  next();
}

function requireInterpreterAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  const roles = getUserRoles(req);
  if (!roles.includes("interpreter")) {
    return res.status(403).json({ error: "Access denied. Interpreter role required." });
  }
  (req as any).interpreterId = req.session.userId;
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

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "text/csv" || file.originalname.endsWith(".csv")) {
      cb(null, true);
    } else {
      cb(new Error("Please upload a CSV file."));
    }
  },
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  async function getStore(req: Request): Promise<typeof storage> {
    const tenantId = req.session?.tenantId;
    if (tenantId) {
      const sandbox = await isSandboxTenant(tenantId);
      if (sandbox) return createSandboxAdapter(tenantId);
    }
    return storage;
  }

  // ============= Serve Mock PDFs =============
  // Route to serve PDF files from attached_assets/mock_pdfs
  app.get("/api/documents/:filename", requireClinicianAuth, async (req: Request, res: Response) => {
    try {
      const filename = req.params.filename as string;
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
      const id = req.params.id as string;
      const { token } = req.query; // Patient access token from query param
      
      const store = await getStore(req);
      let carePlan = await store.getCarePlan(id);
      if (!carePlan && token) {
        const sandboxResult = findSandboxCarePlanByToken(token as string);
        if (sandboxResult && sandboxResult.carePlan.id === id) {
          carePlan = sandboxResult.carePlan;
        }
      }
      
      if (!carePlan) {
        return res.status(404).json({ error: "Care plan not found" });
      }
      
      // Check authorization: clinician/admin/interpreter session OR valid patient access token
      const sessionRoles = req.session?.userRoles || (req.session?.userRole ? [req.session.userRole] : []);
      const isAuthenticated = req.session?.userId && sessionRoles.some((r: string) => ["clinician", "admin", "super_admin", "interpreter"].includes(r));
      // [M1.2] Use timing-safe comparison to prevent token oracle attacks
      // [M2.4] Require a non-null expiry; treat missing expiry as expired
      const hasValidToken = token && carePlan.accessToken &&
        timingSafeCompare(carePlan.accessToken, token as string) &&
        (!!carePlan.accessTokenExpiry && new Date(carePlan.accessTokenExpiry) > new Date());
      
      if (!isAuthenticated && !hasValidToken) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      // Verify tenant for authenticated users (patients access via token, no tenant check needed)
      if (isAuthenticated && req.session?.tenantId && carePlan.tenantId !== req.session.tenantId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const tenantInSandbox = carePlan.tenantId ? await isSandboxTenant(carePlan.tenantId) : false;
      if (tenantInSandbox) {
        return res.status(403).json({ error: "Document viewing is disabled in simulation mode" });
      }

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
      const filename = req.params.filename as string;
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

      // [M1.1] Check login rate limit before hitting the database
      if (checkLoginLock(username)) {
        return res.status(429).json({ error: "Too many failed attempts. Please try again in 15 minutes." });
      }

      const user = await storage.getUserByUsername(username);

      if (!user) {
        // Record attempt even for unknown usernames to prevent enumeration
        recordLoginAttempt(username, false);
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const passwordMatch = await bcrypt.compare(password, user.password);
      if (!passwordMatch) {
        recordLoginAttempt(username, false);
        return res.status(401).json({ error: "Invalid credentials" });
      }

      recordLoginAttempt(username, true);

      const effectiveRoles = user.roles && user.roles.length > 0 ? user.roles : [user.role];

      req.session.userId = user.id;
      req.session.userRole = user.role;
      req.session.userRoles = effectiveRoles;
      req.session.userName = user.name;
      req.session.tenantId = user.tenantId ?? undefined;
      
      res.json({ 
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        roles: effectiveRoles,
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
      
      const isSamePassword = await bcrypt.compare(newPassword, user.password);
      if (isSamePassword) {
        return res.status(400).json({ error: "New password must be different from current password" });
      }
      
      const hashedNewPassword = await bcrypt.hash(newPassword, 10);
      await storage.updateUserPassword(userId, hashedNewPassword);
      
      const updatedUser = await storage.getUser(userId);
      const verifyPersisted = updatedUser ? await bcrypt.compare(newPassword, updatedUser.password) : false;
      if (!verifyPersisted) {
        console.error(`[Security] Password change verification failed for user ${userId}`);
        return res.status(500).json({ error: "Password update failed verification" });
      }
      
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
    
    const roles = req.session.userRoles && req.session.userRoles.length > 0
      ? req.session.userRoles
      : [req.session.userRole!];

    const currentUser = await storage.getUser(req.session.userId);

    res.json({
      id: req.session.userId,
      name: req.session.userName,
      role: req.session.userRole,
      roles,
      tenantId: req.session.tenantId,
      tenant: tenant ? { id: tenant.id, name: tenant.name, slug: tenant.slug, isDemo: tenant.isDemo, sandboxMode: tenant.sandboxMode, interpreterReviewMode: tenant.interpreterReviewMode, clinicPhoneNumbers: (tenant as any).clinicPhoneNumbers || [] } : null,
      recoveryEmail: currentUser?.recoveryEmail || null,
    });
  });
  
  // ============= Recovery Email & Password Reset =============

  app.patch("/api/auth/recovery-email", async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const schema = z.object({ recoveryEmail: z.string().email() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Please enter a valid email address" });
    }
    const updated = await storage.updateUser(req.session.userId, { recoveryEmail: parsed.data.recoveryEmail });
    if (!updated) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ recoveryEmail: updated.recoveryEmail });
  });

  app.post("/api/auth/forgot-password", async (req: Request, res: Response) => {
    const schema = z.object({ email: z.string().email() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.json({ message: "If an account with that recovery email exists, a reset link has been sent." });
    }

    const user = await storage.getUserByRecoveryEmail(parsed.data.email);
    if (!user) {
      return res.json({ message: "If an account with that recovery email exists, a reset link has been sent." });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiry = new Date(Date.now() + 60 * 60 * 1000);
    await storage.updateUser(user.id, { passwordResetToken: token, passwordResetExpiry: expiry });

    const appUrl = process.env.APP_URL || `https://${req.get("host")}`;
    const resetLink = `${appUrl}/reset-password?token=${token}`;

    try {
      await sendPasswordResetEmail(parsed.data.email, user.name, resetLink);
    } catch (err) {
      console.error("[Auth] Failed to send password reset email:", err);
    }

    res.json({ message: "If an account with that recovery email exists, a reset link has been sent." });
  });

  app.post("/api/auth/reset-password", async (req: Request, res: Response) => {
    const schema = z.object({
      token: z.string().min(1),
      newPassword: z.string().min(6, "Password must be at least 6 characters"),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid request" });
    }

    const user = await storage.getUserByResetToken(parsed.data.token);
    if (!user || !user.passwordResetExpiry || user.passwordResetExpiry < new Date()) {
      return res.status(400).json({ error: "This reset link has expired or is invalid. Please request a new one." });
    }

    const hashed = await bcrypt.hash(parsed.data.newPassword, 10);
    await storage.updateUserPassword(user.id, hashed);
    await storage.updateUser(user.id, { passwordResetToken: null, passwordResetExpiry: null } as any);

    res.json({ message: "Password has been reset successfully. You can now log in." });
  });

  // ============= Tenant Settings API =============

  app.patch("/api/tenant/settings", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = req.session.tenantId;
      if (!tenantId) {
        return res.status(400).json({ error: "No tenant associated with your account" });
      }

      const schema = z.object({
        interpreterReviewMode: z.enum(["disabled", "optional", "required"]).optional(),
        sandboxMode: z.boolean().optional(),
        clinicPhoneNumbers: z.array(z.object({
          label: z.string().min(1),
          number: z.string().min(1),
        })).optional(),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Validation failed", details: parsed.error.errors });
      }

      const oldTenant = await storage.getTenant(tenantId);
      const oldMode = oldTenant?.interpreterReviewMode;
      const newMode = parsed.data.interpreterReviewMode || oldMode;

      const updateData: any = {};
      if (parsed.data.interpreterReviewMode) {
        updateData.interpreterReviewMode = parsed.data.interpreterReviewMode;
      }
      if (parsed.data.sandboxMode !== undefined) {
        updateData.sandboxMode = parsed.data.sandboxMode;
        if (!parsed.data.sandboxMode) {
          clearSandboxData(tenantId);
        }
      }
      if (parsed.data.clinicPhoneNumbers !== undefined) {
        updateData.clinicPhoneNumbers = parsed.data.clinicPhoneNumbers;
      }

      const updated = await storage.updateTenant(tenantId, updateData);

      if (!updated) {
        return res.status(404).json({ error: "Tenant not found" });
      }

      // Cascade: update existing care plans that may be stuck due to the mode change
      if (oldMode !== newMode) {
        const allPlans = await storage.getAllCarePlans(tenantId);
        let updatedCount = 0;

        for (const plan of allPlans) {
          // If switching away from "required" or "optional" to "disabled" or a less strict mode,
          // move plans stuck in "interpreter_review" forward to "approved"
          if (plan.status === "interpreter_review") {
            if (newMode === "disabled" || (newMode === "optional" && oldMode === "required")) {
              await storage.updateCarePlan(plan.id, { status: "approved" });
              updatedCount++;
            }
          }
        }

        if (updatedCount > 0) {
          console.log(`Updated ${updatedCount} care plans after interpreter review mode changed from ${oldMode} to ${newMode}`);
        }
      }

      res.json({ success: true, interpreterReviewMode: updated.interpreterReviewMode, clinicPhoneNumbers: (updated as any).clinicPhoneNumbers });
    } catch (error) {
      console.error("Error updating tenant settings:", error);
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  // ============= Care Plans API (Clinician) =============
  
  // Get all care plans (for clinician dashboard)
  app.get("/api/care-plans", requireClinicianAuth, async (req: Request, res: Response) => {
    try {
      const store = await getStore(req);
      const clinicianId = req.session.userId;
      const userRole = req.session.userRole;
      const tenantId = req.session.tenantId;
      
      let carePlans = await store.getAllCarePlans(tenantId);
      
      // Clinicians only see their own care plans; admins see all
      if (userRole === "clinician" && clinicianId) {
        carePlans = carePlans.filter(plan => plan.clinicianId === clinicianId);
      }
      
      // Enrich with patient data
      const enrichedPlans = await Promise.all(
        carePlans.map(async (plan) => {
          const patient = plan.patientId ? await store.getPatient(plan.patientId) : undefined;
          const checkIns = await store.getCheckInsByCarePlanId(plan.id);
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
      
      const clinicianId = (req as any).clinicianId;
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
          const base64Doc = file.buffer.toString("base64");
          const extracted = await extractFromImage(base64Doc);
          return res.json(await createCarePlanFromExtracted(clinicianId, tenantId, extracted, JSON.stringify(extracted), base64Doc, file, req, "ai-fallback"));
        }
      } else {
        // For images, use GPT-4o Vision
        const base64Image = file.buffer.toString("base64");
        const extracted = await extractFromImage(base64Image);
        return res.json(await createCarePlanFromExtracted(clinicianId, tenantId, extracted, JSON.stringify(extracted), base64Image, file, req));
      }

      // PDF with extractable text
      const extracted = await extractDischargeContent(extractedText);
      res.json(await createCarePlanFromExtracted(clinicianId, tenantId, extracted, extractedText, file.buffer.toString("base64"), file, req));
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

  // Create care plan from raw text input (paste, dictation, etc.)
  app.post("/api/care-plans/from-text", requireClinicianAuth, async (req: Request, res: Response) => {
    try {
      const textSchema = z.object({
        text: z.string().min(20, "Text must be at least 20 characters"),
        method: z.enum(["paste", "dictation", "photo"]).default("paste"),
        existingPatientId: z.string().optional(),
        patientName: z.string().optional(),
        patientEmail: z.string().email().optional(),
        patientYearOfBirth: z.number().int().min(1900).max(2100).optional(),
        patientDateOfBirth: z.string().optional(),
        preferredLanguage: z.string().optional(),
      });
      const parsed = textSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Validation failed", details: parsed.error.errors });
      }

      const { text, method, existingPatientId, patientName: inputPatientName, patientEmail: inputPatientEmail, patientYearOfBirth: inputYob, patientDateOfBirth: inputDob, preferredLanguage: inputLang } = parsed.data;
      const clinicianId = (req as any).clinicianId;
      const tenantId = req.session.tenantId;
      const store = await getStore(req);
      const sandbox = tenantId ? await isSandboxTenant(tenantId) : false;

      const extracted = await extractDischargeContent(text);

      let matchedPatientId: string | undefined = undefined;

      if (existingPatientId) {
        const existingPatient = await store.getPatient(existingPatientId);
        if (existingPatient && existingPatient.tenantId === tenantId) {
          matchedPatientId = existingPatient.id;
        }
      } else if (inputPatientName && inputPatientEmail && (inputYob || inputDob)) {
        const effectiveYob = inputDob ? new Date(inputDob).getFullYear() : inputYob!;
        let effectiveName = inputPatientName;
        let effectiveEmail = inputPatientEmail;
        if (sandbox && tenantId) {
          const adminEmail = await getAdminEmailForTenant(tenantId);
          const pseudoData = pseudonymizePatientData(
            { name: inputPatientName, email: inputPatientEmail, yearOfBirth: effectiveYob, dateOfBirth: inputDob || null, phone: null, preferredLanguage: inputLang || "en", tenantId: tenantId },
            tenantId,
            adminEmail
          );
          effectiveName = pseudoData.name;
          effectiveEmail = adminEmail;
        }
        let patient = await store.getPatientByEmail(effectiveEmail, tenantId);
        if (!patient) {
          patient = await store.createPatient({
            name: effectiveName,
            email: effectiveEmail,
            phone: null,
            yearOfBirth: effectiveYob,
            dateOfBirth: inputDob || null,
            preferredLanguage: inputLang || "en",
            tenantId: tenantId!,
            pin: null,
          });
        }
        matchedPatientId = patient.id;
      } else if (extracted.patientName) {
        const matchedPatient = await store.findPatientByName(extracted.patientName, tenantId);
        if (matchedPatient) {
          matchedPatientId = matchedPatient.id;
        }
      }

      let cpData: any = {
        clinicianId,
        patientId: matchedPatientId,
        tenantId,
        status: "draft",
        originalContent: text,
        originalFileName: `${method}_input_${new Date().toISOString().slice(0, 10)}`,
        extractedPatientName: extracted.patientName,
        diagnosis: extracted.diagnosis,
        medications: extracted.medications,
        appointments: extracted.appointments,
        instructions: extracted.instructions,
        warnings: extracted.warnings,
      };

      if (sandbox && tenantId) {
        const adminEmail = await getAdminEmailForTenant(tenantId);
        const pseudoData = pseudonymizePatientData(
          { name: extracted.patientName || "Unknown", email: "placeholder@sandbox", yearOfBirth: 1970, tenantId },
          tenantId,
          adminEmail
        );
        const scrubbed = scrubCarePlanData(cpData, pseudoData.name);
        cpData = { ...cpData, ...scrubbed, originalFileName: null };
      }

      const carePlan = await store.createCarePlan(cpData);

      await store.createAuditLog({
        carePlanId: carePlan.id,
        userId: clinicianId,
        action: "uploaded",
        details: { method, textLength: text.length, patientName: sandbox ? "Unknown" : extracted.patientName, autoMatchedPatientId: matchedPatientId },
        ipAddress: sandbox ? null : (req.ip || null),
        userAgent: sandbox ? null : (req.get("user-agent") || null),
      });

      const matchedPatient = matchedPatientId ? await store.getPatient(matchedPatientId) : undefined;
      res.json({ ...carePlan, patient: matchedPatient });
    } catch (error: any) {
      console.error("Error creating care plan from text:", error);
      const message = error?.message?.includes("OpenAI") || error?.message?.includes("API")
        ? "AI processing failed. Please check the text and try again."
        : "Failed to process text input. Please try again.";
      res.status(500).json({ error: message });
    }
  });

  // Process care plan (simplify + translate)
  app.post("/api/care-plans/:id/process", requireClinicianAuth, validateBody(processCarePlanSchema), async (req: Request, res: Response) => {
    try {
      const store = await getStore(req);
      const id = req.params.id as string;
      const { language, readingLevel: reqReadingLevel } = req.body;
      const readingLevel = typeof reqReadingLevel === "number" && reqReadingLevel >= 1 && reqReadingLevel <= 12 ? reqReadingLevel : 5;
      const clinicianId = (req as any).clinicianId;
      const tenantId = req.session.tenantId;

      const carePlan = await store.getCarePlan(id);
      if (!carePlan) {
        return res.status(404).json({ error: "Care plan not found" });
      }
      
      // Verify tenant access
      if (tenantId && carePlan.tenantId !== tenantId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const tenant = tenantId ? await store.getTenant(tenantId) : undefined;
      const clinicPhoneNumbers = (tenant as any)?.clinicPhoneNumbers as Array<{ label: string; number: string }> | undefined;

      const simplified = await simplifyContent({
        patientName: carePlan.extractedPatientName || "",
        diagnosis: carePlan.diagnosis || "",
        medications: carePlan.medications || [],
        appointments: carePlan.appointments || [],
        instructions: carePlan.instructions || "",
        warnings: carePlan.warnings || "",
      }, { readingLevel, clinicPhoneNumbers: clinicPhoneNumbers || [] });

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
      const updated = await store.updateCarePlan(id, {
        status: "pending_review",
        readingLevel,
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

      await store.createAuditLog({
        carePlanId: id,
        userId: clinicianId,
        action: "processed",
        details: { language, readingLevel },
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

  // Re-translate care plan after clinician edits
  app.post("/api/care-plans/:id/save-draft", requireClinicianAuth, async (req: Request, res: Response) => {
    try {
      const store = await getStore(req);
      const id = req.params.id as string;
      const clinicianId = (req as any).clinicianId;
      const tenantId = req.session.tenantId;

      const carePlan = await store.getCarePlan(id);
      if (!carePlan) {
        return res.status(404).json({ error: "Care plan not found" });
      }
      if (tenantId && carePlan.tenantId !== tenantId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { edits } = req.body || {};
      if (!edits || typeof edits !== "object" || Object.keys(edits).length === 0) {
        return res.status(400).json({ error: "No edits provided" });
      }

      const updateData: any = {};

      let updatedMeds = carePlan.simplifiedMedications || [];
      let updatedApts = carePlan.simplifiedAppointments || [];
      const medEdits: Record<number, Record<string, string>> = {};
      const aptEdits: Record<number, Record<string, string>> = {};

      for (const [key, value] of Object.entries(edits)) {
        const medMatch = key.match(/^simplifiedMedications_(\d+)_(\w+)$/);
        if (medMatch) {
          const idx = parseInt(medMatch[1]);
          if (!medEdits[idx]) medEdits[idx] = {};
          medEdits[idx][medMatch[2]] = String(value);
          continue;
        }
        const aptMatch = key.match(/^simplifiedAppointments_(\d+)_(\w+)$/);
        if (aptMatch) {
          const idx = parseInt(aptMatch[1]);
          if (!aptEdits[idx]) aptEdits[idx] = {};
          aptEdits[idx][aptMatch[2]] = String(value);
          continue;
        }
        if (["simplifiedDiagnosis", "simplifiedInstructions", "simplifiedWarnings"].includes(key)) {
          updateData[key] = String(value);
        }
      }

      if (Object.keys(medEdits).length > 0 && Array.isArray(updatedMeds)) {
        updatedMeds = [...(updatedMeds as any[])];
        for (const [idx, fields] of Object.entries(medEdits)) {
          const i = parseInt(idx);
          if (i < updatedMeds.length) {
            (updatedMeds as any[])[i] = { ...(updatedMeds as any[])[i], ...fields };
          }
        }
        updateData.simplifiedMedications = updatedMeds;
      }
      if (Object.keys(aptEdits).length > 0 && Array.isArray(updatedApts)) {
        updatedApts = [...(updatedApts as any[])];
        for (const [idx, fields] of Object.entries(aptEdits)) {
          const i = parseInt(idx);
          if (i < updatedApts.length) {
            (updatedApts as any[])[i] = { ...(updatedApts as any[])[i], ...fields };
          }
        }
        updateData.simplifiedAppointments = updatedApts;
      }

      const updated = await store.updateCarePlan(id, updateData);

      await store.createAuditLog({
        carePlanId: id,
        userId: clinicianId,
        action: "draft_saved",
        details: { editedFields: Object.keys(edits) },
        ipAddress: req.ip || null,
        userAgent: req.get("user-agent") || null,
      });

      res.json(updated);
    } catch (error: any) {
      console.error("Error saving draft edits:", error);
      res.status(500).json({ error: "Failed to save draft. Please try again." });
    }
  });

  app.post("/api/care-plans/:id/retranslate", requireClinicianAuth, async (req: Request, res: Response) => {
    try {
      const store = await getStore(req);
      const id = req.params.id as string;
      const clinicianId = (req as any).clinicianId;
      const tenantId = req.session.tenantId;

      const carePlan = await store.getCarePlan(id);
      if (!carePlan) {
        return res.status(404).json({ error: "Care plan not found" });
      }

      if (tenantId && carePlan.tenantId !== tenantId) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (!carePlan.translatedLanguage || carePlan.translatedLanguage === "en") {
        return res.status(400).json({ error: "Re-translation is only available for non-English care plans" });
      }

      const { edits } = req.body || {};

      let updatedMeds = carePlan.simplifiedMedications || [];
      let updatedApts = carePlan.simplifiedAppointments || [];
      if (edits && typeof edits === "object") {
        const medEdits: Record<number, Record<string, string>> = {};
        const aptEdits: Record<number, Record<string, string>> = {};
        for (const [key, value] of Object.entries(edits)) {
          const medMatch = key.match(/^simplifiedMedications_(\d+)_(\w+)$/);
          if (medMatch) {
            const idx = parseInt(medMatch[1]);
            if (!medEdits[idx]) medEdits[idx] = {};
            medEdits[idx][medMatch[2]] = String(value);
          }
          const aptMatch = key.match(/^simplifiedAppointments_(\d+)_(\w+)$/);
          if (aptMatch) {
            const idx = parseInt(aptMatch[1]);
            if (!aptEdits[idx]) aptEdits[idx] = {};
            aptEdits[idx][aptMatch[2]] = String(value);
          }
        }
        if (Object.keys(medEdits).length > 0 && Array.isArray(updatedMeds)) {
          updatedMeds = [...(updatedMeds as any[])];
          for (const [idx, fields] of Object.entries(medEdits)) {
            const i = parseInt(idx);
            if (i < updatedMeds.length) {
              (updatedMeds as any[])[i] = { ...(updatedMeds as any[])[i], ...fields };
            }
          }
        }
        if (Object.keys(aptEdits).length > 0 && Array.isArray(updatedApts)) {
          updatedApts = [...(updatedApts as any[])];
          for (const [idx, fields] of Object.entries(aptEdits)) {
            const i = parseInt(idx);
            if (i < updatedApts.length) {
              (updatedApts as any[])[i] = { ...(updatedApts as any[])[i], ...fields };
            }
          }
        }
      }

      const simplifiedData = {
        diagnosis: edits?.simplifiedDiagnosis || carePlan.simplifiedDiagnosis || "",
        medications: updatedMeds,
        appointments: updatedApts,
        instructions: edits?.simplifiedInstructions || carePlan.simplifiedInstructions || "",
        warnings: edits?.simplifiedWarnings || carePlan.simplifiedWarnings || "",
      };

      const languageName = SUPPORTED_LANGUAGES.find(l => l.code === carePlan.translatedLanguage)?.name || carePlan.translatedLanguage;
      const translated = await translateContent(simplifiedData, languageName!);

      const updateData: any = {
        translatedDiagnosis: translated.diagnosis,
        translatedMedications: translated.medications,
        translatedAppointments: translated.appointments,
        translatedInstructions: translated.instructions,
        translatedWarnings: translated.warnings,
        backTranslatedDiagnosis: translated.backTranslatedDiagnosis,
        backTranslatedInstructions: translated.backTranslatedInstructions,
        backTranslatedWarnings: translated.backTranslatedWarnings,
      };

      if (edits) {
        if (edits.simplifiedDiagnosis !== undefined) updateData.simplifiedDiagnosis = edits.simplifiedDiagnosis;
        if (edits.simplifiedInstructions !== undefined) updateData.simplifiedInstructions = edits.simplifiedInstructions;
        if (edits.simplifiedWarnings !== undefined) updateData.simplifiedWarnings = edits.simplifiedWarnings;
      }
      if (updatedMeds !== carePlan.simplifiedMedications) updateData.simplifiedMedications = updatedMeds;
      if (updatedApts !== carePlan.simplifiedAppointments) updateData.simplifiedAppointments = updatedApts;

      // Reset status to require re-approval after re-translation
      if (carePlan.status === "interpreter_approved" || carePlan.status === "approved" || carePlan.status === "sent") {
        const tenant = tenantId ? await store.getTenant(tenantId) : null;
        if (tenant?.interpreterReviewMode === "required") {
          updateData.status = "interpreter_review";
          updateData.interpreterReviewedBy = null;
          updateData.interpreterReviewedAt = null;
          updateData.interpreterNotes = null;
        } else {
          updateData.status = "simplified";
        }
        updateData.approvedBy = null;
        updateData.approvedAt = null;
      }

      const updated = await store.updateCarePlan(id, updateData);

      await store.createAuditLog({
        carePlanId: id,
        userId: clinicianId,
        action: "retranslated",
        details: { language: carePlan.translatedLanguage, editedFields: edits ? Object.keys(edits) : [] },
        ipAddress: req.ip || null,
        userAgent: req.get("user-agent") || null,
      });

      res.json(updated);
    } catch (error: any) {
      console.error("Error re-translating care plan:", error);
      const message = error?.message?.includes("rate") || error?.status === 429
        ? "AI service is temporarily busy. Please wait a moment and try again."
        : "Failed to re-translate content. Please try again.";
      res.status(500).json({ error: message });
    }
  });

  // Approve care plan
  app.post("/api/care-plans/:id/approve", requireClinicianAuth, async (req: Request, res: Response) => {
    try {
      const store = await getStore(req);
      const id = req.params.id as string;
      const clinicianId = (req as any).clinicianId;
      const tenantId = req.session.tenantId;

      const carePlan = await store.getCarePlan(id);
      if (!carePlan) {
        return res.status(404).json({ error: "Care plan not found" });
      }
      
      // Verify tenant access
      if (tenantId && carePlan.tenantId !== tenantId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const approvableStatuses = ["pending_review", "interpreter_approved", "draft", "approved", "sent"];
      if (!approvableStatuses.includes(carePlan.status)) {
        return res.status(400).json({ error: `Care plan cannot be approved — current status is "${carePlan.status}".` });
      }

      let newStatus = "approved";
      const isNonEnglish = carePlan.translatedLanguage && carePlan.translatedLanguage !== "en";
      const skipInterpreterReview = req.body?.skipInterpreterReview === true;
      const overrideJustification = req.body?.overrideJustification;
      
      if (isNonEnglish && carePlan.tenantId) {
        const tenant = await store.getTenant(carePlan.tenantId);
        if (tenant?.interpreterReviewMode === "required") {
          newStatus = "interpreter_review";
        } else if (tenant?.interpreterReviewMode === "optional" && !skipInterpreterReview) {
          newStatus = "interpreter_review";
        }
      }
      
      // If care plan was already interpreter_approved, go straight to approved
      if (carePlan.status === "interpreter_approved") {
        newStatus = "approved";
      }
      // For post-approval edits, preserve current status
      if (carePlan.status === "approved" || carePlan.status === "sent") {
        newStatus = carePlan.status;
      }

      const updateData: any = {
        status: newStatus,
        approvedBy: clinicianId,
        approvedAt: new Date(),
      };

      const clinicianEdits = req.body?.clinicianEdits;
      const editedFields: Record<string, { before: string; after: string }> = {};
      if (clinicianEdits && typeof clinicianEdits === "object") {
        const textFields = ["simplifiedDiagnosis", "simplifiedInstructions", "simplifiedWarnings"];
        for (const field of textFields) {
          if (clinicianEdits[field] !== undefined && clinicianEdits[field] !== (carePlan as any)[field]) {
            const sanitized = stripHtml(String(clinicianEdits[field]));
            editedFields[field] = { before: (carePlan as any)[field] || "", after: sanitized };
            updateData[field] = sanitized;
          }
        }

        const medEdits: Record<number, Record<string, string>> = {};
        const aptEdits: Record<number, Record<string, string>> = {};
        for (const [key, value] of Object.entries(clinicianEdits)) {
          const medMatch = key.match(/^simplifiedMedications_(\d+)_(\w+)$/);
          if (medMatch) {
            const idx = parseInt(medMatch[1]);
            if (!medEdits[idx]) medEdits[idx] = {};
            medEdits[idx][medMatch[2]] = stripHtml(String(value));
          }
          const aptMatch = key.match(/^simplifiedAppointments_(\d+)_(\w+)$/);
          if (aptMatch) {
            const idx = parseInt(aptMatch[1]);
            if (!aptEdits[idx]) aptEdits[idx] = {};
            aptEdits[idx][aptMatch[2]] = stripHtml(String(value));
          }
        }

        if (Object.keys(medEdits).length > 0) {
          const meds = Array.isArray(carePlan.simplifiedMedications) 
            ? [...(carePlan.simplifiedMedications as any[])] : [];
          for (const [idx, fields] of Object.entries(medEdits)) {
            const i = parseInt(idx);
            if (i < meds.length) {
              meds[i] = { ...meds[i], ...fields };
            }
          }
          editedFields.simplifiedMedications = { before: JSON.stringify(carePlan.simplifiedMedications), after: JSON.stringify(meds) };
          updateData.simplifiedMedications = meds;
        }

        if (Object.keys(aptEdits).length > 0) {
          const apts = Array.isArray(carePlan.simplifiedAppointments)
            ? [...(carePlan.simplifiedAppointments as any[])] : [];
          for (const [idx, fields] of Object.entries(aptEdits)) {
            const i = parseInt(idx);
            if (i < apts.length) {
              apts[i] = { ...apts[i], ...fields };
            }
          }
          editedFields.simplifiedAppointments = { before: JSON.stringify(carePlan.simplifiedAppointments), after: JSON.stringify(apts) };
          updateData.simplifiedAppointments = apts;
        }
      }

      const updated = await store.updateCarePlan(id, updateData);

      const action = newStatus === "interpreter_review" ? "sent_to_interpreter_review" : "approved";
      const auditDetails: any = {};
      if (skipInterpreterReview) {
        auditDetails.skipInterpreterReview = true;
        auditDetails.overrideJustification = overrideJustification || null;
      }
      if (Object.keys(editedFields).length > 0) {
        auditDetails.clinicianEdits = editedFields;
      }
      await store.createAuditLog({
        carePlanId: id,
        userId: clinicianId,
        action,
        details: Object.keys(auditDetails).length > 0 ? auditDetails : undefined,
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
      const store = await getStore(req);
      const id = req.params.id as string;
      const { name, email, phone, yearOfBirth, dateOfBirth, preferredLanguage } = req.body;
      const clinicianId = (req as any).clinicianId;
      const tenantId = req.session.tenantId;
      const sandbox = tenantId ? await isSandboxTenant(tenantId) : false;

      const carePlan = await store.getCarePlan(id);
      if (!carePlan) {
        return res.status(404).json({ error: "Care plan not found" });
      }
      
      // Verify tenant access
      if (tenantId && carePlan.tenantId !== tenantId) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Only allow sending from approved or interpreter_approved status
      const sendableStatuses = ["approved", "interpreter_approved"];
      if (!sendableStatuses.includes(carePlan.status)) {
        return res.status(400).json({ error: `Care plan cannot be sent — current status is "${carePlan.status}". It must be approved first.` });
      }

      // Generate PIN for patient verification (production security)
      const patientPin = generatePin();
      const lastName = extractLastName(name);
      const effectiveYob = dateOfBirth ? new Date(dateOfBirth).getFullYear() : yearOfBirth;
      
      let effectiveEmail = email;
      let effectiveName = name;
      if (sandbox && tenantId) {
        const adminEmail = await getAdminEmailForTenant(tenantId);
        effectiveEmail = adminEmail;
        const pseudoData = pseudonymizePatientData(
          { name, lastName, email, yearOfBirth: effectiveYob, dateOfBirth, phone, preferredLanguage, tenantId },
          tenantId,
          adminEmail
        );
        effectiveName = pseudoData.name;
      }

      let patient: Patient | undefined;
      const existingByEmail = await store.getPatientByEmail(effectiveEmail, tenantId);
      
      if (existingByEmail) {
        patient = await store.updatePatient(existingByEmail.id, {
          name: effectiveName,
          lastName: extractLastName(effectiveName),
          yearOfBirth: effectiveYob,
          dateOfBirth: dateOfBirth || null,
          phone: sandbox ? null : (phone || existingByEmail.phone),
          preferredLanguage: preferredLanguage || existingByEmail.preferredLanguage,
          pin: await bcrypt.hash(patientPin, 10),
        });
      } else {
        patient = await store.createPatient({
          name: effectiveName,
          lastName: extractLastName(effectiveName),
          email: effectiveEmail,
          phone: sandbox ? null : phone,
          yearOfBirth: effectiveYob,
          dateOfBirth: dateOfBirth || null,
          pin: await bcrypt.hash(patientPin, 10),
          preferredLanguage,
          tenantId,
        });
      }

      // Guard: storage operations above should always return a patient record
      if (!patient) {
        return res.status(500).json({ error: "Failed to create or retrieve patient record" });
      }

      // Generate access token
      const accessToken = generateAccessToken();
      const accessTokenExpiry = new Date();
      accessTokenExpiry.setDate(accessTokenExpiry.getDate() + 30); // 30 days

      // Update care plan
      const updated = await store.updateCarePlan(id, {
        status: "sent",
        patientId: patient.id,
        accessToken,
        accessTokenExpiry,
        dischargeDate: new Date(),
      });

      // Schedule check-in for T+24 hours
      const scheduledFor = new Date();
      scheduledFor.setHours(scheduledFor.getHours() + 24);
      
      await store.createCheckIn({
        carePlanId: id,
        patientId: patient.id,
        scheduledFor,
        attemptNumber: 1,
      });

      // Send email with magic link and PIN (for production mode verification)
      // [M1.5] APP_URL takes priority; fallback to Replit dev domain, then localhost
      const baseUrl = process.env.APP_URL
        || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "http://localhost:5000");
      const accessLink = `${baseUrl}/p/${accessToken}`;

      let emailSent = true;
      let emailError: any = null;
      try {
        await sendCarePlanEmail(effectiveEmail, effectiveName, accessLink, patientPin);
      } catch (err: any) {
        console.error("Email sending failed:", err?.message || err);
        emailSent = false;
        emailError = err?.message || "Email delivery failed";
      }


      await store.createAuditLog({
        carePlanId: id,
        userId: clinicianId,
        action: "sent",
        details: { patientEmail: sandbox ? effectiveEmail : email },
        ipAddress: sandbox ? null : (req.ip || null),
        userAgent: sandbox ? null : (req.get("user-agent") || null),
      });

      // Return enriched plan
      const checkIns = await store.getCheckInsByCarePlanId(id);
      res.json({ ...updated, patient, checkIns, emailSent, emailError: emailError || undefined });
    } catch (error) {
      console.error("Error sending care plan:", error);
      res.status(500).json({ error: "Failed to send care plan" });
    }
  });

  // Send test email to clinician (preview the patient experience with real patient data)
  app.post("/api/care-plans/:id/send-test", requireClinicianAuth, async (req: Request, res: Response) => {
    try {
      const store = await getStore(req);
      const id = req.params.id as string;
      const clinicianId = (req as any).clinicianId;
      const tenantId = req.session.tenantId;
      const user = await store.getUser(clinicianId);

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const carePlan = await store.getCarePlan(id);
      if (!carePlan) {
        return res.status(404).json({ error: "Care plan not found" });
      }
      if (tenantId && carePlan.tenantId !== tenantId) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (!carePlan.patientId) {
        return res.status(400).json({ error: "This care plan has no patient assigned." });
      }

      const sendableStatuses = ["approved", "interpreter_approved", "pending_review", "draft", "sent"];
      if (!sendableStatuses.includes(carePlan.status)) {
        return res.status(400).json({ error: `Cannot send test for this care plan (status: "${carePlan.status}").` });
      }

      const patient = await store.getPatient(carePlan.patientId);
      if (!patient) {
        return res.status(404).json({ error: "Patient not found for this care plan." });
      }

      const { email: requestedEmail } = req.body || {};
      const recoveryEmail = user.recoveryEmail;
      const testEmail = requestedEmail && typeof requestedEmail === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestedEmail)
        ? requestedEmail
        : recoveryEmail || `test+${user.username}@litera.health`;

      const testPin = generatePin();
      const hashedPin = await bcrypt.hash(testPin, 10);
      await store.updatePatient(patient.id, { pin: hashedPin });

      const accessToken = generateAccessToken();
      const accessTokenExpiry = new Date();
      accessTokenExpiry.setDate(accessTokenExpiry.getDate() + 30);

      await store.updateCarePlan(id, {
        accessToken,
        accessTokenExpiry,
      });

      const baseUrl = process.env.APP_URL
        || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "http://localhost:5000");
      const accessLink = `${baseUrl}/p/${accessToken}?preview=1`;

      let emailSent = true;
      try {
        await sendCarePlanEmail(testEmail, patient.name, accessLink, testPin);
      } catch (emailError) {
        console.error("Test email sending failed:", emailError);
        emailSent = false;
      }

      await store.createAuditLog({
        carePlanId: id,
        userId: clinicianId,
        action: "test_sent",
        details: { sentTo: testEmail, isTest: true, patientName: patient.name },
        ipAddress: req.ip || null,
        userAgent: req.get("user-agent") || null,
      });

      res.json({
        emailSent,
        testCredentials: {
          patientName: patient.name,
          lastName: patient.lastName,
          yearOfBirth: patient.yearOfBirth,
          dateOfBirth: patient.dateOfBirth,
          pin: testPin,
          accessLink,
        },
      });
    } catch (error) {
      console.error("Error sending test care plan:", error);
      res.status(500).json({ error: "Failed to send test care plan" });
    }
  });

  app.delete("/api/care-plans/test-patients/cleanup", requireClinicianAuth, async (req: Request, res: Response) => {
    try {
      const deleted = await storage.cleanupOldTestPatients(0);
      await storage.createAuditLog({
        userId: (req as any).clinicianId || req.session.userId,
        action: "test_patients_cleanup",
        details: { deleted, manual: true },
        ipAddress: req.ip || null,
        userAgent: req.get("user-agent") || null,
      });
      res.json({ deleted });
    } catch (error) {
      console.error("Error cleaning up test patients:", error);
      res.status(500).json({ error: "Failed to clean up test patients" });
    }
  });

  // Generate demo token for clinician preview (requires clinician auth)
  app.post("/api/care-plans/:id/demo-token", requireClinicianAuth, async (req: Request, res: Response) => {
    try {
      const store = await getStore(req);
      const id = req.params.id as string;
      const tenantId = req.session.tenantId;
      const carePlan = await store.getCarePlan(id);
      
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

  app.post("/api/patient/:token/verify-preview", async (req: Request, res: Response) => {
    try {
      const accessToken = req.params.token as string;
      const { previewToken } = req.body;
      if (!previewToken || !accessToken) {
        return res.status(400).json({ verified: false });
      }
      const valid = validateDemoToken(previewToken, accessToken);
      if (valid) {
        req.session.verifiedTokens = { ...(req.session.verifiedTokens || {}), [accessToken]: true };
        return res.json({ verified: true });
      }
      return res.status(401).json({ verified: false });
    } catch (error) {
      console.error("Error verifying preview token:", error);
      res.status(500).json({ verified: false });
    }
  });

  // Delete care plan
  app.delete("/api/care-plans/:id", requireClinicianAuth, async (req: Request, res: Response) => {
    try {
      const store = await getStore(req);
      const id = req.params.id as string;
      const tenantId = req.session.tenantId;
      const carePlan = await store.getCarePlan(id);
      
      if (!carePlan) {
        return res.status(404).json({ error: "Care plan not found" });
      }
      
      // Verify tenant access
      if (tenantId && carePlan.tenantId !== tenantId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const protectedStatuses = ["approved", "sent", "completed", "interpreter_review", "interpreter_approved"];
      if (protectedStatuses.includes(carePlan.status)) {
        const forceDelete = req.query.force === "true";
        const userRoles = req.session.userRoles && req.session.userRoles.length > 0
          ? req.session.userRoles
          : (req.session.userRole ? [req.session.userRole] : []);
        const isAdmin = userRoles.includes("admin") || userRoles.includes("super_admin");

        if (!forceDelete || !isAdmin) {
          return res.status(400).json({
            error: "Cannot delete a care plan that has been sent to the patient or is under interpreter review",
            requiresForceDelete: isAdmin,
          });
        }

        const password = req.body?.password as string | undefined;
        if (!password) {
          return res.status(400).json({
            error: "Password is required to force-delete a protected care plan",
            requiresForceDelete: true,
          });
        }

        const userId = req.session.userId;
        if (!userId) {
          return res.status(401).json({ error: "Not authenticated" });
        }
        const user = await store.getUser(userId);
        if (!user || !user.password) {
          return res.status(401).json({ error: "User not found" });
        }
        const passwordValid = await bcrypt.compare(password, user.password);
        if (!passwordValid) {
          return res.status(403).json({
            error: "Incorrect password. Force-delete denied.",
            requiresForceDelete: true,
          });
        }
      }
      
      const deleted = await store.deleteCarePlan(id);
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
      // [M1.3] Grant session-level access for the clinician preview flow
      if (valid) {
        req.session.verifiedTokens = { ...(req.session.verifiedTokens || {}), [accessToken]: true };
      }
      res.json({ valid });
    } catch (error) {
      console.error("Error validating demo token:", error);
      res.status(500).json({ valid: false });
    }
  });

  // Verify patient access (with server-side rate limiting)
  // In demo mode: only dateOfBirth (or yearOfBirth fallback) required
  // In production mode: lastName + dateOfBirth + PIN required
  app.post("/api/patient/:token/verify", validateBody(verifyPatientSchema), async (req: Request, res: Response) => {
    try {
      const token = req.params.token as string;
      const { yearOfBirth, dateOfBirth, lastName, pin, password } = req.body;

      // Check if locked out
      if (checkVerificationLock(token)) {
        return res.status(429).json({ 
          error: "Too many attempts. Please try again in 15 minutes.",
          locked: true,
          attemptsRemaining: 0
        });
      }

      let carePlan = await storage.getCarePlanByToken(token);
      let store: typeof storage = storage;
      const sandboxResult = !carePlan ? findSandboxCarePlanByToken(token) : undefined;
      if (sandboxResult) {
        carePlan = sandboxResult.carePlan;
        store = createSandboxAdapter(sandboxResult.tenantId);
      }
      if (!carePlan) {
        return res.status(404).json({ error: "Care plan not found" });
      }

      // Check token expiry — treat missing expiry as expired [M2.4]
      if (!carePlan.accessTokenExpiry || new Date() > new Date(carePlan.accessTokenExpiry)) {
        return res.status(403).json({ error: "Access link has expired" });
      }

      const patient = carePlan.patientId ? await store.getPatient(carePlan.patientId) : null;
      if (!patient) {
        return res.status(404).json({ error: "Patient not found" });
      }
      
      // In production mode, verify lastName + dateOfBirth + PIN
      // In demo mode, only verify dateOfBirth (or yearOfBirth fallback)
      let isValid = false;
      
      if (isDemoMode) {
        if (patient.dateOfBirth && dateOfBirth) {
          isValid = patient.dateOfBirth === dateOfBirth;
        } else {
          const submittedYear = dateOfBirth ? new Date(dateOfBirth).getFullYear() : yearOfBirth;
          isValid = patient.yearOfBirth === submittedYear;
        }
      } else {
        // Production mode: require lastName + dateOfBirth + (PIN or password)
        const hasPatientPassword = patient.password !== null && patient.password !== undefined;
        
        if (!lastName) {
          return res.status(400).json({ 
            error: "Last name and date of birth are required",
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
        let dobMatches = false;
        if (patient.dateOfBirth && dateOfBirth) {
          dobMatches = patient.dateOfBirth === dateOfBirth;
        } else {
          const submittedYear = dateOfBirth ? new Date(dateOfBirth).getFullYear() : yearOfBirth;
          dobMatches = patient.yearOfBirth === submittedYear;
        }
        
        // Check PIN or password — both use bcrypt (inherently timing-safe)
        let credentialValid = false;
        if (password && hasPatientPassword) {
          credentialValid = await bcrypt.compare(password, patient.password!);
        } else if (pin) {
          credentialValid = patient.pin !== null && patient.pin !== undefined
            ? await bcrypt.compare(pin, patient.pin)
            : false;
        }
        
        isValid = lastNameMatches && dobMatches && credentialValid;
      }
      
      if (!isValid) {
        const result = recordVerificationAttempt(token, false);
        
        await store.createAuditLog({
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

      // [M1.3] Mark this token as verified in the session so the GET endpoint
      // can confirm the patient has passed authentication before returning data.
      req.session.verifiedTokens = { ...(req.session.verifiedTokens || {}), [token]: true };

      await store.createAuditLog({
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
  // [M1.3] Requires prior verification via POST /verify or POST /validate-demo.
  // Without a verified session, returns only enough info to render the verify form.
  app.get("/api/patient/:token", async (req: Request, res: Response) => {
    try {
      const token = req.params.token as string;

      let carePlan = await storage.getCarePlanByToken(token);
      let store: typeof storage = storage;
      const sandboxResult = !carePlan ? findSandboxCarePlanByToken(token) : undefined;
      if (sandboxResult) {
        carePlan = sandboxResult.carePlan;
        store = createSandboxAdapter(sandboxResult.tenantId);
      }
      if (!carePlan) {
        return res.status(404).json({ error: "Care plan not found" });
      }

      // Check if access token has expired — treat missing expiry as expired [M2.4]
      if (!carePlan.accessTokenExpiry || new Date(carePlan.accessTokenExpiry) < new Date()) {
        return res.status(410).json({ error: "This care plan link has expired. Please contact your clinic for a new link." });
      }

      // [M1.3] Enforce session-level verification before exposing medical content.
      // The frontend already gates this call behind isVerified, but we enforce it
      // server-side to prevent direct API access bypassing the verify step.
      const isVerified = req.session.verifiedTokens?.[token] === true;
      if (!isVerified) {
        const patient = carePlan.patientId ? await store.getPatient(carePlan.patientId) : null;
        return res.status(403).json({
          error: "Verification required",
          requiresVerification: true,
          translatedLanguage: carePlan.translatedLanguage,
          requiresDateOfBirth: true,
          hasFullDateOfBirth: !!(patient?.dateOfBirth),
          hasPassword: !!(patient?.password),
        });
      }

      // [M1.5] Only log views for verified (authenticated) access
      await store.createAuditLog({
        carePlanId: carePlan.id,
        action: "viewed",
        ipAddress: req.ip || null,
        userAgent: req.get("user-agent") || null,
      });

      const patient = carePlan.patientId ? await store.getPatient(carePlan.patientId) : null;
      const checkIns = await store.getCheckInsByCarePlanId(carePlan.id);

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

      // Strip internal AI-extraction field before returning to patient portal
      const { extractedPatientName: _omit, ...safePlan } = carePlan;
      const tenantForPortal = carePlan.tenantId ? await store.getTenant(carePlan.tenantId) : null;
      res.json({ ...safePlan, patient: safePatient, checkIns, sandboxMode: tenantForPortal?.sandboxMode === true });
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

      // [M1.4] Require verified session — same guard as the GET endpoint
      if (!req.session.verifiedTokens?.[token]) {
        return res.status(403).json({ error: "Verification required" });
      }

      let carePlan = await storage.getCarePlanByToken(token);
      let store: typeof storage = storage;
      const sandboxResult = !carePlan ? findSandboxCarePlanByToken(token) : undefined;
      if (sandboxResult) {
        carePlan = sandboxResult.carePlan;
        store = createSandboxAdapter(sandboxResult.tenantId);
      }
      if (!carePlan) {
        return res.status(404).json({ error: "Care plan not found" });
      }

      // Find pending check-in
      const checkIns = await store.getCheckInsByCarePlanId(carePlan.id);
      const pendingCheckIn = checkIns.find(c => !c.respondedAt);

      if (pendingCheckIn) {
        await store.updateCheckIn(pendingCheckIn.id, {
          response,
          respondedAt: new Date(),
          alertCreated: response === "yellow" || response === "red",
        });

        // Update care plan status if completed
        if (response === "green") {
          await store.updateCarePlan(carePlan.id, {
            status: "completed",
          });
        }

        await store.createAuditLog({
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

  // Patient chatbot — answer questions about their care plan (requires verified session)
  const patientChatLimiter = new Map<string, { count: number; resetAt: number }>();
  app.post("/api/patient/:token/chat", async (req: Request, res: Response) => {
    try {
      const token = req.params.token as string;

      if (!req.session.verifiedTokens?.[token]) {
        return res.status(403).json({ error: "Verification required" });
      }

      const ip = req.ip || "unknown";
      const now = Date.now();
      const entry = patientChatLimiter.get(ip);
      if (entry && entry.resetAt > now) {
        if (entry.count >= 30) {
          return res.status(429).json({ answer: "You've reached the question limit. Please try again later." });
        }
        entry.count++;
      } else {
        patientChatLimiter.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
      }

      const { question, language } = req.body;
      if (!question || typeof question !== "string") {
        return res.status(400).json({ error: "Question is required" });
      }
      if (question.length > 2000) {
        return res.status(400).json({ error: "Question is too long (max 2000 characters)" });
      }

      let carePlan = await storage.getCarePlanByToken(token);
      let store: typeof storage = storage;
      const sandboxResult = !carePlan ? findSandboxCarePlanByToken(token) : undefined;
      if (sandboxResult) {
        carePlan = sandboxResult.carePlan;
        store = createSandboxAdapter(sandboxResult.tenantId);
      }
      if (!carePlan) {
        return res.status(404).json({ error: "Care plan not found" });
      }

      const diagnosis = carePlan.simplifiedDiagnosis || carePlan.diagnosis || "";
      const instructions = carePlan.simplifiedInstructions || carePlan.instructions || "";
      const warnings = carePlan.simplifiedWarnings || carePlan.warnings || "";
      const medications = carePlan.simplifiedMedications || carePlan.medications || [];
      const appointments = carePlan.simplifiedAppointments || carePlan.appointments || [];

      const contextText = `
Diagnosis: ${diagnosis}
Instructions: ${instructions}
Warnings: ${warnings}
Medications: ${JSON.stringify(medications)}
Appointments: ${JSON.stringify(appointments)}
`;

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        ...(process.env.AI_INTEGRATIONS_OPENAI_BASE_URL && !process.env.OPENAI_API_KEY
          ? { baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL }
          : {}),
      });

      const responseLang = language || "English";

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a helpful healthcare assistant that answers patient questions about their discharge care plan.
Respond in ${responseLang} at a 5th-grade reading level.
Be warm, clear, and reassuring. Only answer questions based on the care plan information provided below.
If the patient asks about something not covered in their care plan, kindly suggest they contact their care team.
Do NOT provide medical advice beyond what is in the care plan.
Keep responses concise (2-4 sentences).

Care Plan Information:
${contextText}`
          },
          { role: "user", content: question },
        ],
        max_tokens: 300,
      });

      const answer = response.choices[0]?.message?.content || "I'm sorry, I couldn't answer that question.";

      await store.createAuditLog({
        carePlanId: carePlan.id,
        action: "patient_chat",
        details: { language: responseLang },
        ipAddress: req.ip || null,
        userAgent: req.get("user-agent") || null,
      });

      res.json({ answer });
    } catch (error: any) {
      console.error("Patient chat error:", error);
      res.status(500).json({ answer: "Sorry, I had trouble answering. Please try again." });
    }
  });

  // Set patient password (for repeat access without PIN)
  app.post("/api/patient/:token/set-password", validateBody(setPatientPasswordSchema), async (req: Request, res: Response) => {
    try {
      const token = req.params.token as string;
      const { password } = req.body;

      // [M1.4] Require verified session before allowing password change
      if (!req.session.verifiedTokens?.[token]) {
        return res.status(403).json({ error: "Verification required" });
      }

      let carePlan = await storage.getCarePlanByToken(token);
      let store: typeof storage = storage;
      const sandboxResult = !carePlan ? findSandboxCarePlanByToken(token) : undefined;
      if (sandboxResult) {
        carePlan = sandboxResult.carePlan;
        store = createSandboxAdapter(sandboxResult.tenantId);
      }
      if (!carePlan) {
        return res.status(404).json({ error: "Care plan not found" });
      }
      
      // Check token expiry — treat missing expiry as expired [M2.4]
      if (!carePlan.accessTokenExpiry || new Date() > new Date(carePlan.accessTokenExpiry)) {
        return res.status(403).json({ error: "Access link has expired" });
      }

      const patient = carePlan.patientId ? await store.getPatient(carePlan.patientId) : null;
      if (!patient) {
        return res.status(404).json({ error: "Patient not found" });
      }
      
      // Hash the password and save
      const hashedPassword = await bcrypt.hash(password, 10);
      await store.updatePatientPassword(patient.id, hashedPassword);
      
      await store.createAuditLog({
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
      const store = await getStore(req);
      const tenantId = req.session.tenantId;
      const carePlans = await store.getAllCarePlans(tenantId);
      
      const enrichedPlans = await Promise.all(
        carePlans.map(async (plan) => {
          const patient = plan.patientId ? await store.getPatient(plan.patientId) : undefined;
          const clinician = plan.clinicianId ? await store.getUser(plan.clinicianId) : undefined;
          const approver = plan.approvedBy ? await store.getUser(plan.approvedBy) : undefined;
          const checkIns = await store.getCheckInsByCarePlanId(plan.id);
          const auditLogs = await store.getAuditLogsByCarePlanId(plan.id);
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
      const store = await getStore(req);
      const tenantId = req.session.tenantId;
      const alerts = await store.getAlerts(tenantId);
      res.json(alerts);
    } catch (error) {
      console.error("Error fetching alerts:", error);
      res.status(500).json({ error: "Failed to fetch alerts" });
    }
  });

  // Resolve alert
  app.post("/api/admin/alerts/:id/resolve", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const store = await getStore(req);
      const id = req.params.id as string;
      const adminId = (req as any).adminId || "admin-1";
      const tenantId = req.session.tenantId;
      
      const checkIn = await store.getCheckIn(id);
      if (!checkIn) {
        return res.status(404).json({ error: "Alert not found" });
      }
      
      if (tenantId) {
        const carePlan = await store.getCarePlan(checkIn.carePlanId);
        if (!carePlan || carePlan.tenantId !== tenantId) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
      
      await store.resolveAlert(id, adminId);
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error resolving alert:", error);
      res.status(500).json({ error: "Failed to resolve alert" });
    }
  });

  // Export CSV
  app.post("/api/admin/export", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const store = await getStore(req);
      const tenantId = req.session.tenantId;
      const carePlans = await store.getAllCarePlans(tenantId);
      
      const rows: string[] = [
        "patient_name,mrn,discharge_date,discharge_diagnosis,approved_by,approved_at,sent_at,first_contact_at,response_at,response_type,audit_log_id,suggested_cpt_code",
      ];

      for (const plan of carePlans) {
        const patient = plan.patientId ? await store.getPatient(plan.patientId) : null;
        const checkIns = await store.getCheckInsByCarePlanId(plan.id);
        const respondedCheckIn = checkIns.find(c => c.respondedAt);
        const auditLogs = await store.getAuditLogsByCarePlanId(plan.id);
        
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
  // ============= Experiments API (Sandbox - no auth required) =============
  const experimentChatLimiter = new Map<string, { count: number; resetAt: number }>();
  app.post("/api/experiments/chat", async (req: Request, res: Response) => {
    const ip = req.ip || "unknown";
    const now = Date.now();
    const entry = experimentChatLimiter.get(ip);
    if (entry && entry.resetAt > now) {
      if (entry.count >= 20) {
        return res.status(429).json({ answer: "You've reached the question limit. Please try again later." });
      }
      entry.count++;
    } else {
      experimentChatLimiter.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
    }
    try {
      const { question, language, carePlanContext } = req.body;
      if (!question || !carePlanContext) {
        return res.status(400).json({ error: "Question and care plan context are required" });
      }
      if (typeof question === "string" && question.length > 2000) {
        return res.status(400).json({ error: "Question is too long (max 2000 characters)" });
      }
      const contextString = JSON.stringify(carePlanContext);
      if (contextString.length > 50000) {
        return res.status(400).json({ error: "Care plan context is too large" });
      }
      const ctx = carePlanContext;
      if (!ctx.diagnosis && !ctx.instructions && !ctx.warnings && !ctx.medications?.length && !ctx.appointments?.length) {
        return res.status(400).json({ error: "Care plan context must include at least one field (diagnosis, instructions, warnings, medications, or appointments)" });
      }

      const { getOpenAIClient } = await import("./services/openai");
      const openai = getOpenAIClient();

      const contextText = `
Diagnosis: ${carePlanContext.diagnosis || ""}
Instructions: ${carePlanContext.instructions || ""}
Warnings: ${carePlanContext.warnings || ""}
Medications: ${JSON.stringify(carePlanContext.medications || [])}
Appointments: ${JSON.stringify(carePlanContext.appointments || [])}
`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a helpful healthcare assistant that answers patient questions about their discharge care plan. 
Respond in ${language || "English"} at a 5th-grade reading level. 
Be warm, clear, and reassuring. Only answer questions based on the care plan information provided below. 
If the patient asks about something not covered in their care plan, kindly suggest they contact their care team.
Do NOT provide medical advice beyond what is in the care plan.
Keep responses concise (2-4 sentences).

Care Plan Information:
${contextText}`
          },
          { role: "user", content: question },
        ],
        max_tokens: 300,
      });

      const answer = response.choices[0]?.message?.content || "I'm sorry, I couldn't answer that question.";
      res.json({ answer });
    } catch (error: any) {
      console.error("Experiment chat error:", error);
      res.status(500).json({ answer: "Sorry, I had trouble answering. Please try again." });
    }
  });

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
  const updateUserSchema = z.object({
    name: z.string().min(1).max(200).optional(),
    role: z.enum(["clinician", "interpreter", "admin", "super_admin"]).optional(),
    tenantId: z.string().nullable().optional(),
  });
  app.patch("/api/admin/users/:id", requireAdminAuth, validateBody(updateUserSchema), async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
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
      const id = req.params.id as string;
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
  
  // ============= Team Invitation Endpoints =============

  app.post("/api/admin/invitations", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const { email, role } = req.body;
      if (!email || !role) {
        return res.status(400).json({ error: "Email and role are required" });
      }
      const validRoles = ["clinician", "interpreter", "admin"];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: "Invalid role" });
      }
      const tenantId = req.session.tenantId;
      const invitedBy = req.session.userId;
      const inviter = await storage.getUser(invitedBy!);
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const invitation = await storage.createTeamInvitation({
        email,
        role,
        tenantId: tenantId || null,
        invitedBy: invitedBy || null,
        token,
        status: "pending",
        expiresAt,
      });

      const appUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
      const inviteLink = `${appUrl}/invite/${token}`;

      try {
        await sendTeamInviteEmail(email, inviter?.name || "An administrator", role, inviteLink);
      } catch (emailErr) {
        console.error("Failed to send invite email:", emailErr);
      }

      res.json({ success: true, invitation });
    } catch (error) {
      console.error("Error creating invitation:", error);
      res.status(500).json({ error: "Failed to create invitation" });
    }
  });

  app.get("/api/admin/invitations", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = req.session.tenantId;
      const invitations = await storage.getTeamInvitations(tenantId || undefined);
      res.json(invitations);
    } catch (error) {
      console.error("Error fetching invitations:", error);
      res.status(500).json({ error: "Failed to fetch invitations" });
    }
  });

  app.get("/api/invitations/:token", async (req: Request, res: Response) => {
    try {
      const token = req.params.token as string;
      const invitation = await storage.getTeamInvitationByToken(token);
      if (!invitation) {
        return res.status(404).json({ error: "Invitation not found" });
      }
      if (invitation.status !== "pending") {
        return res.status(400).json({ error: "Invitation already used", status: invitation.status });
      }
      if (new Date() > invitation.expiresAt) {
        return res.status(400).json({ error: "Invitation has expired" });
      }
      let tenantName: string | undefined;
      if (invitation.tenantId) {
        const tenant = await storage.getTenant(invitation.tenantId);
        tenantName = tenant?.name;
      }
      res.json({ email: invitation.email, role: invitation.role, tenantName });
    } catch (error) {
      console.error("Error fetching invitation:", error);
      res.status(500).json({ error: "Failed to fetch invitation" });
    }
  });

  app.post("/api/invitations/:token/accept", async (req: Request, res: Response) => {
    try {
      const token = req.params.token as string;
      const { name, username, password } = req.body;
      if (!name || !username || !password) {
        return res.status(400).json({ error: "Name, username, and password are required" });
      }
      const invitation = await storage.getTeamInvitationByToken(token);
      if (!invitation) {
        return res.status(404).json({ error: "Invitation not found" });
      }
      if (invitation.status !== "pending") {
        return res.status(400).json({ error: "Invitation already used" });
      }
      if (new Date() > invitation.expiresAt) {
        return res.status(400).json({ error: "Invitation has expired" });
      }
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ error: "Username already taken" });
      }
      const hashedPassword = await bcrypt.hash(password, 12);

      const user = await storage.createUser({
        name,
        username,
        password: hashedPassword,
        role: invitation.role,
        roles: [invitation.role],
        tenantId: invitation.tenantId,
      });

      await storage.updateTeamInvitation(invitation.id, { status: "accepted" });

      req.session.userId = user.id;
      req.session.userRole = user.role;
      req.session.tenantId = user.tenantId || undefined;

      res.json({ success: true, user: { id: user.id, name: user.name, role: user.role } });
    } catch (error) {
      console.error("Error accepting invitation:", error);
      res.status(500).json({ error: "Failed to accept invitation" });
    }
  });

  // ============= Admin Preview Access (auth bypass for staff viewing patient portal) =============
  app.post("/api/admin/preview-access/:accessToken", requireAuth, async (req: Request, res: Response) => {
    try {
      const store = await getStore(req);
      const accessToken = req.params.accessToken as string;
      const carePlan = await store.getCarePlanByToken(accessToken);
      if (!carePlan) {
        return res.status(404).json({ error: "Care plan not found" });
      }
      if (req.session.tenantId && carePlan.tenantId !== req.session.tenantId) {
        return res.status(403).json({ error: "Access denied" });
      }
      req.session.verifiedTokens = { ...(req.session.verifiedTokens || {}), [accessToken]: true };
      res.json({ success: true });
    } catch (error) {
      console.error("Error setting preview access:", error);
      res.status(500).json({ error: "Failed to set preview access" });
    }
  });

  // ============= Patient CRUD Endpoints =============

  app.get("/api/admin/patients", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const store = await getStore(req);
      const tenantId = req.session.tenantId;
      const allPatients = await store.getAllPatients(tenantId);
      
      const enrichedPatients = await Promise.all(
        allPatients.map(async (patient) => {
          const patientCarePlans = await store.getCarePlansByPatientId(patient.id, tenantId);
          const lastCarePlan = patientCarePlans.length > 0 ? patientCarePlans[0] : null;
          return {
            id: patient.id,
            name: patient.name,
            lastName: patient.lastName,
            email: patient.email,
            phone: patient.phone,
            yearOfBirth: patient.yearOfBirth,
            dateOfBirth: patient.dateOfBirth,
            preferredLanguage: patient.preferredLanguage,
            tenantId: patient.tenantId,
            createdAt: patient.createdAt,
            carePlanCount: patientCarePlans.length,
            lastCarePlanStatus: lastCarePlan?.status || null,
            lastCarePlanDate: lastCarePlan?.createdAt || null,
            isTestPatient: patient.isTestPatient || false,
            latestAccessToken: lastCarePlan?.accessToken || null,
          };
        })
      );
      
      res.json(enrichedPatients);
    } catch (error) {
      console.error("Error fetching patients:", error);
      res.status(500).json({ error: "Failed to fetch patients" });
    }
  });

  app.post("/api/admin/patients", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const store = await getStore(req);
      const tenantId = req.session.tenantId;
      const { name, email, phone, yearOfBirth, dateOfBirth, preferredLanguage } = req.body;
      
      if (!name || !email || (!yearOfBirth && !dateOfBirth)) {
        return res.status(400).json({ error: "Name, email, and date of birth (or year of birth) are required" });
      }
      if (typeof name !== "string" || name.length > 500) {
        return res.status(400).json({ error: "Name must be 500 characters or fewer" });
      }
      if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: "A valid email address is required" });
      }
      if (dateOfBirth && (typeof dateOfBirth !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth))) {
        return res.status(400).json({ error: "Date of birth must be in YYYY-MM-DD format" });
      }
      const effectiveYob = dateOfBirth ? new Date(dateOfBirth).getFullYear() : yearOfBirth;
      if (typeof effectiveYob !== "number" || effectiveYob < 1900 || effectiveYob > 2100) {
        return res.status(400).json({ error: "Year of birth must be between 1900 and 2100" });
      }
      
      const existing = await store.getPatientByEmail(email, tenantId);
      if (existing) {
        return res.status(409).json({ 
          error: "A patient with this email already exists in your clinic",
          existingPatient: {
            id: existing.id,
            name: existing.name,
            email: existing.email,
          }
        });
      }
      
      const sanitizedName = stripHtml(name);
      const lastName = sanitizedName.trim().split(/\s+/).pop() || sanitizedName;
      const pin = Math.floor(1000 + Math.random() * 9000).toString();
      const hashedPin = await bcrypt.hash(pin, 10);
      
      const patient = await store.createPatient({
        name: sanitizedName,
        lastName,
        email,
        phone: phone || null,
        yearOfBirth: effectiveYob,
        dateOfBirth: dateOfBirth || null,
        pin: hashedPin,
        preferredLanguage: preferredLanguage || "en",
        tenantId,
      });
      
      await store.createAuditLog({
        userId: req.session.userId,
        action: "patient_created",
        details: { patientId: patient.id, patientName: patient.name, patientEmail: patient.email },
        ipAddress: req.ip || null,
        userAgent: req.get("user-agent") || null,
      });
      
      res.json(patient);
    } catch (error: any) {
      console.error("Error creating patient:", error);
      if (error?.code === "23505") {
        return res.status(409).json({ error: "A patient with this email already exists in your clinic" });
      }
      res.status(500).json({ error: "Failed to create patient" });
    }
  });

  app.patch("/api/admin/patients/:id", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const store = await getStore(req);
      const id = req.params.id as string;
      const tenantId = req.session.tenantId;
      
      const patient = await store.getPatient(id);
      if (!patient) {
        return res.status(404).json({ error: "Patient not found" });
      }
      
      if (tenantId && patient.tenantId !== tenantId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const { name, email, phone, yearOfBirth, dateOfBirth, preferredLanguage } = req.body;

      if (name !== undefined && (typeof name !== "string" || name.length > 500)) {
        return res.status(400).json({ error: "Name must be 500 characters or fewer" });
      }
      if (email !== undefined && (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
        return res.status(400).json({ error: "A valid email address is required" });
      }
      if (dateOfBirth !== undefined && dateOfBirth !== null && (typeof dateOfBirth !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth))) {
        return res.status(400).json({ error: "Date of birth must be in YYYY-MM-DD format" });
      }
      if (yearOfBirth !== undefined && (typeof yearOfBirth !== "number" || yearOfBirth < 1900 || yearOfBirth > 2100)) {
        return res.status(400).json({ error: "Year of birth must be between 1900 and 2100" });
      }

      if (email && email !== patient.email) {
        const existing = await store.getPatientByEmail(email, tenantId);
        if (existing && existing.id !== id) {
          return res.status(409).json({ error: "Another patient with this email already exists" });
        }
      }
      
      const updateData: Partial<typeof patient> = {};
      if (name !== undefined) {
        const sanitizedName = stripHtml(name);
        updateData.name = sanitizedName;
        updateData.lastName = sanitizedName.trim().split(/\s+/).pop() || sanitizedName;
      }
      if (email !== undefined) updateData.email = email;
      if (phone !== undefined) updateData.phone = phone;
      if (dateOfBirth !== undefined) {
        updateData.dateOfBirth = dateOfBirth;
        if (dateOfBirth) updateData.yearOfBirth = new Date(dateOfBirth).getFullYear();
      }
      if (yearOfBirth !== undefined && !dateOfBirth) updateData.yearOfBirth = yearOfBirth;
      if (preferredLanguage !== undefined) updateData.preferredLanguage = preferredLanguage;
      
      const updated = await store.updatePatient(id, updateData);
      
      await store.createAuditLog({
        userId: req.session.userId,
        action: "patient_updated",
        details: { patientId: id, changes: Object.keys(updateData) },
        ipAddress: req.ip || null,
        userAgent: req.get("user-agent") || null,
      });
      
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating patient:", error);
      if (error?.code === "23505") {
        return res.status(409).json({ error: "Another patient with this email already exists" });
      }
      res.status(500).json({ error: "Failed to update patient" });
    }
  });

  app.delete("/api/admin/patients/test/cleanup", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const store = await getStore(req);
      const tenantId = req.session.tenantId;
      const allPatients = await store.getAllPatients(tenantId);
      const testPatients = allPatients.filter(p => p.isTestPatient);
      let deleted = 0;

      for (const patient of testPatients) {
        const linkedCarePlans = await store.getCarePlansByPatientId(patient.id, tenantId);
        for (const cp of linkedCarePlans) {
          await store.deleteCarePlan(cp.id);
        }
        await store.deletePatient(patient.id);
        deleted++;
      }

      await store.createAuditLog({
        userId: req.session.userId,
        action: "test_patients_cleanup",
        details: { deleted },
        ipAddress: req.ip || null,
        userAgent: req.get("user-agent") || null,
      });

      res.json({ deleted });
    } catch (error) {
      console.error("Error cleaning up test patients:", error);
      res.status(500).json({ error: "Failed to clean up test patients" });
    }
  });

  app.delete("/api/admin/patients/:id", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const store = await getStore(req);
      const id = req.params.id as string;
      const tenantId = req.session.tenantId;
      
      const patient = await store.getPatient(id);
      if (!patient) {
        return res.status(404).json({ error: "Patient not found" });
      }
      
      if (tenantId && patient.tenantId !== tenantId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const linkedCarePlans = await store.getCarePlansByPatientId(id, tenantId);
      if (linkedCarePlans.length > 0) {
        return res.status(409).json({ 
          error: `Cannot delete patient with ${linkedCarePlans.length} linked care plan(s). Remove or reassign care plans first.` 
        });
      }
      
      await store.deletePatient(id);
      
      await store.createAuditLog({
        userId: req.session.userId,
        action: "patient_deleted",
        details: { patientId: id, patientName: patient.name },
        ipAddress: req.ip || null,
        userAgent: req.get("user-agent") || null,
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting patient:", error);
      res.status(500).json({ error: "Failed to delete patient" });
    }
  });

  app.get("/api/admin/patients/:id/care-plans", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const store = await getStore(req);
      const id = req.params.id as string;
      const tenantId = req.session.tenantId;
      
      const patient = await store.getPatient(id);
      if (!patient) {
        return res.status(404).json({ error: "Patient not found" });
      }
      
      if (tenantId && patient.tenantId !== tenantId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const patientCarePlans = await store.getCarePlansByPatientId(id, tenantId);

      const enriched = await Promise.all(
        patientCarePlans.map(async (plan) => {
          const clinician = plan.clinicianId ? await store.getUser(plan.clinicianId) : undefined;
          const checkIns = await store.getCheckInsByCarePlanId(plan.id);
          return {
            ...plan,
            clinician: clinician ? { id: clinician.id, name: clinician.name } : undefined,
            checkIns,
          };
        })
      );
      
      res.json(enriched);
    } catch (error) {
      console.error("Error fetching patient care plans:", error);
      res.status(500).json({ error: "Failed to fetch patient care plans" });
    }
  });

  // Also expose patient list for clinicians (for patient selector dropdown)
  app.get("/api/patients", requireClinicianAuth, async (req: Request, res: Response) => {
    try {
      const store = await getStore(req);
      const tenantId = req.session.tenantId;
      const allPatients = await store.getAllPatients(tenantId);
      
      const safePatients = allPatients.map(p => ({
        id: p.id,
        name: p.name,
        lastName: p.lastName,
        email: p.email,
        phone: p.phone,
        yearOfBirth: p.yearOfBirth,
        dateOfBirth: p.dateOfBirth,
        preferredLanguage: p.preferredLanguage,
        tenantId: p.tenantId,
      }));
      
      res.json(safePatients);
    } catch (error) {
      console.error("Error fetching patients:", error);
      res.status(500).json({ error: "Failed to fetch patients" });
    }
  });

  // Bulk patient import (CSV)
  app.post("/api/admin/patients/import", requireAdminAuth, csvUpload.single("file"), async (req: Request, res: Response) => {
    try {
      const store = await getStore(req);
      const tenantId = req.session.tenantId;
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      
      const csvContent = req.file.buffer.toString("utf-8");
      const lines = csvContent.split("\n").map(l => l.trim()).filter(l => l.length > 0);
      
      if (lines.length < 2) {
        return res.status(400).json({ error: "CSV file must have a header row and at least one data row" });
      }
      
      const header = lines[0].toLowerCase().split(",").map(h => h.trim().replace(/"/g, ""));
      const nameIdx = header.findIndex(h => h === "name" || h === "patient name" || h === "full name");
      const emailIdx = header.findIndex(h => h === "email" || h === "patient email" || h === "email address");
      const phoneIdx = header.findIndex(h => h === "phone" || h === "phone number");
      const dobIdx = header.findIndex(h => h === "dateofbirth" || h === "date of birth" || h === "dob" || h === "date_of_birth" || h === "birthday");
      const yobIdx = header.findIndex(h => h === "yearofbirth" || h === "year of birth" || h === "yob" || h === "birth year" || h === "year_of_birth");
      const langIdx = header.findIndex(h => h === "preferredlanguage" || h === "preferred language" || h === "language" || h === "preferred_language" || h === "lang");
      
      if (nameIdx === -1 || emailIdx === -1) {
        return res.status(400).json({ error: "CSV must have 'name' and 'email' columns" });
      }
      
      let created = 0;
      let skipped = 0;
      let updated = 0;
      const errors: string[] = [];
      
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(",").map(v => v.trim().replace(/^"|"$/g, ""));
        const name = values[nameIdx]?.trim();
        const email = values[emailIdx]?.trim();
        const phone = phoneIdx !== -1 ? values[phoneIdx]?.trim() : null;
        const dobStr = dobIdx !== -1 ? values[dobIdx]?.trim() : null;
        const yobStr = yobIdx !== -1 ? values[yobIdx]?.trim() : null;
        const lang = langIdx !== -1 ? values[langIdx]?.trim() : "en";
        
        if (!name || !email) {
          errors.push(`Row ${i + 1}: Missing name or email`);
          continue;
        }
        
        let dateOfBirth: string | null = null;
        let yearOfBirth: number;
        if (dobStr && /^\d{4}-\d{2}-\d{2}$/.test(dobStr)) {
          dateOfBirth = dobStr;
          yearOfBirth = new Date(dobStr).getFullYear();
        } else if (yobStr) {
          yearOfBirth = parseInt(yobStr);
        } else {
          yearOfBirth = 1970;
        }
        if (isNaN(yearOfBirth) || yearOfBirth < 1900 || yearOfBirth > new Date().getFullYear()) {
          errors.push(`Row ${i + 1}: Invalid date/year of birth '${dobStr || yobStr}'`);
          continue;
        }
        
        const existing = await store.getPatientByEmail(email, tenantId);
        if (existing) {
          const needsUpdate = (phone && phone !== existing.phone) || 
                             (lang && lang !== existing.preferredLanguage) ||
                             (name !== existing.name);
          if (needsUpdate) {
            const updateData: any = {};
            if (name !== existing.name) {
              updateData.name = name;
              updateData.lastName = name.trim().split(/\s+/).pop() || name;
            }
            if (phone && phone !== existing.phone) updateData.phone = phone;
            if (lang && lang !== existing.preferredLanguage) updateData.preferredLanguage = lang;
            await store.updatePatient(existing.id, updateData);
            updated++;
          } else {
            skipped++;
          }
          continue;
        }
        
        const lastName = name.trim().split(/\s+/).pop() || name;
        const pin = Math.floor(1000 + Math.random() * 9000).toString();
        const hashedPin = await bcrypt.hash(pin, 10);
        
        await store.createPatient({
          name,
          lastName,
          email,
          phone: phone || null,
          yearOfBirth,
          dateOfBirth,
          pin: hashedPin,
          preferredLanguage: lang || "en",
          tenantId,
        });
        created++;
      }
      
      await store.createAuditLog({
        userId: req.session.userId,
        action: "patients_imported",
        details: { created, skipped, updated, errorCount: errors.length },
        ipAddress: req.ip || null,
        userAgent: req.get("user-agent") || null,
      });
      
      res.json({ 
        success: true, 
        created, 
        skipped, 
        updated,
        errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
        totalProcessed: lines.length - 1,
      });
    } catch (error) {
      console.error("Error importing patients:", error);
      res.status(500).json({ error: "Failed to import patients" });
    }
  });

  // ============= Tenant Endpoints =============

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

      const id = req.params.id as string;
      const { name, isDemo, interpreterReviewMode } = req.body;
      
      const oldTenant = await storage.getTenant(id);
      const oldMode = oldTenant?.interpreterReviewMode;

      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (isDemo !== undefined) updateData.isDemo = isDemo;
      if (interpreterReviewMode !== undefined) updateData.interpreterReviewMode = interpreterReviewMode;
      
      const tenant = await storage.updateTenant(id, updateData);
      if (!tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }

      if (interpreterReviewMode !== undefined && oldMode !== interpreterReviewMode) {
        const allPlans = await storage.getAllCarePlans(id);
        for (const plan of allPlans) {
          if (plan.status === "interpreter_review") {
            if (interpreterReviewMode === "disabled" || (interpreterReviewMode === "optional" && oldMode === "required")) {
              await storage.updateCarePlan(plan.id, { status: "approved" });
            }
          }
        }
      }
      
      res.json(tenant);
    } catch (error) {
      console.error("Error updating tenant:", error);
      res.status(500).json({ error: "Failed to update tenant" });
    }
  });

  // Update own tenant settings (admin)
  app.patch("/api/admin/my-tenant", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const store = await getStore(req);
      const tenantId = (req as any).tenantId;
      if (!tenantId) return res.status(400).json({ error: "No tenant assigned" });
      
      const { interpreterReviewMode } = req.body;
      const oldTenant = await store.getTenant(tenantId);
      const oldMode = oldTenant?.interpreterReviewMode;

      const updateData: any = {};
      if (interpreterReviewMode !== undefined) {
        if (!["disabled", "optional", "required"].includes(interpreterReviewMode)) {
          return res.status(400).json({ error: "Invalid interpreter review mode" });
        }
        updateData.interpreterReviewMode = interpreterReviewMode;
      }
      
      const tenant = await store.updateTenant(tenantId, updateData);
      if (!tenant) return res.status(404).json({ error: "Tenant not found" });

      if (interpreterReviewMode !== undefined && oldMode !== interpreterReviewMode) {
        const allPlans = await store.getAllCarePlans(tenantId);
        for (const plan of allPlans) {
          if (plan.status === "interpreter_review") {
            if (interpreterReviewMode === "disabled" || (interpreterReviewMode === "optional" && oldMode === "required")) {
              await store.updateCarePlan(plan.id, { status: "approved" });
            }
          }
        }
      }
      
      await store.createAuditLog({
        userId: (req as any).adminId,
        action: "tenant_settings_updated",
        details: updateData,
        ipAddress: req.ip || null,
        userAgent: req.get("user-agent") || null,
      });
      
      res.json(tenant);
    } catch (error) {
      console.error("Error updating tenant settings:", error);
      res.status(500).json({ error: "Failed to update tenant settings" });
    }
  });

  // ============= Interpreter Routes =============
  
  // Get interpreter review queue (care plans in interpreter_review status for this interpreter's tenant + languages)
  app.get("/api/interpreter/queue", requireInterpreterAuth, async (req: Request, res: Response) => {
    try {
      const store = await getStore(req);
      const tenantId = (req as any).tenantId;
      const interpreterId = (req as any).interpreterId;
      const interpreter = await store.getUser(interpreterId);
      
      const allPlans = await store.getAllCarePlans(tenantId);
      const queue = allPlans.filter(cp => cp.status === "interpreter_review");
      
      // Optionally filter by interpreter's languages
      const filteredQueue = interpreter?.languages?.length
        ? queue.filter(cp => cp.translatedLanguage && interpreter.languages!.includes(cp.translatedLanguage))
        : queue;
      
      // Enrich with patient and clinician info
      const enriched = await Promise.all(filteredQueue.map(async (cp) => {
        const patient = cp.patientId ? await store.getPatient(cp.patientId) : null;
        const clinician = cp.clinicianId ? await store.getUser(cp.clinicianId) : null;
        return {
          ...cp,
          patient: patient ? { name: patient.name, email: patient.email, preferredLanguage: patient.preferredLanguage } : null,
          clinician: clinician ? { name: clinician.name } : null,
        };
      }));
      
      res.json(enriched);
    } catch (error) {
      console.error("Error fetching interpreter queue:", error);
      res.status(500).json({ error: "Failed to fetch queue" });
    }
  });
  
  // Get recently reviewed care plans
  app.get("/api/interpreter/reviewed", requireInterpreterAuth, async (req: Request, res: Response) => {
    try {
      const store = await getStore(req);
      const tenantId = (req as any).tenantId;
      const interpreterId = (req as any).interpreterId;
      
      const allPlans = await store.getAllCarePlans(tenantId);
      const reviewed = allPlans.filter(cp => 
        cp.interpreterReviewedBy === interpreterId && 
        (cp.status === "interpreter_approved" || cp.status === "approved" || cp.status === "sent" || cp.status === "completed")
      );
      
      const enriched = await Promise.all(reviewed.slice(0, 20).map(async (cp) => {
        const patient = cp.patientId ? await store.getPatient(cp.patientId) : null;
        return {
          ...cp,
          patient: patient ? { name: patient.name, email: patient.email, preferredLanguage: patient.preferredLanguage } : null,
        };
      }));
      
      res.json(enriched);
    } catch (error) {
      console.error("Error fetching reviewed plans:", error);
      res.status(500).json({ error: "Failed to fetch reviewed plans" });
    }
  });
  
  // Interpreter approves a care plan (with optional edits)
  app.post("/api/interpreter/care-plans/:id/approve", requireInterpreterAuth, async (req: Request, res: Response) => {
    try {
      const store = await getStore(req);
      const { id } = req.params;
      const interpreterId = (req as any).interpreterId;
      const tenantId = (req as any).tenantId;
      
      const carePlan = await store.getCarePlan(id as string);
      if (!carePlan) return res.status(404).json({ error: "Care plan not found" });
      if (tenantId && carePlan.tenantId !== tenantId) return res.status(403).json({ error: "Access denied" });
      if (carePlan.status !== "interpreter_review") {
        return res.status(400).json({ error: "Care plan is not in interpreter review status" });
      }
      
      // M3.4: Enforce interpreter language match
      const interpreter = await store.getUser(interpreterId);
      if (interpreter?.languages?.length && carePlan.translatedLanguage) {
        if (!interpreter.languages.includes(carePlan.translatedLanguage)) {
          return res.status(403).json({ error: "Language not in interpreter's specialties" });
        }
      }

      const {
        simplifiedDiagnosis, simplifiedInstructions, simplifiedWarnings,
        simplifiedMedications, simplifiedAppointments,
        translatedDiagnosis, translatedInstructions, translatedWarnings,
        translatedMedications, translatedAppointments,
        notes
      } = req.body;

      const updateData: any = {
        status: "interpreter_approved",
        interpreterReviewedBy: interpreterId,
        interpreterReviewedAt: new Date(),
        interpreterNotes: notes ? stripHtml(notes) : null,
      };

      // Apply any edits the interpreter made
      if (simplifiedDiagnosis !== undefined) updateData.simplifiedDiagnosis = stripHtml(simplifiedDiagnosis);
      if (simplifiedInstructions !== undefined) updateData.simplifiedInstructions = stripHtml(simplifiedInstructions);
      if (simplifiedWarnings !== undefined) updateData.simplifiedWarnings = stripHtml(simplifiedWarnings);
      if (simplifiedMedications !== undefined) updateData.simplifiedMedications = stripHtml(simplifiedMedications);
      if (simplifiedAppointments !== undefined) updateData.simplifiedAppointments = stripHtml(simplifiedAppointments);
      if (translatedDiagnosis !== undefined) updateData.translatedDiagnosis = stripHtml(translatedDiagnosis);
      if (translatedInstructions !== undefined) updateData.translatedInstructions = stripHtml(translatedInstructions);
      if (translatedWarnings !== undefined) updateData.translatedWarnings = stripHtml(translatedWarnings);
      if (translatedMedications !== undefined) updateData.translatedMedications = stripHtml(translatedMedications);
      if (translatedAppointments !== undefined) updateData.translatedAppointments = stripHtml(translatedAppointments);
      
      const updated = await store.updateCarePlan(id as string, updateData);
      
      await store.createAuditLog({
        carePlanId: id as string,
        userId: interpreterId,
        action: "interpreter_approved",
        details: { notes: notes || null, hasEdits: !!(simplifiedDiagnosis || translatedDiagnosis || simplifiedMedications || translatedMedications) },
        ipAddress: req.ip || null,
        userAgent: req.get("user-agent") || null,
      });
      
      res.json(updated);
    } catch (error) {
      console.error("Error approving care plan:", error);
      res.status(500).json({ error: "Failed to approve care plan" });
    }
  });
  
  // Interpreter requests changes (sends back to clinician)
  app.post("/api/interpreter/care-plans/:id/request-changes", requireInterpreterAuth, async (req: Request, res: Response) => {
    try {
      const store = await getStore(req);
      const { id } = req.params;
      const interpreterId = (req as any).interpreterId;
      const tenantId = (req as any).tenantId;
      
      const carePlan = await store.getCarePlan(id as string);
      if (!carePlan) return res.status(404).json({ error: "Care plan not found" });
      if (tenantId && carePlan.tenantId !== tenantId) return res.status(403).json({ error: "Access denied" });
      if (carePlan.status !== "interpreter_review") {
        return res.status(400).json({ error: "Care plan is not in interpreter review status" });
      }
      
      const { reason } = req.body;
      if (!reason?.trim()) return res.status(400).json({ error: "Reason is required" });
      
      const updated = await store.updateCarePlan(id as string, {
        status: "pending_review",
        interpreterNotes: reason,
      });
      
      await store.createAuditLog({
        carePlanId: id as string,
        userId: interpreterId,
        action: "interpreter_changes_requested",
        details: { reason },
        ipAddress: req.ip || null,
        userAgent: req.get("user-agent") || null,
      });
      
      res.json(updated);
    } catch (error) {
      console.error("Error requesting changes:", error);
      res.status(500).json({ error: "Failed to request changes" });
    }
  });

  // ============= Analytics API =============
  app.get("/api/analytics", requireAuth, async (req: Request, res: Response) => {
    try {
      const userRole = req.session.userRole;
      const tenantId = req.session.tenantId;
      const daysParam = parseInt(req.query.days as string) || 0;

      const { db } = await import("./db");
      const { carePlans, checkIns, patients } = await import("@shared/schema");
      const { eq, sql, isNotNull, inArray, and: drizzleAnd, gte } = await import("drizzle-orm");

      const conditions = [];
      if (userRole !== "super_admin" && tenantId) {
        conditions.push(eq(carePlans.tenantId, tenantId));
      }
      if (daysParam > 0) {
        const cutoff = new Date(Date.now() - daysParam * 24 * 60 * 60 * 1000);
        conditions.push(gte(carePlans.createdAt, cutoff));
      }

      const whereClause = conditions.length > 0 ? drizzleAnd(...conditions) : undefined;

      const allPlans = whereClause
        ? await db.select().from(carePlans).where(whereClause)
        : await db.select().from(carePlans);

      const statusCounts: Record<string, number> = {};
      for (const status of ["draft", "pending_review", "interpreter_review", "interpreter_approved", "approved", "sent", "completed"]) {
        statusCounts[status] = 0;
      }
      let simplified = 0;
      let translated = 0;
      let sentToPatient = 0;

      const sentOrCompletedPlanIds: string[] = [];
      const allPlanIds: string[] = [];

      for (const plan of allPlans) {
        statusCounts[plan.status] = (statusCounts[plan.status] || 0) + 1;
        if (plan.simplifiedDiagnosis) simplified++;
        if (plan.translatedLanguage) translated++;
        if (plan.status === "sent" || plan.status === "completed") {
          sentToPatient++;
          sentOrCompletedPlanIds.push(plan.id);
        }
        allPlanIds.push(plan.id);
      }

      let allCheckIns: Array<{
        id: string;
        carePlanId: string;
        patientId: string;
        response: string | null;
        respondedAt: Date | null;
        scheduledFor: Date;
      }> = [];

      if (allPlanIds.length > 0) {
        allCheckIns = await db.select({
          id: checkIns.id,
          carePlanId: checkIns.carePlanId,
          patientId: checkIns.patientId,
          response: checkIns.response,
          respondedAt: checkIns.respondedAt,
          scheduledFor: checkIns.scheduledFor,
        }).from(checkIns).where(inArray(checkIns.carePlanId, allPlanIds));
      }

      const totalCheckIns = allCheckIns.length;
      const respondedCheckIns = allCheckIns.filter(c => c.respondedAt !== null);
      const responded = respondedCheckIns.length;
      const responseRate = totalCheckIns > 0 ? Math.round((responded / totalCheckIns) * 100) : 0;
      const green = respondedCheckIns.filter(c => c.response === "green").length;
      const yellow = respondedCheckIns.filter(c => c.response === "yellow").length;
      const red = respondedCheckIns.filter(c => c.response === "red").length;

      const sentPlans = allPlans.filter(p => p.status === "sent" || p.status === "completed");
      const uniquePatientsSent = new Set(sentPlans.map(p => p.patientId).filter(Boolean));
      const totalPatientsSent = uniquePatientsSent.size;

      const checkInsByPatient = new Map<string, typeof allCheckIns>();
      for (const ci of allCheckIns) {
        if (!ci.patientId) continue;
        if (!checkInsByPatient.has(ci.patientId)) {
          checkInsByPatient.set(ci.patientId, []);
        }
        checkInsByPatient.get(ci.patientId)!.push(ci);
      }

      let eligible99495 = 0;
      let eligible99496 = 0;
      let contactWithin2Days = 0;
      let missingDischargeDate = 0;

      const planMap = new Map(allPlans.map(p => [p.id, p]));

      for (const patientId of Array.from(uniquePatientsSent)) {
        const patientCheckIns = checkInsByPatient.get(patientId!) || [];
        const respondedCIs = patientCheckIns.filter(c => c.respondedAt !== null);
        const patientSentPlans = sentPlans.filter(p => p.patientId === patientId);

        let hasContactWithin2Days = false;
        let hasResponseWithin7Days = false;
        let hasResponseWithin14Days = false;

        for (const plan of patientSentPlans) {
          if (!plan.dischargeDate) {
            missingDischargeDate++;
            continue;
          }
          const dischargeTime = new Date(plan.dischargeDate).getTime();
          const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
          const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
          const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

          const carePlanSentTime = (plan.status === "sent" || plan.status === "completed")
            ? new Date(plan.updatedAt).getTime() : null;
          if (carePlanSentTime) {
            const diff = carePlanSentTime - dischargeTime;
            if (diff >= 0 && diff <= TWO_DAYS_MS) hasContactWithin2Days = true;
          }

          for (const ci of respondedCIs) {
            if (ci.carePlanId !== plan.id) continue;
            const respondedTime = new Date(ci.respondedAt!).getTime();
            const diff = respondedTime - dischargeTime;
            if (diff >= 0 && diff <= SEVEN_DAYS_MS) hasResponseWithin7Days = true;
            if (diff >= 0 && diff <= FOURTEEN_DAYS_MS) hasResponseWithin14Days = true;
          }
        }

        if (hasContactWithin2Days) {
          contactWithin2Days++;
          if (hasResponseWithin14Days) {
            eligible99495++;
          }
          if (hasResponseWithin7Days) {
            eligible99496++;
          }
        }
      }

      const now = new Date();
      const staleDraftThresholdMs = 48 * 60 * 60 * 1000;
      const staleReviewThresholdMs = 72 * 60 * 60 * 1000;
      const staleCarePlansFiltered = allPlans.filter(plan => {
        const age = now.getTime() - new Date(plan.createdAt).getTime();
        if (plan.status === "draft" && age > staleDraftThresholdMs) return true;
        if (plan.status === "pending_review" && age > staleReviewThresholdMs) return true;
        if (plan.status === "approved" && age > staleReviewThresholdMs) return true;
        return false;
      });

      // Fetch patient names for stale care plans
      const stalePatientIds = staleCarePlansFiltered.map(p => p.patientId).filter((id): id is string => id !== null);
      let patientNameMap = new Map<string, string>();
      if (stalePatientIds.length > 0) {
        const stalePatients = await db.select({ id: patients.id, name: patients.name }).from(patients).where(inArray(patients.id, stalePatientIds));
        patientNameMap = new Map(stalePatients.map(p => [p.id, p.name]));
      }

      const staleCarePlans = staleCarePlansFiltered.map(plan => ({
        id: plan.id,
        patientId: plan.patientId,
        patientName: (plan.patientId && patientNameMap.get(plan.patientId)) || 'Unknown',
        diagnosis: plan.diagnosis || null,
        status: plan.status,
        createdAt: plan.createdAt,
        ageHours: Math.round((now.getTime() - new Date(plan.createdAt).getTime()) / (60 * 60 * 1000)),
      }));

      if (userRole === "interpreter") {
        const interpreterStatusCounts: Record<string, number> = {
          interpreter_review: statusCounts["interpreter_review"] || 0,
          interpreter_approved: statusCounts["interpreter_approved"] || 0,
        };
        res.json({
          userRole,
          statusCounts: interpreterStatusCounts,
          pipeline: {
            uploaded: 0,
            simplified: 0,
            translated,
            sentToPatient: 0,
          },
          checkIns: null,
          tcm: null,
          staleCarePlans: [],
          interpreterMetrics: {
            pendingReview: statusCounts["interpreter_review"] || 0,
            approved: statusCounts["interpreter_approved"] || 0,
          },
        });
        return;
      }

      if (userRole === "clinician") {
        const clinicianPlans = allPlans.filter(p => p.clinicianId === req.session.userId);
        const clinicianStatusCounts: Record<string, number> = {};
        for (const status of ["draft", "pending_review", "interpreter_review", "interpreter_approved", "approved", "sent", "completed"]) {
          clinicianStatusCounts[status] = 0;
        }
        let clinicianSimplified = 0;
        let clinicianTranslated = 0;
        let clinicianSentToPatient = 0;
        const clinicianPlanIds: string[] = [];

        for (const plan of clinicianPlans) {
          clinicianStatusCounts[plan.status] = (clinicianStatusCounts[plan.status] || 0) + 1;
          if (plan.simplifiedDiagnosis) clinicianSimplified++;
          if (plan.translatedLanguage) clinicianTranslated++;
          if (plan.status === "sent" || plan.status === "completed") clinicianSentToPatient++;
          clinicianPlanIds.push(plan.id);
        }

        const clinicianCheckIns = allCheckIns.filter(c => clinicianPlanIds.includes(c.carePlanId));
        const clinicianTotalCheckIns = clinicianCheckIns.length;
        const clinicianRespondedCheckIns = clinicianCheckIns.filter(c => c.respondedAt !== null);
        const clinicianResponded = clinicianRespondedCheckIns.length;
        const clinicianResponseRate = clinicianTotalCheckIns > 0 ? Math.round((clinicianResponded / clinicianTotalCheckIns) * 100) : 0;
        const clinicianGreen = clinicianRespondedCheckIns.filter(c => c.response === "green").length;
        const clinicianYellow = clinicianRespondedCheckIns.filter(c => c.response === "yellow").length;
        const clinicianRed = clinicianRespondedCheckIns.filter(c => c.response === "red").length;

        const clinicianStale = staleCarePlans.filter(sp => clinicianPlanIds.includes(sp.id));

        res.json({
          userRole,
          statusCounts: clinicianStatusCounts,
          pipeline: {
            uploaded: clinicianPlans.length,
            simplified: clinicianSimplified,
            translated: clinicianTranslated,
            sentToPatient: clinicianSentToPatient,
          },
          checkIns: {
            total: clinicianTotalCheckIns,
            responded: clinicianResponded,
            responseRate: clinicianResponseRate,
            green: clinicianGreen,
            yellow: clinicianYellow,
            red: clinicianRed,
          },
          tcm: null,
          staleCarePlans: clinicianStale,
        });
        return;
      }

      res.json({
        userRole,
        statusCounts,
        pipeline: {
          uploaded: allPlans.length,
          simplified,
          translated,
          sentToPatient,
        },
        checkIns: {
          total: totalCheckIns,
          responded,
          responseRate,
          green,
          yellow,
          red,
        },
        tcm: {
          totalPatientsSent,
          eligible99495,
          eligible99496,
          contactWithin2Days,
          missingDischargeDate,
        },
        staleCarePlans,
      });
    } catch (error) {
      console.error("Analytics error:", error);
      res.status(500).json({ error: "Failed to compute analytics" });
    }
  });

  // ============= Check-in Email Scheduler Endpoint =============
  // This endpoint can be called by a cron job or external scheduler
  // Protected by a shared secret to prevent unauthorized access
  app.post("/api/internal/send-pending-check-ins", async (req: Request, res: Response) => {
    try {
      const internalSecret = process.env.INTERNAL_API_SECRET;
      if (!internalSecret) {
        return res.status(503).json({ error: "Internal API not configured" });
      }
      const authHeader = req.headers.authorization;
      if (!authHeader || authHeader !== `Bearer ${internalSecret}`) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const pendingCheckIns = await storage.getPendingCheckIns();
      let sentCount = 0;

      for (const checkIn of pendingCheckIns) {
        const carePlan = await storage.getCarePlan(checkIn.carePlanId);
        if (!carePlan || !carePlan.accessToken) continue;

        const patient = checkIn.patientId ? await storage.getPatient(checkIn.patientId) : null;
        if (!patient) continue;

        // [M1.5] APP_URL takes priority; fallback to Replit dev domain, then localhost
        const baseUrl = process.env.APP_URL
          || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "http://localhost:5000");
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

  // Email diagnostic endpoint — checks if email service is configured and reachable
  app.get("/api/admin/email-diagnostics", requireAdminAuth, async (req: Request, res: Response) => {

    const diagnostics: any = {
      timestamp: new Date().toISOString(),
      hasDirectApiKey: !!process.env.RESEND_API_KEY,
      hasReplitConnector: !!(process.env.REPLIT_CONNECTORS_HOSTNAME),
      fromEmail: process.env.RESEND_FROM_EMAIL || null,
      appUrl: process.env.APP_URL || null,
      clientReady: false,
      testResult: null,
    };

    try {
      const resendData = await getUncachableResendClient();
      diagnostics.clientReady = !!resendData;
      diagnostics.resolvedFromEmail = resendData.fromEmail;
      diagnostics.testResult = "Email client initialized successfully";

      const testTo = req.query.sendTestTo as string | undefined;
      if (testTo && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testTo)) {
        console.log(`[Resend] Admin ${user?.name} sending test email to ${testTo}`);
        const sendResult = await resendData.client.emails.send({
          from: resendData.fromEmail,
          to: testTo,
          subject: "Litera Health - Email Verification Test",
          html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #1E78FF;">Litera Health Email Test</h2>
            <p>This is a verification email from <strong>Litera Health</strong> confirming that your email delivery is working correctly.</p>
            <p style="color: #666; font-size: 14px;">Sent from: ${resendData.fromEmail}</p>
            <p style="color: #666; font-size: 14px;">Timestamp: ${new Date().toISOString()}</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
            <p style="color: #999; font-size: 12px;">This is an automated test email from Litera Health (literahealth.tech).</p>
          </div>`,
        });
        diagnostics.sendTestResult = sendResult;
        diagnostics.sentTo = testTo;
      }
    } catch (error: any) {
      diagnostics.testResult = `Client init failed: ${error.message}`;
    }

    res.json(diagnostics);
  });

  return httpServer;
}
