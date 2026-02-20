import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Heart, BookOpen, LogIn, Languages, ArrowRight, FlaskConical } from "lucide-react";

const experiments = [
  {
    id: "comprehension",
    title: "Comprehension Evaluation",
    description: "Test patient understanding of simplified and translated discharge summaries. Patients view a hardcoded care plan with English/Spanish toggle and can ask questions via an AI chatbot.",
    icon: BookOpen,
    href: "/experiments/comprehension",
    status: "Active",
  },
  {
    id: "login-demo",
    title: "Embeddable Login Demo",
    description: "A unified login interface for all user roles (patient, clinician, admin, interpreter). Designed for embedding into external landing pages to test click-through rates on demo CTAs.",
    icon: LogIn,
    href: "/experiments/login-demo",
    status: "Active",
  },
  {
    id: "interpreter",
    title: "Interpreter Sandbox",
    description: "Test the human-in-the-loop interpreter review workflow. Interpreters review and edit AI-generated translations in a sandboxed environment where changes are never persisted.",
    icon: Languages,
    href: "/experiments/interpreter",
    status: "Active",
  },
];

export default function ExperimentsHub() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background">
      <header className="border-b bg-card">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <FlaskConical className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Heart className="h-5 w-5 text-primary" />
                <span className="font-bold text-lg text-primary">Litera.ai</span>
              </div>
              <p className="text-xs text-muted-foreground">Experiments Sandbox</p>
            </div>
          </div>
          <p className="text-muted-foreground mt-3 max-w-2xl">
            Isolated experiment environments for testing product features. These pages operate independently from the main platform and do not affect production data.
          </p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-4">
        {experiments.map((exp) => (
          <Link key={exp.id} href={exp.href}>
            <Card className="hover-elevate cursor-pointer" data-testid={`card-experiment-${exp.id}`}>
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <exp.icon className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-semibold text-lg">{exp.title}</h3>
                      <Badge variant="secondary" className="text-xs">{exp.status}</Badge>
                    </div>
                    <p className="text-muted-foreground text-sm">{exp.description}</p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-1" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </main>
    </div>
  );
}
