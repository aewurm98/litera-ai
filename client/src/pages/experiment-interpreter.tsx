import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  Languages,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  FileText,
  User,
  FlaskConical,
  Clock,
  Pill,
  Calendar,
} from "lucide-react";

const SAMPLE_CARE_PLAN = {
  id: "exp-001",
  patientName: "Maria Garcia",
  clinicianName: "Dr. Sarah Chen",
  language: "Spanish",
  createdAt: "2026-02-18",
  original: {
    diagnosis: "Patient presents with uncontrolled Type 2 Diabetes Mellitus (T2DM) with hyperglycemia. HbA1c 11.2%. Concurrent hypertension managed with ACE inhibitor. No evidence of diabetic ketoacidosis. Mild diabetic nephropathy noted on labs (eGFR 58).",
    instructions: "1. Monitor blood glucose fasting and 2h post-prandial. Target FBG <130 mg/dL, PPG <180 mg/dL.\n2. Adhere strictly to prescribed medication regimen.\n3. Follow diabetic diet - carbohydrate counting, limit to 45-60g per meal.\n4. Engage in moderate physical activity 150 min/week.\n5. Attend all follow-up appointments.\n6. Monitor for signs/symptoms of hypoglycemia.\n7. Foot care: inspect daily, wear proper footwear.\n8. Annual ophthalmology exam recommended.",
    warnings: "Seek immediate medical attention if: blood glucose >400 mg/dL or <70 mg/dL, altered mental status, persistent vomiting, signs of DKA (fruity breath, Kussmaul breathing), chest pain, shortness of breath, sudden vision changes, signs of stroke (facial droop, arm weakness, speech difficulty).",
  },
  simplified: {
    diagnosis: "You came to the hospital because your blood sugar was very high. Your blood sugar has been high for a long time. You also have high blood pressure. Your kidneys are starting to show some damage from the diabetes.",
    instructions: "1. Check your blood sugar every morning before eating and after meals. Write it down.\n2. Take all your medicines every day at the same time.\n3. Eat smaller meals with less bread, rice, pasta, and sugar.\n4. Walk or exercise for about 30 minutes, 5 days a week.\n5. Go to all your doctor appointments.\n6. Watch for signs that your blood sugar is too low (shaking, sweating, confusion).\n7. Check your feet every day for cuts or sores. Wear shoes that fit well.\n8. Get your eyes checked once a year.",
    warnings: "Go to the ER or call 911 if:\n- Blood sugar over 400 or under 70\n- You feel very confused\n- You keep throwing up\n- Your breath smells fruity\n- You have chest pain or can't breathe\n- Your vision suddenly changes\n- One side of your face droops, arm is weak, or you can't speak clearly",
    medications: [
      { name: "Metformin", dose: "500 mg", frequency: "Twice a day", instructions: "Take with food" },
      { name: "Glipizide", dose: "5 mg", frequency: "Once daily before breakfast", instructions: "Can cause low blood sugar - carry a snack" },
      { name: "Lisinopril", dose: "10 mg", frequency: "Once daily", instructions: "For blood pressure" },
    ],
    appointments: [
      { purpose: "Diabetes follow-up", date: "March 5, 2026", time: "10:00 AM", location: "Riverside Health, 456 Health Ave" },
      { purpose: "Lab work (A1C, kidney)", date: "March 3, 2026", time: "8:00 AM", location: "Quest Diagnostics" },
    ],
  },
  translated: {
    diagnosis: "Usted vino al hospital porque su azúcar en la sangre estaba muy alta. Su azúcar en la sangre ha estado alta por mucho tiempo. También tiene presión arterial alta. Sus riñones están empezando a mostrar algo de daño por la diabetes.",
    instructions: "1. Revise su azúcar en la sangre cada mañana antes de comer y después de las comidas. Anótelo.\n2. Tome todas sus medicinas todos los días a la misma hora.\n3. Coma comidas más pequeñas con menos pan, arroz, pasta y azúcar.\n4. Camine o haga ejercicio durante unos 30 minutos, 5 días a la semana.\n5. Vaya a todas sus citas con el doctor.\n6. Esté atenta a señales de que su azúcar está muy baja (temblores, sudoración, confusión).\n7. Revise sus pies todos los días buscando cortadas o llagas. Use zapatos que le queden bien.\n8. Hágase un examen de los ojos una vez al año.",
    warnings: "Vaya a la sala de emergencias o llame al 911 si:\n- Azúcar en la sangre mayor de 400 o menor de 70\n- Se siente muy confundida\n- Sigue vomitando\n- Su aliento huele a fruta\n- Tiene dolor en el pecho o no puede respirar\n- Su visión cambia de repente\n- Un lado de su cara se cae, un brazo está débil o no puede hablar claramente",
    medications: [
      { name: "Metformina", dose: "500 mg", frequency: "Dos veces al día", instructions: "Tómela con comida" },
      { name: "Glipizida", dose: "5 mg", frequency: "Una vez al día antes del desayuno", instructions: "Puede causar azúcar baja - lleve un bocadillo" },
      { name: "Lisinopril", dose: "10 mg", frequency: "Una vez al día", instructions: "Para la presión arterial" },
    ],
    appointments: [
      { purpose: "Seguimiento de diabetes", date: "5 de marzo de 2026", time: "10:00 AM", location: "Riverside Health, 456 Health Ave" },
      { purpose: "Análisis de laboratorio (A1C, riñón)", date: "3 de marzo de 2026", time: "8:00 AM", location: "Quest Diagnostics" },
    ],
  },
};

