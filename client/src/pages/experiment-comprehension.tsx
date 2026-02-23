import { useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Heart,
  Pill,
  Calendar,
  AlertTriangle,
  Check,
  Languages,
  Volume2,
  VolumeX,
  Clock,
  MapPin,
  Phone,
  FlaskConical,
} from "lucide-react";
import { formatContent } from "@/lib/utils";
import CarePlanChatbot from "@/components/care-plan-chatbot";

const SAMPLE_CARE_PLAN = {
  patientName: "Maria Garcia",
  en: {
    diagnosis:
      "You have pneumonia in the lower part of your right lung. This kind of pneumonia is called community-acquired pneumonia. You also have mild asthma that comes and goes, and allergies from seasons like springtime. When you came to the hospital, your oxygen was low, but it's better now. You were discharged from the hospital on Feb 18th and should follow the instructions below.",
    instructions:
      "1. Rest but increase your activity a little bit when you feel stronger.\n2. Sleep with your head raised to help you breathe.\n3. Drink 6–8 glasses of water each day. Avoid alcohol until you finish all of your antibiotics.\n4. Do breathing exercises three times a day to help your lungs. Breathe slowly through your nose for 4 seconds, hold for 2 seconds, then exhale slowly through your mouth for 6 seconds. Repeat ten times.\n5. Only go back to work or heavy activities when the doctor says it's okay.\n6. Stay away from cigarette smoke, dust, and strong smells while you are recovering.\n7. Call your doctor or go to the hospital if your symptoms get worse or you are not getting better.",
    warnings:
      "1. Call 911 or go to the emergency room right away for:\n- Severe shortness of breath while resting.\n- Blue or grey lips or fingers.\n- Sharp chest pain that moves to your arm or jaw.\n- Fever over 39.5°C that doesn't go down with medicine.\n- Coughing up a lot of blood.\n- Feeling confused or passing out.\n\n2. Call your doctor if:\n- You still have a fever over 38°C after 2 days on antibiotics.\n- You get a rash or reaction to medicine.\n- Your wheezing does not stop even after using an inhaler.\n- Your cough gets worse or you have other new symptoms like swelling in your leg.",
    medications: [
      {
        name: "Azithromycin",
        dose: "250 mg",
        frequency: "Once daily",
        instructions:
          "1. Take 1 tablet every day at the same time.\n2. You can take it with or without food.\n3. Take all 4 days of medicine. Do not stop early, even if you feel better.\n4. Do not take antacids with aluminum or magnesium for 1 hour before or 2 hours after this medicine.\n5. Call your doctor if you have bad diarrhea or blood in your poop.",
      },
      {
        name: "Prednisone",
        dose: "40 mg",
        frequency: "Once daily (morning, with food)",
        instructions:
          "1. Take 1 tablet in the morning with food or milk.\n2. Take it for 3 days exactly and finish all doses.\n3. Do not take it on an empty stomach.",
      },
      {
        name: "Salbutamol",
        dose: "2 puffs (90mcg/puff)",
        frequency: "Every 4–6 hours as needed",
        instructions:
          "1. Shake the inhaler well before each use.\n2. Breathe out fully.\n3. Inhale 2 puffs slowly and hold your breath for 10 seconds each time.\n4. Wait 1 minute between each puff.\n5. Rinse your mouth after using the inhaler if you experience discomfort in your throat.\n6. Go to the emergency room if you use more than 8 puffs in 24 hours and still feel bad, or if your symptoms do not get better in 20 minutes.\n7. Do not use the inhaler too much.",
      },
      {
        name: "Cetirizine",
        dose: "10 mg",
        frequency: "Once daily",
        instructions:
          "1. Take 1 tablet every day at the same time.\n2. You can take it with or without food.\n3. This medicine can make you sleepy. Do not drive or use machines if you feel sleepy.\n4. Do not drink alcohol while on this medicine because it will make you drowsier.",
      },
    ],
    appointments: [
      {
        purpose:
          "Appointment 1: You need a check-up after pneumonia in your GP clinic. The doctor will make sure you are better, look at your chest X-ray, check that you have taken all your antibiotics, ask if you have symptoms, and go over your asthma plan.",
        date: "On or before February 28, 2026",
        time: "To be confirmed",
        location: "General Doctor (GP)",
        phone: "(555) 204-9300 (Call GP to book)",
      },
      {
        purpose:
          "Appointment 2: You need to check your breathing and asthma in an outpatient respiratory clinic. The doctor will do tests to see how your lungs work and decide if you need long-term asthma medicine.",
        date: "To be confirmed within 4-6 weeks",
        time: "To be scheduled",
        location: "Lung Clinic (Outpatient Respiratory Clinic)",
        phone: "(555) 204-7700 (Contact number if not called by March 7)",
      },
    ],
  },
  es: {
    diagnosis:
      "Usted tiene neumonía en la parte baja de su pulmón derecho. Este tipo de neumonía se llama neumonía adquirida en la comunidad. También tiene asma leve que va y viene, y alergias estacionales como en la primavera. Cuando llegó al hospital, su oxígeno estaba bajo, pero ahora está mejor. Fue dada de alta del hospital el 18 de febrero y debe seguir las instrucciones a continuación.",
    instructions:
      "1. Descanse, pero aumente su actividad poco a poco cuando se sienta más fuerte.\n2. Duerma con la cabeza elevada para respirar mejor.\n3. Tome de 6 a 8 vasos de agua al día. No tome alcohol hasta terminar todos los antibióticos.\n4. Haga ejercicios de respiración tres veces al día. Respire lentamente por la nariz durante 4 segundos, sostenga por 2 segundos, luego exhale lentamente por la boca durante 6 segundos. Repita diez veces.\n5. Vuelva al trabajo o a actividades pesadas solo cuando el doctor se lo permita.\n6. Manténgase alejado del humo de cigarrillo, el polvo y los olores fuertes mientras se recupera.\n7. Llame a su doctor o vaya al hospital si sus síntomas empeoran o no mejora.",
    warnings:
      "1. Llame al 911 o vaya a la sala de emergencias de inmediato si:\n- Tiene dificultad grave para respirar estando en reposo.\n- Sus labios o dedos se ponen azules o grises.\n- Tiene dolor agudo en el pecho que se extiende al brazo o la mandíbula.\n- Tiene fiebre de más de 39.5°C que no baja con medicina.\n- Tose mucha sangre.\n- Se siente confundido o se desmaya.\n\n2. Llame a su doctor si:\n- Todavía tiene fiebre de más de 38°C después de 2 días con antibióticos.\n- Le sale un sarpullido o tiene una reacción a la medicina.\n- Su silbido al respirar no se detiene después de usar el inhalador.\n- Su tos empeora o tiene síntomas nuevos como hinchazón en la pierna.",
    medications: [
      {
        name: "Azitromicina",
        dose: "250 mg",
        frequency: "Una vez al día",
        instructions:
          "1. Tome 1 tableta todos los días a la misma hora.\n2. Puede tomarla con o sin comida.\n3. Tome los 4 días completos de medicina. No deje de tomarla antes, aunque se sienta mejor.\n4. No tome antiácidos con aluminio o magnesio 1 hora antes o 2 horas después de esta medicina.\n5. Llame a su doctor si tiene diarrea fuerte o sangre en las heces.",
      },
      {
        name: "Prednisona",
        dose: "40 mg",
        frequency: "Una vez al día (mañana, con comida)",
        instructions:
          "1. Tome 1 tableta por la mañana con comida o leche.\n2. Tómela exactamente por 3 días y termine todas las dosis.\n3. No la tome con el estómago vacío.",
      },
      {
        name: "Salbutamol",
        dose: "2 inhalaciones (90mcg/inhalación)",
        frequency: "Cada 4–6 horas según sea necesario",
        instructions:
          "1. Agite bien el inhalador antes de cada uso.\n2. Exhale completamente.\n3. Inhale 2 veces lentamente y sostenga la respiración por 10 segundos cada vez.\n4. Espere 1 minuto entre cada inhalación.\n5. Enjuague su boca después de usar el inhalador si siente molestia en la garganta.\n6. Vaya a la sala de emergencias si usa más de 8 inhalaciones en 24 horas y aún se siente mal, o si sus síntomas no mejoran en 20 minutos.\n7. No use el inhalador en exceso.",
      },
      {
        name: "Cetirizina",
        dose: "10 mg",
        frequency: "Una vez al día",
        instructions:
          "1. Tome 1 tableta todos los días a la misma hora.\n2. Puede tomarla con o sin comida.\n3. Esta medicina puede causar sueño. No conduzca ni use máquinas si tiene sueño.\n4. No beba alcohol mientras toma esta medicina porque le dará más sueño.",
      },
    ],
    appointments: [
      {
        purpose:
          "Cita 1: Necesita un control después de la neumonía en su clínica de médico general. El doctor verificará que esté mejor, revisará su radiografía de pecho, confirmará que tomó todos los antibióticos, preguntará por sus síntomas y revisará su plan de asma.",
        date: "En o antes del 28 de febrero de 2026",
        time: "Por confirmar",
        location: "Médico General",
        phone: "(555) 204-9300 (Llame al médico general para agendar)",
      },
      {
        purpose:
          "Cita 2: Necesita revisar su respiración y asma en una clínica respiratoria ambulatoria. El doctor hará pruebas para ver cómo funcionan sus pulmones y decidirá si necesita medicina para el asma a largo plazo.",
        date: "Por confirmar dentro de 4-6 semanas",
        time: "Por agendar",
        location: "Clínica Pulmonar (Clínica Respiratoria Ambulatoria)",
        phone:
          "(555) 204-7700 (Número de contacto si no le llaman antes del 7 de marzo)",
      },
    ],
  },
};

