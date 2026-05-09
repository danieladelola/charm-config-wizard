import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { supabaseWidget as supabase } from "@/integrations/supabase/widget-client";
import type { ChatMessage, ChatSession, WidgetSettings, ChatWidget } from "@/lib/types";

export const Route = createFileRoute("/widget")({
  component: WidgetApp,
  validateSearch: (search: Record<string, unknown>) => ({
    key: (search.key as string) || "",
    domain: (search.domain as string) || "",
    page: (search.page as string) || "",
  }),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
});

const VISITOR_KEY_PREFIX = "th_chat_vk_";
const SESSION_ID_PREFIX = "th_chat_sid_";
const ATTACH_BUCKET = "chat-attachments";
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

function uuid() {
  return "vk_" + Math.random().toString(36).slice(2) + Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function postParent(msg: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  window.parent?.postMessage({ __thChat: true, ...msg }, "*");
}

async function lookupGeo(): Promise<{ country?: string; country_code?: string; city?: string; ip?: string }> {
  try {
    const r = await fetch("https://ipapi.co/json/");
    if (!r.ok) return {};
    const j = await r.json();
    return {
      country: j.country_name || undefined,
      country_code: j.country_code || j.country || undefined,
      city: j.city || undefined,
      ip: j.ip || undefined,
    };
  } catch {
    return {};
  }
}

function WidgetApp() {
  const { key, domain, page } = Route.useSearch();
  const [widget, setWidget] = useState<ChatWidget | null>(null);
  const [settings, setSettings] = useState<WidgetSettings | null>(null);
  const [step, setStep] = useState<"loading" | "form" | "chat" | "blocked">("loading");
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [session, setSession] = useState<ChatSession | null>(null);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [adminTyping, setAdminTyping] = useState(false);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const adminTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastVisitorTypingSentRef = useRef(0);

  // Always-online support status
  const adminOnline = true;

  // Load widget + settings
  useEffect(() => {
    (async () => {
      if (!key) { setStep("blocked"); return; }
      const { data: w } = await supabase
        .from("chat_widgets")
        .select("*")
        .eq("public_key", key)
        .eq("active", true)
        .maybeSingle();
      if (!w) { setStep("blocked"); return; }
      setWidget(w as ChatWidget);
      const { data: s } = await supabase
        .from("widget_settings")
        .select("*")
        .eq("widget_id", w.id)
        .maybeSingle();
      const settings = s as WidgetSettings;
      setSettings(settings);

      if (settings?.allowed_domains?.length && domain) {
        const ok = settings.allowed_domains.some((d) => domain === d || domain.endsWith("." + d));
        if (!ok) { setStep("blocked"); return; }
      }

      const storedSid = localStorage.getItem(SESSION_ID_PREFIX + key);
      const storedVk = localStorage.getItem(VISITOR_KEY_PREFIX + key);
      if (storedSid && storedVk) {
        const { data: sess } = await supabase
          .from("chat_sessions")
          .select("*")
          .eq("id", storedSid)
          .eq("visitor_key", storedVk)
          .maybeSingle();
        if (sess) {
          setSession(sess as ChatSession);
          const { data: msgs } = await supabase
            .from("chat_messages")
            .select("*")
            .eq("session_id", storedSid)
            .order("created_at");
          setMessages((msgs ?? []) as ChatMessage[]);
          setStep("chat");
          return;
        }
      }
      setStep("form");
    })();
  }, [key, domain]);

  // Subscribe to messages once we have a session
  useEffect(() => {
    if (!session) return;
    const ch = supabase
      .channel("widget-" + session.id)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `session_id=eq.${session.id}` },
        (payload: { new: ChatMessage }) => {
          const m = payload.new as ChatMessage;
          setMessages((prev) => {
            // Already present (real id)
            if (prev.some((x) => x.id === m.id)) return prev;
            // Replace optimistic temp message with same body+sender
            const tmpIdx = prev.findIndex(
              (x) =>
                x.id.startsWith("tmp_") &&
                x.sender === m.sender &&
                (x.body || "") === (m.body || "") &&
                (x.attachment_url || "") === (m.attachment_url || ""),
            );
            if (tmpIdx !== -1) {
              const next = prev.slice();
              next[tmpIdx] = m;
              return next;
            }
            return [...prev, m];
          });
          if (m.sender === "admin") postParent({ type: "unread", count: 1 });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [session]);

  // Heartbeat
  useEffect(() => {
    if (!session) return;
    const tick = () => {
      supabase
        .from("chat_sessions")
        .update({ visitor_online: true, visitor_last_seen_at: new Date().toISOString() })
        .eq("id", session.id);
    };
    tick();
    const i = setInterval(tick, 25_000);
    const off = () => {
      supabase.from("chat_sessions").update({ visitor_online: false }).eq("id", session.id);
    };
    window.addEventListener("beforeunload", off);
    return () => { clearInterval(i); window.removeEventListener("beforeunload", off); off(); };
  }, [session]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, adminTyping]);

  // Typing channel
  useEffect(() => {
    if (!session) return;
    const ch = supabase
      .channel(`chat-typing-${session.id}`, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "admin-typing" }, () => {
        setAdminTyping(true);
        if (adminTypingTimerRef.current) clearTimeout(adminTypingTimerRef.current);
        adminTypingTimerRef.current = setTimeout(() => setAdminTyping(false), 3000);
      })
      .subscribe();
    typingChannelRef.current = ch;
    return () => {
      supabase.removeChannel(ch);
      typingChannelRef.current = null;
      if (adminTypingTimerRef.current) clearTimeout(adminTypingTimerRef.current);
      setAdminTyping(false);
    };
  }, [session]);

  const broadcastVisitorTyping = () => {
    const ch = typingChannelRef.current;
    if (!ch) return;
    const now = Date.now();
    if (now - lastVisitorTypingSentRef.current < 1500) return;
    lastVisitorTypingSentRef.current = now;
    ch.send({ type: "broadcast", event: "visitor-typing", payload: {} });
  };

  const startChat = useCallback(async () => {
    if (!widget || !settings) return;
    if (settings.require_name && !form.name.trim()) return alert("Name is required");
    if (settings.require_email && !form.email.trim()) return alert("Email is required");
    if (settings.require_phone && !form.phone.trim()) return alert("Phone is required");
    setSubmitting(true);
    try {
      const now = new Date().toISOString();
      const visitorKey = uuid();
      const visitorId = crypto.randomUUID();
      const geo = await lookupGeo();

      const { error: vErr } = await supabase
        .from("visitor_profiles")
        .insert({
          id: visitorId,
          visitor_key: visitorKey,
          name: form.name || null,
          email: form.email || null,
          phone: form.phone || null,
        });
      if (vErr) throw vErr;

      const sessionId = crypto.randomUUID();
      const { error: sErr } = await supabase
        .from("chat_sessions")
        .insert({
          id: sessionId,
          widget_id: widget.id,
          visitor_id: visitorId,
          visitor_key: visitorKey,
          status: "pending",
          domain: domain || null,
          page_url: page || null,
          user_agent: navigator.userAgent,
          unread_for_admin: 1,
          country: geo.country ?? null,
          country_code: geo.country_code ?? null,
          city: geo.city ?? null,
          ip_address: geo.ip ?? null,
        });
      if (sErr) throw sErr;

      const sess: ChatSession = {
        id: sessionId,
        widget_id: widget.id,
        visitor_id: visitorId,
        visitor_key: visitorKey,
        status: "pending",
        domain: domain || null,
        page_url: page || null,
        user_agent: navigator.userAgent,
        visitor_online: true,
        visitor_last_seen_at: now,
        unread_for_admin: 1,
        unread_for_visitor: 0,
        last_message_at: now,
        created_at: now,
        country: geo.country ?? null,
        country_code: geo.country_code ?? null,
        city: geo.city ?? null,
        ip_address: geo.ip ?? null,
      };

      await supabase.from("chat_messages").insert({
        session_id: sess.id,
        visitor_key: visitorKey,
        sender: "system",
        body: settings.welcome_message,
      });

      localStorage.setItem(VISITOR_KEY_PREFIX + key, visitorKey);
      localStorage.setItem(SESSION_ID_PREFIX + key, sess.id);
      setSession(sess);
      setStep("chat");
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }, [widget, settings, form, domain, page, key]);

  const sendMessage = async (overrides?: Partial<ChatMessage>) => {
    if (!session) return;
    const body = (overrides?.body ?? draft).toString().trim();
    const hasAttachment = !!overrides?.attachment_url;
    if (!body && !hasAttachment) return;
    if (!overrides) setDraft("");

    const optimistic: ChatMessage = {
      id: "tmp_" + Date.now() + "_" + Math.random().toString(36).slice(2),
      session_id: session.id,
      visitor_key: session.visitor_key,
      sender: "visitor",
      body: body || "",
      created_at: new Date().toISOString(),
      attachment_url: overrides?.attachment_url ?? null,
      attachment_name: overrides?.attachment_name ?? null,
      attachment_type: overrides?.attachment_type ?? null,
      attachment_size: overrides?.attachment_size ?? null,
    };
    setMessages((p) => [...p, optimistic]);

    const { error } = await supabase.from("chat_messages").insert({
      session_id: session.id,
      visitor_key: session.visitor_key,
      sender: "visitor",
      body: body || "",
      attachment_url: overrides?.attachment_url ?? null,
      attachment_name: overrides?.attachment_name ?? null,
      attachment_type: overrides?.attachment_type ?? null,
      attachment_size: overrides?.attachment_size ?? null,
    });
    if (error) {
      alert(error.message);
      // remove optimistic on failure
      setMessages((p) => p.filter((x) => x.id !== optimistic.id));
      return;
    }
    await supabase
      .from("chat_sessions")
      .update({
        last_message_at: new Date().toISOString(),
        unread_for_admin: session.unread_for_admin + 1,
        status: session.status === "closed" ? "open" : session.status,
      })
      .eq("id", session.id);
  };

  const handleFile = async (file: File | null | undefined) => {
    if (!file || !session) return;
    if (file.size > MAX_FILE_BYTES) {
      alert("File too large (max 10 MB)");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.includes(".") ? file.name.split(".").pop() : "";
      const path = `${session.id}/${Date.now()}_${Math.random().toString(36).slice(2)}${ext ? "." + ext : ""}`;
      const { error: upErr } = await supabase.storage.from(ATTACH_BUCKET).upload(path, file, {
        cacheControl: "3600",
        contentType: file.type || undefined,
      });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from(ATTACH_BUCKET).getPublicUrl(path);
      await sendMessage({
        body: "",
        attachment_url: data.publicUrl,
        attachment_name: file.name,
        attachment_type: file.type || null,
        attachment_size: file.size,
      });
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const color = settings?.brand_color || "#1e90ff";
  const headerGradient = `linear-gradient(135deg, #7c3aed 0%, ${color} 100%)`;
  const supportName = "Support";
  const logoUrl = "/tz-logo.png";

  if (step === "loading") return <div className="flex h-screen items-center justify-center text-sm text-gray-500">Loading…</div>;
  if (step === "blocked") return <div className="flex h-screen items-center justify-center p-6 text-center text-sm text-gray-500">This chat widget is not available on this site.</div>;

  return (
    <div className="flex h-screen flex-col bg-white text-gray-900">
      <header className="flex items-center justify-between px-4 py-3 text-white" style={{ background: headerGradient }}>
        <div className="flex items-center gap-3">
          <img
            src={logoUrl}
            alt={supportName}
            className="h-10 w-10 rounded-full bg-black/40 object-cover ring-2 ring-white/30"
          />
          <div>
            <div className="font-semibold leading-tight">{supportName}</div>
            <div className="flex items-center gap-1.5 text-xs opacity-90">
              <span className="inline-block h-2 w-2 rounded-full bg-green-300" />
              We're online
            </div>
          </div>
        </div>
        <button onClick={() => postParent({ type: "close" })} className="text-white/90 hover:text-white" aria-label="Close">✕</button>
      </header>

      {step === "form" && (
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
          <p className="text-sm text-gray-600">{settings?.welcome_message}</p>
          {settings?.require_name && (
            <Field label="Your name *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          )}
          {settings?.require_email && (
            <Field label="Email *" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
          )}
          {settings?.require_phone && (
            <Field label="Phone *" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
          )}
          {!settings?.require_phone && (
            <Field label="Phone (optional)" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
          )}
          <button
            onClick={startChat}
            disabled={submitting}
            className="mt-2 rounded-md py-2 font-medium text-white disabled:opacity-50"
            style={{ background: color }}
          >
            {submitting ? "Starting…" : "Start chat"}
          </button>
        </div>
      )}

      {step === "chat" && (
        <>
          <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-3">
            {messages.map((m) => (
              <div key={m.id} className={`flex items-end gap-2 ${m.sender === "visitor" ? "justify-end" : "justify-start"}`}>
                {m.sender !== "visitor" && (
                  <img
                    src={logoUrl}
                    alt={supportName}
                    className="h-7 w-7 shrink-0 rounded-full bg-black/40 object-cover ring-1 ring-black/5"
                  />
                )}
                <div
                  className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm ${
                    m.sender === "visitor"
                      ? "text-white"
                      : m.sender === "system"
                        ? "bg-gray-100 italic text-gray-600"
                        : "bg-gray-100 text-gray-900"
                  }`}
                  style={m.sender === "visitor" ? { background: color } : undefined}
                >
                  {m.sender === "admin" && (
                    <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                      {supportName}
                    </div>
                  )}
                  {m.attachment_url && (
                    <Attachment url={m.attachment_url} name={m.attachment_name} type={m.attachment_type} dark={m.sender === "visitor"} />
                  )}
                  {m.body && <div className="whitespace-pre-wrap">{m.body}</div>}
                </div>
              </div>
            ))}
            {adminTyping && (
              <div className="flex items-end gap-2 justify-start">
                <img src={logoUrl} alt={supportName} className="h-7 w-7 shrink-0 rounded-full bg-black/40 object-cover ring-1 ring-black/5" />
                <div className="rounded-2xl bg-gray-100 px-3 py-2 text-xs italic text-gray-600">
                  <span className="font-semibold not-italic text-gray-700">{supportName}</span> is typing
                  <span className="ml-1 inline-flex gap-0.5 align-middle">
                    <span className="h-1 w-1 animate-bounce rounded-full bg-gray-500 [animation-delay:-0.3s]" />
                    <span className="h-1 w-1 animate-bounce rounded-full bg-gray-500 [animation-delay:-0.15s]" />
                    <span className="h-1 w-1 animate-bounce rounded-full bg-gray-500" />
                  </span>
                </div>
              </div>
            )}
          </div>
          <div className="flex items-end gap-2 border-t p-2">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              title="Attach file"
              className="rounded-md p-2 text-gray-600 hover:bg-gray-100 disabled:opacity-50"
              aria-label="Attach file"
            >
              {uploading ? "…" : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
              )}
            </button>
            <input
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                if (e.target.value.trim()) broadcastVisitorTyping();
              }}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), sendMessage())}
              placeholder="Type a message…"
              className="flex-1 rounded-md border px-3 py-2 text-sm outline-none focus:border-gray-400"
            />
            <button onClick={() => sendMessage()} className="rounded-md px-3 py-2 text-sm font-medium text-white" style={{ background: color }}>
              Send
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Attachment({ url, name, type, dark }: { url: string; name?: string | null; type?: string | null; dark?: boolean }) {
  const isImage = (type || "").startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(url);
  if (isImage) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="mb-1 block">
        <img src={url} alt={name || "attachment"} className="max-h-48 max-w-full rounded-md object-cover" />
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
        dark ? "border-white/30 bg-white/10 text-white" : "border-gray-200 bg-white text-gray-700"
      }`}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <span className="truncate">{name || "Attachment"}</span>
    </a>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="block text-xs font-medium text-gray-700">
      {label}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border px-3 py-2 text-sm font-normal outline-none focus:border-gray-400"
      />
    </label>
  );
}
