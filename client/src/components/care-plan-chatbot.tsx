import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageCircle, X, Send, Loader2 } from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface CarePlanContext {
  diagnosis?: string;
  instructions?: string;
  warnings?: string;
  medications?: any[];
  appointments?: any[];
}

const CHAT_UI: Record<string, { askQuestion: string; chatTitle: string; chatWelcome: string }> = {
  en: {
    askQuestion: "Ask a question about your care plan...",
    chatTitle: "Ask About Your Care Plan",
    chatWelcome: "Hi! I can help you understand your care plan. Ask me anything about your medications, appointments, or instructions.",
  },
  es: {
    askQuestion: "Haga una pregunta sobre su plan de cuidado...",
    chatTitle: "Pregunte Sobre Su Plan de Cuidado",
    chatWelcome: "¡Hola! Puedo ayudarle a entender su plan de cuidado. Pregúnteme cualquier cosa sobre sus medicinas, citas o instrucciones.",
  },
  zh: {
    askQuestion: "询问有关您护理计划的问题...",
    chatTitle: "询问您的护理计划",
    chatWelcome: "您好！我可以帮助您了解您的护理计划。请随时询问有关您的药物、预约或说明的任何问题。",
  },
  vi: {
    askQuestion: "Hỏi câu hỏi về kế hoạch chăm sóc của bạn...",
    chatTitle: "Hỏi Về Kế Hoạch Chăm Sóc",
    chatWelcome: "Xin chào! Tôi có thể giúp bạn hiểu kế hoạch chăm sóc. Hãy hỏi bất cứ điều gì về thuốc, lịch hẹn hoặc hướng dẫn.",
  },
  ar: {
    askQuestion: "اسأل سؤالاً عن خطة الرعاية...",
    chatTitle: "اسأل عن خطة الرعاية",
    chatWelcome: "مرحباً! يمكنني مساعدتك في فهم خطة الرعاية. اسألني أي شيء عن أدويتك أو مواعيدك أو تعليماتك.",
  },
  ko: {
    askQuestion: "케어 플랜에 대해 질문하세요...",
    chatTitle: "케어 플랜 문의",
    chatWelcome: "안녕하세요! 케어 플랜을 이해하는 데 도움을 드릴 수 있습니다. 약, 예약, 지침에 대해 무엇이든 물어보세요.",
  },
  tl: {
    askQuestion: "Magtanong tungkol sa iyong plano ng pangangalaga...",
    chatTitle: "Magtanong Tungkol sa Iyong Plano",
    chatWelcome: "Kumusta! Makakatulong ako sa pag-unawa ng iyong plano ng pangangalaga. Tanungin mo ako tungkol sa iyong mga gamot, appointment, o instructions.",
  },
};

function getChatTranslation(lang: string, key: keyof typeof CHAT_UI["en"]): string {
  return CHAT_UI[lang]?.[key] || CHAT_UI["en"][key];
}

const LANG_NAMES: Record<string, string> = {
  en: "English", es: "Spanish", zh: "Chinese", vi: "Vietnamese",
  ar: "Arabic", ko: "Korean", tl: "Tagalog", fr: "French",
  pt: "Portuguese", hi: "Hindi", ur: "Urdu", ru: "Russian",
  ja: "Japanese", fa: "Farsi", pl: "Polish", ht: "Haitian Creole",
};

interface CarePlanChatbotProps {
  apiEndpoint: string;
  language: string;
  carePlanContext?: CarePlanContext;
  bottomOffset?: string;
}

export default function CarePlanChatbot({ apiEndpoint, language, carePlanContext, bottomOffset = "6" }: CarePlanChatbotProps) {
  const [chatOpen, setChatOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('litera_chat_dismissed') !== 'true';
    }
    return false;
  });
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const uiLang = Object.keys(CHAT_UI).includes(language) ? language : "en";

  const handleChatSend = useCallback(async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    const newMessages: ChatMessage[] = [...chatMessages, { role: "user", content: userMsg }];
    setChatMessages(newMessages);
    setChatLoading(true);

    try {
      const body: any = {
        question: userMsg,
        language: LANG_NAMES[language] || language,
      };
      if (carePlanContext) {
        body.carePlanContext = carePlanContext;
      }

      const response = await fetch(apiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      setChatMessages([...newMessages, { role: "assistant", content: data.answer || data.error || "I'm sorry, I couldn't answer that question." }]);
    } catch {
      setChatMessages([...newMessages, { role: "assistant", content: getChatTranslation(uiLang, "chatWelcome").includes("Lo siento") ? "Lo siento, tuve problemas para responder." : "Sorry, I had trouble answering. Please try again." }]);
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatLoading, chatMessages, apiEndpoint, language, carePlanContext, uiLang]);

  return (
    <>
      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          className="fixed right-6 flex items-center gap-2 rounded-full bg-primary text-primary-foreground shadow-lg z-50 print:hidden group hover:shadow-xl transition-shadow"
          style={{ bottom: `${parseInt(bottomOffset) * 4}px` }}
          data-testid="button-chat-toggle"
        >
          <div className="relative w-16 h-16 rounded-full flex items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-primary/30 animate-ping" />
            <MessageCircle className="h-7 w-7 relative z-10" />
          </div>
          <span className="pr-4 text-sm font-medium hidden sm:inline">Questions?</span>
        </button>
      )}
      {chatOpen && (
        <button
          onClick={() => {
            setChatOpen(false);
            localStorage.setItem('litera_chat_dismissed', 'true');
          }}
          className="fixed right-6 w-14 h-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg z-50 print:hidden"
          style={{ bottom: `${parseInt(bottomOffset) * 4}px` }}
          data-testid="button-chat-close"
        >
          <X className="h-6 w-6" />
        </button>
      )}

      {chatOpen && (
        <div
          className="fixed right-4 w-[calc(100%-2rem)] max-w-md bg-card border rounded-xl shadow-xl z-50 flex flex-col print:hidden"
          style={{ bottom: `${(parseInt(bottomOffset) * 4) + 64}px`, maxHeight: "60vh" }}
        >
          <div className="flex items-center justify-between gap-2 p-4 border-b">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">{getChatTranslation(uiLang, "chatTitle")}</h3>
            </div>
            <Button variant="ghost" size="icon" onClick={() => {
              setChatOpen(false);
              localStorage.setItem('litera_chat_dismissed', 'true');
            }} data-testid="button-chat-close-panel">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <ScrollArea className="flex-1 p-4" style={{ maxHeight: "calc(60vh - 8rem)" }}>
            <div className="space-y-3">
              {chatMessages.length === 0 && (
                <div className="p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
                  {getChatTranslation(uiLang, "chatWelcome")}
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
              placeholder={getChatTranslation(uiLang, "askQuestion")}
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
    </>
  );
}
