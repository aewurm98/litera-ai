import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Languages,
  CheckCircle2,
  Clock,
  FileText,
  ArrowLeft,
  Eye,
  AlertTriangle,
  User,
  ArrowUpDown,
  BarChart3,
  Globe,
} from "lucide-react";
import { SUPPORTED_LANGUAGES } from "@shared/schema";
import { format, differenceInHours } from "date-fns";

interface CarePlan {
  id: string;
  status: string;
  originalContent?: string;
  diagnosis?: string;
  instructions?: string;
  warnings?: string;
  simplifiedDiagnosis?: string;
  simplifiedInstructions?: string;
  simplifiedWarnings?: string;
  simplifiedMedications?: Array<{ name: string; dose: string; frequency: string; instructions: string }>;
  simplifiedAppointments?: Array<{ date: string; time: string; provider: string; location: string; purpose: string }>;
  translatedLanguage?: string;
  translatedDiagnosis?: string;
  translatedInstructions?: string;
  translatedWarnings?: string;
  translatedMedications?: Array<{ name: string; dose: string; frequency: string; instructions: string }>;
  translatedAppointments?: Array<{ date: string; time: string; provider: string; location: string; purpose: string }>;
  backTranslatedDiagnosis?: string;
  backTranslatedInstructions?: string;
  backTranslatedWarnings?: string;
  interpreterReviewedBy?: string;
  interpreterReviewedAt?: string;
  interpreterNotes?: string;
  extractedPatientName?: string;
  originalFileName?: string;
  createdAt: string;
  updatedAt: string;
  patient?: { name: string; email: string; preferredLanguage: string } | null;
  clinician?: { name: string } | null;
}

function getLanguageName(code: string): string {
  return SUPPORTED_LANGUAGES.find(l => l.code === code)?.name || code;
}

