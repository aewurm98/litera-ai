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
} from "lucide-react";
import type {
  CarePlan,
  Patient,
  SimplifiedMedication,
  SimplifiedAppointment,
} from "@shared/schema";
import { SUPPORTED_LANGUAGES } from "@shared/schema";

// Helper function to format content that may be array or string (for display in textareas)
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
      const cleaned = content.replace(/^\{"|"\}$/g, '').split('","');
      return addNumbering(cleaned);
    } catch {
      return content;
    }
  }
  return content;
}

// Form field validation helpers
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidYearOfBirth(year: string): boolean {
  const yearNum = parseInt(year);
  return !isNaN(yearNum) && yearNum >= 1900 && yearNum <= new Date().getFullYear();
}

// Helper component to render medications in a structured format
function MedicationsList({
  medications,
  title,
  columnId,
}: {
  medications?: SimplifiedMedication[] | null;
  title: string;
  columnId: string;
}) {
  if (!medications || medications.length === 0) return null;

  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
        <Pill className="h-3 w-3" />
        {title}
      </Label>
      <div className="space-y-2">
        {medications.map((med, index) => (
          <div
            key={index}
            className="bg-muted/50 rounded-lg p-3 border border-border/50"
            data-testid={`medication-${columnId}-${index}`}
          >
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <span className="font-medium text-sm">{med.name}</span>
              {med.dose && (
                <Badge variant="outline" className="text-xs flex-shrink-0">
                  {med.dose}
                </Badge>
              )}
            </div>
            {med.frequency && (
              <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3 flex-shrink-0" />
                {med.frequency}
              </div>
            )}
            {med.instructions && (
              <p className="text-xs text-muted-foreground mt-1 italic">
                {med.instructions}
              </p>
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
}: {
  appointments?: SimplifiedAppointment[] | null;
  title: string;
  columnId: string;
}) {
  if (!appointments || appointments.length === 0) return null;

  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
        <Calendar className="h-3 w-3" />
        {title}
      </Label>
      <div className="space-y-2">
        {appointments.map((apt, index) => (
          <div
            key={index}
            className="bg-muted/50 rounded-lg p-3 border border-border/50"
            data-testid={`appointment-${columnId}-${index}`}
          >
            {apt.purpose && (
              <p className="font-medium text-sm">{apt.purpose}</p>
            )}
            <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
              {apt.date && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3 flex-shrink-0" />
                  {apt.date}
                </span>
              )}
              {apt.time && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3 flex-shrink-0" />
                  {apt.time}
                </span>
              )}
              {apt.provider && (
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3 flex-shrink-0" />
                  {apt.provider}
                </span>
              )}
            </div>
            {apt.location && (
              <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3 flex-shrink-0" />
                {apt.location}
              </div>
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
  const [columnsScrolled, setColumnsScrolled] = useState<boolean[]>([
    false,
    false,
    false,
  ]);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  // Patient form state
  const [patientName, setPatientName] = useState("");
  const [patientEmail, setPatientEmail] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [patientYearOfBirth, setPatientYearOfBirth] = useState("");
  const [patientLanguage, setPatientLanguage] = useState("es");
  
  // Form validation state (touched fields)
  const [formTouched, setFormTouched] = useState({
    name: false,
    email: false,
    yearOfBirth: false,
  });
  
  // Validation errors
  const formErrors = {
    name: formTouched.name && !patientName.trim() ? "Patient name is required" : "",
    email: formTouched.email && !patientEmail.trim() 
      ? "Email is required" 
      : formTouched.email && !isValidEmail(patientEmail) 
        ? "Please enter a valid email address" 
        : "",
    yearOfBirth: formTouched.yearOfBirth && !patientYearOfBirth.trim()
      ? "Year of birth is required"
      : formTouched.yearOfBirth && !isValidYearOfBirth(patientYearOfBirth)
        ? "Please enter a valid year (1900-present)"
        : "",
  };
  
  const hasFormErrors = formErrors.name || formErrors.email || formErrors.yearOfBirth;

  // Sort and filter state
  const [sortBy, setSortBy] = useState<"name" | "status" | "date">("date");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [testPatientToken, setTestPatientToken] = useState("");

  const scrollAreaRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Check if all content is visible without scrolling
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
  });

  type SimplePatient = { id: string; name: string; lastName: string | null; email: string; phone: string | null; yearOfBirth: number; preferredLanguage: string };
  const { data: existingPatients = [] } = useQuery<SimplePatient[]>({
    queryKey: ["/api/patients"],
  });

  // Sort and filter care plans
  const carePlans = carePlansRaw
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

  // Process mutation (simplify + translate)
  const processMutation = useMutation({
    mutationFn: async ({ id, language }: { id: string; language: string }) => {
      setProcessingIds(prev => new Set(prev).add(id));
      const res = await apiRequest("POST", `/api/care-plans/${id}/process`, {
        language,
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

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async ({ id, skipInterpreterReview, overrideJustification }: { id: string; skipInterpreterReview?: boolean; overrideJustification?: string }) => {
      const res = await apiRequest("POST", `/api/care-plans/${id}/approve`, {
        skipInterpreterReview,
        overrideJustification,
      });
      return res.json() as Promise<CarePlanWithPatient>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/care-plans"] });
      setSelectedCarePlan(data);
      if (data.status === "interpreter_review") {
        toast({
          title: "Sent for interpreter review",
          description: "A medical interpreter will review the translation before it can be sent to the patient.",
        });
      } else {
        toast({
          title: "Care plan approved",
          description: "Ready to send to patient",
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
      return res.json() as Promise<CarePlanWithPatient & { emailSent?: boolean }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/care-plans"] });
      setSelectedCarePlan(data);
      setIsSendDialogOpen(false);
      resetPatientForm();
      if (data.emailSent === false) {
        toast({
          title: "Care plan saved, but email failed",
          description: "The care plan was created but the email could not be delivered. You can share the patient portal link manually.",
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
    setPatientYearOfBirth("");
    setPatientLanguage("es");
    setFormTouched({ name: false, email: false, yearOfBirth: false });
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
    
    // Mark all fields as touched to show any validation errors
    setFormTouched({ name: true, email: true, yearOfBirth: true });
    
    // Validate before submitting
    if (!patientName.trim() || !isValidEmail(patientEmail) || !isValidYearOfBirth(patientYearOfBirth)) {
      return; // Don't submit if validation fails
    }
    
    sendMutation.mutate({
      carePlanId: selectedCarePlan.id,
      patient: {
        name: patientName,
        email: patientEmail,
        phone: patientPhone || undefined,
        yearOfBirth: parseInt(patientYearOfBirth),
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
    if (!selectedCarePlan?.accessToken) return;
    window.open(`/p/${selectedCarePlan.accessToken}?demo=1`, "_blank");
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

  // Pre-populate patient form when opening send dialog for care plan with existing patient
  useEffect(() => {
    if (isSendDialogOpen && selectedCarePlan?.patient) {
      const patient = selectedCarePlan.patient;
      setPatientName(patient.name);
      setPatientEmail(patient.email);
      setPatientPhone(patient.phone || "");
      setPatientYearOfBirth(patient.yearOfBirth?.toString() || "");
      setPatientLanguage(
        patient.preferredLanguage ||
          selectedCarePlan.translatedLanguage ||
          "es",
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
              <Upload className="h-4 w-4 mr-2" />
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
                  onClick={() => setSelectedCarePlan(plan)}
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
                      <div className="flex-shrink-0 max-w-[130px] overflow-hidden">
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
                  <Button
                    onClick={() =>
                      processMutation.mutate({
                        id: selectedCarePlan.id,
                        language: patientLanguage,
                      })
                    }
                    disabled={processingIds.has(selectedCarePlan.id)}
                    data-testid="button-process"
                  >
                    {processingIds.has(selectedCarePlan.id) ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    {patientLanguage === "en" ? "Simplify" : "Process & Translate"}
                  </Button>
                )}
                {(selectedCarePlan.status === "pending_review" || selectedCarePlan.status === "interpreter_approved") && (
                  <Button
                    onClick={() => {
                      if (selectedCarePlan.status === "interpreter_approved") {
                        approveMutation.mutate({ id: selectedCarePlan.id });
                      } else if (interpreterReviewMode === "optional" && selectedCarePlan.translatedLanguage && selectedCarePlan.translatedLanguage !== "en") {
                        setIsOverrideDialogOpen(true);
                      } else {
                        approveMutation.mutate({ id: selectedCarePlan.id });
                      }
                    }}
                    disabled={approveMutation.isPending || (!hasScrolledAll && selectedCarePlan.status === "pending_review")}
                    data-testid="button-approve"
                  >
                    {approveMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4 mr-2" />
                    )}
                    {selectedCarePlan.status === "interpreter_approved" ? "Final Approve" : "Verify & Approve"}
                  </Button>
                )}
                {selectedCarePlan.status === "interpreter_review" && (
                  <Badge variant="secondary" className="py-2 px-3">
                    <Clock className="h-4 w-4 mr-2" />
                    Awaiting Interpreter Review
                  </Badge>
                )}
                {selectedCarePlan.status === "approved" && (
                  <Button
                    onClick={() => {
                      // Pre-fill form with patient data or extracted data
                      if (selectedCarePlan.patient) {
                        setPatientName(selectedCarePlan.patient.name || "");
                        setPatientEmail(selectedCarePlan.patient.email || "");
                        setPatientPhone(selectedCarePlan.patient.phone || "");
                        setPatientYearOfBirth(selectedCarePlan.patient.yearOfBirth?.toString() || "");
                        setPatientLanguage(selectedCarePlan.patient.preferredLanguage || selectedCarePlan.translatedLanguage || "es");
                      } else if (selectedCarePlan.extractedPatientName) {
                        setPatientName(selectedCarePlan.extractedPatientName);
                        setPatientEmail("");
                        setPatientPhone("");
                        setPatientYearOfBirth("");
                        setPatientLanguage(selectedCarePlan.translatedLanguage || "es");
                      } else {
                        setPatientName("");
                        setPatientEmail("");
                        setPatientPhone("");
                        setPatientYearOfBirth("");
                        setPatientLanguage(selectedCarePlan.translatedLanguage || "es");
                      }
                      setIsSendDialogOpen(true);
                    }}
                    data-testid="button-send-dialog"
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Send to Patient
                  </Button>
                )}
                {(selectedCarePlan.status === "sent" ||
                  selectedCarePlan.status === "completed") &&
                  selectedCarePlan.accessToken && (
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
                {/* FIX APPLIED: 
                    1. overflow-x-auto on parent 
                    2. flex row for children with min-w-[350px]
                */}
                <div className="flex h-full gap-4">
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
                      </CardTitle>
                      <CardDescription>5th grade reading level</CardDescription>
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
                              </Label>
                              <Textarea
                                className="mt-2 min-h-[60px] resize-none bg-background"
                                value={selectedCarePlan.simplifiedDiagnosis}
                                readOnly
                                data-testid="textarea-simplified-diagnosis"
                              />
                            </div>
                          )}
                          <MedicationsList
                            medications={selectedCarePlan.simplifiedMedications}
                            title="Your Medicines"
                            columnId="simplified"
                          />
                          <AppointmentsList
                            appointments={
                              selectedCarePlan.simplifiedAppointments
                            }
                            title="Your Appointments"
                            columnId="simplified"
                          />
                          {selectedCarePlan.simplifiedInstructions && (
                            <div className="bg-muted/50 rounded-lg p-3 border">
                              <Label className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                                <ClipboardList className="h-3 w-3" />
                                What to Do
                              </Label>
                              <Textarea
                                className="mt-2 min-h-[100px] resize-none bg-background"
                                value={formatContent(selectedCarePlan.simplifiedInstructions)}
                                readOnly
                                data-testid="textarea-simplified-instructions"
                              />
                            </div>
                          )}
                          {selectedCarePlan.simplifiedWarnings && (
                            <div className="bg-destructive/10 rounded-lg p-3 border border-destructive/30">
                              <Label className="text-xs text-destructive uppercase tracking-wide flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                Warning Signs
                              </Label>
                              <Textarea
                                className="mt-2 min-h-[60px] resize-none bg-background border-destructive/50"
                                value={formatContent(selectedCarePlan.simplifiedWarnings)}
                                readOnly
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
                        {SUPPORTED_LANGUAGES.find(
                          (l) => l.code === selectedCarePlan.translatedLanguage,
                        )?.name || "Translated"}
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
                                      {selectedCarePlan.backTranslatedDiagnosis}
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
                                      {selectedCarePlan.backTranslatedInstructions}
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
                                      {selectedCarePlan.backTranslatedWarnings}
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

                {selectedCarePlan.status === "pending_review" &&
                  !hasScrolledAll && (
                    <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-4 py-2 rounded-full text-sm shadow-lg flex items-center gap-2 z-50">
                      <Eye className="h-4 w-4" />
                      Scroll through all content to enable approval
                    </div>
                  )}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center p-8">
                <div className="text-center">
                  {selectedCarePlan.status === "draft" ? (
                    <>
                      <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
                      <p className="text-lg font-medium">Document Uploaded</p>
                      <p className="text-muted-foreground">
                        Select a language and click Process to continue
                      </p>
                      <div className="mt-4 flex items-center justify-center gap-2">
                        <Label>Target Language:</Label>
                        <Select
                          value={patientLanguage}
                          onValueChange={setPatientLanguage}
                          disabled={selectedCarePlan ? processingIds.has(selectedCarePlan.id) : false}
                        >
                          <SelectTrigger
                            className="w-[180px]"
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
                Welcome to Litera.ai
              </h2>
              <p className="text-muted-foreground mb-6">
                Upload a discharge summary to create simplified, translated care
                instructions for your patients.
              </p>
              <Button
                size="lg"
                onClick={() => setIsUploadDialogOpen(true)}
                data-testid="button-upload-main"
              >
                <Upload className="h-5 w-5 mr-2" />
                Upload Discharge Summary
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Upload Dialog */}
      <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Discharge Summary</DialogTitle>
            <DialogDescription>
              Upload a PDF or image of the patient's discharge instructions.
            </DialogDescription>
          </DialogHeader>
          
          {/* Sample Documents Dropdown - Only visible for demo tenants */}
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
                  toast({
                    title: "Failed to load sample",
                    description: "Could not load the sample document",
                    variant: "destructive",
                  });
                }
              }}
            >
              <SelectTrigger className="w-full" data-testid="select-sample-document">
                <SelectValue placeholder="Select a sample discharge document..." />
              </SelectTrigger>
              <SelectContent>
                {tenantSampleDocs.map((doc) => (
                  <SelectItem key={doc.file} value={doc.file}>
                    {doc.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Or upload your own file below
            </p>
          </div>
          )}

          <div
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
              isDragging
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25"
            }`}
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
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 ml-2"
                        onClick={() => setUploadFiles(prev => prev.filter((_, i) => i !== idx))}
                        data-testid={`button-remove-file-${idx}`}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Label htmlFor="file-upload-add" className="cursor-pointer">
                  <span className="text-xs text-primary hover:underline">+ Add more files</span>
                  <Input
                    id="file-upload-add"
                    type="file"
                    className="hidden"
                    accept=".pdf,image/*"
                    multiple
                    onChange={handleFileChange}
                  />
                </Label>
              </div>
            ) : (
              <>
                <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
                <p className="text-sm text-muted-foreground mb-2">
                  Drag and drop files here, or
                </p>
                <Label htmlFor="file-upload" className="cursor-pointer">
                  <span className="text-primary hover:underline">
                    browse files
                  </span>
                  <Input
                    id="file-upload"
                    type="file"
                    className="hidden"
                    accept=".pdf,image/*"
                    multiple
                    onChange={handleFileChange}
                    data-testid="input-file-upload"
                  />
                </Label>
                <p className="text-xs text-muted-foreground mt-2">
                  Supports PDF, JPG, PNG - Select multiple files
                </p>
              </>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsUploadDialogOpen(false);
                setUploadFiles([]);
                setUploadProgress(null);
              }}
              disabled={uploadMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={uploadFiles.length === 0 || uploadMutation.isPending}
              data-testid="button-upload-confirm"
            >
              {uploadMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {uploadProgress ? `${uploadProgress.current}/${uploadProgress.total}` : 'Uploading...'}
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload {uploadFiles.length > 1 ? `${uploadFiles.length} files` : ''}
                </>
              )}
            </Button>
          </DialogFooter>
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
                      setPatientYearOfBirth(p.yearOfBirth.toString());
                      setPatientLanguage(p.preferredLanguage || "en");
                      setFormTouched({ name: true, email: true, yearOfBirth: true });
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
              {patientPhone && (
                <p className="text-xs text-muted-foreground">SMS will be sent alongside the email.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="patient-yob" className={formErrors.yearOfBirth ? "text-destructive" : ""}>
                Year of Birth {formErrors.yearOfBirth && <span className="text-xs font-normal">*</span>}
              </Label>
              <Input
                id="patient-yob"
                type="number"
                placeholder="e.g., 1956"
                value={patientYearOfBirth}
                onChange={(e) => setPatientYearOfBirth(e.target.value)}
                onBlur={() => setFormTouched(prev => ({ ...prev, yearOfBirth: true }))}
                className={formErrors.yearOfBirth ? "border-destructive focus-visible:ring-destructive" : ""}
                data-testid="input-patient-yob"
              />
              {formErrors.yearOfBirth && (
                <p className="text-xs text-destructive">{formErrors.yearOfBirth}</p>
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
                !patientYearOfBirth ||
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
                  approveMutation.mutate({ id: selectedCarePlan.id });
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
