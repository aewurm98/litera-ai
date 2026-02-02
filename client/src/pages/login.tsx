import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Heart, Loader2, RotateCcw } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export default function Login() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // Fetch environment info to determine if we're in demo mode
  const { data: envInfo } = useQuery<{ isDemoMode: boolean; isProduction: boolean }>({
    queryKey: ["/api/env-info"],
  });
  const isDemoMode = envInfo?.isDemoMode ?? false;

  const resetDemoMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/public/reset-demo");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Demo data reset", description: "You can now log in with fresh demo data" });
    },
    onError: () => {
      toast({ title: "Reset failed", variant: "destructive" });
    },
  });

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
      if (user.role === "admin") {
        navigate("/admin");
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-white dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Heart className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold text-primary">Litera.ai</span>
          </div>
          <CardTitle>Sign In</CardTitle>
          <CardDescription>
            Healthcare discharge communication platform
          </CardDescription>
        </CardHeader>
        <CardContent>
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
                data-testid="input-username"
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
                data-testid="input-password"
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={loginMutation.isPending}
              data-testid="button-login"
            >
              {loginMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Sign In
            </Button>
          </form>

          {isDemoMode && (
            <div className="mt-6 p-4 bg-muted rounded-lg">
              <p className="text-sm font-medium mb-2">Demo Credentials:</p>
              <div className="text-sm text-muted-foreground space-y-2">
                <div className="p-2 bg-background rounded border">
                  <p className="font-medium text-foreground">Clinician (Maria Chen, RN):</p>
                  <p className="font-mono text-xs">nurse / password123</p>
                </div>
                <div className="p-2 bg-background rounded border">
                  <p className="font-medium text-foreground">Admin (Angela Torres):</p>
                  <p className="font-mono text-xs">admin / password123</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-3"
                onClick={() => resetDemoMutation.mutate()}
                disabled={resetDemoMutation.isPending}
                data-testid="button-reset-demo-login"
              >
                {resetDemoMutation.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-2" />
                ) : (
                  <RotateCcw className="h-3 w-3 mr-2" />
                )}
                Reset Demo Data
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
