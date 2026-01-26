import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
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
  RefreshCw
} from "lucide-react";
import type { CarePlan, Patient } from "@shared/schema";
import { SUPPORTED_LANGUAGES } from "@shared/schema";

type CarePlanWithPatient = CarePlan & { patient?: Patient };

export default function ClinicianDashboard() {
  const { toast } = useToast();
  const [selectedCarePlan, setSelectedCarePlan] = useState<CarePlanWithPatient | null>(null);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [isSendDialogOpen, setIsSendDialogOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hasScrolledAll, setHasScrolledAll] = useState(false);

  // Patient form state
  const [patientName, setPatientName] = useState("");
  const [patientEmail, setPatientEmail] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [patientYearOfBirth, setPatientYearOfBirth] = useState("");
  const [patientLanguage, setPatientLanguage] = useState("es");

  // Fetch care plans
  const { data: carePlans = [], isLoading: isLoadingCarePlans } = useQuery<CarePlanWithPatient[]>({
    queryKey: ["/api/care-plans"],
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/care-plans/upload", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error("Upload failed");
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/care-plans"] });
      setSelectedCarePlan(data);
      setIsUploadDialogOpen(false);
      setUploadFile(null);
      toast({ title: "Document uploaded", description: "AI is processing your discharge summary..." });
    },
    onError: () => {
      toast({ title: "Upload failed", description: "Please try again", variant: "destructive" });
    },
  });

  // Process mutation (simplify + translate)
  const processMutation = useMutation({
    mutationFn: async ({ id, language }: { id: string; language: string }) => {
      return apiRequest("POST", `/api/care-plans/${id}/process`, { language });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/care-plans"] });
      setSelectedCarePlan(data);
      toast({ title: "Processing complete", description: "Content has been simplified and translated" });
    },
    onError: () => {
      toast({ title: "Processing failed", description: "Please try again", variant: "destructive" });
    },
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/care-plans/${id}/approve`);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/care-plans"] });
      setSelectedCarePlan(data);
      toast({ title: "Care plan approved", description: "Ready to send to patient" });
    },
    onError: () => {
      toast({ title: "Approval failed", variant: "destructive" });
    },
  });

  // Send mutation
  const sendMutation = useMutation({
    mutationFn: async (data: { carePlanId: string; patient: any }) => {
      return apiRequest("POST", `/api/care-plans/${data.carePlanId}/send`, data.patient);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/care-plans"] });
      setSelectedCarePlan(data);
      setIsSendDialogOpen(false);
      resetPatientForm();
      toast({ title: "Care plan sent!", description: "Patient will receive an email with their care instructions" });
    },
    onError: () => {
      toast({ title: "Failed to send", variant: "destructive" });
    },
  });

  const resetPatientForm = () => {
    setPatientName("");
    setPatientEmail("");
    setPatientPhone("");
    setPatientYearOfBirth("");
    setPatientLanguage("es");
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
    const file = e.dataTransfer.files[0];
    if (file && (file.type === "application/pdf" || file.type.startsWith("image/"))) {
      setUploadFile(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadFile(file);
    }
  };

  const handleUpload = () => {
    if (uploadFile) {
      uploadMutation.mutate(uploadFile);
    }
  };

  const handleSendToPatient = () => {
    if (!selectedCarePlan) return;
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
    const statusConfig: Record<string, { variant: "default" | "secondary" | "outline" | "destructive"; label: string }> = {
      draft: { variant: "outline", label: "Draft" },
      pending_review: { variant: "secondary", label: "Pending Review" },
      approved: { variant: "default", label: "Approved" },
      sent: { variant: "default", label: "Sent" },
      completed: { variant: "default", label: "Completed" },
    };
    const config = statusConfig[status] || statusConfig.draft;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const isScrolledToBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 50;
    if (isScrolledToBottom) {
      setHasScrolledAll(true);
    }
  };

  return (
    <div className="flex h-full">
      {/* Sidebar - Care Plans List */}
      <div className="w-80 border-r bg-card flex flex-col">
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
        
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-2">
            {isLoadingCarePlans ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : carePlans.length === 0 ? (
              <div className="text-center py-8 px-4">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">No care plans yet</p>
                <p className="text-xs text-muted-foreground mt-1">Upload a discharge summary to get started</p>
              </div>
            ) : (
              carePlans.map((plan) => (
                <Card 
                  key={plan.id}
                  className={`cursor-pointer transition-colors hover-elevate ${
                    selectedCarePlan?.id === plan.id ? "border-primary bg-primary/5" : ""
                  }`}
                  onClick={() => setSelectedCarePlan(plan)}
                  data-testid={`card-care-plan-${plan.id}`}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">
                          {plan.patient?.name || "New Patient"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {plan.diagnosis ? plan.diagnosis.slice(0, 50) + "..." : "Processing..."}
                        </p>
                      </div>
                      {getStatusBadge(plan.status)}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Main Content - Care Plan Editor */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedCarePlan ? (
          <>
            {/* Header */}
            <div className="p-4 border-b bg-card flex items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-semibold flex items-center gap-2">
                  <Stethoscope className="h-5 w-5 text-primary" />
                  {selectedCarePlan.patient?.name || "New Care Plan"}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {selectedCarePlan.originalFileName || "Discharge Summary"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {selectedCarePlan.status === "draft" && (
                  <Button
                    onClick={() => processMutation.mutate({ 
                      id: selectedCarePlan.id, 
                      language: patientLanguage 
                    })}
                    disabled={processMutation.isPending}
                    data-testid="button-process"
                  >
                    {processMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Process & Translate
                  </Button>
                )}
                {selectedCarePlan.status === "pending_review" && (
                  <Button
                    onClick={() => approveMutation.mutate(selectedCarePlan.id)}
                    disabled={approveMutation.isPending || !hasScrolledAll}
                    data-testid="button-approve"
                  >
                    {approveMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4 mr-2" />
                    )}
                    Verify & Approve
                  </Button>
                )}
                {selectedCarePlan.status === "approved" && (
                  <Button
                    onClick={() => setIsSendDialogOpen(true)}
                    data-testid="button-send-dialog"
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Send to Patient
                  </Button>
                )}
                {getStatusBadge(selectedCarePlan.status)}
              </div>
            </div>

            {/* Content Tabs */}
            {selectedCarePlan.status === "pending_review" || selectedCarePlan.status === "approved" || selectedCarePlan.status === "sent" ? (
              <div className="flex-1 overflow-hidden p-4">
                <div className="h-full grid grid-cols-3 gap-4">
                  {/* Original Column */}
                  <Card className="flex flex-col overflow-hidden">
                    <CardHeader className="pb-2 flex-shrink-0">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Original
                      </CardTitle>
                      <CardDescription>Source document content</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 overflow-hidden p-0">
                      <ScrollArea className="h-full px-4 pb-4" onScroll={handleScroll}>
                        <div className="space-y-4 bg-muted/30 p-3 rounded-lg">
                          {selectedCarePlan.diagnosis && (
                            <div>
                              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Diagnosis</Label>
                              <p className="text-sm mt-1">{selectedCarePlan.diagnosis}</p>
                            </div>
                          )}
                          {selectedCarePlan.instructions && (
                            <div>
                              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Instructions</Label>
                              <p className="text-sm mt-1 whitespace-pre-wrap">{selectedCarePlan.instructions}</p>
                            </div>
                          )}
                          {selectedCarePlan.warnings && (
                            <div>
                              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Warnings</Label>
                              <p className="text-sm mt-1 whitespace-pre-wrap">{selectedCarePlan.warnings}</p>
                            </div>
                          )}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>

                  {/* Simplified Column */}
                  <Card className="flex flex-col overflow-hidden">
                    <CardHeader className="pb-2 flex-shrink-0">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <ClipboardList className="h-4 w-4" />
                        Simplified English
                      </CardTitle>
                      <CardDescription>5th grade reading level</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 overflow-hidden p-0">
                      <ScrollArea className="h-full px-4 pb-4" onScroll={handleScroll}>
                        <div className="space-y-4">
                          {selectedCarePlan.simplifiedDiagnosis && (
                            <div>
                              <Label className="text-xs text-muted-foreground uppercase tracking-wide">What's Wrong</Label>
                              <Textarea 
                                className="mt-1 min-h-[80px] resize-none"
                                value={selectedCarePlan.simplifiedDiagnosis}
                                readOnly
                              />
                            </div>
                          )}
                          {selectedCarePlan.simplifiedInstructions && (
                            <div>
                              <Label className="text-xs text-muted-foreground uppercase tracking-wide">What to Do</Label>
                              <Textarea 
                                className="mt-1 min-h-[120px] resize-none"
                                value={selectedCarePlan.simplifiedInstructions}
                                readOnly
                              />
                            </div>
                          )}
                          {selectedCarePlan.simplifiedWarnings && (
                            <div>
                              <Label className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3 text-destructive" />
                                Warning Signs
                              </Label>
                              <Textarea 
                                className="mt-1 min-h-[80px] resize-none border-destructive/50"
                                value={selectedCarePlan.simplifiedWarnings}
                                readOnly
                              />
                            </div>
                          )}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>

                  {/* Translated Column */}
                  <Card className="flex flex-col overflow-hidden">
                    <CardHeader className="pb-2 flex-shrink-0">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Languages className="h-4 w-4" />
                        {SUPPORTED_LANGUAGES.find(l => l.code === selectedCarePlan.translatedLanguage)?.name || "Translated"}
                      </CardTitle>
                      <CardDescription>Patient's language</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 overflow-hidden p-0">
                      <ScrollArea className="h-full px-4 pb-4" onScroll={handleScroll}>
                        <div className="space-y-4">
                          {selectedCarePlan.translatedDiagnosis && (
                            <div className="group relative">
                              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Diagnosis</Label>
                              <Textarea 
                                className="mt-1 min-h-[80px] resize-none"
                                value={selectedCarePlan.translatedDiagnosis}
                                readOnly
                              />
                              {selectedCarePlan.backTranslatedDiagnosis && (
                                <div className="absolute left-0 right-0 -top-2 opacity-0 group-hover:opacity-100 transition-opacity bg-popover border rounded-lg p-2 text-xs shadow-lg z-10">
                                  <span className="font-medium">Back-translation: </span>
                                  {selectedCarePlan.backTranslatedDiagnosis}
                                </div>
                              )}
                            </div>
                          )}
                          {selectedCarePlan.translatedInstructions && (
                            <div className="group relative">
                              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Instructions</Label>
                              <Textarea 
                                className="mt-1 min-h-[120px] resize-none"
                                value={selectedCarePlan.translatedInstructions}
                                readOnly
                              />
                              {selectedCarePlan.backTranslatedInstructions && (
                                <div className="absolute left-0 right-0 -top-2 opacity-0 group-hover:opacity-100 transition-opacity bg-popover border rounded-lg p-2 text-xs shadow-lg z-10">
                                  <span className="font-medium">Back-translation: </span>
                                  {selectedCarePlan.backTranslatedInstructions}
                                </div>
                              )}
                            </div>
                          )}
                          {selectedCarePlan.translatedWarnings && (
                            <div className="group relative">
                              <Label className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3 text-destructive" />
                                Warnings
                              </Label>
                              <Textarea 
                                className="mt-1 min-h-[80px] resize-none border-destructive/50"
                                value={selectedCarePlan.translatedWarnings}
                                readOnly
                              />
                            </div>
                          )}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </div>
                
                {selectedCarePlan.status === "pending_review" && !hasScrolledAll && (
                  <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-4 py-2 rounded-full text-sm shadow-lg flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    Scroll through all content to enable approval
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  {selectedCarePlan.status === "draft" ? (
                    <>
                      <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
                      <p className="text-lg font-medium">Document Uploaded</p>
                      <p className="text-muted-foreground">Select a language and click Process to continue</p>
                      <div className="mt-4 flex items-center justify-center gap-2">
                        <Label>Target Language:</Label>
                        <Select value={patientLanguage} onValueChange={setPatientLanguage}>
                          <SelectTrigger className="w-[180px]" data-testid="select-language">
                            <SelectValue placeholder="Select language" />
                          </SelectTrigger>
                          <SelectContent>
                            {SUPPORTED_LANGUAGES.filter(l => l.code !== "en").map((lang) => (
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
                      <p className="text-muted-foreground">Patient has been notified via email</p>
                    </>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-md">
              <Stethoscope className="h-16 w-16 text-primary/30 mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Welcome to Litera.ai</h2>
              <p className="text-muted-foreground mb-6">
                Upload a discharge summary to create simplified, translated care instructions for your patients.
              </p>
              <Button size="lg" onClick={() => setIsUploadDialogOpen(true)} data-testid="button-upload-main">
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
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25"
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {uploadFile ? (
              <div className="space-y-2">
                <FileText className="h-10 w-10 text-primary mx-auto" />
                <p className="font-medium">{uploadFile.name}</p>
                <p className="text-sm text-muted-foreground">
                  {(uploadFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            ) : (
              <>
                <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
                <p className="text-sm text-muted-foreground mb-2">
                  Drag and drop your file here, or
                </p>
                <Label htmlFor="file-upload" className="cursor-pointer">
                  <span className="text-primary hover:underline">browse files</span>
                  <Input
                    id="file-upload"
                    type="file"
                    className="hidden"
                    accept=".pdf,image/*"
                    onChange={handleFileChange}
                    data-testid="input-file-upload"
                  />
                </Label>
                <p className="text-xs text-muted-foreground mt-2">
                  Supports PDF, JPG, PNG (max 10MB)
                </p>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsUploadDialogOpen(false); setUploadFile(null); }}>
              Cancel
            </Button>
            <Button 
              onClick={handleUpload} 
              disabled={!uploadFile || uploadMutation.isPending}
              data-testid="button-upload-confirm"
            >
              {uploadMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              Upload
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
              Enter the patient's contact information to send them their care instructions.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="patient-name">Patient Name</Label>
              <Input
                id="patient-name"
                placeholder="e.g., Rosa Hernandez"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                data-testid="input-patient-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="patient-email">Email Address</Label>
              <Input
                id="patient-email"
                type="email"
                placeholder="e.g., rosa@example.com"
                value={patientEmail}
                onChange={(e) => setPatientEmail(e.target.value)}
                data-testid="input-patient-email"
              />
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
              <Label htmlFor="patient-yob">Year of Birth</Label>
              <Input
                id="patient-yob"
                type="number"
                placeholder="e.g., 1956"
                value={patientYearOfBirth}
                onChange={(e) => setPatientYearOfBirth(e.target.value)}
                data-testid="input-patient-yob"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="patient-language">Preferred Language</Label>
              <Select value={patientLanguage} onValueChange={setPatientLanguage}>
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
            <Button variant="outline" onClick={() => setIsSendDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSendToPatient}
              disabled={!patientName || !patientEmail || !patientYearOfBirth || sendMutation.isPending}
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
    </div>
  );
}
