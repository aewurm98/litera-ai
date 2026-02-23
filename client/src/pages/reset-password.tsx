import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle } from "lucide-react";
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

  const hasMinLength = newPassword.length >= 8;
  const hasUppercase = /[A-Z]/.test(newPassword);
  const hasLowercase = /[a-z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const hasSpecial = /[^A-Za-z0-9]/.test(newPassword);
  const passwordValid = hasMinLength && hasUppercase && hasLowercase && hasNumber && hasSpecial;

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
    if (!passwordValid) {
      toast({ title: "Password must be at least 8 characters with uppercase, lowercase, number, and special character", variant: "destructive" });
      return;
    }
    if (!token) return;
    resetPasswordMutation.mutate({ token, newPassword });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-cyan-50/30 to-blue-50/40 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center mb-4">
            <img src="/images/logo-blue-text.png" alt="Litera" className="h-12" />
          </div>
          <CardTitle className="font-heading">{step === "request" ? "Forgot Password" : "Set New Password"}</CardTitle>
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
              <CheckCircle className="h-12 w-12 text-green-500 dark:text-green-400 mx-auto" />
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
                  placeholder="At least 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  data-testid="input-new-password"
                />
                {newPassword.length > 0 && (
                  <div className="grid grid-cols-2 gap-1 mt-1">
                    <div className={`flex items-center gap-1.5 text-xs ${hasMinLength ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                      {hasMinLength ? <CheckCircle className="h-3 w-3" /> : <span className="h-3 w-3 rounded-full border border-muted-foreground/40 inline-block" />}
                      8+ characters
                    </div>
                    <div className={`flex items-center gap-1.5 text-xs ${hasUppercase ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                      {hasUppercase ? <CheckCircle className="h-3 w-3" /> : <span className="h-3 w-3 rounded-full border border-muted-foreground/40 inline-block" />}
                      Uppercase
                    </div>
                    <div className={`flex items-center gap-1.5 text-xs ${hasLowercase ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                      {hasLowercase ? <CheckCircle className="h-3 w-3" /> : <span className="h-3 w-3 rounded-full border border-muted-foreground/40 inline-block" />}
                      Lowercase
                    </div>
                    <div className={`flex items-center gap-1.5 text-xs ${hasNumber ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                      {hasNumber ? <CheckCircle className="h-3 w-3" /> : <span className="h-3 w-3 rounded-full border border-muted-foreground/40 inline-block" />}
                      Number
                    </div>
                    <div className={`flex items-center gap-1.5 text-xs ${hasSpecial ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                      {hasSpecial ? <CheckCircle className="h-3 w-3" /> : <span className="h-3 w-3 rounded-full border border-muted-foreground/40 inline-block" />}
                      Special char
                    </div>
                  </div>
                )}
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
              <CheckCircle className="h-12 w-12 text-green-500 dark:text-green-400 mx-auto" />
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
