import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Heart, Check, Loader2 } from "lucide-react";
import { queryClient } from "@/lib/queryClient";

export default function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const [, navigate] = useLocation();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const { data: invitation, isLoading, error } = useQuery<{
    email: string;
    role: string;
    tenantName?: string;
  }>({
    queryKey: ["/api/invitations", token],
    queryFn: async () => {
      const res = await fetch(`/api/invitations/${token}`, { credentials: "include" });
      if (!res.ok) throw new Error("Invalid invitation");
      return res.json();
    },
    enabled: !!token,
  });

  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;
  const allValid = hasMinLength && hasUppercase && hasLowercase && hasNumber && hasSpecial && passwordsMatch && name.trim().length > 0 && username.trim().length > 0;

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/invitations/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, username, password }),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to accept invitation");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.clear();
      navigate("/dashboard");
    },
  });

  const CheckItem = ({ met, label }: { met: boolean; label: string }) => (
    <div className={`flex items-center gap-1.5 text-xs ${met ? "text-green-600" : "text-muted-foreground"}`}>
      {met ? <Check className="h-3 w-3" /> : <span className="h-3 w-3 rounded-full border border-muted-foreground/40 inline-block" />}
      {label}
    </div>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="w-12 h-12 rounded-lg bg-destructive/10 flex items-center justify-center mx-auto mb-2">
              <Heart className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle>Invalid Invitation</CardTitle>
            <CardDescription>
              This invitation link is invalid, has expired, or has already been used.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={() => navigate("/login")} data-testid="button-go-to-login">
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <img src="/images/logo-blue-text.png" alt="Litera" className="h-10" />
          </div>
          <CardTitle className="font-heading">Join Litera</CardTitle>
          <CardDescription>
            You've been invited to join{invitation.tenantName ? ` ${invitation.tenantName}` : ""} as a <strong className="capitalize">{invitation.role}</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (allValid) acceptMutation.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="invite-name">Full Name</Label>
              <Input
                id="invite-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Dr. Jane Smith"
                required
                data-testid="input-invite-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-username">Username</Label>
              <Input
                id="invite-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="jsmith"
                required
                data-testid="input-invite-username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-password">Password</Label>
              <Input
                id="invite-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                data-testid="input-invite-password"
              />
              {password.length > 0 && (
                <div className="grid grid-cols-2 gap-1 mt-1">
                  <CheckItem met={hasMinLength} label="8+ characters" />
                  <CheckItem met={hasUppercase} label="Uppercase" />
                  <CheckItem met={hasLowercase} label="Lowercase" />
                  <CheckItem met={hasNumber} label="Number" />
                  <CheckItem met={hasSpecial} label="Special char" />
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-confirm-password">Confirm Password</Label>
              <Input
                id="invite-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                data-testid="input-invite-confirm-password"
              />
              {confirmPassword.length > 0 && !passwordsMatch && (
                <p className="text-xs text-destructive">Passwords do not match</p>
              )}
            </div>
            {acceptMutation.error && (
              <p className="text-sm text-destructive">{acceptMutation.error.message}</p>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={!allValid || acceptMutation.isPending}
              data-testid="button-accept-invite"
            >
              {acceptMutation.isPending ? "Creating Account..." : "Accept Invitation"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
