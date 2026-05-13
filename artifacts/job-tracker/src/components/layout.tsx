import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  Briefcase, 
  Building2, 
  BarChart2, 
  CreditCard, 
  Bell, 
  Sparkles, 
  LayoutDashboard,
  LogOut,
  Menu,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/applications", label: "Applications", icon: Briefcase },
  { href: "/companies", label: "Companies", icon: Building2 },
  { href: "/analytics", label: "Analytics", icon: BarChart2 },
  { href: "/ai", label: "AI Insights", icon: Sparkles },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/payments", label: "Billing", icon: CreditCard },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { data: user, isLoading } = useGetMe({
    query: {
      retry: false,
    }
  });
  const queryClient = useQueryClient();
  const isMobile = useMobile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/login");
    }
  }, [user, isLoading, setLocation]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location]);

  if (isLoading || !user) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;
  }

  const handleLogout = () => {
    localStorage.removeItem("jt_token");
    queryClient.clear();
    window.location.href = "/login";
  };

  const SidebarContent = () => (
    <>
      <div className="p-6 border-b">
        <Link href="/">
          <div className="flex items-center gap-2 font-bold text-xl text-primary tracking-tight cursor-pointer">
            <div className="w-8 h-8 rounded bg-primary text-primary-foreground flex items-center justify-center">
              <Briefcase className="w-5 h-5" />
            </div>
            JobFlow
          </div>
        </Link>
      </div>
      
      <div className="flex-1 overflow-y-auto py-6 px-4 flex flex-col gap-1">
        {navItems.map((item) => {
          const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href}>
              <div className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors cursor-pointer",
                isActive 
                  ? "bg-primary text-primary-foreground" 
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}>
                <item.icon className="w-5 h-5" />
                {item.label}
              </div>
            </Link>
          );
        })}
      </div>

      <div className="p-4 border-t">
        <div className="flex items-center gap-3 px-2 py-2">
          <Avatar>
            <AvatarFallback className="bg-primary/10 text-primary">
              {user.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user.name}</p>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>
        </div>
        <Button variant="ghost" className="w-full justify-start mt-2 text-muted-foreground hover:text-foreground" onClick={handleLogout}>
          <LogOut className="w-4 h-4 mr-2" />
          Logout
        </Button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-background flex w-full">
      {/* Desktop Sidebar */}
      {!isMobile && (
        <div className="w-64 border-r bg-card flex flex-col fixed inset-y-0 z-20">
          <SidebarContent />
        </div>
      )}

      {/* Mobile Header */}
      {isMobile && (
        <div className="fixed top-0 inset-x-0 h-16 border-b bg-card z-30 flex items-center justify-between px-4">
          <div className="flex items-center gap-2 font-bold text-lg text-primary">
            <div className="w-6 h-6 rounded bg-primary text-primary-foreground flex items-center justify-center">
              <Briefcase className="w-4 h-4" />
            </div>
            JobFlow
          </div>
          <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X /> : <Menu />}
          </Button>
        </div>
      )}

      {/* Mobile Menu Overlay */}
      {isMobile && mobileMenuOpen && (
        <div className="fixed inset-0 top-16 bg-card z-20 flex flex-col border-t animate-in fade-in slide-in-from-top-4">
          <SidebarContent />
        </div>
      )}

      {/* Main Content */}
      <div className={cn(
        "flex-1 flex flex-col min-w-0",
        !isMobile && "ml-64",
        isMobile && "mt-16"
      )}>
        <main className="flex-1 p-6 md:p-8 max-w-6xl mx-auto w-full">
          {children}
        </main>
      </div>
    </div>
  );
}
