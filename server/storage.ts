import { 
  users, patients, carePlans, checkIns, auditLogs, tenants, chatMessages,
  type User, type InsertUser,
  type Patient, type InsertPatient,
  type CarePlan, type InsertCarePlan,
  type CheckIn, type InsertCheckIn,
  type AuditLog, type InsertAuditLog,
  type Tenant, type InsertTenant,
  type ChatMessage, type InsertChatMessage,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, lte, isNull, inArray, sql } from "drizzle-orm";
import { randomBytes } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserPassword(id: string, hashedPassword: string): Promise<void>;
  
  getPatient(id: string): Promise<Patient | undefined>;
  getPatientByEmail(email: string, tenantId?: string): Promise<Patient | undefined>;
  findPatientByName(name: string, tenantId?: string): Promise<Patient | undefined>;
  getAllPatients(tenantId?: string): Promise<Patient[]>;
  createPatient(patient: InsertPatient): Promise<Patient>;
  updatePatient(id: string, data: Partial<Patient>): Promise<Patient | undefined>;
  updatePatientPassword(id: string, hashedPassword: string): Promise<void>;
  deletePatient(id: string): Promise<boolean>;
  getCarePlansByPatientId(patientId: string, tenantId?: string): Promise<CarePlan[]>;
  
  getCarePlan(id: string): Promise<CarePlan | undefined>;
  getCarePlanByToken(token: string): Promise<CarePlan | undefined>;
  getCarePlansByClinicianId(clinicianId: string, tenantId?: string): Promise<CarePlan[]>;
  getAllCarePlans(tenantId?: string): Promise<CarePlan[]>;
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
  
  getAlerts(tenantId?: string): Promise<Array<{
    id: string;
    carePlanId: string;
    patientName: string;
    response: "yellow" | "red";
    respondedAt: Date;
    resolved: boolean;
    resolvedAt?: Date | null;
  }>>;
  resolveAlert(checkInId: string, resolvedBy: string): Promise<void>;
  clearAllData(): Promise<void>;
  
  getAllUsers(tenantId?: string): Promise<User[]>;
  updateUser(id: string, data: Partial<Pick<User, 'name' | 'role' | 'tenantId' | 'languages'>>): Promise<User | undefined>;
  deleteUser(id: string): Promise<boolean>;
  
  getAllTenants(): Promise<Tenant[]>;
  getTenant(id: string): Promise<Tenant | undefined>;
  createTenant(tenant: InsertTenant): Promise<Tenant>;
  updateTenant(id: string, data: Partial<Tenant>): Promise<Tenant | undefined>;
  
  getChatMessages(carePlanId: string, patientId: string): Promise<ChatMessage[]>;
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;
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
  
  async updateUserPassword(id: string, hashedPassword: string): Promise<void> {
    await db.update(users).set({ password: hashedPassword }).where(eq(users.id, id));
  }

  async getPatient(id: string): Promise<Patient | undefined> {
    const [patient] = await db.select().from(patients).where(eq(patients.id, id));
    return patient || undefined;
  }

  async getPatientByEmail(email: string, tenantId?: string): Promise<Patient | undefined> {
    if (tenantId) {
      const [patient] = await db.select().from(patients).where(
        and(eq(patients.email, email), eq(patients.tenantId, tenantId))
      );
      return patient || undefined;
    }
    const [patient] = await db.select().from(patients).where(eq(patients.email, email));
    return patient || undefined;
  }

  async findPatientByName(name: string, tenantId?: string): Promise<Patient | undefined> {
    // Case-insensitive search for patient by name using DB query (scalable)
    const normalizedName = name.toLowerCase().trim();
    if (tenantId) {
      const [patient] = await db.select().from(patients)
        .where(and(
          sql`lower(trim(${patients.name})) = ${normalizedName}`,
          eq(patients.tenantId, tenantId)
        ));
      return patient || undefined;
    }
    const [patient] = await db.select().from(patients)
      .where(sql`lower(trim(${patients.name})) = ${normalizedName}`);
    return patient || undefined;
  }

  async getAllPatients(tenantId?: string): Promise<Patient[]> {
    if (tenantId) {
      return await db.select().from(patients)
        .where(eq(patients.tenantId, tenantId))
        .orderBy(desc(patients.createdAt));
    }
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
  
  async updatePatientPassword(id: string, hashedPassword: string): Promise<void> {
    await db.update(patients).set({ password: hashedPassword }).where(eq(patients.id, id));
  }

  async deletePatient(id: string): Promise<boolean> {
    const result = await db.delete(patients).where(eq(patients.id, id)).returning();
    return result.length > 0;
  }

  async getCarePlansByPatientId(patientId: string, tenantId?: string): Promise<CarePlan[]> {
    const conditions = tenantId
      ? and(eq(carePlans.patientId, patientId), eq(carePlans.tenantId, tenantId))
      : eq(carePlans.patientId, patientId);
    return await db.select().from(carePlans)
      .where(conditions)
      .orderBy(desc(carePlans.createdAt));
  }

  async getCarePlan(id: string): Promise<CarePlan | undefined> {
    const [carePlan] = await db.select().from(carePlans).where(eq(carePlans.id, id));
    return carePlan || undefined;
  }

  async getCarePlanByToken(token: string): Promise<CarePlan | undefined> {
    const [carePlan] = await db.select().from(carePlans).where(eq(carePlans.accessToken, token));
    return carePlan || undefined;
  }

  async getCarePlansByClinicianId(clinicianId: string, tenantId?: string): Promise<CarePlan[]> {
    if (tenantId) {
      return await db.select().from(carePlans)
        .where(and(eq(carePlans.clinicianId, clinicianId), eq(carePlans.tenantId, tenantId)))
        .orderBy(desc(carePlans.createdAt));
    }
    return await db.select().from(carePlans).where(eq(carePlans.clinicianId, clinicianId)).orderBy(desc(carePlans.createdAt));
  }

  async getAllCarePlans(tenantId?: string): Promise<CarePlan[]> {
    if (tenantId) {
      return await db.select().from(carePlans)
        .where(eq(carePlans.tenantId, tenantId))
        .orderBy(desc(carePlans.createdAt));
    }
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
    await db.delete(chatMessages).where(eq(chatMessages.carePlanId, id));
    await db.delete(checkIns).where(eq(checkIns.carePlanId, id));
    await db.delete(auditLogs).where(eq(auditLogs.carePlanId, id));
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

  async getAlerts(tenantId?: string): Promise<Array<{
    id: string;
    carePlanId: string;
    patientName: string;
    response: "yellow" | "red";
    respondedAt: Date;
    resolved: boolean;
    resolvedAt?: Date | null;
  }>> {
    const allAlertCheckIns = await db.select().from(checkIns).where(
      inArray(checkIns.response, ["yellow", "red"])
    );

    if (allAlertCheckIns.length === 0) return [];

    // Batch-fetch all referenced care plans, then filter by tenant
    const carePlanIds = Array.from(new Set(allAlertCheckIns.map(c => c.carePlanId)));
    const carePlanRows = await db.select().from(carePlans).where(inArray(carePlans.id, carePlanIds));
    const carePlanMap = new Map(carePlanRows.map(cp => [cp.id, cp]));

    const filtered = allAlertCheckIns.filter(c => {
      const cp = carePlanMap.get(c.carePlanId);
      return cp && (!tenantId || cp.tenantId === tenantId);
    });

    if (filtered.length === 0) return [];

    // Batch-fetch all referenced patients
    const patientIds = Array.from(new Set(
      filtered.map(c => carePlanMap.get(c.carePlanId)?.patientId).filter(Boolean) as string[]
    ));
    const patientRows = await db.select().from(patients).where(inArray(patients.id, patientIds));
    const patientMap = new Map(patientRows.map(p => [p.id, p]));

    const alerts = filtered.map(checkIn => {
      const cp = carePlanMap.get(checkIn.carePlanId);
      const patientName = (cp?.patientId && patientMap.get(cp.patientId)?.name) || "Unknown";
      return {
        id: checkIn.id,
        carePlanId: checkIn.carePlanId,
        patientName,
        response: checkIn.response as "yellow" | "red",
        respondedAt: checkIn.respondedAt || new Date(),
        resolved: !!checkIn.alertResolvedAt,
        resolvedAt: checkIn.alertResolvedAt,
      };
    });

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

  async clearAllData(): Promise<void> {
    await db.delete(chatMessages);
    await db.delete(auditLogs);
    await db.delete(checkIns);
    await db.delete(carePlans);
    await db.delete(patients);
    await db.delete(users);
  }

  async getAllUsers(tenantId?: string): Promise<User[]> {
    if (tenantId) {
      return db.select().from(users).where(eq(users.tenantId, tenantId)).orderBy(users.name);
    }
    return db.select().from(users).orderBy(users.name);
  }

  async updateUser(id: string, data: Partial<Pick<User, 'name' | 'role' | 'tenantId' | 'languages'>>): Promise<User | undefined> {
    const [user] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return user || undefined;
  }

  async deleteUser(id: string): Promise<boolean> {
    const result = await db.delete(users).where(eq(users.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async getAllTenants(): Promise<Tenant[]> {
    return db.select().from(tenants).orderBy(tenants.name);
  }

  async getTenant(id: string): Promise<Tenant | undefined> {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id));
    return tenant || undefined;
  }

  async createTenant(insertTenant: InsertTenant): Promise<Tenant> {
    const [tenant] = await db.insert(tenants).values(insertTenant).returning();
    return tenant;
  }

  async updateTenant(id: string, data: Partial<Tenant>): Promise<Tenant | undefined> {
    const [tenant] = await db.update(tenants).set(data).where(eq(tenants.id, id)).returning();
    return tenant || undefined;
  }

  async getChatMessages(carePlanId: string, patientId: string): Promise<ChatMessage[]> {
    return await db.select().from(chatMessages)
      .where(and(eq(chatMessages.carePlanId, carePlanId), eq(chatMessages.patientId, patientId)))
      .orderBy(chatMessages.createdAt);
  }

  async createChatMessage(message: InsertChatMessage): Promise<ChatMessage> {
    const [msg] = await db.insert(chatMessages).values(message).returning();
    return msg;
  }
}

export const storage = new DatabaseStorage();

export function generateAccessToken(): string {
  return randomBytes(32).toString("hex");
}
