import { 
  users, patients, carePlans, checkIns, auditLogs,
  type User, type InsertUser,
  type Patient, type InsertPatient,
  type CarePlan, type InsertCarePlan,
  type CheckIn, type InsertCheckIn,
  type AuditLog, type InsertAuditLog,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, lte, isNull } from "drizzle-orm";
import { randomBytes } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  getPatient(id: string): Promise<Patient | undefined>;
  getPatientByEmail(email: string): Promise<Patient | undefined>;
  getAllPatients(): Promise<Patient[]>;
  createPatient(patient: InsertPatient): Promise<Patient>;
  updatePatient(id: string, data: Partial<Patient>): Promise<Patient | undefined>;
  
  getCarePlan(id: string): Promise<CarePlan | undefined>;
  getCarePlanByToken(token: string): Promise<CarePlan | undefined>;
  getCarePlansByClinicianId(clinicianId: string): Promise<CarePlan[]>;
  getAllCarePlans(): Promise<CarePlan[]>;
  createCarePlan(carePlan: InsertCarePlan): Promise<CarePlan>;
  updateCarePlan(id: string, data: Partial<CarePlan>): Promise<CarePlan | undefined>;
  deleteCarePlan(id: string): Promise<boolean>;
  
  getCheckIn(id: string): Promise<CheckIn | undefined>;
  getCheckInsByCarePlanId(carePlanId: string): Promise<CheckIn[]>;
  getCheckInsByPatientId(patientId: string): Promise<CheckIn[]>;
  getPendingCheckIns(): Promise<CheckIn[]>;
  createCheckIn(checkIn: InsertCheckIn): Promise<CheckIn>;
  updateCheckIn(id: string, data: Partial<CheckIn>): Promise<CheckIn | undefined>;
  
  getAuditLogsByCarePlanId(carePlanId: string): Promise<AuditLog[]>;
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  
  getAlerts(): Promise<Array<{
    id: string;
    carePlanId: string;
    patientName: string;
    response: "yellow" | "red";
    respondedAt: Date;
    resolved: boolean;
  }>>;
  resolveAlert(checkInId: string, resolvedBy: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getPatient(id: string): Promise<Patient | undefined> {
    const [patient] = await db.select().from(patients).where(eq(patients.id, id));
    return patient || undefined;
  }

  async getPatientByEmail(email: string): Promise<Patient | undefined> {
    const [patient] = await db.select().from(patients).where(eq(patients.email, email));
    return patient || undefined;
  }

  async getAllPatients(): Promise<Patient[]> {
    return await db.select().from(patients).orderBy(desc(patients.createdAt));
  }

  async createPatient(insertPatient: InsertPatient): Promise<Patient> {
    const [patient] = await db.insert(patients).values(insertPatient).returning();
    return patient;
  }

  async updatePatient(id: string, data: Partial<Patient>): Promise<Patient | undefined> {
    const [patient] = await db.update(patients).set(data).where(eq(patients.id, id)).returning();
    return patient || undefined;
  }

  async getCarePlan(id: string): Promise<CarePlan | undefined> {
    const [carePlan] = await db.select().from(carePlans).where(eq(carePlans.id, id));
    return carePlan || undefined;
  }

  async getCarePlanByToken(token: string): Promise<CarePlan | undefined> {
    const [carePlan] = await db.select().from(carePlans).where(eq(carePlans.accessToken, token));
    return carePlan || undefined;
  }

  async getCarePlansByClinicianId(clinicianId: string): Promise<CarePlan[]> {
    return await db.select().from(carePlans).where(eq(carePlans.clinicianId, clinicianId)).orderBy(desc(carePlans.createdAt));
  }

  async getAllCarePlans(): Promise<CarePlan[]> {
    return await db.select().from(carePlans).orderBy(desc(carePlans.createdAt));
  }

  async createCarePlan(insertCarePlan: InsertCarePlan): Promise<CarePlan> {
    const [carePlan] = await db.insert(carePlans).values(insertCarePlan).returning();
    return carePlan;
  }

  async updateCarePlan(id: string, data: Partial<CarePlan>): Promise<CarePlan | undefined> {
    const [carePlan] = await db.update(carePlans).set({ ...data, updatedAt: new Date() }).where(eq(carePlans.id, id)).returning();
    return carePlan || undefined;
  }

  async deleteCarePlan(id: string): Promise<boolean> {
    // First delete related check-ins and audit logs
    await db.delete(checkIns).where(eq(checkIns.carePlanId, id));
    await db.delete(auditLogs).where(eq(auditLogs.carePlanId, id));
    // Then delete the care plan
    const result = await db.delete(carePlans).where(eq(carePlans.id, id)).returning();
    return result.length > 0;
  }

  async getCheckIn(id: string): Promise<CheckIn | undefined> {
    const [checkIn] = await db.select().from(checkIns).where(eq(checkIns.id, id));
    return checkIn || undefined;
  }

  async getCheckInsByCarePlanId(carePlanId: string): Promise<CheckIn[]> {
    return await db.select().from(checkIns).where(eq(checkIns.carePlanId, carePlanId));
  }

  async getCheckInsByPatientId(patientId: string): Promise<CheckIn[]> {
    return await db.select().from(checkIns).where(eq(checkIns.patientId, patientId));
  }

  async getPendingCheckIns(): Promise<CheckIn[]> {
    const now = new Date();
    return await db.select().from(checkIns).where(
      and(
        isNull(checkIns.respondedAt),
        lte(checkIns.scheduledFor, now),
        isNull(checkIns.sentAt)
      )
    );
  }

  async createCheckIn(insertCheckIn: InsertCheckIn): Promise<CheckIn> {
    const [checkIn] = await db.insert(checkIns).values(insertCheckIn).returning();
    return checkIn;
  }

  async updateCheckIn(id: string, data: Partial<CheckIn>): Promise<CheckIn | undefined> {
    const [checkIn] = await db.update(checkIns).set(data).where(eq(checkIns.id, id)).returning();
    return checkIn || undefined;
  }

  async getAuditLogsByCarePlanId(carePlanId: string): Promise<AuditLog[]> {
    return await db.select().from(auditLogs).where(eq(auditLogs.carePlanId, carePlanId)).orderBy(auditLogs.createdAt);
  }

  async createAuditLog(insertLog: InsertAuditLog): Promise<AuditLog> {
    const [log] = await db.insert(auditLogs).values(insertLog).returning();
    return log;
  }

  async getAlerts(): Promise<Array<{
    id: string;
    carePlanId: string;
    patientName: string;
    response: "yellow" | "red";
    respondedAt: Date;
    resolved: boolean;
  }>> {
    const alertCheckIns = await db.select().from(checkIns).where(
      and(
        eq(checkIns.response, "yellow"),
      )
    );
    
    const redCheckIns = await db.select().from(checkIns).where(
      eq(checkIns.response, "red")
    );

    const allAlertCheckIns = [...alertCheckIns, ...redCheckIns];
    
    const alerts = [];
    for (const checkIn of allAlertCheckIns) {
      const [carePlan] = await db.select().from(carePlans).where(eq(carePlans.id, checkIn.carePlanId));
      let patientName = "Unknown";
      if (carePlan?.patientId) {
        const [patient] = await db.select().from(patients).where(eq(patients.id, carePlan.patientId));
        if (patient) patientName = patient.name;
      }
      
      alerts.push({
        id: checkIn.id,
        carePlanId: checkIn.carePlanId,
        patientName,
        response: checkIn.response as "yellow" | "red",
        respondedAt: checkIn.respondedAt || new Date(),
        resolved: !!checkIn.alertResolvedAt,
      });
    }

    return alerts.sort((a, b) => 
      new Date(b.respondedAt).getTime() - new Date(a.respondedAt).getTime()
    );
  }

  async resolveAlert(checkInId: string, resolvedBy: string): Promise<void> {
    await db.update(checkIns).set({
      alertResolvedAt: new Date(),
      alertResolvedBy: resolvedBy,
    }).where(eq(checkIns.id, checkInId));
  }
}

export const storage = new DatabaseStorage();

export function generateAccessToken(): string {
  return randomBytes(32).toString("hex");
}
