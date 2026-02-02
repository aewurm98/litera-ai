import { useState, useCallback, useEffect } from "react";
import { useParams, useLocation, useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { jsPDF } from "jspdf";
import { 
  Heart, 
  Pill, 
  Calendar, 
  AlertTriangle, 
  Phone, 
  Check,
  Loader2,
  Languages,
  Shield,
  ChevronRight,
  MapPin,
  Clock,
  Volume2,
  VolumeX,
  Printer,
  Download,
  FileText
} from "lucide-react";
import type { CarePlan, Patient, CheckIn } from "@shared/schema";
import { SUPPORTED_LANGUAGES } from "@shared/schema";

type CarePlanWithPatient = CarePlan & { patient: Patient; checkIns?: CheckIn[] };

// Helper function to format content that may be array or string
function formatContent(content: string | string[] | null | undefined): string {
  if (!content) return "";

  const addNumbering = (items: string[]) => {
    return items.map((item, i) => {
      const cleaned = item.replace(/^\d+\.\s*/, '').trim();
      return `${i + 1}. ${cleaned}`;
    }).join("\n");
  };

  if (Array.isArray(content)) {
    return addNumbering(content);
  }

  // Handle JSON string that looks like an array
  if (typeof content === "string" && content.startsWith("{") && content.includes('","')) {
    try {
      // Try to parse as JSON array-like object
      const cleaned = content.replace(/^\{"|"\}$/g, '').split('","');
      return addNumbering(cleaned);
    } catch {
      return content;
    }
  }
  return content;
}

// UI translations for patient portal
const UI_TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    yourCarePlan: "Your Care Plan",
    whatsWrong: "What's Wrong",
    whatToDo: "What to Do",
    warningSigns: "Warning Signs",
    warningSubtitle: "Go to the emergency room or call 911 if you have any of these:",
    medications: "Your Medications",
    appointments: "Your Appointments",
    howAreYouFeeling: "How are you feeling?",
    howAreYouFeelingToday: "How are you feeling today?",
    letYourCareTeamKnow: "Let your care team know",
    tapTheOption: "Tap the option that best describes how you're doing",
    checkIn: "Check In",
    imFeelingGood: "I'm feeling good",
    everythingOk: "Everything is going well",
    iHaveAConcern: "I have a concern",
    somethingNotRight: "Something doesn't feel right",
    iNeedHelp: "I need help",
    urgentAssistance: "I need urgent assistance",
    thankYou: "Thank you for checking in!",
    wereGlad: "We're glad you're feeling well. Keep taking your medications as prescribed.",
    careTeamNotified: "Your care team has been notified and will reach out soon.",
    callNow: "Please call 911 or go to the emergency room immediately.",
    call911: "Call 911",
    close: "Close",
    viewInEnglish: "View in English",
    viewInLanguage: "View in",
    listenToCarePlan: "Listen to Care Plan",
    stopListening: "Stop",
    downloadPdf: "Download PDF",
    print: "Print",
    viewOriginal: "View Original",
    originalDocument: "Original Document",
    readAloud: "Read Aloud",
    readAloudNotAvailable: "Read Aloud (Not Available)",
    stopReading: "Stop Reading",
    saveAsPdf: "Save as PDF",
    needOriginalDocument: "Need the original hospital document?",
    viewOriginalDocument: "View Original Document",
    originalDischargeDocument: "Original Discharge Document",
    originalBeforeSimplification: "This is the original hospital document before simplification",
    callClinic: "Call Clinic",
    emergency911: "Emergency 911",
    verifyIdentity: "Verify Your Identity",
    enterYearOfBirth: "Enter your year of birth to access your care plan",
    yearOfBirthPlaceholder: "Year of Birth (e.g., 1980)",
    verifyButton: "Verify",
    verifying: "Verifying...",
    attemptsRemaining: "attempts remaining",
    tooManyAttempts: "Too Many Attempts",
    tryAgainLater: "Please try again in 15 minutes or contact your care team.",
    greatToHear: "Great to hear!",
    keepFollowing: "Keep following your care plan. We're here if you need us.",
    weveNotifiedTeam: "We've notified your care team",
    theyWillCall: "They will call you within 24 hours.",
    ifEmergency: "If this is an emergency",
    teamNotifiedReachOut: "Your care team has been notified and will reach out to you.",
    listenToSection: "Listen to this section",
    readFullSummary: "Read Full Summary Aloud"
  },
  es: {
    yourCarePlan: "Su Plan de Cuidado",
    whatsWrong: "¿Qué Está Mal?",
    whatToDo: "Qué Hacer",
    warningSigns: "Señales de Advertencia",
    warningSubtitle: "Vaya a la sala de emergencias o llame al 911 si tiene alguno de estos:",
    medications: "Sus Medicamentos",
    appointments: "Sus Citas",
    howAreYouFeeling: "¿Cómo se siente?",
    howAreYouFeelingToday: "¿Cómo se siente hoy?",
    letYourCareTeamKnow: "Avise a su equipo de atención",
    tapTheOption: "Toque la opción que mejor describa cómo se siente",
    checkIn: "Registrarse",
    imFeelingGood: "Me siento bien",
    everythingOk: "Todo va bien",
    iHaveAConcern: "Tengo una preocupación",
    somethingNotRight: "Algo no se siente bien",
    iNeedHelp: "Necesito ayuda",
    urgentAssistance: "Necesito asistencia urgente",
    thankYou: "¡Gracias por registrarse!",
    wereGlad: "Nos alegra que se sienta bien. Siga tomando sus medicamentos como se le indicó.",
    careTeamNotified: "Su equipo de atención ha sido notificado y se comunicará pronto.",
    callNow: "Por favor llame al 911 o vaya a la sala de emergencias inmediatamente.",
    call911: "Llamar al 911",
    close: "Cerrar",
    viewInEnglish: "Ver en Inglés",
    viewInLanguage: "Ver en",
    listenToCarePlan: "Escuchar Plan de Cuidado",
    stopListening: "Parar",
    downloadPdf: "Descargar PDF",
    print: "Imprimir",
    viewOriginal: "Ver Original",
    originalDocument: "Documento Original",
    readAloud: "Leer en Voz Alta",
    readAloudNotAvailable: "Leer en Voz Alta (No Disponible)",
    stopReading: "Dejar de Leer",
    saveAsPdf: "Guardar como PDF",
    needOriginalDocument: "¿Necesita el documento original del hospital?",
    viewOriginalDocument: "Ver Documento Original",
    originalDischargeDocument: "Documento de Alta Original",
    originalBeforeSimplification: "Este es el documento original del hospital antes de la simplificación",
    callClinic: "Llamar a la Clínica",
    emergency911: "Emergencia 911",
    verifyIdentity: "Verifique Su Identidad",
    enterYearOfBirth: "Ingrese su año de nacimiento para acceder a su plan de cuidado",
    yearOfBirthPlaceholder: "Año de Nacimiento (ej., 1980)",
    verifyButton: "Verificar",
    verifying: "Verificando...",
    attemptsRemaining: "intentos restantes",
    tooManyAttempts: "Demasiados Intentos",
    tryAgainLater: "Por favor intente de nuevo en 15 minutos o contacte a su equipo de atención.",
    greatToHear: "¡Qué bueno!",
    keepFollowing: "Siga su plan de cuidado. Estamos aquí si nos necesita.",
    weveNotifiedTeam: "Hemos notificado a su equipo de atención",
    theyWillCall: "Le llamarán dentro de 24 horas.",
    ifEmergency: "Si es una emergencia",
    teamNotifiedReachOut: "Su equipo de atención ha sido notificado y se comunicará con usted.",
    listenToSection: "Escuchar esta sección",
    readFullSummary: "Leer Resumen Completo en Voz Alta"
  },
  zh: {
    yourCarePlan: "您的护理计划",
    whatsWrong: "问题是什么",
    whatToDo: "该怎么做",
    warningSigns: "警告信号",
    warningSubtitle: "如果您有以下任何情况，请去急诊室或拨打911：",
    medications: "您的药物",
    appointments: "您的预约",
    howAreYouFeeling: "您感觉如何？",
    howAreYouFeelingToday: "您今天感觉如何？",
    letYourCareTeamKnow: "让您的护理团队知道",
    tapTheOption: "点击最能描述您状况的选项",
    checkIn: "签到",
    imFeelingGood: "我感觉很好",
    everythingOk: "一切都很顺利",
    iHaveAConcern: "我有一些担忧",
    somethingNotRight: "有些事情感觉不对",
    iNeedHelp: "我需要帮助",
    urgentAssistance: "我需要紧急帮助",
    thankYou: "感谢您的签到！",
    wereGlad: "很高兴您感觉良好。请继续按处方服药。",
    careTeamNotified: "您的护理团队已收到通知，将很快与您联系。",
    callNow: "请立即拨打911或前往急诊室。",
    call911: "拨打911",
    close: "关闭",
    viewInEnglish: "用英语查看",
    viewInLanguage: "用以下语言查看",
    listenToCarePlan: "收听护理计划",
    stopListening: "停止",
    downloadPdf: "下载PDF",
    print: "打印",
    viewOriginal: "查看原文",
    originalDocument: "原始文档",
    readAloud: "朗读",
    readAloudNotAvailable: "朗读（不可用）",
    stopReading: "停止朗读",
    saveAsPdf: "保存为PDF",
    needOriginalDocument: "需要原始医院文件吗？",
    viewOriginalDocument: "查看原始文件",
    originalDischargeDocument: "原始出院文件",
    originalBeforeSimplification: "这是简化前的原始医院文件",
    callClinic: "致电诊所",
    emergency911: "紧急呼叫911",
    verifyIdentity: "验证您的身份",
    enterYearOfBirth: "输入您的出生年份以访问您的护理计划",
    yearOfBirthPlaceholder: "出生年份（例如，1980）",
    verifyButton: "验证",
    verifying: "验证中...",
    attemptsRemaining: "剩余尝试次数",
    tooManyAttempts: "尝试次数过多",
    tryAgainLater: "请在15分钟后重试或联系您的护理团队。",
    greatToHear: "太好了！",
    keepFollowing: "继续遵循您的护理计划。如有需要，我们随时为您服务。",
    weveNotifiedTeam: "我们已通知您的护理团队",
    theyWillCall: "他们将在24小时内联系您。",
    ifEmergency: "如果是紧急情况",
    teamNotifiedReachOut: "您的护理团队已收到通知，将与您联系。",
    listenToSection: "收听此部分",
    readFullSummary: "朗读完整摘要"
  },
  vi: {
    yourCarePlan: "Kế Hoạch Chăm Sóc Của Bạn",
    whatsWrong: "Vấn Đề Là Gì",
    whatToDo: "Cần Làm Gì",
    warningSigns: "Dấu Hiệu Cảnh Báo",
    warningSubtitle: "Đến phòng cấp cứu hoặc gọi 911 nếu bạn có bất kỳ dấu hiệu nào sau đây:",
    medications: "Thuốc Của Bạn",
    appointments: "Lịch Hẹn Của Bạn",
    howAreYouFeeling: "Bạn cảm thấy thế nào?",
    howAreYouFeelingToday: "Hôm nay bạn cảm thấy thế nào?",
    letYourCareTeamKnow: "Cho đội ngũ chăm sóc của bạn biết",
    tapTheOption: "Chạm vào lựa chọn mô tả tốt nhất tình trạng của bạn",
    checkIn: "Đăng Ký",
    imFeelingGood: "Tôi cảm thấy tốt",
    everythingOk: "Mọi thứ đều ổn",
    iHaveAConcern: "Tôi có một lo ngại",
    somethingNotRight: "Có điều gì đó không đúng",
    iNeedHelp: "Tôi cần giúp đỡ",
    urgentAssistance: "Tôi cần hỗ trợ khẩn cấp",
    thankYou: "Cảm ơn bạn đã đăng ký!",
    wereGlad: "Chúng tôi vui vì bạn cảm thấy khỏe. Hãy tiếp tục uống thuốc theo chỉ định.",
    careTeamNotified: "Đội ngũ chăm sóc của bạn đã được thông báo và sẽ liên hệ sớm.",
    callNow: "Vui lòng gọi 911 hoặc đến phòng cấp cứu ngay lập tức.",
    call911: "Gọi 911",
    close: "Đóng",
    viewInEnglish: "Xem bằng tiếng Anh",
    viewInLanguage: "Xem bằng",
    listenToCarePlan: "Nghe Kế Hoạch Chăm Sóc",
    stopListening: "Dừng",
    downloadPdf: "Tải PDF",
    print: "In",
    viewOriginal: "Xem Bản Gốc",
    originalDocument: "Tài Liệu Gốc",
    readAloud: "Đọc To",
    readAloudNotAvailable: "Đọc To (Không Khả Dụng)",
    stopReading: "Dừng Đọc",
    saveAsPdf: "Lưu dưới dạng PDF",
    needOriginalDocument: "Cần tài liệu gốc từ bệnh viện?",
    viewOriginalDocument: "Xem Tài Liệu Gốc",
    originalDischargeDocument: "Tài Liệu Xuất Viện Gốc",
    originalBeforeSimplification: "Đây là tài liệu gốc của bệnh viện trước khi đơn giản hóa",
    callClinic: "Gọi Phòng Khám",
    emergency911: "Cấp Cứu 911",
    verifyIdentity: "Xác Minh Danh Tính",
    enterYearOfBirth: "Nhập năm sinh của bạn để truy cập kế hoạch chăm sóc",
    yearOfBirthPlaceholder: "Năm sinh (ví dụ: 1980)",
    verifyButton: "Xác Minh",
    verifying: "Đang xác minh...",
    attemptsRemaining: "lần thử còn lại",
    tooManyAttempts: "Quá Nhiều Lần Thử",
    tryAgainLater: "Vui lòng thử lại sau 15 phút hoặc liên hệ đội ngũ chăm sóc.",
    greatToHear: "Thật tuyệt!",
    keepFollowing: "Tiếp tục tuân theo kế hoạch chăm sóc. Chúng tôi ở đây nếu bạn cần.",
    weveNotifiedTeam: "Chúng tôi đã thông báo cho đội ngũ chăm sóc của bạn",
    theyWillCall: "Họ sẽ gọi cho bạn trong vòng 24 giờ.",
    ifEmergency: "Nếu đây là trường hợp khẩn cấp",
    teamNotifiedReachOut: "Đội ngũ chăm sóc của bạn đã được thông báo và sẽ liên hệ với bạn.",
    listenToSection: "Nghe phần này",
    readFullSummary: "Đọc To Toàn Bộ Tóm Tắt"
  },
  ar: {
    yourCarePlan: "خطة الرعاية الخاصة بك",
    whatsWrong: "ما المشكلة",
    whatToDo: "ماذا تفعل",
    warningSigns: "علامات التحذير",
    warningSubtitle: "اذهب إلى غرفة الطوارئ أو اتصل بـ 911 إذا كان لديك أي من هذه:",
    medications: "أدويتك",
    appointments: "مواعيدك",
    howAreYouFeeling: "كيف تشعر؟",
    howAreYouFeelingToday: "كيف تشعر اليوم؟",
    letYourCareTeamKnow: "أخبر فريق الرعاية الخاص بك",
    tapTheOption: "اضغط على الخيار الذي يصف حالتك",
    checkIn: "تسجيل الدخول",
    imFeelingGood: "أشعر بخير",
    everythingOk: "كل شيء على ما يرام",
    iHaveAConcern: "لدي قلق",
    somethingNotRight: "شيء ما ليس صحيحاً",
    iNeedHelp: "أحتاج مساعدة",
    urgentAssistance: "أحتاج مساعدة عاجلة",
    thankYou: "شكراً لتسجيل دخولك!",
    wereGlad: "نحن سعداء أنك تشعر بخير. استمر في تناول أدويتك كما هو موصوف.",
    careTeamNotified: "تم إخطار فريق الرعاية الخاص بك وسيتواصلون معك قريباً.",
    callNow: "يرجى الاتصال بـ 911 أو الذهاب إلى غرفة الطوارئ فوراً.",
    call911: "اتصل بـ 911",
    close: "إغلاق",
    viewInEnglish: "عرض بالإنجليزية",
    viewInLanguage: "عرض بـ",
    listenToCarePlan: "استمع لخطة الرعاية",
    stopListening: "توقف",
    downloadPdf: "تحميل PDF",
    print: "طباعة",
    viewOriginal: "عرض الأصل",
    originalDocument: "المستند الأصلي",
    readAloud: "اقرأ بصوت عالٍ",
    readAloudNotAvailable: "اقرأ بصوت عالٍ (غير متاح)",
    stopReading: "توقف عن القراءة",
    saveAsPdf: "حفظ كـ PDF",
    needOriginalDocument: "هل تحتاج إلى مستند المستشفى الأصلي؟",
    viewOriginalDocument: "عرض المستند الأصلي",
    originalDischargeDocument: "مستند الخروج الأصلي",
    originalBeforeSimplification: "هذا هو مستند المستشفى الأصلي قبل التبسيط",
    callClinic: "اتصل بالعيادة",
    emergency911: "طوارئ 911",
    verifyIdentity: "تحقق من هويتك",
    enterYearOfBirth: "أدخل سنة ميلادك للوصول إلى خطة الرعاية",
    yearOfBirthPlaceholder: "سنة الميلاد (مثال: 1980)",
    verifyButton: "تحقق",
    verifying: "جاري التحقق...",
    attemptsRemaining: "محاولات متبقية",
    tooManyAttempts: "محاولات كثيرة جداً",
    tryAgainLater: "يرجى المحاولة مرة أخرى بعد 15 دقيقة أو اتصل بفريق الرعاية.",
    greatToHear: "خبر رائع!",
    keepFollowing: "استمر في اتباع خطة الرعاية. نحن هنا إذا احتجتنا.",
    weveNotifiedTeam: "لقد أبلغنا فريق الرعاية الخاص بك",
    theyWillCall: "سيتصلون بك خلال 24 ساعة.",
    ifEmergency: "إذا كانت هذه حالة طوارئ",
    teamNotifiedReachOut: "تم إبلاغ فريق الرعاية الخاص بك وسيتواصلون معك.",
    listenToSection: "استمع لهذا القسم",
    readFullSummary: "اقرأ الملخص الكامل بصوت عالٍ"
  },
  ko: {
    yourCarePlan: "귀하의 케어 플랜",
    whatsWrong: "문제점",
    whatToDo: "해야 할 일",
    warningSigns: "경고 신호",
    warningSubtitle: "다음 증상이 있으면 응급실로 가거나 911에 전화하세요:",
    medications: "귀하의 약물",
    appointments: "귀하의 예약",
    howAreYouFeeling: "기분이 어떠세요?",
    howAreYouFeelingToday: "오늘 기분이 어떠세요?",
    letYourCareTeamKnow: "케어 팀에게 알려주세요",
    tapTheOption: "귀하의 상태를 가장 잘 설명하는 옵션을 탭하세요",
    checkIn: "체크인",
    imFeelingGood: "기분이 좋아요",
    everythingOk: "모든 것이 잘 되고 있어요",
    iHaveAConcern: "걱정이 있어요",
    somethingNotRight: "뭔가 이상해요",
    iNeedHelp: "도움이 필요해요",
    urgentAssistance: "긴급 도움이 필요해요",
    thankYou: "체크인해 주셔서 감사합니다!",
    wereGlad: "기분이 좋으시다니 다행입니다. 처방대로 약을 계속 복용하세요.",
    careTeamNotified: "케어 팀에게 알렸으며 곧 연락드릴 것입니다.",
    callNow: "지금 바로 911에 전화하거나 응급실로 가세요.",
    call911: "911 전화",
    close: "닫기",
    viewInEnglish: "영어로 보기",
    viewInLanguage: "다음 언어로 보기",
    listenToCarePlan: "케어 플랜 듣기",
    stopListening: "중지",
    downloadPdf: "PDF 다운로드",
    print: "인쇄",
    viewOriginal: "원본 보기",
    originalDocument: "원본 문서",
    readAloud: "소리내어 읽기",
    readAloudNotAvailable: "소리내어 읽기 (사용 불가)",
    stopReading: "읽기 중지",
    saveAsPdf: "PDF로 저장",
    needOriginalDocument: "원본 병원 문서가 필요하신가요?",
    viewOriginalDocument: "원본 문서 보기",
    originalDischargeDocument: "원본 퇴원 문서",
    originalBeforeSimplification: "이것은 간소화 전 원본 병원 문서입니다",
    callClinic: "병원에 전화",
    emergency911: "응급 911",
    verifyIdentity: "신원 확인",
    enterYearOfBirth: "케어 플랜에 접근하려면 출생 연도를 입력하세요",
    yearOfBirthPlaceholder: "출생 연도 (예: 1980)",
    verifyButton: "확인",
    verifying: "확인 중...",
    attemptsRemaining: "남은 시도 횟수",
    tooManyAttempts: "시도 횟수 초과",
    tryAgainLater: "15분 후에 다시 시도하거나 케어 팀에 연락하세요.",
    greatToHear: "다행이에요!",
    keepFollowing: "케어 플랜을 계속 따르세요. 필요하시면 저희가 여기 있습니다.",
    weveNotifiedTeam: "케어 팀에게 알렸습니다",
    theyWillCall: "24시간 이내에 연락드릴 것입니다.",
    ifEmergency: "긴급 상황이라면",
    teamNotifiedReachOut: "케어 팀에게 알렸으며 연락드릴 것입니다.",
    listenToSection: "이 섹션 듣기",
    readFullSummary: "전체 요약 소리내어 읽기"
  },
  tl: {
    yourCarePlan: "Iyong Plano ng Pangangalaga",
    whatsWrong: "Ano ang Mali",
    whatToDo: "Ano ang Dapat Gawin",
    warningSigns: "Mga Senyales ng Babala",
    warningSubtitle: "Pumunta sa emergency room o tumawag sa 911 kung mayroon ka ng alinman sa mga ito:",
    medications: "Iyong mga Gamot",
    appointments: "Iyong mga Appointment",
    howAreYouFeeling: "Kumusta ang pakiramdam mo?",
    howAreYouFeelingToday: "Kumusta ang pakiramdam mo ngayon?",
    letYourCareTeamKnow: "Ipaalam sa iyong care team",
    tapTheOption: "I-tap ang opsyon na pinakamahusay na naglalarawan kung paano ka",
    checkIn: "Mag-check In",
    imFeelingGood: "Mabuti ang pakiramdam ko",
    everythingOk: "Maayos ang lahat",
    iHaveAConcern: "May alalahanin ako",
    somethingNotRight: "May hindi tama",
    iNeedHelp: "Kailangan ko ng tulong",
    urgentAssistance: "Kailangan ko ng agarang tulong",
    thankYou: "Salamat sa pag-check in!",
    wereGlad: "Masaya kami na mabuti ang pakiramdam mo. Patuloy na uminom ng gamot ayon sa reseta.",
    careTeamNotified: "Na-notify na ang iyong care team at makikipag-ugnayan sa lalong madaling panahon.",
    callNow: "Mangyaring tumawag sa 911 o pumunta sa emergency room kaagad.",
    call911: "Tumawag sa 911",
    close: "Isara",
    viewInEnglish: "Tingnan sa Ingles",
    viewInLanguage: "Tingnan sa",
    listenToCarePlan: "Pakinggan ang Plano ng Pangangalaga",
    stopListening: "Itigil",
    downloadPdf: "I-download ang PDF",
    print: "I-print",
    viewOriginal: "Tingnan ang Orihinal",
    originalDocument: "Orihinal na Dokumento",
    readAloud: "Basahin ng Malakas",
    readAloudNotAvailable: "Basahin ng Malakas (Hindi Magagamit)",
    stopReading: "Itigil ang Pagbasa",
    saveAsPdf: "I-save bilang PDF",
    needOriginalDocument: "Kailangan mo ba ang orihinal na dokumento mula sa ospital?",
    viewOriginalDocument: "Tingnan ang Orihinal na Dokumento",
    originalDischargeDocument: "Orihinal na Dokumento ng Paglabas",
    originalBeforeSimplification: "Ito ang orihinal na dokumento ng ospital bago ang pagpapasimple",
    callClinic: "Tumawag sa Klinika",
    emergency911: "Emerhensya 911",
    verifyIdentity: "I-verify ang Iyong Pagkakakilanlan",
    enterYearOfBirth: "Ilagay ang iyong taon ng kapanganakan para ma-access ang iyong plano ng pangangalaga",
    yearOfBirthPlaceholder: "Taon ng Kapanganakan (hal., 1980)",
    verifyButton: "I-verify",
    verifying: "Nag-ve-verify...",
    attemptsRemaining: "mga natitirang pagsubok",
    tooManyAttempts: "Sobrang Daming Pagsubok",
    tryAgainLater: "Mangyaring subukan ulit sa 15 minuto o makipag-ugnayan sa iyong care team.",
    greatToHear: "Magandang balita!",
    keepFollowing: "Patuloy na sundin ang iyong plano ng pangangalaga. Narito kami kung kailangan mo kami.",
    weveNotifiedTeam: "Nai-notify na namin ang iyong care team",
    theyWillCall: "Tatawagan ka nila sa loob ng 24 na oras.",
    ifEmergency: "Kung ito ay isang emerhensya",
    teamNotifiedReachOut: "Na-notify na ang iyong care team at makikipag-ugnayan sa iyo.",
    listenToSection: "Pakinggan ang seksyong ito",
    readFullSummary: "Basahin ang Buong Buod ng Malakas"
  }
};

