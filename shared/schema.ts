import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table (clinicians and admins)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("clinician"), // clinician, admin
  name: text("name").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  role: true,
  name: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Patients table
export const patients = pgTable("patients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  yearOfBirth: integer("year_of_birth").notNull(),
  preferredLanguage: text("preferred_language").notNull().default("en"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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
  
  // Status workflow: draft -> pending_review -> approved -> sent -> completed
  status: text("status").notNull().default("draft"),
  
  // Original content (from PDF/image upload)
  originalContent: text("original_content"),
  originalFileName: text("original_file_name"),
  
  // Structured extracted content
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

export interface SimplifiedMedication {
  name: string;
  dose: string;
  frequency: string;
  instructions: string;
}

// Appointment type
export interface Appointment {
  date: string;
  time: string;
  provider: string;
  location: string;
  purpose: string;
}

export interface SimplifiedAppointment {
  date: string;
  time: string;
  provider: string;
  location: string;
  purpose: string;
}

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

// Supported languages for translation
export const SUPPORTED_LANGUAGES = [
  { code: "en", name: "English" },
  { code: "es", name: "Spanish" },
  { code: "zh", name: "Chinese (Simplified)" },
  { code: "vi", name: "Vietnamese" },
  { code: "tl", name: "Tagalog" },
  { code: "ko", name: "Korean" },
  { code: "ru", name: "Russian" },
  { code: "ar", name: "Arabic" },
  { code: "fr", name: "French" },
  { code: "pt", name: "Portuguese" },
  { code: "hi", name: "Hindi" },
  { code: "ur", name: "Urdu" },
  { code: "fa", name: "Farsi" },
  { code: "pl", name: "Polish" },
  { code: "ht", name: "Haitian Creole" },
  { code: "ja", name: "Japanese" },
] as const;

export type LanguageCode = typeof SUPPORTED_LANGUAGES[number]["code"];
