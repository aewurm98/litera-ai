import { 
  type User, type InsertUser,
  type Patient, type InsertPatient,
  type CarePlan, type InsertCarePlan,
  type CheckIn, type InsertCheckIn,
  type AuditLog, type InsertAuditLog,
  type Medication, type Appointment, type SimplifiedMedication, type SimplifiedAppointment
} from "@shared/schema";
import { randomUUID } from "crypto";
import { randomBytes } from "crypto";

// Storage interface for all entities
export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Patients
  getPatient(id: string): Promise<Patient | undefined>;
  getPatientByEmail(email: string): Promise<Patient | undefined>;
  createPatient(patient: InsertPatient): Promise<Patient>;
  updatePatient(id: string, data: Partial<Patient>): Promise<Patient | undefined>;
  
  // Care Plans
  getCarePlan(id: string): Promise<CarePlan | undefined>;
  getCarePlanByToken(token: string): Promise<CarePlan | undefined>;
  getCarePlansByClinicianId(clinicianId: string): Promise<CarePlan[]>;
  getAllCarePlans(): Promise<CarePlan[]>;
  createCarePlan(carePlan: InsertCarePlan): Promise<CarePlan>;
  updateCarePlan(id: string, data: Partial<CarePlan>): Promise<CarePlan | undefined>;
  
  // Check-ins
  getCheckIn(id: string): Promise<CheckIn | undefined>;
  getCheckInsByCarePlanId(carePlanId: string): Promise<CheckIn[]>;
  getCheckInsByPatientId(patientId: string): Promise<CheckIn[]>;
  getPendingCheckIns(): Promise<CheckIn[]>;
  createCheckIn(checkIn: InsertCheckIn): Promise<CheckIn>;
  updateCheckIn(id: string, data: Partial<CheckIn>): Promise<CheckIn | undefined>;
  
  // Audit Logs
  getAuditLogsByCarePlanId(carePlanId: string): Promise<AuditLog[]>;
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  
  // Alerts (derived from check-ins)
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

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private patients: Map<string, Patient>;
  private carePlans: Map<string, CarePlan>;
  private checkIns: Map<string, CheckIn>;
  private auditLogs: Map<string, AuditLog>;

  constructor() {
    this.users = new Map();
    this.patients = new Map();
    this.carePlans = new Map();
    this.checkIns = new Map();
    this.auditLogs = new Map();
    
    // Create default clinician user
    const defaultUser: User = {
      id: "clinician-1",
      username: "nurse",
      password: "password",
      role: "clinician",
      name: "Maria Chen, RN",
    };
    this.users.set(defaultUser.id, defaultUser);
    
    // Create default admin user
    const adminUser: User = {
      id: "admin-1",
      username: "admin",
      password: "password",
      role: "admin",
      name: "Angela Torres",
    };
    this.users.set(adminUser.id, adminUser);
  }

  // Users
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // Patients
  async getPatient(id: string): Promise<Patient | undefined> {
    return this.patients.get(id);
  }

  async getPatientByEmail(email: string): Promise<Patient | undefined> {
    return Array.from(this.patients.values()).find(
      (patient) => patient.email === email,
    );
  }

  async createPatient(insertPatient: InsertPatient): Promise<Patient> {
    const id = randomUUID();
    const patient: Patient = { 
      ...insertPatient, 
      id,
      createdAt: new Date(),
    };
    this.patients.set(id, patient);
    return patient;
  }

  async updatePatient(id: string, data: Partial<Patient>): Promise<Patient | undefined> {
    const patient = this.patients.get(id);
    if (!patient) return undefined;
    const updated = { ...patient, ...data };
    this.patients.set(id, updated);
    return updated;
  }

  // Care Plans
  async getCarePlan(id: string): Promise<CarePlan | undefined> {
    return this.carePlans.get(id);
  }

  async getCarePlanByToken(token: string): Promise<CarePlan | undefined> {
    return Array.from(this.carePlans.values()).find(
      (plan) => plan.accessToken === token,
    );
  }

  async getCarePlansByClinicianId(clinicianId: string): Promise<CarePlan[]> {
    return Array.from(this.carePlans.values()).filter(
      (plan) => plan.clinicianId === clinicianId,
    );
  }

  async getAllCarePlans(): Promise<CarePlan[]> {
    return Array.from(this.carePlans.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async createCarePlan(insertCarePlan: InsertCarePlan): Promise<CarePlan> {
    const id = randomUUID();
    const carePlan: CarePlan = { 
      ...insertCarePlan, 
      id,
      status: insertCarePlan.status || "draft",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.carePlans.set(id, carePlan);
    return carePlan;
  }

  async updateCarePlan(id: string, data: Partial<CarePlan>): Promise<CarePlan | undefined> {
    const carePlan = this.carePlans.get(id);
    if (!carePlan) return undefined;
    const updated = { ...carePlan, ...data, updatedAt: new Date() };
    this.carePlans.set(id, updated);
    return updated;
  }

  // Check-ins
  async getCheckIn(id: string): Promise<CheckIn | undefined> {
    return this.checkIns.get(id);
  }

  async getCheckInsByCarePlanId(carePlanId: string): Promise<CheckIn[]> {
    return Array.from(this.checkIns.values()).filter(
      (checkIn) => checkIn.carePlanId === carePlanId,
    );
  }

  async getCheckInsByPatientId(patientId: string): Promise<CheckIn[]> {
    return Array.from(this.checkIns.values()).filter(
      (checkIn) => checkIn.patientId === patientId,
    );
  }

  async getPendingCheckIns(): Promise<CheckIn[]> {
    const now = new Date();
    return Array.from(this.checkIns.values()).filter(
      (checkIn) => 
        !checkIn.respondedAt && 
        new Date(checkIn.scheduledFor) <= now &&
        !checkIn.sentAt
    );
  }

  async createCheckIn(insertCheckIn: InsertCheckIn): Promise<CheckIn> {
    const id = randomUUID();
    const checkIn: CheckIn = { 
      ...insertCheckIn, 
      id,
      createdAt: new Date(),
    };
    this.checkIns.set(id, checkIn);
    return checkIn;
  }

  async updateCheckIn(id: string, data: Partial<CheckIn>): Promise<CheckIn | undefined> {
    const checkIn = this.checkIns.get(id);
    if (!checkIn) return undefined;
    const updated = { ...checkIn, ...data };
    this.checkIns.set(id, updated);
    return updated;
  }

  // Audit Logs
  async getAuditLogsByCarePlanId(carePlanId: string): Promise<AuditLog[]> {
    return Array.from(this.auditLogs.values())
      .filter((log) => log.carePlanId === carePlanId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  async createAuditLog(insertLog: InsertAuditLog): Promise<AuditLog> {
    const id = randomUUID();
    const log: AuditLog = { 
      ...insertLog, 
      id,
      createdAt: new Date(),
    };
    this.auditLogs.set(id, log);
    return log;
  }

  // Alerts
  async getAlerts(): Promise<Array<{
    id: string;
    carePlanId: string;
    patientName: string;
    response: "yellow" | "red";
    respondedAt: Date;
    resolved: boolean;
  }>> {
    const alerts: Array<{
      id: string;
      carePlanId: string;
      patientName: string;
      response: "yellow" | "red";
      respondedAt: Date;
      resolved: boolean;
    }> = [];

    for (const checkIn of this.checkIns.values()) {
      if (checkIn.response === "yellow" || checkIn.response === "red") {
        const carePlan = await this.getCarePlan(checkIn.carePlanId);
        const patient = carePlan?.patientId ? await this.getPatient(carePlan.patientId) : undefined;
        
        alerts.push({
          id: checkIn.id,
          carePlanId: checkIn.carePlanId,
          patientName: patient?.name || "Unknown",
          response: checkIn.response as "yellow" | "red",
          respondedAt: checkIn.respondedAt || new Date(),
          resolved: !!checkIn.alertResolvedAt,
        });
      }
    }

    return alerts.sort((a, b) => 
      new Date(b.respondedAt).getTime() - new Date(a.respondedAt).getTime()
    );
  }

  async resolveAlert(checkInId: string, resolvedBy: string): Promise<void> {
    const checkIn = this.checkIns.get(checkInId);
    if (checkIn) {
      this.checkIns.set(checkInId, {
        ...checkIn,
        alertResolvedAt: new Date(),
        alertResolvedBy: resolvedBy,
      });
    }
  }
}

export const storage = new MemStorage();

// Helper function to generate access tokens
export function generateAccessToken(): string {
  return randomBytes(32).toString("hex");
}
