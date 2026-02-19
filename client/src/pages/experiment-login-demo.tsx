import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Heart, Loader2, ArrowLeft, Stethoscope, Shield, Languages, LayoutDashboard, FlaskConical } from "lucide-react";

type RoleTab = "clinician" | "admin" | "interpreter" | "patient";

const ROLE_CONFIG: Record<RoleTab, {
  label: string;
  icon: typeof Stethoscope;
  description: string;
  credentials: { label: string; username: string; password: string }[];
  isPatient?: boolean;
}> = {
  clinician: {
    label: "Clinician",
    icon: Stethoscope,
    description: "Upload discharge documents, process AI simplification and translation, send care plans to patients.",
    credentials: [
      { label: "Maria Chen, RN (Riverside)", username: "nurse", password: "password123" },
      { label: "Sarah Kim, NP (Lakeside)", username: "lakeside_nurse", password: "password123" },
    ],
  },
  admin: {
    label: "Admin",
    icon: LayoutDashboard,
    description: "Manage patient roster, view alerts, export TCM billing data, configure tenant settings.",
    credentials: [
      { label: "Angela Torres (Super Admin)", username: "admin", password: "password123" },
      { label: "James Wright (Riverside Admin)", username: "riverside_admin", password: "password123" },
    ],
  },
  interpreter: {
    label: "Interpreter",
    icon: Languages,
    description: "Review AI-generated translations, edit content, approve or request changes before care plans reach patients.",
    credentials: [
      { label: "Luis Reyes, CMI (Riverside)", username: "riverside_interpreter", password: "password123" },
      { label: "Nadia Hassan, CMI (Lakeside)", username: "lakeside_interpreter", password: "password123" },
    ],
  },
  patient: {
    label: "Patient",
    icon: Shield,
    description: "Access care plan via magic link, view simplified discharge instructions in your language, check in with your care team.",
    isPatient: true,
    credentials: [],
  },
};

const ROLE_TABS: RoleTab[] = ["clinician", "admin", "interpreter", "patient"];

export default function ExperimentLoginDemo() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<RoleTab>("clinician");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const config = ROLE_CONFIG[activeTab];

  const loginMutation = useMutation({
    mutationFn: async (credentials: { username: string; password: string }) => {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Login failed");
      }
      return response.json();
    },
    onSuccess: (user) => {
      queryClient.setQueryData(["/api/auth/me"], user);
      toast({ title: `Welcome, ${user.name}!` });
      if (user.role === "admin" || user.role === "super_admin") {
        navigate("/admin");
      } else if (user.role === "interpreter") {
        navigate("/interpreter");
      } else {
        navigate("/");
      }
    },
    onError: (error: Error) => {
      toast({ title: "Login failed", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate({ username, password });
  };

  const handleQuickLogin = (cred: { username: string; password: string }) => {
    loginMutation.mutate(cred);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white dark:from-gray-900 dark:to-gray-800">
      <div className="bg-amber-500 text-amber-950 text-center py-2 px-4 text-sm font-medium flex items-center justify-center gap-2">
        <FlaskConical className="h-4 w-4" />
        Experiment: Embeddable Login Demo
      </div>

      <div className="max-w-lg mx-auto px-4 pt-6 pb-8">
        <div className="flex items-center gap-2 mb-6">
          <Link href="/experiments">
            <Button variant="ghost" size="icon" data-testid="button-back-experiments">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Heart className="h-6 w-6 text-primary" />
            <span className="text-xl font-bold text-primary">Litera.ai</span>
          </div>
        </div>

        <Card>
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-xl">Sign In</CardTitle>
            <CardDescription>Choose your role to explore the platform</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-1 mb-6 bg-muted p-1 rounded-lg">
              {ROLE_TABS.map((role) => {
                const Icon = ROLE_CONFIG[role].icon;
                return (
                  <button
                    key={role}
                    onClick={() => setActiveTab(role)}
                    className={`flex-1 flex flex-col items-center gap-1 py-2 px-2 rounded-md text-xs font-medium transition-colors ${
                      activeTab === role ? "bg-background shadow-sm" : "text-muted-foreground"
                    }`}
                    data-testid={`tab-role-${role}`}
                  >
                    <Icon className="h-4 w-4" />
                    {ROLE_CONFIG[role].label}
                  </button>
                );
              })}
            </div>

            <p className="text-sm text-muted-foreground mb-4">{config.description}</p>

            {config.isPatient ? (
              <div className="space-y-4">
                <div className="p-4 bg-muted rounded-lg text-sm">
                  <p className="font-medium mb-2">Patient Access</p>
                  <p className="text-muted-foreground mb-3">
                    Patients access their care plans through a secure magic link sent via email or SMS. No traditional login is required.
                  </p>
                  <p className="text-muted-foreground">
                    To preview the patient experience, try the Comprehension Evaluation experiment or use the clinician dashboard to send a care plan.
                  </p>
                </div>
                <Link href="/experiments/comprehension">
                  <Button variant="outline" className="w-full" data-testid="button-try-comprehension">
                    Try Patient Portal Preview
                  </Button>
                </Link>
              </div>
            ) : (
              <>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="username">Username</Label>
                    <Input
                      id="username"
                      type="text"
                      placeholder="Enter username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                      data-testid="input-login-username"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="Enter password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      data-testid="input-login-password"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loginMutation.isPending} data-testid="button-login-submit">
                    {loginMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Sign In as {config.label}
                  </Button>
                </form>

                {config.credentials.length > 0 && (
                  <div className="mt-6 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Quick Access</p>
                    {config.credentials.map((cred, i) => (
                      <button
                        key={i}
                        onClick={() => handleQuickLogin(cred)}
                        disabled={loginMutation.isPending}
                        className="w-full p-3 bg-muted rounded-lg text-left hover-elevate transition-colors"
                        data-testid={`button-quick-login-${i}`}
                      >
                        <p className="font-medium text-sm">{cred.label}</p>
                        <p className="font-mono text-xs text-muted-foreground">{cred.username} / {cred.password}</p>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          This login interface can be embedded into external landing pages via iframe.
        </p>
      </div>
    </div>
  );
}
