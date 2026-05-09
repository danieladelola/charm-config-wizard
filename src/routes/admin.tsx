import { createFileRoute, Outlet, Link, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  LayoutDashboard,
  Inbox,
  MessageSquare,
  MessageSquareDot,
  Archive,
  Users,
  Zap,
  Settings,
  Clock,
  BarChart3,
  Sliders,
  LogOut,
  Menu,
  Sun,
  Moon,
  Bell,
  Circle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

const NAV = [
  { to: "/admin", icon: LayoutDashboard, label: "Dashboard", end: true },
  { to: "/admin/inbox", icon: Inbox, label: "Inbox" },
  { to: "/admin/inbox", icon: MessageSquare, label: "Active Chats", search: { f: "open" } },
  { to: "/admin/inbox", icon: MessageSquareDot, label: "Unread", search: { f: "unread" } },
  { to: "/admin/inbox", icon: Archive, label: "Closed", search: { f: "closed" } },
  { to: "/admin/visitors", icon: Users, label: "Visitors" },
  { to: "/admin/saved-replies", icon: Zap, label: "Saved Replies" },
  { to: "/admin/analytics", icon: BarChart3, label: "Analytics" },
  { to: "/admin/settings", icon: Sliders, label: "Widget Settings" },
] as const;

function AdminLayout() {
  const { isAuthenticated, loading, signOut, user } = useAuth();
  const { theme, toggle } = useTheme();
  const nav = useNavigate();
  const loc = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (!loading && !isAuthenticated) nav({ to: "/login" });
  }, [isAuthenticated, loading, nav]);

  // close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [loc.pathname]);

  // request notification permission on mount
  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // admin presence heartbeat
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const ping = async (isOnline: boolean) => {
      if (cancelled) return;
      await supabase
        .from("admin_profile")
        .update({ online: isOnline, last_seen_at: new Date().toISOString() })
        .eq("id", user.id);
    };
    ping(online);
    const i = setInterval(() => ping(online), 30_000);
    const off = () => ping(false);
    window.addEventListener("beforeunload", off);
    return () => {
      cancelled = true;
      clearInterval(i);
      window.removeEventListener("beforeunload", off);
    };
  }, [user, online]);

  if (loading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        <div className="flex items-center gap-2 text-sm">
          <span className="h-3 w-3 animate-pulse rounded-full bg-primary" />
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full overflow-x-hidden bg-muted/30 text-foreground">
      {/* Desktop sidebar */}
      <SidebarNav className="hidden md:flex" />

      {/* Mobile sheet */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SidebarNav className="flex h-full" />
        </SheetContent>
      </Sheet>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur sm:px-5">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
          </Sheet>

          <div className="ml-1 min-w-0 truncate text-sm font-semibold tracking-tight sm:text-base">{pageTitle(loc.pathname)}</div>

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <label className="hidden items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs sm:flex">
              <Circle className={`h-2 w-2 ${online ? "fill-emerald-500 text-emerald-500" : "fill-muted-foreground text-muted-foreground"}`} />
              <span className="text-muted-foreground">{online ? "Online" : "Away"}</span>
              <Switch checked={online} onCheckedChange={setOnline} className="ml-1 scale-75" />
            </label>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                if (typeof Notification !== "undefined" && Notification.permission === "default") {
                  Notification.requestPermission();
                }
              }}
              title="Notifications"
            >
              <Bell className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <div className="hidden items-center gap-2 rounded-full border bg-card px-2.5 py-1 text-xs sm:flex">
              <div className="grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground text-[11px] font-semibold">
                {(user?.email ?? "A").slice(0, 1).toUpperCase()}
              </div>
              <span className="max-w-[140px] truncate text-muted-foreground">{user?.email}</span>
            </div>
            <Button variant="ghost" size="icon" onClick={() => signOut()} title="Sign out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <main className="w-full min-w-0 flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function pageTitle(path: string) {
  if (path === "/admin" || path === "/admin/") return "Dashboard";
  if (path.startsWith("/admin/inbox")) return "Inbox";
  if (path.startsWith("/admin/visitors")) return "Visitors";
  if (path.startsWith("/admin/saved-replies")) return "Saved Replies";
  if (path.startsWith("/admin/analytics")) return "Analytics";
  if (path.startsWith("/admin/settings")) return "Widget Settings";
  return "Admin";
}

function SidebarNav({ className = "" }: { className?: string }) {
  const loc = useLocation();
  const isActive = (to: string, end?: boolean, search?: Record<string, string>) => {
    if (end) return loc.pathname === to || loc.pathname === to + "/";
    // TanStack Router: loc.search is a parsed object, not a string
    const cur = (loc.search ?? {}) as Record<string, unknown>;
    if (search) {
      return (
        loc.pathname === to &&
        Object.entries(search).every(([k, v]) => String(cur[k] ?? "") === v)
      );
    }
    return loc.pathname === to && Object.keys(cur).length === 0;
  };

  return (
    <aside className={`w-64 shrink-0 flex-col border-r bg-card ${className}`}>
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
          <MessageSquare className="h-4 w-4" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold">TradesHorizons</span>
          <span className="text-[11px] text-muted-foreground">Live Chat Console</span>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        <SectionLabel>Workspace</SectionLabel>
        {NAV.slice(0, 5).map((it) => (
          <NavItem
            key={it.label}
            to={it.to}
            icon={it.icon}
            label={it.label}
            active={isActive(it.to, "end" in it ? it.end : undefined, "search" in it ? it.search : undefined)}
            search={"search" in it ? it.search : undefined}
          />
        ))}
        <div className="my-2" />
        <SectionLabel>People</SectionLabel>
        {NAV.slice(5, 6).map((it) => (
          <NavItem key={it.label} to={it.to} icon={it.icon} label={it.label} active={isActive(it.to)} />
        ))}
        <div className="my-2" />
        <SectionLabel>Tools</SectionLabel>
        {NAV.slice(6).map((it) => (
          <NavItem key={it.label} to={it.to} icon={it.icon} label={it.label} active={isActive(it.to)} />
        ))}
      </nav>
      <div className="border-t p-3">
        <div className="rounded-lg bg-muted/60 p-3 text-xs">
          <div className="mb-1 flex items-center gap-1.5 font-semibold">
            <Clock className="h-3 w-3" /> Tip
          </div>
          <p className="text-muted-foreground">
            Press <kbd className="rounded border bg-background px-1 text-[10px]">/</kbd> to search chats.
          </p>
        </div>
      </div>
    </aside>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">{children}</div>;
}

function NavItem({
  to,
  icon: Icon,
  label,
  active,
  search,
}: {
  to: string;
  icon: typeof Settings;
  label: string;
  active?: boolean;
  search?: Record<string, string>;
}) {
  return (
    <Link
      to={to}
      search={search as never}
      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
        active ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground/70 hover:bg-muted hover:text-foreground"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}