interface Medication {
  name: string;
  dose: string;
  frequency: string;
  instructions: string;
}

interface Appointment {
  purpose: string;
  date: string;
  time: string;
  location: string;
}

export default function ExperimentInterpreter() {
  const { toast } = useToast();
  const [interpreterName, setInterpreterName] = useState("");
  const [hasEntered, setHasEntered] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [action, setAction] = useState<"approved" | "changes_requested" | null>(null);

  const [editedDiagnosis, setEditedDiagnosis] = useState(SAMPLE_CARE_PLAN.translated.diagnosis);
  const [editedInstructions, setEditedInstructions] = useState(SAMPLE_CARE_PLAN.translated.instructions);
  const [editedWarnings, setEditedWarnings] = useState(SAMPLE_CARE_PLAN.translated.warnings);
  const [editedMedications, setEditedMedications] = useState<Medication[]>(
    SAMPLE_CARE_PLAN.translated.medications.map(m => ({ ...m }))
  );
  const [editedAppointments, setEditedAppointments] = useState<Appointment[]>(
    SAMPLE_CARE_PLAN.translated.appointments.map(a => ({ ...a }))
  );
  const [reviewNotes, setReviewNotes] = useState("");

  const handleEnter = () => {
    if (!interpreterName.trim()) return;
    setHasEntered(true);
  };

  const handleApprove = () => {
    setAction("approved");
    setSubmitted(true);
    toast({ title: "Translation Approved", description: "Changes stored in sandbox only (not persisted)." });
  };

  const handleRequestChanges = () => {
    if (!reviewNotes.trim()) {
      toast({ title: "Notes required", description: "Please describe what changes are needed.", variant: "destructive" });
      return;
    }
    setAction("changes_requested");
    setSubmitted(true);
    toast({ title: "Changes Requested", description: "Feedback stored in sandbox only (not persisted)." });
  };

  const handleReset = () => {
    setSubmitted(false);
    setAction(null);
    setEditedDiagnosis(SAMPLE_CARE_PLAN.translated.diagnosis);
    setEditedInstructions(SAMPLE_CARE_PLAN.translated.instructions);
    setEditedWarnings(SAMPLE_CARE_PLAN.translated.warnings);
    setEditedMedications(SAMPLE_CARE_PLAN.translated.medications.map(m => ({ ...m })));
    setEditedAppointments(SAMPLE_CARE_PLAN.translated.appointments.map(a => ({ ...a })));
    setReviewNotes("");
  };

  if (!hasEntered) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background">
        <div className="bg-amber-500 text-amber-950 text-center py-2 px-4 text-sm font-medium flex items-center justify-center gap-2">
          <FlaskConical className="h-4 w-4" />
          Experiment: Interpreter Sandbox
        </div>
        <div className="flex items-center justify-center min-h-[calc(100vh-2.5rem)] p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Languages className="h-8 w-8 text-primary" />
              </div>
              <CardTitle>Interpreter Review Sandbox</CardTitle>
              <CardDescription>
                Enter your name to begin reviewing a sample translation. All edits stay in your browser and are not saved anywhere.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="interpreter-name">Your Name</Label>
                <Input
                  id="interpreter-name"
                  placeholder="e.g., Luis Reyes"
                  value={interpreterName}
                  onChange={(e) => setInterpreterName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleEnter()}
                  data-testid="input-interpreter-name"
                />
              </div>
              <Button className="w-full" onClick={handleEnter} disabled={!interpreterName.trim()} data-testid="button-enter-sandbox">
                Enter Sandbox
              </Button>
              <Link href="/experiments">
                <Button variant="ghost" className="w-full" data-testid="button-back-experiments">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Experiments
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background">
        <div className="bg-amber-500 text-amber-950 text-center py-2 px-4 text-sm font-medium flex items-center justify-center gap-2">
          <FlaskConical className="h-4 w-4" />
          Experiment: Interpreter Sandbox
        </div>
        <div className="flex items-center justify-center min-h-[calc(100vh-2.5rem)] p-4">
          <Card className="w-full max-w-md text-center">
            <CardContent className="pt-8 pb-8 space-y-4">
              <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto ${
                action === "approved" ? "bg-green-100 dark:bg-green-900/30" : "bg-yellow-100 dark:bg-yellow-900/30"
              }`}>
                {action === "approved" ? (
                  <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
                ) : (
                  <AlertTriangle className="h-10 w-10 text-yellow-600 dark:text-yellow-400" />
                )}
              </div>
              <h2 className="text-2xl font-semibold">
                {action === "approved" ? "Translation Approved" : "Changes Requested"}
              </h2>
              <p className="text-muted-foreground">
                {action === "approved"
                  ? "Your approval has been recorded in this sandbox session. In the real workflow, the care plan would now be sent to the patient."
                  : "Your feedback has been recorded in this sandbox session. In the real workflow, the clinician would be notified to address your concerns."}
              </p>
              {reviewNotes && (
                <div className="p-3 bg-muted rounded-lg text-left text-sm">
                  <p className="font-medium mb-1">Your Notes:</p>
                  <p className="text-muted-foreground">{reviewNotes}</p>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                No data was saved to the database. This sandbox is fully isolated.
              </p>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1" onClick={handleReset} data-testid="button-review-again">
                  Review Again
                </Button>
                <Link href="/experiments" className="flex-1">
                  <Button variant="outline" className="w-full" data-testid="button-back-experiments">
                    Back to Experiments
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-amber-500 text-amber-950 text-center py-2 px-4 text-sm font-medium flex items-center justify-center gap-2">
        <FlaskConical className="h-4 w-4" />
        Experiment: Interpreter Sandbox — Changes are NOT saved
      </div>

      <header className="sticky top-0 z-50 border-b bg-card">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-3">
              <Link href="/experiments">
                <Button variant="ghost" size="icon" data-testid="button-back-experiments">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="font-semibold">Translation Review</h1>
                  <Badge variant="secondary">Spanish</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Patient: {SAMPLE_CARE_PLAN.patientName} | Clinician: {SAMPLE_CARE_PLAN.clinicianName} | Reviewer: {interpreterName}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleRequestChanges} data-testid="button-request-changes">
                <AlertTriangle className="h-4 w-4 mr-1" />
                Request Changes
              </Button>
              <Button size="sm" onClick={handleApprove} data-testid="button-approve">
                <CheckCircle2 className="h-4 w-4 mr-1" />
                Approve
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Column 1: Original */}
          <div className="space-y-4">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Original
            </h2>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Diagnosis</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{SAMPLE_CARE_PLAN.original.diagnosis}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Instructions</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{SAMPLE_CARE_PLAN.original.instructions}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-destructive">Warnings</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{SAMPLE_CARE_PLAN.original.warnings}</p>
              </CardContent>
            </Card>
          </div>

          {/* Column 2: Simplified (English) */}
          <div className="space-y-4">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Simplified (English)
            </h2>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Diagnosis</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{SAMPLE_CARE_PLAN.simplified.diagnosis}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Instructions</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{SAMPLE_CARE_PLAN.simplified.instructions}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-destructive">Warnings</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{SAMPLE_CARE_PLAN.simplified.warnings}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Pill className="h-4 w-4" />
                  Medications
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {SAMPLE_CARE_PLAN.simplified.medications.map((med, i) => (
                  <div key={i} className="p-3 bg-muted/50 rounded-lg text-sm">
                    <p className="font-medium">{med.name} — {med.dose}</p>
                    <p className="text-muted-foreground">{med.frequency}</p>
                    <p className="text-muted-foreground text-xs mt-1">{med.instructions}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Appointments
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {SAMPLE_CARE_PLAN.simplified.appointments.map((apt, i) => (
                  <div key={i} className="p-3 bg-muted/50 rounded-lg text-sm">
                    <p className="font-medium">{apt.purpose}</p>
                    <p className="text-muted-foreground">{apt.date} at {apt.time}</p>
                    <p className="text-muted-foreground text-xs">{apt.location}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Column 3: Translated (Editable) */}
          <div className="space-y-4">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Languages className="h-4 w-4" />
              Translated (Spanish) — Editable
            </h2>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Diagnóstico</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={editedDiagnosis}
                  onChange={(e) => setEditedDiagnosis(e.target.value)}
                  className="text-sm min-h-[100px]"
                  data-testid="textarea-translated-diagnosis"
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Instrucciones</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={editedInstructions}
                  onChange={(e) => setEditedInstructions(e.target.value)}
                  className="text-sm min-h-[180px]"
                  data-testid="textarea-translated-instructions"
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-destructive">Advertencias</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={editedWarnings}
                  onChange={(e) => setEditedWarnings(e.target.value)}
                  className="text-sm min-h-[140px]"
                  data-testid="textarea-translated-warnings"
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Pill className="h-4 w-4" />
                  Medicamentos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {editedMedications.map((med, i) => (
                  <div key={i} className="p-3 bg-muted/50 rounded-lg space-y-2">
                    <Input
                      value={med.name}
                      onChange={(e) => {
                        const updated = [...editedMedications];
                        updated[i] = { ...updated[i], name: e.target.value };
                        setEditedMedications(updated);
                      }}
                      className="text-sm"
                      data-testid={`input-med-name-${i}`}
                    />
                    <div className="flex gap-2">
                      <Input
                        value={med.dose}
                        onChange={(e) => {
                          const updated = [...editedMedications];
                          updated[i] = { ...updated[i], dose: e.target.value };
                          setEditedMedications(updated);
                        }}
                        className="text-sm flex-1"
                        data-testid={`input-med-dose-${i}`}
                      />
                      <Input
                        value={med.frequency}
                        onChange={(e) => {
                          const updated = [...editedMedications];
                          updated[i] = { ...updated[i], frequency: e.target.value };
                          setEditedMedications(updated);
                        }}
                        className="text-sm flex-1"
                        data-testid={`input-med-frequency-${i}`}
                      />
                    </div>
                    <Input
                      value={med.instructions}
                      onChange={(e) => {
                        const updated = [...editedMedications];
                        updated[i] = { ...updated[i], instructions: e.target.value };
                        setEditedMedications(updated);
                      }}
                      className="text-sm"
                      data-testid={`input-med-instructions-${i}`}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Citas
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {editedAppointments.map((apt, i) => (
                  <div key={i} className="p-3 bg-muted/50 rounded-lg space-y-2">
                    <Input
                      value={apt.purpose}
                      onChange={(e) => {
                        const updated = [...editedAppointments];
                        updated[i] = { ...updated[i], purpose: e.target.value };
                        setEditedAppointments(updated);
                      }}
                      className="text-sm"
                      data-testid={`input-apt-purpose-${i}`}
                    />
                    <div className="flex gap-2">
                      <Input
                        value={apt.date}
                        onChange={(e) => {
                          const updated = [...editedAppointments];
                          updated[i] = { ...updated[i], date: e.target.value };
                          setEditedAppointments(updated);
                        }}
                        className="text-sm flex-1"
                        data-testid={`input-apt-date-${i}`}
                      />
                      <Input
                        value={apt.time}
                        onChange={(e) => {
                          const updated = [...editedAppointments];
                          updated[i] = { ...updated[i], time: e.target.value };
                          setEditedAppointments(updated);
                        }}
                        className="text-sm flex-1"
                        data-testid={`input-apt-time-${i}`}
                      />
                    </div>
                    <Input
                      value={apt.location}
                      onChange={(e) => {
                        const updated = [...editedAppointments];
                        updated[i] = { ...updated[i], location: e.target.value };
                        setEditedAppointments(updated);
                      }}
                      className="text-sm"
                      data-testid={`input-apt-location-${i}`}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Review Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Add notes about this translation (optional for approval, required for requesting changes)..."
                  className="text-sm min-h-[80px]"
                  data-testid="textarea-review-notes"
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
