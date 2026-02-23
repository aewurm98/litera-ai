import { storage } from "./storage";
import type {
  Patient, InsertPatient,
  CarePlan, InsertCarePlan,
  CheckIn, InsertCheckIn,
  AuditLog, InsertAuditLog,
  ChatMessage, InsertChatMessage,
  Tenant,
} from "@shared/schema";
import crypto from "crypto";

const tenantPatientCounters = new Map<string, number>();
const sandboxPatients = new Map<string, Map<string, Patient>>();
const sandboxCarePlans = new Map<string, Map<string, CarePlan>>();
const sandboxCheckIns = new Map<string, Map<string, CheckIn>>();
const sandboxAuditLogs = new Map<string, Map<string, AuditLog>>();
const sandboxChatMessages = new Map<string, Map<string, ChatMessage>>();

function getMap<T>(store: Map<string, Map<string, T>>, tenantId: string): Map<string, T> {
  if (!store.has(tenantId)) store.set(tenantId, new Map());
  return store.get(tenantId)!;
}

function genId(): string {
  return crypto.randomUUID();
}

function getNextPatientNumber(tenantId: string): number {
  const current = tenantPatientCounters.get(tenantId) || 0;
  const next = current + 1;
  tenantPatientCounters.set(tenantId, next);
  return next;
}

function randomDob(): { dateOfBirth: string; yearOfBirth: number } {
  const year = 1950 + Math.floor(Math.random() * 50);
  const month = String(1 + Math.floor(Math.random() * 12)).padStart(2, "0");
  const day = String(1 + Math.floor(Math.random() * 28)).padStart(2, "0");
  return { dateOfBirth: `${year}-${month}-${day}`, yearOfBirth: year };
}

export function pseudonymizePatientData(
  data: Partial<InsertPatient> & { name: string; email: string; yearOfBirth: number },
  tenantId: string,
  adminEmail: string,
): InsertPatient {
  const num = getNextPatientNumber(tenantId);
  const dob = randomDob();
  return {
    ...data,
    name: `Patient ${num}`,
    lastName: `${num}`,
    email: adminEmail,
    phone: data.phone ? "(555) 000-0000" : undefined,
    yearOfBirth: dob.yearOfBirth,
    dateOfBirth: dob.dateOfBirth,
    tenantId,
  };
}

export function scrubCarePlanData(data: Partial<CarePlan>, pseudoName?: string): Partial<CarePlan> {
  const scrubbed = { ...data };
  scrubbed.originalContent = null;
  scrubbed.originalFileData = null;
  if (data.originalFileName) {
    scrubbed.originalFileName = "upload.pdf";
  }
  if (pseudoName) {
    scrubbed.extractedPatientName = pseudoName;
  }
  return scrubbed;
}

export function scrubAuditLogData(data: InsertAuditLog): InsertAuditLog {
  return {
    ...data,
    ipAddress: null,
    userAgent: null,
  };
}

export async function isSandboxTenant(tenantId: string | undefined | null): Promise<boolean> {
  if (!tenantId) return false;
  const tenant = await storage.getTenant(tenantId);
  return tenant?.sandboxMode === true;
}

export async function getAdminEmailForTenant(tenantId: string): Promise<string> {
  const users = await storage.getAllUsers(tenantId);
  const admin = users.find(u => u.role === "admin" || u.role === "super_admin");
  return admin?.recoveryEmail || admin?.username || "admin@sandbox.local";
}

