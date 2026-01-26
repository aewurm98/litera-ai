import { useState, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
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
  Download
} from "lucide-react";
import type { CarePlan, Patient, CheckIn } from "@shared/schema";
import { SUPPORTED_LANGUAGES } from "@shared/schema";

type CarePlanWithPatient = CarePlan & { patient: Patient; checkIns?: CheckIn[] };

export default function PatientPortal() {
  const { token } = useParams<{ token: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  const [isVerified, setIsVerified] = useState(false);
  const [yearOfBirth, setYearOfBirth] = useState("");
  const [attemptsRemaining, setAttemptsRemaining] = useState(3);
  const [isLocked, setIsLocked] = useState(false);
  const [showEnglish, setShowEnglish] = useState(false);
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

  const checkTTSSupport = (): boolean => {
    if (typeof window === 'undefined') return false;
    if (!('speechSynthesis' in window)) return false;
    try {
      const voices = window.speechSynthesis.getVoices();
      return voices.length > 0 || navigator.userAgent.includes('Chrome');
    } catch {
      return false;
    }
  };
  
  const isTTSSupported = checkTTSSupport();

  const speakContent = useCallback(() => {
    if (!carePlan) return;
    
    // Check for TTS support first
    if (!('speechSynthesis' in window)) {
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
    utterance.lang = showEnglish ? "en-US" : getLanguageCode(carePlan.translatedLanguage || "en");
    utterance.rate = 0.9;
    
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => {
      setIsSpeaking(false);
      toast({ title: "Text-to-speech unavailable", variant: "destructive" });
    };

    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }, [carePlan, showEnglish, isSpeaking, toast]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = useCallback(() => {
    if (!carePlan) return;
    
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
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-8 text-center">
            {checkInResponse === "green" && (
              <>
                <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
                  <Check className="h-10 w-10 text-green-600 dark:text-green-400" />
                </div>
                <h2 className="text-2xl font-semibold mb-2 text-green-700 dark:text-green-400">Great to hear!</h2>
                <p className="text-muted-foreground text-lg">
                  Keep following your care plan. We're here if you need us.
                </p>
              </>
            )}
            {checkInResponse === "yellow" && (
              <>
                <div className="w-20 h-20 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center mx-auto mb-4">
                  <Phone className="h-10 w-10 text-yellow-600 dark:text-yellow-400" />
                </div>
                <h2 className="text-2xl font-semibold mb-2 text-yellow-700 dark:text-yellow-400">We've notified your care team</h2>
                <p className="text-muted-foreground text-lg mb-6">
                  They will call you within 24 hours.
                </p>
                <Button size="lg" className="gap-2" asChild>
                  <a href="tel:+15551234567">
                    <Phone className="h-5 w-5" />
                    Call Clinic: (555) 123-4567
                  </a>
                </Button>
              </>
            )}
            {checkInResponse === "red" && (
              <>
                <div className="w-20 h-20 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
                  <AlertTriangle className="h-10 w-10 text-red-600 dark:text-red-400" />
                </div>
                <h2 className="text-2xl font-semibold mb-2 text-red-700 dark:text-red-400">If this is an emergency</h2>
                <Button 
                  size="lg" 
                  variant="destructive" 
                  className="w-full h-16 text-xl mb-4"
                  asChild
                >
                  <a href="tel:911">
                    <Phone className="h-6 w-6 mr-2" />
                    Call 911
                  </a>
                </Button>
                <p className="text-muted-foreground">
                  Your care team has been notified and will reach out to you.
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
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background p-4">
        <div className="max-w-lg mx-auto pt-8">
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">How are you feeling today?</CardTitle>
              <CardDescription className="text-base">
                Tap the option that best describes how you're doing
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
                  <div className="font-semibold text-lg text-green-800 dark:text-green-300">I feel good</div>
                  <div className="text-green-600 dark:text-green-400">Things are going okay</div>
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
                  <div className="font-semibold text-lg text-yellow-800 dark:text-yellow-300">I have a concern</div>
                  <div className="text-yellow-600 dark:text-yellow-400">Something doesn't feel right</div>
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
                  <div className="font-semibold text-lg text-red-800 dark:text-red-300">I need help now</div>
                  <div className="text-red-600 dark:text-red-400">This is urgent</div>
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
            Back to Care Plan
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
      {/* Header */}
      <header className="sticky top-0 z-50 bg-primary text-primary-foreground">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold">Your Care Plan</h1>
              <p className="text-primary-foreground/80 text-sm">
                {carePlan.patient.name}
              </p>
            </div>
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
                    <p className="font-medium">How are you feeling?</p>
                    <p className="text-sm text-muted-foreground">Let your care team know</p>
                  </div>
                </div>
                <Button onClick={() => setShowCheckIn(true)} data-testid="button-start-checkin">
                  Check In
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
              <CardTitle className="text-lg flex items-center gap-2">
                <Heart className="h-5 w-5 text-primary" />
                What's Wrong
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
              <CardTitle className="text-lg flex items-center gap-2">
                <Pill className="h-5 w-5 text-primary" />
                Your Medications
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
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                Your Appointments
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
              <CardTitle className="text-lg flex items-center gap-2">
                <Check className="h-5 w-5 text-primary" />
                What to Do
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="prose prose-lg dark:prose-invert max-w-none">
                <p className="whitespace-pre-wrap leading-relaxed">{instructions}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Warnings Card */}
        {warnings && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Warning Signs
              </CardTitle>
              <CardDescription>
                Go to the emergency room or call 911 if you have any of these:
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="prose prose-lg dark:prose-invert max-w-none">
                <p className="whitespace-pre-wrap leading-relaxed text-destructive/90">{warnings}</p>
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
                Stop Reading
              </>
            ) : (
              <>
                <Volume2 className="h-5 w-5" />
                {isTTSSupported ? "Read Aloud" : "Read Aloud (Not Available)"}
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
              Save as PDF
            </Button>
            <Button 
              variant="outline" 
              className="flex-1 h-14 text-lg gap-3"
              onClick={handlePrint}
              data-testid="button-print"
            >
              <Printer className="h-5 w-5" />
              Print
            </Button>
          </div>
        </div>
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
              Call Clinic
            </a>
          </Button>
          <Button 
            variant="destructive"
            className="flex-1 h-14 text-lg gap-2"
            asChild
          >
            <a href="tel:911">
              <AlertTriangle className="h-5 w-5" />
              Emergency 911
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
