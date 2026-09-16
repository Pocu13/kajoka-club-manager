import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import {
  Badge,
  Btn,
  Drawer,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Panel,
  Select,
  StatCard,
  Toggle,
} from "@/components/ui-kit";
import { staff, useCurrentUser, useDB } from "@/lib/store";
import { fmtDateTime, initials } from "@/lib/format";
import type { Role, User } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/utenti")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Utenti e permessi — KAJOKA" },
      {
        name: "description",
        content:
          "Gestione dello staff del circolo: ruoli, stato account, password e permessi operativi.",
      },
      { property: "og:title", content: "Utenti e permessi — KAJOKA" },
      {
        property: "og:description",
        content: "Amministra gli accessi di amministratori e dipendenti.",
      },
    ],
  }),
  component: () => (
    <AppShell>
      <UsersPage />
    </AppShell>
  ),
});

const PERMISSIONS: { key: string; label: string }[] = [
  { key: "pos", label: "Cassa e vendite bar" },
  { key: "campi", label: "Gestione campi e sessioni" },
  { key: "magazzino", label: "Carichi e scarichi magazzino" },
  { key: "prodotti", label: "Modifica catalogo prodotti" },
  { key: "storni", label: "Annullamento operazioni" },
  { key: "statistiche", label: "Accesso alle statistiche" },
];

const EMPTY: Omit<User, "id"> = {
  name: "",
  username: "",
  email: "",
  role: "dipendente",
  active: true,
  password: "",
  passwordSet: false,
  lastAccess: null,
  createdAt: new Date().toISOString(),
  permissions: ["pos", "campi"],
};