export default function ExperimentComprehension() {
  const [showEnglish, setShowEnglish] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const isTTSSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  const lang = showEnglish ? "en" : "es";
  const content = SAMPLE_CARE_PLAN[lang];
  const uiLang = showEnglish ? "en" : "es";

  const ui = {
    en: {
      yourCarePlan: "Your Care Plan",
      whatsWrong: "What's Wrong",
      whatToDo: "What to Do",
      warningSigns: "Warning Signs",
      warningSubtitle: "Watch for these signs and act quickly:",
      medications: "Your Medicines",
      appointments: "Your Appointments",
      readAloud: "Read Aloud",
      stopReading: "Stop Reading",
    },
    es: {
      yourCarePlan: "Su Plan de Cuidado",
      whatsWrong: "¿Qué Está Mal?",
      whatToDo: "Qué Hacer",
      warningSigns: "Señales de Advertencia",
      warningSubtitle: "Esté atento a estas señales y actúe rápidamente:",
      medications: "Sus Medicinas",
      appointments: "Sus Citas",
      readAloud: "Leer en Voz Alta",
      stopReading: "Dejar de Leer",
    },
  };

  const t = ui[uiLang];

  const speakSection = useCallback(
    (text: string) => {
      if (!text || !isTTSSupported) return;
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = showEnglish ? "en-US" : "es-ES";
      utterance.rate = 0.9;
      const voices = window.speechSynthesis.getVoices();
      const matchingVoice = voices.find((v) =>
        v.lang.startsWith(showEnglish ? "en" : "es"),
      );
      if (matchingVoice) utterance.voice = matchingVoice;
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      setIsSpeaking(true);
      window.speechSynthesis.speak(utterance);
    },
    [showEnglish, isTTSSupported],
  );

  const speakAll = useCallback(() => {
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }
    const allText = [
      content.diagnosis,
      content.medications
        .map((m) => `${m.name}, ${m.dose}, ${m.frequency}. ${m.instructions}`)
        .join(" "),
      content.instructions,
      content.warnings,
    ].join(". ");
    speakSection(allText);
  }, [content, isSpeaking, speakSection]);

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-amber-500 text-amber-950 text-center py-2 px-4 text-sm font-medium flex items-center justify-center gap-2">
        <FlaskConical className="h-4 w-4" />
        Experiment: Comprehension Evaluation
      </div>

      <header className="sticky top-0 z-50 bg-primary text-primary-foreground">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div>
                <h1 className="text-xl font-semibold">{t.yourCarePlan}</h1>
                <p className="text-primary-foreground/80 text-sm">
                  {SAMPLE_CARE_PLAN.patientName}
                </p>
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowEnglish(!showEnglish)}
              className="gap-2"
              data-testid="button-toggle-language"
            >
              <Languages className="h-4 w-4" />
              {showEnglish ? "English" : "Español"}
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4 pb-24">
        {content.diagnosis && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Heart className="h-5 w-5 text-primary" />
                  {t.whatsWrong}
                </div>
                {isTTSSupported && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => speakSection(content.diagnosis)}
                    data-testid="button-speak-diagnosis"
                    className="h-8 w-8"
                  >
                    <Volume2 className="h-4 w-4" />
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg leading-relaxed">{content.diagnosis}</p>
            </CardContent>
          </Card>
        )}

        {content.medications.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Pill className="h-5 w-5 text-primary" />
                  {t.medications}
                </div>
                {isTTSSupported && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      speakSection(
                        content.medications
                          .map(
                            (m) =>
                              `${m.name}, ${m.dose}, ${m.frequency}. ${m.instructions}`,
                          )
                          .join(" "),
                      )
                    }
                    data-testid="button-speak-medications"
                    className="h-8 w-8"
                  >
                    <Volume2 className="h-4 w-4" />
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {content.medications.map((med, index) => (
                <div key={index} className="p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
                    <h4 className="font-semibold text-lg">{med.name}</h4>
                    <Badge variant="outline">{med.dose}</Badge>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground mb-2">
                    <Clock className="h-4 w-4" />
                    <span>{med.frequency}</span>
                  </div>
                  {med.instructions &&
                    (() => {
                      const lines = med.instructions
                        .split("\n")
                        .map((l: string) => l.replace(/^\d+\.\s*/, "").trim())
                        .filter(Boolean);
                      if (lines.length <= 1)
                        return (
                          <p className="text-sm text-muted-foreground mt-1">
                            {lines[0] || ""}
                          </p>
                        );
                      return (
                        <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-1 mt-1">
                          {lines.map((l: string, i: number) => (
                            <li key={i}>{l}</li>
                          ))}
                        </ol>
                      );
                    })()}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {content.appointments.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                {t.appointments}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {content.appointments.map((apt, index) => (
                <div key={index} className="p-4 bg-muted/50 rounded-lg">
                  <h4 className="font-semibold text-lg mb-2">{apt.purpose}</h4>
                  <div className="space-y-2 text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      <span>
                        {apt.date} at {apt.time}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      <span>{apt.location}</span>
                    </div>
                    {(apt as any).phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4" />
                        <span>{(apt as any).phone}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {content.instructions && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Check className="h-5 w-5 text-primary" />
                  {t.whatToDo}
                </div>
                {isTTSSupported && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => speakSection(content.instructions)}
                    data-testid="button-speak-instructions"
                    className="h-8 w-8"
                  >
                    <Volume2 className="h-4 w-4" />
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="prose prose-lg dark:prose-invert max-w-none">
                <p className="whitespace-pre-wrap leading-relaxed">
                  {formatContent(content.instructions)}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {content.warnings && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center justify-between gap-2 text-destructive">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  {t.warningSigns}
                </div>
                {isTTSSupported && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => speakSection(content.warnings)}
                    data-testid="button-speak-warnings"
                    className="h-8 w-8 text-destructive"
                  >
                    <Volume2 className="h-4 w-4" />
                  </Button>
                )}
              </CardTitle>
              <CardDescription>{t.warningSubtitle}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="prose prose-lg dark:prose-invert max-w-none">
                <p className="whitespace-pre-wrap leading-relaxed text-destructive/90">
                  {formatContent(content.warnings)}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="space-y-3">
          <Button
            variant="outline"
            className="w-full h-14 text-lg gap-3"
            onClick={speakAll}
            disabled={!isTTSSupported}
            data-testid="button-read-aloud"
          >
            {isSpeaking ? (
              <>
                <VolumeX className="h-5 w-5" />
                {t.stopReading}
              </>
            ) : (
              <>
                <Volume2 className="h-5 w-5" />
                {t.readAloud}
              </>
            )}
          </Button>
        </div>
      </main>

      {/* Chatbot FAB */}
      <CarePlanChatbot
        apiEndpoint="/api/experiments/chat"
        language={showEnglish ? "en" : "es"}
        carePlanContext={{
          diagnosis: content.diagnosis,
          instructions: content.instructions,
          warnings: content.warnings,
          medications: content.medications,
          appointments: content.appointments,
        }}
      />
    </div>
  );
}
