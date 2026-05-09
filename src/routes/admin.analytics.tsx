import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ChatSession, ChatMessage, VisitorProfile } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, Globe, Link2, Activity, Users } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { format, subDays, startOfDay } from "date-fns";

export const Route = createFileRoute("/admin/analytics")({
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const [sessions, setSessions] = useState<ChatSession[] | null>(null);
  const [messages, setMessages] = useState<Pick<ChatMessage, "session_id" | "sender" | "created_at">[] | null>(null);
  const [visitors, setVisitors] = useState<Pick<VisitorProfile, "id" | "created_at">[] | null>(null);

  useEffect(() => {
    (async () => {
      const since = subDays(new Date(), 13).toISOString();
      const [s, m, v] = await Promise.all([
        supabase.from("chat_sessions").select("*"),
        supabase.from("chat_messages").select("session_id,sender,created_at").gte("created_at", since),
        supabase.from("visitor_profiles").select("id,created_at").gte("created_at", since),
      ]);
      setSessions((s.data ?? []) as ChatSession[]);
      setMessages((m.data ?? []) as Pick<ChatMessage, "session_id" | "sender" | "created_at">[]);
      setVisitors((v.data ?? []) as Pick<VisitorProfile, "id" | "created_at">[]);
    })();
  }, []);

  const series = useMemo(() => {
    if (!sessions || !visitors) return [];
    const days: { date: string; chats: number; visitors: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = startOfDay(subDays(new Date(), i));
      const next = startOfDay(subDays(new Date(), i - 1));
      days.push({
        date: format(d, "MMM d"),
        chats: sessions.filter((s) => {
          const c = new Date(s.created_at);
          return c >= d && c < next;
        }).length,
        visitors: visitors.filter((v) => {
          const c = new Date(v.created_at);
          return c >= d && c < next;
        }).length,
      });
    }
    return days;
  }, [sessions, visitors]);

  const topDomains = useMemo(() => {
    if (!sessions) return [];
    const m = new Map<string, number>();
    sessions.forEach((s) => {
      if (s.domain) m.set(s.domain, (m.get(s.domain) ?? 0) + 1);
    });
    return Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [sessions]);

  const topPages = useMemo(() => {
    if (!sessions) return [];
    const m = new Map<string, number>();
    sessions.forEach((s) => {
      if (s.page_url) m.set(s.page_url, (m.get(s.page_url) ?? 0) + 1);
    });
    return Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [sessions]);

  const stats = useMemo(() => {
    if (!sessions || !messages) return null;
    const missed = sessions.filter((s) => s.status === "pending" && s.unread_for_admin > 0).length;
    const offlineMsgs = sessions.filter((s) => s.status === "pending").length;
    // avg first response
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
    return { missed, offlineMsgs, avgResponse: avg, totalChats: sessions.length };
  }, [sessions, messages]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground">Last 14 days · live data from your workspace.</p>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Mini label="Total chats" value={stats?.totalChats} icon={BarChart3} />
          <Mini label="Missed chats" value={stats?.missed} icon={Activity} />
          <Mini label="Offline messages" value={stats?.offlineMsgs} icon={Users} />
          <Mini
            label="Avg response"
            value={stats?.avgResponse == null ? "—" : formatDur(stats.avgResponse)}
            icon={Activity}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Chats &amp; visitors per day</CardTitle>
          </CardHeader>
          <CardContent>
            {!series.length ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={series} margin={{ top: 5, right: 12, left: -12, bottom: 0 }}>
                    <defs>
                      <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary, 220 90% 56%))" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="hsl(var(--primary, 220 90% 56%))" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="currentColor" strokeOpacity={0.08} vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="currentColor" strokeOpacity={0.4} />
                    <YAxis tick={{ fontSize: 11 }} stroke="currentColor" strokeOpacity={0.4} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--color-card)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Area type="monotone" dataKey="chats" stroke="var(--color-primary)" fill="url(#g1)" strokeWidth={2} />
                    <Area type="monotone" dataKey="visitors" stroke="#10b981" fill="url(#g2)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Globe className="h-4 w-4" /> Top website domains
              </CardTitle>
            </CardHeader>
            <CardContent>
              <RankList items={topDomains} empty="No domain data yet" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Link2 className="h-4 w-4" /> Most visited pages
              </CardTitle>
            </CardHeader>
            <CardContent>
              <RankList items={topPages} empty="No page data yet" linkify />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Mini({ label, value, icon: Icon }: { label: string; value: number | string | undefined; icon: typeof BarChart3 }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          {value === undefined ? <Skeleton className="mt-1 h-5 w-12" /> : <div className="text-lg font-semibold">{value}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function RankList({ items, empty, linkify }: { items: [string, number][]; empty: string; linkify?: boolean }) {
  if (items.length === 0) return <div className="py-6 text-center text-xs text-muted-foreground">{empty}</div>;
  const max = Math.max(...items.map(([, n]) => n));
  return (
    <ul className="space-y-2">
      {items.map(([k, n]) => (
        <li key={k} className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            {linkify ? (
              <a href={k} target="_blank" rel="noreferrer" className="truncate text-primary hover:underline">
                {k}
              </a>
            ) : (
              <span className="truncate font-medium">{k}</span>
            )}
            <span className="ml-2 shrink-0 text-muted-foreground">{n}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${(n / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function formatDur(sec: number) {
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  return `${(sec / 3600).toFixed(1)}h`;
}
