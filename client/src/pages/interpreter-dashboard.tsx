import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
} from "lucide-react";
import { SUPPORTED_LANGUAGES } from "@shared/schema";

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
  const [editedTranslatedDiagnosis, setEditedTranslatedDiagnosis] = useState(carePlan.translatedDiagnosis || "");
  const [editedTranslatedInstructions, setEditedTranslatedInstructions] = useState(carePlan.translatedInstructions || "");
  const [editedTranslatedWarnings, setEditedTranslatedWarnings] = useState(carePlan.translatedWarnings || "");
  const [interpreterNotes, setInterpreterNotes] = useState("");
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const approveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/interpreter/care-plans/${carePlan.id}/approve`, {
        simplifiedDiagnosis: editedSimplifiedDiagnosis,
        simplifiedInstructions: editedSimplifiedInstructions,
        simplifiedWarnings: editedSimplifiedWarnings,
        translatedDiagnosis: editedTranslatedDiagnosis,
        translatedInstructions: editedTranslatedInstructions,
        translatedWarnings: editedTranslatedWarnings,
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
            {carePlan.extractedPatientName || carePlan.patient?.name || "Unknown Patient"} - {getLanguageName(carePlan.translatedLanguage || "en")}
          </p>
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

export default function InterpreterDashboard() {
  const [selectedCarePlan, setSelectedCarePlan] = useState<CarePlan | null>(null);
  const [languageFilter, setLanguageFilter] = useState<string>("all");

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

  const queueLanguages = Array.from(new Set((queue || []).map(cp => cp.translatedLanguage).filter(Boolean)));

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-interpreter-title">Translation Review Queue</h1>
        <p className="text-muted-foreground">Review and validate AI-generated translations before they reach patients.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                <Languages className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="text-languages-count">{queueLanguages.length}</p>
                <p className="text-sm text-muted-foreground">Languages in Queue</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3">
        <Label className="text-sm font-medium">Filter by language:</Label>
        <Select value={languageFilter} onValueChange={setLanguageFilter}>
          <SelectTrigger className="w-48" data-testid="select-language-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Languages</SelectItem>
            {queueLanguages.map(code => (
              <SelectItem key={code} value={code!}>{getLanguageName(code!)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : filteredQueue.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
            <p className="text-lg font-medium">Queue is clear</p>
            <p className="text-muted-foreground">No translations awaiting review right now.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredQueue.map(cp => (
            <Card key={cp.id} className="hover-elevate cursor-pointer" onClick={() => setSelectedCarePlan(cp)} data-testid={`card-queue-item-${cp.id}`}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <FileText className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{cp.extractedPatientName || cp.patient?.name || "Unknown Patient"}</p>
                      <p className="text-sm text-muted-foreground">{cp.diagnosis}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{getLanguageName(cp.translatedLanguage || "en")}</Badge>
                    <Badge variant="outline">{cp.clinician?.name || "Unknown Clinician"}</Badge>
                    <p className="text-xs text-muted-foreground">
                      {new Date(cp.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {reviewed && reviewed.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Recently Reviewed</h2>
          {reviewed.slice(0, 5).map(cp => (
            <Card key={cp.id} data-testid={`card-reviewed-item-${cp.id}`}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <div>
                      <p className="font-medium">{cp.extractedPatientName || cp.patient?.name || "Unknown Patient"}</p>
                      <p className="text-sm text-muted-foreground">{cp.diagnosis}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{getLanguageName(cp.translatedLanguage || "en")}</Badge>
                    <Badge variant={cp.status === "interpreter_approved" ? "default" : "outline"}>
                      {cp.status === "interpreter_approved" ? "Approved" : cp.status}
                    </Badge>
                    <p className="text-xs text-muted-foreground">
                      {cp.interpreterReviewedAt ? new Date(cp.interpreterReviewedAt).toLocaleDateString() : ""}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
