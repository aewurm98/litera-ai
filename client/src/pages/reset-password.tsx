import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Heart, Loader2, CheckCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export default function ResetPassword() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const token = new URLSearchParams(search).get("token");
  const { toast } = useToast();

  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [step, setStep] = useState<"request" | "reset">(token ? "reset" : "request");
  const [submitted, setSubmitted] = useState(false);

  const requestResetMutation = useMutation({
    mutationFn: async (data: { email: string }) => {
      const res = await apiRequest("POST", "/api/auth/forgot-password", data);
      return res.json();
    },
    onSuccess: () => {
      setSubmitted(true);
    },
    onError: () => {
      setSubmitted(true);
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (data: { token: string; newPassword: string }) => {
      const res = await apiRequest("POST", "/api/auth/reset-password", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Password reset successfully" });
      setSubmitted(true);
    },
    onError: (error: Error) => {
      toast({ title: "Reset failed", description: error.message, variant: "destructive" });
    },
  });

  const handleRequestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    requestResetMutation.mutate({ email });
  };

  const handleResetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }
    resetPasswordMutation.mutate({ token: token!, newPassword });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-white dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Heart className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold text-primary">Litera.ai</span>
          </div>
          <CardTitle>{step === "request" ? "Forgot Password" : "Set New Password"}</CardTitle>
          <CardDescription>
            {step === "request"
              ? "Enter the recovery email linked to your account."
              : "Choose a new password for your account."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === "request" && !submitted && (
            <form onSubmit={handleRequestSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Recovery Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your.recovery@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  data-testid="input-reset-email"
                />
              </div>
              <Button type="submit" className="w-full" disabled={requestResetMutation.isPending} data-testid="button-request-reset">
                {requestResetMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Send Reset Link
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => navigate("/login")} data-testid="link-back-to-login">
                Back to Sign In
              </Button>
            </form>
          )}

          {step === "request" && submitted && (
            <div className="text-center space-y-4">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
              <p className="text-sm text-muted-foreground">
                If an account with that recovery email exists, a reset link has been sent. Check your inbox.
              </p>
              <Button variant="outline" onClick={() => navigate("/login")} data-testid="link-back-to-login-after">
                Back to Sign In
              </Button>
            </div>
          )}

          {step === "reset" && !submitted && (
            <form onSubmit={handleResetSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="At least 6 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  data-testid="input-new-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="Re-enter password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  data-testid="input-confirm-password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={resetPasswordMutation.isPending} data-testid="button-reset-password">
                {resetPasswordMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Reset Password
              </Button>
            </form>
          )}

          {step === "reset" && submitted && (
            <div className="text-center space-y-4">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
              <p className="text-sm text-muted-foreground">
                Your password has been reset. You can now sign in with your new password.
              </p>
              <Button onClick={() => navigate("/login")} data-testid="button-go-to-login">
                Sign In
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
