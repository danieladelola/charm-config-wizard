import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: Login,
});

function Login() {
  const { signIn, isAuthenticated, loading } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && isAuthenticated) nav({ to: "/admin" });
  }, [isAuthenticated, loading, nav]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await signIn(email, password);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Admin sign in</CardTitle>
          <CardDescription>Restricted to the authorized admin account.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label>Password</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <Button className="w-full" disabled={busy} type="submit">
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
