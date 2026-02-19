import { db } from "./db";
import { users, patients, carePlans, checkIns, auditLogs, tenants, chatMessages } from "@shared/schema";
import { eq, inArray, and, isNotNull } from "drizzle-orm";
import { randomBytes } from "crypto";
import { hashPassword } from "./auth";

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

export async function seedDatabase(force: boolean = false) {
  console.log("Checking if database needs seeding...");
  
  if (process.env.ALLOW_SEED !== "true" && force) {
    console.error("==========================================================");
    console.error("SEED BLOCKED: Set ALLOW_SEED=true to run with force=true.");
    console.error("WARNING: This will DESTROY all existing data!");
    console.error("==========================================================");
    throw new Error("Seed blocked for safety. Set ALLOW_SEED=true to proceed.");
  }
  
  if (!force) {
    const existingUsers = await db.select().from(users).limit(1);
    if (existingUsers.length > 0) {
      console.log("Database already has data, skipping seed. Use force=true to reseed.");
      return;
    }
  }

  console.log("Seeding database...");

  await db.delete(chatMessages);
  await db.delete(auditLogs);
  await db.delete(checkIns);
  await db.delete(carePlans);
  await db.delete(patients);
  await db.delete(users);
  await db.delete(tenants);

  const hashedPassword = await hashPassword("password123");

  const [admin1] = await db.insert(users).values({
    username: "admin",
    password: hashedPassword,
    role: "super_admin",
    name: "Angela Torres",
    tenantId: null,
  }).returning();

  console.log("Created super admin:", admin1.name);

  await seedDemoData();

  console.log("Seeding complete!");
}

export async function resetDemoTenant() {
  console.log("Resetting demo tenant data only...");

  const demoTenantList = await db.select().from(tenants).where(eq(tenants.isDemo, true));

  if (demoTenantList.length === 0) {
    console.log("No demo tenants found. Will create fresh demo data.");
  } else {
    const demoTenantIds = demoTenantList.map(t => t.id);
    console.log(`Found ${demoTenantIds.length} demo tenant(s):`, demoTenantList.map(t => t.name).join(", "));

    const demoPatientRows = await db.select({ id: patients.id }).from(patients).where(inArray(patients.tenantId, demoTenantIds));
    const demoPatientIds = demoPatientRows.map(p => p.id);

    const demoCarePlanRows = await db.select({ id: carePlans.id }).from(carePlans).where(inArray(carePlans.tenantId, demoTenantIds));
    const demoCarePlanIds = demoCarePlanRows.map(cp => cp.id);

    if (demoCarePlanIds.length > 0) {
      await db.delete(chatMessages).where(inArray(chatMessages.carePlanId, demoCarePlanIds));
      await db.delete(auditLogs).where(inArray(auditLogs.carePlanId, demoCarePlanIds));
      await db.delete(checkIns).where(inArray(checkIns.carePlanId, demoCarePlanIds));
      await db.delete(carePlans).where(inArray(carePlans.id, demoCarePlanIds));
    }
    await db.delete(auditLogs).where(
      and(
        inArray(auditLogs.userId, 
          db.select({ id: users.id }).from(users).where(inArray(users.tenantId, demoTenantIds))
        ),
        eq(auditLogs.carePlanId, null as any)
      )
    );

    if (demoPatientIds.length > 0) {
      await db.delete(patients).where(inArray(patients.id, demoPatientIds));
    }

    await db.delete(users).where(inArray(users.tenantId, demoTenantIds));
    await db.delete(tenants).where(inArray(tenants.id, demoTenantIds));

    console.log("Deleted demo tenant data. Preserved non-demo tenants and super admin.");
  }

  await seedDemoData();
  console.log("Demo tenant reset complete!");
}

