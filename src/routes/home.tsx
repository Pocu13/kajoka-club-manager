import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Banknote,
  CreditCard,
  Minus,
  Plus,
  RefreshCw,
  Users2,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import {
  Badge,
  Btn,
  Drawer,
  Field,
  Input,
  Modal,
  Panel,
  SegTabs,
  Select,
} from "@/components/ui-kit";
import { courtSessions, useCurrentUser, useDB } from "@/lib/store";
import { eur, fmtTime } from "@/lib/format";
import type { Court, Session } from "@/lib/types";
import { cn } from "@/lib/utils";
import mapImage from "@/assets/club-map.jpg";

export const Route = createFileRoute("/home")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Mappa campi e sessioni — KAJOKA" },
      {
        name: "description",
        content:
          "Controllo operativo del circolo: stato dei campi, sessioni attive, quote giocatori ed extra bar.",
      },
      { property: "og:title", content: "Mappa campi e sessioni — KAJOKA" },
      {
        property: "og:description",
        content: "Controllo operativo del circolo KAJOKA in tempo reale.",
      },
    ],
  }),
  component: () => (
    <AppShell>
      <HomePage />
    </AppShell>
  ),
});

function HomePage() {
  const db = useDB();
  const user = useCurrentUser();
  const [view, setView] = useState<"3d" | "2d">("3d");
  const [selected, setSelected] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const sessionByCourt = useMemo(() => {
    const m = new Map<string, Session>();
    db.sessions.filter((s) => !s.closed).forEach((s) => m.set(s.courtId, s));
    return m;
  }, [db.sessions]);

  const occupied = db.courts.filter((c) => sessionByCourt.has(c.id)).length;
  const free = db.courts.length - occupied;
  const today = new Date().toDateString();
  const todayTotal = db.transactions
    .filter((t) => !t.cancelled && new Date(t.ts).toDateString() === today)
    .reduce((s, t) => s + t.amount, 0);
  const todayCount = db.transactions.filter(
    (t) => !t.cancelled && new Date(t.ts).toDateString() === today,
  ).length;
  const lowStock = db.products.filter((p) => p.stock <= p.minStock).length;

  const court = db.courts.find((c) => c.id === selected) ?? null;
  const session = court ? (sessionByCourt.get(court.id) ?? null) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight uppercase">
              Club Management
            </h1>
            <Badge tone="primary">
              {occupied}/{db.courts.length} OCCUPATI
            </Badge>
            <Badge tone="success">
              {free}/{db.courts.length} LIBERI
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Controllo operativo del circolo — {db.courts.length} campi attivi
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SegTabs
            value={view}
            onChange={setView}
            options={[
              { value: "3d", label: "3D" },
              { value: "2d", label: "2D" },
            ]}
          />
          <Btn variant="outline" size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="size-4" /> Nuova sessione
          </Btn>
          <Btn
            variant="outline"
            size="sm"
            onClick={() => toast.success("Mappa aggiornata")}
          >
            <RefreshCw className="size-4" />
          </Btn>
        </div>
      </div>

      {view === "3d" ? (
        <Panel className="relative overflow-hidden p-0">
          <img
            src={mapImage}
            alt="Vista aerea notturna del circolo con campi padel, tennis e beach volley"
            width={1536}
            height={1024}
            className="h-[560px] w-full object-cover"
          />
          <div className="absolute inset-0">
            {db.courts.map((c) => {
              const s = sessionByCourt.get(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => setSelected(c.id)}
                  style={{ left: `${c.x}%`, top: `${c.y}%` }}
                  className={cn(
                    "absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-lg border px-3 py-1.5 backdrop-blur transition-transform hover:scale-105",
                    s
                      ? "border-primary/60 bg-black/80"
                      : "border-border-strong bg-black/70",
                  )}
                >
                  <span
                    className={cn(
                      "size-2 rounded-full",
                      s ? "bg-primary" : "bg-success",
                    )}
                  />
                  <span className="label-caps">{c.name}</span>
                  <span
                    className={cn(
                      "mono text-[10px]",
                      s ? "text-primary" : "text-success",
                    )}
                  >
                    {s ? "OCCUPATO" : "LIBERO"}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="absolute bottom-4 left-4 flex items-center gap-4 rounded-lg border border-border-strong bg-black/75 px-4 py-2 backdrop-blur">
            <span className="mono flex items-center gap-2 text-xs text-success">
              <span className="size-2 rounded-full bg-success" /> LIBERO ({free})
            </span>
            <span className="text-border-strong">|</span>
            <span className="mono flex items-center gap-2 text-xs text-primary">
              <span className="size-2 rounded-full bg-primary" /> OCCUPATO ({occupied})
            </span>
          </div>
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {db.courts.map((c) => {
            const s = sessionByCourt.get(c.id);
            return (
              <button
                key={c.id}
                onClick={() => setSelected(c.id)}
                className={cn(
                  "rounded-xl border p-4 text-left transition-colors",
                  s
                    ? "border-primary/50 bg-primary/5 hover:bg-primary/10"
                    : "border-border bg-surface-low hover:bg-surface-high",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-display text-xl font-bold">{c.name}</span>
                  <Badge tone={s ? "primary" : "success"} dot>
                    {s ? "OCCUPATO" : "LIBERO"}
                  </Badge>
                </div>
                <div className="label-caps mt-1 text-muted-foreground">{c.type}</div>
                <div className="mono mt-4 text-sm">
                  {s ? (
                    <>
                      dalle {fmtTime(s.startedAt)} · {s.players.length} giocatori
                      <div className="mt-1 text-primary">
                        {eur(s.players.filter((p) => p.paid).reduce((a, p) => a + p.quota, 0))}{" "}
                        / {eur(s.total)}
                      </div>
                    </>
                  ) : (
                    <span className="text-muted-foreground">
                      {eur(c.hourlyPrice)} / ora
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <Panel className="flex flex-wrap items-center gap-4 p-4">
        <Link to="/pos">
          <Btn variant="primary">
            <Plus className="size-4" /> Apri POS Bar
          </Btn>
        </Link>
        <Btn variant="outline" onClick={() => setNewOpen(true)}>
          <Users2 className="size-4" /> Apri sessione campo
        </Btn>
        {lowStock > 0 && (
          <Link to="/magazzino" className="flex items-center gap-3">
            <Badge tone="warning">
              <AlertTriangle className="size-3" /> {lowStock} prodotti sottoscorta
            </Badge>
            <span className="text-sm text-muted-foreground underline">
              Visualizza magazzino →
            </span>
          </Link>
        )}
        <div className="mono ml-auto text-sm">
          <span className="label-caps text-muted-foreground">Incasso oggi: </span>
          <span className="text-lg font-bold">{eur(todayTotal)}</span>
          <span className="ml-2 text-muted-foreground">({todayCount} tx)</span>
        </div>
      </Panel>

      <SessionDrawer
        court={court}
        session={session}
        onClose={() => setSelected(null)}
        canManage={!!user}
        onStart={() => {
          setNewOpen(true);
        }}
      />

      <NewSessionModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        preselect={court && !session ? court.id : undefined}
      />
    </div>
  );
}

function SessionDrawer({
  court,
  session,
  onClose,
  onStart,
}: {
  court: Court | null;
  session: Session | null;
  onClose: () => void;
  canManage: boolean;
  onStart: () => void;
}) {
  const db = useDB();
  const [selPlayer, setSelPlayer] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payIds, setPayIds] = useState<string[]>([]);
  const [method, setMethod] = useState<"contanti" | "carta" | "misto">("carta");
  const [cash, setCash] = useState("0");
  const [editQuotas, setEditQuotas] = useState(false);
  const [quotaDraft, setQuotaDraft] = useState<Record<string, string>>({});

  if (!court) return null;

  const player = session?.players.find((p) => p.id === selPlayer) ?? session?.players[0] ?? null;
  const quickExtras = db.products.filter((p) => p.posVisible && p.active).slice(0, 6);

  const playerTotal = (pid: string) => {
    const p = session?.players.find((x) => x.id === pid);
    if (!p) return 0;
    return p.quota + p.extras.reduce((s, e) => s + e.price * e.qty, 0);
  };
  const payTotal = payIds.reduce((s, id) => s + playerTotal(id), 0);
  const collected = session
    ? session.players.filter((p) => p.paid).reduce((s, p) => s + p.quota, 0)
    : 0;

  return (
    <>
      <Drawer
        open={!!court}
        onClose={onClose}
        width="w-[520px]"
        title={court.name}
        subtitle={
          session
            ? `Sessione attiva dalle ${fmtTime(session.startedAt)} · ${session.players.length} giocatori`
            : `Campo libero · ${eur(court.hourlyPrice)} / ora`
        }
        footer={
          session ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="label-caps text-muted-foreground">
                  Totale da saldare
                </span>
                <span className="mono text-2xl font-bold">
                  {eur(
                    session.players
                      .filter((p) => !p.paid)
                      .reduce((s, p) => s + playerTotal(p.id), 0),
                  )}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Btn
                  variant="outline"
                  onClick={() => {
                    const unpaid = session.players.filter((p) => !p.paid).map((p) => p.id);
                    if (!unpaid.length) {
                      toast.info("Tutti i giocatori hanno saldato");
                      return;
                    }
                    setPayIds(unpaid);
                    setMethod("contanti");
                    setPayOpen(true);
                  }}
                >
                  <Banknote className="size-4" /> Contanti
                </Btn>
                <Btn
                  variant="primary"
                  onClick={() => {
                    const unpaid = session.players.filter((p) => !p.paid).map((p) => p.id);
                    if (!unpaid.length) {
                      toast.info("Tutti i giocatori hanno saldato");
                      return;
                    }
                    setPayIds(unpaid);
                    setMethod("carta");
                    setPayOpen(true);
                  }}
                >
                  <CreditCard className="size-4" /> Carta / POS
                </Btn>
              </div>
              <Btn
                variant="subtle"
                className="w-full"
                onClick={() => {
                  courtSessions.close(session.id);
                  toast.success(`Sessione ${court.name} chiusa`);
                  onClose();
                }}
              >
                Chiudi sessione e libera il campo
              </Btn>
            </div>
          ) : (
            <Btn
              variant="primary"
              className="w-full"
              onClick={() => {
                onStart();
                onClose();
              }}
            >
              <Plus className="size-4" /> Avvia sessione su {court.name}
            </Btn>
          )
        }
      >
        {!session ? (
          <div className="space-y-4">
            <Panel className="p-4">
              <div className="label-caps text-muted-foreground">Tariffa campo</div>
              <div className="mono mt-1 text-2xl font-bold">{eur(court.hourlyPrice)}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Tipologia: {court.type} · durata standard {db.settings.defaultDuration}′
              </div>
            </Panel>
            <p className="text-sm text-muted-foreground">
              Nessuna sessione in corso su questo campo. Avvia una sessione per
              registrare giocatori, quote ed extra bar.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            <Panel className="p-4">
              <div className="flex items-center justify-between">
                <span className="label-caps text-muted-foreground">
                  Incasso quote campo
                </span>
                <span className="mono text-sm">
                  <b>{eur(collected)}</b>{" "}
                  <span className="text-muted-foreground">/ {eur(session.total)}</span>
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-highest">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{
                    width: `${Math.min(100, (collected / Math.max(1, session.total)) * 100)}%`,
                  }}
                />
              </div>
              <div className="mt-2 flex justify-between text-xs">
                <span className="text-muted-foreground">
                  {session.players.length} giocatori · modalità{" "}
                  {session.pricingMode === "campo" ? "prezzo campo" : "quota giocatore"}
                </span>
                <span className="text-success">
                  {session.players.filter((p) => p.paid).length}/{session.players.length}{" "}
                  saldati
                </span>
              </div>
            </Panel>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="label-caps text-muted-foreground">
                  Ripartizione quota e extra
                </span>
                <button
                  className="text-xs font-semibold text-primary"
                  onClick={() => {
                    setQuotaDraft(
                      Object.fromEntries(
                        session.players.map((p) => [p.id, String(p.quota)]),
                      ),
                    );
                    setEditQuotas((v) => !v);
                  }}
                >
                  {editQuotas ? "Chiudi" : "Modifica quote"}
                </button>
              </div>

              <div className="space-y-2">
                {session.players.map((p) => {
                  const active = player?.id === p.id;
                  return (
                    <div
                      key={p.id}
                      onClick={() => setSelPlayer(p.id)}
                      className={cn(
                        "cursor-pointer rounded-xl border p-3 transition-colors",
                        active
                          ? "border-primary/70 bg-primary/5"
                          : "border-border bg-surface-container hover:bg-surface-high",
                        p.paid && "opacity-80",
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={cn(
                            "mono flex size-8 items-center justify-center rounded-lg text-xs font-bold",
                            active
                              ? "bg-primary text-white"
                              : "bg-surface-highest text-muted-foreground",
                          )}
                        >
                          {p.id.toUpperCase()}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold">{p.name}</div>
                          <div className="mono text-[11px] text-muted-foreground">
                            Quota: {eur(p.quota)} · Extra:{" "}
                            {eur(p.extras.reduce((s, e) => s + e.price * e.qty, 0))}
                          </div>
                        </div>
                        {p.paid ? (
                          <Badge tone="success">✓ PAGATO</Badge>
                        ) : (
                          <Badge tone="primary" dot>
                            DA PAGARE
                          </Badge>
                        )}
                      </div>

                      {editQuotas && !p.paid && (
                        <div className="mt-3 flex items-center gap-2">
                          <Input
                            type="number"
                            step="0.5"
                            value={quotaDraft[p.id] ?? String(p.quota)}
                            onChange={(e) =>
                              setQuotaDraft((q) => ({ ...q, [p.id]: e.target.value }))
                            }
                            className="h-8 w-28"
                          />
                          <span className="text-xs text-muted-foreground">
                            quota giocatore
                          </span>
                        </div>
                      )}

                      {p.extras.length > 0 && (
                        <div className="mt-3 space-y-1 rounded-lg border border-border bg-surface px-3 py-2">
                          {p.extras.map((e) => (
                            <div
                              key={e.productId}
                              className="mono flex items-center justify-between text-[11px]"
                            >
                              <span>
                                {e.qty}× {e.name}
                              </span>
                              <span className="flex items-center gap-2">
                                {eur(e.price * e.qty)}
                                {!p.paid && (
                                  <button
                                    className="text-danger"
                                    onClick={(ev) => {
                                      ev.stopPropagation();
                                      courtSessions.removeExtra(
                                        session.id,
                                        p.id,
                                        e.productId,
                                      );
                                    }}
                                  >
                                    <Minus className="size-3" />
                                  </button>
                                )}
                              </span>
                            </div>
                          ))}
                          <div className="mono flex justify-between border-t border-border pt-1 text-[11px] font-bold">
                            <span>Totale giocatore</span>
                            <span>{eur(playerTotal(p.id))}</span>
                          </div>
                        </div>
                      )}

                      {!p.paid && (
                        <div className="mt-3 flex justify-end">
                          <Btn
                            size="sm"
                            variant="outline"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setPayIds([p.id]);
                              setMethod("carta");
                              setPayOpen(true);
                            }}
                          >
                            Salda {eur(playerTotal(p.id))}
                          </Btn>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {editQuotas && (
                <Btn
                  variant="primary"
                  size="sm"
                  className="mt-3 w-full"
                  onClick={() => {
                    courtSessions.updateQuotas(
                      session.id,
                      Object.fromEntries(
                        Object.entries(quotaDraft).map(([k, v]) => [k, Number(v) || 0]),
                      ),
                    );
                    setEditQuotas(false);
                    toast.success("Quote aggiornate");
                  }}
                >
                  Salva ripartizione
                </Btn>
              )}
            </div>

            {player && !player.paid && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="label-caps text-muted-foreground">
                    Aggiungi extra rapidi a {player.name.split(" ")[0]}
                  </span>
                  <span className="mono text-[11px] text-muted-foreground">
                    Bar &amp; Pro Shop
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {quickExtras.map((p) => (
                    <button
                      key={p.id}
                      disabled={p.stock <= 0}
                      onClick={() => {
                        courtSessions.addExtra(session.id, player.id, p.id);
                        toast.success(`${p.name} addebitato a ${player.name}`);
                      }}
                      className="rounded-lg border border-border bg-surface-container p-2 text-left transition-colors hover:border-primary/50 hover:bg-surface-high disabled:opacity-40"
                    >
                      <div className="label-caps text-muted-foreground">{p.category}</div>
                      <div className="mt-1 truncate text-xs font-semibold">{p.name}</div>
                      <div className="mono mt-1 text-xs text-primary">{eur(p.price)}</div>
                      <div className="mono text-[10px] text-muted-foreground">
                        {p.stock} disp.
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>

      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title="Incasso quota campo"
        footer={
          <>
            <Btn variant="subtle" onClick={() => setPayOpen(false)}>
              Annulla
            </Btn>
            <Btn
              variant="primary"
              onClick={() => {
                if (!session) return;
                const c = method === "misto" ? Number(cash) || 0 : 0;
                courtSessions.payPlayers(
                  session.id,
                  payIds,
                  method,
                  c,
                  Math.max(0, payTotal - c),
                );
                setPayOpen(false);
                toast.success(`Incassati ${eur(payTotal)}`);
              }}
            >
              Conferma {eur(payTotal)}
            </Btn>
          </>
        }
      >
        <div className="space-y-4">
          <div className="mono flex items-center justify-between rounded-lg border border-border bg-surface-container p-3">
            <span className="text-sm text-muted-foreground">
              {payIds.length} giocator{payIds.length === 1 ? "e" : "i"}
            </span>
            <span className="text-xl font-bold">{eur(payTotal)}</span>
          </div>
          <Field label="Metodo di pagamento">
            <Select
              value={method}
              onChange={(e) => setMethod(e.target.value as typeof method)}
            >
              <option value="contanti">Contanti</option>
              <option value="carta">Carta / POS</option>
              <option value="misto">Misto</option>
            </Select>
          </Field>
          {method === "misto" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Contanti">
                <Input value={cash} onChange={(e) => setCash(e.target.value)} />
              </Field>
              <Field label="Carta">
                <Input
                  readOnly
                  value={(Math.max(0, payTotal - (Number(cash) || 0))).toFixed(2)}
                />
              </Field>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}

function NewSessionModal({
  open,
  onClose,
  preselect,
}: {
  open: boolean;
  onClose: () => void;
  preselect?: string | undefined;
}) {
  const db = useDB();
  const busy = new Set(db.sessions.filter((s) => !s.closed).map((s) => s.courtId));
  const freeCourts = db.courts.filter((c) => !busy.has(c.id));
  const [courtId, setCourtId] = useState(preselect ?? freeCourts[0]?.id ?? "");
  const [mode, setMode] = useState<"campo" | "giocatore">(db.settings.defaultPricingMode);
  const [duration, setDuration] = useState(String(db.settings.defaultDuration));
  const [count, setCount] = useState("4");
  const [names, setNames] = useState<string[]>(["", "", "", ""]);

  const court = db.courts.find((c) => c.id === courtId);
  const total = court
    ? Math.round(court.hourlyPrice * (Number(duration) / 60) * 100) / 100
    : 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nuova sessione campo"
      footer={
        <>
          <Btn variant="subtle" onClick={onClose}>
            Annulla
          </Btn>
          <Btn
            variant="primary"
            disabled={!courtId}
            onClick={() => {
              const n = Number(count) || 4;
              courtSessions.start({
                courtId,
                pricingMode: mode,
                total,
                durationMin: Number(duration) || 90,
                playerNames: names.slice(0, n),
              });
              toast.success("Sessione avviata");
              onClose();
            }}
          >
            Avvia sessione
          </Btn>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Campo">
          <Select value={courtId} onChange={(e) => setCourtId(e.target.value)}>
            {freeCourts.length === 0 && <option value="">Nessun campo libero</option>}
            {freeCourts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — {eur(c.hourlyPrice)}/ora
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Durata (min)">
            <Select value={duration} onChange={(e) => setDuration(e.target.value)}>
              <option value="60">60</option>
              <option value="90">90</option>
              <option value="120">120</option>
            </Select>
          </Field>
          <Field label="Giocatori">
            <Select
              value={count}
              onChange={(e) => {
                setCount(e.target.value);
                setNames((prev) => {
                  const n = Number(e.target.value);
                  const next = [...prev];
                  while (next.length < n) next.push("");
                  return next.slice(0, n);
                });
              }}
            >
              <option value="2">2</option>
              <option value="4">4</option>
              <option value="6">6</option>
            </Select>
          </Field>
        </div>
        <Field label="Modalità prezzo">
          <SegTabs
            value={mode}
            onChange={setMode}
            className="w-full"
            options={[
              { value: "campo", label: "Prezzo campo" },
              { value: "giocatore", label: "Quota giocatore" },
            ]}
          />
        </Field>
        <div className="space-y-2">
          <span className="label-caps text-muted-foreground">Giocatori</span>
          {Array.from({ length: Number(count) || 4 }).map((_, i) => (
            <Input
              key={i}
              placeholder={`Giocatore ${i + 1}`}
              value={names[i] ?? ""}
              onChange={(e) =>
                setNames((prev) => {
                  const next = [...prev];
                  next[i] = e.target.value;
                  return next;
                })
              }
            />
          ))}
        </div>
        <div className="mono flex items-center justify-between rounded-lg border border-border bg-surface-container p-3">
          <span className="text-sm text-muted-foreground">
            Totale sessione ({mode === "campo" ? "campo" : "diviso per giocatore"})
          </span>
          <span className="text-lg font-bold">{eur(total)}</span>
        </div>
      </div>
    </Modal>
  );
}
