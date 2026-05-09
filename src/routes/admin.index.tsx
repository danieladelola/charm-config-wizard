import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ChatSession, ChatMessage, VisitorProfile } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  MessageSquare,
  Inbox,
  MessageSquareDot,
  Archive,
  Clock,
  Users,
  ArrowRight,
  Activity,
  Mail,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/admin/")({
  component: Dashboard,
});

interface Stats {
  total: number;
  active: number;
  pending: number;
  unread: number;
  closed: number;
  visitorsToday: number;
  avgResponseSec: number | null;
}

function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<ChatSession[]>([]);
  const [visitors, setVisitors] = useState<Record<string, VisitorProfile>>({});

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const since = new Date();
      since.setHours(0, 0, 0, 0);

      const [sessionsRes, messagesRes, todayVisitorsRes] = await Promise.all([
        supabase.from("chat_sessions").select("*").order("last_message_at", { ascending: false }),
        supabase.from("chat_messages").select("session_id,sender,created_at").order("created_at"),
        supabase.from("visitor_profiles").select("id").gte("created_at", since.toISOString()),
      ]);

      if (!alive) return;
      const sessions = (sessionsRes.data ?? []) as ChatSession[];
      const messages = (messagesRes.data ?? []) as Pick<ChatMessage, "session_id" | "sender" | "created_at">[];

      // Avg first response time: visitor msg → first admin msg same session
      const byS = new Map<string, typeof messages>();
      messages.forEach((m) => {
        const arr = byS.get(m.session_id) ?? [];
        arr.push(m);
        byS.set(m.session_id, arr);
      });
      const diffs: number[] = [];
      byS.forEach((arr) => {
        const v = arr.find((m) => m.sender === "visitor");
        if (!v) return;
        const a = arr.find((m) => m.sender === "admin" && new Date(m.created_at) > new Date(v.created_at));
        if (a) diffs.push((new Date(a.created_at).getTime() - new Date(v.created_at).getTime()) / 1000);
      });
      const avg = diffs.length ? diffs.reduce((s, n) => s + n, 0) / diffs.length : null;

      setStats({
        total: sessions.length,
        active: sessions.filter((s) => s.status === "open").length,
        pending: sessions.filter((s) => s.status === "pending").length,
        unread: sessions.reduce((s, x) => s + (x.unread_for_admin || 0), 0),
        closed: sessions.filter((s) => s.status === "closed").length,
        visitorsToday: todayVisitorsRes.data?.length ?? 0,
        avgResponseSec: avg,
      });
      setRecent(sessions.slice(0, 8));

      const ids = Array.from(new Set(sessions.slice(0, 8).map((s) => s.visitor_id)));
      if (ids.length) {
        const { data: vs } = await supabase.from("visitor_profiles").select("*").in("id", ids);
        const map: Record<string, VisitorProfile> = {};
        (vs as VisitorProfile[] | null)?.forEach((v) => (map[v.id] = v));
        if (alive) setVisitors(map);
      }
    };
    load();
    const ch = supabase
      .channel("dashboard-stats")
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_sessions" }, () => load())
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(ch);
    };
  }, []);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Welcome back 👋</h1>
            <p className="text-sm text-muted-foreground">Here's what's happening with your chats today.</p>
          </div>
          <Button asChild>
            <Link to="/admin/inbox">
              Open inbox <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
          <StatCard label="Total chats" value={stats?.total} icon={Inbox} tone="primary" />
          <StatCard label="Active" value={stats?.active} icon={MessageSquare} tone="emerald" />
          <StatCard label="Unread messages" value={stats?.unread} icon={MessageSquareDot} tone="rose" />
          <StatCard label="Pending" value={stats?.pending} icon={Clock} tone="amber" />
          <StatCard label="Closed" value={stats?.closed} icon={Archive} tone="slate" />
          <StatCard label="Visitors today" value={stats?.visitorsToday} icon={Users} tone="violet" />
          <StatCard
            label="Avg response"
            value={stats?.avgResponseSec == null ? "—" : formatDuration(stats.avgResponseSec)}
            icon={Activity}
            tone="sky"
          />
          <StatCard
            label="Offline messages"
            value={stats ? stats.pending : undefined}
            icon={Mail}
            tone="indigo"
            hint="New chats waiting"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Recent chats</CardTitle>
              <Button asChild variant="ghost" size="sm">
                <Link to="/admin/inbox">View all</Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {!stats &&
                Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
              {stats && recent.length === 0 && (
                <EmptyState icon={MessageSquare} title="No chats yet" hint="When visitors start a chat, they'll appear here." />
              )}
              {recent.map((s) => {
                const v = visitors[s.visitor_id];
                return (
                  <Link
                    to="/admin/inbox"
                    search={{ s: s.id }}
                    key={s.id}
                    className="flex items-center gap-3 rounded-lg p-2.5 transition-colors hover:bg-muted"
                  >
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold">
                      {(v?.name ?? "?").slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{v?.name || "Anonymous"}</span>
                        <StatusBadge status={s.status} />
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{v?.email || s.domain || s.page_url}</div>
                    </div>
                    <div className="shrink-0 text-right text-[10px] text-muted-foreground sm:text-[11px]">
                      <span className="hidden sm:inline">
                        {formatDistanceToNow(new Date(s.last_message_at), { addSuffix: true })}
                      </span>
                      <span className="sm:hidden">
                        {formatDistanceToNow(new Date(s.last_message_at), { addSuffix: false })}
                      </span>
                      {s.unread_for_admin > 0 && (
                        <Badge variant="destructive" className="ml-1 h-4 px-1.5 text-[10px] sm:ml-2">
                          {s.unread_for_admin}
                        </Badge>
                      )}
                    </div>
                  </Link>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {!stats && <Skeleton className="h-32 w-full" />}
              {stats && (
                <ul className="space-y-3 text-sm">
                  <ActivityRow dot="emerald" label={`${stats.active} active conversations`} />
                  <ActivityRow dot="amber" label={`${stats.pending} new chats waiting`} />
                  <ActivityRow dot="rose" label={`${stats.unread} unread messages`} />
                  <ActivityRow dot="violet" label={`${stats.visitorsToday} visitors today`} />
                  <ActivityRow dot="slate" label={`${stats.closed} resolved`} />
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function formatDuration(sec: number) {
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  return `${(sec / 3600).toFixed(1)}h`;
}

const TONES: Record<string, string> = {
  primary: "bg-primary/10 text-primary",
  emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  slate: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
  violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  sky: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  indigo: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
};

function StatCard({
  label,
  value,
  icon: Icon,
  tone = "primary",
  hint,
}: {
  label: string;
  value: number | string | undefined;
  icon: typeof MessageSquare;
  tone?: keyof typeof TONES;
  hint?: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${TONES[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-medium text-muted-foreground">{label}</div>
          {value === undefined ? (
            <Skeleton className="mt-1 h-6 w-12" />
          ) : (
            <div className="text-xl font-semibold tracking-tight">{value}</div>
          )}
          {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: ChatSession["status"] }) {
  const map: Record<ChatSession["status"], string> = {
    open: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    pending: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    closed: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
  };
  return <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium capitalize ${map[status]}`}>{status}</span>;
}

function ActivityRow({ dot, label }: { dot: string; label: string }) {
  return (
    <li className="flex items-center gap-2.5">
      <span className={`h-2 w-2 rounded-full bg-${dot}-500`} style={{ background: dotColor(dot) }} />
      <span>{label}</span>
    </li>
  );
}
function dotColor(d: string) {
  const m: Record<string, string> = {
    emerald: "#10b981",
    amber: "#f59e0b",
    rose: "#f43f5e",
    violet: "#8b5cf6",
    slate: "#64748b",
  };
  return m[d] || "#64748b";
}

function EmptyState({ icon: Icon, title, hint }: { icon: typeof MessageSquare; title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-muted">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="text-sm font-medium">{title}</div>
      <div className="max-w-xs text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}
