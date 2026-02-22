import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient, apiRequest } from "./lib/queryClient";
import { QueryClientProvider, useQuery, useMutation } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { useToast } from "@/hooks/use-toast";
import { useState, createContext, useContext, useEffect } from "react";
import { 
  SidebarProvider, 
  SidebarTrigger,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { 
  Stethoscope, 
  LayoutDashboard,
  Heart,
  LogOut,
  BarChart3,
  Settings,
  Users,
  Bell,
  Video,
  Building2,
  Key,
  Languages,
  Check,
} from "lucide-react";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import ClinicianDashboard from "@/pages/clinician-dashboard";
import AdminDashboard from "@/pages/admin-dashboard";
import InterpreterDashboard from "@/pages/interpreter-dashboard";
import PatientPortal from "@/pages/patient-portal";
import SettingsPage from "@/pages/settings-page";
import AnalyticsPage from "@/pages/analytics-page";
import ExperimentsHub from "@/pages/experiments-hub";
import ExperimentComprehension from "@/pages/experiment-comprehension";
import ExperimentLoginDemo from "@/pages/experiment-login-demo";
import ExperimentInterpreter from "@/pages/experiment-interpreter";
import AcceptInvite from "@/pages/accept-invite";
import ResetPassword from "@/pages/reset-password";

interface User {
  id: string;
  name: string;
  role: string;
  roles: string[];
  tenantId?: string | null;
  tenant?: { id: string; name: string; isDemo: boolean } | null;
}

type DashboardTab = "clinician" | "admin" | "interpreter";

const DashboardTabContext = createContext<{
  activeTab: DashboardTab;
  setActiveTab: (tab: DashboardTab) => void;
}>({ activeTab: "clinician", setActiveTab: () => {} });

function PasswordChangeDialog() {
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [serverError, setServerError] = useState("");
  const { toast } = useToast();

  const hasMinLength = newPassword.length >= 8;
  const hasUppercase = /[A-Z]/.test(newPassword);
  const hasLowercase = /[a-z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const hasSpecial = /[^A-Za-z0-9]/.test(newPassword);
  const passwordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;
  const allValid = hasMinLength && hasUppercase && hasLowercase && hasNumber && hasSpecial && passwordsMatch;
  
  const changePasswordMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      const response = await apiRequest("POST", "/api/auth/change-password", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Password Changed",
        description: "Your password has been updated successfully.",
      });
      handleOpenChange(false);
    },
    onError: (error: Error) => {
      setServerError(error.message || "Failed to change password");
    },
  });
  
  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setServerError("");
    }
  };
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setServerError("");
    if (!allValid) return;
    changePasswordMutation.mutate({ currentPassword, newPassword });
  };

  const CheckItem = ({ met, label }: { met: boolean; label: string }) => (
    <div className={`flex items-center gap-1.5 text-xs ${met ? "text-green-600" : "text-muted-foreground"}`}>
      {met ? <Check className="h-3 w-3" /> : <span className="h-3 w-3 rounded-full border border-muted-foreground/40 inline-block" />}
      {label}
    </div>
  );
  
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className="w-full justify-start"
          data-testid="button-change-password"
        >
          <Key className="h-4 w-4 mr-2" />
          Change Password
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change Password</DialogTitle>
          <DialogDescription>
            Enter your current password and choose a new password.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="current-password">Current Password</Label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => { setCurrentPassword(e.target.value); setServerError(""); }}
              required
              data-testid="input-current-password"
            />
            {serverError && (
              <p className="text-xs text-destructive">{serverError}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">New Password</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              data-testid="input-new-password"
            />
            {newPassword.length > 0 && (
              <div className="grid grid-cols-2 gap-1 mt-1">
                <CheckItem met={hasMinLength} label="8+ characters" />
                <CheckItem met={hasUppercase} label="Uppercase letter" />
                <CheckItem met={hasLowercase} label="Lowercase letter" />
                <CheckItem met={hasNumber} label="Number" />
                <CheckItem met={hasSpecial} label="Special character" />
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm New Password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              data-testid="input-confirm-password"
            />
            {confirmPassword.length > 0 && !passwordsMatch && (
              <p className="text-xs text-destructive">Passwords do not match</p>
            )}
            {passwordsMatch && (
              <p className="text-xs text-green-600">Passwords match</p>
            )}
          </div>
          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              data-testid="button-cancel-password-change"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={changePasswordMutation.isPending || !allValid}
              data-testid="button-submit-password-change"
            >
              {changePasswordMutation.isPending ? "Changing..." : "Change Password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function useAuth() {
  return useQuery<User>({
    queryKey: ["/api/auth/me"],
    retry: false,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

function AppSidebar({ user }: { user: User }) {
  const [location, navigate] = useLocation();
  const { activeTab, setActiveTab } = useContext(DashboardTabContext);

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Logout failed");
      return response.json();
    },
    onSuccess: () => {
      queryClient.clear();
      navigate("/login");
    },
  });

  const dashboardNavItems: { title: string; icon: typeof Stethoscope; tab: DashboardTab; roles: string[] }[] = [
    {
      title: "Clinician Dashboard",
      icon: Stethoscope,
      tab: "clinician",
      roles: ["clinician", "admin", "super_admin"],
    },
    {
      title: "Admin Dashboard",
      icon: LayoutDashboard,
      tab: "admin",
      roles: ["admin", "super_admin"],
    },
    {
      title: "Interpreter Dashboard",
      icon: Languages,
      tab: "interpreter",
      roles: ["interpreter"],
    },
  ];

  const toolsNavItems = [
    {
      title: "Analytics",
      icon: BarChart3,
      href: "/analytics",
    },
    {
      title: "Settings",
      icon: Settings,
      href: "/settings",
    },
  ];

  const comingSoonItems = [
    {
      title: "Provider Directory",
      icon: Building2,
      href: "/providers",
    },
    {
      title: "Video Library",
      icon: Video,
      href: "/videos",
    },
    {
      title: "Notifications",
      icon: Bell,
      href: "/notifications",
    },
  ];

  const userRoles = user.roles || [user.role];
  const filteredDashboardNav = dashboardNavItems.filter(item => item.roles.some(r => userRoles.includes(r)));

  const handleDashboardTabClick = (tab: DashboardTab) => {
    if (location !== "/dashboard") {
      navigate("/dashboard");
    }
    setActiveTab(tab);
  };

  return (
    <Sidebar>
      <SidebarHeader className="p-4 border-b">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
            <Heart className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-bold text-lg">Litera.ai</h1>
            <p className="text-xs text-muted-foreground">Healthcare Companion</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Main</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredDashboardNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    isActive={location === "/dashboard" && activeTab === item.tab}
                    onClick={() => handleDashboardTabClick(item.tab)}
                    data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Tools</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {toolsNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    isActive={location === item.href}
                    onClick={() => navigate(item.href)}
                    data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Coming Soon</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {comingSoonItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    isActive={location === item.href}
                    onClick={() => navigate(item.href)}
                    data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4 border-t">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Users className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user.name}</p>
            <p className="text-xs text-muted-foreground capitalize">{(user.roles || [user.role]).join(" · ")}</p>
          </div>
        </div>
        <div className="space-y-2">
          <PasswordChangeDialog />
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full"
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            data-testid="button-logout"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

function MainLayout({ children, user }: { children: React.ReactNode; user: User }) {
  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar user={user} />
        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="flex items-center justify-between h-14 px-4 border-b bg-card shrink-0">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <ThemeToggle />
          </header>
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function ComingSoonPage({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Settings className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-2xl font-bold mb-2">{title}</h1>
        <p className="text-muted-foreground mb-6">
          This feature is coming in Phase 2. We're working hard to bring you enhanced capabilities for better patient care.
        </p>
        <div className="p-4 bg-muted rounded-lg text-sm text-left">
          <p className="font-medium mb-2">Planned Features:</p>
          <ul className="list-disc list-inside text-muted-foreground space-y-1">
            <li>Advanced analytics and reporting</li>
            <li>Video content library for patient education</li>
            <li>Push notifications</li>
            <li>Provider directory integration</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function getDefaultTab(user: User): DashboardTab {
  const roles = user.roles || [user.role];
  if (roles.includes("admin") || roles.includes("super_admin")) return "admin";
  if (roles.includes("clinician")) return "clinician";
  if (roles.includes("interpreter")) return "interpreter";
  return "clinician";
}

const LEGACY_TAB_MAP: Record<string, DashboardTab> = {
  "/clinician": "clinician",
  "/admin": "admin",
  "/interpreter": "interpreter",
};

function AuthenticatedRoutes({ user }: { user: User }) {
  const [location, navigate] = useLocation();

  const legacyTab = LEGACY_TAB_MAP[location];
  const initialTab = legacyTab || getDefaultTab(user);

  const [activeTab, setActiveTab] = useState<DashboardTab>(initialTab);

  useEffect(() => {
    if (legacyTab) {
      setActiveTab(legacyTab);
      navigate("/dashboard", { replace: true });
    }
  }, [legacyTab, navigate]);

  useEffect(() => {
    if (location === "/") {
      navigate("/dashboard", { replace: true });
    }
  }, [location, navigate]);

  const roles = user.roles || [user.role];
  const hasRole = (r: string) => roles.includes(r);
  const isAdmin = hasRole("admin") || hasRole("super_admin");
  const isClinician = hasRole("clinician");
  const isInterpreter = hasRole("interpreter");

  const canAccessClinician = isClinician || isAdmin;
  const canAccessAdmin = isAdmin;
  const canAccessInterpreter = isInterpreter;

  const isDashboard = location === "/dashboard" || location === "/" || !!legacyTab;

  return (
    <DashboardTabContext.Provider value={{ activeTab, setActiveTab }}>
      {isDashboard ? (
        <MainLayout user={user}>
          {canAccessClinician && (
            <div style={{ display: activeTab === "clinician" ? "block" : "none" }} className="h-full">
              <ClinicianDashboard />
            </div>
          )}
          {canAccessAdmin && (
            <div style={{ display: activeTab === "admin" ? "block" : "none" }} className="h-full">
              <AdminDashboard />
            </div>
          )}
          {canAccessInterpreter && (
            <div style={{ display: activeTab === "interpreter" ? "block" : "none" }} className="h-full">
              <InterpreterDashboard />
            </div>
          )}
        </MainLayout>
      ) : (
        <Switch>
          <Route path="/analytics">
            <MainLayout user={user}>
              <AnalyticsPage />
            </MainLayout>
          </Route>
          <Route path="/providers">
            <MainLayout user={user}>
              <ComingSoonPage title="Provider Directory" />
            </MainLayout>
          </Route>
          <Route path="/videos">
            <MainLayout user={user}>
              <ComingSoonPage title="Video Library" />
            </MainLayout>
          </Route>
          <Route path="/notifications">
            <MainLayout user={user}>
              <ComingSoonPage title="Notification Settings" />
            </MainLayout>
          </Route>
          <Route path="/settings">
            <MainLayout user={user}>
              <SettingsPage />
            </MainLayout>
          </Route>
          <Route component={NotFound} />
        </Switch>
      )}
    </DashboardTabContext.Provider>
  );
}

function Router() {
  const { data: user, isLoading, error } = useAuth();
  const [location] = useLocation();

  // Patient portal route - uses wouter Route for proper token extraction
  if (location.startsWith("/p/")) {
    return (
      <Switch>
        <Route path="/p/:token" component={PatientPortal} />
        <Route component={NotFound} />
      </Switch>
    );
  }

  if (location.startsWith("/invite/")) {
    return (
      <Switch>
        <Route path="/invite/:token" component={AcceptInvite} />
        <Route component={NotFound} />
      </Switch>
    );
  }

  if (location.startsWith("/experiments")) {
    return (
      <Switch>
        <Route path="/experiments/comprehension" component={ExperimentComprehension} />
        <Route path="/experiments/login-demo" component={ExperimentLoginDemo} />
        <Route path="/experiments/interpreter" component={ExperimentInterpreter} />
        <Route path="/experiments" component={ExperimentsHub} />
        <Route component={NotFound} />
      </Switch>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Heart className="h-12 w-12 text-primary mx-auto mb-4 animate-pulse" />
          <Skeleton className="h-4 w-32 mx-auto" />
        </div>
      </div>
    );
  }

  if (location === "/login") {
    if (user) {
      return <Redirect to="/dashboard" />;
    }
    return <Login />;
  }

  if (location === "/reset-password") {
    return <ResetPassword />;
  }

  if (error || !user) {
    return <Redirect to="/login" />;
  }

  return <AuthenticatedRoutes user={user} />;
}

function App() {
  return (
    <ThemeProvider defaultTheme="light">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
