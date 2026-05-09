import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { SavedReply } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
import { Trash2, Pencil, Search, Plus, Zap, Save, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/saved-replies")({
  component: SavedRepliesPage,
});

function SavedRepliesPage() {
  const [replies, setReplies] = useState<SavedReply[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editing, setEditing] = useState({ shortcut: "", body: "" });
  const [draft, setDraft] = useState({ shortcut: "", body: "" });
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("saved_replies").select("*").order("shortcut");
      setReplies((data ?? []) as SavedReply[]);
      setLoaded(true);
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!q) return replies;
    const ql = q.toLowerCase();
    return replies.filter((r) => r.shortcut.toLowerCase().includes(ql) || r.body.toLowerCase().includes(ql));
  }, [replies, q]);

  const create = async () => {
    if (!draft.shortcut.trim() || !draft.body.trim()) return;
    const { data, error } = await supabase.from("saved_replies").insert(draft).select().single();
    if (error) return toast.error(error.message);
    setReplies((p) => [...p, data as SavedReply]);
    setDraft({ shortcut: "", body: "" });
    toast.success("Saved reply added");
  };

  const startEdit = (r: SavedReply) => {
    setEditingId(r.id);
    setEditing({ shortcut: r.shortcut, body: r.body });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const { error } = await supabase.from("saved_replies").update(editing).eq("id", editingId);
    if (error) return toast.error(error.message);
    setReplies((p) => p.map((r) => (r.id === editingId ? { ...r, ...editing } : r)));
    setEditingId(null);
    toast.success("Updated");
  };

  const remove = async (id: string) => {
    await supabase.from("saved_replies").delete().eq("id", id);
    setReplies((p) => p.filter((r) => r.id !== id));
    toast.success("Deleted");
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Saved Replies</h1>
            <p className="text-sm text-muted-foreground">Reusable answers you can insert into any chat with one click.</p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add new</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-[180px_1fr_auto] sm:items-end">
            <div className="space-y-1">
              <Label className="text-xs">Shortcut</Label>
              <Input placeholder="e.g. greeting" value={draft.shortcut} onChange={(e) => setDraft({ ...draft, shortcut: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Reply text</Label>
              <Input placeholder="Hi! Thanks for reaching out…" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
            </div>
            <Button onClick={create}>
              <Plus className="mr-1 h-4 w-4" /> Add
            </Button>
          </CardContent>
        </Card>

        {!loaded && <div className="text-sm text-muted-foreground">Loading…</div>}
        {loaded && filtered.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-muted">
                <Zap className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="text-sm font-medium">No saved replies</div>
              <div className="text-xs text-muted-foreground">Create your first one above.</div>
            </CardContent>
          </Card>
        )}

        <div className="space-y-2">
          {filtered.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-3 sm:p-4">
                {editingId === r.id ? (
                  <div className="grid gap-2 sm:grid-cols-[180px_1fr_auto] sm:items-start">
                    <Input value={editing.shortcut} onChange={(e) => setEditing({ ...editing, shortcut: e.target.value })} />
                    <Textarea
                      value={editing.body}
                      onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                      className="min-h-[60px]"
                    />
                    <div className="flex gap-1">
                      <Button size="sm" onClick={saveEdit}>
                        <Save className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <div className="shrink-0">
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                        <Zap className="h-3 w-3" /> {r.shortcut}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1 text-sm text-muted-foreground">{r.body}</div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => startEdit(r)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete saved reply?</AlertDialogTitle>
                            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => remove(r.id)}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
