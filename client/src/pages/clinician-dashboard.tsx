import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import {
  Upload,
  FileText,
  Check,
  CheckCircle,
  Send,
  Loader2,
  AlertTriangle,
  Languages,
  Stethoscope,
  Pill,
  Calendar,
  ClipboardList,
  Eye,
  RefreshCw,
  Clock,
  MapPin,
  User,
  ExternalLink,
  Trash2,
  ChevronsUpDown,
  RotateCcw,
  X,
  PenLine,
  Mic,
  MicOff,
  ClipboardPaste,
  Camera,
  Type,
  Mail,
  Copy,
  Save,
  ChevronDown,
  ChevronRight,
  UserPlus,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  CarePlan,
  Patient,
  SimplifiedMedication,
  SimplifiedAppointment,
} from "@shared/schema";
import { SUPPORTED_LANGUAGES } from "@shared/schema";
import { formatContent, isValidEmail, isValidYearOfBirth, getLanguageName, viewAsPatient } from "@/lib/utils";

function isValidDateOfBirth(dob: string): boolean {
  if (!dob) return false;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return false;
  const year = d.getFullYear();
  return year >= 1900 && year <= new Date().getFullYear();
}

// Helper component to render medications in a structured format
function MedicationsList({
  medications,
  title,
  columnId,
  editable,
  editValues,
  onEdit,
}: {
  medications?: SimplifiedMedication[] | null;
  title: string;
  columnId: string;
  editable?: boolean;
  editValues?: Record<string, string>;
  onEdit?: (field: string, value: string) => void;
}) {
  if (!medications || medications.length === 0) return null;

  const getFieldVal = (index: number, field: string, original: string) => {
    const key = `simplifiedMedications_${index}_${field}`;
    if (editValues && key in editValues) return editValues[key];
    return original || "";
  };

  const hasAnyEdits = editValues && medications.some((_, i) => 
    ["name", "dose", "frequency", "instructions"].some(f => `simplifiedMedications_${i}_${f}` in editValues!)
  );

  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
        <Pill className="h-3 w-3" />
        {title}
        {hasAnyEdits && (
          <Badge variant="secondary" className="ml-auto text-[10px]">edited</Badge>
        )}
      </Label>
      <div className="space-y-2">
        {medications.map((med, index) => (
          <div
            key={index}
            className="bg-muted/50 rounded-lg p-3 border border-border/50"
            data-testid={`medication-${columnId}-${index}`}
          >
            <div className="flex items-start justify-between gap-2 flex-wrap">
              {editable && onEdit ? (
                <input
                  className="font-medium text-sm bg-transparent border-b border-dashed border-primary/40 outline-none flex-1 min-w-0 focus:border-primary"
                  value={getFieldVal(index, "name", med.name)}
                  onChange={(e) => onEdit(`simplifiedMedications_${index}_name`, e.target.value)}
                  data-testid={`input-med-name-${columnId}-${index}`}
                />
              ) : (
                <span className="font-medium text-sm">{med.name}</span>
              )}
              {(med.dose || editable) && (
                editable && onEdit ? (
                  <input
                    className="text-xs bg-transparent border-b border-dashed border-primary/40 outline-none w-24 text-right focus:border-primary"
                    value={getFieldVal(index, "dose", med.dose || "")}
                    onChange={(e) => onEdit(`simplifiedMedications_${index}_dose`, e.target.value)}
                    placeholder="dose"
                    data-testid={`input-med-dose-${columnId}-${index}`}
                  />
                ) : med.dose ? (
                  <Badge variant="outline" className="text-xs flex-shrink-0">
                    {med.dose}
                  </Badge>
                ) : null
              )}
            </div>
            {(med.frequency || editable) && (
              <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3 flex-shrink-0" />
                {editable && onEdit ? (
                  <input
                    className="bg-transparent border-b border-dashed border-primary/40 outline-none flex-1 text-xs focus:border-primary"
                    value={getFieldVal(index, "frequency", med.frequency || "")}
                    onChange={(e) => onEdit(`simplifiedMedications_${index}_frequency`, e.target.value)}
                    placeholder="frequency"
                    data-testid={`input-med-freq-${columnId}-${index}`}
                  />
                ) : (
                  med.frequency
                )}
              </div>
            )}
            {(med.instructions || editable) && (
              editable && onEdit ? (
                <input
                  className="text-xs text-muted-foreground mt-1 italic bg-transparent border-b border-dashed border-primary/40 outline-none w-full focus:border-primary"
                  value={getFieldVal(index, "instructions", med.instructions || "")}
                  onChange={(e) => onEdit(`simplifiedMedications_${index}_instructions`, e.target.value)}
                  placeholder="instructions"
                  data-testid={`input-med-instr-${columnId}-${index}`}
                />
              ) : med.instructions ? (
                <p className="text-xs text-muted-foreground mt-1 italic">
                  {med.instructions}
                </p>
              ) : null
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Helper component to render appointments in a structured format
function AppointmentsList({
  appointments,
  title,
  columnId,
  editable,
  editValues,
  onEdit,
}: {
  appointments?: SimplifiedAppointment[] | null;
  title: string;
  columnId: string;
  editable?: boolean;
  editValues?: Record<string, string>;
  onEdit?: (field: string, value: string) => void;
}) {
  if (!appointments || appointments.length === 0) return null;

  const getFieldVal = (index: number, field: string, original: string) => {
    const key = `simplifiedAppointments_${index}_${field}`;
    if (editValues && key in editValues) return editValues[key];
    return original || "";
  };

  const aptFields = ["purpose", "date", "time", "provider", "location", "phone", "schedulingInstructions", "itemsToBring"];
  const hasAnyEdits = editValues && appointments.some((_, i) =>
    aptFields.some(f => `simplifiedAppointments_${i}_${f}` in editValues!)
  );

  const EditableField = ({ index, field, original, icon: Icon, placeholder, bold }: {
    index: number; field: string; original: string; icon?: any; placeholder: string; bold?: boolean;
  }) => {
    if (!editable || !onEdit) {
      if (!original) return null;
      return (
        <div className={`flex items-center gap-1 ${bold ? "font-medium text-sm" : "text-xs text-muted-foreground"} ${!bold ? "mt-1" : ""}`}>
          {Icon && <Icon className="h-3 w-3 flex-shrink-0" />}
          {original}
        </div>
      );
    }
    return (
      <div className={`flex items-center gap-1 ${!bold ? "mt-1" : ""}`}>
        {Icon && <Icon className="h-3 w-3 flex-shrink-0 text-muted-foreground" />}
        <input
          className={`bg-transparent border-b border-dashed border-primary/40 outline-none flex-1 text-xs focus:border-primary ${bold ? "font-medium text-sm" : "text-muted-foreground"}`}
          value={getFieldVal(index, field, original)}
          onChange={(e) => onEdit(`simplifiedAppointments_${index}_${field}`, e.target.value)}
          placeholder={placeholder}
          data-testid={`input-apt-${field}-${columnId}-${index}`}
        />
      </div>
    );
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
        <Calendar className="h-3 w-3" />
        {title}
        {hasAnyEdits && (
          <Badge variant="secondary" className="ml-auto text-[10px]">edited</Badge>
        )}
      </Label>
      <div className="space-y-2">
        {appointments.map((apt, index) => (
          <div
            key={index}
            className="bg-muted/50 rounded-lg p-3 border border-border/50"
            data-testid={`appointment-${columnId}-${index}`}
          >
            <EditableField index={index} field="purpose" original={apt.purpose || ""} placeholder="purpose" bold />
            <div className="flex flex-wrap gap-3 mt-1">
              <EditableField index={index} field="date" original={apt.date || ""} icon={Calendar} placeholder="date" />
              <EditableField index={index} field="time" original={apt.time || ""} icon={Clock} placeholder="time" />
              <EditableField index={index} field="provider" original={apt.provider || ""} icon={User} placeholder="doctor" />
            </div>
            <EditableField index={index} field="location" original={apt.location || ""} icon={MapPin} placeholder="location" />
            <EditableField index={index} field="phone" original={apt.phone || ""} icon={ExternalLink} placeholder="phone" />
            {(apt.schedulingInstructions || editable) && (
              <EditableField index={index} field="schedulingInstructions" original={apt.schedulingInstructions || ""} placeholder="scheduling notes" />
            )}
            {(apt.itemsToBring || editable) && (
              <EditableField index={index} field="itemsToBring" original={apt.itemsToBring || ""} placeholder="items to bring" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

type CarePlanWithPatient = CarePlan & { patient?: Patient };

type UserWithTenant = {
  id: string;
  name: string;
  role: string;
  tenantId?: string | null;
  tenant?: { id: string; name: string; slug: string; isDemo: boolean; interpreterReviewMode?: string } | null;
};

export default function ClinicianDashboard() {
  const { toast } = useToast();
  
  // Fetch environment info to determine if we're in demo mode
  const { data: envInfo } = useQuery<{ isDemoMode: boolean; isProduction: boolean }>({
    queryKey: ["/api/env-info"],
  });
  const isDemoMode = envInfo?.isDemoMode ?? false;
  
  // Fetch current user info to get tenant's isDemo flag
  // Use staleTime: 0 to ensure fresh tenant data is always fetched
  const { data: currentUser } = useQuery<UserWithTenant>({
    queryKey: ["/api/auth/me"],
    staleTime: 0,
  });
  const isTenantDemo = currentUser?.tenant?.isDemo ?? false;
  const tenantSlug = currentUser?.tenant?.slug ?? "";
  const interpreterReviewMode = currentUser?.tenant?.interpreterReviewMode ?? "disabled";

  const sampleDocsByTenant: Record<string, Array<{ file: string; label: string }>> = {
    riverside: [
      { file: "discharge_rosa_martinez_chf.pdf", label: "Rosa Martinez - CHF (Spanish)" },
      { file: "discharge_nguyen_thi_lan_appendectomy.pdf", label: "Nguyen Thi Lan - Appendectomy (Vietnamese)" },
      { file: "discharge_wei_zhang_pneumonia.pdf", label: "Wei Zhang - Pneumonia (Chinese)" },
      { file: "discharge_amadou_diallo_sickle_cell.pdf", label: "Amadou Diallo - Sickle Cell (French)" },
      { file: "discharge_olga_petrov_copd.pdf", label: "Olga Petrov - COPD (Russian)" },
    ],
    lakeside: [
      { file: "discharge_fatima_al_hassan_gestational_diabetes.pdf", label: "Fatima Al-Hassan - Gestational Diabetes (Arabic)" },
      { file: "discharge_aisha_rahman_chf.pdf", label: "Aisha Rahman - CHF (Arabic)" },
      { file: "discharge_arjun_sharma_asthma.pdf", label: "Arjun Sharma - Asthma (Hindi)" },
      { file: "discharge_pedro_gutierrez_knee.pdf", label: "Pedro Gutierrez - Knee Surgery (Spanish)" },
      { file: "discharge_tran_van_duc_stroke.pdf", label: "Tran Van Duc - Stroke (Vietnamese)" },
    ],
  };
  const sharedSampleDocs = [
    { file: "discharge_keiko_tanaka_pancreatitis.pdf", label: "Keiko Tanaka - Pancreatitis (Japanese)" },
    { file: "discharge_mei_ling_chen_postpartum.pdf", label: "Mei Ling Chen - Postpartum (Chinese)" },
    { file: "discharge_james_oconnell_hip_replacement.pdf", label: "James O'Connell - Hip Replacement (English)" },
  ];
  const tenantSampleDocs = [
    ...(sampleDocsByTenant[tenantSlug] || []),
    ...sharedSampleDocs,
  ];
  
  const [selectedCarePlan, setSelectedCarePlan] =
    useState<CarePlanWithPatient | null>(null);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [isSendDialogOpen, setIsSendDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isOverrideDialogOpen, setIsOverrideDialogOpen] = useState(false);
  const [overrideJustification, setOverrideJustification] = useState("");
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [inputTab, setInputTab] = useState("upload");
  const [capturedPhoto, setCapturedPhoto] = useState<File | null>(null);
  const [capturedPhotoUrl, setCapturedPhotoUrl] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [textInputPatientId, setTextInputPatientId] = useState<string>("");
  const [showTextPatientFields, setShowTextPatientFields] = useState(false);
  const [textPatientName, setTextPatientName] = useState("");
  const [textPatientEmail, setTextPatientEmail] = useState("");
  const [textPatientDob, setTextPatientDob] = useState("");
  const [textPatientLang, setTextPatientLang] = useState("en");
  const [isRecording, setIsRecording] = useState(false);
  const [dictationText, setDictationText] = useState("");
  const recognitionRef = useRef<any>(null);
  const [testCredentials, setTestCredentials] = useState<{ patientName?: string; lastName: string; yearOfBirth: number; dateOfBirth?: string; pin: string; accessLink: string } | null>(null);
  const [isTestCredentialsOpen, setIsTestCredentialsOpen] = useState(false);
  const [columnsScrolled, setColumnsScrolled] = useState<boolean[]>([
    false,
    false,
    false,
  ]);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  const [clinicianEdits, setClinicianEdits] = useState<Record<string, string>>({});
  const [postApprovalEditMode, setPostApprovalEditMode] = useState(false);
  const isPreApprovalEditable = selectedCarePlan?.status === "pending_review" || selectedCarePlan?.status === "interpreter_approved";
  const isPostApproval = selectedCarePlan?.status === "approved" || selectedCarePlan?.status === "sent";
  const isEditable = isPreApprovalEditable || (isPostApproval && postApprovalEditMode);
  const hasEdits = Object.keys(clinicianEdits).length > 0;

  const getEditValue = (field: string, original: string | null | undefined) => {
    if (field in clinicianEdits) return clinicianEdits[field];
    return original || "";
  };

  const handleEditField = (field: string, value: string) => {
    let originalValue = "";
    const medMatch = field.match(/^simplifiedMedications_(\d+)_(\w+)$/);
    const aptMatch = field.match(/^simplifiedAppointments_(\d+)_(\w+)$/);
    if (medMatch) {
      const meds = selectedCarePlan?.simplifiedMedications as SimplifiedMedication[] | undefined;
      originalValue = (meds?.[parseInt(medMatch[1])] as any)?.[medMatch[2]] || "";
    } else if (aptMatch) {
      const apts = selectedCarePlan?.simplifiedAppointments as SimplifiedAppointment[] | undefined;
      originalValue = (apts?.[parseInt(aptMatch[1])] as any)?.[aptMatch[2]] || "";
    } else {
      originalValue = (selectedCarePlan as any)?.[field] || "";
    }
    if (value === originalValue) {
      const next = { ...clinicianEdits };
      delete next[field];
      setClinicianEdits(next);
    } else {
      setClinicianEdits({ ...clinicianEdits, [field]: value });
    }
  };

  // Patient form state
  const [patientName, setPatientName] = useState("");
  const [patientEmail, setPatientEmail] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [patientDateOfBirth, setPatientDateOfBirth] = useState("");
  const [patientLanguage, setPatientLanguage] = useState("");
  
  // Form validation state (touched fields)
  const [formTouched, setFormTouched] = useState({
    name: false,
    email: false,
    dateOfBirth: false,
  });
  
  // Validation errors
  const formErrors = {
    name: formTouched.name && !patientName.trim() ? "Patient name is required" : "",
    email: formTouched.email && !patientEmail.trim() 
      ? "Email is required" 
      : formTouched.email && !isValidEmail(patientEmail) 
        ? "Please enter a valid email address" 
        : "",
    dateOfBirth: formTouched.dateOfBirth && !patientDateOfBirth
      ? "Date of birth is required"
      : formTouched.dateOfBirth && !isValidDateOfBirth(patientDateOfBirth)
        ? "Please enter a valid date of birth"
        : "",
  };
  
  const hasFormErrors = formErrors.name || formErrors.email || formErrors.dateOfBirth;

  // Sort and filter state
  const [sortBy, setSortBy] = useState<"name" | "status" | "date">("date");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [testPatientToken, setTestPatientToken] = useState("");

  const scrollAreaRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Check if all content is visible without scrolling
  useEffect(() => {
    setClinicianEdits({});
    setPostApprovalEditMode(false);
  }, [selectedCarePlan?.id]);

  useEffect(() => {
    if (selectedCarePlan?.status === "pending_review") {
      setColumnsScrolled([false, false, false]);
      // Check after a short delay for DOM to settle
      const timer = setTimeout(() => {
        const newScrolled = scrollAreaRefs.current.map((ref) => {
          if (!ref) return true;
          return ref.scrollHeight <= ref.clientHeight + 10;
        });
        setColumnsScrolled(newScrolled);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [selectedCarePlan?.id, selectedCarePlan?.status]);

  // For English, only 2 columns need to be scrolled (no translation column)
  const hasScrolledAll = selectedCarePlan?.translatedLanguage === "en" 
    ? columnsScrolled[0] && columnsScrolled[1]
    : columnsScrolled.every(Boolean);

  // Fetch care plans
  const { data: carePlansRaw = [], isLoading: isLoadingCarePlans } = useQuery<
    CarePlanWithPatient[]
  >({
    queryKey: ["/api/care-plans"],
    staleTime: 1000 * 30,
  });

  type SimplePatient = { id: string; name: string; lastName: string | null; email: string; phone: string | null; yearOfBirth: number; dateOfBirth: string | null; preferredLanguage: string };
  const { data: existingPatients = [] } = useQuery<SimplePatient[]>({
    queryKey: ["/api/patients"],
    staleTime: 1000 * 30,
  });

  const [showTestPatients, setShowTestPatients] = useState(false);
  const testPatientCount = carePlansRaw.filter(p => p.patient?.isTestPatient).length;

  // Sort and filter care plans
  const carePlans = carePlansRaw
    .filter((plan) => showTestPatients || !plan.patient?.isTestPatient)
    .filter((plan) => filterStatus === "all" || plan.status === filterStatus)
    .sort((a, b) => {
      if (sortBy === "name") {
        return (a.patient?.name || "").localeCompare(b.patient?.name || "");
      } else if (sortBy === "status") {
        const statusOrder = ["draft", "pending_review", "approved", "sent", "completed"];
        return statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status);
      } else {
        // Default: sort by date (newest first)
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      }
    });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const results: CarePlanWithPatient[] = [];
      for (let i = 0; i < files.length; i++) {
        setUploadProgress({ current: i + 1, total: files.length });
        const formData = new FormData();
        formData.append("file", files[i]);
        const response = await fetch("/api/care-plans/upload", {
          method: "POST",
          body: formData,
          credentials: "include",
        });
        if (!response.ok) {
          const errBody = await response.json().catch(() => ({}));
          throw new Error(errBody.error || `Upload failed for ${files[i].name}`);
        }
        results.push(await response.json());
      }
      return results;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/care-plans"] });
      // Select first uploaded care plan for immediate processing
      if (data.length > 0) {
        setSelectedCarePlan(data[0]);
        // Pre-fill language from matched patient's preferred language
        if (data[0].patient?.preferredLanguage) {
          setPatientLanguage(data[0].patient.preferredLanguage);
        }
      }
      setIsUploadDialogOpen(false);
      setUploadFiles([]);
      setUploadProgress(null);
      toast({
        title: data.length === 1 ? "Document uploaded" : `${data.length} documents uploaded`,
        description: data.length === 1 
          ? "AI is processing your discharge summary..." 
          : "Select each care plan from the sidebar to process.",
      });
    },
    onError: (error: Error) => {
      setUploadProgress(null);
      toast({
        title: "Upload failed",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const resetTextPatientFields = () => {
    setTextInputPatientId("");
    setShowTextPatientFields(false);
    setTextPatientName("");
    setTextPatientEmail("");
    setTextPatientDob("");
    setTextPatientLang("en");
  };

  const textInputMutation = useMutation({
    mutationFn: async ({ text, method }: { text: string; method: "paste" | "dictation" }) => {
      const body: Record<string, any> = { text, method };
      if (textInputPatientId) {
        body.existingPatientId = textInputPatientId;
      } else if (textPatientName && textPatientEmail && textPatientDob) {
        body.patientName = textPatientName;
        body.patientEmail = textPatientEmail;
        body.patientDateOfBirth = textPatientDob;
        body.preferredLanguage = textPatientLang;
      }
      const response = await apiRequest("POST", "/api/care-plans/from-text", body);
      return response.json();
    },
    onSuccess: (data: CarePlanWithPatient) => {
      queryClient.invalidateQueries({ queryKey: ["/api/care-plans"] });
      setSelectedCarePlan(data);
      if (data.patient?.preferredLanguage) {
        setPatientLanguage(data.patient.preferredLanguage);
      }
      setIsUploadDialogOpen(false);
      setPasteText("");
      setDictationText("");
      resetTextPatientFields();
      toast({
        title: "Care plan created",
        description: "AI has extracted the medical content from your text.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Processing failed",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const startDictation = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({ title: "Not supported", description: "Speech recognition is not available in this browser.", variant: "destructive" });
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    let finalTranscript = dictationText;
    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript + " ";
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      setDictationText(finalTranscript + interim);
    };
    recognition.onerror = () => { setIsRecording(false); };
    recognition.onend = () => { setIsRecording(false); };
    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  };

  const stopDictation = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsRecording(false);
  };

  // Process mutation (simplify + translate)
  const [selectedReadingLevel, setSelectedReadingLevel] = useState(5);

  const processMutation = useMutation({
    mutationFn: async ({ id, language, readingLevel }: { id: string; language: string; readingLevel?: number }) => {
      setProcessingIds(prev => new Set(prev).add(id));
      const res = await apiRequest("POST", `/api/care-plans/${id}/process`, {
        language,
        readingLevel: readingLevel || selectedReadingLevel,
      });
      return res.json() as Promise<CarePlanWithPatient>;
    },
    onSuccess: (data) => {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(data.id);
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ["/api/care-plans"] });
      setSelectedCarePlan(data);
      toast({
        title: "Processing complete",
        description: "Content has been simplified and translated",
      });
    },
    onError: (_error, variables) => {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(variables.id);
        return next;
      });
      toast({
        title: "Processing failed",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  // Re-translate mutation (after clinician edits)
  const retranslateMutation = useMutation({
    mutationFn: async ({ id, edits }: { id: string; edits?: Record<string, string> }) => {
      const res = await apiRequest("POST", `/api/care-plans/${id}/retranslate`, { edits });
      return res.json() as Promise<CarePlanWithPatient>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/care-plans"] });
      setSelectedCarePlan(data);
      setClinicianEdits({});
      toast({
        title: "Translation updated",
        description: "The translation has been refreshed with your edits",
      });
    },
    onError: () => {
      toast({
        title: "Re-translation failed",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  const saveDraftMutation = useMutation({
    mutationFn: async ({ id, edits }: { id: string; edits: Record<string, string> }) => {
      const res = await apiRequest("POST", `/api/care-plans/${id}/save-draft`, { edits });
      return res.json() as Promise<CarePlanWithPatient>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/care-plans"] });
      setSelectedCarePlan(data);
      setClinicianEdits({});
      toast({
        title: "Draft saved",
        description: "Your edits have been saved. Translation has not been updated yet.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to save draft",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async ({ id, skipInterpreterReview, overrideJustification, clinicianEdits }: { id: string; skipInterpreterReview?: boolean; overrideJustification?: string; clinicianEdits?: Record<string, string> }) => {
      const res = await apiRequest("POST", `/api/care-plans/${id}/approve`, {
        skipInterpreterReview,
        overrideJustification,
        clinicianEdits,
      });
      return res.json() as Promise<CarePlanWithPatient>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/care-plans"] });
      setSelectedCarePlan(data);
      setClinicianEdits({});
      if (data.status === "interpreter_review") {
        toast({
          title: "Sent for interpreter review",
          description: "A medical interpreter will review the translation before it can be sent to the patient.",
        });
      } else {
        toast({
          title: "Care plan approved",
          description: hasEdits ? "Your edits have been saved and the care plan is approved." : "Ready to send to patient",
        });
      }
    },
    onError: () => {
      toast({ title: "Approval failed", variant: "destructive" });
    },
  });

  // Send mutation
  const sendMutation = useMutation({
    mutationFn: async (data: { carePlanId: string; patient: any }) => {
      const res = await apiRequest(
        "POST",
        `/api/care-plans/${data.carePlanId}/send`,
        data.patient,
      );
      return res.json() as Promise<CarePlanWithPatient & { emailSent?: boolean; emailError?: string }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/care-plans"] });
      setSelectedCarePlan(data);
      setIsSendDialogOpen(false);
      resetPatientForm();
      if (data.emailSent === false) {
        toast({
          title: "Care plan saved, but email failed",
          description: data.emailError || "The care plan was created but the email could not be delivered. You can share the patient portal link manually.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Care plan sent!",
          description: "Patient will receive an email with their care instructions",
        });
      }
    },
    onError: () => {
      toast({ title: "Failed to send", variant: "destructive" });
    },
  });

  const sendTestMutation = useMutation({
    mutationFn: async (carePlanId: string) => {
      const res = await apiRequest("POST", `/api/care-plans/${carePlanId}/send-test`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/care-plans"] });
      setIsSendDialogOpen(false);
      if (data.testCredentials) {
        setTestCredentials(data.testCredentials);
        setIsTestCredentialsOpen(true);
      }
      toast({
        title: data.emailSent ? "Test email sent!" : "Test created (email failed)",
        description: data.emailSent
          ? "Check your inbox for the patient care plan email."
          : "The test care plan was created but the email could not be delivered. Use the link below.",
        variant: data.emailSent ? "default" : "destructive",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to send test", description: error.message, variant: "destructive" });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (carePlanId: string) => {
      const res = await apiRequest("DELETE", `/api/care-plans/${carePlanId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/care-plans"] });
      setSelectedCarePlan(null);
      setIsDeleteDialogOpen(false);
      toast({
        title: "Care plan deleted",
        description: "The care plan has been removed",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Cannot delete",
        description: error?.message || "This care plan cannot be deleted",
        variant: "destructive",
      });
    },
  });

  const cleanupTestMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/care-plans/test-patients/cleanup");
      return res.json();
    },
    onSuccess: (data: { deleted: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/care-plans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      toast({ title: "Test patients cleaned up", description: `Removed ${data.deleted} test patient(s) and their care plans.` });
    },
    onError: () => {
      toast({ title: "Cleanup failed", description: "Please try again", variant: "destructive" });
    },
  });

  const resetDemoMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/reset-demo");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/care-plans"] });
      setSelectedCarePlan(null);
      toast({
        title: "Demo data reset",
        description: "Please log in again with the demo credentials",
      });
      // Redirect to login since session was destroyed
      if (data?.requiresRelogin) {
        window.location.href = "/login";
      }
    },
    onError: (error: any) => {
      toast({
        title: "Reset failed",
        description: error?.message || "Failed to reset demo data",
        variant: "destructive",
      });
    },
  });

  const resetPatientForm = () => {
    setPatientName("");
    setPatientEmail("");
    setPatientPhone("");
    setPatientDateOfBirth("");
    setPatientLanguage("");
    setFormTouched({ name: false, email: false, dateOfBirth: false });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(
      (file) => file.type === "application/pdf" || file.type.startsWith("image/")
    );
    if (files.length > 0) {
      setUploadFiles((prev) => [...prev, ...files]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setUploadFiles((prev) => [...prev, ...files]);
    }
    // Reset input to allow re-selecting same files
    e.target.value = '';
  };

  const handleUpload = () => {
    if (uploadFiles.length > 0) {
      uploadMutation.mutate(uploadFiles);
    }
  };

  const handleSendToPatient = () => {
    if (!selectedCarePlan) return;
    
    setFormTouched({ name: true, email: true, dateOfBirth: true });
    
    if (!patientName.trim() || !isValidEmail(patientEmail) || !isValidDateOfBirth(patientDateOfBirth) || !patientLanguage) {
      if (!patientLanguage) {
        toast({ title: "Please select a language", variant: "destructive" });
      }
      return;
    }
    
    sendMutation.mutate({
      carePlanId: selectedCarePlan.id,
      patient: {
        name: patientName,
        email: patientEmail,
        phone: patientPhone || undefined,
        dateOfBirth: patientDateOfBirth,
        yearOfBirth: new Date(patientDateOfBirth).getFullYear(),
        preferredLanguage: patientLanguage,
      },
    });
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<
      string,
      {
        variant: "default" | "secondary" | "outline" | "destructive";
        label: string;
      }
    > = {
      draft: { variant: "outline", label: "Draft" },
      pending_review: { variant: "secondary", label: "Pending Review" },
      interpreter_review: { variant: "secondary", label: "Interpreter Review" },
      interpreter_approved: { variant: "default", label: "Interpreter Approved" },
      approved: { variant: "default", label: "Approved" },
      sent: { variant: "default", label: "Sent" },
      completed: { variant: "default", label: "Completed" },
    };
    const config = statusConfig[status] || statusConfig.draft;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const handleViewAsPatient = () => {
    if (!selectedCarePlan?.accessToken || !selectedCarePlan?.id) return;
    viewAsPatient(selectedCarePlan.accessToken);
  };

  const handleScroll =
    (columnIndex: number) => (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.target as HTMLDivElement;
      const isScrolledToBottom =
        target.scrollHeight - target.scrollTop <= target.clientHeight + 50;
      if (isScrolledToBottom && !columnsScrolled[columnIndex]) {
        setColumnsScrolled((prev) => {
          const newState = [...prev];
          newState[columnIndex] = true;
          return newState;
        });
      }
    };

  useEffect(() => {
    if (selectedCarePlan) {
      let lang = selectedCarePlan.patient?.preferredLanguage 
        || selectedCarePlan.translatedLanguage 
        || "";
      if (!lang && selectedCarePlan.extractedPatientName && existingPatients.length > 0) {
        const matchedPatient = existingPatients.find(
          (p) => p.name.toLowerCase() === selectedCarePlan.extractedPatientName?.toLowerCase()
        );
        if (matchedPatient?.preferredLanguage) {
          lang = matchedPatient.preferredLanguage;
        }
      }
      setPatientLanguage(lang);
    }
  }, [selectedCarePlan?.id, existingPatients]);

  useEffect(() => {
    if (isSendDialogOpen && selectedCarePlan?.patient) {
      const patient = selectedCarePlan.patient;
      setPatientName(patient.name);
      setPatientEmail(patient.email);
      setPatientPhone(patient.phone || "");
      setPatientDateOfBirth(patient.dateOfBirth || "");
      setPatientLanguage(
        patient.preferredLanguage ||
          selectedCarePlan.translatedLanguage ||
          "",
      );
    }
  }, [isSendDialogOpen, selectedCarePlan]);

  return (
    // Grid Layout forcing 320px Sidebar + 1fr Content
    <div className="grid h-full w-full grid-cols-[320px_1fr] overflow-hidden">
      {/* Sidebar - Care Plans List */}
      <div className="flex flex-col border-r bg-card z-10 overflow-hidden h-full">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Care Plans</h2>
            <Button
              size="sm"
              onClick={() => setIsUploadDialogOpen(true)}
              data-testid="button-new-care-plan"
            >
              <FileText className="h-4 w-4 mr-2" />
              New
            </Button>
          </div>
        </div>

        {/* Sort and Filter Controls */}
        <div className="px-3 py-2 border-b">
          <div className="flex gap-2">
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as "name" | "status" | "date")}>
              <SelectTrigger className="h-8 text-xs flex-1" data-testid="select-sort">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date">Newest</SelectItem>
                <SelectItem value="name">Name A-Z</SelectItem>
                <SelectItem value="status">Status</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-8 text-xs flex-1" data-testid="select-filter">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="pending_review">Pending Review</SelectItem>
                <SelectItem value="interpreter_review">Interpreter Review</SelectItem>
                <SelectItem value="interpreter_approved">Interpreter Approved</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="p-2 space-y-2">
            {isLoadingCarePlans ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : carePlans.length === 0 ? (
              <div className="text-center py-8 px-4">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">
                  No care plans yet
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Upload a discharge summary to get started
                </p>
              </div>
            ) : (
              carePlans.map((plan) => (
                <Card
                  key={plan.id}
                  className={`cursor-pointer transition-colors hover-elevate overflow-hidden ${
                    selectedCarePlan?.id === plan.id
                      ? "border-primary bg-primary/5"
                      : ""
                  }`}
                  onClick={() => { setSelectedCarePlan(plan); if (plan.readingLevel) setSelectedReadingLevel(plan.readingLevel); }}
                  data-testid={`card-care-plan-${plan.id}`}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">
                          {plan.patient?.name || plan.extractedPatientName || "New Patient"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {plan.diagnosis || "Processing..."}
                        </p>
                      </div>
                      <div className="flex-shrink-0">
                        {getStatusBadge(plan.status)}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>

        {/* Quick Patient Search */}
        <div className="p-3 border-t bg-muted/30">
          <p className="text-xs text-muted-foreground mb-2">
            Quick Search
          </p>
          <div className="relative">
            <Input
              placeholder="Search by patient name..."
              value={testPatientToken}
              onChange={(e) => setTestPatientToken(e.target.value)}
              className="flex-1 text-xs h-8"
              data-testid="input-patient-search"
            />
            {testPatientToken.trim() && (
              <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto">
                {carePlans
                  .filter((p) => 
                    p.patient?.name?.toLowerCase().includes(testPatientToken.toLowerCase()) ||
                    p.extractedPatientName?.toLowerCase().includes(testPatientToken.toLowerCase()) ||
                    p.diagnosis?.toLowerCase().includes(testPatientToken.toLowerCase())
                  )
                  .map((plan) => (
                    <button
                      key={plan.id}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors border-b last:border-b-0"
                      onClick={() => {
                        setSelectedCarePlan(plan);
                        setTestPatientToken("");
                      }}
                      data-testid={`search-result-${plan.id}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium truncate">
                          {plan.patient?.name || plan.extractedPatientName || "New Patient"}
                        </span>
                        {getStatusBadge(plan.status)}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {plan.diagnosis || "Processing..."}
                      </div>
                    </button>
                  ))}
                {carePlans.filter((p) => 
                  p.patient?.name?.toLowerCase().includes(testPatientToken.toLowerCase()) ||
                  p.extractedPatientName?.toLowerCase().includes(testPatientToken.toLowerCase()) ||
                  p.diagnosis?.toLowerCase().includes(testPatientToken.toLowerCase())
                ).length === 0 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">
                    No matching patients found
                  </div>
                )}
              </div>
            )}
          </div>
          <div className={`mt-2 text-xs text-muted-foreground ${testPatientToken.trim() ? 'invisible' : 'visible'}`}>
            {carePlans.length > 0 && (
              <>
                <p className="mb-1">Recent patients:</p>
                <div className="space-y-1">
                  {[...carePlans]
                    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
                    .slice(0, 3)
                    .map((plan) => (
                      <button
                        key={plan.id}
                        className="block w-full text-left text-primary truncate text-xs hover:underline"
                        onClick={() => setSelectedCarePlan(plan)}
                        data-testid={`recent-patient-${plan.id}`}
                      >
                        {plan.patient?.name || plan.extractedPatientName || "New Patient"} - {plan.diagnosis?.slice(0, 30) || "Processing..."}
                      </button>
                    ))}
                </div>
              </>
            )}
          </div>
        </div>

        {testPatientCount > 0 && (
          <div className="px-3 py-2 border-t bg-muted/30">
            <button
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
              onClick={() => setShowTestPatients(!showTestPatients)}
              data-testid="toggle-test-patients"
            >
              <span className={`h-3 w-3 rounded border flex items-center justify-center text-[8px] ${showTestPatients ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/40"}`}>
                {showTestPatients ? "✓" : ""}
              </span>
              Show test patients ({testPatientCount})
            </button>
            {showTestPatients && testPatientCount > 0 && (
              <button
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-destructive transition-colors mt-1 ml-4"
                onClick={() => cleanupTestMutation.mutate()}
                disabled={cleanupTestMutation.isPending}
                data-testid="button-cleanup-test-patients"
              >
                {cleanupTestMutation.isPending ? "Cleaning..." : `Clean up ${testPatientCount} test patient(s)`}
              </button>
            )}
          </div>
        )}

        {/* Demo Reset Button - only show in demo mode */}
        {isDemoMode && (
          <div className="p-3 border-t bg-muted/30">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-muted-foreground"
              onClick={() => resetDemoMutation.mutate()}
              disabled={resetDemoMutation.isPending}
              data-testid="button-reset-demo"
            >
              {resetDemoMutation.isPending ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <RotateCcw className="h-3 w-3 mr-1" />
              )}
              Reset Demo Data
            </Button>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex flex-col min-w-0 overflow-hidden relative bg-background h-full">
        {selectedCarePlan ? (
          <>
            {/* Header */}
            <div className="p-4 border-b bg-card flex items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-semibold flex items-center gap-2">
                  <Stethoscope className="h-5 w-5 text-primary" />
                  {selectedCarePlan.patient?.name || selectedCarePlan.extractedPatientName || "New Care Plan"}
                </h1>
                {selectedCarePlan.originalFileName ? (
                  <button
                    className="text-sm text-primary hover:underline flex items-center gap-1"
                    onClick={() => window.open(`/api/care-plans/${selectedCarePlan.id}/document`, "_blank")}
                    data-testid="link-view-document"
                  >
                    <FileText className="h-3 w-3" />
                    {selectedCarePlan.originalFileName}
                  </button>
                ) : (
                  <p className="text-sm text-muted-foreground">Discharge Summary</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {selectedCarePlan.status === "draft" && (
                  <>
                    <Select value={String(selectedReadingLevel)} onValueChange={(v) => setSelectedReadingLevel(parseInt(v))}>
                      <SelectTrigger className="w-[110px] h-9 text-xs" data-testid="select-reading-level">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="3">3rd grade</SelectItem>
                        <SelectItem value="5">5th grade</SelectItem>
                        <SelectItem value="8">8th grade</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      onClick={() => {
                        processMutation.mutate({
                          id: selectedCarePlan.id,
                          language: patientLanguage,
                          readingLevel: selectedReadingLevel,
                        });
                      }}
                      disabled={processingIds.has(selectedCarePlan.id) || !patientLanguage}
                      data-testid="button-process"
                    >
                      {processingIds.has(selectedCarePlan.id) ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4 mr-2" />
                      )}
                      {patientLanguage === "en" ? "Simplify" : patientLanguage ? "Process & Translate" : "Select Language First"}
                    </Button>
                  </>
                )}
                {hasEdits && (selectedCarePlan.status === "pending_review" || selectedCarePlan.status === "interpreter_approved") && (
                  <Button
                    variant="outline"
                    onClick={() => saveDraftMutation.mutate({ id: selectedCarePlan.id, edits: clinicianEdits })}
                    disabled={saveDraftMutation.isPending}
                    data-testid="button-save-draft"
                  >
                    {saveDraftMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Save Draft
                  </Button>
                )}
                {hasEdits && selectedCarePlan.translatedLanguage && selectedCarePlan.translatedLanguage !== "en" && (selectedCarePlan.status === "pending_review" || selectedCarePlan.status === "interpreter_approved") && (
                  <Button
                    variant="outline"
                    onClick={() => retranslateMutation.mutate({ id: selectedCarePlan.id, edits: clinicianEdits })}
                    disabled={retranslateMutation.isPending}
                    data-testid="button-retranslate"
                  >
                    {retranslateMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Languages className="h-4 w-4 mr-2" />
                    )}
                    Update Translation
                  </Button>
                )}
                {interpreterReviewMode === "optional" && selectedCarePlan.status === "pending_review" && selectedCarePlan.translatedLanguage && selectedCarePlan.translatedLanguage !== "en" && (
                  <Badge variant="outline" className="py-2 px-3 border-amber-300 bg-amber-50 text-amber-800">
                    <Languages className="h-4 w-4 mr-2" />
                    Interpreter review available
                  </Badge>
                )}
                {(selectedCarePlan.status === "pending_review" || selectedCarePlan.status === "interpreter_approved") && (
                  <Button
                    onClick={() => {
                      if (hasEdits && selectedCarePlan.translatedLanguage && selectedCarePlan.translatedLanguage !== "en") {
                        toast({ title: "Please update the translation first", description: "Click 'Update Translation' to apply your edits before approving.", variant: "destructive" });
                        return;
                      }
                      if (selectedCarePlan.status === "interpreter_approved") {
                        approveMutation.mutate({ id: selectedCarePlan.id, clinicianEdits: hasEdits ? clinicianEdits : undefined });
                      } else if (interpreterReviewMode === "optional" && selectedCarePlan.translatedLanguage && selectedCarePlan.translatedLanguage !== "en") {
                        setIsOverrideDialogOpen(true);
                      } else {
                        approveMutation.mutate({ id: selectedCarePlan.id, clinicianEdits: hasEdits ? clinicianEdits : undefined });
                      }
                    }}
                    disabled={approveMutation.isPending || (!hasScrolledAll && selectedCarePlan.status === "pending_review") || (hasEdits && selectedCarePlan.translatedLanguage !== "en")}
                    data-testid="button-approve"
                  >
                    {approveMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4 mr-2" />
                    )}
                    {selectedCarePlan.status === "interpreter_approved" 
                      ? (hasEdits ? "Update Translation First" : "Final Approve") 
                      : (hasEdits && selectedCarePlan.translatedLanguage !== "en" ? "Update Translation First" : hasEdits ? "Save Edits & Approve" : interpreterReviewMode === "optional" && selectedCarePlan.translatedLanguage && selectedCarePlan.translatedLanguage !== "en" ? "Review & Approve" : "Verify & Approve")}
                  </Button>
                )}
                {selectedCarePlan.status === "pending_review" && !hasScrolledAll && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Eye className="h-3 w-3" />
                    Scroll through all content to enable approval
                  </span>
                )}
                {selectedCarePlan.status === "interpreter_review" && (
                  <Badge variant="secondary" className="py-2 px-3">
                    <Clock className="h-4 w-4 mr-2" />
                    Awaiting Interpreter Review
                  </Badge>
                )}
                {isPostApproval && !postApprovalEditMode && (
                  <Button
                    variant="outline"
                    onClick={() => setPostApprovalEditMode(true)}
                    data-testid="button-post-approval-edit"
                  >
                    <PenLine className="h-4 w-4 mr-2" />
                    Make Edits
                  </Button>
                )}
                {isPostApproval && postApprovalEditMode && (
                  <>
                    {hasEdits && (
                      <Button
                        variant="outline"
                        onClick={() => saveDraftMutation.mutate({ id: selectedCarePlan.id, edits: clinicianEdits })}
                        disabled={saveDraftMutation.isPending}
                        data-testid="button-save-draft-post"
                      >
                        {saveDraftMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4 mr-2" />
                        )}
                        Save Draft
                      </Button>
                    )}
                    {hasEdits && selectedCarePlan.translatedLanguage && selectedCarePlan.translatedLanguage !== "en" && (
                      <Button
                        variant="outline"
                        onClick={() => retranslateMutation.mutate({ id: selectedCarePlan.id, edits: clinicianEdits })}
                        disabled={retranslateMutation.isPending}
                        data-testid="button-retranslate-post"
                      >
                        {retranslateMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Languages className="h-4 w-4 mr-2" />
                        )}
                        Update Translation
                      </Button>
                    )}
                    <Button
                      onClick={() => {
                        if (hasEdits && selectedCarePlan.translatedLanguage && selectedCarePlan.translatedLanguage !== "en") {
                          toast({ title: "Please update the translation first", description: "Click 'Update Translation' to apply your edits before re-approving.", variant: "destructive" });
                          return;
                        }
                        approveMutation.mutate({ id: selectedCarePlan.id, clinicianEdits: hasEdits ? clinicianEdits : undefined });
                      }}
                      disabled={approveMutation.isPending || !hasEdits || (hasEdits && selectedCarePlan.translatedLanguage !== "en" && !!selectedCarePlan.translatedLanguage)}
                      data-testid="button-reapprove"
                    >
                      {approveMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4 mr-2" />
                      )}
                      Save Edits & Re-Approve
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => { setPostApprovalEditMode(false); setClinicianEdits({}); }}
                      data-testid="button-cancel-post-edit"
                    >
                      Cancel
                    </Button>
                  </>
                )}
                {selectedCarePlan.status === "approved" && !postApprovalEditMode && (
                  <Button
                    onClick={() => {
                      if (selectedCarePlan.patient) {
                        setPatientName(selectedCarePlan.patient.name || "");
                        setPatientEmail(selectedCarePlan.patient.email || "");
                        setPatientPhone(selectedCarePlan.patient.phone || "");
                        setPatientDateOfBirth(selectedCarePlan.patient.dateOfBirth || "");
                        setPatientLanguage(selectedCarePlan.patient.preferredLanguage || selectedCarePlan.translatedLanguage || "");
                      } else if (selectedCarePlan.extractedPatientName) {
                        setPatientName(selectedCarePlan.extractedPatientName);
                        setPatientEmail("");
                        setPatientPhone("");
                        setPatientDateOfBirth("");
                        setPatientLanguage(selectedCarePlan.translatedLanguage || "");
                      } else {
                        setPatientName("");
                        setPatientEmail("");
                        setPatientPhone("");
                        setPatientDateOfBirth("");
                        setPatientLanguage(selectedCarePlan.translatedLanguage || "");
                      }
                      setIsSendDialogOpen(true);
                    }}
                    data-testid="button-send-dialog"
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Send to Patient
                  </Button>
                )}
                {selectedCarePlan.accessToken && (
                    <Button
                      variant="outline"
                      onClick={handleViewAsPatient}
                      data-testid="button-view-as-patient"
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      View as Patient
                    </Button>
                  )}
                {(selectedCarePlan.status === "draft" ||
                  selectedCarePlan.status === "pending_review" ||
                  selectedCarePlan.status === "approved" ||
                  selectedCarePlan.status === "interpreter_review" ||
                  selectedCarePlan.status === "interpreter_approved") && (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setIsDeleteDialogOpen(true)}
                    data-testid="button-delete"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
                {getStatusBadge(selectedCarePlan.status)}
              </div>
            </div>

            {selectedCarePlan.interpreterNotes && selectedCarePlan.status === "pending_review" && (
              <div className="mx-4 mt-4 p-3 border border-red-300 rounded-md bg-red-50 dark:bg-red-950/30">
                <p className="text-sm font-medium flex items-center gap-2 text-red-700 dark:text-red-400">
                  <AlertTriangle className="h-4 w-4" />
                  Changes Requested by Interpreter
                </p>
                <p className="text-sm text-red-600 dark:text-red-300 mt-1">{selectedCarePlan.interpreterNotes}</p>
              </div>
            )}
            {selectedCarePlan.interpreterNotes && selectedCarePlan.status === "interpreter_approved" && (
              <div className="mx-4 mt-4 p-3 border rounded-md bg-amber-50 dark:bg-amber-950/30">
                <p className="text-sm font-medium flex items-center gap-2">
                  <Languages className="h-4 w-4" />
                  Interpreter Notes
                </p>
                <p className="text-sm text-muted-foreground mt-1">{selectedCarePlan.interpreterNotes}</p>
              </div>
            )}

            {/* Content Tabs - Horizontally Scrollable Container */}
            {selectedCarePlan.status === "pending_review" ||
            selectedCarePlan.status === "approved" ||
            selectedCarePlan.status === "interpreter_review" ||
            selectedCarePlan.status === "interpreter_approved" ||
            selectedCarePlan.status === "sent" ||
            selectedCarePlan.status === "completed" ? (
              <div className="flex-1 overflow-x-auto overflow-y-hidden p-4 relative">
                {postApprovalEditMode && (
                  <div className="mb-3 p-2 bg-amber-50 border border-amber-200 rounded-md flex items-center gap-2 text-sm text-amber-800">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                    <span>Editing mode — changes will update the patient's care plan. Save & re-approve when done.</span>
                  </div>
                )}
                <div className={`flex ${postApprovalEditMode ? "h-[calc(100%-44px)]" : "h-full"} gap-4`}>
                  {/* Original Column */}
                  <Card className="flex-1 min-w-[350px] flex flex-col overflow-hidden">
                    <CardHeader className="pb-2 flex-shrink-0">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Original
                      </CardTitle>
                      <CardDescription>Source document content</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 overflow-hidden p-0">
                      <div
                        className="h-full px-4 pb-4 overflow-y-auto"
                        ref={(el) => {
                          scrollAreaRefs.current[0] = el;
                        }}
                        onScroll={handleScroll(0)}
                      >
                        <Accordion
                          type="multiple"
                          defaultValue={[
                            "diagnosis",
                            "medications",
                            "appointments",
                            "instructions",
                            "warnings",
                          ]}
                          className="space-y-2"
                        >
                          {selectedCarePlan.diagnosis && (
                            <AccordionItem
                              value="diagnosis"
                              className="border rounded-lg px-3 bg-muted/30"
                            >
                              <AccordionTrigger className="py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:no-underline">
                                <span className="flex items-center gap-1">
                                  <Stethoscope className="h-3 w-3" />
                                  Diagnosis
                                </span>
                              </AccordionTrigger>
                              <AccordionContent>
                                <p className="text-sm">
                                  {selectedCarePlan.diagnosis}
                                </p>
                              </AccordionContent>
                            </AccordionItem>
                          )}
                          {selectedCarePlan.medications &&
                            selectedCarePlan.medications.length > 0 && (
                              <AccordionItem
                                value="medications"
                                className="border rounded-lg px-3 bg-muted/30"
                              >
                                <AccordionTrigger className="py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:no-underline">
                                  <span className="flex items-center gap-1">
                                    <Pill className="h-3 w-3" />
                                    Medications (
                                    {selectedCarePlan.medications.length})
                                  </span>
                                </AccordionTrigger>
                                <AccordionContent>
                                  <div className="space-y-2">
                                    {selectedCarePlan.medications.map(
                                      (med, i) => (
                                        <div key={i} className="text-sm">
                                          <span className="font-medium">
                                            {med.name}
                                          </span>
                                          {med.dose && (
                                            <span className="text-muted-foreground">
                                              {" "}
                                              - {med.dose}
                                            </span>
                                          )}
                                          {med.frequency && (
                                            <span className="text-muted-foreground">
                                              , {med.frequency}
                                            </span>
                                          )}
                                        </div>
                                      ),
                                    )}
                                  </div>
                                </AccordionContent>
                              </AccordionItem>
                            )}
                          {selectedCarePlan.appointments &&
                            selectedCarePlan.appointments.length > 0 && (
                              <AccordionItem
                                value="appointments"
                                className="border rounded-lg px-3 bg-muted/30"
                              >
                                <AccordionTrigger className="py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:no-underline">
                                  <span className="flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    Appointments (
                                    {selectedCarePlan.appointments.length})
                                  </span>
                                </AccordionTrigger>
                                <AccordionContent>
                                  <div className="space-y-2">
                                    {selectedCarePlan.appointments.map(
                                      (apt, i) => (
                                        <div key={i} className="text-sm">
                                          <span className="font-medium">
                                            {apt.purpose || "Follow-up"}
                                          </span>
                                          {apt.date && (
                                            <span className="text-muted-foreground">
                                              {" "}
                                              - {apt.date}
                                            </span>
                                          )}
                                          {apt.time && (
                                            <span className="text-muted-foreground">
                                              {" "}
                                              at {apt.time}
                                            </span>
                                          )}
                                        </div>
                                      ),
                                    )}
                                  </div>
                                </AccordionContent>
                              </AccordionItem>
                            )}
                          {selectedCarePlan.instructions && (
                            <AccordionItem
                              value="instructions"
                              className="border rounded-lg px-3 bg-muted/30"
                            >
                              <AccordionTrigger className="py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:no-underline">
                                <span className="flex items-center gap-1">
                                  <ClipboardList className="h-3 w-3" />
                                  Instructions
                                </span>
                              </AccordionTrigger>
                              <AccordionContent>
                                <p className="text-sm whitespace-pre-wrap">
                                  {selectedCarePlan.instructions}
                                </p>
                              </AccordionContent>
                            </AccordionItem>
                          )}
                          {selectedCarePlan.warnings && (
                            <AccordionItem
                              value="warnings"
                              className="border rounded-lg px-3 bg-destructive/10"
                            >
                              <AccordionTrigger className="py-2 text-xs font-medium uppercase tracking-wide text-destructive hover:no-underline">
                                <span className="flex items-center gap-1">
                                  <AlertTriangle className="h-3 w-3" />
                                  Warning Signs
                                </span>
                              </AccordionTrigger>
                              <AccordionContent>
                                <p className="text-sm whitespace-pre-wrap">
                                  {selectedCarePlan.warnings}
                                </p>
                              </AccordionContent>
                            </AccordionItem>
                          )}
                        </Accordion>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Simplified Column */}
                  <Card className="flex-1 min-w-[350px] flex flex-col overflow-hidden">
                    <CardHeader className="pb-2 flex-shrink-0">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <ClipboardList className="h-4 w-4" />
                        Simplified English
                        {isEditable && (
                          <Badge variant="outline" className="text-xs ml-auto">
                            <PenLine className="h-3 w-3 mr-1" />
                            Editable
                          </Badge>
                        )}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-2 flex-wrap">
                        {isEditable ? "Review and edit if needed" : "5th grade reading level"}
                        {hasEdits && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 px-1 text-[10px]"
                            onClick={() => setClinicianEdits({})}
                            data-testid="button-reset-edits"
                          >
                            <RotateCcw className="h-3 w-3 mr-1" />
                            Reset edits
                          </Button>
                        )}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 overflow-hidden p-0">
                      <div
                        className="h-full px-4 pb-4 overflow-y-auto"
                        ref={(el) => {
                          scrollAreaRefs.current[1] = el;
                        }}
                        onScroll={handleScroll(1)}
                      >
                        <div className="space-y-4">
                          {selectedCarePlan.simplifiedDiagnosis && (
                            <div className="bg-primary/5 rounded-lg p-3 border border-primary/20">
                              <Label className="text-xs text-primary uppercase tracking-wide flex items-center gap-1">
                                <Stethoscope className="h-3 w-3" />
                                What's Wrong
                                {"simplifiedDiagnosis" in clinicianEdits && (
                                  <Badge variant="secondary" className="ml-auto text-[10px]">edited</Badge>
                                )}
                              </Label>
                              <Textarea
                                className={`mt-2 min-h-[60px] resize-none bg-background ${isEditable ? "border-primary/40" : ""}`}
                                value={getEditValue("simplifiedDiagnosis", selectedCarePlan.simplifiedDiagnosis)}
                                readOnly={!isEditable}
                                onChange={(e) => handleEditField("simplifiedDiagnosis", e.target.value)}
                                data-testid="textarea-simplified-diagnosis"
                              />
                            </div>
                          )}
                          <MedicationsList
                            medications={selectedCarePlan.simplifiedMedications}
                            title="Your Medicines"
                            columnId="simplified"
                            editable={isEditable}
                            editValues={clinicianEdits}
                            onEdit={handleEditField}
                          />
                          <AppointmentsList
                            appointments={
                              selectedCarePlan.simplifiedAppointments
                            }
                            title="Your Appointments"
                            columnId="simplified"
                            editable={isEditable}
                            editValues={clinicianEdits}
                            onEdit={handleEditField}
                          />
                          {selectedCarePlan.simplifiedInstructions && (
                            <div className="bg-muted/50 rounded-lg p-3 border">
                              <Label className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                                <ClipboardList className="h-3 w-3" />
                                What to Do
                                {"simplifiedInstructions" in clinicianEdits && (
                                  <Badge variant="secondary" className="ml-auto text-[10px]">edited</Badge>
                                )}
                              </Label>
                              <Textarea
                                className={`mt-2 min-h-[100px] resize-none bg-background ${isEditable ? "border-primary/40" : ""}`}
                                value={getEditValue("simplifiedInstructions", formatContent(selectedCarePlan.simplifiedInstructions))}
                                readOnly={!isEditable}
                                onChange={(e) => handleEditField("simplifiedInstructions", e.target.value)}
                                data-testid="textarea-simplified-instructions"
                              />
                            </div>
                          )}
                          {selectedCarePlan.simplifiedWarnings && (
                            <div className="bg-destructive/10 rounded-lg p-3 border border-destructive/30">
                              <Label className="text-xs text-destructive uppercase tracking-wide flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                Warning Signs
                                {"simplifiedWarnings" in clinicianEdits && (
                                  <Badge variant="secondary" className="ml-auto text-[10px]">edited</Badge>
                                )}
                              </Label>
                              <Textarea
                                className={`mt-2 min-h-[60px] resize-none bg-background ${isEditable ? "border-destructive/50 border-primary/40" : "border-destructive/50"}`}
                                value={getEditValue("simplifiedWarnings", formatContent(selectedCarePlan.simplifiedWarnings))}
                                readOnly={!isEditable}
                                onChange={(e) => handleEditField("simplifiedWarnings", e.target.value)}
                                data-testid="textarea-simplified-warnings"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Translated Column - hidden for English (simplification only) */}
                  {selectedCarePlan.translatedLanguage !== "en" && (
                  <Card className="flex-1 min-w-[350px] flex flex-col overflow-hidden border-primary/30">
                    <CardHeader className="pb-2 flex-shrink-0 bg-primary/5">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Languages className="h-4 w-4 text-primary" />
                        {getLanguageName(selectedCarePlan.translatedLanguage || "") || "Translated"}
                      </CardTitle>
                      <CardDescription>
                        Patient's language
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 overflow-hidden p-0">
                      <div
                        className="h-full px-4 pb-4 overflow-y-auto"
                        ref={(el) => {
                          scrollAreaRefs.current[2] = el;
                        }}
                        onScroll={handleScroll(2)}
                      >
                        <div className="space-y-4">
                          {selectedCarePlan.translatedDiagnosis && (
                            <div className="group relative bg-primary/5 rounded-lg p-3 border border-primary/20">
                              <Label className="text-xs text-primary uppercase tracking-wide flex items-center gap-1">
                                <Stethoscope className="h-3 w-3" />
                                Diagnosis
                              </Label>
                              <Textarea
                                className="mt-2 min-h-[60px] resize-none bg-background"
                                value={selectedCarePlan.translatedDiagnosis}
                                readOnly
                                data-testid="textarea-translated-diagnosis"
                              />
                              {selectedCarePlan.backTranslatedDiagnosis && (
                                <Collapsible className="mt-2">
                                  <CollapsibleTrigger 
                                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                                    data-testid="collapsible-backtranslation-diagnosis"
                                  >
                                    <ChevronsUpDown className="h-3 w-3" />
                                    <span className="font-medium">View back-translation</span>
                                  </CollapsibleTrigger>
                                  <CollapsibleContent className="mt-1 p-2 bg-muted rounded text-xs border">
                                    <span className="text-foreground">
                                      {typeof selectedCarePlan.backTranslatedDiagnosis === "string" ? selectedCarePlan.backTranslatedDiagnosis : JSON.stringify(selectedCarePlan.backTranslatedDiagnosis, null, 2)}
                                    </span>
                                  </CollapsibleContent>
                                </Collapsible>
                              )}
                            </div>
                          )}
                          <MedicationsList
                            medications={selectedCarePlan.translatedMedications}
                            title="Medications"
                            columnId="translated"
                          />
                          <AppointmentsList
                            appointments={
                              selectedCarePlan.translatedAppointments
                            }
                            title="Appointments"
                            columnId="translated"
                          />
                          {selectedCarePlan.translatedInstructions && (
                            <div className="bg-muted/50 rounded-lg p-3 border">
                              <Label className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                                <ClipboardList className="h-3 w-3" />
                                Instructions
                              </Label>
                              <Textarea
                                className="mt-2 min-h-[100px] resize-none bg-background"
                                value={formatContent(selectedCarePlan.translatedInstructions)}
                                readOnly
                                data-testid="textarea-translated-instructions"
                              />
                              {selectedCarePlan.backTranslatedInstructions && (
                                <Collapsible className="mt-2">
                                  <CollapsibleTrigger 
                                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                                    data-testid="collapsible-backtranslation-instructions"
                                  >
                                    <ChevronsUpDown className="h-3 w-3" />
                                    <span className="font-medium">View back-translation</span>
                                  </CollapsibleTrigger>
                                  <CollapsibleContent className="mt-1 p-2 bg-muted rounded text-xs border max-h-[100px] overflow-y-auto">
                                    <span className="text-foreground">
                                      {typeof selectedCarePlan.backTranslatedInstructions === "string" ? selectedCarePlan.backTranslatedInstructions : JSON.stringify(selectedCarePlan.backTranslatedInstructions, null, 2)}
                                    </span>
                                  </CollapsibleContent>
                                </Collapsible>
                              )}
                            </div>
                          )}
                          {selectedCarePlan.translatedWarnings && (
                            <div className="bg-destructive/10 rounded-lg p-3 border border-destructive/30">
                              <Label className="text-xs text-destructive uppercase tracking-wide flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                Warning Signs
                              </Label>
                              <Textarea
                                className="mt-2 min-h-[60px] resize-none bg-background border-destructive/50"
                                value={formatContent(selectedCarePlan.translatedWarnings)}
                                readOnly
                                data-testid="textarea-translated-warnings"
                              />
                              {selectedCarePlan.backTranslatedWarnings && (
                                <Collapsible className="mt-2">
                                  <CollapsibleTrigger 
                                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                                    data-testid="collapsible-backtranslation-warnings"
                                  >
                                    <ChevronsUpDown className="h-3 w-3" />
                                    <span className="font-medium">View back-translation</span>
                                  </CollapsibleTrigger>
                                  <CollapsibleContent className="mt-1 p-2 bg-muted rounded text-xs border">
                                    <span className="text-foreground">
                                      {typeof selectedCarePlan.backTranslatedWarnings === "string" ? selectedCarePlan.backTranslatedWarnings : JSON.stringify(selectedCarePlan.backTranslatedWarnings, null, 2)}
                                    </span>
                                  </CollapsibleContent>
                                </Collapsible>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  )}
                </div>

              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center p-8">
                <div className="text-center">
                  {selectedCarePlan.status === "draft" ? (
                    <>
                      <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                      <p className="text-lg font-medium">Document Uploaded</p>
                      <p className="text-muted-foreground">
                        Select a language and click Process to continue
                      </p>
                      <div className="mt-4 flex items-center justify-center gap-2">
                        <Label className={!patientLanguage ? "text-primary font-semibold" : ""}>Target Language:</Label>
                        <Select
                          value={patientLanguage}
                          onValueChange={setPatientLanguage}
                          disabled={selectedCarePlan ? processingIds.has(selectedCarePlan.id) : false}
                        >
                          <SelectTrigger
                            className={`w-[200px] ${!patientLanguage ? "border-primary ring-2 ring-primary/30 animate-pulse" : ""}`}
                            data-testid="select-language"
                            disabled={selectedCarePlan ? processingIds.has(selectedCarePlan.id) : false}
                          >
                            <SelectValue placeholder="Select language" />
                          </SelectTrigger>
                          <SelectContent>
                            {SUPPORTED_LANGUAGES.map((lang) => (
                              <SelectItem key={lang.code} value={lang.code}>
                                {lang.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {!patientLanguage && (
                        <p className="text-xs text-primary mt-2 font-medium">
                          Choose the patient's preferred language to begin processing
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <Check className="h-12 w-12 text-accent mx-auto mb-4" />
                      <p className="text-lg font-medium">Care Plan Sent</p>
                      <p className="text-muted-foreground">
                        Patient has been notified via email
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center max-w-md">
              <Stethoscope className="h-16 w-16 text-primary/30 mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">
                Welcome to Litera
              </h2>
              <p className="text-muted-foreground mb-6">
                Add discharge instructions to create simplified, translated care
                plans for your patients.
              </p>
              <Button
                size="lg"
                onClick={() => setIsUploadDialogOpen(true)}
                data-testid="button-upload-main"
              >
                <FileText className="h-5 w-5 mr-2" />
                New Care Plan
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* New Care Plan Dialog */}
      <Dialog open={isUploadDialogOpen} onOpenChange={(open) => {
        setIsUploadDialogOpen(open);
        if (!open) {
          setUploadFiles([]);
          setUploadProgress(null);
          setPasteText("");
          setDictationText("");
          if (capturedPhotoUrl) { URL.revokeObjectURL(capturedPhotoUrl); setCapturedPhotoUrl(null); }
          setCapturedPhoto(null);
          if (isRecording) stopDictation();
        }
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Care Plan</DialogTitle>
            <DialogDescription>
              Add discharge instructions using any method below.
            </DialogDescription>
          </DialogHeader>

          <Tabs value={inputTab} onValueChange={setInputTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="upload" className="text-xs" data-testid="tab-upload">
                <Upload className="h-3.5 w-3.5 mr-1" />
                Upload
              </TabsTrigger>
              <TabsTrigger value="photo" className="text-xs" data-testid="tab-photo">
                <Camera className="h-3.5 w-3.5 mr-1" />
                Photo
              </TabsTrigger>
              <TabsTrigger value="dictate" className="text-xs" data-testid="tab-dictate">
                <Mic className="h-3.5 w-3.5 mr-1" />
                Dictate
              </TabsTrigger>
              <TabsTrigger value="paste" className="text-xs" data-testid="tab-paste">
                <ClipboardPaste className="h-3.5 w-3.5 mr-1" />
                Paste
              </TabsTrigger>
            </TabsList>

            {/* Upload Tab */}
            <TabsContent value="upload" className="space-y-3 mt-3">
              {isTenantDemo && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Sample Documents (Demo)</Label>
                  <Select
                    onValueChange={async (filename) => {
                      try {
                        const response = await fetch(`/sample-docs/${filename}`);
                        const blob = await response.blob();
                        const file = new File([blob], filename, { type: 'application/pdf' });
                        setUploadFiles((prev) => [...prev, file]);
                      } catch (error) {
                        toast({ title: "Failed to load sample", description: "Could not load the sample document", variant: "destructive" });
                      }
                    }}
                  >
                    <SelectTrigger className="w-full" data-testid="select-sample-document">
                      <SelectValue placeholder="Select a sample discharge document..." />
                    </SelectTrigger>
                    <SelectContent>
                      {tenantSampleDocs.map((doc) => (
                        <SelectItem key={doc.file} value={doc.file}>{doc.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div
                className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25"}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                {uploadFiles.length > 0 ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-center gap-2">
                      <FileText className="h-6 w-6 text-primary" />
                      <span className="font-medium">{uploadFiles.length} file{uploadFiles.length > 1 ? 's' : ''} selected</span>
                    </div>
                    <div className="max-h-32 overflow-y-auto text-left space-y-1">
                      {uploadFiles.map((file, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm bg-muted/50 rounded px-2 py-1">
                          <span className="truncate flex-1">{file.name}</span>
                          <Button variant="ghost" size="icon" className="h-6 w-6 ml-2" onClick={() => setUploadFiles(prev => prev.filter((_, i) => i !== idx))} data-testid={`button-remove-file-${idx}`}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <Label htmlFor="file-upload-add" className="cursor-pointer">
                      <span className="text-xs text-primary hover:underline">+ Add more files</span>
                      <Input id="file-upload-add" type="file" className="hidden" accept=".pdf,image/*" multiple onChange={handleFileChange} />
                    </Label>
                  </div>
                ) : (
                  <>
                    <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
                    <p className="text-sm text-muted-foreground mb-2">Drag and drop files here, or</p>
                    <Label htmlFor="file-upload" className="cursor-pointer">
                      <span className="text-primary hover:underline">browse files</span>
                      <Input id="file-upload" type="file" className="hidden" accept=".pdf,image/*" multiple onChange={handleFileChange} data-testid="input-file-upload" />
                    </Label>
                    <p className="text-xs text-muted-foreground mt-2">Supports PDF, JPG, PNG</p>
                  </>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setIsUploadDialogOpen(false); setUploadFiles([]); setUploadProgress(null); }} disabled={uploadMutation.isPending}>Cancel</Button>
                <Button onClick={handleUpload} disabled={uploadFiles.length === 0 || uploadMutation.isPending} data-testid="button-upload-confirm">
                  {uploadMutation.isPending ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />{uploadProgress ? `${uploadProgress.current}/${uploadProgress.total}` : 'Processing...'}</>) : (<><Upload className="h-4 w-4 mr-2" />Upload{uploadFiles.length > 1 ? ` ${uploadFiles.length} files` : ''}</>)}
                </Button>
              </DialogFooter>
            </TabsContent>

            {/* Photo Tab */}
            <TabsContent value="photo" className="space-y-3 mt-3">
              {capturedPhoto && capturedPhotoUrl ? (
                <div className="space-y-3">
                  <div className="relative rounded-lg overflow-hidden border bg-muted/30">
                    <img src={capturedPhotoUrl} alt="Captured photo" className="w-full max-h-48 object-contain" />
                  </div>
                  <p className="text-sm text-muted-foreground text-center">{capturedPhoto.name}</p>
                  <DialogFooter className="flex gap-2">
                    <Button variant="outline" onClick={() => {
                      URL.revokeObjectURL(capturedPhotoUrl);
                      setCapturedPhotoUrl(null);
                      setCapturedPhoto(null);
                    }} data-testid="button-photo-retake">
                      <Camera className="h-4 w-4 mr-2" />Retake
                    </Button>
                    <Button onClick={() => {
                      setUploadFiles([capturedPhoto]);
                      setInputTab("upload");
                    }} data-testid="button-photo-process">
                      <Upload className="h-4 w-4 mr-2" />Process Photo
                    </Button>
                  </DialogFooter>
                </div>
              ) : (
                <div className="text-center space-y-3">
                  <Camera className="h-10 w-10 text-muted-foreground mx-auto" />
                  <p className="text-sm text-muted-foreground">Take a photo of discharge paperwork using your device camera, or select an existing photo.</p>
                  {'mediaDevices' in navigator && (
                    <Label htmlFor="photo-capture" className="cursor-pointer">
                      <Button variant="outline" asChild>
                        <span><Camera className="h-4 w-4 mr-2" />Open Camera</span>
                      </Button>
                      <Input id="photo-capture" type="file" className="hidden" accept="image/*" capture="environment" onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        if (files.length > 0) {
                          const file = files[0];
                          setCapturedPhoto(file);
                          setCapturedPhotoUrl(URL.createObjectURL(file));
                        }
                        e.target.value = '';
                      }} data-testid="input-photo-capture" />
                    </Label>
                  )}
                  <Label htmlFor="photo-gallery" className="cursor-pointer block">
                    <Button variant="ghost" size="sm" asChild>
                      <span className="text-primary">Choose from files</span>
                    </Button>
                    <Input id="photo-gallery" type="file" className="hidden" accept="image/*" onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      if (files.length > 0) {
                        const file = files[0];
                        setCapturedPhoto(file);
                        setCapturedPhotoUrl(URL.createObjectURL(file));
                      }
                      e.target.value = '';
                    }} data-testid="input-photo-gallery" />
                  </Label>
                </div>
              )}
            </TabsContent>

            {/* Dictation Tab */}
            <TabsContent value="dictate" className="space-y-3 mt-3">
              <div className="text-center space-y-3">
                {isRecording ? (
                  <div className="flex items-center justify-center gap-2">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                    </span>
                    <span className="text-sm font-medium text-red-600">Recording...</span>
                  </div>
                ) : (
                  <Mic className="h-10 w-10 text-muted-foreground mx-auto" />
                )}
                <p className="text-sm text-muted-foreground">
                  {isRecording ? "Speak clearly. Click stop when finished." : "Dictate the patient's discharge instructions."}
                </p>
                <Button
                  variant={isRecording ? "destructive" : "outline"}
                  onClick={isRecording ? stopDictation : startDictation}
                  data-testid="button-dictation-toggle"
                >
                  {isRecording ? (<><MicOff className="h-4 w-4 mr-2" />Stop Recording</>) : (<><Mic className="h-4 w-4 mr-2" />Start Dictation</>)}
                </Button>
              </div>
              <Textarea
                placeholder="Dictated text will appear here. You can also edit it manually..."
                value={dictationText}
                onChange={(e) => setDictationText(e.target.value)}
                rows={6}
                className="resize-none"
                data-testid="textarea-dictation"
              />
              <Collapsible open={showTextPatientFields} onOpenChange={setShowTextPatientFields}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" data-testid="button-dictate-patient-toggle">
                    {showTextPatientFields ? <ChevronDown className="h-3.5 w-3.5 mr-2" /> : <ChevronRight className="h-3.5 w-3.5 mr-2" />}
                    <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                    {textInputPatientId || textPatientName ? "Patient linked" : "Link to patient (optional)"}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2 pt-2">
                  {existingPatients.length > 0 && (
                    <Select value={textInputPatientId} onValueChange={(id) => {
                      setTextInputPatientId(id);
                      const p = existingPatients.find(pt => pt.id === id);
                      if (p) { setTextPatientName(p.name); setTextPatientEmail(p.email); setTextPatientDob(p.dateOfBirth || ""); setTextPatientLang(p.preferredLanguage || "en"); }
                    }}>
                      <SelectTrigger data-testid="select-dictate-patient"><SelectValue placeholder="Select existing patient..." /></SelectTrigger>
                      <SelectContent>{existingPatients.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name} ({p.email})</SelectItem>))}</SelectContent>
                    </Select>
                  )}
                  {!textInputPatientId && (
                    <div className="grid grid-cols-2 gap-2">
                      <Input placeholder="Patient name" value={textPatientName} onChange={(e) => setTextPatientName(e.target.value)} data-testid="input-dictate-patient-name" />
                      <Input placeholder="Email" type="email" value={textPatientEmail} onChange={(e) => setTextPatientEmail(e.target.value)} data-testid="input-dictate-patient-email" />
                      <Input type="date" max={new Date().toISOString().split("T")[0]} min="1900-01-01" value={textPatientDob} onChange={(e) => setTextPatientDob(e.target.value)} data-testid="input-dictate-patient-dob" />
                      <Select value={textPatientLang} onValueChange={setTextPatientLang}>
                        <SelectTrigger data-testid="select-dictate-patient-lang"><SelectValue /></SelectTrigger>
                        <SelectContent>{SUPPORTED_LANGUAGES.map((lang) => (<SelectItem key={lang.code} value={lang.code}>{lang.name}</SelectItem>))}</SelectContent>
                      </Select>
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setIsUploadDialogOpen(false); setDictationText(""); resetTextPatientFields(); if (isRecording) stopDictation(); }}>Cancel</Button>
                <Button
                  onClick={() => textInputMutation.mutate({ text: dictationText, method: "dictation" })}
                  disabled={dictationText.trim().length < 20 || textInputMutation.isPending}
                  data-testid="button-dictation-submit"
                >
                  {textInputMutation.isPending ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing...</>) : (<><Check className="h-4 w-4 mr-2" />Create Care Plan</>)}
                </Button>
              </DialogFooter>
            </TabsContent>

            {/* Paste Text Tab */}
            <TabsContent value="paste" className="space-y-3 mt-3">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Paste or type the patient's discharge instructions below.</p>
                <Textarea
                  placeholder="Paste discharge instructions, clinical notes, or care plan text here..."
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  rows={8}
                  className="resize-none"
                  data-testid="textarea-paste"
                />
                <p className="text-xs text-muted-foreground">
                  {pasteText.length < 20 ? `${20 - pasteText.length} more characters needed` : `${pasteText.length} characters`}
                </p>
              </div>
              <Collapsible open={showTextPatientFields} onOpenChange={setShowTextPatientFields}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" data-testid="button-paste-patient-toggle">
                    {showTextPatientFields ? <ChevronDown className="h-3.5 w-3.5 mr-2" /> : <ChevronRight className="h-3.5 w-3.5 mr-2" />}
                    <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                    {textInputPatientId || textPatientName ? "Patient linked" : "Link to patient (optional)"}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2 pt-2">
                  {existingPatients.length > 0 && (
                    <Select value={textInputPatientId} onValueChange={(id) => {
                      setTextInputPatientId(id);
                      const p = existingPatients.find(pt => pt.id === id);
                      if (p) { setTextPatientName(p.name); setTextPatientEmail(p.email); setTextPatientDob(p.dateOfBirth || ""); setTextPatientLang(p.preferredLanguage || "en"); }
                    }}>
                      <SelectTrigger data-testid="select-paste-patient"><SelectValue placeholder="Select existing patient..." /></SelectTrigger>
                      <SelectContent>{existingPatients.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name} ({p.email})</SelectItem>))}</SelectContent>
                    </Select>
                  )}
                  {!textInputPatientId && (
                    <div className="grid grid-cols-2 gap-2">
                      <Input placeholder="Patient name" value={textPatientName} onChange={(e) => setTextPatientName(e.target.value)} data-testid="input-paste-patient-name" />
                      <Input placeholder="Email" type="email" value={textPatientEmail} onChange={(e) => setTextPatientEmail(e.target.value)} data-testid="input-paste-patient-email" />
                      <Input type="date" max={new Date().toISOString().split("T")[0]} min="1900-01-01" value={textPatientDob} onChange={(e) => setTextPatientDob(e.target.value)} data-testid="input-paste-patient-dob" />
                      <Select value={textPatientLang} onValueChange={setTextPatientLang}>
                        <SelectTrigger data-testid="select-paste-patient-lang"><SelectValue /></SelectTrigger>
                        <SelectContent>{SUPPORTED_LANGUAGES.map((lang) => (<SelectItem key={lang.code} value={lang.code}>{lang.name}</SelectItem>))}</SelectContent>
                      </Select>
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setIsUploadDialogOpen(false); setPasteText(""); resetTextPatientFields(); }}>Cancel</Button>
                <Button
                  onClick={() => textInputMutation.mutate({ text: pasteText, method: "paste" })}
                  disabled={pasteText.trim().length < 20 || textInputMutation.isPending}
                  data-testid="button-paste-submit"
                >
                  {textInputMutation.isPending ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing...</>) : (<><Check className="h-4 w-4 mr-2" />Create Care Plan</>)}
                </Button>
              </DialogFooter>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Send to Patient Dialog */}
      <Dialog open={isSendDialogOpen} onOpenChange={setIsSendDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send Care Plan to Patient</DialogTitle>
            <DialogDescription>
              {selectedCarePlan?.patient
                ? "Confirm patient information and send their care instructions via email."
                : "Select an existing patient or enter new patient information."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {!selectedCarePlan?.patient && existingPatients.length > 0 && (
              <div className="space-y-2">
                <Label>Select Existing Patient</Label>
                <Select
                  value=""
                  onValueChange={(patientId) => {
                    const p = existingPatients.find(pt => pt.id === patientId);
                    if (p) {
                      setPatientName(p.name);
                      setPatientEmail(p.email);
                      setPatientPhone(p.phone || "");
                      setPatientDateOfBirth(p.dateOfBirth || "");
                      setPatientLanguage(p.preferredLanguage || "en");
                      setFormTouched({ name: true, email: true, dateOfBirth: true });
                    }
                  }}
                >
                  <SelectTrigger data-testid="select-existing-patient">
                    <SelectValue placeholder="Choose a patient or enter details below..." />
                  </SelectTrigger>
                  <SelectContent>
                    {existingPatients.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} ({p.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="patient-name" className={formErrors.name ? "text-destructive" : ""}>
                Patient Name {formErrors.name && <span className="text-xs font-normal">*</span>}
              </Label>
              <Input
                id="patient-name"
                placeholder="e.g., Rosa Hernandez"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                onBlur={() => setFormTouched(prev => ({ ...prev, name: true }))}
                className={formErrors.name ? "border-destructive focus-visible:ring-destructive" : ""}
                data-testid="input-patient-name"
              />
              {formErrors.name && (
                <p className="text-xs text-destructive">{formErrors.name}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="patient-email" className={formErrors.email ? "text-destructive" : ""}>
                Email Address {formErrors.email && <span className="text-xs font-normal">*</span>}
              </Label>
              <Input
                id="patient-email"
                type="email"
                placeholder="e.g., rosa@example.com"
                value={patientEmail}
                onChange={(e) => setPatientEmail(e.target.value)}
                onBlur={() => setFormTouched(prev => ({ ...prev, email: true }))}
                className={formErrors.email ? "border-destructive focus-visible:ring-destructive" : ""}
                data-testid="input-patient-email"
              />
              {formErrors.email && (
                <p className="text-xs text-destructive">{formErrors.email}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="patient-phone">Phone Number (Optional)</Label>
              <Input
                id="patient-phone"
                type="tel"
                placeholder="e.g., +1 555-123-4567"
                value={patientPhone}
                onChange={(e) => setPatientPhone(e.target.value)}
                data-testid="input-patient-phone"
              />
              
            </div>
            <div className="space-y-2">
              <Label htmlFor="patient-dob" className={formErrors.dateOfBirth ? "text-destructive" : ""}>
                Date of Birth {formErrors.dateOfBirth && <span className="text-xs font-normal">*</span>}
              </Label>
              <Input
                id="patient-dob"
                type="date"
                max={new Date().toISOString().split("T")[0]}
                min="1900-01-01"
                value={patientDateOfBirth}
                onChange={(e) => setPatientDateOfBirth(e.target.value)}
                onBlur={() => setFormTouched(prev => ({ ...prev, dateOfBirth: true }))}
                className={formErrors.dateOfBirth ? "border-destructive focus-visible:ring-destructive" : ""}
                data-testid="input-patient-dob"
              />
              {formErrors.dateOfBirth && (
                <p className="text-xs text-destructive">{formErrors.dateOfBirth}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="patient-language">Preferred Language</Label>
              <Select
                value={patientLanguage}
                onValueChange={setPatientLanguage}
              >
                <SelectTrigger data-testid="select-patient-language">
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code}>
                      {lang.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="border-t pt-3 mt-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground hover:text-foreground"
              onClick={() => {
                if (selectedCarePlan) sendTestMutation.mutate(selectedCarePlan.id);
              }}
              disabled={sendTestMutation.isPending || sendMutation.isPending}
              data-testid="button-send-test"
            >
              {sendTestMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending test...</>
              ) : (
                <><Mail className="h-4 w-4 mr-2" />Send Test to Me (preview the patient experience)</>
              )}
            </Button>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsSendDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSendToPatient}
              disabled={
                !patientName ||
                !patientEmail ||
                !patientDateOfBirth ||
                sendMutation.isPending
              }
              data-testid="button-send-confirm"
            >
              {sendMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Send Care Plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Test Credentials Dialog */}
      <Dialog open={isTestCredentialsOpen} onOpenChange={setIsTestCredentialsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Test Care Plan Sent</DialogTitle>
            <DialogDescription>
              A care plan email has been sent to your email. You can also access it directly using the link below.
            </DialogDescription>
          </DialogHeader>
          {testCredentials && (
            <div className="space-y-4">
              <div className="bg-muted rounded-lg p-4 space-y-3">
                <h4 className="text-sm font-semibold">Patient Login Credentials</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {testCredentials.patientName && (
                    <>
                      <span className="text-muted-foreground">Patient:</span>
                      <span className="font-medium">{testCredentials.patientName}</span>
                    </>
                  )}
                  <span className="text-muted-foreground">Last Name:</span>
                  <span className="font-mono font-medium">{testCredentials.lastName}</span>
                  {testCredentials.dateOfBirth ? (
                    <>
                      <span className="text-muted-foreground">Date of Birth:</span>
                      <span className="font-mono font-medium">{testCredentials.dateOfBirth}</span>
                    </>
                  ) : (
                    <>
                      <span className="text-muted-foreground">Year of Birth:</span>
                      <span className="font-mono font-medium">{testCredentials.yearOfBirth}</span>
                    </>
                  )}
                  <span className="text-muted-foreground">PIN:</span>
                  <span className="font-mono font-medium">{testCredentials.pin}</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Patient Portal Link</Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={testCredentials.accessLink}
                    className="text-xs font-mono"
                    data-testid="input-test-link"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      navigator.clipboard.writeText(testCredentials.accessLink);
                      toast({ title: "Link copied!" });
                    }}
                    data-testid="button-copy-test-link"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <Button
                className="w-full"
                onClick={() => window.open(testCredentials.accessLink, "_blank")}
                data-testid="button-open-test-link"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open Patient Portal
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isOverrideDialogOpen} onOpenChange={(open) => { setIsOverrideDialogOpen(open); if (!open) setOverrideJustification(""); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Interpreter Review Available</DialogTitle>
            <DialogDescription>
              This care plan has a non-English translation. Would you like to send it for interpreter review, or approve it directly?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <Button
              className="w-full"
              onClick={() => {
                if (selectedCarePlan) {
                  approveMutation.mutate({ id: selectedCarePlan.id, clinicianEdits: hasEdits ? clinicianEdits : undefined });
                  setIsOverrideDialogOpen(false);
                }
              }}
              disabled={approveMutation.isPending}
              data-testid="button-send-to-interpreter"
            >
              <Languages className="h-4 w-4 mr-2" />
              Send for Interpreter Review
            </Button>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">or skip review</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="override-justification" className="text-sm">Justification for skipping interpreter review</Label>
              <Textarea
                id="override-justification"
                placeholder="e.g., Verified translation with bilingual staff member..."
                value={overrideJustification}
                onChange={(e) => setOverrideJustification(e.target.value)}
                data-testid="textarea-override-justification"
              />
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  if (selectedCarePlan && overrideJustification.trim()) {
                    approveMutation.mutate({
                      id: selectedCarePlan.id,
                      skipInterpreterReview: true,
                      overrideJustification: overrideJustification.trim(),
                      clinicianEdits: hasEdits ? clinicianEdits : undefined,
                    });
                    setIsOverrideDialogOpen(false);
                    setOverrideJustification("");
                  }
                }}
                disabled={approveMutation.isPending || !overrideJustification.trim()}
                data-testid="button-skip-interpreter-review"
              >
                Approve Without Interpreter Review
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Care Plan</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this care plan for{" "}
              <strong>{selectedCarePlan?.patient?.name || "this patient"}</strong>?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
              data-testid="button-delete-cancel"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => selectedCarePlan && deleteMutation.mutate(selectedCarePlan.id)}
              disabled={deleteMutation.isPending}
              data-testid="button-delete-confirm"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
