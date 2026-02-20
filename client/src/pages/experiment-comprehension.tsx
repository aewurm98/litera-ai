import { useState, useCallback, useEffect, useRef } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  ArrowLeft,
  Send,
  Loader2,
  MessageCircle,
  X,
  FlaskConical,
} from "lucide-react";

const SAMPLE_CARE_PLAN = {
  patientName: "Maria Garcia",
  en: {
    diagnosis: "You came to the hospital because you had high blood sugar and were feeling very tired, thirsty, and dizzy. Your blood sugar was 450 mg/dL, which is much higher than normal. You have Type 2 Diabetes, which means your body has trouble using sugar from food for energy. We have started you on medicine to help bring your blood sugar down.",
    instructions: "1. Check your blood sugar every morning before eating and write it down in a log.\n2. Take your medicine at the same time every day.\n3. Eat small meals throughout the day instead of big meals.\n4. Avoid sugary drinks like soda, juice, and sweet tea. Drink water instead.\n5. Try to walk for 15-20 minutes each day.\n6. Keep your follow-up appointments.\n7. Wear a medical ID bracelet that says you have diabetes.",
    warnings: "Go to the emergency room or call 911 right away if:\n- Your blood sugar is above 400 or below 70\n- You feel very confused or cannot think clearly\n- You are throwing up and cannot keep fluids down\n- You feel like you might pass out\n- You have chest pain or trouble breathing\n- You have blurry vision that does not go away",
    medications: [
      { name: "Metformin", dose: "500 mg", frequency: "Twice a day (morning and evening)", instructions: "Take with food to avoid stomach upset. Do not drink alcohol while taking this medicine." },
      { name: "Glipizide", dose: "5 mg", frequency: "Once a day (morning)", instructions: "Take 30 minutes before breakfast. This medicine can make your blood sugar go too low, so always carry a snack." },
      { name: "Lisinopril", dose: "10 mg", frequency: "Once a day", instructions: "For blood pressure. Take at the same time every day. Report any swelling of face or tongue." },
    ],
    appointments: [
      { purpose: "Diabetes follow-up", date: "March 5, 2026", time: "10:00 AM", location: "Riverside Community Health, 456 Health Ave" },
      { purpose: "Lab work (A1C and kidney function)", date: "March 3, 2026", time: "8:00 AM", location: "Quest Diagnostics, 789 Lab Blvd" },
    ],
  },
  es: {
    diagnosis: "Usted vino al hospital porque tenía el azúcar en la sangre muy alta y se sentía muy cansada, con mucha sed y mareos. Su azúcar en la sangre era de 450 mg/dL, que es mucho más alto de lo normal. Usted tiene Diabetes Tipo 2, lo que significa que su cuerpo tiene problemas para usar el azúcar de los alimentos como energía. Le hemos comenzado a dar medicinas para ayudar a bajar su azúcar en la sangre.",
    instructions: "1. Revise su azúcar en la sangre cada mañana antes de comer y anótelo en un registro.\n2. Tome su medicina a la misma hora todos los días.\n3. Coma comidas pequeñas durante el día en vez de comidas grandes.\n4. Evite las bebidas azucaradas como refrescos, jugos y té dulce. Tome agua en su lugar.\n5. Trate de caminar de 15 a 20 minutos cada día.\n6. Vaya a todas sus citas de seguimiento.\n7. Use un brazalete de identificación médica que diga que tiene diabetes.",
    warnings: "Vaya a la sala de emergencias o llame al 911 de inmediato si:\n- Su azúcar en la sangre está por encima de 400 o por debajo de 70\n- Se siente muy confundida o no puede pensar con claridad\n- Está vomitando y no puede retener líquidos\n- Siente que se va a desmayar\n- Tiene dolor en el pecho o dificultad para respirar\n- Tiene visión borrosa que no se quita",
    medications: [
      { name: "Metformina", dose: "500 mg", frequency: "Dos veces al día (mañana y noche)", instructions: "Tómela con comida para evitar malestar estomacal. No beba alcohol mientras toma esta medicina." },
      { name: "Glipizida", dose: "5 mg", frequency: "Una vez al día (mañana)", instructions: "Tómela 30 minutos antes del desayuno. Esta medicina puede hacer que su azúcar baje demasiado, así que siempre lleve un bocadillo." },
      { name: "Lisinopril", dose: "10 mg", frequency: "Una vez al día", instructions: "Para la presión arterial. Tómela a la misma hora todos los días. Informe si tiene hinchazón de la cara o la lengua." },
    ],
    appointments: [
      { purpose: "Seguimiento de diabetes", date: "5 de marzo de 2026", time: "10:00 AM", location: "Riverside Community Health, 456 Health Ave" },
      { purpose: "Análisis de laboratorio (A1C y función renal)", date: "3 de marzo de 2026", time: "8:00 AM", location: "Quest Diagnostics, 789 Lab Blvd" },
    ],
  },
};

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function formatContent(content: string): string {
  return content;
}