function ReviewPanel({ carePlan, onBack }: { carePlan: CarePlan; onBack: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editedSimplifiedDiagnosis, setEditedSimplifiedDiagnosis] = useState(carePlan.simplifiedDiagnosis || "");
  const [editedSimplifiedInstructions, setEditedSimplifiedInstructions] = useState(carePlan.simplifiedInstructions || "");
  const [editedSimplifiedWarnings, setEditedSimplifiedWarnings] = useState(carePlan.simplifiedWarnings || "");
  const [editedSimplifiedMedications, setEditedSimplifiedMedications] = useState(
    carePlan.simplifiedMedications?.map(m => ({ ...m })) || []
  );
  const [editedSimplifiedAppointments, setEditedSimplifiedAppointments] = useState(
    carePlan.simplifiedAppointments?.map(a => ({ ...a })) || []
  );
  const [editedTranslatedDiagnosis, setEditedTranslatedDiagnosis] = useState(carePlan.translatedDiagnosis || "");
  const [editedTranslatedInstructions, setEditedTranslatedInstructions] = useState(carePlan.translatedInstructions || "");
  const [editedTranslatedWarnings, setEditedTranslatedWarnings] = useState(carePlan.translatedWarnings || "");
  const [editedTranslatedMedications, setEditedTranslatedMedications] = useState(
    carePlan.translatedMedications?.map(m => ({ ...m })) || []
  );
  const [editedTranslatedAppointments, setEditedTranslatedAppointments] = useState(
    carePlan.translatedAppointments?.map(a => ({ ...a })) || []
  );
  const [interpreterNotes, setInterpreterNotes] = useState("");

  const updateSimplifiedMedication = (index: number, field: string, value: string) =>
    setEditedSimplifiedMedications(prev => prev.map((m, i) => i === index ? { ...m, [field]: value } : m));
  const updateSimplifiedAppointment = (index: number, field: string, value: string) =>
    setEditedSimplifiedAppointments(prev => prev.map((a, i) => i === index ? { ...a, [field]: value } : a));
  const updateTranslatedMedication = (index: number, field: string, value: string) =>
    setEditedTranslatedMedications(prev => prev.map((m, i) => i === index ? { ...m, [field]: value } : m));
  const updateTranslatedAppointment = (index: number, field: string, value: string) =>
    setEditedTranslatedAppointments(prev => prev.map((a, i) => i === index ? { ...a, [field]: value } : a));
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const approveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/interpreter/care-plans/${carePlan.id}/approve`, {
        simplifiedDiagnosis: editedSimplifiedDiagnosis,
        simplifiedInstructions: editedSimplifiedInstructions,
        simplifiedWarnings: editedSimplifiedWarnings,
        simplifiedMedications: editedSimplifiedMedications.length > 0 ? editedSimplifiedMedications : undefined,
        simplifiedAppointments: editedSimplifiedAppointments.length > 0 ? editedSimplifiedAppointments : undefined,
        translatedDiagnosis: editedTranslatedDiagnosis,
        translatedInstructions: editedTranslatedInstructions,
        translatedWarnings: editedTranslatedWarnings,
        translatedMedications: editedTranslatedMedications.length > 0 ? editedTranslatedMedications : undefined,
        translatedAppointments: editedTranslatedAppointments.length > 0 ? editedTranslatedAppointments : undefined,
        notes: interpreterNotes || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Care plan approved", description: "The care plan has been sent back to the clinician for final review." });
      queryClient.invalidateQueries({ queryKey: ["/api/interpreter/queue"] });
      onBack();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const requestChangesMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/interpreter/care-plans/${carePlan.id}/request-changes`, {
        reason: rejectReason,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Changes requested", description: "The clinician has been notified to revise this care plan." });
      queryClient.invalidateQueries({ queryKey: ["/api/interpreter/queue"] });
      setShowRejectDialog(false);
      onBack();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-back-to-queue">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-xl font-semibold">Review Care Plan</h2>
          <p className="text-sm text-muted-foreground">
            {carePlan.extractedPatientName || carePlan.patient?.name || "Unknown Patient"} — {getLanguageName(carePlan.translatedLanguage || "en")}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <User className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              Created by {carePlan.clinician?.name || "Unknown Clinician"} · {format(new Date(carePlan.createdAt), "MMM d, yyyy")}
            </span>
          </div>
        </div>
        <Badge variant="outline" className="ml-auto">{carePlan.originalFileName}</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Original Content
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground uppercase">Diagnosis</Label>
              <p className="text-sm mt-1">{carePlan.diagnosis}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground uppercase">Instructions</Label>
              <p className="text-sm mt-1">{carePlan.instructions}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground uppercase">Warnings</Label>
              <p className="text-sm mt-1">{carePlan.warnings}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Simplified (English)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground uppercase">Diagnosis</Label>
              <Textarea
                value={editedSimplifiedDiagnosis}
                onChange={(e) => setEditedSimplifiedDiagnosis(e.target.value)}
                className="mt-1 text-sm min-h-[80px]"
                data-testid="textarea-simplified-diagnosis"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground uppercase">Instructions</Label>
              <Textarea
                value={editedSimplifiedInstructions}
                onChange={(e) => setEditedSimplifiedInstructions(e.target.value)}
                className="mt-1 text-sm min-h-[80px]"
                data-testid="textarea-simplified-instructions"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground uppercase">Warnings</Label>
              <Textarea
                value={editedSimplifiedWarnings}
                onChange={(e) => setEditedSimplifiedWarnings(e.target.value)}
                className="mt-1 text-sm min-h-[80px]"
                data-testid="textarea-simplified-warnings"
              />
            </div>
            {editedSimplifiedMedications.length > 0 && (
              <div>
                <Label className="text-xs text-muted-foreground uppercase">Medications</Label>
                <div className="space-y-2 mt-1">
                  {editedSimplifiedMedications.map((med, i) => (
                    <div key={i} className="border rounded p-2 space-y-1">
                      <Textarea className="text-xs min-h-[36px]" value={med.name} onChange={e => updateSimplifiedMedication(i, "name", e.target.value)} placeholder="Name" data-testid={`textarea-simplified-med-name-${i}`} />
                      <Textarea className="text-xs min-h-[36px]" value={med.dose} onChange={e => updateSimplifiedMedication(i, "dose", e.target.value)} placeholder="Dose" data-testid={`textarea-simplified-med-dose-${i}`} />
                      <Textarea className="text-xs min-h-[36px]" value={med.frequency} onChange={e => updateSimplifiedMedication(i, "frequency", e.target.value)} placeholder="Frequency" data-testid={`textarea-simplified-med-frequency-${i}`} />
                      <Textarea className="text-xs min-h-[36px]" value={med.instructions} onChange={e => updateSimplifiedMedication(i, "instructions", e.target.value)} placeholder="Instructions" data-testid={`textarea-simplified-med-instructions-${i}`} />
                    </div>
                  ))}
                </div>
              </div>
            )}
            {editedSimplifiedAppointments.length > 0 && (
              <div>
                <Label className="text-xs text-muted-foreground uppercase">Appointments</Label>
                <div className="space-y-2 mt-1">
                  {editedSimplifiedAppointments.map((apt, i) => (
                    <div key={i} className="border rounded p-2 space-y-1">
                      <Textarea className="text-xs min-h-[36px]" value={apt.date} onChange={e => updateSimplifiedAppointment(i, "date", e.target.value)} placeholder="Date" data-testid={`textarea-simplified-apt-date-${i}`} />
                      <Textarea className="text-xs min-h-[36px]" value={apt.time} onChange={e => updateSimplifiedAppointment(i, "time", e.target.value)} placeholder="Time" data-testid={`textarea-simplified-apt-time-${i}`} />
                      <Textarea className="text-xs min-h-[36px]" value={apt.provider} onChange={e => updateSimplifiedAppointment(i, "provider", e.target.value)} placeholder="Provider" data-testid={`textarea-simplified-apt-provider-${i}`} />
                      <Textarea className="text-xs min-h-[36px]" value={apt.location} onChange={e => updateSimplifiedAppointment(i, "location", e.target.value)} placeholder="Location" data-testid={`textarea-simplified-apt-location-${i}`} />
                      <Textarea className="text-xs min-h-[36px]" value={apt.purpose} onChange={e => updateSimplifiedAppointment(i, "purpose", e.target.value)} placeholder="Purpose" data-testid={`textarea-simplified-apt-purpose-${i}`} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Languages className="h-4 w-4" />
              Translated ({getLanguageName(carePlan.translatedLanguage || "en")})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground uppercase">Diagnosis</Label>
              <Textarea
                value={editedTranslatedDiagnosis}
                onChange={(e) => setEditedTranslatedDiagnosis(e.target.value)}
                className="mt-1 text-sm min-h-[80px]"
                data-testid="textarea-translated-diagnosis"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground uppercase">Instructions</Label>
              <Textarea
                value={editedTranslatedInstructions}
                onChange={(e) => setEditedTranslatedInstructions(e.target.value)}
                className="mt-1 text-sm min-h-[80px]"
                data-testid="textarea-translated-instructions"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground uppercase">Warnings</Label>
              <Textarea
                value={editedTranslatedWarnings}
                onChange={(e) => setEditedTranslatedWarnings(e.target.value)}
                className="mt-1 text-sm min-h-[80px]"
                data-testid="textarea-translated-warnings"
              />
            </div>
            {editedTranslatedMedications.length > 0 && (
              <div>
                <Label className="text-xs text-muted-foreground uppercase">Medications</Label>
                <div className="space-y-2 mt-1">
                  {editedTranslatedMedications.map((med, i) => (
                    <div key={i} className="border rounded p-2 space-y-1">
                      <Textarea className="text-xs min-h-[36px]" value={med.name} onChange={e => updateTranslatedMedication(i, "name", e.target.value)} placeholder="Name" data-testid={`textarea-translated-med-name-${i}`} />
                      <Textarea className="text-xs min-h-[36px]" value={med.dose} onChange={e => updateTranslatedMedication(i, "dose", e.target.value)} placeholder="Dose" data-testid={`textarea-translated-med-dose-${i}`} />
                      <Textarea className="text-xs min-h-[36px]" value={med.frequency} onChange={e => updateTranslatedMedication(i, "frequency", e.target.value)} placeholder="Frequency" data-testid={`textarea-translated-med-frequency-${i}`} />
                      <Textarea className="text-xs min-h-[36px]" value={med.instructions} onChange={e => updateTranslatedMedication(i, "instructions", e.target.value)} placeholder="Instructions" data-testid={`textarea-translated-med-instructions-${i}`} />
                    </div>
                  ))}
                </div>
              </div>
            )}
            {editedTranslatedAppointments.length > 0 && (
              <div>
                <Label className="text-xs text-muted-foreground uppercase">Appointments</Label>
                <div className="space-y-2 mt-1">
                  {editedTranslatedAppointments.map((apt, i) => (
                    <div key={i} className="border rounded p-2 space-y-1">
                      <Textarea className="text-xs min-h-[36px]" value={apt.date} onChange={e => updateTranslatedAppointment(i, "date", e.target.value)} placeholder="Date" data-testid={`textarea-translated-apt-date-${i}`} />
                      <Textarea className="text-xs min-h-[36px]" value={apt.time} onChange={e => updateTranslatedAppointment(i, "time", e.target.value)} placeholder="Time" data-testid={`textarea-translated-apt-time-${i}`} />
                      <Textarea className="text-xs min-h-[36px]" value={apt.provider} onChange={e => updateTranslatedAppointment(i, "provider", e.target.value)} placeholder="Provider" data-testid={`textarea-translated-apt-provider-${i}`} />
                      <Textarea className="text-xs min-h-[36px]" value={apt.location} onChange={e => updateTranslatedAppointment(i, "location", e.target.value)} placeholder="Location" data-testid={`textarea-translated-apt-location-${i}`} />
                      <Textarea className="text-xs min-h-[36px]" value={apt.purpose} onChange={e => updateTranslatedAppointment(i, "purpose", e.target.value)} placeholder="Purpose" data-testid={`textarea-translated-apt-purpose-${i}`} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {carePlan.backTranslatedDiagnosis && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Back-Translation Verification</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground uppercase">Diagnosis</Label>
              <p className="text-sm mt-1 text-muted-foreground italic">{carePlan.backTranslatedDiagnosis}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground uppercase">Instructions</Label>
              <p className="text-sm mt-1 text-muted-foreground italic">{carePlan.backTranslatedInstructions}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground uppercase">Warnings</Label>
              <p className="text-sm mt-1 text-muted-foreground italic">{carePlan.backTranslatedWarnings}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div>
              <Label htmlFor="interpreter-notes">Review Notes (optional)</Label>
              <Textarea
                id="interpreter-notes"
                placeholder="Add any notes about your review, corrections made, or concerns..."
                value={interpreterNotes}
                onChange={(e) => setInterpreterNotes(e.target.value)}
                className="mt-1"
                data-testid="textarea-interpreter-notes"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={() => setShowRejectDialog(true)}
                data-testid="button-request-changes"
              >
                <AlertTriangle className="h-4 w-4 mr-2" />
                Request Changes
              </Button>
              <Button
                onClick={() => approveMutation.mutate()}
                disabled={approveMutation.isPending}
                data-testid="button-approve-translation"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                {approveMutation.isPending ? "Approving..." : "Approve Translation"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Changes</DialogTitle>
            <DialogDescription>
              Describe what needs to be corrected. The clinician will be notified to revise and reprocess this care plan.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder="Explain what needs to be changed..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="min-h-[120px]"
              data-testid="textarea-reject-reason"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => requestChangesMutation.mutate()}
              disabled={requestChangesMutation.isPending || !rejectReason.trim()}
              data-testid="button-confirm-request-changes"
            >
              {requestChangesMutation.isPending ? "Sending..." : "Send to Clinician"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PreviewPane({ carePlan }: { carePlan: CarePlan }) {
  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        <div>
          <h3 className="font-semibold text-lg" data-testid="text-preview-patient-name">
            {carePlan.extractedPatientName || carePlan.patient?.name || "Unknown Patient"}
          </h3>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge variant="secondary" className="text-xs">
              {getLanguageName(carePlan.translatedLanguage || "en")}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {carePlan.clinician?.name || "Unknown Clinician"} · {format(new Date(carePlan.createdAt), "MMM d, yyyy")}
            </span>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground uppercase">Diagnosis</Label>
            <p className="text-sm mt-1">{carePlan.diagnosis || "Not extracted"}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground uppercase">Simplified</Label>
              <p className="text-sm mt-1 text-muted-foreground">{carePlan.simplifiedDiagnosis || "Not generated"}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground uppercase">Translated</Label>
              <p className="text-sm mt-1 text-muted-foreground">{carePlan.translatedDiagnosis || "Not generated"}</p>
            </div>
          </div>

          {carePlan.simplifiedMedications && carePlan.simplifiedMedications.length > 0 && (
            <div>
              <Label className="text-xs text-muted-foreground uppercase">Medications ({carePlan.simplifiedMedications.length})</Label>
              <div className="space-y-1 mt-1">
                {carePlan.simplifiedMedications.map((med, i) => (
                  <div key={i} className="text-sm p-2 rounded-md bg-muted/50">
                    <span className="font-medium">{med.name}</span> {med.dose} — {med.frequency}
                  </div>
                ))}
              </div>
            </div>
          )}

          {carePlan.simplifiedAppointments && carePlan.simplifiedAppointments.length > 0 && (
            <div>
              <Label className="text-xs text-muted-foreground uppercase">Appointments ({carePlan.simplifiedAppointments.length})</Label>
              <div className="space-y-1 mt-1">
                {carePlan.simplifiedAppointments.map((apt, i) => (
                  <div key={i} className="text-sm p-2 rounded-md bg-muted/50">
                    <span className="font-medium">{apt.provider}</span> — {apt.date} at {apt.time}
                  </div>
                ))}
              </div>
            </div>
          )}

          {carePlan.backTranslatedDiagnosis && (
            <div>
              <Label className="text-xs text-muted-foreground uppercase">Back-Translation Check</Label>
              <p className="text-sm mt-1 italic text-muted-foreground">{carePlan.backTranslatedDiagnosis}</p>
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  );
}

type SortField = "date" | "patient" | "language";
type SortDir = "asc" | "desc";

export default function InterpreterDashboard() {
  const [selectedCarePlan, setSelectedCarePlan] = useState<CarePlan | null>(null);
  const [previewCarePlan, setPreviewCarePlan] = useState<CarePlan | null>(null);
  const [languageFilter, setLanguageFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const { data: queue, isLoading } = useQuery<CarePlan[]>({
    queryKey: ["/api/interpreter/queue"],
  });

  const { data: reviewed } = useQuery<CarePlan[]>({
    queryKey: ["/api/interpreter/reviewed"],
  });

  if (selectedCarePlan) {
    return (
      <div className="p-6">
        <ReviewPanel carePlan={selectedCarePlan} onBack={() => setSelectedCarePlan(null)} />
      </div>
    );
  }

  const filteredQueue = (queue || []).filter(cp =>
    languageFilter === "all" || cp.translatedLanguage === languageFilter
  );

  const sortedQueue = [...filteredQueue].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    switch (sortField) {
      case "date":
        return dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      case "patient": {
        const nameA = a.extractedPatientName || a.patient?.name || "";
        const nameB = b.extractedPatientName || b.patient?.name || "";
        return dir * nameA.localeCompare(nameB);
      }
      case "language":
        return dir * (getLanguageName(a.translatedLanguage || "").localeCompare(getLanguageName(b.translatedLanguage || "")));
      default:
        return 0;
    }
  });

  const queueLanguages = Array.from(new Set((queue || []).map(cp => cp.translatedLanguage).filter(Boolean)));

  const languageBreakdown = (queue || []).reduce((acc, cp) => {
    const lang = cp.translatedLanguage || "unknown";
    acc[lang] = (acc[lang] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const avgWaitHours = queue && queue.length > 0
    ? Math.round(queue.reduce((sum, cp) => sum + differenceInHours(new Date(), new Date(cp.createdAt)), 0) / queue.length)
    : 0;

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-interpreter-title">Translation Review Queue</h1>
        <p className="text-muted-foreground">Review and validate AI-generated translations before they reach patients.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="text-pending-count">{queue?.length || 0}</p>
                <p className="text-sm text-muted-foreground">Pending Review</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="text-reviewed-count">{reviewed?.length || 0}</p>
                <p className="text-sm text-muted-foreground">Reviewed</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="text-avg-wait">{avgWaitHours}h</p>
                <p className="text-sm text-muted-foreground">Avg. Wait Time</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <Globe className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <div className="flex items-center gap-1.5 flex-wrap" data-testid="text-language-breakdown">
                  {Object.entries(languageBreakdown).map(([lang, count]) => (
                    <Badge key={lang} variant="outline" className="text-xs">{getLanguageName(lang)} ({count})</Badge>
                  ))}
                  {Object.keys(languageBreakdown).length === 0 && <span className="text-sm text-muted-foreground">None</span>}
                </div>
                <p className="text-sm text-muted-foreground mt-1">By Language</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Select value={languageFilter} onValueChange={setLanguageFilter}>
          <SelectTrigger className="w-48" data-testid="select-language-filter">
            <SelectValue placeholder="Filter by language" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Languages</SelectItem>
            {queueLanguages.map(lang => (
              <SelectItem key={lang} value={lang!}>{getLanguageName(lang!)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : sortedQueue.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center">
            <CheckCircle2 className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <h3 className="text-lg font-semibold">Queue Empty</h3>
            <p className="text-muted-foreground text-sm mt-1">No care plans waiting for review. Check back later.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className={previewCarePlan ? "lg:col-span-3" : "lg:col-span-5"}>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        <Button variant="ghost" size="sm" onClick={() => toggleSort("patient")} className="gap-1" data-testid="button-sort-patient">
                          Patient <ArrowUpDown className="h-3 w-3" />
                        </Button>
                      </TableHead>
                      <TableHead>
                        <Button variant="ghost" size="sm" onClick={() => toggleSort("language")} className="gap-1" data-testid="button-sort-language">
                          Language <ArrowUpDown className="h-3 w-3" />
                        </Button>
                      </TableHead>
                      <TableHead>Diagnosis</TableHead>
                      <TableHead>
                        <Button variant="ghost" size="sm" onClick={() => toggleSort("date")} className="gap-1" data-testid="button-sort-date">
                          Submitted <ArrowUpDown className="h-3 w-3" />
                        </Button>
                      </TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedQueue.map((cp) => (
                      <TableRow
                        key={cp.id}
                        className={`cursor-pointer ${previewCarePlan?.id === cp.id ? "bg-muted/50" : ""}`}
                        onClick={() => setPreviewCarePlan(cp)}
                        data-testid={`row-queue-item-${cp.id}`}
                      >
                        <TableCell className="font-medium">
                          {cp.extractedPatientName || cp.patient?.name || "Unknown"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">
                            {getLanguageName(cp.translatedLanguage || "en")}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                          {cp.diagnosis || "Not extracted"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(cp.createdAt), "MMM d, h:mm a")}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); setSelectedCarePlan(cp); }}
                            data-testid={`button-review-${cp.id}`}
                          >
                            <Eye className="h-3.5 w-3.5 mr-1.5" />
                            Review
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          {previewCarePlan && (
            <div className="lg:col-span-2">
              <Card className="h-[500px]">
                <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
                  <CardTitle className="text-sm font-medium">Preview</CardTitle>
                  <Button
                    size="sm"
                    onClick={() => setSelectedCarePlan(previewCarePlan)}
                    data-testid="button-open-full-review"
                  >
                    <Eye className="h-3.5 w-3.5 mr-1.5" />
                    Full Review
                  </Button>
                </CardHeader>
                <CardContent className="p-0 h-[calc(100%-52px)]">
                  <PreviewPane carePlan={previewCarePlan} />
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {reviewed && reviewed.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-3" data-testid="text-recently-reviewed">Recently Reviewed</h2>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient</TableHead>
                    <TableHead>Language</TableHead>
                    <TableHead>Reviewed</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reviewed.map((cp) => (
                    <TableRow key={cp.id} data-testid={`row-reviewed-item-${cp.id}`}>
                      <TableCell className="font-medium">
                        {cp.extractedPatientName || cp.patient?.name || "Unknown"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {getLanguageName(cp.translatedLanguage || "en")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {cp.interpreterReviewedAt
                          ? format(new Date(cp.interpreterReviewedAt), "MMM d, h:mm a")
                          : "Recently"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                        {cp.interpreterNotes || "\u2014"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
