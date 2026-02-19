import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient, apiRequest } from "./lib/queryClient";
import { QueryClientProvider, useQuery, useMutation } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
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
} from "lucide-react";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import ClinicianDashboard from "@/pages/clinician-dashboard";
import AdminDashboard from "@/pages/admin-dashboard";
import InterpreterDashboard from "@/pages/interpreter-dashboard";
import PatientPortal from "@/pages/patient-portal";

interface User {
  id: string;
  name: string;
  role: string;
  tenantId?: string | null;
  tenant?: { id: string; name: string; isDemo: boolean } | null;
}

function PasswordChangeDialog() {
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const { toast } = useToast();
  
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
      toast({
        title: "Error",
        description: error.message || "Failed to change password",
        variant: "destructive",
      });
    },
  });
  
  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
  };
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({
        title: "Error",
        description: "New passwords do not match",
        variant: "destructive",
      });
      return;
    }
    if (newPassword.length < 8) {
      toast({
        title: "Error",
        description: "New password must be at least 8 characters",
        variant: "destructive",
      });
      return;
    }
    changePasswordMutation.mutate({ currentPassword, newPassword });
  };
  
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
            Enter your current password and choose a new password (minimum 8 characters).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="current-password">Current Password</Label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              data-testid="input-current-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">New Password</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              data-testid="input-new-password"
            />
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
              disabled={changePasswordMutation.isPending}
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

  const mainNavItems = [
    {
      title: "Clinician Dashboard",
      icon: Stethoscope,
      href: "/",
      roles: ["clinician"],
    },
    {
      title: "Admin Dashboard",
      icon: LayoutDashboard,
      href: "/admin",
      roles: ["admin", "super_admin"],
    },
    {
      title: "Interpreter Dashboard",
      icon: Languages,
      href: "/interpreter",
      roles: ["interpreter"],
    },
  ];

  const phase2Items = [
    {
      title: "Analytics",
      icon: BarChart3,
      href: "/analytics",
    },
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
    {
      title: "Settings",
      icon: Settings,
      href: "/settings",
    },
  ];

  const filteredNav = mainNavItems.filter(item => item.roles.includes(user.role));

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
              {filteredNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    asChild 
                    isActive={location === item.href}
                    data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <a href={item.href}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </a>
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
              {phase2Items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    asChild 
                    isActive={location === item.href}
                    data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <a href={item.href}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </a>
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
            <p className="text-xs text-muted-foreground capitalize">{user.role}</p>
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
            <li>SMS and push notifications</li>
            <li>Provider directory integration</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function AuthenticatedRoutes({ user }: { user: User }) {
  return (
    <Switch>
      <Route path="/">
        {user.role === "admin" || user.role === "super_admin" ? (
          <Redirect to="/admin" />
        ) : user.role === "interpreter" ? (
          <Redirect to="/interpreter" />
        ) : (
          <MainLayout user={user}>
            <ClinicianDashboard />
          </MainLayout>
        )}
      </Route>
      <Route path="/admin">
        {user.role === "admin" || user.role === "super_admin" ? (
          <MainLayout user={user}>
            <AdminDashboard />
          </MainLayout>
        ) : (
          <Redirect to="/" />
        )}
      </Route>
      <Route path="/interpreter">
        {user.role === "interpreter" ? (
          <MainLayout user={user}>
            <InterpreterDashboard />
          </MainLayout>
        ) : (
          <Redirect to="/" />
        )}
      </Route>
      <Route path="/analytics">
        <MainLayout user={user}>
          <ComingSoonPage title="Analytics Dashboard" />
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
          <ComingSoonPage title="Settings" />
        </MainLayout>
      </Route>
      <Route component={NotFound} />
    </Switch>
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
      return <Redirect to="/" />;
    }
    return <Login />;
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
