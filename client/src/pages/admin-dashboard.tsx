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
  RefreshCw,
  Building2,
  UserPlus,
  Plus,
  Trash2,
  Pencil
} from "lucide-react";
import { DialogFooter } from "@/components/ui/dialog";
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

type Tenant = {
  id: string;
  name: string;
  slug: string;
  isDemo: boolean;
  createdAt: string;
};

type UserWithTenant = {
  id: string;
  username: string;
  name: string;
  role: string;
  tenantId: string | null;
  tenant: Tenant | null;
};

export default function AdminDashboard() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCarePlan, setSelectedCarePlan] = useState<CarePlanWithDetails | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<"current" | "history">("current");
  
  // User/Tenant management state
  const [isCreateUserDialogOpen, setIsCreateUserDialogOpen] = useState(false);
  const [isCreateTenantDialogOpen, setIsCreateTenantDialogOpen] = useState(false);
  const [isEditUserDialogOpen, setIsEditUserDialogOpen] = useState(false);
  const [isEditTenantDialogOpen, setIsEditTenantDialogOpen] = useState(false);
  const [newUserForm, setNewUserForm] = useState({ username: "", password: "", name: "", role: "clinician", tenantId: "" });
  const [newTenantForm, setNewTenantForm] = useState({ name: "", slug: "", isDemo: false });
  const [editUserForm, setEditUserForm] = useState<{ id: string; name: string; role: string; tenantId: string }>({ id: "", name: "", role: "", tenantId: "" });
  const [editTenantForm, setEditTenantForm] = useState<{ id: string; name: string; isDemo: boolean }>({ id: "", name: "", isDemo: false });

  // Fetch environment info to determine if we're in demo mode
  const { data: envInfo } = useQuery<{ isDemoMode: boolean; isProduction: boolean }>({
    queryKey: ["/api/env-info"],
  });
  const isDemoMode = envInfo?.isDemoMode ?? false;

  // Fetch current user to check role
  const { data: currentUser } = useQuery<{ id: string; name: string; role: string; tenantId: string | null }>({
    queryKey: ["/api/auth/me"],
  });
  const isSuperAdmin = currentUser?.role === "super_admin";

  // Fetch all care plans
  const { data: carePlans = [], isLoading } = useQuery<CarePlanWithDetails[]>({
    queryKey: ["/api/admin/care-plans"],
  });

  // Fetch alerts (yellow/red responses)
  const { data: alerts = [] } = useQuery<Alert[]>({
    queryKey: ["/api/admin/alerts"],
  });

  // Fetch users (admin only)
  const { data: allUsers = [] } = useQuery<UserWithTenant[]>({
    queryKey: ["/api/admin/users"],
  });

  // Fetch tenants (admin only)
  const { data: allTenants = [] } = useQuery<Tenant[]>({
    queryKey: ["/api/admin/tenants"],
  });

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: async (data: typeof newUserForm) => {
      return apiRequest("POST", "/api/admin/users", {
        ...data,
        tenantId: data.tenantId || null,
      });
    },
    onSuccess: () => {
      toast({ title: "User created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setIsCreateUserDialogOpen(false);
      setNewUserForm({ username: "", password: "", name: "", role: "clinician", tenantId: "" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("DELETE", `/api/admin/users/${userId}`);
    },
    onSuccess: () => {
      toast({ title: "User deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Create tenant mutation
  const createTenantMutation = useMutation({
    mutationFn: async (data: typeof newTenantForm) => {
      return apiRequest("POST", "/api/admin/tenants", data);
    },
    onSuccess: () => {
      toast({ title: "Tenant created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants"] });
      setIsCreateTenantDialogOpen(false);
      setNewTenantForm({ name: "", slug: "", isDemo: false });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Update user mutation
  const updateUserMutation = useMutation({
    mutationFn: async (data: typeof editUserForm) => {
      return apiRequest("PATCH", `/api/admin/users/${data.id}`, {
        name: data.name,
        role: data.role,
        tenantId: data.tenantId || null,
      });
    },
    onSuccess: () => {
      toast({ title: "Team member updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setIsEditUserDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Update tenant mutation
  const updateTenantMutation = useMutation({
    mutationFn: async (data: typeof editTenantForm) => {
      return apiRequest("PATCH", `/api/admin/tenants/${data.id}`, {
        name: data.name,
        isDemo: data.isDemo,
      });
    },
    onSuccess: () => {
      toast({ title: "Tenant updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants"] });
      setIsEditTenantDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
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

  // Get all care plans for the selected patient (by patientId or by name fallback)
  const getPatientHistory = (plan: CarePlanWithDetails) => {
    if (plan.patientId) {
      return carePlans.filter(cp => cp.patientId === plan.patientId);
    }
    // Fallback: match by normalized patient name when patientId is null
    const patientName = plan.patient?.name || plan.extractedPatientName;
    if (!patientName) return [plan];
    const normalizedName = patientName.toLowerCase().trim();
    return carePlans.filter(cp => {
      const cpName = cp.patient?.name || cp.extractedPatientName;
      return cpName && cpName.toLowerCase().trim() === normalizedName;
    });
  };

  const patientHistory = selectedCarePlan ? getPatientHistory(selectedCarePlan) : [];

  // Get visit count for a patient (by patientId or by name fallback)
  const getVisitCount = (plan: CarePlanWithDetails) => {
    if (plan.patientId) {
      return carePlans.filter(cp => cp.patientId === plan.patientId).length;
    }
    // Fallback: match by normalized patient name when patientId is null
    const patientName = plan.patient?.name || plan.extractedPatientName;
    if (!patientName) return 1;
    const normalizedName = patientName.toLowerCase().trim();
    return carePlans.filter(cp => {
      const cpName = cp.patient?.name || cp.extractedPatientName;
      return cpName && cpName.toLowerCase().trim() === normalizedName;
    }).length;
  };

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
          <TabsTrigger value="team" className="gap-2" data-testid="tab-team">
            <UserPlus className="h-4 w-4" />
            Team
          </TabsTrigger>
          {isSuperAdmin && (
            <TabsTrigger value="tenants" className="gap-2" data-testid="tab-tenants">
              <Building2 className="h-4 w-4" />
              Tenants
            </TabsTrigger>
          )}
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
                          <div className="flex items-center gap-2">
                            <div>
                              <p className="font-medium">{plan.patient?.name || plan.extractedPatientName || "Unknown"}</p>
                              <p className="text-sm text-muted-foreground truncate max-w-[200px]">
                                {plan.diagnosis?.slice(0, 40)}...
                              </p>
                            </div>
                            {getVisitCount(plan) > 1 && (
                              <Badge variant="secondary" className="text-xs" data-testid={`badge-visits-${plan.id}`}>
                                {getVisitCount(plan)} visits
                              </Badge>
                            )}
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
                              setDetailTab("current");
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

        {/* Team Tab */}
        <TabsContent value="team" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Team Management</CardTitle>
                <CardDescription>Manage clinicians and administrators{!isSuperAdmin && " in your clinic"}</CardDescription>
              </div>
              <Button onClick={() => setIsCreateUserDialogOpen(true)} data-testid="button-create-team-member">
                <Plus className="h-4 w-4 mr-2" />
                Add Team Member
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Username</TableHead>
                    <TableHead>Role</TableHead>
                    {isSuperAdmin && <TableHead>Tenant</TableHead>}
                    <TableHead className="w-[120px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.name}</TableCell>
                      <TableCell>{user.username}</TableCell>
                      <TableCell>
                        <Badge variant={user.role === "admin" || user.role === "super_admin" ? "default" : "secondary"}>
                          {user.role === "super_admin" ? "Super Admin" : user.role}
                        </Badge>
                      </TableCell>
                      {isSuperAdmin && <TableCell>{user.tenant?.name || "-"}</TableCell>}
                      <TableCell>
                        <div className="flex gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => {
                              setEditUserForm({
                                id: user.id,
                                name: user.name,
                                role: user.role,
                                tenantId: user.tenantId || "",
                              });
                              setIsEditUserDialogOpen(true);
                            }}
                            data-testid={`button-edit-user-${user.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => deleteUserMutation.mutate(user.id)}
                            disabled={deleteUserMutation.isPending || user.id === currentUser?.id}
                            data-testid={`button-delete-user-${user.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {allUsers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={isSuperAdmin ? 5 : 4} className="text-center text-muted-foreground">
                        No team members found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tenants Tab */}
        <TabsContent value="tenants" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Tenant Management</CardTitle>
                <CardDescription>Manage clinic organizations</CardDescription>
              </div>
              <Button onClick={() => setIsCreateTenantDialogOpen(true)} data-testid="button-create-tenant">
                <Plus className="h-4 w-4 mr-2" />
                Add Tenant
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allTenants.map((tenant) => (
                    <TableRow key={tenant.id}>
                      <TableCell className="font-medium">{tenant.name}</TableCell>
                      <TableCell className="font-mono text-sm">{tenant.slug}</TableCell>
                      <TableCell>
                        <Badge variant={tenant.isDemo ? "secondary" : "default"}>
                          {tenant.isDemo ? "Demo" : "Production"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {format(new Date(tenant.createdAt), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => {
                            setEditTenantForm({
                              id: tenant.id,
                              name: tenant.name,
                              isDemo: tenant.isDemo,
                            });
                            setIsEditTenantDialogOpen(true);
                          }}
                          data-testid={`button-edit-tenant-${tenant.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {allTenants.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No tenants found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Team Member Dialog */}
      <Dialog open={isCreateUserDialogOpen} onOpenChange={setIsCreateUserDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Team Member</DialogTitle>
            <DialogDescription>Add a new clinician or administrator{!isSuperAdmin && " to your clinic"}.</DialogDescription>
          </DialogHeader>
          <form 
            onSubmit={(e) => { 
              e.preventDefault(); 
              createUserMutation.mutate(newUserForm); 
            }} 
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="user-name">Full Name</Label>
              <Input
                id="user-name"
                value={newUserForm.name}
                onChange={(e) => setNewUserForm({ ...newUserForm, name: e.target.value })}
                required
                data-testid="input-user-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-username">Username</Label>
              <Input
                id="user-username"
                value={newUserForm.username}
                onChange={(e) => setNewUserForm({ ...newUserForm, username: e.target.value })}
                required
                data-testid="input-user-username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-password">Password</Label>
              <Input
                id="user-password"
                type="password"
                value={newUserForm.password}
                onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                required
                minLength={8}
                data-testid="input-user-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-role">Role</Label>
              <Select 
                value={newUserForm.role} 
                onValueChange={(v) => setNewUserForm({ ...newUserForm, role: v })}
              >
                <SelectTrigger data-testid="select-user-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="clinician">Clinician</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  {isSuperAdmin && <SelectItem value="super_admin">Super Admin</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            {isSuperAdmin && (
              <div className="space-y-2">
                <Label htmlFor="user-tenant">Tenant</Label>
                <Select 
                  value={newUserForm.tenantId || "none"} 
                  onValueChange={(v) => setNewUserForm({ ...newUserForm, tenantId: v === "none" ? "" : v })}
                >
                  <SelectTrigger data-testid="select-user-tenant">
                    <SelectValue placeholder="Select tenant" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Tenant (Platform Admin)</SelectItem>
                    {allTenants.map((tenant) => (
                      <SelectItem key={tenant.id} value={tenant.id}>
                        {tenant.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsCreateUserDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createUserMutation.isPending} data-testid="button-submit-user">
                {createUserMutation.isPending ? "Creating..." : "Add Team Member"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create Tenant Dialog */}
      <Dialog open={isCreateTenantDialogOpen} onOpenChange={setIsCreateTenantDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Tenant</DialogTitle>
            <DialogDescription>Add a new clinic organization to the platform.</DialogDescription>
          </DialogHeader>
          <form 
            onSubmit={(e) => { 
              e.preventDefault(); 
              createTenantMutation.mutate(newTenantForm); 
            }} 
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="tenant-name">Clinic Name</Label>
              <Input
                id="tenant-name"
                value={newTenantForm.name}
                onChange={(e) => setNewTenantForm({ ...newTenantForm, name: e.target.value })}
                required
                placeholder="Mercy Hospital"
                data-testid="input-tenant-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tenant-slug">URL Slug</Label>
              <Input
                id="tenant-slug"
                value={newTenantForm.slug}
                onChange={(e) => setNewTenantForm({ ...newTenantForm, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })}
                required
                placeholder="mercy-hospital"
                data-testid="input-tenant-slug"
              />
              <p className="text-xs text-muted-foreground">URL-friendly identifier (lowercase, hyphens only)</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="tenant-demo"
                checked={newTenantForm.isDemo}
                onChange={(e) => setNewTenantForm({ ...newTenantForm, isDemo: e.target.checked })}
                className="h-4 w-4"
                data-testid="checkbox-tenant-demo"
              />
              <Label htmlFor="tenant-demo" className="text-sm font-normal">
                Demo tenant (sample data visible)
              </Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsCreateTenantDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createTenantMutation.isPending} data-testid="button-submit-tenant">
                {createTenantMutation.isPending ? "Creating..." : "Create Tenant"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Team Member Dialog */}
      <Dialog open={isEditUserDialogOpen} onOpenChange={setIsEditUserDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Team Member</DialogTitle>
            <DialogDescription>Update team member details.</DialogDescription>
          </DialogHeader>
          <form 
            onSubmit={(e) => { 
              e.preventDefault(); 
              updateUserMutation.mutate(editUserForm); 
            }} 
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="edit-user-name">Full Name</Label>
              <Input
                id="edit-user-name"
                value={editUserForm.name}
                onChange={(e) => setEditUserForm({ ...editUserForm, name: e.target.value })}
                required
                data-testid="input-edit-user-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-user-role">Role</Label>
              <Select 
                value={editUserForm.role} 
                onValueChange={(v) => setEditUserForm({ ...editUserForm, role: v })}
              >
                <SelectTrigger data-testid="select-edit-user-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="clinician">Clinician</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  {isSuperAdmin && <SelectItem value="super_admin">Super Admin</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            {isSuperAdmin && (
              <div className="space-y-2">
                <Label htmlFor="edit-user-tenant">Tenant</Label>
                <Select 
                  value={editUserForm.tenantId || "none"} 
                  onValueChange={(v) => setEditUserForm({ ...editUserForm, tenantId: v === "none" ? "" : v })}
                >
                  <SelectTrigger data-testid="select-edit-user-tenant">
                    <SelectValue placeholder="Select tenant" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Tenant (Platform Admin)</SelectItem>
                    {allTenants.map((tenant) => (
                      <SelectItem key={tenant.id} value={tenant.id}>
                        {tenant.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsEditUserDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateUserMutation.isPending} data-testid="button-update-user">
                {updateUserMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Tenant Dialog */}
      <Dialog open={isEditTenantDialogOpen} onOpenChange={setIsEditTenantDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Tenant</DialogTitle>
            <DialogDescription>Update tenant settings.</DialogDescription>
          </DialogHeader>
          <form 
            onSubmit={(e) => { 
              e.preventDefault(); 
              updateTenantMutation.mutate(editTenantForm); 
            }} 
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="edit-tenant-name">Clinic Name</Label>
              <Input
                id="edit-tenant-name"
                value={editTenantForm.name}
                onChange={(e) => setEditTenantForm({ ...editTenantForm, name: e.target.value })}
                required
                data-testid="input-edit-tenant-name"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="edit-tenant-demo"
                checked={editTenantForm.isDemo}
                onChange={(e) => setEditTenantForm({ ...editTenantForm, isDemo: e.target.checked })}
                className="h-4 w-4"
                data-testid="checkbox-edit-tenant-demo"
              />
              <Label htmlFor="edit-tenant-demo" className="text-sm font-normal">
                Demo tenant (sample data visible)
              </Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsEditTenantDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateTenantMutation.isPending} data-testid="button-update-tenant">
                {updateTenantMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Patient Detail</DialogTitle>
            <DialogDescription>
              {selectedCarePlan?.patient?.name || selectedCarePlan?.extractedPatientName}
              {patientHistory.length > 1 && ` - ${patientHistory.length} visits`}
            </DialogDescription>
          </DialogHeader>
          
          {selectedCarePlan && (
            <Tabs value={detailTab} onValueChange={(v) => setDetailTab(v as "current" | "history")} className="flex-1 flex flex-col overflow-hidden">
              <TabsList className="shrink-0">
                <TabsTrigger value="current" className="gap-2" data-testid="tab-current-visit">
                  <FileText className="h-4 w-4" />
                  Current Visit
                </TabsTrigger>
                <TabsTrigger value="history" className="gap-2" data-testid="tab-visit-history">
                  <Clock className="h-4 w-4" />
                  Visit History
                  {patientHistory.length > 1 && (
                    <Badge variant="secondary" className="ml-1 h-5 min-w-5 p-0 justify-center">
                      {patientHistory.length}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="current" className="flex-1 overflow-hidden mt-4">
                <ScrollArea className="h-full pr-4">
                  <div className="space-y-6">
                    {/* Patient Info */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs text-muted-foreground uppercase">Patient</Label>
                        <p className="font-medium">{selectedCarePlan.patient?.name || selectedCarePlan.extractedPatientName}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground uppercase">Email</Label>
                        <p>{selectedCarePlan.patient?.email || "-"}</p>
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
                        {selectedCarePlan.auditLogs?.map((log) => (
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
                </ScrollArea>
              </TabsContent>

              <TabsContent value="history" className="flex-1 overflow-hidden mt-4">
                <ScrollArea className="h-full pr-4">
                  <div className="space-y-4">
                    {patientHistory.length === 0 ? (
                      <p className="text-muted-foreground text-center py-8">No visit history available</p>
                    ) : (
                      patientHistory
                        .sort((a, b) => {
                          const dateA = a.dischargeDate ? new Date(a.dischargeDate) : new Date(a.createdAt);
                          const dateB = b.dischargeDate ? new Date(b.dischargeDate) : new Date(b.createdAt);
                          return dateB.getTime() - dateA.getTime();
                        })
                        .map((plan, index) => (
                          <div 
                            key={plan.id} 
                            className={`p-4 rounded-lg border ${plan.id === selectedCarePlan.id ? "border-primary bg-primary/5" : ""}`}
                            data-testid={`history-item-${plan.id}`}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-medium">Visit {patientHistory.length - index}</span>
                                  {plan.id === selectedCarePlan.id && (
                                    <Badge variant="outline" className="text-xs">Current</Badge>
                                  )}
                                  {getStatusBadge(plan.status)}
                                </div>
                                <p className="text-sm text-muted-foreground mb-2">
                                  {plan.diagnosis?.slice(0, 60)}{(plan.diagnosis?.length || 0) > 60 ? "..." : ""}
                                </p>
                                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    {plan.dischargeDate 
                                      ? format(new Date(plan.dischargeDate), "MMM d, yyyy")
                                      : format(new Date(plan.createdAt), "MMM d, yyyy")
                                    }
                                  </span>
                                  <span>
                                    {SUPPORTED_LANGUAGES.find(l => l.code === plan.translatedLanguage)?.name || "-"}
                                  </span>
                                </div>
                              </div>
                              {plan.id !== selectedCarePlan.id && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setSelectedCarePlan(plan)}
                                  data-testid={`button-view-visit-${plan.id}`}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        ))
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