export default function ExperimentComprehension() {
  const [showEnglish, setShowEnglish] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const isTTSSupported = typeof window !== "undefined" && "speechSynthesis" in window;

  const lang = showEnglish ? "en" : "es";
  const content = SAMPLE_CARE_PLAN[lang];
  const uiLang = showEnglish ? "en" : "es";

  const ui = {
    en: {
      yourCarePlan: "Your Care Plan",
      whatsWrong: "What's Wrong",
      whatToDo: "What to Do",
      warningSigns: "Warning Signs",
      warningSubtitle: "Go to the emergency room or call 911 if you have any of these:",
      medications: "Your Medications",
      appointments: "Your Appointments",
      readAloud: "Read Aloud",
      stopReading: "Stop Reading",
      askQuestion: "Ask a question about your care plan...",
      chatTitle: "Ask About Your Care Plan",
      chatWelcome: "Hi! I can help you understand your care plan. Ask me anything about your medications, appointments, or instructions.",
    },
    es: {
      yourCarePlan: "Su Plan de Cuidado",
      whatsWrong: "¿Qué Está Mal?",
      whatToDo: "Qué Hacer",
      warningSigns: "Señales de Advertencia",
      warningSubtitle: "Vaya a la sala de emergencias o llame al 911 si tiene alguno de estos:",
      medications: "Sus Medicamentos",
      appointments: "Sus Citas",
      readAloud: "Leer en Voz Alta",
      stopReading: "Dejar de Leer",
      askQuestion: "Haga una pregunta sobre su plan de cuidado...",
      chatTitle: "Pregunte Sobre Su Plan de Cuidado",
      chatWelcome: "¡Hola! Puedo ayudarle a entender su plan de cuidado. Pregúnteme cualquier cosa sobre sus medicinas, citas o instrucciones.",
    },
  };

  const t = ui[uiLang];

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const speakSection = useCallback((text: string) => {
    if (!text || !isTTSSupported) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = showEnglish ? "en-US" : "es-ES";
    utterance.rate = 0.9;
    const voices = window.speechSynthesis.getVoices();
    const matchingVoice = voices.find(v => v.lang.startsWith(showEnglish ? "en" : "es"));
    if (matchingVoice) utterance.voice = matchingVoice;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }, [showEnglish, isTTSSupported]);

  const speakAll = useCallback(() => {
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }
    const allText = [content.diagnosis, content.medications.map(m => `${m.name}, ${m.dose}, ${m.frequency}. ${m.instructions}`).join(" "), content.instructions, content.warnings].join(". ");
    speakSection(allText);
  }, [content, isSpeaking, speakSection]);

  const handleChatSend = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    const newMessages: ChatMessage[] = [...chatMessages, { role: "user", content: userMsg }];
    setChatMessages(newMessages);
    setChatLoading(true);

    try {
      const response = await fetch("/api/experiments/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: userMsg,
          language: showEnglish ? "English" : "Spanish",
          carePlanContext: {
            diagnosis: content.diagnosis,
            instructions: content.instructions,
            warnings: content.warnings,
            medications: content.medications,
            appointments: content.appointments,
          },
        }),
      });
      const data = await response.json();
      setChatMessages([...newMessages, { role: "assistant", content: data.answer || "I'm sorry, I couldn't answer that question." }]);
    } catch {
      setChatMessages([...newMessages, { role: "assistant", content: showEnglish ? "Sorry, I had trouble answering. Please try again." : "Lo siento, tuve problemas para responder. Por favor intente de nuevo." }]);
    } finally {
      setChatLoading(false);
    }
  };

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
              <Link href="/experiments">
                <Button variant="ghost" size="icon" className="text-primary-foreground" data-testid="button-back-experiments">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-xl font-semibold">{t.yourCarePlan}</h1>
                <p className="text-primary-foreground/80 text-sm">{SAMPLE_CARE_PLAN.patientName}</p>
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
                  <Button variant="ghost" size="icon" onClick={() => speakSection(content.diagnosis)} data-testid="button-speak-diagnosis" className="h-8 w-8">
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
                  <Button variant="ghost" size="icon" onClick={() => speakSection(content.medications.map(m => `${m.name}, ${m.dose}, ${m.frequency}. ${m.instructions}`).join(" "))} data-testid="button-speak-medications" className="h-8 w-8">
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
                  {med.instructions && <p className="text-sm text-muted-foreground">{med.instructions}</p>}
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

        {content.instructions && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Check className="h-5 w-5 text-primary" />
                  {t.whatToDo}
                </div>
                {isTTSSupported && (
                  <Button variant="ghost" size="icon" onClick={() => speakSection(content.instructions)} data-testid="button-speak-instructions" className="h-8 w-8">
                    <Volume2 className="h-4 w-4" />
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="prose prose-lg dark:prose-invert max-w-none">
                <p className="whitespace-pre-wrap leading-relaxed">{formatContent(content.instructions)}</p>
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
                  <Button variant="ghost" size="icon" onClick={() => speakSection(content.warnings)} data-testid="button-speak-warnings" className="h-8 w-8 text-destructive">
                    <Volume2 className="h-4 w-4" />
                  </Button>
                )}
              </CardTitle>
              <CardDescription>{t.warningSubtitle}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="prose prose-lg dark:prose-invert max-w-none">
                <p className="whitespace-pre-wrap leading-relaxed text-destructive/90">{formatContent(content.warnings)}</p>
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
              <><VolumeX className="h-5 w-5" />{t.stopReading}</>
            ) : (
              <><Volume2 className="h-5 w-5" />{t.readAloud}</>
            )}
          </Button>
        </div>
      </main>

      {/* Chatbot FAB */}
      <button
        onClick={() => setChatOpen(!chatOpen)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg z-50"
        data-testid="button-chat-toggle"
      >
        {chatOpen ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      {/* Chat Panel */}
      {chatOpen && (
        <div className="fixed bottom-24 right-4 w-[calc(100%-2rem)] max-w-md bg-card border rounded-xl shadow-xl z-50 flex flex-col" style={{ maxHeight: "60vh" }}>
          <div className="flex items-center justify-between gap-2 p-4 border-b">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">{t.chatTitle}</h3>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setChatOpen(false)} data-testid="button-chat-close">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <ScrollArea className="flex-1 p-4" style={{ maxHeight: "calc(60vh - 8rem)" }}>
            <div className="space-y-3">
              {chatMessages.length === 0 && (
                <div className="p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
                  {t.chatWelcome}
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] p-3 rounded-lg text-sm ${
                      msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                    }`}
                    data-testid={`chat-message-${msg.role}-${i}`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="bg-muted p-3 rounded-lg">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          </ScrollArea>
          <div className="p-3 border-t flex gap-2">
            <Input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder={t.askQuestion}
              onKeyDown={(e) => e.key === "Enter" && handleChatSend()}
              disabled={chatLoading}
              data-testid="input-chat-question"
            />
            <Button size="icon" onClick={handleChatSend} disabled={chatLoading || !chatInput.trim()} data-testid="button-chat-send">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
