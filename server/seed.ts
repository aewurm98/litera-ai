import { db } from "./db";
import { users, patients, carePlans, checkIns, auditLogs } from "@shared/schema";
import { randomBytes } from "crypto";
import bcrypt from "bcrypt";

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function seedDatabase(force: boolean = false) {
  console.log("Checking if database needs seeding...");
  
  // Check if we already have data (unless force reseed)
  if (!force) {
    const existingUsers = await db.select().from(users).limit(1);
    if (existingUsers.length > 0) {
      console.log("Database already has data, skipping seed. Use force=true to reseed.");
      return;
    }
  }

  console.log("Seeding database...");

  // Clear existing data (in reverse order of dependencies)
  await db.delete(auditLogs);
  await db.delete(checkIns);
  await db.delete(carePlans);
  await db.delete(patients);
  await db.delete(users);

  // Hash the demo password
  const hashedPassword = await hashPassword("password123");

  // Create users
  const [clinician1] = await db.insert(users).values({
    username: "nurse",
    password: hashedPassword,
    role: "clinician",
    name: "Maria Chen, RN",
  }).returning();

  const [admin1] = await db.insert(users).values({
    username: "admin",
    password: hashedPassword,
    role: "admin",
    name: "Angela Torres",
  }).returning();

  console.log("Created users:", clinician1.name, admin1.name);

  // Create patients matching actual mock PDFs
  const [patient1] = await db.insert(patients).values({
    name: "Rosa Martinez",
    email: "rosa.martinez@example.com",
    phone: "+1-555-0101",
    yearOfBirth: 1956,
    preferredLanguage: "es",
  }).returning();

  const [patient2] = await db.insert(patients).values({
    name: "Nguyen Thi Lan",
    email: "nguyen.lan@example.com",
    phone: "+1-555-0102",
    yearOfBirth: 1968,
    preferredLanguage: "vi",
  }).returning();

  const [patient3] = await db.insert(patients).values({
    name: "Wei Zhang",
    email: "wei.zhang@example.com",
    phone: "+1-555-0103",
    yearOfBirth: 1975,
    preferredLanguage: "zh",
  }).returning();

  const [patient4] = await db.insert(patients).values({
    name: "Fatima Al-Hassan",
    email: "fatima.alhassan@example.com",
    phone: "+1-555-0104",
    yearOfBirth: 1990,
    preferredLanguage: "ar",
  }).returning();

  const [patient5] = await db.insert(patients).values({
    name: "Aisha Rahman",
    email: "aisha.rahman@example.com",
    phone: "+1-555-0105",
    yearOfBirth: 1978,
    preferredLanguage: "ar",
  }).returning();

  console.log("Created patients:", patient1.name, patient2.name, patient3.name, patient4.name, patient5.name);

  // Create care plans at various stages
  // 1. Sent care plan with check-in (Rosa - Spanish)
  const token1 = generateToken();
  const [carePlan1] = await db.insert(carePlans).values({
    patientId: patient1.id,
    clinicianId: clinician1.id,
    status: "sent",
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
    translatedDiagnosis: "Usted tiene azúcar alta en la sangre (diabetes) y presión arterial alta.",
    translatedMedications: [
      { name: "Metformina", dose: "500mg", frequency: "2 veces al día", instructions: "Tomar cuando desayune y cene" },
      { name: "Lisinopril", dose: "10mg", frequency: "1 vez al día", instructions: "Tomar cuando se despierte" },
      { name: "Aspirina", dose: "81mg", frequency: "1 vez al día", instructions: "Tomar con cualquier comida" }
    ],
    translatedAppointments: [
      { date: "5 de febrero de 2026", time: "10:00 AM", provider: "Dr. Johnson", location: "Clínica de Atención Primaria", purpose: "Revisar su diabetes" },
      { date: "12 de febrero de 2026", time: "2:00 PM", provider: "Dr. Patel", location: "Departamento de Endocrinología", purpose: "Ver al médico de diabetes" }
    ],
    translatedInstructions: "Revise su azúcar en la sangre todos los días. Tome sus pastillas como dijo el médico. No coma mucha sal.",
    translatedWarnings: "Llame al 911 o vaya al hospital de inmediato si tiene: dolor en el pecho, dificultad para respirar, o un dolor de cabeza muy fuerte.",
    backTranslatedDiagnosis: "You have high blood sugar (diabetes) and high blood pressure.",
    backTranslatedInstructions: "Check your blood sugar every day. Take your pills as the doctor said. Don't eat too much salt.",
    backTranslatedWarnings: "Call 911 or go to the hospital right away if you have: chest pain, trouble breathing, or a very strong headache.",
    accessToken: token1,
    accessTokenExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    approvedBy: clinician1.id,
    approvedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
    dischargeDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
  }).returning();

  // 2. Approved care plan ready to send (Nguyen - Vietnamese)
  const token2 = generateToken();
  const [carePlan2] = await db.insert(carePlans).values({
    patientId: patient2.id,
    clinicianId: clinician1.id,
    status: "approved",
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
    warnings: "Return to ER if you have fever over 101°F, increasing pain, or redness around the incision.",
    simplifiedDiagnosis: "You had surgery to remove your appendix. Your body is healing.",
    simplifiedMedications: [
      { name: "Tylenol (Acetaminophen)", dose: "500mg", frequency: "Every 6 hours", instructions: "Take when you have pain" },
      { name: "Amoxicillin", dose: "500mg", frequency: "3 times a day", instructions: "Take for 7 days to stop infection" }
    ],
    simplifiedAppointments: [
      { date: "February 8, 2026", time: "9:00 AM", provider: "Dr. Williams", location: "Surgery Clinic", purpose: "Doctor will check your healing" }
    ],
    simplifiedInstructions: "Keep your cut clean and dry. Put on a new bandage every day. Look for signs that it is infected.",
    simplifiedWarnings: "Go back to the emergency room if you have: fever over 101°F, more pain, or the skin around your cut becomes red.",
    translatedLanguage: "vi",
    translatedDiagnosis: "Bạn đã phẫu thuật cắt bỏ ruột thừa. Cơ thể bạn đang hồi phục.",
    translatedMedications: [
      { name: "Tylenol (Acetaminophen)", dose: "500mg", frequency: "Mỗi 6 giờ", instructions: "Uống khi bạn đau" },
      { name: "Amoxicillin", dose: "500mg", frequency: "3 lần một ngày", instructions: "Uống trong 7 ngày để ngăn nhiễm trùng" }
    ],
    translatedAppointments: [
      { date: "Ngày 8 tháng 2 năm 2026", time: "9:00 sáng", provider: "Bác sĩ Williams", location: "Phòng khám Phẫu thuật", purpose: "Bác sĩ sẽ kiểm tra sự hồi phục của bạn" }
    ],
    translatedInstructions: "Giữ vết cắt sạch và khô. Thay băng mới mỗi ngày. Theo dõi các dấu hiệu nhiễm trùng.",
    translatedWarnings: "Quay lại phòng cấp cứu nếu bạn có: sốt trên 101°F, đau nhiều hơn, hoặc da quanh vết cắt đỏ lên.",
    backTranslatedDiagnosis: "You had surgery to remove your appendix. Your body is recovering.",
    backTranslatedInstructions: "Keep the incision clean and dry. Change the bandage every day. Watch for signs of infection.",
    backTranslatedWarnings: "Return to the emergency room if you have: fever over 101°F, more pain, or the skin around the incision becomes red.",
    accessToken: token2,
    accessTokenExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    approvedBy: clinician1.id,
    approvedAt: new Date(),
    dischargeDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
  }).returning();

  // 3. Pending review care plan (Wei - Chinese)
  const [carePlan3] = await db.insert(carePlans).values({
    patientId: patient3.id,
    clinicianId: clinician1.id,
    status: "pending_review",
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
    translatedDiagnosis: "您的气道感染了，导致咳嗽。",
    translatedMedications: [
      { name: "止咳药", dose: "10毫升（2茶匙）", frequency: "每4-6小时", instructions: "帮助止咳" },
      { name: "布洛芬", dose: "400毫克", frequency: "每6小时", instructions: "发烧时服用" },
      { name: "阿奇霉素", dose: "250毫克", frequency: "每天一次", instructions: "服用5天以对抗感染" }
    ],
    translatedAppointments: [
      { date: "2026年2月10日", time: "下午3:00", provider: "李医生", location: "急诊诊所", purpose: "如果没有好转请回来" }
    ],
    translatedInstructions: "卧床休息。多喝水、茶或汤。使用加湿器。远离烟草烟雾。",
    translatedWarnings: "如果您呼吸困难、胸痛或咳血，请立即去急诊室。",
    backTranslatedDiagnosis: "You have an infection in your airways that causes coughing.",
    backTranslatedInstructions: "Stay in bed and rest. Drink plenty of water, tea, or soup. Use a humidifier. Stay away from cigarette smoke.",
    backTranslatedWarnings: "If you have difficulty breathing, chest pain, or cough up blood, go to the emergency room immediately.",
    dischargeDate: new Date(),
  }).returning();

  // 4. Draft care plan (Fatima - Arabic, gestational diabetes)
  const [carePlan4] = await db.insert(carePlans).values({
    patientId: patient4.id,
    clinicianId: clinician1.id,
    status: "draft",
    originalContent: "DISCHARGE SUMMARY\n\nPatient: Fatima Al-Hassan\nDiagnosis: Gestational diabetes\n\nMEDICATIONS:\n1. Insulin (as directed)\n2. Prenatal vitamins - Take daily\n\nMONITORING:\n- Check blood sugar 4 times daily\n- Keep food diary\n\nFOLLOW-UP:\n- OB-GYN: Dr. Martinez, February 3, 2026",
    originalFileName: "discharge_fatima_al_hassan_gestational_diabetes.pdf",
    diagnosis: "Gestational diabetes",
    dischargeDate: new Date(),
  }).returning();

  // 5. Sent care plan with yellow alert (Aisha - Arabic, CHF)
  const token5 = generateToken();
  const [carePlan5] = await db.insert(carePlans).values({
    patientId: patient5.id,
    clinicianId: clinician1.id,
    status: "sent",
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
    translatedDiagnosis: "قلبك لا يضخ الدم كما ينبغي. هذا يسمى قصور القلب.",
    translatedMedications: [
      { name: "فوروسيميد (حبة الماء)", dose: "40 ملغ", frequency: "مرة واحدة في اليوم", instructions: "تناوله في الصباح" },
      { name: "ليسينوبريل", dose: "10 ملغ", frequency: "مرة واحدة في اليوم", instructions: "تناوله في الصباح" },
      { name: "ميتوبرولول", dose: "25 ملغ", frequency: "مرتين في اليوم", instructions: "تناوله صباحاً ومساءً" }
    ],
    translatedAppointments: [
      { date: "10 فبراير 2026", time: "2:00 مساءً", provider: "د. تشين", location: "عيادة القلب", purpose: "فحص قلبك" }
    ],
    translatedInstructions: "زن نفسك كل صباح. ابحث عن تورم في قدميك وساقيك. لا تأكل الكثير من الملح. لا تشرب الكثير من الماء.",
    translatedWarnings: "اتصل بطبيبك فوراً إذا زاد وزنك كثيراً فجأة، أو تورمت قدماك كثيراً، أو لم تستطع التنفس جيداً.",
    backTranslatedDiagnosis: "Your heart is not pumping blood as it should. This is called heart failure.",
    backTranslatedInstructions: "Weigh yourself every morning. Look for swelling in your feet and legs. Don't eat too much salt. Don't drink too much water.",
    backTranslatedWarnings: "Call your doctor immediately if you gain a lot of weight suddenly, your feet swell a lot, or you can't breathe well.",
    accessToken: token5,
    accessTokenExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    approvedBy: clinician1.id,
    approvedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    dischargeDate: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
  }).returning();

  console.log("Created care plans:", carePlan1.id, carePlan2.id, carePlan3.id, carePlan4.id, carePlan5.id);

  // Create check-ins
  // Green check-in for Rosa
  await db.insert(checkIns).values({
    carePlanId: carePlan1.id,
    patientId: patient1.id,
    scheduledFor: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    sentAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    attemptNumber: 1,
    response: "green",
    respondedAt: new Date(Date.now() - 20 * 60 * 60 * 1000),
    responseNotes: null,
  });

  // Yellow check-in for Fatima (creates alert)
  await db.insert(checkIns).values({
    carePlanId: carePlan5.id,
    patientId: patient5.id,
    scheduledFor: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    sentAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    attemptNumber: 1,
    response: "yellow",
    respondedAt: new Date(Date.now() - 1.5 * 24 * 60 * 60 * 1000),
    responseNotes: "I have a question about my medication timing",
    alertCreated: true,
  });

  // Second check-in for Rosa (unanswered - prompts for response on portal)
  await db.insert(checkIns).values({
    carePlanId: carePlan1.id,
    patientId: patient1.id,
    scheduledFor: new Date(),
    sentAt: new Date(),
    attemptNumber: 2,
    response: null,
    respondedAt: null,
    responseNotes: null,
  });

  // Create audit logs for ALL care plans
  // CarePlan 1 (Rosa - SENT with green check-in) - full trail
  await db.insert(auditLogs).values([
    {
      carePlanId: carePlan1.id,
      userId: clinician1.id,
      action: "created",
      details: { fileName: "rosa_discharge.pdf" },
      createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
    },
    {
      carePlanId: carePlan1.id,
      userId: clinician1.id,
      action: "processed",
      details: { extractedSections: ["diagnosis", "medications", "appointments", "instructions", "warnings"] },
      createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000 + 60000),
    },
    {
      carePlanId: carePlan1.id,
      userId: clinician1.id,
      action: "simplified",
      details: { language: "en", readingLevel: "5th grade" },
      createdAt: new Date(Date.now() - 3.5 * 24 * 60 * 60 * 1000),
    },
    {
      carePlanId: carePlan1.id,
      userId: clinician1.id,
      action: "translated",
      details: { targetLanguage: "es", languageName: "Spanish" },
      createdAt: new Date(Date.now() - 3.5 * 24 * 60 * 60 * 1000 + 60000),
    },
    {
      carePlanId: carePlan1.id,
      userId: clinician1.id,
      action: "approved",
      details: { approverName: clinician1.name },
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    },
    {
      carePlanId: carePlan1.id,
      userId: clinician1.id,
      action: "sent",
      details: { email: patient1.email, patientName: patient1.name },
      createdAt: new Date(Date.now() - 2.5 * 24 * 60 * 60 * 1000),
    },
    {
      carePlanId: carePlan1.id,
      userId: null,
      action: "viewed",
      details: { patientAccess: true, patientName: patient1.name },
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    },
    {
      carePlanId: carePlan1.id,
      userId: null,
      action: "check_in_responded",
      details: { response: "green", responseText: "Feeling good" },
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    },
  ]);

  // CarePlan 2 (Nguyen - APPROVED, ready to send) - trail up to approval
  await db.insert(auditLogs).values([
    {
      carePlanId: carePlan2.id,
      userId: clinician1.id,
      action: "created",
      details: { fileName: "nguyen_discharge.pdf" },
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    },
    {
      carePlanId: carePlan2.id,
      userId: clinician1.id,
      action: "processed",
      details: { extractedSections: ["diagnosis", "medications", "appointments", "instructions", "warnings"] },
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 60000),
    },
    {
      carePlanId: carePlan2.id,
      userId: clinician1.id,
      action: "simplified",
      details: { language: "en", readingLevel: "5th grade" },
      createdAt: new Date(Date.now() - 1.5 * 24 * 60 * 60 * 1000),
    },
    {
      carePlanId: carePlan2.id,
      userId: clinician1.id,
      action: "translated",
      details: { targetLanguage: "vi", languageName: "Vietnamese" },
      createdAt: new Date(Date.now() - 1.5 * 24 * 60 * 60 * 1000 + 60000),
    },
    {
      carePlanId: carePlan2.id,
      userId: clinician1.id,
      action: "approved",
      details: { approverName: clinician1.name },
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    },
  ]);

  // CarePlan 3 (Wei - PENDING_REVIEW) - trail up to processing
  await db.insert(auditLogs).values([
    {
      carePlanId: carePlan3.id,
      userId: clinician1.id,
      action: "created",
      details: { fileName: "wei_discharge.pdf" },
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    },
    {
      carePlanId: carePlan3.id,
      userId: clinician1.id,
      action: "processed",
      details: { extractedSections: ["diagnosis", "medications", "appointments", "instructions", "warnings"] },
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000 + 60000),
    },
    {
      carePlanId: carePlan3.id,
      userId: clinician1.id,
      action: "simplified",
      details: { language: "en", readingLevel: "5th grade" },
      createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
    },
    {
      carePlanId: carePlan3.id,
      userId: clinician1.id,
      action: "translated",
      details: { targetLanguage: "zh", languageName: "Chinese (Simplified)" },
      createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000 + 60000),
    },
  ]);

  // CarePlan 4 (Maria - DRAFT) - only created
  await db.insert(auditLogs).values([
    {
      carePlanId: carePlan4.id,
      userId: clinician1.id,
      action: "created",
      details: { fileName: "maria_discharge.pdf" },
      createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
    },
  ]);

  // CarePlan 5 (Fatima - SENT with yellow alert) - full trail
  await db.insert(auditLogs).values([
    {
      carePlanId: carePlan5.id,
      userId: clinician1.id,
      action: "created",
      details: { fileName: "fatima_discharge.pdf" },
      createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    },
    {
      carePlanId: carePlan5.id,
      userId: clinician1.id,
      action: "processed",
      details: { extractedSections: ["diagnosis", "medications", "appointments", "instructions", "warnings"] },
      createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + 60000),
    },
    {
      carePlanId: carePlan5.id,
      userId: clinician1.id,
      action: "simplified",
      details: { language: "en", readingLevel: "5th grade" },
      createdAt: new Date(Date.now() - 6.5 * 24 * 60 * 60 * 1000),
    },
    {
      carePlanId: carePlan5.id,
      userId: clinician1.id,
      action: "translated",
      details: { targetLanguage: "ar", languageName: "Arabic" },
      createdAt: new Date(Date.now() - 6.5 * 24 * 60 * 60 * 1000 + 60000),
    },
    {
      carePlanId: carePlan5.id,
      userId: clinician1.id,
      action: "approved",
      details: { approverName: clinician1.name },
      createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
    },
    {
      carePlanId: carePlan5.id,
      userId: clinician1.id,
      action: "sent",
      details: { email: patient5.email, patientName: patient5.name },
      createdAt: new Date(Date.now() - 5.5 * 24 * 60 * 60 * 1000),
    },
    {
      carePlanId: carePlan5.id,
      userId: null,
      action: "viewed",
      details: { patientAccess: true, patientName: patient5.name },
      createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    },
    {
      carePlanId: carePlan5.id,
      userId: null,
      action: "check_in_responded",
      details: { response: "yellow", responseText: "Has a question about medication timing", alertCreated: true },
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    },
  ]);

  console.log("Created check-ins and audit logs");

  console.log("\n=== SEED DATA SUMMARY ===");
  console.log("\nUSERS:");
  console.log(`  Clinician: nurse / password123 (${clinician1.name})`);
  console.log(`  Admin: admin / password123 (${admin1.name})`);
  console.log("\nPATIENT PORTAL ACCESS TOKENS:");
  console.log(`  Rosa Martinez (Spanish): /p/${token1}`);
  console.log(`    Year of Birth: 1956`);
  console.log(`  Nguyen Thi Lan (Vietnamese): /p/${token2}`);
  console.log(`    Year of Birth: 1968`);
  console.log(`  Fatima Al-Hassan (Arabic): /p/${token5}`);
  console.log(`    Year of Birth: 1990`);
  console.log("\nCARE PLAN STATUSES:");
  console.log("  1. Rosa Martinez - SENT (with green check-in)");
  console.log("  2. Nguyen Thi Lan - APPROVED (ready to send)");
  console.log("  3. Wei Zhang - PENDING_REVIEW (needs approval)");
  console.log("  4. Maria Santos - DRAFT (just uploaded)");
  console.log("  5. Fatima Al-Hassan - SENT (with yellow alert)");
  console.log("\n=========================\n");

  console.log("Seeding complete!");
}

// ESM direct execution check using import.meta.url
const isMainModule = import.meta.url.endsWith(process.argv[1]?.replace(/^file:\/\//, '')) ||
                     process.argv[1]?.endsWith('seed.ts');

if (isMainModule) {
  // When run directly, force reseed
  seedDatabase(true)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Seeding failed:", err);
      process.exit(1);
    });
}
