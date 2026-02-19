import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Settings, Building2, Shield, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

type UserData = {
  id: string;
  name: string;
  role: string;
  tenantId?: string | null;
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

  const { data: user, isLoading } = useQuery<UserData>({
    queryKey: ["/api/auth/me"],
  });

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  useEffect(() => {
    if (user?.tenant?.interpreterReviewMode) {
      setInterpreterReviewMode(user.tenant.interpreterReviewMode);
    }
  }, [user?.tenant?.interpreterReviewMode]);

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
    </div>
  );
}
