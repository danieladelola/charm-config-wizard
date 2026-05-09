import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { MessageCircle, Shield, Zap } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Home,
  head: () => ({
    meta: [
      { title: "TradesHorizons Live Chat" },
      { name: "description", content: "Real-time live chat support for tradeshorizons.vip" },
    ],
  }),
});

function Home() {
  return (
    <main className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2 font-semibold">
            <MessageCircle className="h-5 w-5 text-primary" />
            TradesHorizons Chat
          </div>
          <div className="flex gap-2">
            <Link to="/login"><Button variant="outline">Admin login</Button></Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-6 py-24 text-center">
        <h1 className="text-5xl font-bold tracking-tight">Live chat for your business</h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          A private, single-admin live chat system. Embed one script on any site and talk to visitors in real time.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link to="/login"><Button size="lg">Open admin dashboard</Button></Link>
          <Link to="/admin/settings"><Button variant="outline" size="lg">Widget settings</Button></Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-6 px-6 pb-24 md:grid-cols-3">
        {[
          { icon: Zap, t: "Realtime", d: "Messages stream instantly via Supabase realtime." },
          { icon: Shield, t: "Secure by default", d: "Row Level Security on every table; only your admin email can sign in." },
          { icon: MessageCircle, t: "Embed anywhere", d: "One <script> tag adds a floating chat widget to any website." },
        ].map((f) => (
          <div key={f.t} className="rounded-lg border bg-card p-6">
            <f.icon className="h-6 w-6 text-primary" />
            <h3 className="mt-3 font-semibold">{f.t}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{f.d}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