// Helper to get translation with fallback to English
function getTranslation(lang: string | null | undefined, key: string): string {
  const language = lang || "en";
  const translations = UI_TRANSLATIONS[language] || UI_TRANSLATIONS["en"];
  return translations[key] || UI_TRANSLATIONS["en"][key] || key;
}

export default function PatientPortal() {
  const { token } = useParams<{ token: string }>();
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const { toast } = useToast();
  
  // Check for demo mode (simple ?demo=1 parameter for clinician preview)
  const demoParam = new URLSearchParams(searchString).get("demo");
  const isDemoMode = demoParam === "1";
  
  const [isVerified, setIsVerified] = useState(isDemoMode);
  const [yearOfBirth, setYearOfBirth] = useState("");
  const [attemptsRemaining, setAttemptsRemaining] = useState(3);
  const [isLocked, setIsLocked] = useState(false);
  const [showEnglish, setShowEnglish] = useState(false);
  const [showOriginalDocument, setShowOriginalDocument] = useState(false);
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [checkInSubmitted, setCheckInSubmitted] = useState(false);
  const [checkInResponse, setCheckInResponse] = useState<"green" | "yellow" | "red" | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  

  // Fetch care plan by token
  const { data: carePlan, isLoading, error } = useQuery<CarePlanWithPatient>({
    queryKey: ["/api/patient", token],
    enabled: isVerified && !!token,
  });

  // Verify DOB mutation
  const verifyMutation = useMutation({
    mutationFn: async (yob: string) => {
      const response = await fetch(`/api/patient/${token}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yearOfBirth: parseInt(yob) }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw { ...data, status: response.status };
      }
      return data;
    },
    onSuccess: () => {
      setIsVerified(true);
      toast({ title: "Verified!", description: "You can now view your care plan" });
    },
    onError: (error: any) => {
      if (error.locked) {
        setIsLocked(true);
        setAttemptsRemaining(0);
        toast({ 
          title: "Too many attempts", 
          description: "Please try again in 15 minutes", 
          variant: "destructive" 
        });
      } else if (error.attemptsRemaining !== undefined) {
        setAttemptsRemaining(error.attemptsRemaining);
        toast({ 
          title: "Incorrect year of birth", 
          description: `${error.attemptsRemaining} attempt${error.attemptsRemaining !== 1 ? 's' : ''} remaining`,
          variant: "destructive" 
        });
      } else {
        toast({ title: "Verification failed", variant: "destructive" });
      }
    },
  });

  // Check-in response mutation
  const checkInMutation = useMutation({
    mutationFn: async (response: "green" | "yellow" | "red") => {
      return apiRequest("POST", `/api/patient/${token}/check-in`, { response });
    },
    onSuccess: (data, response) => {
      setCheckInSubmitted(true);
      setCheckInResponse(response);
    },
    onError: () => {
      toast({ title: "Failed to submit", variant: "destructive" });
    },
  });

  const handleVerify = () => {
    if (isLocked || attemptsRemaining <= 0) return;
    verifyMutation.mutate(yearOfBirth);
  };

  const getLanguageName = (code: string) => {
    return SUPPORTED_LANGUAGES.find(l => l.code === code)?.name || code;
  };

  const getLanguageCode = (code: string): string => {
    const languageMap: Record<string, string> = {
      en: "en-US", es: "es-ES", zh: "zh-CN", vi: "vi-VN", tl: "fil-PH",
      ko: "ko-KR", ru: "ru-RU", ar: "ar-SA", fr: "fr-FR", pt: "pt-BR",
      hi: "hi-IN", ur: "ur-PK", fa: "fa-IR", pl: "pl-PL", ht: "fr-HT", ja: "ja-JP"
    };
    return languageMap[code] || "en-US";
  };

  const [voicesLoaded, setVoicesLoaded] = useState(false);

  const isTTSSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  // Load voices when they become available
  useEffect(() => {
    if (!isTTSSupported) return;
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        setVoicesLoaded(true);
      }
    };
    loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
  }, [isTTSSupported]);

  const speakContent = useCallback(() => {
    if (!carePlan) return;
    
    // Check for TTS support first
    if (!isTTSSupported) {
      toast({ 
        title: "Text-to-speech not supported", 
        description: "Your browser doesn't support this feature. Try Chrome or Safari on desktop.",
        variant: "destructive" 
      });
      return;
    }
    
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    const diagnosis = showEnglish ? carePlan.simplifiedDiagnosis : carePlan.translatedDiagnosis;
    const instructions = showEnglish ? carePlan.simplifiedInstructions : carePlan.translatedInstructions;
    const warnings = showEnglish ? carePlan.simplifiedWarnings : carePlan.translatedWarnings;
    const medications = showEnglish ? carePlan.simplifiedMedications : carePlan.translatedMedications;

    const textParts: string[] = [];
    
    if (diagnosis) {
      textParts.push(showEnglish ? "What's wrong: " : "");
      textParts.push(diagnosis);
    }
    
    if (medications && medications.length > 0) {
      textParts.push(showEnglish ? "Your medications: " : "");
      medications.forEach((med: { name: string; dose: string; frequency: string; instructions?: string }) => {
        textParts.push(`${med.name}, ${med.dose}, ${med.frequency}.`);
        if (med.instructions) textParts.push(med.instructions);
      });
    }
    
    if (instructions) {
      textParts.push(showEnglish ? "What to do: " : "");
      textParts.push(instructions);
    }
    
    if (warnings) {
      textParts.push(showEnglish ? "Warning signs: " : "");
      textParts.push(warnings);
    }

    const fullText = textParts.join(" ");
    const utterance = new SpeechSynthesisUtterance(fullText);
    const targetLang = showEnglish ? "en-US" : getLanguageCode(carePlan.translatedLanguage || "en");
    utterance.lang = targetLang;
    utterance.rate = 0.9;
    
    // Try to find a voice matching the language
    const voices = window.speechSynthesis.getVoices();
    const matchingVoice = voices.find(v => v.lang.startsWith(targetLang.split('-')[0]));
    if (matchingVoice) {
      utterance.voice = matchingVoice;
    }
    
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = (e) => {
      setIsSpeaking(false);
      if (e.error !== 'canceled' && e.error !== 'interrupted') {
        toast({ 
          title: "Text-to-speech error", 
          description: "Unable to read aloud. Try using the Print option instead.",
          variant: "destructive" 
        });
      }
    };

    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }, [carePlan, showEnglish, isSpeaking, toast]);

  // Per-section TTS function
  const speakSection = useCallback((text: string) => {
    if (!text || !isTTSSupported) return;
    
    // Stop any current speech
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    
    const utterance = new SpeechSynthesisUtterance(text);
    const targetLang = showEnglish ? "en-US" : getLanguageCode(carePlan?.translatedLanguage || "en");
    utterance.lang = targetLang;
    utterance.rate = 0.9;
    
    const voices = window.speechSynthesis.getVoices();
    const matchingVoice = voices.find(v => v.lang.startsWith(targetLang.split('-')[0]));
    if (matchingVoice) {
      utterance.voice = matchingVoice;
    }
    
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }, [carePlan, showEnglish, isTTSSupported]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = useCallback(() => {
    if (!carePlan) return;
    
    // Check for non-Latin scripts that jsPDF can't render properly
    const nonLatinLanguages = ['zh', 'ja', 'ko', 'ar', 'hi', 'ur', 'fa'];
    const currentLang = carePlan.translatedLanguage || 'en';
    if (!showEnglish && nonLatinLanguages.includes(currentLang)) {
      toast({
        title: "PDF may not display correctly",
        description: "For best results with this language, use Print and select 'Save as PDF'."
      });
    }
    
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    const contentWidth = pageWidth - 2 * margin;
    let y = 20;
    
    const diagnosis = showEnglish ? carePlan.simplifiedDiagnosis : carePlan.translatedDiagnosis;
    const instructions = showEnglish ? carePlan.simplifiedInstructions : carePlan.translatedInstructions;
    const warnings = showEnglish ? carePlan.simplifiedWarnings : carePlan.translatedWarnings;
    const medications = showEnglish ? carePlan.simplifiedMedications : carePlan.translatedMedications;
    const appointments = showEnglish ? carePlan.simplifiedAppointments : carePlan.translatedAppointments;
    
    // Title
    doc.setFontSize(24);
    doc.setFont("helvetica", "bold");
    doc.text("Your Care Plan", pageWidth / 2, y, { align: "center" });
    y += 10;
    
    doc.setFontSize(14);
    doc.setFont("helvetica", "normal");
    doc.text(carePlan.patient.name, pageWidth / 2, y, { align: "center" });
    y += 15;
    
    // Helper to add wrapped text
    const addSection = (title: string, content: string | null) => {
      if (!content) return;
      if (y > 270) { doc.addPage(); y = 20; }
      
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(title, margin, y);
      y += 7;
      
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      const lines = doc.splitTextToSize(content, contentWidth);
      lines.forEach((line: string) => {
        if (y > 280) { doc.addPage(); y = 20; }
        doc.text(line, margin, y);
        y += 5.5;
      });
      y += 8;
    };
    
    addSection("What's Wrong", diagnosis);
    
    // Medications
    if (medications && medications.length > 0) {
      if (y > 270) { doc.addPage(); y = 20; }
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Your Medications", margin, y);
      y += 8;
      
      medications.forEach((med: { name: string; dose: string; frequency: string; instructions?: string }) => {
        if (y > 270) { doc.addPage(); y = 20; }
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text(`${med.name} - ${med.dose}`, margin, y);
        y += 5;
        doc.setFont("helvetica", "normal");
        doc.text(med.frequency, margin, y);
        y += 5;
        if (med.instructions) {
          const lines = doc.splitTextToSize(med.instructions, contentWidth);
          lines.forEach((line: string) => {
            doc.text(line, margin, y);
            y += 5;
          });
        }
        y += 3;
      });
      y += 5;
    }
    
    // Appointments
    if (appointments && appointments.length > 0) {
      if (y > 270) { doc.addPage(); y = 20; }
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Your Appointments", margin, y);
      y += 8;
      
      appointments.forEach((apt: { purpose: string; date: string; time: string; location: string }) => {
        if (y > 270) { doc.addPage(); y = 20; }
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text(apt.purpose, margin, y);
        y += 5;
        doc.setFont("helvetica", "normal");
        doc.text(`${apt.date} at ${apt.time}`, margin, y);
        y += 5;
        doc.text(apt.location, margin, y);
        y += 8;
      });
      y += 5;
    }
    
    addSection("What to Do", instructions);
    
    // Warnings with emphasis
    if (warnings) {
      if (y > 270) { doc.addPage(); y = 20; }
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(220, 38, 38);
      doc.text("Warning Signs - Seek Emergency Care", margin, y);
      y += 7;
      
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      const lines = doc.splitTextToSize(warnings, contentWidth);
      lines.forEach((line: string) => {
        if (y > 280) { doc.addPage(); y = 20; }
        doc.text(line, margin, y);
        y += 5.5;
      });
      doc.setTextColor(0, 0, 0);
      y += 8;
    }
    
    // Footer
    if (y > 260) { doc.addPage(); y = 20; }
    y = doc.internal.pageSize.getHeight() - 20;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Emergency: Call 911 | Clinic: (555) 123-4567", pageWidth / 2, y, { align: "center" });
    
    // Save
    const fileName = `care-plan-${carePlan.patient.name.replace(/\s+/g, '-').toLowerCase()}.pdf`;
    doc.save(fileName);
    
    toast({
      title: "PDF Downloaded",
      description: "Your care plan has been saved to your device."
    });
  }, [carePlan, showEnglish, toast]);

  // Verification Screen
  if (!isVerified) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center pb-2">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Shield className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">Verify Your Identity</CardTitle>
            <CardDescription className="text-base">
              Please enter your year of birth to access your care instructions
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="yob" className="text-base">Year of Birth</Label>
              <Input
                id="yob"
                type="number"
                placeholder="e.g., 1956"
                value={yearOfBirth}
                onChange={(e) => setYearOfBirth(e.target.value)}
                className="text-center text-2xl h-14"
                maxLength={4}
                disabled={isLocked}
                data-testid="input-verify-yob"
              />
            </div>
            <Button 
              className="w-full h-12 text-lg"
              onClick={handleVerify}
              disabled={yearOfBirth.length !== 4 || verifyMutation.isPending || isLocked}
              data-testid="button-verify"
            >
              {verifyMutation.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                "Continue"
              )}
            </Button>
            {attemptsRemaining < 3 && attemptsRemaining > 0 && (
              <p className="text-sm text-destructive text-center">
                {attemptsRemaining} attempt{attemptsRemaining !== 1 ? 's' : ''} remaining
              </p>
            )}
            {isLocked && (
              <p className="text-sm text-destructive text-center">
                Too many attempts. Please try again in 15 minutes.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Error state
  if (error || !carePlan) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-6">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Care Plan Not Found</h2>
            <p className="text-muted-foreground">
              This link may have expired or is invalid. Please contact your care team.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Check-in submitted response
  if (checkInSubmitted && checkInResponse) {
    const responseLang = carePlan?.translatedLanguage || "en";
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-8 text-center">
            {checkInResponse === "green" && (
              <>
                <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
                  <Check className="h-10 w-10 text-green-600 dark:text-green-400" />
                </div>
                <h2 className="text-2xl font-semibold mb-2 text-green-700 dark:text-green-400">
                  {getTranslation(responseLang, "greatToHear")}
                </h2>
                <p className="text-muted-foreground text-lg">
                  {getTranslation(responseLang, "keepFollowing")}
                </p>
              </>
            )}
            {checkInResponse === "yellow" && (
              <>
                <div className="w-20 h-20 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center mx-auto mb-4">
                  <Phone className="h-10 w-10 text-yellow-600 dark:text-yellow-400" />
                </div>
                <h2 className="text-2xl font-semibold mb-2 text-yellow-700 dark:text-yellow-400">
                  {getTranslation(responseLang, "weveNotifiedTeam")}
                </h2>
                <p className="text-muted-foreground text-lg mb-6">
                  {getTranslation(responseLang, "theyWillCall")}
                </p>
                <Button size="lg" className="gap-2" asChild>
                  <a href="tel:+15551234567">
                    <Phone className="h-5 w-5" />
                    {getTranslation(responseLang, "callClinic")}: (555) 123-4567
                  </a>
                </Button>
              </>
            )}
            {checkInResponse === "red" && (
              <>
                <div className="w-20 h-20 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
                  <AlertTriangle className="h-10 w-10 text-red-600 dark:text-red-400" />
                </div>
                <h2 className="text-2xl font-semibold mb-2 text-red-700 dark:text-red-400">
                  {getTranslation(responseLang, "ifEmergency")}
                </h2>
                <Button 
                  size="lg" 
                  variant="destructive" 
                  className="w-full h-16 text-xl mb-4"
                  asChild
                >
                  <a href="tel:911">
                    <Phone className="h-6 w-6 mr-2" />
                    {getTranslation(responseLang, "call911")}
                  </a>
                </Button>
                <p className="text-muted-foreground">
                  {getTranslation(responseLang, "teamNotifiedReachOut")}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Check-in screen
  if (showCheckIn) {
    const checkInLang = carePlan?.translatedLanguage || "en";
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background p-4">
        <div className="max-w-lg mx-auto pt-8">
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">{getTranslation(checkInLang, "howAreYouFeelingToday")}</CardTitle>
              <CardDescription className="text-base">
                {getTranslation(checkInLang, "tapTheOption")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Green */}
              <button
                onClick={() => checkInMutation.mutate("green")}
                disabled={checkInMutation.isPending}
                className="w-full p-6 rounded-xl bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900/30 hover:border-green-400 dark:hover:border-green-600 transition-all flex items-center gap-4 text-left"
                data-testid="button-checkin-green"
              >
                <div className="w-14 h-14 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                  <Check className="h-7 w-7 text-white" />
                </div>
                <div>
                  <div className="font-semibold text-lg text-green-800 dark:text-green-300">{getTranslation(checkInLang, "imFeelingGood")}</div>
                  <div className="text-green-600 dark:text-green-400">{getTranslation(checkInLang, "everythingOk")}</div>
                </div>
              </button>

              {/* Yellow */}
              <button
                onClick={() => checkInMutation.mutate("yellow")}
                disabled={checkInMutation.isPending}
                className="w-full p-6 rounded-xl bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-200 dark:border-yellow-800 hover:bg-yellow-100 dark:hover:bg-yellow-900/30 hover:border-yellow-400 dark:hover:border-yellow-600 transition-all flex items-center gap-4 text-left"
                data-testid="button-checkin-yellow"
              >
                <div className="w-14 h-14 rounded-full bg-yellow-500 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="h-7 w-7 text-white" />
                </div>
                <div>
                  <div className="font-semibold text-lg text-yellow-800 dark:text-yellow-300">{getTranslation(checkInLang, "iHaveAConcern")}</div>
                  <div className="text-yellow-600 dark:text-yellow-400">{getTranslation(checkInLang, "somethingNotRight")}</div>
                </div>
              </button>

              {/* Red */}
              <button
                onClick={() => checkInMutation.mutate("red")}
                disabled={checkInMutation.isPending}
                className="w-full p-6 rounded-xl bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/30 hover:border-red-400 dark:hover:border-red-600 transition-all flex items-center gap-4 text-left"
                data-testid="button-checkin-red"
              >
                <div className="w-14 h-14 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0">
                  <Phone className="h-7 w-7 text-white" />
                </div>
                <div>
                  <div className="font-semibold text-lg text-red-800 dark:text-red-300">{getTranslation(checkInLang, "iNeedHelp")}</div>
                  <div className="text-red-600 dark:text-red-400">{getTranslation(checkInLang, "urgentAssistance")}</div>
                </div>
              </button>

              {checkInMutation.isPending && (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              )}
            </CardContent>
          </Card>
          
          <Button 
            variant="ghost" 
            className="w-full mt-4"
            onClick={() => setShowCheckIn(false)}
          >
            {getTranslation(checkInLang, "close")}
          </Button>
        </div>
      </div>
    );
  }

  // Main Care Plan View
  const diagnosis = showEnglish ? carePlan.simplifiedDiagnosis : carePlan.translatedDiagnosis;
  const instructions = showEnglish ? carePlan.simplifiedInstructions : carePlan.translatedInstructions;
  const warnings = showEnglish ? carePlan.simplifiedWarnings : carePlan.translatedWarnings;
  const medications = showEnglish ? carePlan.simplifiedMedications : carePlan.translatedMedications;
  const appointments = showEnglish ? carePlan.simplifiedAppointments : carePlan.translatedAppointments;

  return (
    <div className="min-h-screen bg-background">
      {/* Demo Mode Banner */}
      {isDemoMode && (
        <div className="bg-yellow-500 text-yellow-950 text-center py-2 px-4 text-sm font-medium">
          Clinician Preview Mode - This is how patients see their care plan
        </div>
      )}
      
      {/* Header */}
      <header className="sticky top-0 z-50 bg-primary text-primary-foreground">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold">{getTranslation(showEnglish ? "en" : carePlan.translatedLanguage, "yourCarePlan")}</h1>
              <p className="text-primary-foreground/80 text-sm">
                {carePlan.patient.name}
              </p>
            </div>
            {/* Only show language toggle if care plan is translated (not English) */}
            {carePlan.translatedLanguage !== "en" && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowEnglish(!showEnglish)}
                className="gap-2"
                data-testid="button-toggle-language"
              >
                <Languages className="h-4 w-4" />
                {showEnglish ? "English" : getLanguageName(carePlan.translatedLanguage || "en")}
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4 pb-24">
        {/* Check-in Prompt */}
        {carePlan.checkIns && carePlan.checkIns.some(c => !c.respondedAt) && (
          <Card className="border-primary bg-primary/5">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Heart className="h-6 w-6 text-primary" />
                  <div>
                    <p className="font-medium">{getTranslation(showEnglish ? "en" : carePlan.translatedLanguage, "howAreYouFeeling")}</p>
                    <p className="text-sm text-muted-foreground">{getTranslation(showEnglish ? "en" : carePlan.translatedLanguage, "letYourCareTeamKnow")}</p>
                  </div>
                </div>
                <Button onClick={() => setShowCheckIn(true)} data-testid="button-start-checkin">
                  {getTranslation(showEnglish ? "en" : carePlan.translatedLanguage, "checkIn")}
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Diagnosis Card */}
        {diagnosis && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Heart className="h-5 w-5 text-primary" />
                  {getTranslation(showEnglish ? "en" : carePlan.translatedLanguage, "whatsWrong")}
                </div>
                {isTTSSupported && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => speakSection(diagnosis)}
                    data-testid="button-speak-diagnosis"
                    className="h-8 w-8"
                    aria-label="Read diagnosis aloud"
                  >
                    <Volume2 className="h-4 w-4" />
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg leading-relaxed">{diagnosis}</p>
            </CardContent>
          </Card>
        )}

        {/* Medications Card */}
        {medications && medications.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Pill className="h-5 w-5 text-primary" />
                  {getTranslation(showEnglish ? "en" : carePlan.translatedLanguage, "medications")}
                </div>
                {isTTSSupported && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      const medsText = medications.map(med => 
                        `${med.name}, ${med.dose}, ${med.frequency}. ${med.instructions || ''}`
                      ).join(' ');
                      speakSection(medsText);
                    }}
                    data-testid="button-speak-medications"
                    className="h-8 w-8"
                    aria-label="Read medications aloud"
                  >
                    <Volume2 className="h-4 w-4" />
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {medications.map((med, index) => (
                <div key={index} className="p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-semibold text-lg">{med.name}</h4>
                    <Badge variant="outline">{med.dose}</Badge>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground mb-2">
                    <Clock className="h-4 w-4" />
                    <span>{med.frequency}</span>
                  </div>
                  {med.instructions && (
                    <p className="text-sm text-muted-foreground">{med.instructions}</p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Appointments Card */}
        {appointments && appointments.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  {getTranslation(showEnglish ? "en" : carePlan.translatedLanguage, "appointments")}
                </div>
                {isTTSSupported && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      const aptsText = appointments.map(apt => 
                        `${apt.purpose}, ${apt.date} at ${apt.time}, ${apt.location}`
                      ).join('. ');
                      speakSection(aptsText);
                    }}
                    data-testid="button-speak-appointments"
                    className="h-8 w-8"
                    aria-label="Read appointments aloud"
                  >
                    <Volume2 className="h-4 w-4" />
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {appointments.map((apt, index) => (
                <div key={index} className="p-4 bg-muted/50 rounded-lg">
                  <h4 className="font-semibold text-lg mb-2">{apt.purpose}</h4>
                  <div className="space-y-2 text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      <span>{apt.date} at {apt.time}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      <span>{apt.location}</span>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Instructions Card */}
        {instructions && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Check className="h-5 w-5 text-primary" />
                  {getTranslation(showEnglish ? "en" : carePlan.translatedLanguage, "whatToDo")}
                </div>
                {isTTSSupported && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => speakSection(instructions)}
                    data-testid="button-speak-instructions"
                    className="h-8 w-8"
                    aria-label="Read instructions aloud"
                  >
                    <Volume2 className="h-4 w-4" />
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="prose prose-lg dark:prose-invert max-w-none">
                <p className="whitespace-pre-wrap leading-relaxed">{formatContent(instructions)}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Warnings Card */}
        {warnings && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center justify-between gap-2 text-destructive">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  {getTranslation(showEnglish ? "en" : carePlan.translatedLanguage, "warningSigns")}
                </div>
                {isTTSSupported && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => speakSection(warnings)}
                    data-testid="button-speak-warnings"
                    className="h-8 w-8 text-destructive"
                    aria-label="Read warnings aloud"
                  >
                    <Volume2 className="h-4 w-4" />
                  </Button>
                )}
              </CardTitle>
              <CardDescription>
                {getTranslation(showEnglish ? "en" : carePlan.translatedLanguage, "warningSubtitle")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="prose prose-lg dark:prose-invert max-w-none">
                <p className="whitespace-pre-wrap leading-relaxed text-destructive/90">{formatContent(warnings)}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Read Aloud and Download/Print Buttons */}
        <div className="space-y-3">
          <Button 
            variant="outline" 
            className="w-full h-14 text-lg gap-3"
            onClick={speakContent}
            disabled={!isTTSSupported}
            data-testid="button-read-aloud"
          >
            {isSpeaking ? (
              <>
                <VolumeX className="h-5 w-5" />
                {getTranslation(showEnglish ? "en" : carePlan.translatedLanguage, "stopReading")}
              </>
            ) : (
              <>
                <Volume2 className="h-5 w-5" />
                {isTTSSupported 
                  ? getTranslation(showEnglish ? "en" : carePlan.translatedLanguage, "readAloud") 
                  : getTranslation(showEnglish ? "en" : carePlan.translatedLanguage, "readAloudNotAvailable")}
              </>
            )}
          </Button>
          <div className="flex gap-3">
            <Button 
              variant="outline" 
              className="flex-1 h-14 text-lg gap-3"
              onClick={handleDownloadPDF}
              data-testid="button-download-pdf"
            >
              <Download className="h-5 w-5" />
              {getTranslation(showEnglish ? "en" : carePlan.translatedLanguage, "saveAsPdf")}
            </Button>
            <Button 
              variant="outline" 
              className="flex-1 h-14 text-lg gap-3"
              onClick={handlePrint}
              data-testid="button-print"
            >
              <Printer className="h-5 w-5" />
              {getTranslation(showEnglish ? "en" : carePlan.translatedLanguage, "print")}
            </Button>
          </div>
        </div>

        {/* Original Document Access */}
        {carePlan.originalFileName && carePlan.originalContent && (
          <div className="pt-4 border-t">
            <p className="text-sm text-muted-foreground mb-2">
              {getTranslation(showEnglish ? "en" : carePlan.translatedLanguage, "needOriginalDocument")}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setShowOriginalDocument(true)}
              data-testid="button-view-original"
            >
              <FileText className="h-4 w-4 mr-2" />
              {getTranslation(showEnglish ? "en" : carePlan.translatedLanguage, "viewOriginalDocument")}
            </Button>
          </div>
        )}

        {/* Original Document Modal */}
        <Dialog open={showOriginalDocument} onOpenChange={setShowOriginalDocument}>
          <DialogContent className="max-w-4xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {getTranslation(showEnglish ? "en" : carePlan.translatedLanguage, "originalDischargeDocument")}
              </DialogTitle>
              <DialogDescription>
                {getTranslation(showEnglish ? "en" : carePlan.translatedLanguage, "originalBeforeSimplification")}
              </DialogDescription>
            </DialogHeader>
            {carePlan.originalFileName?.toLowerCase().endsWith(".pdf") ? (
              <iframe
                src={`/api/care-plans/${carePlan.id}/document?token=${token}`}
                className="w-full h-[60vh] border rounded-lg"
                title="Original Document"
                data-testid="iframe-original-document"
              />
            ) : (
              <ScrollArea className="max-h-[50vh] mt-4">
                <pre className="whitespace-pre-wrap text-sm font-mono bg-muted p-4 rounded-lg">
                  {carePlan.originalContent}
                </pre>
              </ScrollArea>
            )}
          </DialogContent>
        </Dialog>
      </main>

      {/* Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t p-4">
        <div className="max-w-2xl mx-auto flex gap-4">
          <Button 
            variant="outline" 
            className="flex-1 h-14 text-lg gap-2"
            asChild
          >
            <a href="tel:+15551234567">
              <Phone className="h-5 w-5" />
              {getTranslation(showEnglish ? "en" : carePlan.translatedLanguage, "callClinic")}
            </a>
          </Button>
          <Button 
            variant="destructive"
            className="flex-1 h-14 text-lg gap-2"
            asChild
          >
            <a href="tel:911">
              <AlertTriangle className="h-5 w-5" />
              {getTranslation(showEnglish ? "en" : carePlan.translatedLanguage, "emergency911")}
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
