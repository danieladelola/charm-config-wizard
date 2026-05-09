import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { VisitorProfile, ChatSession } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Mail, Phone, Users, MessageSquare } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/admin/visitors")({
  component: VisitorsPage,
});

function VisitorsPage() {
  const [visitors, setVisitors] = useState<VisitorProfile[] | null>(null);
  const [sessionsByVisitor, setSessionsByVisitor] = useState<Record<string, ChatSession[]>>({});
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      const [{ data: vs }, { data: ss }] = await Promise.all([
        supabase.from("visitor_profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("chat_sessions").select("*"),
      ]);
      setVisitors((vs ?? []) as VisitorProfile[]);
      const map: Record<string, ChatSession[]> = {};
      (ss as ChatSession[] | null)?.forEach((s) => {
        (map[s.visitor_id] ??= []).push(s);
      });
      setSessionsByVisitor(map);
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!visitors) return [];
    if (!q) return visitors;
    const ql = q.toLowerCase();
    return visitors.filter((v) =>
      [v.name, v.email, v.phone].filter(Boolean).join(" ").toLowerCase().includes(ql),
    );
  }, [visitors, q]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Visitors</h1>
            <p className="text-sm text-muted-foreground">{visitors?.length ?? 0} total visitors</p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search name, email, phone…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>

        {!visitors && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
        )}

        {visitors && filtered.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-muted">
                <Users className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="text-sm font-medium">No visitors found</div>
              <div className="text-xs text-muted-foreground">Try a different search.</div>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((v) => {
            const ss = sessionsByVisitor[v.id] ?? [];
            const last = ss[0];
            return (
              <Card key={v.id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                      {(v.name ?? "?").slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{v.name || "Anonymous"}</div>
                      <div className="text-[11px] text-muted-foreground">
                        Joined {formatDistanceToNow(new Date(v.created_at), { addSuffix: true })}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                    {v.email && (
                      <div className="flex items-center gap-1.5">
                        <Mail className="h-3 w-3" /> <span className="truncate">{v.email}</span>
                      </div>
                    )}
                    {v.phone && (
                      <div className="flex items-center gap-1.5">
                        <Phone className="h-3 w-3" /> {v.phone}
                      </div>
                    )}
                    <div className="flex items-center gap-1.5">
                      <MessageSquare className="h-3 w-3" /> {ss.length} chat{ss.length === 1 ? "" : "s"}
                    </div>
                  </div>
                  {last && (
                    <Link
                      to="/admin/inbox"
                      search={{ s: last.id, f: "all" }}
                      className="mt-3 inline-block text-xs font-medium text-primary hover:underline"
                    >
                      View latest chat →
                    </Link>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
