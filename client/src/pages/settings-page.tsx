import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Settings, Building2, Shield, Loader2, UserPlus, Mail, Clock, User } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

type UserData = {
  id: string;
  name: string;
  role: string;
  tenantId?: string | null;
  recoveryEmail?: string | null;
  tenant?: {
    id: string;
    name: string;
    slug: string;
    isDemo: boolean;
    interpreterReviewMode: string;
  } | null;
};

export default function SettingsPage() {
  const { toast } = useToast();
  const [interpreterReviewMode, setInterpreterReviewMode] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryEmailEditing, setRecoveryEmailEditing] = useState(false);

  const { data: user, isLoading } = useQuery<UserData>({
    queryKey: ["/api/auth/me"],
  });

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const isClinician = user?.role === "clinician";
  const isInterpreter = user?.role === "interpreter";

  useEffect(() => {
    if (user?.tenant?.interpreterReviewMode) {
      setInterpreterReviewMode(user.tenant.interpreterReviewMode);
    }
  }, [user?.tenant?.interpreterReviewMode]);

  useEffect(() => {
    if (user?.recoveryEmail) {
      setRecoveryEmail(user.recoveryEmail);
    }
  }, [user?.recoveryEmail]);

  const saveMutation = useMutation({
    mutationFn: async (data: { interpreterReviewMode: string }) => {
      const res = await apiRequest("PATCH", "/api/tenant/settings", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Settings saved", description: "Tenant settings have been updated." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleSave = () => {
    saveMutation.mutate({ interpreterReviewMode });
  };

  const saveRecoveryEmailMutation = useMutation({
    mutationFn: async (data: { recoveryEmail: string }) => {
      const res = await apiRequest("PATCH", "/api/auth/recovery-email", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setRecoveryEmailEditing(false);
      toast({ title: "Recovery email saved" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!user?.tenant) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Settings className="h-6 w-6 text-muted-foreground" />
          <h1 className="text-2xl font-bold" data-testid="text-settings-title">Settings</h1>
        </div>
        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground" data-testid="text-no-tenant">No clinic associated with your account.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const hasChanges = interpreterReviewMode !== user.tenant.interpreterReviewMode;

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Settings className="h-6 w-6 text-muted-foreground" />
        <h1 className="text-2xl font-bold" data-testid="text-settings-title">Settings</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Clinic Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground uppercase">Clinic Name</Label>
            <p className="text-sm font-medium" data-testid="text-clinic-name">{user.tenant.name}</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground uppercase">Slug</Label>
            <p className="text-sm font-medium text-muted-foreground" data-testid="text-clinic-slug">{user.tenant.slug}</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground uppercase">Mode</Label>
            <div className="mt-1">
              {user.tenant.isDemo ? (
                <Badge variant="secondary" data-testid="badge-demo-mode">Demo</Badge>
              ) : (
                <Badge variant="default" data-testid="badge-demo-mode">Production</Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Your Account
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground uppercase">Name</Label>
            <p className="text-sm font-medium" data-testid="text-account-name">{user.name}</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground uppercase">Role</Label>
            <div className="mt-1"><Badge variant="secondary" className="capitalize" data-testid="badge-account-role">{user.role}</Badge></div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground uppercase">Recovery Email</Label>
            <p className="text-xs text-muted-foreground mb-1">Used for password resets and "Send Test to Me"</p>
            {recoveryEmailEditing ? (
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="your.email@example.com"
                  value={recoveryEmail}
                  onChange={(e) => setRecoveryEmail(e.target.value)}
                  className="flex-1"
                  data-testid="input-recovery-email"
                />
                <Button
                  size="sm"
                  onClick={() => saveRecoveryEmailMutation.mutate({ recoveryEmail })}
                  disabled={!recoveryEmail || saveRecoveryEmailMutation.isPending}
                  data-testid="button-save-recovery-email"
                >
                  {saveRecoveryEmailMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setRecoveryEmailEditing(false); setRecoveryEmail(user.recoveryEmail || ""); }}>Cancel</Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium" data-testid="text-recovery-email">{user.recoveryEmail || "Not set"}</span>
                <Button size="sm" variant="ghost" onClick={() => setRecoveryEmailEditing(true)} data-testid="button-edit-recovery-email">
                  <Mail className="h-3 w-3 mr-1" />
                  {user.recoveryEmail ? "Edit" : "Add"}
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Interpreter Review Mode
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isAdmin ? (
            <Select
              value={interpreterReviewMode}
              onValueChange={setInterpreterReviewMode}
              data-testid="select-interpreter-review-mode"
            >
              <SelectTrigger data-testid="select-trigger-interpreter-review-mode">
                <SelectValue placeholder="Select review mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="disabled" data-testid="select-option-disabled">Disabled</SelectItem>
                <SelectItem value="optional" data-testid="select-option-optional">Optional</SelectItem>
                <SelectItem value="required" data-testid="select-option-required">Required</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <div>
              <Label className="text-xs text-muted-foreground uppercase">Current Setting</Label>
              <p className="text-sm font-medium capitalize" data-testid="text-review-mode-value">
                {user.tenant.interpreterReviewMode}
              </p>
            </div>
          )}

          <div className="space-y-2 text-sm text-muted-foreground">
            <p><span className="font-medium text-foreground">Disabled:</span> AI translations go directly to clinician approval.</p>
            <p><span className="font-medium text-foreground">Optional:</span> Clinician can choose to send translations for interpreter review.</p>
            <p><span className="font-medium text-foreground">Required:</span> All non-English translations must be reviewed by an interpreter before sending.</p>
          </div>

          {isAdmin && (
            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending || !hasChanges}
              data-testid="button-save-settings"
            >
              {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Settings
            </Button>
          )}
        </CardContent>
      </Card>

      {isAdmin && <TeamInviteSection />}
    </div>
  );
}

function TeamInviteSection() {
  const { toast } = useToast();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("clinician");

  const { data: invitations } = useQuery<Array<{
    id: string;
    email: string;
    role: string;
    status: string;
    expiresAt: string;
    createdAt: string;
  }>>({
    queryKey: ["/api/admin/invitations"],
  });

  const inviteMutation = useMutation({
    mutationFn: async (data: { email: string; role: string }) => {
      const res = await apiRequest("POST", "/api/admin/invitations", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invitations"] });
      setInviteEmail("");
      setInviteRole("clinician");
      toast({ title: "Invitation sent", description: "An email has been sent with the invite link." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const pendingInvites = invitations?.filter(i => i.status === "pending") || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="h-5 w-5" />
          Invite Team Members
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            type="email"
            placeholder="Email address"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            className="flex-1"
            data-testid="input-invite-email"
          />
          <Select value={inviteRole} onValueChange={setInviteRole}>
            <SelectTrigger className="w-36" data-testid="select-invite-role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="clinician">Clinician</SelectItem>
              <SelectItem value="interpreter">Interpreter</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={() => inviteMutation.mutate({ email: inviteEmail, role: inviteRole })}
            disabled={!inviteEmail.trim() || inviteMutation.isPending}
            data-testid="button-send-invite"
          >
            {inviteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
          </Button>
        </div>

        {pendingInvites.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase">Pending Invitations</Label>
            {pendingInvites.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between p-2 rounded bg-muted/50 text-sm">
                <div className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{inv.email}</span>
                  <Badge variant="secondary" className="text-xs capitalize">{inv.role}</Badge>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {format(new Date(inv.createdAt), "MMM d")}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
