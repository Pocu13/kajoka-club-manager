import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Lock, User as UserIcon } from "lucide-react";
import { auth, useDB } from "@/lib/store";
import { Btn, Field, Input } from "@/components/ui-kit";

export const Route = createFileRoute("/login")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Accesso operatori — KAJOKA" },
      {
        name: "description",
        content:
          "Area riservata al personale del circolo KAJOKA: accedi con le tue credenziali.",
      },
      { property: "og:title", content: "Accesso operatori — KAJOKA" },
      {
        property: "og:description",
        content: "Area riservata al personale del circolo KAJOKA.",
      },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const db = useDB();
  const navigate = useNavigate();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("1234");
  const [error, setError] = useState("");

  useEffect(() => {
    if (db.currentUserId) navigate({ to: "/home", replace: true });
  }, [db.currentUserId, navigate]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = auth.login(username, password);
    if (!res.ok) setError(res.error ?? "Accesso non riuscito");
    else navigate({ to: "/home", replace: true });
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      <div className="pointer-events-none absolute -top-40 left-1/2 size-[640px] -translate-x-1/2 rounded-full bg-primary/12 blur-[140px]" />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/15 text-3xl font-black text-primary glow-primary">
            K
          </div>
          <h1 className="font-display text-4xl font-bold tracking-tight">KAJOKA</h1>
          <p className="label-caps text-muted-foreground">Club Management System</p>
        </div>

        <form
          onSubmit={submit}
          className="space-y-4 rounded-2xl border border-border bg-surface-low/80 p-6 backdrop-blur"
        >
          <Field label="Username">
            <div className="relative">
              <UserIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="pl-9"
                autoComplete="username"
              />
            </div>
          </Field>
          <Field label="Password">
            <div className="relative">
              <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-9"
                autoComplete="current-password"
              />
            </div>
          </Field>

          {error && (
            <div className="rounded-lg border border-[#ff5a52]/40 bg-[#ff5a52]/10 px-3 py-2 text-xs text-danger">
              {error}
            </div>
          )}

          <Btn variant="primary" size="lg" className="w-full" type="submit">
            Accedi al gestionale
          </Btn>

          <div className="mono space-y-1 rounded-lg border border-border bg-surface-container p-3 text-[11px] text-muted-foreground">
            <div className="label-caps mb-1 text-muted-foreground">Accessi demo</div>
            <div>admin / 1234 — Amministratore</div>
            <div>luca.bianchi / 1234 — Dipendente</div>
          </div>
        </form>
      </div>
    </div>
  );
}