export const sandboxStorage = {
  async createPatient(patient: InsertPatient, tenantId: string): Promise<Patient> {
    const id = genId();
    const now = new Date();
    const record: Patient = {
      id,
      name: patient.name,
      lastName: patient.lastName || null,
      email: patient.email,
      phone: patient.phone || null,
      yearOfBirth: patient.yearOfBirth,
      dateOfBirth: patient.dateOfBirth || null,
      pin: patient.pin || null,
      password: patient.password || null,
      preferredLanguage: patient.preferredLanguage || "en",
      isTestPatient: patient.isTestPatient || false,
      tenantId: patient.tenantId || null,
      createdAt: now,
    };
    getMap(sandboxPatients, tenantId).set(id, record);
    return record;
  },

  async getPatient(id: string, tenantId: string): Promise<Patient | undefined> {
    return getMap(sandboxPatients, tenantId).get(id);
  },

  async getPatientByEmail(email: string, tenantId: string): Promise<Patient | undefined> {
    const map = getMap(sandboxPatients, tenantId);
    for (const p of map.values()) {
      if (p.email === email) return p;
    }
    return undefined;
  },

  async findPatientByName(name: string, tenantId: string): Promise<Patient | undefined> {
    const normalized = name.toLowerCase().trim();
    const map = getMap(sandboxPatients, tenantId);
    for (const p of map.values()) {
      if (p.name.toLowerCase().trim() === normalized) return p;
    }
    return undefined;
  },

  async getAllPatients(tenantId: string): Promise<Patient[]> {
    return Array.from(getMap(sandboxPatients, tenantId).values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  },

  async updatePatient(id: string, data: Partial<Patient>, tenantId: string): Promise<Patient | undefined> {
    const map = getMap(sandboxPatients, tenantId);
    const existing = map.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...data };
    map.set(id, updated);
    return updated;
  },

  async updatePatientPassword(id: string, hashedPassword: string, tenantId: string): Promise<void> {
    const map = getMap(sandboxPatients, tenantId);
    const existing = map.get(id);
    if (existing) {
      map.set(id, { ...existing, password: hashedPassword });
    }
  },

  async deletePatient(id: string, tenantId: string): Promise<boolean> {
    return getMap(sandboxPatients, tenantId).delete(id);
  },

  async createCarePlan(data: InsertCarePlan, tenantId: string): Promise<CarePlan> {
    const id = genId();
    const now = new Date();
    const record: CarePlan = {
      id,
      patientId: data.patientId || null,
      clinicianId: data.clinicianId || null,
      tenantId: data.tenantId || null,
      status: data.status || "draft",
      originalContent: data.originalContent || null,
      originalFileName: data.originalFileName || null,
      originalFileData: data.originalFileData || null,
      extractedPatientName: data.extractedPatientName || null,
      diagnosis: data.diagnosis || null,
      medications: data.medications || null,
      appointments: data.appointments || null,
      instructions: data.instructions || null,
      warnings: data.warnings || null,
      simplifiedDiagnosis: data.simplifiedDiagnosis || null,
      simplifiedMedications: data.simplifiedMedications || null,
      simplifiedAppointments: data.simplifiedAppointments || null,
      simplifiedInstructions: data.simplifiedInstructions || null,
      simplifiedWarnings: data.simplifiedWarnings || null,
      translatedLanguage: data.translatedLanguage || null,
      translatedDiagnosis: data.translatedDiagnosis || null,
      translatedMedications: data.translatedMedications || null,
      translatedAppointments: data.translatedAppointments || null,
      translatedInstructions: data.translatedInstructions || null,
      translatedWarnings: data.translatedWarnings || null,
      backTranslatedDiagnosis: data.backTranslatedDiagnosis || null,
      backTranslatedInstructions: data.backTranslatedInstructions || null,
      backTranslatedWarnings: data.backTranslatedWarnings || null,
      accessToken: data.accessToken || null,
      accessTokenExpiry: data.accessTokenExpiry || null,
      interpreterReviewedBy: data.interpreterReviewedBy || null,
      interpreterReviewedAt: data.interpreterReviewedAt || null,
      interpreterNotes: data.interpreterNotes || null,
      readingLevel: data.readingLevel ?? 5,
      approvedBy: data.approvedBy || null,
      approvedAt: data.approvedAt || null,
      dischargeDate: data.dischargeDate || null,
      createdAt: now,
      updatedAt: now,
    };
    getMap(sandboxCarePlans, tenantId).set(id, record);
    return record;
  },

  async getCarePlan(id: string, tenantId: string): Promise<CarePlan | undefined> {
    return getMap(sandboxCarePlans, tenantId).get(id);
  },

  async getCarePlanByToken(token: string, tenantId: string): Promise<CarePlan | undefined> {
    const map = getMap(sandboxCarePlans, tenantId);
    for (const cp of map.values()) {
      if (cp.accessToken === token) return cp;
    }
    return undefined;
  },

  async getCarePlansByClinicianId(clinicianId: string, tenantId: string): Promise<CarePlan[]> {
    return Array.from(getMap(sandboxCarePlans, tenantId).values())
      .filter(cp => cp.clinicianId === clinicianId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  },

  async getAllCarePlans(tenantId: string): Promise<CarePlan[]> {
    return Array.from(getMap(sandboxCarePlans, tenantId).values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  },

  async updateCarePlan(id: string, data: Partial<CarePlan>, tenantId: string): Promise<CarePlan | undefined> {
    const map = getMap(sandboxCarePlans, tenantId);
    const existing = map.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...data, updatedAt: new Date() };
    map.set(id, updated);
    return updated;
  },

  async deleteCarePlan(id: string, tenantId: string): Promise<boolean> {
    const cpMap = getMap(sandboxCarePlans, tenantId);
    const ciMap = getMap(sandboxCheckIns, tenantId);
    const alMap = getMap(sandboxAuditLogs, tenantId);
    const cmMap = getMap(sandboxChatMessages, tenantId);
    for (const [k, v] of ciMap) { if (v.carePlanId === id) ciMap.delete(k); }
    for (const [k, v] of alMap) { if (v.carePlanId === id) alMap.delete(k); }
    for (const [k, v] of cmMap) { if (v.carePlanId === id) cmMap.delete(k); }
    return cpMap.delete(id);
  },

  async getCarePlansByPatientId(patientId: string, tenantId: string): Promise<CarePlan[]> {
    return Array.from(getMap(sandboxCarePlans, tenantId).values())
      .filter(cp => cp.patientId === patientId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  },

  async createCheckIn(data: InsertCheckIn, tenantId: string): Promise<CheckIn> {
    const id = genId();
    const record: CheckIn = {
      id,
      carePlanId: data.carePlanId,
      patientId: data.patientId,
      scheduledFor: data.scheduledFor,
      sentAt: data.sentAt || null,
      attemptNumber: data.attemptNumber ?? 1,
      response: data.response || null,
      respondedAt: data.respondedAt || null,
      responseNotes: data.responseNotes || null,
      alertCreated: data.alertCreated || false,
      alertResolvedAt: data.alertResolvedAt || null,
      alertResolvedBy: data.alertResolvedBy || null,
      createdAt: new Date(),
    };
    getMap(sandboxCheckIns, tenantId).set(id, record);
    return record;
  },

  async getCheckIn(id: string, tenantId: string): Promise<CheckIn | undefined> {
    return getMap(sandboxCheckIns, tenantId).get(id);
  },

  async getCheckInsByCarePlanId(carePlanId: string, tenantId: string): Promise<CheckIn[]> {
    return Array.from(getMap(sandboxCheckIns, tenantId).values())
      .filter(ci => ci.carePlanId === carePlanId);
  },

  async getCheckInsByPatientId(patientId: string, tenantId: string): Promise<CheckIn[]> {
    return Array.from(getMap(sandboxCheckIns, tenantId).values())
      .filter(ci => ci.patientId === patientId);
  },

  async updateCheckIn(id: string, data: Partial<CheckIn>, tenantId: string): Promise<CheckIn | undefined> {
    const map = getMap(sandboxCheckIns, tenantId);
    const existing = map.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...data };
    map.set(id, updated);
    return updated;
  },

  async createAuditLog(data: InsertAuditLog, tenantId: string): Promise<AuditLog> {
    const id = genId();
    const scrubbed = scrubAuditLogData(data);
    const record: AuditLog = {
      id,
      carePlanId: scrubbed.carePlanId || null,
      userId: scrubbed.userId || null,
      action: scrubbed.action,
      details: scrubbed.details || null,
      ipAddress: null,
      userAgent: null,
      createdAt: new Date(),
    };
    getMap(sandboxAuditLogs, tenantId).set(id, record);
    return record;
  },

  async getAuditLogsByCarePlanId(carePlanId: string, tenantId: string): Promise<AuditLog[]> {
    return Array.from(getMap(sandboxAuditLogs, tenantId).values())
      .filter(al => al.carePlanId === carePlanId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  },

  async createChatMessage(data: InsertChatMessage, tenantId: string): Promise<ChatMessage> {
    const id = genId();
    const record: ChatMessage = {
      id,
      carePlanId: data.carePlanId,
      patientId: data.patientId,
      role: data.role,
      content: data.content,
      language: data.language || "en",
      createdAt: new Date(),
    };
    getMap(sandboxChatMessages, tenantId).set(id, record);
    return record;
  },

  async getChatMessages(carePlanId: string, patientId: string, tenantId: string): Promise<ChatMessage[]> {
    return Array.from(getMap(sandboxChatMessages, tenantId).values())
      .filter(cm => cm.carePlanId === carePlanId && cm.patientId === patientId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  },

  async getAlerts(tenantId: string): Promise<Array<{
    id: string;
    carePlanId: string;
    patientName: string;
    response: "yellow" | "red";
    respondedAt: Date;
    resolved: boolean;
    resolvedAt?: Date | null;
  }>> {
    const checkIns = Array.from(getMap(sandboxCheckIns, tenantId).values())
      .filter(ci => ci.response === "yellow" || ci.response === "red");
    const cpMap = getMap(sandboxCarePlans, tenantId);
    const pMap = getMap(sandboxPatients, tenantId);

    return checkIns.map(ci => {
      const cp = cpMap.get(ci.carePlanId);
      const patientName = (cp?.patientId && pMap.get(cp.patientId)?.name) || "Unknown";
      return {
        id: ci.id,
        carePlanId: ci.carePlanId,
        patientName,
        response: ci.response as "yellow" | "red",
        respondedAt: ci.respondedAt || new Date(),
        resolved: !!ci.alertResolvedAt,
        resolvedAt: ci.alertResolvedAt,
      };
    }).sort((a, b) => b.respondedAt.getTime() - a.respondedAt.getTime());
  },

  async resolveAlert(checkInId: string, resolvedBy: string, tenantId: string): Promise<void> {
    const map = getMap(sandboxCheckIns, tenantId);
    const ci = map.get(checkInId);
    if (ci) {
      map.set(checkInId, { ...ci, alertResolvedAt: new Date(), alertResolvedBy: resolvedBy });
    }
  },
};

export function findSandboxCarePlanByToken(token: string): { carePlan: CarePlan; tenantId: string } | undefined {
  for (const [tenantId, cpMap] of sandboxCarePlans) {
    for (const cp of cpMap.values()) {
      if (cp.accessToken === token) return { carePlan: cp, tenantId };
    }
  }
  return undefined;
}

export function findSandboxCheckIn(checkInId: string): { checkIn: CheckIn; tenantId: string } | undefined {
  for (const [tenantId, ciMap] of sandboxCheckIns) {
    const ci = ciMap.get(checkInId);
    if (ci) return { checkIn: ci, tenantId };
  }
  return undefined;
}

import type { IStorage } from "./storage";

export function createSandboxAdapter(tenantId: string): IStorage {
  return {
    getUser: (id) => storage.getUser(id),
    getUserByUsername: (u) => storage.getUserByUsername(u),
    createUser: (u) => storage.createUser(u),
    updateUserPassword: (id, p) => storage.updateUserPassword(id, p),
    getAllUsers: (t) => storage.getAllUsers(t),
    updateUser: (id, d) => storage.updateUser(id, d),
    getUserByRecoveryEmail: (e) => storage.getUserByRecoveryEmail(e),
    getUserByResetToken: (t) => storage.getUserByResetToken(t),
    deleteUser: (id) => storage.deleteUser(id),

    getAllTenants: () => storage.getAllTenants(),
    getTenant: (id) => storage.getTenant(id),
    createTenant: (t) => storage.createTenant(t),
    updateTenant: (id, d) => storage.updateTenant(id, d),

    createTeamInvitation: (inv) => storage.createTeamInvitation(inv),
    getTeamInvitationByToken: (t) => storage.getTeamInvitationByToken(t),
    getTeamInvitations: (t) => storage.getTeamInvitations(t),
    updateTeamInvitation: (id, d) => storage.updateTeamInvitation(id, d),

    getPatient: (id) => sandboxStorage.getPatient(id, tenantId),
    getPatientByEmail: (email, _t) => sandboxStorage.getPatientByEmail(email, tenantId),
    findPatientByName: (name, _t) => sandboxStorage.findPatientByName(name, tenantId),
    getAllPatients: (_t) => sandboxStorage.getAllPatients(tenantId),
    createPatient: (p) => sandboxStorage.createPatient(p, tenantId),
    updatePatient: (id, d) => sandboxStorage.updatePatient(id, d, tenantId),
    updatePatientPassword: (id, p) => sandboxStorage.updatePatientPassword(id, p, tenantId),
    deletePatient: (id) => sandboxStorage.deletePatient(id, tenantId),
    cleanupOldTestPatients: async () => 0,
    getCarePlansByPatientId: (pid, _t) => sandboxStorage.getCarePlansByPatientId(pid, tenantId),

    getCarePlan: (id) => sandboxStorage.getCarePlan(id, tenantId),
    getCarePlanByToken: (token) => sandboxStorage.getCarePlanByToken(token, tenantId),
    getCarePlansByClinicianId: (cid, _t) => sandboxStorage.getCarePlansByClinicianId(cid, tenantId),
    getAllCarePlans: (_t) => sandboxStorage.getAllCarePlans(tenantId),
    createCarePlan: (cp) => sandboxStorage.createCarePlan(cp, tenantId),
    updateCarePlan: (id, d) => sandboxStorage.updateCarePlan(id, d, tenantId),
    deleteCarePlan: (id) => sandboxStorage.deleteCarePlan(id, tenantId),

    getCheckIn: (id) => sandboxStorage.getCheckIn(id, tenantId),
    getCheckInsByCarePlanId: (cpid) => sandboxStorage.getCheckInsByCarePlanId(cpid, tenantId),
    getCheckInsByPatientId: (pid) => sandboxStorage.getCheckInsByPatientId(pid, tenantId),
    getPendingCheckIns: async () => [],
    createCheckIn: (ci) => sandboxStorage.createCheckIn(ci, tenantId),
    updateCheckIn: (id, d) => sandboxStorage.updateCheckIn(id, d, tenantId),

    getAuditLogsByCarePlanId: (cpid) => sandboxStorage.getAuditLogsByCarePlanId(cpid, tenantId),
    createAuditLog: (log) => sandboxStorage.createAuditLog(log, tenantId),

    getAlerts: (_t) => sandboxStorage.getAlerts(tenantId),
    resolveAlert: (ciid, by) => sandboxStorage.resolveAlert(ciid, by, tenantId),
    clearAllData: async () => {
      getMap(sandboxPatients, tenantId).clear();
      getMap(sandboxCarePlans, tenantId).clear();
      getMap(sandboxCheckIns, tenantId).clear();
      getMap(sandboxAuditLogs, tenantId).clear();
      getMap(sandboxChatMessages, tenantId).clear();
    },

    getChatMessages: (cpid, pid) => sandboxStorage.getChatMessages(cpid, pid, tenantId),
    createChatMessage: (msg) => sandboxStorage.createChatMessage(msg, tenantId),
  };
}
