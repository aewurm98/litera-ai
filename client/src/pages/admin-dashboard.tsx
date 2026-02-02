import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { 
  Download, 
  Filter,
  Search,
  AlertTriangle,
  Check,
  Clock,
  Users,
  FileText,
  TrendingUp,
  Calendar,
  Loader2,
  Eye,
  CheckCircle,
  XCircle,
  Bell,
  RefreshCw
} from "lucide-react";
import type { CarePlan, Patient, CheckIn, AuditLog } from "@shared/schema";
import { SUPPORTED_LANGUAGES } from "@shared/schema";
import { format, differenceInCalendarDays } from "date-fns";

type CarePlanWithDetails = CarePlan & { 
  patient?: Patient; 
  clinician?: { id: string; name: string };
  approver?: { id: string; name: string };
  checkIns?: CheckIn[];
  auditLogs?: AuditLog[];
};

type Alert = {
  id: string;
  carePlanId: string;
  patientName: string;
  response: "yellow" | "red";
  respondedAt: Date;
  resolved: boolean;
  resolvedAt?: Date | null;
};

export default function AdminDashboard() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCarePlan, setSelectedCarePlan] = useState<CarePlanWithDetails | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);

  // Fetch environment info to determine if we're in demo mode
  const { data: envInfo } = useQuery<{ isDemoMode: boolean; isProduction: boolean }>({
    queryKey: ["/api/env-info"],
  });
  const isDemoMode = envInfo?.isDemoMode ?? false;

  // Fetch all care plans
  const { data: carePlans = [], isLoading } = useQuery<CarePlanWithDetails[]>({
    queryKey: ["/api/admin/care-plans"],
  });

  // Fetch alerts (yellow/red responses)
  const { data: alerts = [] } = useQuery<Alert[]>({
    queryKey: ["/api/admin/alerts"],
  });

  // Resolve alert mutation
  const resolveAlertMutation = useMutation({
    mutationFn: async (alertId: string) => {
      return apiRequest("POST", `/api/admin/alerts/${alertId}/resolve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/alerts"] });
      toast({ title: "Alert resolved" });
    },
  });

  // Export CSV mutation
  const exportMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/admin/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusFilter, searchQuery }),
      });
      if (!response.ok) throw new Error("Export failed");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `litera-tcm-export-${format(new Date(), "yyyy-MM-dd")}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      toast({ title: "Export complete", description: "CSV file downloaded" });
    },
    onError: () => {
      toast({ title: "Export failed", variant: "destructive" });
    },
  });

  // Reset demo data mutation
  const resetDemoMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/reset-demo");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/care-plans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/alerts"] });
      toast({ title: "Demo data reset", description: "Please log in again with the demo credentials" });
      // Redirect to login since session was destroyed
      if (data?.requiresRelogin) {
        window.location.href = "/login";
      }
    },
    onError: () => {
      toast({ title: "Reset failed", variant: "destructive" });
    },
  });

  const filteredCarePlans = carePlans.filter((plan) => {
    const matchesStatus = statusFilter === "all" || plan.status === statusFilter;
    const matchesSearch = 
      !searchQuery || 
      plan.patient?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      plan.diagnosis?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { variant: "default" | "secondary" | "outline" | "destructive"; label: string; icon: React.ReactNode }> = {
      draft: { variant: "outline", label: "Draft", icon: <FileText className="h-3 w-3" /> },
      pending_review: { variant: "secondary", label: "Pending Review", icon: <Clock className="h-3 w-3" /> },
      approved: { variant: "default", label: "Approved", icon: <Check className="h-3 w-3" /> },
      sent: { variant: "default", label: "Sent", icon: <Check className="h-3 w-3" /> },
      completed: { variant: "default", label: "Completed", icon: <CheckCircle className="h-3 w-3" /> },
    };
    const config = statusConfig[status] || statusConfig.draft;
    return (
      <Badge variant={config.variant} className="gap-1">
        {config.icon}
        {config.label}
      </Badge>
    );
  };

  const getCheckInBadge = (checkIns?: CheckIn[]) => {
    if (!checkIns || checkIns.length === 0) {
      return <Badge variant="outline">No Check-in</Badge>;
    }
    const latestCheckIn = checkIns[checkIns.length - 1];
    if (!latestCheckIn.respondedAt) {
      return <Badge variant="secondary">Pending</Badge>;
    }
    const responseConfig: Record<string, { variant: "default" | "secondary" | "destructive"; label: string }> = {
      green: { variant: "default", label: "Feeling Good" },
      yellow: { variant: "secondary", label: "Concern" },
      red: { variant: "destructive", label: "Urgent" },
    };
    const config = responseConfig[latestCheckIn.response || ""] || { variant: "outline" as const, label: "Unknown" };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  // Stats calculations
  const totalPatients = carePlans.length;
  const sentPlans = carePlans.filter(p => p.status === "sent" || p.status === "completed").length;
  const respondedCheckIns = carePlans.filter(p => 
    p.checkIns?.some(c => c.respondedAt)
  ).length;
  const pendingAlerts = alerts.filter(a => !a.resolved).length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <p className="text-muted-foreground">TCM billing and patient management</p>
        </div>
        <div className="flex items-center gap-2">
          {isDemoMode && (
            <Button 
              variant="outline"
              onClick={() => {
                if (confirm("This will reset all data to the demo state. Are you sure?")) {
                  resetDemoMutation.mutate();
                }
              }}
              disabled={resetDemoMutation.isPending}
              data-testid="button-reset-demo"
            >
              {resetDemoMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Reset Demo
            </Button>
          )}
          <Button 
            onClick={() => exportMutation.mutate()}
            disabled={exportMutation.isPending}
            data-testid="button-export"
          >
            {exportMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Export CSV
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-primary/10">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalPatients}</p>
                <p className="text-sm text-muted-foreground">Total Patients</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-accent/10">
                <FileText className="h-6 w-6 text-accent" />
              </div>
              <div>
                <p className="text-2xl font-bold">{sentPlans}</p>
                <p className="text-sm text-muted-foreground">Plans Delivered</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-green-500/10">
                <TrendingUp className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{respondedCheckIns}</p>
                <p className="text-sm text-muted-foreground">Check-ins Complete</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-destructive/10">
                <Bell className="h-6 w-6 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold">{pendingAlerts}</p>
                <p className="text-sm text-muted-foreground">Active Alerts</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="patients" className="space-y-4">
        <TabsList>
          <TabsTrigger value="patients" className="gap-2">
            <Users className="h-4 w-4" />
            Patients
          </TabsTrigger>
          <TabsTrigger value="alerts" className="gap-2">
            <AlertTriangle className="h-4 w-4" />
            Alerts
            {pendingAlerts > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 w-5 p-0 justify-center">
                {pendingAlerts}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Patients Tab */}
        <TabsContent value="patients" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-wrap gap-4">
                <div className="flex-1 min-w-[200px]">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search patients..."
                      className="pl-9"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      data-testid="input-search"
                    />
                  </div>
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="pending_review">Pending Review</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="sent">Sent</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Patient Table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient</TableHead>
                    <TableHead>Clinician</TableHead>
                    <TableHead>Discharge Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Check-in</TableHead>
                    <TableHead>Language</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : filteredCarePlans.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No patients found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredCarePlans.map((plan) => (
                      <TableRow key={plan.id} data-testid={`row-patient-${plan.id}`}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{plan.patient?.name || plan.extractedPatientName || "Unknown"}</p>
                            <p className="text-sm text-muted-foreground truncate max-w-[200px]">
                              {plan.diagnosis?.slice(0, 40)}...
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{plan.clinician?.name || "-"}</span>
                        </TableCell>
                        <TableCell>
                          {plan.dischargeDate 
                            ? format(new Date(plan.dischargeDate), "MMM d, yyyy")
                            : "-"
                          }
                        </TableCell>
                        <TableCell>{getStatusBadge(plan.status)}</TableCell>
                        <TableCell>{getCheckInBadge(plan.checkIns)}</TableCell>
                        <TableCell>
                          {SUPPORTED_LANGUAGES.find(l => l.code === plan.translatedLanguage)?.name || "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedCarePlan(plan);
                              setIsDetailDialogOpen(true);
                            }}
                            data-testid={`button-view-${plan.id}`}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Alerts Tab */}
        <TabsContent value="alerts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Patient Alerts</CardTitle>
              <CardDescription>
                Yellow and red check-in responses requiring follow-up
              </CardDescription>
            </CardHeader>
            <CardContent>
              {alerts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mx-auto mb-4 text-accent" />
                  <p>No active alerts</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {alerts.map((alert) => (
                    <div 
                      key={alert.id}
                      className={`p-4 rounded-lg border flex items-center justify-between ${
                        alert.response === "red" 
                          ? "border-destructive/50 bg-destructive/5" 
                          : "border-yellow-500/50 bg-yellow-500/5"
                      }`}
                      data-testid={`alert-${alert.id}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-full ${
                          alert.response === "red" ? "bg-destructive/10" : "bg-yellow-500/10"
                        }`}>
                          <AlertTriangle className={`h-5 w-5 ${
                            alert.response === "red" ? "text-destructive" : "text-yellow-600"
                          }`} />
                        </div>
                        <div>
                          <p className="font-medium">{alert.patientName}</p>
                          <p className="text-sm text-muted-foreground">
                            {alert.response === "red" ? "Urgent - Needs Help Now" : "Has a Concern"}
                            {" · "}
                            {format(new Date(alert.respondedAt), "MMM d, h:mm a")}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {alert.resolved ? (
                          <div className="text-right">
                            <Badge variant="outline" className="gap-1">
                              <CheckCircle className="h-3 w-3" />
                              Resolved
                            </Badge>
                            {alert.resolvedAt && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {format(new Date(alert.resolvedAt), "MMM d, h:mm a")}
                              </p>
                            )}
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => resolveAlertMutation.mutate(alert.id)}
                            disabled={resolveAlertMutation.isPending}
                            data-testid={`button-resolve-${alert.id}`}
                          >
                            Mark Resolved
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Detail Dialog */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Patient Detail</DialogTitle>
            <DialogDescription>
              {selectedCarePlan?.patient?.name} - Care Plan Audit Trail
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1">
            {selectedCarePlan && (
              <div className="space-y-6 pr-4">
                {/* Patient Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground uppercase">Patient</Label>
                    <p className="font-medium">{selectedCarePlan.patient?.name}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground uppercase">Email</Label>
                    <p>{selectedCarePlan.patient?.email}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground uppercase">Discharge Date</Label>
                    <p>{selectedCarePlan.dischargeDate 
                      ? format(new Date(selectedCarePlan.dischargeDate), "MMM d, yyyy")
                      : "-"
                    }</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground uppercase">Language</Label>
                    <p>{SUPPORTED_LANGUAGES.find(l => l.code === selectedCarePlan.translatedLanguage)?.name || "-"}</p>
                  </div>
                </div>

                {/* Audit Timeline */}
                <div>
                  <Label className="text-xs text-muted-foreground uppercase mb-3 block">Audit Trail</Label>
                  <div className="space-y-3">
                    {selectedCarePlan.auditLogs?.map((log, index) => (
                      <div key={log.id} className="flex gap-3">
                        <div className="w-2 h-2 rounded-full bg-primary mt-2" />
                        <div className="flex-1">
                          <p className="font-medium capitalize">{log.action.replace(/_/g, " ")}</p>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(log.createdAt), "MMM d, yyyy h:mm a")}
                          </p>
                        </div>
                      </div>
                    ))}
                    {(!selectedCarePlan.auditLogs || selectedCarePlan.auditLogs.length === 0) && (
                      <p className="text-muted-foreground text-sm">No audit logs available</p>
                    )}
                  </div>
                </div>

                {/* TCM Billing Info */}
                <div className="bg-muted/50 rounded-lg p-4">
                  <Label className="text-xs text-muted-foreground uppercase mb-2 block">TCM Billing</Label>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Approved By</p>
                      <p className="font-medium">{selectedCarePlan.approver?.name || "-"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Approved At</p>
                      <p className="font-medium">
                        {selectedCarePlan.approvedAt 
                          ? format(new Date(selectedCarePlan.approvedAt), "MMM d, yyyy h:mm a")
                          : "-"
                        }
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Interactive Contact</p>
                      <p className="font-medium">
                        {selectedCarePlan.checkIns?.some(c => c.respondedAt) ? "Yes" : "No"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Suggested CPT</p>
                      <p className="font-medium">
                        {(() => {
                          if (selectedCarePlan.status !== "sent" && selectedCarePlan.status !== "completed") return "Not Sent";
                          const sentLog = selectedCarePlan.auditLogs?.find(l => l.action === "sent");
                          if (!sentLog) return "Not Sent";
                          const sentDate = new Date(sentLog.createdAt);
                          const respondedCheckIns = selectedCarePlan.checkIns?.filter(c => c.respondedAt) || [];
                          if (respondedCheckIns.length === 0) return "Pending Contact";
                          const earliestContact = respondedCheckIns.reduce((earliest, current) => {
                            const currentDate = new Date(current.respondedAt!);
                            const earliestDate = new Date(earliest.respondedAt!);
                            return currentDate < earliestDate ? current : earliest;
                          });
                          const contactDate = new Date(earliestContact.respondedAt!);
                          const daysDiff = differenceInCalendarDays(contactDate, sentDate);
                          if (daysDiff <= 7) return "99496";
                          if (daysDiff <= 14) return "99495";
                          return "Not Eligible";
                        })()}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