async function seedDemoData() {
  const hashedPassword = await hashPassword("password123");
  const hashedPin = await hashPassword("1234");

  // === TENANT 1: Riverside Community Health ===
  const [tenant1] = await db.insert(tenants).values({
    name: "Riverside Community Health",
    slug: "riverside",
    isDemo: true,
  }).returning();

  // === TENANT 2: Lakeside Family Medicine ===
  const [tenant2] = await db.insert(tenants).values({
    name: "Lakeside Family Medicine",
    slug: "lakeside",
    isDemo: true,
  }).returning();

  console.log("Created demo tenants:", tenant1.name, tenant2.name);

  const existingSuperAdmin = await db.select().from(users).where(eq(users.role, "super_admin"));

  if (existingSuperAdmin.length === 0) {
    const [admin1] = await db.insert(users).values({
      username: "admin",
      password: hashedPassword,
      role: "super_admin",
      name: "Angela Torres",
      tenantId: null,
    }).returning();
    console.log("Created super admin:", admin1.name);
  } else {
    console.log("Super admin already exists, skipping creation.");
  }

  // Riverside staff
  const [riversideAdmin] = await db.insert(users).values({
    username: "riverside_admin",
    password: hashedPassword,
    role: "admin",
    name: "Dr. James Park",
    tenantId: tenant1.id,
  }).returning();

  const [clinician1] = await db.insert(users).values({
    username: "nurse",
    password: hashedPassword,
    role: "clinician",
    name: "Maria Chen, RN",
    tenantId: tenant1.id,
  }).returning();

  // Lakeside staff
  const [lakesideAdmin] = await db.insert(users).values({
    username: "lakeside_admin",
    password: hashedPassword,
    role: "admin",
    name: "Dr. Rachel Torres",
    tenantId: tenant2.id,
  }).returning();

  const [clinician2] = await db.insert(users).values({
    username: "lakeside_nurse",
    password: hashedPassword,
    role: "clinician",
    name: "Sarah Kim, NP",
    tenantId: tenant2.id,
  }).returning();

  // Riverside interpreter (Spanish, French, Russian)
  const [interpreter1] = await db.insert(users).values({
    username: "riverside_interpreter",
    password: hashedPassword,
    role: "interpreter",
    name: "Luis Reyes, CMI",
    languages: ["es", "fr", "ru"],
    tenantId: tenant1.id,
  }).returning();

  // Lakeside interpreter (Arabic, Hindi, Vietnamese)
  const [interpreter2] = await db.insert(users).values({
    username: "lakeside_interpreter",
    password: hashedPassword,
    role: "interpreter",
    name: "Nadia Hassan, CMI",
    languages: ["ar", "hi", "vi"],
    tenantId: tenant2.id,
  }).returning();

  console.log("Created staff:", riversideAdmin.name, clinician1.name, interpreter1.name, lakesideAdmin.name, clinician2.name, interpreter2.name);

  // === Riverside Patients ===
  const [patient1] = await db.insert(patients).values({
    name: "Rosa Martinez", email: "rosa.martinez@example.com", phone: "+1-555-0101",
    yearOfBirth: 1956, preferredLanguage: "es", lastName: "Martinez", pin: hashedPin, tenantId: tenant1.id,
  }).returning();
  const [patient2] = await db.insert(patients).values({
    name: "Nguyen Thi Lan", email: "nguyen.lan@example.com", phone: "+1-555-0102",
    yearOfBirth: 1968, preferredLanguage: "vi", lastName: "Lan", pin: hashedPin, tenantId: tenant1.id,
  }).returning();
  const [patient3] = await db.insert(patients).values({
    name: "Wei Zhang", email: "wei.zhang@example.com", phone: "+1-555-0103",
    yearOfBirth: 1975, preferredLanguage: "zh", lastName: "Zhang", pin: hashedPin, tenantId: tenant1.id,
  }).returning();
  const [patient6] = await db.insert(patients).values({
    name: "Amadou Diallo", email: "amadou.diallo@example.com", phone: "+1-555-0106",
    yearOfBirth: 1985, preferredLanguage: "fr", lastName: "Diallo", pin: hashedPin, tenantId: tenant1.id,
  }).returning();
  const [patient8] = await db.insert(patients).values({
    name: "Olga Petrov", email: "olga.petrov@example.com", phone: "+1-555-0108",
    yearOfBirth: 1948, preferredLanguage: "ru", lastName: "Petrov", pin: hashedPin, tenantId: tenant1.id,
  }).returning();

  // === Lakeside Patients ===
  const [patient4] = await db.insert(patients).values({
    name: "Fatima Al-Hassan", email: "fatima.alhassan@example.com", phone: "+1-555-0104",
    yearOfBirth: 1990, preferredLanguage: "ar", lastName: "Al-Hassan", pin: hashedPin, tenantId: tenant2.id,
  }).returning();
  const [patient5] = await db.insert(patients).values({
    name: "Aisha Rahman", email: "aisha.rahman@example.com", phone: "+1-555-0105",
    yearOfBirth: 1978, preferredLanguage: "ar", lastName: "Rahman", pin: hashedPin, tenantId: tenant2.id,
  }).returning();
  const [patient7] = await db.insert(patients).values({
    name: "Arjun Sharma", email: "arjun.sharma@example.com", phone: "+1-555-0107",
    yearOfBirth: 2020, preferredLanguage: "hi", lastName: "Sharma", pin: hashedPin, tenantId: tenant2.id,
  }).returning();
  const [patient9] = await db.insert(patients).values({
    name: "Pedro Gutierrez", email: "pedro.gutierrez@example.com", phone: "+1-555-0109",
    yearOfBirth: 1975, preferredLanguage: "es", lastName: "Gutierrez", pin: hashedPin, tenantId: tenant2.id,
  }).returning();
  const [patient10] = await db.insert(patients).values({
    name: "Tran Van Duc", email: "tran.duc@example.com", phone: "+1-555-0110",
    yearOfBirth: 1960, preferredLanguage: "vi", lastName: "Duc", pin: hashedPin, tenantId: tenant2.id,
  }).returning();

  console.log("Created demo patients");

  // ========================================
  // RIVERSIDE CARE PLANS (clinician1)
  // ========================================

  // 1. Rosa Martinez — SENT (Spanish translation), green check-in + pending 2nd
  const token1 = generateToken();
  const [carePlan1] = await db.insert(carePlans).values({
    patientId: patient1.id, clinicianId: clinician1.id, tenantId: tenant1.id, status: "sent",
    originalContent: "DISCHARGE SUMMARY\n\nPatient: Rosa Martinez\nDiagnosis: Type 2 Diabetes with Hypertension\n\nMEDICATIONS:\n1. Metformin 500mg - Take twice daily with meals\n2. Lisinopril 10mg - Take once daily in the morning\n3. Aspirin 81mg - Take once daily\n\nFOLLOW-UP APPOINTMENTS:\n- Primary Care: Dr. Johnson, February 5, 2026 at 10:00 AM\n- Endocrinology: Dr. Patel, February 12, 2026 at 2:00 PM\n\nWARNINGS:\n- Call immediately if you experience chest pain, difficulty breathing, or severe headache\n- Monitor blood sugar daily\n- Avoid excessive salt intake",
    originalFileName: "discharge_rosa_martinez_chf.pdf",
    diagnosis: "Type 2 Diabetes with Hypertension",
    medications: [
      { name: "Metformin", dose: "500mg", frequency: "Twice daily", instructions: "Take with meals" },
      { name: "Lisinopril", dose: "10mg", frequency: "Once daily", instructions: "Take in the morning" },
      { name: "Aspirin", dose: "81mg", frequency: "Once daily", instructions: "Take with food" }
    ],
    appointments: [
      { date: "February 5, 2026", time: "10:00 AM", provider: "Dr. Johnson", location: "Primary Care Clinic", purpose: "Diabetes follow-up" },
      { date: "February 12, 2026", time: "2:00 PM", provider: "Dr. Patel", location: "Endocrinology Dept", purpose: "Specialist consultation" }
    ],
    instructions: "Monitor blood sugar daily. Take medications as prescribed. Follow a low-sodium diet.",
    warnings: "Call immediately if you experience chest pain, difficulty breathing, or severe headache.",
    simplifiedDiagnosis: "You have high blood sugar (diabetes) and high blood pressure.",
    simplifiedMedications: [
      { name: "Metformin", dose: "500mg", frequency: "2 times a day", instructions: "Take when you eat breakfast and dinner" },
      { name: "Lisinopril", dose: "10mg", frequency: "1 time a day", instructions: "Take when you wake up" },
      { name: "Aspirin", dose: "81mg", frequency: "1 time a day", instructions: "Take with any meal" }
    ],
    simplifiedAppointments: [
      { date: "February 5, 2026", time: "10:00 AM", provider: "Dr. Johnson", location: "Primary Care Clinic", purpose: "Check your diabetes" },
      { date: "February 12, 2026", time: "2:00 PM", provider: "Dr. Patel", location: "Endocrinology Dept", purpose: "See the diabetes doctor" }
    ],
    simplifiedInstructions: "Check your blood sugar every day. Take your pills like the doctor said. Don't eat too much salt.",
    simplifiedWarnings: "Call 911 or go to the hospital right away if you have: chest pain, trouble breathing, or a very bad headache.",
    translatedLanguage: "es",
    translatedDiagnosis: "Usted tiene az\u00facar alta en la sangre (diabetes) y presi\u00f3n arterial alta.",
    translatedMedications: [
      { name: "Metformina", dose: "500mg", frequency: "2 veces al d\u00eda", instructions: "Tomar cuando desayune y cene" },
      { name: "Lisinopril", dose: "10mg", frequency: "1 vez al d\u00eda", instructions: "Tomar cuando se despierte" },
      { name: "Aspirina", dose: "81mg", frequency: "1 vez al d\u00eda", instructions: "Tomar con cualquier comida" }
    ],
    translatedAppointments: [
      { date: "5 de febrero de 2026", time: "10:00 AM", provider: "Dr. Johnson", location: "Cl\u00ednica de Atenci\u00f3n Primaria", purpose: "Revisar su diabetes" },
      { date: "12 de febrero de 2026", time: "2:00 PM", provider: "Dr. Patel", location: "Departamento de Endocrinolog\u00eda", purpose: "Ver al m\u00e9dico de diabetes" }
    ],
    translatedInstructions: "Revise su az\u00facar en la sangre todos los d\u00edas. Tome sus pastillas como dijo el m\u00e9dico. No coma mucha sal.",
    translatedWarnings: "Llame al 911 o vaya al hospital de inmediato si tiene: dolor en el pecho, dificultad para respirar, o un dolor de cabeza muy fuerte.",
    backTranslatedDiagnosis: "You have high blood sugar (diabetes) and high blood pressure.",
    backTranslatedInstructions: "Check your blood sugar every day. Take your pills as the doctor said. Don't eat too much salt.",
    backTranslatedWarnings: "Call 911 or go to the hospital right away if you have: chest pain, trouble breathing, or a very strong headache.",
    accessToken: token1,
    accessTokenExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    approvedBy: clinician1.id,
    approvedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    dischargeDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
  }).returning();

  // 2. Nguyen Thi Lan — APPROVED (Vietnamese translation)
  const token2 = generateToken();
  const [carePlan2] = await db.insert(carePlans).values({
    patientId: patient2.id, clinicianId: clinician1.id, tenantId: tenant1.id, status: "approved",
    originalContent: "DISCHARGE SUMMARY\n\nPatient: Nguyen Thi Lan\nDiagnosis: Post-operative care following appendectomy\n\nMEDICATIONS:\n1. Acetaminophen 500mg - Take every 6 hours as needed for pain\n2. Antibiotics (Amoxicillin) 500mg - Take 3 times daily for 7 days\n\nWOUND CARE:\n- Keep incision clean and dry\n- Change bandage daily\n- Watch for signs of infection\n\nFOLLOW-UP:\n- Surgeon: Dr. Williams, February 8, 2026 at 9:00 AM",
    originalFileName: "discharge_nguyen_thi_lan_appendectomy.pdf",
    diagnosis: "Post-operative care following appendectomy",
    medications: [
      { name: "Acetaminophen", dose: "500mg", frequency: "Every 6 hours", instructions: "As needed for pain" },
      { name: "Amoxicillin", dose: "500mg", frequency: "3 times daily", instructions: "Take for 7 days" }
    ],
    appointments: [
      { date: "February 8, 2026", time: "9:00 AM", provider: "Dr. Williams", location: "Surgery Clinic", purpose: "Post-surgery check" }
    ],
    instructions: "Keep incision clean and dry. Change bandage daily. Watch for signs of infection.",
    warnings: "Return to ER if you have fever over 101\u00b0F, increasing pain, or redness around the incision.",
    simplifiedDiagnosis: "You had surgery to remove your appendix. Your body is healing.",
    simplifiedMedications: [
      { name: "Tylenol (Acetaminophen)", dose: "500mg", frequency: "Every 6 hours", instructions: "Take when you have pain" },
      { name: "Amoxicillin", dose: "500mg", frequency: "3 times a day", instructions: "Take for 7 days to stop infection" }
    ],
    simplifiedAppointments: [
      { date: "February 8, 2026", time: "9:00 AM", provider: "Dr. Williams", location: "Surgery Clinic", purpose: "Doctor will check your healing" }
    ],
    simplifiedInstructions: "Keep your cut clean and dry. Put on a new bandage every day. Look for signs that it is infected.",
    simplifiedWarnings: "Go back to the emergency room if you have: fever over 101\u00b0F, more pain, or the skin around your cut becomes red.",
    translatedLanguage: "vi",
    translatedDiagnosis: "B\u1ea1n \u0111\u00e3 ph\u1eabu thu\u1eadt c\u1eaft b\u1ecf ru\u1ed9t th\u1eeba. C\u01a1 th\u1ec3 b\u1ea1n \u0111ang h\u1ed3i ph\u1ee5c.",
    translatedMedications: [
      { name: "Tylenol (Acetaminophen)", dose: "500mg", frequency: "M\u1ed7i 6 gi\u1edd", instructions: "U\u1ed1ng khi b\u1ea1n \u0111au" },
      { name: "Amoxicillin", dose: "500mg", frequency: "3 l\u1ea7n m\u1ed9t ng\u00e0y", instructions: "U\u1ed1ng trong 7 ng\u00e0y \u0111\u1ec3 ng\u0103n nhi\u1ec5m tr\u00f9ng" }
    ],
    translatedAppointments: [
      { date: "Ng\u00e0y 8 th\u00e1ng 2 n\u0103m 2026", time: "9:00 s\u00e1ng", provider: "B\u00e1c s\u0129 Williams", location: "Ph\u00f2ng kh\u00e1m Ph\u1eabu thu\u1eadt", purpose: "B\u00e1c s\u0129 s\u1ebd ki\u1ec3m tra s\u1ef1 h\u1ed3i ph\u1ee5c c\u1ee7a b\u1ea1n" }
    ],
    translatedInstructions: "Gi\u1eef v\u1ebft c\u1eaft s\u1ea1ch v\u00e0 kh\u00f4. Thay b\u0103ng m\u1edbi m\u1ed7i ng\u00e0y. Theo d\u00f5i c\u00e1c d\u1ea5u hi\u1ec7u nhi\u1ec5m tr\u00f9ng.",
    translatedWarnings: "Quay l\u1ea1i ph\u00f2ng c\u1ea5p c\u1ee9u n\u1ebfu b\u1ea1n c\u00f3: s\u1ed1t tr\u00ean 101\u00b0F, \u0111au nhi\u1ec1u h\u01a1n, ho\u1eb7c da quanh v\u1ebft c\u1eaft \u0111\u1ecf l\u00ean.",
    backTranslatedDiagnosis: "You had surgery to remove your appendix. Your body is recovering.",
    backTranslatedInstructions: "Keep the incision clean and dry. Change the bandage every day. Watch for signs of infection.",
    backTranslatedWarnings: "Return to the emergency room if you have: fever over 101\u00b0F, more pain, or the skin around the incision becomes red.",
    accessToken: token2,
    accessTokenExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    approvedBy: clinician1.id, approvedAt: new Date(),
    dischargeDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
  }).returning();

  // 3. Wei Zhang — PENDING_REVIEW (Chinese translation)
  const [carePlan3] = await db.insert(carePlans).values({
    patientId: patient3.id, clinicianId: clinician1.id, tenantId: tenant1.id, status: "pending_review",
    originalContent: "DISCHARGE SUMMARY\n\nPatient: Wei Zhang\nDiagnosis: Acute bronchitis\n\nMEDICATIONS:\n1. Cough syrup (Dextromethorphan) - Take 10ml every 4-6 hours\n2. Ibuprofen 400mg - Take every 6 hours as needed for fever\n3. Antibiotics (Azithromycin) 250mg - Take once daily for 5 days\n\nINSTRUCTIONS:\n- Rest and drink plenty of fluids\n- Use a humidifier\n- Avoid smoking and secondhand smoke",
    originalFileName: "discharge_wei_zhang_pneumonia.pdf",
    diagnosis: "Acute bronchitis",
    medications: [
      { name: "Dextromethorphan", dose: "10ml", frequency: "Every 4-6 hours", instructions: "For cough" },
      { name: "Ibuprofen", dose: "400mg", frequency: "Every 6 hours", instructions: "As needed for fever" },
      { name: "Azithromycin", dose: "250mg", frequency: "Once daily", instructions: "Take for 5 days" }
    ],
    appointments: [
      { date: "February 10, 2026", time: "3:00 PM", provider: "Dr. Lee", location: "Urgent Care", purpose: "Follow-up if not better" }
    ],
    instructions: "Rest and drink plenty of fluids. Use a humidifier. Avoid smoking.",
    warnings: "Seek emergency care if you have trouble breathing, chest pain, or coughing up blood.",
    simplifiedDiagnosis: "You have an infection in your airways that makes you cough.",
    simplifiedMedications: [
      { name: "Cough medicine", dose: "10ml (2 teaspoons)", frequency: "Every 4-6 hours", instructions: "Helps stop coughing" },
      { name: "Ibuprofen", dose: "400mg", frequency: "Every 6 hours", instructions: "Take when you have fever" },
      { name: "Azithromycin", dose: "250mg", frequency: "Once a day", instructions: "Take for 5 days to fight the infection" }
    ],
    simplifiedAppointments: [
      { date: "February 10, 2026", time: "3:00 PM", provider: "Dr. Lee", location: "Urgent Care", purpose: "Come back if you don't feel better" }
    ],
    simplifiedInstructions: "Stay in bed and rest. Drink lots of water, tea, or soup. Use a machine that puts water in the air. Stay away from cigarette smoke.",
    simplifiedWarnings: "Go to the emergency room right away if you: can't breathe well, have chest pain, or cough up blood.",
    translatedLanguage: "zh",
    translatedDiagnosis: "\u60a8\u7684\u6c14\u9053\u611f\u67d3\u4e86\uff0c\u5bfc\u81f4\u54b3\u55fd\u3002",
    translatedMedications: [
      { name: "\u6b62\u54b3\u836f", dose: "10\u6beb\u5347\uff082\u8336\u5319\uff09", frequency: "\u6bcf4-6\u5c0f\u65f6", instructions: "\u5e2e\u52a9\u6b62\u54b3" },
      { name: "\u5e03\u6d1b\u82ac", dose: "400\u6beb\u514b", frequency: "\u6bcf6\u5c0f\u65f6", instructions: "\u53d1\u70e7\u65f6\u670d\u7528" },
      { name: "\u963f\u5947\u9709\u7d20", dose: "250\u6beb\u514b", frequency: "\u6bcf\u5929\u4e00\u6b21", instructions: "\u670d\u75285\u5929\u4ee5\u5bf9\u6297\u611f\u67d3" }
    ],
    translatedAppointments: [
      { date: "2026\u5e742\u670810\u65e5", time: "\u4e0b\u53483:00", provider: "\u674e\u533b\u751f", location: "\u6025\u8bca\u8bca\u6240", purpose: "\u5982\u679c\u6ca1\u6709\u597d\u8f6c\u8bf7\u56de\u6765" }
    ],
    translatedInstructions: "\u5367\u5e8a\u4f11\u606f\u3002\u591a\u559d\u6c34\u3001\u8336\u6216\u6c64\u3002\u4f7f\u7528\u52a0\u6e7f\u5668\u3002\u8fdc\u79bb\u70df\u8349\u70df\u96fe\u3002",
    translatedWarnings: "\u5982\u679c\u60a8\u547c\u5438\u56f0\u96be\u3001\u80f8\u75db\u6216\u54b3\u8840\uff0c\u8bf7\u7acb\u5373\u53bb\u6025\u8bca\u5ba4\u3002",
    backTranslatedDiagnosis: "You have an infection in your airways that causes coughing.",
    backTranslatedInstructions: "Stay in bed and rest. Drink plenty of water, tea, or soup. Use a humidifier. Stay away from cigarette smoke.",
    backTranslatedWarnings: "If you have difficulty breathing, chest pain, or cough up blood, go to the emergency room immediately.",
    dischargeDate: new Date(),
  }).returning();

  // 4. Amadou Diallo — DRAFT (sickle cell)
  const [carePlan6] = await db.insert(carePlans).values({
    patientId: patient6.id, clinicianId: clinician1.id, tenantId: tenant1.id, status: "draft",
    originalContent: "DISCHARGE SUMMARY\n\nPatient: Amadou Diallo\nDiagnosis: Sickle Cell Crisis\n\nMEDICATIONS:\n1. Hydroxyurea 500mg - Once daily\n2. Folic acid 1mg - Once daily\n\nWARNINGS:\n- Seek immediate care for severe pain, fever, or difficulty breathing",
    originalFileName: "discharge_amadou_diallo_sickle_cell.pdf", extractedPatientName: "Amadou Diallo", diagnosis: "Sickle Cell Crisis",
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
  }).returning();

  // 5. Olga Petrov — INTERPRETER_REVIEW (COPD, Russian translation)
  const [carePlan8] = await db.insert(carePlans).values({
    patientId: patient8.id, clinicianId: clinician1.id, tenantId: tenant1.id, status: "interpreter_review",
    originalContent: "DISCHARGE SUMMARY\n\nPatient: Olga Petrov\nDiagnosis: COPD Exacerbation\n\nMEDICATIONS:\n1. Tiotropium 18mcg - Once daily\n2. Prednisone 40mg - Taper over 5 days\n3. Azithromycin 250mg - Once daily for 5 days\n\nWARNINGS:\n- Call if shortness of breath worsens or oxygen levels drop below 90%",
    originalFileName: "discharge_olga_petrov_copd.pdf", extractedPatientName: "Olga Petrov", diagnosis: "COPD Exacerbation",
    medications: [
      { name: "Tiotropium", dose: "18mcg", frequency: "Once daily", instructions: "Inhale once every morning" },
      { name: "Prednisone", dose: "40mg", frequency: "Taper over 5 days", instructions: "Take with food, follow taper schedule" },
      { name: "Azithromycin", dose: "250mg", frequency: "Once daily", instructions: "Take for 5 days to treat infection" }
    ],
    appointments: [
      { date: "February 14, 2026", time: "10:00 AM", provider: "Dr. Park", location: "Pulmonology Clinic", purpose: "COPD follow-up" }
    ],
    instructions: "Use your inhalers as prescribed. Continue oxygen therapy if prescribed. Avoid cold air and smoke. Do breathing exercises daily.",
    warnings: "Call 911 or go to the ER if shortness of breath worsens, oxygen levels drop below 90%, or you develop a high fever.",
    simplifiedDiagnosis: "Your lung disease (COPD) got worse. You were treated in the hospital and are now going home to continue getting better.",
    simplifiedMedications: [
      { name: "Tiotropium (inhaler)", dose: "18mcg", frequency: "Once a day", instructions: "Breathe in the medicine every morning" },
      { name: "Prednisone", dose: "40mg", frequency: "Less each day for 5 days", instructions: "Take with food. Take less each day as the doctor told you." },
      { name: "Azithromycin", dose: "250mg", frequency: "Once a day", instructions: "Take for 5 days to fight the infection" }
    ],
    simplifiedAppointments: [
      { date: "February 14, 2026", time: "10:00 AM", provider: "Dr. Park", location: "Pulmonology Clinic", purpose: "Check how your lungs are doing" }
    ],
    simplifiedInstructions: "Use your inhalers every day. If you have an oxygen machine, use it as the doctor said. Stay away from cold air and smoke. Do the breathing exercises the doctor showed you.",
    simplifiedWarnings: "Call 911 or go to the hospital right away if: you can't breathe well, your oxygen level is below 90%, or you get a high fever.",
    translatedLanguage: "ru",
    translatedDiagnosis: "\u0412\u0430\u0448\u0435 \u0437\u0430\u0431\u043e\u043b\u0435\u0432\u0430\u043d\u0438\u0435 \u043b\u0435\u0433\u043a\u0438\u0445 (\u0425\u041e\u0411\u041b) \u043e\u0431\u043e\u0441\u0442\u0440\u0438\u043b\u043e\u0441\u044c. \u0412\u0430\u0441 \u043b\u0435\u0447\u0438\u043b\u0438 \u0432 \u0431\u043e\u043b\u044c\u043d\u0438\u0446\u0435, \u0438 \u0442\u0435\u043f\u0435\u0440\u044c \u0432\u044b \u0432\u043e\u0437\u0432\u0440\u0430\u0449\u0430\u0435\u0442\u0435\u0441\u044c \u0434\u043e\u043c\u043e\u0439 \u0434\u043b\u044f \u0432\u044b\u0437\u0434\u043e\u0440\u043e\u0432\u043b\u0435\u043d\u0438\u044f.",
    translatedMedications: [
      { name: "\u0422\u0438\u043e\u0442\u0440\u043e\u043f\u0438\u0443\u043c (\u0438\u043d\u0433\u0430\u043b\u044f\u0442\u043e\u0440)", dose: "18 \u043c\u043a\u0433", frequency: "\u041e\u0434\u0438\u043d \u0440\u0430\u0437 \u0432 \u0434\u0435\u043d\u044c", instructions: "\u0412\u0434\u044b\u0445\u0430\u0439\u0442\u0435 \u043b\u0435\u043a\u0430\u0440\u0441\u0442\u0432\u043e \u043a\u0430\u0436\u0434\u043e\u0435 \u0443\u0442\u0440\u043e" },
      { name: "\u041f\u0440\u0435\u0434\u043d\u0438\u0437\u043e\u043d", dose: "40 \u043c\u0433", frequency: "\u041c\u0435\u043d\u044c\u0448\u0435 \u043a\u0430\u0436\u0434\u044b\u0439 \u0434\u0435\u043d\u044c \u0432 \u0442\u0435\u0447\u0435\u043d\u0438\u0435 5 \u0434\u043d\u0435\u0439", instructions: "\u041f\u0440\u0438\u043d\u0438\u043c\u0430\u0439\u0442\u0435 \u0441 \u0435\u0434\u043e\u0439. \u0423\u043c\u0435\u043d\u044c\u0448\u0430\u0439\u0442\u0435 \u0434\u043e\u0437\u0443 \u043a\u0430\u0436\u0434\u044b\u0439 \u0434\u0435\u043d\u044c \u043a\u0430\u043a \u0441\u043a\u0430\u0437\u0430\u043b \u0432\u0440\u0430\u0447." },
      { name: "\u0410\u0437\u0438\u0442\u0440\u043e\u043c\u0438\u0446\u0438\u043d", dose: "250 \u043c\u0433", frequency: "\u041e\u0434\u0438\u043d \u0440\u0430\u0437 \u0432 \u0434\u0435\u043d\u044c", instructions: "\u041f\u0440\u0438\u043d\u0438\u043c\u0430\u0439\u0442\u0435 5 \u0434\u043d\u0435\u0439 \u0434\u043b\u044f \u0431\u043e\u0440\u044c\u0431\u044b \u0441 \u0438\u043d\u0444\u0435\u043a\u0446\u0438\u0435\u0439" }
    ],
    translatedAppointments: [
      { date: "14 \u0444\u0435\u0432\u0440\u0430\u043b\u044f 2026", time: "10:00 \u0443\u0442\u0440\u0430", provider: "\u0414\u043e\u043a\u0442\u043e\u0440 \u041f\u0430\u0440\u043a", location: "\u041f\u0443\u043b\u044c\u043c\u043e\u043d\u043e\u043b\u043e\u0433\u0438\u0447\u0435\u0441\u043a\u0430\u044f \u043a\u043b\u0438\u043d\u0438\u043a\u0430", purpose: "\u041f\u0440\u043e\u0432\u0435\u0440\u0438\u0442\u044c \u0441\u043e\u0441\u0442\u043e\u044f\u043d\u0438\u0435 \u0432\u0430\u0448\u0438\u0445 \u043b\u0435\u0433\u043a\u0438\u0445" }
    ],
    translatedInstructions: "\u0418\u0441\u043f\u043e\u043b\u044c\u0437\u0443\u0439\u0442\u0435 \u0438\u043d\u0433\u0430\u043b\u044f\u0442\u043e\u0440\u044b \u043a\u0430\u0436\u0434\u044b\u0439 \u0434\u0435\u043d\u044c. \u0415\u0441\u043b\u0438 \u0443 \u0432\u0430\u0441 \u0435\u0441\u0442\u044c \u043a\u0438\u0441\u043b\u043e\u0440\u043e\u0434\u043d\u044b\u0439 \u0430\u043f\u043f\u0430\u0440\u0430\u0442, \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u0443\u0439\u0442\u0435 \u0435\u0433\u043e \u043a\u0430\u043a \u0441\u043a\u0430\u0437\u0430\u043b \u0432\u0440\u0430\u0447. \u0418\u0437\u0431\u0435\u0433\u0430\u0439\u0442\u0435 \u0445\u043e\u043b\u043e\u0434\u043d\u043e\u0433\u043e \u0432\u043e\u0437\u0434\u0443\u0445\u0430 \u0438 \u0434\u044b\u043c\u0430. \u0412\u044b\u043f\u043e\u043b\u043d\u044f\u0439\u0442\u0435 \u0434\u044b\u0445\u0430\u0442\u0435\u043b\u044c\u043d\u044b\u0435 \u0443\u043f\u0440\u0430\u0436\u043d\u0435\u043d\u0438\u044f, \u043a\u043e\u0442\u043e\u0440\u044b\u0435 \u043f\u043e\u043a\u0430\u0437\u0430\u043b \u0432\u0440\u0430\u0447.",
    translatedWarnings: "\u0412\u044b\u0437\u043e\u0432\u0438\u0442\u0435 \u0441\u043a\u043e\u0440\u0443\u044e \u043f\u043e\u043c\u043e\u0449\u044c \u0438\u043b\u0438 \u043f\u043e\u0435\u0437\u0436\u0430\u0439\u0442\u0435 \u0432 \u0431\u043e\u043b\u044c\u043d\u0438\u0446\u0443 \u0435\u0441\u043b\u0438: \u0432\u0430\u043c \u0442\u0440\u0443\u0434\u043d\u043e \u0434\u044b\u0448\u0430\u0442\u044c, \u0443\u0440\u043e\u0432\u0435\u043d\u044c \u043a\u0438\u0441\u043b\u043e\u0440\u043e\u0434\u0430 \u043d\u0438\u0436\u0435 90%, \u0438\u043b\u0438 \u0443 \u0432\u0430\u0441 \u0432\u044b\u0441\u043e\u043a\u0430\u044f \u0442\u0435\u043c\u043f\u0435\u0440\u0430\u0442\u0443\u0440\u0430.",
    backTranslatedDiagnosis: "Your lung disease (COPD) has worsened. You were treated in the hospital and are now returning home to recover.",
    backTranslatedInstructions: "Use your inhalers every day. If you have an oxygen machine, use it as the doctor said. Avoid cold air and smoke. Do the breathing exercises the doctor showed you.",
    backTranslatedWarnings: "Call an ambulance or go to the hospital if: you have difficulty breathing, oxygen level is below 90%, or you have a high fever.",
    interpreterNotes: "Reviewed COPD terminology. Russian medical terms verified for accuracy. Patient is elderly and may need family assistance with inhaler technique.",
    dischargeDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), updatedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
  }).returning();

  // ========================================
  // LAKESIDE CARE PLANS (clinician2)
  // ========================================

  // 1. Aisha Rahman — SENT (Arabic translation), yellow alert check-in
  const token5 = generateToken();
  const [carePlan5] = await db.insert(carePlans).values({
    patientId: patient5.id, clinicianId: clinician2.id, tenantId: tenant2.id, status: "sent",
    originalContent: "DISCHARGE SUMMARY\n\nPatient: Aisha Rahman\nDiagnosis: Congestive Heart Failure (CHF)\n\nMEDICATIONS:\n1. Furosemide 40mg - Take once daily in the morning\n2. Lisinopril 10mg - Take once daily\n3. Metoprolol 25mg - Take twice daily\n\nMONITORING:\n- Weigh yourself every morning\n- Check for swelling in ankles/legs\n\nFOLLOW-UP:\n- Cardiologist: Dr. Chen, February 10, 2026 at 2:00 PM",
    originalFileName: "discharge_aisha_rahman_chf.pdf",
    diagnosis: "Congestive Heart Failure (CHF)",
    medications: [
      { name: "Furosemide", dose: "40mg", frequency: "Once daily", instructions: "Take in the morning" },
      { name: "Lisinopril", dose: "10mg", frequency: "Once daily", instructions: "Take in the morning" },
      { name: "Metoprolol", dose: "25mg", frequency: "Twice daily", instructions: "Take morning and evening" }
    ],
    appointments: [
      { date: "February 10, 2026", time: "2:00 PM", provider: "Dr. Chen", location: "Cardiology Clinic", purpose: "Heart failure follow-up" }
    ],
    instructions: "Weigh yourself every morning. Check for swelling in ankles and legs. Limit salt and fluid intake.",
    warnings: "Call your doctor immediately if you have sudden weight gain, severe swelling, or difficulty breathing.",
    simplifiedDiagnosis: "Your heart is not pumping as well as it should. This is called heart failure.",
    simplifiedMedications: [
      { name: "Furosemide (water pill)", dose: "40mg", frequency: "Once a day", instructions: "Take in the morning" },
      { name: "Lisinopril", dose: "10mg", frequency: "Once a day", instructions: "Take in the morning" },
      { name: "Metoprolol", dose: "25mg", frequency: "2 times a day", instructions: "Take morning and evening" }
    ],
    simplifiedAppointments: [
      { date: "February 10, 2026", time: "2:00 PM", provider: "Dr. Chen", location: "Cardiology Clinic", purpose: "Check on your heart" }
    ],
    simplifiedInstructions: "Weigh yourself every morning. Look for swelling in your feet and legs. Don't eat too much salt. Don't drink too much water.",
    simplifiedWarnings: "Call your doctor right away if you gain a lot of weight suddenly, your feet swell a lot, or you can't breathe well.",
    translatedLanguage: "ar",
    translatedDiagnosis: "\u0642\u0644\u0628\u0643 \u0644\u0627 \u064a\u0636\u062e \u0627\u0644\u062f\u0645 \u0643\u0645\u0627 \u064a\u0646\u0628\u063a\u064a. \u0647\u0630\u0627 \u064a\u0633\u0645\u0649 \u0642\u0635\u0648\u0631 \u0627\u0644\u0642\u0644\u0628.",
    translatedMedications: [
      { name: "\u0641\u0648\u0631\u0648\u0633\u064a\u0645\u064a\u062f (\u062d\u0628\u0629 \u0627\u0644\u0645\u0627\u0621)", dose: "40 \u0645\u0644\u063a", frequency: "\u0645\u0631\u0629 \u0648\u0627\u062d\u062f\u0629 \u0641\u064a \u0627\u0644\u064a\u0648\u0645", instructions: "\u062a\u0646\u0627\u0648\u0644\u0647 \u0641\u064a \u0627\u0644\u0635\u0628\u0627\u062d" },
      { name: "\u0644\u064a\u0633\u064a\u0646\u0648\u0628\u0631\u064a\u0644", dose: "10 \u0645\u0644\u063a", frequency: "\u0645\u0631\u0629 \u0648\u0627\u062d\u062f\u0629 \u0641\u064a \u0627\u0644\u064a\u0648\u0645", instructions: "\u062a\u0646\u0627\u0648\u0644\u0647 \u0641\u064a \u0627\u0644\u0635\u0628\u0627\u062d" },
      { name: "\u0645\u064a\u062a\u0648\u0628\u0631\u0648\u0644\u0648\u0644", dose: "25 \u0645\u0644\u063a", frequency: "\u0645\u0631\u062a\u064a\u0646 \u0641\u064a \u0627\u0644\u064a\u0648\u0645", instructions: "\u062a\u0646\u0627\u0648\u0644\u0647 \u0635\u0628\u0627\u062d\u0627\u064b \u0648\u0645\u0633\u0627\u0621\u064b" }
    ],
    translatedAppointments: [
      { date: "10 \u0641\u0628\u0631\u0627\u064a\u0631 2026", time: "2:00 \u0645\u0633\u0627\u0621\u064b", provider: "\u062f. \u062a\u0634\u064a\u0646", location: "\u0639\u064a\u0627\u062f\u0629 \u0627\u0644\u0642\u0644\u0628", purpose: "\u0641\u062d\u0635 \u0642\u0644\u0628\u0643" }
    ],
    translatedInstructions: "\u0632\u0646 \u0646\u0641\u0633\u0643 \u0643\u0644 \u0635\u0628\u0627\u062d. \u0627\u0628\u062d\u062b \u0639\u0646 \u062a\u0648\u0631\u0645 \u0641\u064a \u0642\u062f\u0645\u064a\u0643 \u0648\u0633\u0627\u0642\u064a\u0643. \u0644\u0627 \u062a\u0623\u0643\u0644 \u0627\u0644\u0643\u062b\u064a\u0631 \u0645\u0646 \u0627\u0644\u0645\u0644\u062d. \u0644\u0627 \u062a\u0634\u0631\u0628 \u0627\u0644\u0643\u062b\u064a\u0631 \u0645\u0646 \u0627\u0644\u0645\u0627\u0621.",
    translatedWarnings: "\u0627\u062a\u0635\u0644 \u0628\u0637\u0628\u064a\u0628\u0643 \u0641\u0648\u0631\u0627\u064b \u0625\u0630\u0627 \u0632\u0627\u062f \u0648\u0632\u0646\u0643 \u0643\u062b\u064a\u0631\u0627\u064b \u0641\u062c\u0623\u0629\u060c \u0623\u0648 \u062a\u0648\u0631\u0645\u062a \u0642\u062f\u0645\u0627\u0643 \u0643\u062b\u064a\u0631\u0627\u064b\u060c \u0623\u0648 \u0644\u0645 \u062a\u0633\u062a\u0637\u0639 \u0627\u0644\u062a\u0646\u0641\u0633 \u062c\u064a\u062f\u0627\u064b.",
    backTranslatedDiagnosis: "Your heart is not pumping blood as it should. This is called heart failure.",
    backTranslatedInstructions: "Weigh yourself every morning. Look for swelling in your feet and legs. Don't eat too much salt. Don't drink too much water.",
    backTranslatedWarnings: "Call your doctor immediately if you gain a lot of weight suddenly, your feet swell a lot, or you can't breathe well.",
    accessToken: token5,
    accessTokenExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    approvedBy: clinician2.id, approvedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    dischargeDate: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
  }).returning();

  // 2. Pedro Gutierrez — APPROVED (Spanish translation, knee arthroscopy)
  const tokenPedro = generateToken();
  const [carePlan9] = await db.insert(carePlans).values({
    patientId: patient9.id, clinicianId: clinician2.id, tenantId: tenant2.id, status: "approved",
    originalContent: "DISCHARGE SUMMARY\n\nPatient: Pedro Gutierrez\nDiagnosis: Post-Operative Knee Arthroscopy\n\nMEDICATIONS:\n1. Oxycodone 5mg - Every 4-6 hours as needed for pain\n2. Ibuprofen 600mg - Every 8 hours with food\n\nWARNINGS:\n- Keep leg elevated, watch for increased swelling, redness, or fever",
    originalFileName: "discharge_pedro_gutierrez_knee.pdf",
    diagnosis: "Post-Operative Knee Arthroscopy",
    medications: [
      { name: "Oxycodone", dose: "5mg", frequency: "Every 4-6 hours", instructions: "As needed for pain" },
      { name: "Ibuprofen", dose: "600mg", frequency: "Every 8 hours", instructions: "Take with food" }
    ],
    appointments: [
      { date: "February 15, 2026", time: "11:00 AM", provider: "Dr. Ramirez", location: "Orthopedic Clinic", purpose: "Post-surgery follow-up" }
    ],
    instructions: "Keep leg elevated. Apply ice for 20 minutes every 2 hours. Begin gentle range-of-motion exercises as instructed. Use crutches for the first week.",
    warnings: "Return to ER if you have severe swelling, redness, fever over 101\u00b0F, or numbness in your foot.",
    simplifiedDiagnosis: "You had surgery on your knee to fix a problem inside the joint. Your knee is healing.",
    simplifiedMedications: [
      { name: "Oxycodone (pain medicine)", dose: "5mg", frequency: "Every 4-6 hours", instructions: "Take only when you have pain. Do not drive while taking this." },
      { name: "Ibuprofen", dose: "600mg", frequency: "Every 8 hours", instructions: "Take with food to protect your stomach" }
    ],
    simplifiedAppointments: [
      { date: "February 15, 2026", time: "11:00 AM", provider: "Dr. Ramirez", location: "Orthopedic Clinic", purpose: "Doctor will check how your knee is healing" }
    ],
    simplifiedInstructions: "Keep your leg up on pillows. Put ice on your knee for 20 minutes, then take it off for 20 minutes. Do the simple exercises the doctor showed you. Use crutches when you walk for the first week.",
    simplifiedWarnings: "Go back to the emergency room if your knee swells a lot, turns red, you get a fever, or your foot feels numb.",
    translatedLanguage: "es",
    translatedDiagnosis: "Le hicieron una cirug\u00eda en la rodilla para arreglar un problema dentro de la articulaci\u00f3n. Su rodilla est\u00e1 sanando.",
    translatedMedications: [
      { name: "Oxicodona (medicina para el dolor)", dose: "5mg", frequency: "Cada 4-6 horas", instructions: "Tomar solo cuando tenga dolor. No maneje mientras tome esta medicina." },
      { name: "Ibuprofeno", dose: "600mg", frequency: "Cada 8 horas", instructions: "Tomar con comida para proteger su est\u00f3mago" }
    ],
    translatedAppointments: [
      { date: "15 de febrero de 2026", time: "11:00 AM", provider: "Dr. Ram\u00edrez", location: "Cl\u00ednica de Ortopedia", purpose: "El doctor revisar\u00e1 c\u00f3mo est\u00e1 sanando su rodilla" }
    ],
    translatedInstructions: "Mantenga su pierna elevada sobre almohadas. Ponga hielo en su rodilla por 20 minutos, luego qu\u00edtelo por 20 minutos. Haga los ejercicios simples que el doctor le mostr\u00f3. Use muletas cuando camine durante la primera semana.",
    translatedWarnings: "Regrese a la sala de emergencias si su rodilla se hincha mucho, se pone roja, tiene fiebre, o su pie se siente adormecido.",
    backTranslatedDiagnosis: "You had surgery on your knee to fix a problem inside the joint. Your knee is healing.",
    backTranslatedInstructions: "Keep your leg elevated on pillows. Put ice on your knee for 20 minutes, then remove it for 20 minutes. Do the simple exercises the doctor showed you. Use crutches when walking during the first week.",
    backTranslatedWarnings: "Return to the emergency room if your knee swells a lot, turns red, you have a fever, or your foot feels numb.",
    accessToken: tokenPedro,
    accessTokenExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    approvedBy: clinician2.id, approvedAt: new Date(),
    dischargeDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
  }).returning();

  // 3. Fatima Al-Hassan — INTERPRETER_APPROVED (gestational diabetes, Arabic translation)
  const tokenFatima = generateToken();
  const [carePlan4] = await db.insert(carePlans).values({
    patientId: patient4.id, clinicianId: clinician2.id, tenantId: tenant2.id, status: "interpreter_approved",
    originalContent: "DISCHARGE SUMMARY\n\nPatient: Fatima Al-Hassan\nDiagnosis: Gestational diabetes\n\nMEDICATIONS:\n1. Insulin (as directed)\n2. Prenatal vitamins - Take daily\n\nMONITORING:\n- Check blood sugar 4 times daily\n- Keep food diary\n\nFOLLOW-UP:\n- OB-GYN: Dr. Martinez, February 3, 2026",
    originalFileName: "discharge_fatima_al_hassan_gestational_diabetes.pdf",
    diagnosis: "Gestational diabetes",
    medications: [
      { name: "Insulin", dose: "As directed", frequency: "As directed by doctor", instructions: "Inject as your doctor showed you. Keep insulin in the refrigerator." },
      { name: "Prenatal Vitamins", dose: "1 tablet", frequency: "Once daily", instructions: "Take with food" }
    ],
    appointments: [
      { date: "February 3, 2026", time: "9:00 AM", provider: "Dr. Martinez", location: "OB-GYN Clinic", purpose: "Gestational diabetes follow-up" },
      { date: "February 17, 2026", time: "2:00 PM", provider: "Dr. Patel", location: "Endocrinology Dept", purpose: "Blood sugar management review" }
    ],
    instructions: "Check blood sugar 4 times daily (before meals and at bedtime). Keep a food diary. Follow the meal plan given by the dietitian. Walk for 30 minutes after meals.",
    warnings: "Call your doctor immediately if your blood sugar is over 200 mg/dL, you feel dizzy or faint, or you have blurred vision.",
    simplifiedDiagnosis: "You have high blood sugar during your pregnancy. This is called gestational diabetes. It needs to be managed carefully for you and your baby.",
    simplifiedMedications: [
      { name: "Insulin (injection)", dose: "As your doctor told you", frequency: "As your doctor told you", instructions: "Give yourself the shot like the doctor showed you. Keep the insulin cold in the fridge." },
      { name: "Prenatal Vitamins", dose: "1 pill", frequency: "Once a day", instructions: "Take with food" }
    ],
    simplifiedAppointments: [
      { date: "February 3, 2026", time: "9:00 AM", provider: "Dr. Martinez", location: "OB-GYN Clinic", purpose: "Check on your diabetes during pregnancy" },
      { date: "February 17, 2026", time: "2:00 PM", provider: "Dr. Patel", location: "Endocrinology Dept", purpose: "Check how your blood sugar is being managed" }
    ],
    simplifiedInstructions: "Check your blood sugar 4 times a day: before breakfast, before lunch, before dinner, and before bed. Write down everything you eat. Follow the meal plan from the dietitian. Walk for 30 minutes after you eat.",
    simplifiedWarnings: "Call your doctor right away if: your blood sugar is over 200, you feel dizzy or like you might faint, or things look blurry.",
    translatedLanguage: "ar",
    translatedDiagnosis: "\u0644\u062f\u064a\u0643 \u0627\u0631\u062a\u0641\u0627\u0639 \u0641\u064a \u0633\u0643\u0631 \u0627\u0644\u062f\u0645 \u0623\u062b\u0646\u0627\u0621 \u0627\u0644\u062d\u0645\u0644. \u0647\u0630\u0627 \u064a\u0633\u0645\u0649 \u0633\u0643\u0631\u064a \u0627\u0644\u062d\u0645\u0644. \u064a\u062c\u0628 \u0625\u062f\u0627\u0631\u062a\u0647 \u0628\u0639\u0646\u0627\u064a\u0629 \u0645\u0646 \u0623\u062c\u0644\u0643 \u0648\u0645\u0646 \u0623\u062c\u0644 \u0637\u0641\u0644\u0643.",
    translatedMedications: [
      { name: "\u0627\u0644\u0623\u0646\u0633\u0648\u0644\u064a\u0646 (\u062d\u0642\u0646\u0629)", dose: "\u0643\u0645\u0627 \u0623\u062e\u0628\u0631\u0643 \u0627\u0644\u0637\u0628\u064a\u0628", frequency: "\u0643\u0645\u0627 \u0623\u062e\u0628\u0631\u0643 \u0627\u0644\u0637\u0628\u064a\u0628", instructions: "\u0627\u062d\u0642\u0646\u064a \u0646\u0641\u0633\u0643 \u0643\u0645\u0627 \u0623\u0631\u0627\u0643 \u0627\u0644\u0637\u0628\u064a\u0628. \u0627\u062d\u0641\u0638\u064a \u0627\u0644\u0623\u0646\u0633\u0648\u0644\u064a\u0646 \u0641\u064a \u0627\u0644\u062b\u0644\u0627\u062c\u0629." },
      { name: "\u0641\u064a\u062a\u0627\u0645\u064a\u0646\u0627\u062a \u0645\u0627 \u0642\u0628\u0644 \u0627\u0644\u0648\u0644\u0627\u062f\u0629", dose: "\u062d\u0628\u0629 \u0648\u0627\u062d\u062f\u0629", frequency: "\u0645\u0631\u0629 \u0648\u0627\u062d\u062f\u0629 \u0641\u064a \u0627\u0644\u064a\u0648\u0645", instructions: "\u062a\u0646\u0627\u0648\u0644\u064a\u0647\u0627 \u0645\u0639 \u0627\u0644\u0637\u0639\u0627\u0645" }
    ],
    translatedAppointments: [
      { date: "3 \u0641\u0628\u0631\u0627\u064a\u0631 2026", time: "9:00 \u0635\u0628\u0627\u062d\u0627\u064b", provider: "\u062f. \u0645\u0627\u0631\u062a\u064a\u0646\u064a\u0632", location: "\u0639\u064a\u0627\u062f\u0629 \u0627\u0644\u0646\u0633\u0627\u0621 \u0648\u0627\u0644\u062a\u0648\u0644\u064a\u062f", purpose: "\u0641\u062d\u0635 \u0633\u0643\u0631\u064a \u0627\u0644\u062d\u0645\u0644" },
      { date: "17 \u0641\u0628\u0631\u0627\u064a\u0631 2026", time: "2:00 \u0645\u0633\u0627\u0621\u064b", provider: "\u062f. \u0628\u0627\u062a\u064a\u0644", location: "\u0642\u0633\u0645 \u0627\u0644\u063a\u062f\u062f \u0627\u0644\u0635\u0645\u0627\u0621", purpose: "\u0645\u0631\u0627\u062c\u0639\u0629 \u0625\u062f\u0627\u0631\u0629 \u0633\u0643\u0631 \u0627\u0644\u062f\u0645" }
    ],
    translatedInstructions: "\u0627\u0641\u062d\u0635\u064a \u0633\u0643\u0631 \u0627\u0644\u062f\u0645 4 \u0645\u0631\u0627\u062a \u0641\u064a \u0627\u0644\u064a\u0648\u0645: \u0642\u0628\u0644 \u0627\u0644\u0625\u0641\u0637\u0627\u0631\u060c \u0642\u0628\u0644 \u0627\u0644\u063a\u062f\u0627\u0621\u060c \u0642\u0628\u0644 \u0627\u0644\u0639\u0634\u0627\u0621\u060c \u0648\u0642\u0628\u0644 \u0627\u0644\u0646\u0648\u0645. \u0627\u0643\u062a\u0628\u064a \u0643\u0644 \u0645\u0627 \u062a\u0623\u0643\u0644\u064a\u0646. \u0627\u062a\u0628\u0639\u064a \u062e\u0637\u0629 \u0627\u0644\u0648\u062c\u0628\u0627\u062a \u0645\u0646 \u0623\u062e\u0635\u0627\u0626\u064a\u0629 \u0627\u0644\u062a\u063a\u0630\u064a\u0629. \u0627\u0645\u0634\u064a 30 \u062f\u0642\u064a\u0642\u0629 \u0628\u0639\u062f \u0627\u0644\u0623\u0643\u0644.",
    translatedWarnings: "\u0627\u062a\u0635\u0644\u064a \u0628\u0637\u0628\u064a\u0628\u0643 \u0641\u0648\u0631\u0627\u064b \u0625\u0630\u0627: \u0643\u0627\u0646 \u0633\u0643\u0631 \u0627\u0644\u062f\u0645 \u0623\u0643\u062b\u0631 \u0645\u0646 200\u060c \u0634\u0639\u0631\u062a\u064a \u0628\u0627\u0644\u062f\u0648\u0627\u0631 \u0623\u0648 \u0643\u0623\u0646\u0643 \u0633\u062a\u063a\u0645\u064a\u0646 \u0639\u0644\u064a\u0643\u060c \u0623\u0648 \u0631\u0623\u064a\u062a\u064a \u0627\u0644\u0623\u0634\u064a\u0627\u0621 \u0636\u0628\u0627\u0628\u064a\u0629.",
    backTranslatedDiagnosis: "You have high blood sugar during pregnancy. This is called gestational diabetes. It must be managed carefully for you and your baby.",
    backTranslatedInstructions: "Check your blood sugar 4 times a day: before breakfast, before lunch, before dinner, and before bed. Write down everything you eat. Follow the meal plan from the nutrition specialist. Walk 30 minutes after eating.",
    backTranslatedWarnings: "Call your doctor immediately if: blood sugar is over 200, you feel dizzy or like you might faint, or you see things blurry.",
    interpreterNotes: "Reviewed gestational diabetes terminology in Arabic. Medical terms verified. Insulin injection instructions clarified for cultural sensitivity.",
    accessToken: tokenFatima,
    accessTokenExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    approvedBy: clinician2.id,
    approvedAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
    interpreterReviewedBy: interpreter2.id,
    interpreterReviewedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    dischargeDate: new Date(),
  }).returning();

  // 4. Arjun Sharma — COMPLETED (asthma, Hindi translation)
  const tokenArjun = generateToken();
  const [carePlan7] = await db.insert(carePlans).values({
    patientId: patient7.id, clinicianId: clinician2.id, tenantId: tenant2.id, status: "completed",
    originalContent: "DISCHARGE SUMMARY\n\nPatient: Arjun Sharma (Pediatric)\nDiagnosis: Acute Asthma Exacerbation\n\nMEDICATIONS:\n1. Albuterol inhaler - Every 4-6 hours as needed\n2. Prednisolone 15mg - Once daily for 5 days\n\nWARNINGS:\n- Return if breathing worsens or lips turn blue",
    originalFileName: "discharge_arjun_sharma_asthma.pdf", extractedPatientName: "Arjun Sharma", diagnosis: "Acute Asthma Exacerbation",
    medications: [
      { name: "Albuterol Inhaler", dose: "2 puffs", frequency: "Every 4-6 hours", instructions: "Use as needed for wheezing or shortness of breath" },
      { name: "Prednisolone", dose: "15mg", frequency: "Once daily", instructions: "Take for 5 days with food" }
    ],
    appointments: [
      { date: "February 7, 2026", time: "10:00 AM", provider: "Dr. Gupta", location: "Pediatric Clinic", purpose: "Asthma follow-up" },
      { date: "February 21, 2026", time: "3:00 PM", provider: "Dr. Singh", location: "Pulmonology Dept", purpose: "Lung function test" }
    ],
    instructions: "Use the inhaler before physical activity. Avoid known triggers (dust, pollen, cold air). Keep rescue inhaler accessible at all times. Monitor breathing with peak flow meter.",
    warnings: "Call 911 or go to the ER immediately if: breathing gets much worse, lips or fingernails turn blue, the inhaler is not helping, or the child cannot speak in full sentences.",
    simplifiedDiagnosis: "Your child had a bad asthma attack. His lungs got very tight and it was hard for him to breathe. He was treated in the hospital and is now better.",
    simplifiedMedications: [
      { name: "Albuterol Inhaler (rescue inhaler)", dose: "2 puffs", frequency: "Every 4-6 hours", instructions: "Use when your child is wheezing or having trouble breathing" },
      { name: "Prednisolone (liquid medicine)", dose: "15mg", frequency: "Once a day", instructions: "Give with food for 5 days to reduce swelling in the lungs" }
    ],
    simplifiedAppointments: [
      { date: "February 7, 2026", time: "10:00 AM", provider: "Dr. Gupta", location: "Pediatric Clinic", purpose: "Check on your child's asthma" },
      { date: "February 21, 2026", time: "3:00 PM", provider: "Dr. Singh", location: "Pulmonology Dept", purpose: "Test how well your child's lungs are working" }
    ],
    simplifiedInstructions: "Use the inhaler before your child plays or runs. Keep your child away from dust, pollen, and cold air. Always keep the rescue inhaler nearby. Use the breathing meter to check how well your child is breathing.",
    simplifiedWarnings: "Call 911 or go to the hospital right away if: your child can't breathe well, lips or fingernails turn blue, the inhaler doesn't help, or your child can't talk in full sentences.",
    translatedLanguage: "hi",
    translatedDiagnosis: "\u0906\u092a\u0915\u0947 \u092c\u091a\u094d\u091a\u0947 \u0915\u094b \u0905\u0938\u094d\u0925\u092e\u0627 \u0915\u0627 \u0924\u0940\u0935\u094d\u0930 \u0926\u094c\u0930\u0627 \u092a\u0921\u093c\u0927\u0930. \u0909\u0938\u0915\u0947 \u092b\u0947\u092b\u0921\u093c\u0947 \u092c\u0939\u0941\u0924 \u0924\u0902\u0917 \u0939\u094b \u0917\u090f \u0925\u0947 \u0914\u0930 \u0909\u0938\u0947 \u0938\u0901\u0938 \u0932\u0947\u0928\u0947 \u092e\u0947\u0902 \u092e\u0941\u0936\u094d\u0915\u093f\u0932 \u0939\u094b \u0930\u0939\u0940 \u0925\u0940\u0964 \u0905\u0938\u094d\u092a\u0924\u0627\u0932 \u092e\u0947\u0902 \u0907\u0932\u0627\u091c \u0939\u0941\u0906 \u0914\u0930 \u0905\u092c \u0935\u0939 \u0920\u0940\u0915 \u0939\u0948\u0964",
    translatedMedications: [
      { name: "\u0905\u0932\u094d\u092c\u094d\u092f\u0942\u091f\u0930\u094b\u0932 \u0907\u0928\u0939\u0947\u0932\u0930 (\u0930\u0947\u0938\u094d\u0915\u094d\u092f\u0942 \u0907\u0928\u0939\u0947\u0932\u0930)", dose: "2 \u092a\u092b\u094d\u092b\u094d\u0938", frequency: "\u0939\u0930 4-6 \u0918\u0902\u091f\u0947", instructions: "\u091c\u092c \u092c\u091a\u094d\u091a\u0947 \u0915\u094b \u0938\u0901\u0938 \u0932\u0947\u0928\u0947 \u092e\u0947\u0902 \u0924\u0915\u0932\u0940\u092b \u0939\u094b \u0924\u092c \u0907\u0938\u094d\u0924\u0947\u092e\u0627\u0932 \u0915\u0930\u0947\u0902" },
      { name: "\u092a\u094d\u0930\u0947\u0921\u0928\u093f\u0938\u094b\u0932\u094b\u0928 (\u0924\u0930\u0932 \u0926\u0935\u0627\u0908)", dose: "15 \u092e\u093f\u0932\u0940\u0917\u094d\u0930\u0927\u092e", frequency: "\u0926\u093f\u0928 \u092e\u0947\u0902 \u090f\u0915 \u092c\u0927\u0930", instructions: "\u092b\u0947\u092b\u0921\u093c\u094b\u0902 \u0915\u0940 \u0938\u0942\u091c\u0928 \u0915\u092e \u0915\u0930\u0928\u0947 \u0915\u0947 \u0932\u093f\u090f 5 \u0926\u093f\u0928 \u0924\u0915 \u0916\u0427\u0928\u0947 \u0915\u0947 \u0938\u0627\u0925 \u0926\u0947\u0902" }
    ],
    translatedAppointments: [
      { date: "7 \u092b\u0930\u0935\u0930\u0940 2026", time: "\u0938\u0941\u092c\u0939 10:00", provider: "\u0921\u0949. \u0917\u0941\u092a\u094d\u0924\u0427", location: "\u092c\u0427\u0932 \u0930\u094b\u0917 \u0915\u094d\u0932\u093f\u0928\u093f\u0915", purpose: "\u092c\u091a\u094d\u091a\u0947 \u0915\u0947 \u0905\u0938\u094d\u0925\u092e\u0927 \u0915\u0940 \u091c\u0427\u0901\u091a" },
      { date: "21 \u092b\u0930\u0935\u0930\u0940 2026", time: "\u0926\u094b\u092a\u0939\u0930 3:00", provider: "\u0921\u0949. \u0938\u093f\u0902\u0939", location: "\u092a\u0932\u094d\u092e\u094b\u0928\u094b\u0932\u0949\u091c\u0940 \u0935\u093f\u092d\u0427\u0917", purpose: "\u092c\u091a\u094d\u091a\u0947 \u0915\u0947 \u092b\u0947\u092b\u0921\u093c\u094b\u0902 \u0915\u0940 \u091c\u0427\u0901\u091a" }
    ],
    translatedInstructions: "\u0916\u0947\u0932\u0928\u0947 \u092f\u0427 \u0926\u094c\u0921\u093c\u0928\u0947 \u0938\u0947 \u092a\u0939\u0932\u0947 \u0907\u0928\u0939\u0947\u0932\u0930 \u0915\u0427 \u0907\u0938\u094d\u0924\u0947\u092e\u0427\u0932 \u0915\u0930\u0947\u0902\u0964 \u092c\u091a\u094d\u091a\u0947 \u0915\u094b \u0927\u0942\u0932, \u092a\u0930\u0427\u0917\u0915\u0923, \u0914\u0930 \u0920\u0902\u0921\u0940 \u0939\u0935\u0427 \u0938\u0947 \u0926\u0942\u0930 \u0930\u0916\u0947\u0902\u0964 \u0930\u0947\u0938\u094d\u0915\u094d\u092f\u0942 \u0907\u0928\u0939\u0947\u0932\u0930 \u0939\u092e\u0947\u0936\u0427 \u092a\u0427\u0938 \u0930\u0916\u0947\u0902\u0964 \u092c\u094d\u0930\u0940\u0926\u093f\u0902\u0917 \u092e\u0940\u091f\u0930 \u0938\u0947 \u0938\u0427\u0901\u0938 \u0915\u0940 \u091c\u0427\u0901\u091a \u0915\u0930\u0947\u0902\u0964",
    translatedWarnings: "911 \u092a\u0930 \u0915\u0949\u0932 \u0915\u0930\u0947\u0902 \u092f\u0427 \u0924\u0941\u0930\u0902\u0924 \u0905\u0938\u094d\u092a\u0924\u0427\u0932 \u091c\u0427\u090f\u0902 \u092f\u0926\u093f: \u092c\u091a\u094d\u091a\u0947 \u0915\u094b \u0938\u0427\u0901\u0938 \u0932\u0947\u0928\u0947 \u092e\u0947\u0902 \u092c\u0939\u0941\u0924 \u0924\u0915\u0932\u0940\u092b \u0939\u094b, \u0939\u094b\u0902\u0920 \u092f\u0427 \u0928\u0427\u0916\u0942\u0928 \u0928\u0940\u0932\u0947 \u092a\u0921\u093c \u091c\u0427\u090f\u0902, \u0907\u0928\u0939\u0947\u0932\u0930 \u0938\u0947 \u0930\u0427\u0939\u0924 \u0928 \u092e\u093f\u0932\u0947, \u092f\u0427 \u092c\u091a\u094d\u091a\u0427 \u092a\u0942\u0930\u0947 \u0935\u0427\u0915\u094d\u092f \u0928\u0939\u0940\u0902 \u092c\u094b\u0932 \u092a\u0427 \u0930\u0939\u0427\u0964",
    backTranslatedDiagnosis: "Your child had a severe asthma attack. His lungs became very tight and he had difficulty breathing. He was treated in the hospital and is now better.",
    backTranslatedInstructions: "Use the inhaler before playing or running. Keep the child away from dust, pollen, and cold air. Always keep the rescue inhaler nearby. Check breathing with the breathing meter.",
    backTranslatedWarnings: "Call 911 or go to the hospital immediately if: the child has great difficulty breathing, lips or fingernails turn blue, the inhaler doesn't help, or the child cannot speak in full sentences.",
    interpreterNotes: "Hindi medical terms verified. Pediatric asthma terminology reviewed. Instructions adapted for parent/guardian comprehension.",
    accessToken: tokenArjun,
    accessTokenExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    approvedBy: clinician2.id,
    approvedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    dischargeDate: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000),
    createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000), updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
  }).returning();

  // 5. Tran Van Duc — DRAFT (stroke)
  const [carePlan10] = await db.insert(carePlans).values({
    patientId: patient10.id, clinicianId: clinician2.id, tenantId: tenant2.id, status: "draft",
    originalContent: "DISCHARGE SUMMARY\n\nPatient: Tran Van Duc\nDiagnosis: Ischemic Stroke - Left MCA Territory\n\nMEDICATIONS:\n1. Aspirin 325mg - Once daily\n2. Atorvastatin 80mg - Once daily at bedtime\n3. Lisinopril 10mg - Once daily\n\nWARNINGS:\n- Call 911 immediately for sudden weakness, vision changes, or difficulty speaking",
    originalFileName: "discharge_tran_van_duc_stroke.pdf", extractedPatientName: "Tran Van Duc", diagnosis: "Ischemic Stroke - Left MCA Territory",
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), updatedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
  }).returning();

  // ========================================
  // CHECK-INS
  // ========================================

  // Riverside: Green check-in for Rosa
  await db.insert(checkIns).values({
    carePlanId: carePlan1.id, patientId: patient1.id,
    scheduledFor: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    sentAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    attemptNumber: 1, response: "green",
    respondedAt: new Date(Date.now() - 20 * 60 * 60 * 1000), responseNotes: null,
  });

  // Riverside: Pending 2nd check-in for Rosa
  await db.insert(checkIns).values({
    carePlanId: carePlan1.id, patientId: patient1.id,
    scheduledFor: new Date(), sentAt: new Date(),
    attemptNumber: 2, response: null, respondedAt: null, responseNotes: null,
  });

  // Lakeside: Yellow check-in for Aisha (creates alert)
  await db.insert(checkIns).values({
    carePlanId: carePlan5.id, patientId: patient5.id,
    scheduledFor: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    sentAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    attemptNumber: 1, response: "yellow",
    respondedAt: new Date(Date.now() - 1.5 * 24 * 60 * 60 * 1000),
    responseNotes: "I have a question about my medication timing", alertCreated: true,
  });

  // Lakeside: Green check-in for Arjun (completed care plan)
  await db.insert(checkIns).values({
    carePlanId: carePlan7.id, patientId: patient7.id,
    scheduledFor: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    sentAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    attemptNumber: 1, response: "green",
    respondedAt: new Date(Date.now() - 7.5 * 24 * 60 * 60 * 1000), responseNotes: null,
  });

  // Lakeside: Red check-in for Arjun (alert created)
  await db.insert(checkIns).values({
    carePlanId: carePlan7.id, patientId: patient7.id,
    scheduledFor: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    sentAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    attemptNumber: 2, response: "red",
    respondedAt: new Date(Date.now() - 4.5 * 24 * 60 * 60 * 1000),
    responseNotes: "Child is wheezing again and inhaler not helping much", alertCreated: true,
  });

  // ========================================
  // AUDIT LOGS — RIVERSIDE (clinician1)
  // ========================================

  // CarePlan 1 (Rosa - SENT) - full trail
  await db.insert(auditLogs).values([
    { carePlanId: carePlan1.id, userId: clinician1.id, action: "created", details: { fileName: "rosa_discharge.pdf" }, createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000) },
    { carePlanId: carePlan1.id, userId: clinician1.id, action: "processed", details: { extractedSections: ["diagnosis", "medications", "appointments", "instructions", "warnings"] }, createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000 + 60000) },
    { carePlanId: carePlan1.id, userId: clinician1.id, action: "simplified", details: { language: "en", readingLevel: "5th grade" }, createdAt: new Date(Date.now() - 3.5 * 24 * 60 * 60 * 1000) },
    { carePlanId: carePlan1.id, userId: clinician1.id, action: "translated", details: { targetLanguage: "es", languageName: "Spanish" }, createdAt: new Date(Date.now() - 3.5 * 24 * 60 * 60 * 1000 + 60000) },
    { carePlanId: carePlan1.id, userId: clinician1.id, action: "approved", details: { approverName: clinician1.name }, createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
    { carePlanId: carePlan1.id, userId: clinician1.id, action: "sent", details: { email: patient1.email, patientName: patient1.name }, createdAt: new Date(Date.now() - 2.5 * 24 * 60 * 60 * 1000) },
    { carePlanId: carePlan1.id, userId: null, action: "viewed", details: { patientAccess: true, patientName: patient1.name }, createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
    { carePlanId: carePlan1.id, userId: null, action: "check_in_responded", details: { response: "green", responseText: "Feeling good" }, createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) },
  ]);

  // CarePlan 2 (Nguyen - APPROVED) - trail up to approval
  await db.insert(auditLogs).values([
    { carePlanId: carePlan2.id, userId: clinician1.id, action: "created", details: { fileName: "nguyen_discharge.pdf" }, createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
    { carePlanId: carePlan2.id, userId: clinician1.id, action: "processed", details: { extractedSections: ["diagnosis", "medications", "appointments", "instructions", "warnings"] }, createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 60000) },
    { carePlanId: carePlan2.id, userId: clinician1.id, action: "simplified", details: { language: "en", readingLevel: "5th grade" }, createdAt: new Date(Date.now() - 1.5 * 24 * 60 * 60 * 1000) },
    { carePlanId: carePlan2.id, userId: clinician1.id, action: "translated", details: { targetLanguage: "vi", languageName: "Vietnamese" }, createdAt: new Date(Date.now() - 1.5 * 24 * 60 * 60 * 1000 + 60000) },
    { carePlanId: carePlan2.id, userId: clinician1.id, action: "approved", details: { approverName: clinician1.name }, createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) },
  ]);

  // CarePlan 3 (Wei - PENDING_REVIEW) - trail up to translation
  await db.insert(auditLogs).values([
    { carePlanId: carePlan3.id, userId: clinician1.id, action: "created", details: { fileName: "wei_discharge.pdf" }, createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) },
    { carePlanId: carePlan3.id, userId: clinician1.id, action: "processed", details: { extractedSections: ["diagnosis", "medications", "appointments", "instructions", "warnings"] }, createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000 + 60000) },
    { carePlanId: carePlan3.id, userId: clinician1.id, action: "simplified", details: { language: "en", readingLevel: "5th grade" }, createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000) },
    { carePlanId: carePlan3.id, userId: clinician1.id, action: "translated", details: { targetLanguage: "zh", languageName: "Chinese (Simplified)" }, createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000 + 60000) },
  ]);

  // CarePlan 6 (Amadou - DRAFT) - only created
  await db.insert(auditLogs).values([
    { carePlanId: carePlan6.id, userId: clinician1.id, action: "created", details: { fileName: "discharge_amadou_diallo_sickle_cell.pdf" }, createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
  ]);

  // CarePlan 8 (Olga - INTERPRETER_REVIEW) - trail up to translation
  await db.insert(auditLogs).values([
    { carePlanId: carePlan8.id, userId: clinician1.id, action: "created", details: { fileName: "discharge_olga_petrov_copd.pdf" }, createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) },
    { carePlanId: carePlan8.id, userId: clinician1.id, action: "processed", details: { extractedSections: ["diagnosis", "medications", "appointments", "instructions", "warnings"] }, createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000 + 60000) },
    { carePlanId: carePlan8.id, userId: clinician1.id, action: "simplified", details: { language: "en", readingLevel: "5th grade" }, createdAt: new Date(Date.now() - 4.5 * 24 * 60 * 60 * 1000) },
    { carePlanId: carePlan8.id, userId: clinician1.id, action: "translated", details: { targetLanguage: "ru", languageName: "Russian" }, createdAt: new Date(Date.now() - 4.5 * 24 * 60 * 60 * 1000 + 60000) },
  ]);

  // ========================================
  // AUDIT LOGS — LAKESIDE (clinician2)
  // ========================================

  // CarePlan 5 (Aisha - SENT with yellow alert) - full trail
  await db.insert(auditLogs).values([
    { carePlanId: carePlan5.id, userId: clinician2.id, action: "created", details: { fileName: "aisha_discharge.pdf" }, createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    { carePlanId: carePlan5.id, userId: clinician2.id, action: "processed", details: { extractedSections: ["diagnosis", "medications", "appointments", "instructions", "warnings"] }, createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + 60000) },
    { carePlanId: carePlan5.id, userId: clinician2.id, action: "simplified", details: { language: "en", readingLevel: "5th grade" }, createdAt: new Date(Date.now() - 6.5 * 24 * 60 * 60 * 1000) },
    { carePlanId: carePlan5.id, userId: clinician2.id, action: "translated", details: { targetLanguage: "ar", languageName: "Arabic" }, createdAt: new Date(Date.now() - 6.5 * 24 * 60 * 60 * 1000 + 60000) },
    { carePlanId: carePlan5.id, userId: clinician2.id, action: "approved", details: { approverName: clinician2.name }, createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000) },
    { carePlanId: carePlan5.id, userId: clinician2.id, action: "sent", details: { email: patient5.email, patientName: patient5.name }, createdAt: new Date(Date.now() - 5.5 * 24 * 60 * 60 * 1000) },
    { carePlanId: carePlan5.id, userId: null, action: "viewed", details: { patientAccess: true, patientName: patient5.name }, createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) },
    { carePlanId: carePlan5.id, userId: null, action: "check_in_responded", details: { response: "yellow", responseText: "Has a question about medication timing", alertCreated: true }, createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
  ]);

  // CarePlan 9 (Pedro - APPROVED) - trail up to approval
  await db.insert(auditLogs).values([
    { carePlanId: carePlan9.id, userId: clinician2.id, action: "created", details: { fileName: "discharge_pedro_gutierrez_knee.pdf" }, createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
    { carePlanId: carePlan9.id, userId: clinician2.id, action: "processed", details: { extractedSections: ["diagnosis", "medications", "appointments", "instructions", "warnings"] }, createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 60000) },
    { carePlanId: carePlan9.id, userId: clinician2.id, action: "simplified", details: { language: "en", readingLevel: "5th grade" }, createdAt: new Date(Date.now() - 1.5 * 24 * 60 * 60 * 1000) },
    { carePlanId: carePlan9.id, userId: clinician2.id, action: "translated", details: { targetLanguage: "es", languageName: "Spanish" }, createdAt: new Date(Date.now() - 1.5 * 24 * 60 * 60 * 1000 + 60000) },
    { carePlanId: carePlan9.id, userId: clinician2.id, action: "approved", details: { approverName: clinician2.name }, createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) },
  ]);

  // CarePlan 4 (Fatima - INTERPRETER_APPROVED) - trail up to interpreter approval
  await db.insert(auditLogs).values([
    { carePlanId: carePlan4.id, userId: clinician2.id, action: "created", details: { fileName: "discharge_fatima_al_hassan_gestational_diabetes.pdf" }, createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000) },
    { carePlanId: carePlan4.id, userId: clinician2.id, action: "processed", details: { extractedSections: ["diagnosis", "medications", "appointments", "instructions", "warnings"] }, createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000 + 60000) },
    { carePlanId: carePlan4.id, userId: clinician2.id, action: "simplified", details: { language: "en", readingLevel: "5th grade" }, createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000) },
    { carePlanId: carePlan4.id, userId: clinician2.id, action: "translated", details: { targetLanguage: "ar", languageName: "Arabic" }, createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000 + 60000) },
    { carePlanId: carePlan4.id, userId: interpreter2.id, action: "interpreter_approved", details: { interpreterName: interpreter2.name, language: "Arabic" }, createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
  ]);

  // CarePlan 7 (Arjun - COMPLETED) - full trail
  await db.insert(auditLogs).values([
    { carePlanId: carePlan7.id, userId: clinician2.id, action: "created", details: { fileName: "discharge_arjun_sharma_asthma.pdf" }, createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
    { carePlanId: carePlan7.id, userId: clinician2.id, action: "processed", details: { extractedSections: ["diagnosis", "medications", "appointments", "instructions", "warnings"] }, createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000 + 60000) },
    { carePlanId: carePlan7.id, userId: clinician2.id, action: "simplified", details: { language: "en", readingLevel: "5th grade" }, createdAt: new Date(Date.now() - 13 * 24 * 60 * 60 * 1000) },
    { carePlanId: carePlan7.id, userId: clinician2.id, action: "translated", details: { targetLanguage: "hi", languageName: "Hindi" }, createdAt: new Date(Date.now() - 13 * 24 * 60 * 60 * 1000 + 60000) },
    { carePlanId: carePlan7.id, userId: clinician2.id, action: "approved", details: { approverName: clinician2.name }, createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) },
    { carePlanId: carePlan7.id, userId: clinician2.id, action: "sent", details: { email: patient7.email, patientName: patient7.name }, createdAt: new Date(Date.now() - 9.5 * 24 * 60 * 60 * 1000) },
    { carePlanId: carePlan7.id, userId: null, action: "viewed", details: { patientAccess: true, patientName: patient7.name }, createdAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000) },
    { carePlanId: carePlan7.id, userId: null, action: "check_in_responded", details: { response: "green", responseText: "Child is doing well, using inhaler as directed" }, createdAt: new Date(Date.now() - 7.5 * 24 * 60 * 60 * 1000) },
    { carePlanId: carePlan7.id, userId: null, action: "check_in_responded", details: { response: "red", responseText: "Child is wheezing again and inhaler not helping much", alertCreated: true }, createdAt: new Date(Date.now() - 4.5 * 24 * 60 * 60 * 1000) },
  ]);

  // CarePlan 10 (Tran - DRAFT) - only created
  await db.insert(auditLogs).values([
    { carePlanId: carePlan10.id, userId: clinician2.id, action: "created", details: { fileName: "discharge_tran_van_duc_stroke.pdf" }, createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
  ]);

  console.log("Created care plans, check-ins, and audit logs");

  console.log("\n=== SEED DATA SUMMARY ===");
  console.log("\n--- TENANT 1: Riverside Community Health ---");
  console.log("STAFF:");
  console.log(`  Clinic Admin: riverside_admin / password123 (${riversideAdmin.name})`);
  console.log(`  Clinician: nurse / password123 (${clinician1.name})`);
  console.log(`  Interpreter: riverside_interpreter / password123 (${interpreter1.name})`);
  console.log("CARE PLANS:");
  console.log("  1. Rosa Martinez - SENT (Spanish, green check-in + pending 2nd)");
  console.log("  2. Nguyen Thi Lan - APPROVED (Vietnamese, ready to send)");
  console.log("  3. Wei Zhang - PENDING_REVIEW (Chinese)");
  console.log("  4. Amadou Diallo - DRAFT (French, just uploaded)");
  console.log("  5. Olga Petrov - INTERPRETER_REVIEW (Russian, awaiting interpreter review)");
  console.log("PATIENT PORTAL:");
  console.log(`  Rosa Martinez: /p/${token1} (YOB: 1956)`);
  console.log(`  Nguyen Thi Lan: /p/${token2} (YOB: 1968)`);

  console.log("\n--- TENANT 2: Lakeside Family Medicine ---");
  console.log("STAFF:");
  console.log(`  Clinic Admin: lakeside_admin / password123 (${lakesideAdmin.name})`);
  console.log(`  Clinician: lakeside_nurse / password123 (${clinician2.name})`);
  console.log(`  Interpreter: lakeside_interpreter / password123 (${interpreter2.name})`);
  console.log("CARE PLANS:");
  console.log("  1. Aisha Rahman - SENT (Arabic, yellow alert check-in)");
  console.log("  2. Pedro Gutierrez - APPROVED (Spanish, ready to send)");
  console.log("  3. Fatima Al-Hassan - INTERPRETER_APPROVED (Arabic, interpreter verified)");
  console.log("  4. Arjun Sharma - COMPLETED (Hindi, green + red check-ins)");
  console.log("  5. Tran Van Duc - DRAFT (Vietnamese, just uploaded)");
  console.log("PATIENT PORTAL:");
  console.log(`  Aisha Rahman: /p/${token5} (YOB: 1978)`);
  console.log(`  Pedro Gutierrez: /p/${tokenPedro} (YOB: 1975)`);
  console.log(`  Arjun Sharma: /p/${tokenArjun} (YOB: 2020)`);

  console.log("\n--- PLATFORM ADMIN ---");
  console.log("  Super Admin: admin / password123 (Angela Torres)");
  console.log("\n=========================\n");
}

// ESM direct execution check
const isDirectRun = process.argv[1]?.includes("seed");
if (isDirectRun) {
  // When run directly, force reseed
  seedDatabase(true)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Seeding failed:", err);
      process.exit(1);
    });
}
