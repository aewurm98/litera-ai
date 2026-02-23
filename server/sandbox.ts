import { storage } from "./storage";
import type {
  Patient, InsertPatient,
  CarePlan, InsertCarePlan,
  CheckIn, InsertCheckIn,
  AuditLog, InsertAuditLog,
  ChatMessage, InsertChatMessage,
} from "@shared/schema";
import crypto from "crypto";
import type { IStorage } from "./storage";

const tenantPatientCounters = new Map<string, number>();
const sandboxPatients = new Map<string, Map<string, Patient>>();
const sandboxCarePlans = new Map<string, Map<string, CarePlan>>();
const sandboxCheckIns = new Map<string, Map<string, CheckIn>>();
const sandboxAuditLogs = new Map<string, Map<string, AuditLog>>();
const sandboxChatMessages = new Map<string, Map<string, ChatMessage>>();
const sandboxDeletedCarePlanIds = new Map<string, Set<string>>();
const sandboxDeletedPatientIds = new Map<string, Set<string>>();

function getMap<T>(store: Map<string, Map<string, T>>, tenantId: string): Map<string, T> {
  if (!store.has(tenantId)) store.set(tenantId, new Map());
  return store.get(tenantId)!;
}

function getDeletedSet(store: Map<string, Set<string>>, tenantId: string): Set<string> {
  if (!store.has(tenantId)) store.set(tenantId, new Set());
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
  if (pseudoName) {
    scrubbed.extractedPatientName = pseudoName;
    if (scrubbed.diagnosis && typeof scrubbed.diagnosis === "string") {
      const realName = data.extractedPatientName;
      if (realName) {
        scrubbed.diagnosis = scrubbed.diagnosis.replace(new RegExp(realName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), pseudoName);
      }
    }
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

export function clearSandboxData(tenantId: string): void {
  getMap(sandboxPatients, tenantId).clear();
  getMap(sandboxCarePlans, tenantId).clear();
  getMap(sandboxCheckIns, tenantId).clear();
  getMap(sandboxAuditLogs, tenantId).clear();
  getMap(sandboxChatMessages, tenantId).clear();
  getDeletedSet(sandboxDeletedCarePlanIds, tenantId).clear();
  getDeletedSet(sandboxDeletedPatientIds, tenantId).clear();
  tenantPatientCounters.delete(tenantId);
}

export function findSandboxCarePlanByToken(token: string): { carePlan: CarePlan; tenantId: string } | undefined {
  for (const [tenantId, cpMap] of Array.from(sandboxCarePlans.entries())) {
    for (const cp of Array.from(cpMap.values())) {
      if (cp.accessToken === token) return { carePlan: cp, tenantId };
    }
  }
  return undefined;
}

export function findSandboxCheckIn(checkInId: string): { checkIn: CheckIn; tenantId: string } | undefined {
  for (const [tenantId, ciMap] of Array.from(sandboxCheckIns.entries())) {
    const ci = ciMap.get(checkInId);
    if (ci) return { checkIn: ci, tenantId };
  }
  return undefined;
}

function makeCarePlanRecord(data: InsertCarePlan, id: string): CarePlan {
  const now = new Date();
  return {
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
}

export function createSandboxAdapter(tenantId: string): IStorage {
  const sbPatients = () => getMap(sandboxPatients, tenantId);
  const sbCarePlans = () => getMap(sandboxCarePlans, tenantId);
  const sbCheckIns = () => getMap(sandboxCheckIns, tenantId);
  const sbAuditLogs = () => getMap(sandboxAuditLogs, tenantId);
  const sbChatMessages = () => getMap(sandboxChatMessages, tenantId);
  const deletedCpIds = () => getDeletedSet(sandboxDeletedCarePlanIds, tenantId);
  const deletedPtIds = () => getDeletedSet(sandboxDeletedPatientIds, tenantId);

  async function copyCarePlanToSandbox(dbCarePlan: CarePlan): Promise<CarePlan> {
    const copy = { ...dbCarePlan };
    sbCarePlans().set(copy.id, copy);
    return copy;
  }

  async function copyPatientToSandbox(dbPatient: Patient): Promise<Patient> {
    const copy = { ...dbPatient };
    sbPatients().set(copy.id, copy);
    return copy;
  }

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

    async getPatient(id) {
      if (deletedPtIds().has(id)) return undefined;
      const sbPt = sbPatients().get(id);
      if (sbPt) return sbPt;
      return storage.getPatient(id);
    },

    async getPatientByEmail(email, _t) {
      for (const p of Array.from(sbPatients().values())) {
        if (p.email === email) return p;
      }
      const dbPt = await storage.getPatientByEmail(email, tenantId);
      if (dbPt && !deletedPtIds().has(dbPt.id)) return dbPt;
      return undefined;
    },

    async findPatientByName(name, _t) {
      const normalized = name.toLowerCase().trim();
      for (const p of Array.from(sbPatients().values())) {
        if (p.name.toLowerCase().trim() === normalized) return p;
      }
      const dbPt = await storage.findPatientByName(name, tenantId);
      if (dbPt && !deletedPtIds().has(dbPt.id)) return dbPt;
      return undefined;
    },

    async getAllPatients(_t) {
      const dbPatients = await storage.getAllPatients(tenantId);
      const sbMap = sbPatients();
      const deleted = deletedPtIds();
      const merged = new Map<string, Patient>();
      for (const p of dbPatients) {
        if (!deleted.has(p.id) && !sbMap.has(p.id)) {
          merged.set(p.id, p);
        }
      }
      for (const p of Array.from(sbMap.values())) {
        merged.set(p.id, p);
      }
      return Array.from(merged.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },

    async createPatient(p) {
      const id = genId();
      const now = new Date();
      const record: Patient = {
        id,
        name: p.name,
        lastName: p.lastName || null,
        email: p.email,
        phone: p.phone || null,
        yearOfBirth: p.yearOfBirth,
        dateOfBirth: p.dateOfBirth || null,
        pin: p.pin || null,
        password: p.password || null,
        preferredLanguage: p.preferredLanguage || "en",
        isTestPatient: p.isTestPatient || false,
        tenantId: p.tenantId || null,
        createdAt: now,
      };
      sbPatients().set(id, record);
      return record;
    },

    async updatePatient(id, d) {
      let record = sbPatients().get(id);
      if (!record) {
        const dbPt = await storage.getPatient(id);
        if (!dbPt || deletedPtIds().has(id)) return undefined;
        record = await copyPatientToSandbox(dbPt);
      }
      const updated = { ...record, ...d };
      sbPatients().set(id, updated);
      return updated;
    },

    async updatePatientPassword(id, p) {
      let record = sbPatients().get(id);
      if (!record) {
        const dbPt = await storage.getPatient(id);
        if (!dbPt) return;
        record = await copyPatientToSandbox(dbPt);
      }
      sbPatients().set(id, { ...record, password: p });
    },

    async deletePatient(id) {
      const sbMap = sbPatients();
      if (sbMap.has(id)) {
        sbMap.delete(id);
        return true;
      }
      deletedPtIds().add(id);
      return true;
    },

    cleanupOldTestPatients: async () => 0,

    async getCarePlansByPatientId(pid, _t) {
      const dbPlans = await storage.getCarePlansByPatientId(pid, tenantId);
      const sbMap = sbCarePlans();
      const deleted = deletedCpIds();
      const merged = new Map<string, CarePlan>();
      for (const cp of dbPlans) {
        if (!deleted.has(cp.id) && !sbMap.has(cp.id)) {
          merged.set(cp.id, cp);
        }
      }
      for (const cp of Array.from(sbMap.values())) {
        if (cp.patientId === pid) merged.set(cp.id, cp);
      }
      return Array.from(merged.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },

    async getCarePlan(id) {
      if (deletedCpIds().has(id)) return undefined;
      const sbCp = sbCarePlans().get(id);
      if (sbCp) return sbCp;
      return storage.getCarePlan(id);
    },

    async getCarePlanByToken(token) {
      for (const cp of Array.from(sbCarePlans().values())) {
        if (cp.accessToken === token) return cp;
      }
      return storage.getCarePlanByToken(token);
    },

    async getCarePlansByClinicianId(cid, _t) {
      const dbPlans = await storage.getCarePlansByClinicianId(cid, tenantId);
      const sbMap = sbCarePlans();
      const deleted = deletedCpIds();
      const merged = new Map<string, CarePlan>();
      for (const cp of dbPlans) {
        if (!deleted.has(cp.id) && !sbMap.has(cp.id)) {
          merged.set(cp.id, cp);
        }
      }
      for (const cp of Array.from(sbMap.values())) {
        if (cp.clinicianId === cid) merged.set(cp.id, cp);
      }
      return Array.from(merged.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },

    async getAllCarePlans(_t) {
      const dbPlans = await storage.getAllCarePlans(tenantId);
      const sbMap = sbCarePlans();
      const deleted = deletedCpIds();
      const merged = new Map<string, CarePlan>();
      for (const cp of dbPlans) {
        if (!deleted.has(cp.id) && !sbMap.has(cp.id)) {
          merged.set(cp.id, cp);
        }
      }
      for (const cp of Array.from(sbMap.values())) {
        merged.set(cp.id, cp);
      }
      return Array.from(merged.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },

    async createCarePlan(cp) {
      const id = genId();
      const record = makeCarePlanRecord(cp, id);
      sbCarePlans().set(id, record);
      return record;
    },

    async updateCarePlan(id, d) {
      let record = sbCarePlans().get(id);
      if (!record) {
        if (deletedCpIds().has(id)) return undefined;
        const dbCp = await storage.getCarePlan(id);
        if (!dbCp) return undefined;
        record = await copyCarePlanToSandbox(dbCp);
      }
      const updated = { ...record, ...d, updatedAt: new Date() };
      sbCarePlans().set(id, updated);
      return updated;
    },

    async deleteCarePlan(id) {
      const sbMap = sbCarePlans();
      if (sbMap.has(id)) {
        sbMap.delete(id);
        for (const [k, v] of Array.from(sbCheckIns().entries())) {
          if (v.carePlanId === id) sbCheckIns().delete(k);
        }
        for (const [k, v] of Array.from(sbAuditLogs().entries())) {
          if (v.carePlanId === id) sbAuditLogs().delete(k);
        }
        for (const [k, v] of Array.from(sbChatMessages().entries())) {
          if (v.carePlanId === id) sbChatMessages().delete(k);
        }
        return true;
      }
      deletedCpIds().add(id);
      return true;
    },

    async getCheckIn(id) {
      const sbCi = sbCheckIns().get(id);
      if (sbCi) return sbCi;
      return storage.getCheckIn(id);
    },

    async getCheckInsByCarePlanId(cpid) {
      const dbCheckIns = await storage.getCheckInsByCarePlanId(cpid);
      const sbMap = sbCheckIns();
      const merged = new Map<string, CheckIn>();
      for (const ci of dbCheckIns) {
        if (!sbMap.has(ci.id)) merged.set(ci.id, ci);
      }
      for (const ci of Array.from(sbMap.values())) {
        if (ci.carePlanId === cpid) merged.set(ci.id, ci);
      }
      return Array.from(merged.values());
    },

    async getCheckInsByPatientId(pid) {
      const dbCheckIns = await storage.getCheckInsByPatientId(pid);
      const sbMap = sbCheckIns();
      const merged = new Map<string, CheckIn>();
      for (const ci of dbCheckIns) {
        if (!sbMap.has(ci.id)) merged.set(ci.id, ci);
      }
      for (const ci of Array.from(sbMap.values())) {
        if (ci.patientId === pid) merged.set(ci.id, ci);
      }
      return Array.from(merged.values());
    },

    getPendingCheckIns: async () => [],

    async createCheckIn(ci) {
      const id = genId();
      const record: CheckIn = {
        id,
        carePlanId: ci.carePlanId,
        patientId: ci.patientId,
        scheduledFor: ci.scheduledFor,
        sentAt: ci.sentAt || null,
        attemptNumber: ci.attemptNumber ?? 1,
        response: ci.response || null,
        respondedAt: ci.respondedAt || null,
        responseNotes: ci.responseNotes || null,
        alertCreated: ci.alertCreated || false,
        alertResolvedAt: ci.alertResolvedAt || null,
        alertResolvedBy: ci.alertResolvedBy || null,
        createdAt: new Date(),
      };
      sbCheckIns().set(id, record);
      return record;
    },

    async updateCheckIn(id, d) {
      let record = sbCheckIns().get(id);
      if (!record) {
        const dbCi = await storage.getCheckIn(id);
        if (!dbCi) return undefined;
        record = { ...dbCi };
        sbCheckIns().set(id, record);
      }
      const updated = { ...record, ...d };
      sbCheckIns().set(id, updated);
      return updated;
    },

    async getAuditLogsByCarePlanId(cpid) {
      const dbLogs = await storage.getAuditLogsByCarePlanId(cpid);
      const sbLogs = Array.from(sbAuditLogs().values()).filter(al => al.carePlanId === cpid);
      const merged = new Map<string, AuditLog>();
      for (const al of dbLogs) merged.set(al.id, al);
      for (const al of sbLogs) merged.set(al.id, al);
      return Array.from(merged.values()).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    },

    async createAuditLog(log) {
      const id = genId();
      const scrubbed = scrubAuditLogData(log);
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
      sbAuditLogs().set(id, record);
      return record;
    },

    async getAlerts(_t) {
      const dbAlerts = await storage.getAlerts(tenantId);
      const sbCiList = Array.from(sbCheckIns().values())
        .filter(ci => ci.response === "yellow" || ci.response === "red");
      const sbAlerts = await Promise.all(sbCiList.map(async (ci) => {
        const cp = sbCarePlans().get(ci.carePlanId) || await storage.getCarePlan(ci.carePlanId);
        const patient = cp?.patientId ? (sbPatients().get(cp.patientId) || await storage.getPatient(cp.patientId)) : undefined;
        return {
          id: ci.id,
          carePlanId: ci.carePlanId,
          patientName: patient?.name || "Unknown",
          response: ci.response as "yellow" | "red",
          respondedAt: ci.respondedAt || new Date(),
          resolved: !!ci.alertResolvedAt,
          resolvedAt: ci.alertResolvedAt,
        };
      }));
      return [...dbAlerts, ...sbAlerts].sort((a, b) => b.respondedAt.getTime() - a.respondedAt.getTime());
    },

    async resolveAlert(ciid, by) {
      let ci = sbCheckIns().get(ciid);
      if (!ci) {
        const dbCi = await storage.getCheckIn(ciid);
        if (!dbCi) return;
        ci = { ...dbCi };
        sbCheckIns().set(ciid, ci);
      }
      sbCheckIns().set(ciid, { ...ci, alertResolvedAt: new Date(), alertResolvedBy: by });
    },

    async clearAllData() {
      clearSandboxData(tenantId);
    },

    async getChatMessages(cpid, pid) {
      const dbMsgs = await storage.getChatMessages(cpid, pid);
      const sbMsgs = Array.from(sbChatMessages().values())
        .filter(cm => cm.carePlanId === cpid && cm.patientId === pid);
      const merged = new Map<string, ChatMessage>();
      for (const m of dbMsgs) merged.set(m.id, m);
      for (const m of sbMsgs) merged.set(m.id, m);
      return Array.from(merged.values()).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    },

    async createChatMessage(msg) {
      const id = genId();
      const record: ChatMessage = {
        id,
        carePlanId: msg.carePlanId,
        patientId: msg.patientId,
        role: msg.role,
        content: msg.content,
        language: msg.language || "en",
        createdAt: new Date(),
      };
      sbChatMessages().set(id, record);
      return record;
    },
  };
}
