import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ChatWidget, WidgetSettings } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Copy, Save, MessageSquare, Bell, Volume2, Eye } from "lucide-react";
import { toast } from "sonner";
import { getSoundEnabled, setSoundEnabled, playBeep } from "@/lib/notify";

export const Route = createFileRoute("/admin/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const [widget, setWidget] = useState<ChatWidget | null>(null);
  const [s, setS] = useState<WidgetSettings | null>(null);
  const [domainsText, setDomainsText] = useState("");
  const [saving, setSaving] = useState(false);
  const [sound, setSound] = useState(true);
  const [browserNotif, setBrowserNotif] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: w } = await supabase.from("chat_widgets").select("*").limit(1).maybeSingle();
      setWidget(w as ChatWidget);
      if (w) {
        const { data: ws } = await supabase
          .from("widget_settings")
          .select("*")
          .eq("widget_id", w.id)
          .maybeSingle();
        setS(ws as WidgetSettings);
        setDomainsText((ws?.allowed_domains ?? []).join("\n"));
      }
      setSound(getSoundEnabled());
      setBrowserNotif(typeof Notification !== "undefined" && Notification.permission === "granted");
    })();
  }, []);

  const save = async () => {
    if (!s) return;
    setSaving(true);
    const allowed_domains = domainsText
      .split("\n")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);
    const { error } = await supabase
      .from("widget_settings")
      .update({ ...s, allowed_domains, updated_at: new Date().toISOString() })
      .eq("widget_id", s.widget_id);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Settings saved");
  };

  if (!widget || !s) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading…</div>
    );
  }

  const embed = `<script src="https://chat.tradeshorizons.vip/chat-widget.js" data-widget-key="${widget.public_key}"></script>`;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto grid max-w-7xl gap-6 p-4 sm:p-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Widget Settings</h1>
            <p className="text-sm text-muted-foreground">Customize how the chat widget looks and behaves on your site.</p>
          </div>

          <Tabs defaultValue="appearance">
            <TabsList className="flex w-full overflow-x-auto sm:grid sm:grid-cols-4">
              <TabsTrigger value="appearance" className="flex-1 text-xs sm:text-sm">Appearance</TabsTrigger>
              <TabsTrigger value="behavior" className="flex-1 text-xs sm:text-sm">Behavior</TabsTrigger>
              <TabsTrigger value="notifications" className="flex-1 text-xs sm:text-sm">Notify</TabsTrigger>
              <TabsTrigger value="embed" className="flex-1 text-xs sm:text-sm">Embed</TabsTrigger>
            </TabsList>

            <TabsContent value="appearance" className="mt-4 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Branding</CardTitle>
                  <CardDescription>How the chat looks to your visitors.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <Field label="Widget title">
                    <Input value={s.title} onChange={(e) => setS({ ...s, title: e.target.value })} />
                  </Field>
                  <Field label="Chat button text">
                    <Input value={s.button_text} onChange={(e) => setS({ ...s, button_text: e.target.value })} />
                  </Field>
                  <Field label="Brand color">
                    <div className="flex items-center gap-2">
                      <Input
                        type="color"
                        value={s.brand_color}
                        onChange={(e) => setS({ ...s, brand_color: e.target.value })}
                        className="h-10 w-16 cursor-pointer p-1"
                      />
                      <Input value={s.brand_color} onChange={(e) => setS({ ...s, brand_color: e.target.value })} className="flex-1 font-mono" />
                    </div>
                  </Field>
                  <Field label="Notification email">
                    <Input
                      type="email"
                      value={s.notification_email ?? ""}
                      onChange={(e) => setS({ ...s, notification_email: e.target.value })}
                      placeholder="you@example.com"
                    />
                  </Field>
                  <Field label="Welcome message" full>
                    <Textarea value={s.welcome_message} onChange={(e) => setS({ ...s, welcome_message: e.target.value })} rows={2} />
                  </Field>
                  <Field label="Offline message" full>
                    <Textarea value={s.offline_message} onChange={(e) => setS({ ...s, offline_message: e.target.value })} rows={2} />
                  </Field>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="behavior" className="mt-4 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Required visitor fields</CardTitle>
                  <CardDescription>What visitors must provide before starting a chat.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ToggleRow label="Require name" checked={s.require_name} onChange={(v) => setS({ ...s, require_name: v })} />
                  <ToggleRow label="Require email" checked={s.require_email} onChange={(v) => setS({ ...s, require_email: v })} />
                  <ToggleRow label="Require phone" checked={s.require_phone} onChange={(v) => setS({ ...s, require_phone: v })} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Allowed domains</CardTitle>
                  <CardDescription>One domain per line. Empty list = allow any site.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={domainsText}
                    onChange={(e) => setDomainsText(e.target.value)}
                    placeholder={"example.com\nshop.example.com"}
                    rows={4}
                    className="font-mono text-sm"
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Business hours</CardTitle>
                  <CardDescription>Informational marker shown in the dashboard.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ToggleRow
                    label="Enable business hours"
                    checked={!!(s.business_hours as { enabled?: boolean })?.enabled}
                    onChange={(v) =>
                      setS({ ...s, business_hours: { ...(s.business_hours as object), enabled: v } })
                    }
                  />
                  <Textarea
                    value={JSON.stringify(s.business_hours, null, 2)}
                    onChange={(e) => {
                      try {
                        setS({ ...s, business_hours: JSON.parse(e.target.value) });
                      } catch {
                        /* ignore */
                      }
                    }}
                    className="font-mono text-xs"
                    rows={5}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="notifications" className="mt-4 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Admin notifications</CardTitle>
                  <CardDescription>Stored in this browser.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ToggleRow
                    label="Sound notification on new messages"
                    icon={Volume2}
                    checked={sound}
                    onChange={(v) => {
                      setSound(v);
                      setSoundEnabled(v);
                      if (v) playBeep();
                    }}
                  />
                  <ToggleRow
                    label="Browser push notifications"
                    icon={Bell}
                    checked={browserNotif}
                    onChange={async (v) => {
                      if (v && typeof Notification !== "undefined") {
                        const p = await Notification.requestPermission();
                        setBrowserNotif(p === "granted");
                        if (p !== "granted") toast.error("Permission denied");
                      } else {
                        setBrowserNotif(false);
                        toast.message("Disable in your browser site settings");
                      }
                    }}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="embed" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Embed snippet</CardTitle>
                  <CardDescription>Paste this on any site where you want the chat to appear.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <pre className="overflow-x-auto rounded-md border bg-muted p-3 text-xs">{embed}</pre>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(embed);
                      toast.success("Copied");
                    }}
                  >
                    <Copy className="mr-1 h-3 w-3" /> Copy snippet
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-2 border-t bg-background/80 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
            <Button onClick={save} disabled={saving} size="lg">
              <Save className="mr-1.5 h-4 w-4" /> {saving ? "Saving…" : "Save settings"}
            </Button>
          </div>
        </div>

        {/* Live preview */}
        <div className="lg:sticky lg:top-20 lg:self-start">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Eye className="h-3 w-3" /> Live preview
          </div>
          <WidgetPreview settings={s} />
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={`space-y-1.5 ${full ? "sm:col-span-2" : ""}`}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
  icon: Icon,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  icon?: typeof Bell;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border bg-card/40 px-3 py-2.5 text-sm">
      <span className="flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
        {label}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function WidgetPreview({ settings }: { settings: WidgetSettings }) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-white shadow-xl dark:bg-zinc-900">
      <div className="flex items-center justify-between px-4 py-3 text-white" style={{ background: settings.brand_color }}>
        <div>
          <div className="text-sm font-semibold">{settings.title}</div>
          <div className="flex items-center gap-1.5 text-[11px] opacity-90">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-300" />
            We are online
          </div>
        </div>
        <span className="text-white/90">✕</span>
      </div>
      <div className="space-y-2 bg-zinc-50 p-3 dark:bg-zinc-950">
        <div className="max-w-[80%] rounded-2xl bg-white px-3 py-2 text-xs text-zinc-700 shadow-sm dark:bg-zinc-800 dark:text-zinc-200">
          {settings.welcome_message || "Welcome! Tell us what you need help with today."}
        </div>
        <div className="ml-auto max-w-[80%] rounded-2xl px-3 py-2 text-xs text-white shadow-sm" style={{ background: settings.brand_color }}>
          Hi, I have a question 👋
        </div>
        <div className="max-w-[80%] rounded-2xl bg-white px-3 py-2 text-xs text-zinc-700 shadow-sm dark:bg-zinc-800 dark:text-zinc-200">
          Sure! What can I help with?
        </div>
      </div>
      <div className="flex items-center gap-2 border-t bg-white p-2 dark:bg-zinc-900 dark:border-zinc-800">
        <div className="flex-1 rounded-md border bg-white px-3 py-2 text-xs text-zinc-400 dark:bg-zinc-800 dark:border-zinc-700">
          Type a message…
        </div>
        <button className="rounded-md px-3 py-2 text-xs font-medium text-white" style={{ background: settings.brand_color }}>
          Send
        </button>
      </div>
      <div className="flex items-center justify-end p-3">
        <button
          className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold text-white shadow-lg"
          style={{ background: settings.brand_color }}
        >
          <MessageSquare className="h-3.5 w-3.5" /> {settings.button_text || "Chat"}
        </button>
      </div>
    </div>
  );
}