function UsersPage() {
  const db = useDB();
  const me = useCurrentUser();
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<"tutti" | Role>("tutti");
  const [selected, setSelected] = useState<User | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Omit<User, "id">>(EMPTY);
  const [pwd, setPwd] = useState("");
  const [toDelete, setToDelete] = useState<User | null>(null);

  if (me?.role !== "admin") {
    return <EmptyState label="Sezione riservata agli amministratori." />;
  }

  const rows = db.users
    .filter((u) => (role === "tutti" ? true : u.role === role))
    .filter(
      (u) =>
        !query.trim() ||
        u.name.toLowerCase().includes(query.toLowerCase()) ||
        u.username.toLowerCase().includes(query.toLowerCase()),
    );

  const patch = (id: string, p: Partial<User>) => {
    staff.update(id, p);
    setSelected((s) => (s ? { ...s, ...p } : s));
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Utenti"
        subtitle={`${db.users.length} account · ${db.users.filter((u) => u.active).length} attivi`}
      >
        <div className="relative w-56">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Cerca nome o username…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={role}
          onChange={(e) => setRole(e.target.value as typeof role)}
          className="w-44"
        >
          <option value="tutti">Tutti i ruoli</option>
          <option value="admin">Amministratori</option>
          <option value="dipendente">Dipendenti</option>
        </Select>
        <Btn
          variant="primary"
          onClick={() => {
            setDraft({ ...EMPTY, createdAt: new Date().toISOString() });
            setCreating(true);
          }}
        >
          <Plus className="size-4" /> Nuovo utente
        </Btn>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Account totali" value={String(db.users.length)} />
        <StatCard
          label="Amministratori"
          value={String(db.users.filter((u) => u.role === "admin").length)}
          tone="primary"
        />
        <StatCard
          label="Attivi"
          value={String(db.users.filter((u) => u.active).length)}
        />
        <StatCard
          label="Password da impostare"
          value={String(db.users.filter((u) => !u.passwordSet).length)}
        />
      </div>

      <Panel className="overflow-hidden p-0">
        {rows.length === 0 ? (
          <EmptyState label="Nessun utente trovato." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-container">
                  {["Utente", "Username", "Ruolo", "Stato", "Password", "Ultimo accesso"].map(
                    (h) => (
                      <th
                        key={h}
                        className="label-caps px-4 py-3 text-left text-muted-foreground"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr
                    key={u.id}
                    onClick={() => {
                      setSelected(u);
                      setPwd("");
                    }}
                    className={cn(
                      "cursor-pointer border-b border-border last:border-0 hover:bg-surface-high/60",
                      !u.active && "opacity-60",
                    )}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-xs font-bold text-primary">
                          {initials(u.name)}
                        </span>
                        <div>
                          <div className="font-semibold">{u.name}</div>
                          <div className="text-[11px] text-muted-foreground">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="mono px-4 py-3 text-muted-foreground">@{u.username}</td>
                    <td className="px-4 py-3">
                      <Badge tone={u.role === "admin" ? "primary" : "neutral"}>
                        {u.role === "admin" ? "Amministratore" : "Dipendente"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={u.active ? "success" : "danger"} dot>
                        {u.active ? "Attivo" : "Disattivato"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={u.passwordSet ? "neutral" : "warning"}>
                        {u.passwordSet ? "Impostata" : "Da impostare"}
                      </Badge>
                    </td>
                    <td className="mono px-4 py-3 text-muted-foreground">
                      {u.lastAccess ? fmtDateTime(u.lastAccess) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* dettaglio */}
      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.name ?? ""}
        subtitle={selected ? `@${selected.username}` : ""}
        footer={
          selected && selected.id !== me.id ? (
            <Btn variant="danger" className="w-full" onClick={() => setToDelete(selected)}>
              Elimina utente
            </Btn>
          ) : undefined
        }
      >
        {selected && (
          <div className="space-y-5">
            <Field label="Nome e cognome">
              <Input
                value={selected.name}
                onChange={(e) => patch(selected.id, { name: e.target.value })}
              />
            </Field>
            <Field label="Email">
              <Input
                value={selected.email}
                onChange={(e) => patch(selected.id, { email: e.target.value })}
              />
            </Field>
            <Field label="Ruolo">
              <Select
                value={selected.role}
                onChange={(e) => patch(selected.id, { role: e.target.value as Role })}
              >
                <option value="dipendente">Dipendente</option>
                <option value="admin">Amministratore</option>
              </Select>
            </Field>

            <Toggle
              checked={selected.active}
              onChange={(v) => patch(selected.id, { active: v })}
              disabled={selected.id === me.id}
              label="Account attivo"
              hint="Un account disattivato non può più accedere al gestionale."
            />

            <div className="space-y-2 border-t border-border pt-4">
              <div className="label-caps text-muted-foreground">Password</div>
              <div className="flex gap-2">
                <Input
                  placeholder="Nuova password"
                  value={pwd}
                  onChange={(e) => setPwd(e.target.value)}
                />
                <Btn
                  variant="outline"
                  onClick={() => {
                    staff.resetPassword(selected.id, pwd);
                    patch(selected.id, { password: pwd, passwordSet: pwd.length > 0 });
                    setPwd("");
                    toast.success("Password aggiornata");
                  }}
                >
                  Imposta
                </Btn>
              </div>
              <Btn
                variant="subtle"
                size="sm"
                onClick={() => {
                  staff.resetPassword(selected.id, "");
                  patch(selected.id, { password: "", passwordSet: false });
                  toast.success("Password azzerata: l'utente dovrà impostarne una nuova");
                }}
              >
                Azzera password
              </Btn>
            </div>

            <div className="space-y-2 border-t border-border pt-4">
              <div className="label-caps text-muted-foreground">Permessi</div>
              {PERMISSIONS.map((p) => (
                <Toggle
                  key={p.key}
                  label={p.label}
                  checked={
                    selected.role === "admin" || selected.permissions.includes(p.key)
                  }
                  disabled={selected.role === "admin"}
                  onChange={(v) =>
                    patch(selected.id, {
                      permissions: v
                        ? [...selected.permissions, p.key]
                        : selected.permissions.filter((x) => x !== p.key),
                    })
                  }
                />
              ))}
              {selected.role === "admin" && (
                <p className="text-xs text-muted-foreground">
                  Gli amministratori hanno sempre tutti i permessi.
                </p>
              )}
            </div>

            <div className="mono border-t border-border pt-4 text-xs text-muted-foreground">
              Creato il {fmtDateTime(selected.createdAt)}
              <br />
              Ultimo accesso:{" "}
              {selected.lastAccess ? fmtDateTime(selected.lastAccess) : "mai"}
            </div>
          </div>
        )}
      </Drawer>

      {/* nuovo utente */}
      <Drawer
        open={creating}
        onClose={() => setCreating(false)}
        title="Nuovo utente"
        subtitle="Crea un account per lo staff del circolo"
        footer={
          <Btn
            variant="primary"
            className="w-full"
            onClick={() => {
              if (!draft.name.trim() || !draft.username.trim()) {
                toast.error("Nome e username sono obbligatori");
                return;
              }
              staff.create({ ...draft, passwordSet: draft.password.length > 0 });
              setCreating(false);
              toast.success("Utente creato");
            }}
          >
            Crea utente
          </Btn>
        }
      >
        <div className="space-y-4">
          <Field label="Nome e cognome">
            <Input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </Field>
          <Field label="Username">
            <Input
              value={draft.username}
              onChange={(e) => setDraft({ ...draft, username: e.target.value })}
            />
          </Field>
          <Field label="Email">
            <Input
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            />
          </Field>
          <Field label="Ruolo">
            <Select
              value={draft.role}
              onChange={(e) => setDraft({ ...draft, role: e.target.value as Role })}
            >
              <option value="dipendente">Dipendente</option>
              <option value="admin">Amministratore</option>
            </Select>
          </Field>
          <Field label="Password iniziale" hint="Lascia vuoto per farla impostare al primo accesso.">
            <Input
              value={draft.password}
              onChange={(e) => setDraft({ ...draft, password: e.target.value })}
            />
          </Field>
          <Toggle
            checked={draft.active}
            onChange={(v) => setDraft({ ...draft, active: v })}
            label="Account attivo"
          />
        </div>
      </Drawer>

      <Modal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Elimina utente"
        footer={
          <>
            <Btn variant="subtle" onClick={() => setToDelete(null)}>
              Indietro
            </Btn>
            <Btn
              variant="danger"
              onClick={() => {
                if (toDelete) staff.remove(toDelete.id);
                setToDelete(null);
                setSelected(null);
                toast.success("Utente eliminato");
              }}
            >
              Elimina
            </Btn>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          L&apos;account di <b className="text-foreground">{toDelete?.name}</b> verrà
          rimosso. Le operazioni già registrate a suo nome restano nello storico.
        </p>
      </Modal>
    </div>
  );
}
