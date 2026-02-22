import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Sessions table for connect-pg-simple
export const sessions = pgTable("session", {
  sid: varchar("sid").primaryKey(),
  sess: jsonb("sess").notNull(),
  expire: timestamp("expire", { precision: 6 }).notNull(),
});

// Tenants table (clinics/organizations for multi-tenancy)
export const tenants = pgTable("tenants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  isDemo: boolean("is_demo").notNull().default(false),
  interpreterReviewMode: text("interpreter_review_mode").notNull().default("required"), // required | optional
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTenantSchema = createInsertSchema(tenants).omit({
  id: true,
  createdAt: true,
});

export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type Tenant = typeof tenants.$inferSelect;

// Users table (clinicians, interpreters, admins)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("clinician"), // Primary role: clinician, interpreter, admin, super_admin
  roles: text("roles").array().notNull().default(sql`ARRAY[]::text[]`), // All assigned roles for multi-role access
  name: text("name").notNull(),
  languages: text("languages").array(), // Language codes interpreter specializes in (e.g., ["es", "fr"])
  tenantId: varchar("tenant_id").references(() => tenants.id),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  role: true,
  roles: true,
  name: true,
  languages: true,
  tenantId: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Patients table
export const patients = pgTable("patients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  lastName: text("last_name"),
  email: text("email").notNull(),
  phone: text("phone"),
  yearOfBirth: integer("year_of_birth").notNull(),
  pin: text("pin"),  // bcrypt hash stored here; original length-4 constraint removed
  password: text("password"),
  preferredLanguage: text("preferred_language").notNull().default("en"),
  isTestPatient: boolean("is_test_patient").notNull().default(false),
  tenantId: varchar("tenant_id").references(() => tenants.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("patients_email_tenant_idx").on(table.email, table.tenantId),
]);

export const insertPatientSchema = createInsertSchema(patients).omit({
  id: true,
  createdAt: true,
});

export type InsertPatient = z.infer<typeof insertPatientSchema>;
export type Patient = typeof patients.$inferSelect;

// Care Plans - the core document
export const carePlans = pgTable("care_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  patientId: varchar("patient_id").references(() => patients.id),
  clinicianId: varchar("clinician_id").references(() => users.id),
  tenantId: varchar("tenant_id").references(() => tenants.id), // Tenant isolation
  
  // Status workflow: draft -> pending_review -> [interpreter_review -> interpreter_approved ->] approved -> sent -> completed
  // English care plans skip interpreter_review/interpreter_approved (no translation to verify)
  status: text("status").notNull().default("draft"),
  
  // Original content (from PDF/image upload)
  originalContent: text("original_content"),
  originalFileName: text("original_file_name"),
  originalFileData: text("original_file_data"), // Base64-encoded PDF binary data
  
  // Structured extracted content
  extractedPatientName: text("extracted_patient_name"),
  diagnosis: text("diagnosis"),
  medications: jsonb("medications").$type<Medication[]>(),
  appointments: jsonb("appointments").$type<Appointment[]>(),
  instructions: text("instructions"),
  warnings: text("warnings"),
  
  // Simplified content (5th grade reading level)
  simplifiedDiagnosis: text("simplified_diagnosis"),
  simplifiedMedications: jsonb("simplified_medications").$type<SimplifiedMedication[]>(),
  simplifiedAppointments: jsonb("simplified_appointments").$type<SimplifiedAppointment[]>(),
  simplifiedInstructions: text("simplified_instructions"),
  simplifiedWarnings: text("simplified_warnings"),
  
  // Translated content
  translatedLanguage: text("translated_language"),
  translatedDiagnosis: text("translated_diagnosis"),
  translatedMedications: jsonb("translated_medications").$type<SimplifiedMedication[]>(),
  translatedAppointments: jsonb("translated_appointments").$type<SimplifiedAppointment[]>(),
  translatedInstructions: text("translated_instructions"),
  translatedWarnings: text("translated_warnings"),
  
  // Back-translation for verification
  backTranslatedDiagnosis: text("back_translated_diagnosis"),
  backTranslatedInstructions: text("back_translated_instructions"),
  backTranslatedWarnings: text("back_translated_warnings"),
  
  // Magic link for patient access
  accessToken: varchar("access_token", { length: 64 }),
  accessTokenExpiry: timestamp("access_token_expiry"),
  
  // Interpreter review tracking
  interpreterReviewedBy: varchar("interpreter_reviewed_by").references(() => users.id),
  interpreterReviewedAt: timestamp("interpreter_reviewed_at"),
  interpreterNotes: text("interpreter_notes"),
  
  readingLevel: integer("reading_level").notNull().default(5),

  // Approval tracking
  approvedBy: varchar("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  
  // Discharge date for TCM tracking
  dischargeDate: timestamp("discharge_date"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Medication type
export interface Medication {
  name: string;
  dose: string;
  frequency: string;
  instructions: string;
}

export type SimplifiedMedication = Medication;

// Appointment type
export interface Appointment {
  date: string;
  time: string;
  provider: string;
  location: string;
  purpose: string;
  phone?: string;
  schedulingInstructions?: string;
  itemsToBring?: string;
}

export type SimplifiedAppointment = Appointment;

export const insertCarePlanSchema = createInsertSchema(carePlans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCarePlan = z.infer<typeof insertCarePlanSchema>;
export type CarePlan = typeof carePlans.$inferSelect;

// Check-ins for TCM compliance (traffic light system)
export const checkIns = pgTable("check_ins", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  carePlanId: varchar("care_plan_id").references(() => carePlans.id).notNull(),
  patientId: varchar("patient_id").references(() => patients.id).notNull(),
  
  // Scheduling
  scheduledFor: timestamp("scheduled_for").notNull(),
  sentAt: timestamp("sent_at"),
  attemptNumber: integer("attempt_number").notNull().default(1),
  
  // Response
  response: text("response"), // green, yellow, red
  respondedAt: timestamp("responded_at"),
  responseNotes: text("response_notes"),
  
  // Alert tracking
  alertCreated: boolean("alert_created").default(false),
  alertResolvedAt: timestamp("alert_resolved_at"),
  alertResolvedBy: varchar("alert_resolved_by").references(() => users.id),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCheckInSchema = createInsertSchema(checkIns).omit({
  id: true,
  createdAt: true,
});

export type InsertCheckIn = z.infer<typeof insertCheckInSchema>;
export type CheckIn = typeof checkIns.$inferSelect;

// Audit log for compliance
export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  carePlanId: varchar("care_plan_id").references(() => carePlans.id),
  userId: varchar("user_id").references(() => users.id),
  action: text("action").notNull(), // created, uploaded, simplified, translated, approved, sent, viewed, check_in_sent, check_in_responded
  details: jsonb("details"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({
  id: true,
  createdAt: true,
});

export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;

// Team invitations
export const teamInvitations = pgTable("team_invitations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull(),
  role: text("role").notNull().default("clinician"),
  tenantId: varchar("tenant_id").references(() => tenants.id),
  invitedBy: varchar("invited_by").references(() => users.id),
  token: text("token").notNull().unique(),
  status: text("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTeamInvitationSchema = createInsertSchema(teamInvitations).omit({
  id: true,
  createdAt: true,
});

export type InsertTeamInvitation = z.infer<typeof insertTeamInvitationSchema>;
export type TeamInvitation = typeof teamInvitations.$inferSelect;

// Supported languages for translation (GPT-4 supports 100+ languages)
export const SUPPORTED_LANGUAGES = [
  { code: "am", name: "Amharic" },
  { code: "ar", name: "Arabic" },
  { code: "bn", name: "Bengali" },
  { code: "bg", name: "Bulgarian" },
  { code: "my", name: "Burmese" },
  { code: "zh", name: "Chinese (Simplified)" },
  { code: "zh-TW", name: "Chinese (Traditional)" },
  { code: "hr", name: "Croatian" },
  { code: "cs", name: "Czech" },
  { code: "nl", name: "Dutch" },
  { code: "en", name: "English" },
  { code: "fa", name: "Farsi" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "el", name: "Greek" },
  { code: "gu", name: "Gujarati" },
  { code: "ht", name: "Haitian Creole" },
  { code: "he", name: "Hebrew" },
  { code: "hi", name: "Hindi" },
  { code: "hu", name: "Hungarian" },
  { code: "ig", name: "Igbo" },
  { code: "id", name: "Indonesian" },
  { code: "it", name: "Italian" },
  { code: "ja", name: "Japanese" },
  { code: "km", name: "Khmer (Cambodian)" },
  { code: "ko", name: "Korean" },
  { code: "lo", name: "Lao" },
  { code: "ms", name: "Malay" },
  { code: "mr", name: "Marathi" },
  { code: "ne", name: "Nepali" },
  { code: "pl", name: "Polish" },
  { code: "pt", name: "Portuguese" },
  { code: "pa", name: "Punjabi" },
  { code: "ro", name: "Romanian" },
  { code: "ru", name: "Russian" },
  { code: "sr", name: "Serbian" },
  { code: "sk", name: "Slovak" },
  { code: "so", name: "Somali" },
  { code: "es", name: "Spanish" },
  { code: "sw", name: "Swahili" },
  { code: "tl", name: "Tagalog" },
  { code: "ta", name: "Tamil" },
  { code: "te", name: "Telugu" },
  { code: "th", name: "Thai" },
  { code: "tr", name: "Turkish" },
  { code: "uk", name: "Ukrainian" },
  { code: "ur", name: "Urdu" },
  { code: "vi", name: "Vietnamese" },
  { code: "yo", name: "Yoruba" },
] as const;

export type LanguageCode = typeof SUPPORTED_LANGUAGES[number]["code"];

// Chat messages for patient portal AI assistant (RAG-based)
export const chatMessages = pgTable("chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  carePlanId: varchar("care_plan_id").references(() => carePlans.id).notNull(),
  patientId: varchar("patient_id").references(() => patients.id).notNull(),
  role: text("role").notNull(), // user | assistant
  content: text("content").notNull(),
  language: text("language").notNull().default("en"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({
  id: true,
  createdAt: true,
});

export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;
