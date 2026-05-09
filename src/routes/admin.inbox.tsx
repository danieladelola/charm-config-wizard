import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ChatSession, ChatMessage, VisitorProfile, ChatNote, SavedReply } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Paperclip, FileText, MapPin } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Send,
  Search,
  X,
  RotateCcw,
  Trash2,
  StickyNote,
  Zap,
  Globe,
  Mail,
  Phone,
  Circle,
  ArrowLeft,
  Copy,
  Clock,
  MoreHorizontal,
  Inbox as InboxIcon,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import { playBeep } from "@/lib/notify";

type Filter = "all" | "open" | "pending" | "closed" | "unread";

export const Route = createFileRoute("/admin/inbox")({
  component: Inbox,
  validateSearch: (s: Record<string, unknown>) => ({
    f: (s.f as Filter) || "all",
    s: (s.s as string) || "",
  }),
});

function Inbox() {
  const { f: initialFilter, s: initialSession } = Route.useSearch();
  const nav = useNavigate({ from: "/admin/inbox" });

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [visitors, setVisitors] = useState<Record<string, VisitorProfile>>({});
  const [activeId, setActiveId] = useState<string | null>(initialSession || null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [notes, setNotes] = useState<ChatNote[]>([]);
  const [savedReplies, setSavedReplies] = useState<SavedReply[]>([]);
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [search, setSearch] = useState("");
  const [reply, setReply] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [showVisitorPanel, setShowVisitorPanel] = useState(false);
  const [uploading, setUploading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;

  // sync filter to url
  useEffect(() => {
    setFilter(initialFilter);
  }, [initialFilter]);

  // keyboard shortcut: "/" focuses search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "/") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const loadSessions = useCallback(async () => {
    const { data: s } = await supabase
      .from("chat_sessions")
      .select("*")
      .order("last_message_at", { ascending: false });
    if (!s) return;
    setSessions(s as ChatSession[]);
    const ids = Array.from(new Set((s as ChatSession[]).map((x: ChatSession) => x.visitor_id)));
    if (ids.length) {
      const { data: vs } = await supabase.from("visitor_profiles").select("*").in("id", ids);
      const map: Record<string, VisitorProfile> = {};
      (vs as VisitorProfile[] | null)?.forEach((v) => (map[v.id] = v));
      setVisitors(map);
    }
  }, []);

  const loadSavedReplies = useCallback(async () => {
    const { data } = await supabase.from("saved_replies").select("*").order("shortcut");
    setSavedReplies((data ?? []) as SavedReply[]);
  }, []);

  useEffect(() => {
    loadSessions();
    loadSavedReplies();
  }, [loadSessions, loadSavedReplies]);

  // Realtime
  useEffect(() => {
    const ch = supabase
      .channel("admin-inbox")
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_sessions" }, () => loadSessions())
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        (payload: { new: ChatMessage }) => {
          const m = payload.new as ChatMessage;
          if (m.sender === "visitor") {
            playBeep();
            if (typeof Notification !== "undefined" && Notification.permission === "granted") {
              new Notification("New chat message", { body: (m.body || m.attachment_name || "").slice(0, 80) });
            }
          }
          if (m.session_id === activeIdRef.current) {
            setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
          }
          loadSessions();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [loadSessions]);

  // Load active session details
  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      setNotes([]);
      return;
    }
    (async () => {
      const [{ data: m }, { data: n }] = await Promise.all([
        supabase.from("chat_messages").select("*").eq("session_id", activeId).order("created_at"),
        supabase.from("chat_notes").select("*").eq("session_id", activeId).order("created_at"),
      ]);
      setMessages((m ?? []) as ChatMessage[]);
      setNotes((n ?? []) as ChatNote[]);
      await supabase.from("chat_sessions").update({ unread_for_admin: 0 }).eq("id", activeId);
    })();
  }, [activeId]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, activeId]);

  const filtered = useMemo(() => {
    return sessions.filter((s) => {
      if (filter === "open" && s.status !== "open") return false;
      if (filter === "pending" && s.status !== "pending") return false;
      if (filter === "closed" && s.status !== "closed") return false;
      if (filter === "unread" && s.unread_for_admin === 0) return false;
      if (search) {
        const v = visitors[s.visitor_id];
        const hay = [v?.name, v?.email, v?.phone, s.domain, s.page_url]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [sessions, filter, search, visitors]);

  const active = activeId ? sessions.find((s) => s.id === activeId) : null;
  const activeVisitor = active ? visitors[active.visitor_id] : null;

  const sendReply = async (overrides?: Partial<ChatMessage>) => {
    if (!active) return;
    const body = (overrides?.body ?? reply).toString().trim();
    const hasAttachment = !!overrides?.attachment_url;
    if (!body && !hasAttachment) return;
    if (!overrides) setReply("");
    const { error } = await supabase.from("chat_messages").insert({
      session_id: active.id,
      visitor_key: active.visitor_key,
      sender: "admin",
      body: body || "",
      attachment_url: overrides?.attachment_url ?? null,
      attachment_name: overrides?.attachment_name ?? null,
      attachment_type: overrides?.attachment_type ?? null,
      attachment_size: overrides?.attachment_size ?? null,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    await supabase
      .from("chat_sessions")
      .update({
        status: "open",
        last_message_at: new Date().toISOString(),
        unread_for_visitor: active.unread_for_visitor + 1,
      })
      .eq("id", active.id);
  };

  const handleFile = async (file: File | null | undefined) => {
    if (!file || !active) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large (max 10 MB)");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.includes(".") ? file.name.split(".").pop() : "";
      const path = `${active.id}/${Date.now()}_${Math.random().toString(36).slice(2)}${ext ? "." + ext : ""}`;
      const { error: upErr } = await supabase.storage.from("chat-attachments").upload(path, file, {
        cacheControl: "3600",
        contentType: file.type || undefined,
      });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("chat-attachments").getPublicUrl(path);
      await sendReply({
        body: "",
        attachment_url: data.publicUrl,
        attachment_name: file.name,
        attachment_type: file.type || null,
        attachment_size: file.size,
      });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const setStatus = async (status: ChatSession["status"]) => {
    if (!active) return;
    await supabase.from("chat_sessions").update({ status }).eq("id", active.id);
    toast.success(`Marked as ${status}`);
  };

  const markUnread = async () => {
    if (!active) return;
    await supabase.from("chat_sessions").update({ unread_for_admin: 1 }).eq("id", active.id);
    toast.success("Marked as unread");
  };

  const deleteSession = async () => {
    if (!active) return;
    await supabase.from("chat_sessions").delete().eq("id", active.id);
    setActiveId(null);
    toast.success("Chat deleted");
  };

  const addNote = async () => {
    if (!noteDraft.trim() || !active) return;
    const { data } = await supabase
      .from("chat_notes")
      .insert({ session_id: active.id, body: noteDraft.trim() })
      .select()
      .single();
    if (data) setNotes((p) => [...p, data as ChatNote]);
    setNoteDraft("");
  };

  const deleteNote = async (id: string) => {
    await supabase.from("chat_notes").delete().eq("id", id);
    setNotes((p) => p.filter((n) => n.id !== id));
  };

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  const setFilterUrl = (v: Filter) => {
    setFilter(v);
    nav({ search: (prev: { f: Filter; s: string }) => ({ ...prev, f: v }) });
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)] w-full max-w-full overflow-hidden bg-background">
      {/* Conversation list */}
      <div className={`flex w-full min-w-0 flex-col border-r bg-card md:w-80 md:shrink-0 ${active ? "hidden md:flex" : "flex"}`}>
        <div className="space-y-2 border-b p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              placeholder="Search chats…  ( press / )"
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Tabs value={filter} onValueChange={(v) => setFilterUrl(v as Filter)}>
            <TabsList className="grid w-full grid-cols-5 text-xs">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="open">Open</TabsTrigger>
              <TabsTrigger value="pending">New</TabsTrigger>
              <TabsTrigger value="unread">Unread</TabsTrigger>
              <TabsTrigger value="closed">Closed</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <ScrollArea className="flex-1">
          {filtered.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-muted">
                <InboxIcon className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="text-sm font-medium">No conversations</div>
              <div className="text-xs text-muted-foreground">Try a different filter or search.</div>
            </div>
          )}
          {filtered.map((s) => {
            const v = visitors[s.visitor_id];
            const isActive = activeId === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setActiveId(s.id)}
                className={`flex w-full items-start gap-2.5 border-b p-3 text-left text-sm transition-colors hover:bg-muted/60 ${
                  isActive ? "bg-muted" : ""
                }`}
              >
                <div className="relative shrink-0">
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-muted text-xs font-semibold">
                    {(v?.name ?? "?").slice(0, 1).toUpperCase()}
                  </div>
                  {s.visitor_online && (
                    <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-emerald-500" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">
                      {s.country_code && (
                        <span className="mr-1" title={[s.city, s.country].filter(Boolean).join(", ")}>
                          {countryFlag(s.country_code)}
                        </span>
                      )}
                      {v?.name || "Anonymous"}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(s.last_message_at), { addSuffix: false })}
                    </span>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{v?.email || s.domain || s.page_url}</div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <StatusPill status={s.status} />
                    {s.unread_for_admin > 0 && (
                      <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                        {s.unread_for_admin}
                      </Badge>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </ScrollArea>
      </div>

      {/* Conversation */}
      <div className={`flex min-w-0 flex-1 flex-col overflow-hidden ${active ? "flex" : "hidden md:flex"}`}>
        {!active ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-muted">
              <InboxIcon className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="text-sm font-medium">Select a conversation</div>
            <div className="max-w-xs text-xs text-muted-foreground">Pick a chat from the list to view messages and reply.</div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 border-b bg-card px-3 py-2.5 sm:px-4">
              <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setActiveId(null)}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="relative shrink-0">
                <div className="grid h-9 w-9 place-items-center rounded-full bg-muted text-xs font-semibold">
                  {(activeVisitor?.name ?? "?").slice(0, 1).toUpperCase()}
                </div>
                {active.visitor_online && (
                  <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-emerald-500" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="truncate text-sm font-semibold">{activeVisitor?.name || "Anonymous"}</div>
                  <StatusPill status={active.status} />
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {[activeVisitor?.email, activeVisitor?.phone, active.domain].filter(Boolean).join(" · ")}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
                <Button variant="ghost" size="icon" onClick={markUnread} title="Mark unread">
                  <Clock className="h-4 w-4" />
                </Button>
                {active.status !== "closed" ? (
                  <Button variant="outline" size="sm" onClick={() => setStatus("closed")} title="Close chat" className="px-2 sm:px-3">
                    <X className="h-3.5 w-3.5 sm:mr-1" /> <span className="hidden sm:inline">Close</span>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setStatus("open")} title="Reopen chat" className="px-2 sm:px-3">
                    <RotateCcw className="h-3.5 w-3.5 sm:mr-1" /> <span className="hidden sm:inline">Reopen</span>
                  </Button>
                )}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" title="Delete">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This permanently deletes the conversation, messages, and notes. This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={deleteSession}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setShowVisitorPanel((v) => !v)}>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div ref={scrollRef} className="min-w-0 flex-1 space-y-3 overflow-x-hidden overflow-y-auto bg-muted/20 p-3 sm:p-4">
              {messages.map((m, i) => {
                const showTime =
                  i === 0 || new Date(m.created_at).getTime() - new Date(messages[i - 1].created_at).getTime() > 5 * 60 * 1000;
                return (
                  <div key={m.id}>
                    {showTime && (
                      <div className="my-3 text-center text-[10px] uppercase tracking-wider text-muted-foreground">
                        {format(new Date(m.created_at), "PP · HH:mm")}
                      </div>
                    )}
                    <div className={`flex w-full ${m.sender === "admin" ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[85%] min-w-0 break-words rounded-2xl px-3 py-2 text-sm shadow-sm sm:max-w-[78%] sm:px-3.5 ${
                          m.sender === "admin"
                            ? "rounded-br-sm bg-primary text-primary-foreground"
                            : m.sender === "system"
                              ? "bg-transparent text-center text-xs italic text-muted-foreground"
                              : "rounded-bl-sm bg-card"
                        }`}
                      >
                        {m.attachment_url && (
                          <AttachmentView url={m.attachment_url} name={m.attachment_name} type={m.attachment_type} dark={m.sender === "admin"} />
                        )}
                        {m.body && <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{m.body}</div>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t bg-card p-3">
              {savedReplies.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {savedReplies.slice(0, 6).map((r) => (
                    <Button
                      key={r.id}
                      size="sm"
                      variant="outline"
                      className="h-7 rounded-full text-xs"
                      onClick={() => setReply((p) => (p ? p + " " + r.body : r.body))}
                      title={r.body}
                    >
                      <Zap className="mr-1 h-3 w-3" /> {r.shortcut}
                    </Button>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10"
                  disabled={uploading}
                  title="Attach file"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
                <Textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Type your reply…  (Enter to send, Shift+Enter for newline)"
                  className="min-h-[56px] resize-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendReply();
                    }
                  }}
                />
                <Button onClick={() => sendReply()} className="h-10 px-4">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Visitor sidebar */}
      {active && (
        <aside
          className={`w-full max-w-xs shrink-0 space-y-5 overflow-y-auto border-l bg-card p-4 text-sm shadow-xl lg:w-72 lg:shadow-none ${
            showVisitorPanel ? "fixed inset-y-0 right-0 z-40 block" : "hidden"
          } lg:relative lg:inset-auto lg:block lg:shadow-none`}
        >
          <div className="flex items-center justify-between lg:hidden">
            <div className="text-sm font-semibold">Details</div>
            <Button variant="ghost" size="icon" onClick={() => setShowVisitorPanel(false)} aria-label="Close panel">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div>
            <SectionLabel>Visitor</SectionLabel>
            <div className="mt-2 space-y-1.5">
              <div className="font-medium">{activeVisitor?.name || "Anonymous"}</div>
              {activeVisitor?.email && (
                <button
                  onClick={() => copy(activeVisitor.email!, "Email")}
                  className="flex w-full items-center gap-1.5 text-muted-foreground hover:text-foreground"
                >
                  <Mail className="h-3 w-3" /> <span className="truncate">{activeVisitor.email}</span>
                  <Copy className="ml-auto h-3 w-3 opacity-60" />
                </button>
              )}
              {activeVisitor?.phone && (
                <button
                  onClick={() => copy(activeVisitor.phone!, "Phone")}
                  className="flex w-full items-center gap-1.5 text-muted-foreground hover:text-foreground"
                >
                  <Phone className="h-3 w-3" /> <span>{activeVisitor.phone}</span>
                </button>
              )}
              {(active.country || active.city || active.country_code) && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  <span className="truncate">
                    {active.country_code && countryFlag(active.country_code)}{" "}
                    {[active.city, active.country].filter(Boolean).join(", ") || active.country_code}
                    {active.ip_address ? ` · ${active.ip_address}` : ""}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Globe className="h-3 w-3" /> {active.domain || "—"}
              </div>
              {active.page_url && (
                <button
                  onClick={() => copy(active.page_url!, "Page URL")}
                  className="block w-full truncate text-left text-xs text-primary underline-offset-2 hover:underline"
                >
                  {active.page_url}
                </button>
              )}
              <div className="text-xs text-muted-foreground">Started {format(new Date(active.created_at), "PPp")}</div>
              <div className="flex items-center gap-1.5 text-xs">
                <Circle
                  className={`h-2 w-2 ${
                    active.visitor_online ? "fill-emerald-500 text-emerald-500" : "fill-muted-foreground text-muted-foreground"
                  }`}
                />
                {active.visitor_online
                  ? "Online"
                  : `Last seen ${formatDistanceToNow(new Date(active.visitor_last_seen_at), { addSuffix: true })}`}
              </div>
            </div>
          </div>

          <div>
            <SectionLabel>Location</SectionLabel>
            <div className="mt-2 flex items-center gap-2 rounded-md border bg-muted/40 p-2.5">
              {active.country_code ? (
                <span className="text-2xl leading-none">{countryFlag(active.country_code)}</span>
              ) : (
                <MapPin className="h-5 w-5 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {active.country || active.country_code || "Unknown location"}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {[active.city, active.ip_address].filter(Boolean).join(" · ") || "No location data"}
                </div>
              </div>
            </div>
          </div>

          <div>
            <SectionLabel>Quick actions</SectionLabel>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <Button variant="outline" size="sm" onClick={() => setStatus("open")}>
                Open
              </Button>
              <Button variant="outline" size="sm" onClick={() => setStatus("pending")}>
                Pending
              </Button>
              <Button variant="outline" size="sm" onClick={() => setStatus("closed")}>
                Close
              </Button>
              <Button variant="outline" size="sm" onClick={markUnread}>
                Unread
              </Button>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center gap-1.5">
              <StickyNote className="h-3 w-3 text-muted-foreground" />
              <SectionLabel className="m-0 p-0">Private notes</SectionLabel>
            </div>
            <div className="space-y-2">
              {notes.length === 0 && <div className="text-xs text-muted-foreground">No notes yet.</div>}
              {notes.map((n) => (
                <div key={n.id} className="group rounded-md border bg-amber-50/60 p-2 text-xs dark:border-amber-900/40 dark:bg-amber-950/30">
                  <div className="whitespace-pre-wrap">{n.body}</div>
                  <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>{format(new Date(n.created_at), "PPp")}</span>
                    <button onClick={() => deleteNote(n.id)} className="opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100">
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <Textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="Add a private note…"
              className="mt-2 min-h-[60px] text-xs"
            />
            <Button size="sm" className="mt-2 w-full" onClick={addNote} disabled={!noteDraft.trim()}>
              Add note
            </Button>
          </div>
        </aside>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: ChatSession["status"] }) {
  const map: Record<ChatSession["status"], string> = {
    open: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    pending: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    closed: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
  };
  return <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium capitalize ${map[status]}`}>{status}</span>;
}

function SectionLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80 ${className}`}>
      {children}
    </div>
  );
}

function countryFlag(code?: string | null): string {
  if (!code || code.length !== 2) return "";
  const cc = code.toUpperCase();
  return String.fromCodePoint(...[...cc].map((c) => 127397 + c.charCodeAt(0)));
}

function AttachmentView({ url, name, type, dark }: { url: string; name?: string | null; type?: string | null; dark?: boolean }) {
  const isImage = (type || "").startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(url);
  if (isImage) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="mb-1 block">
        <img src={url} alt={name || "attachment"} className="max-h-56 max-w-full rounded-md object-cover" />
      </a>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      download={name || true}
      className={`mb-1 flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs underline-offset-2 hover:underline ${
        dark ? "border-white/30 bg-white/10" : "border-border bg-background"
      }`}
    >
      <FileText className="h-3.5 w-3.5" />
      <span className="truncate">{name || "Attachment"}</span>
    </a>
  );
}
