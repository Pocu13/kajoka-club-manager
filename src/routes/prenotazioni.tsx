import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarPlus, ChevronLeft, ChevronRight, Clock, Euro, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge, Btn, Drawer, Field, Input, Modal, Panel, Select } from "@/components/ui-kit";
import { reservations, useCurrentUser, useDB } from "@/lib/store";
import { eur } from "@/lib/format";
import {
  bookingPrice,
  courtsOf,
  dateKey,
  EXTRAS,
  FAMILIES,
  KIND_CLS,
  KIND_LABEL,
  minutesNow,
  OPEN_FROM,
  OPEN_TO,
  toHHMM,
  toMin,
  type FamilyKey,
} from "@/lib/bookings";
import type { Booking, BookingKind } from "@/lib/types";
import { cn } from "@/lib/utils";

const PPM = 1.7; // pixel per minuto
const TRACK = (OPEN_TO - OPEN_FROM) * PPM;
const DAY_NAMES = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
const MONTHS = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

export const Route = createFileRoute("/prenotazioni")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Prenotazioni campi — KAJOKA" },
      {
        name: "description",
        content:
          "Timeline oraria delle prenotazioni: disponibilità campi, assegnazione slot e gestione partite in tempo reale.",
      },
      { property: "og:title", content: "Prenotazioni campi — KAJOKA" },
      {
        property: "og:description",
        content: "Planning orario dei campi del circolo KAJOKA.",
      },
    ],
  }),
  component: () => (
    <AppShell>
      <BookingsPage />
    </AppShell>
  ),
});

function BookingsPage() {
  const db = useDB();
  const user = useCurrentUser();

  const [family, setFamily] = useState<FamilyKey>("padel");
  const [dayOffset, setDayOffset] = useState(0);
  const [now, setNow] = useState(() => minutesNow());
  const [detail, setDetail] = useState<string | null>(null);
  const [form, setForm] = useState<{ courtId: string; start: number } | null>(null);

  useEffect(() => {
    const t = window.setInterval(() => setNow(minutesNow()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(today.getTime() + dayOffset * 86400000);
  const date = dateKey(day);
  const isToday = dayOffset === 0;

  const courts = courtsOf(db.courts, family);
  const dayBookings = useMemo(
    () => db.bookings.filter((b) => b.date === date && !b.cancelled),
    [db.bookings, date],
  );

  const familyBookings = dayBookings.filter((b) => courts.some((c) => c.id === b.courtId));
  const slotsTotal = courts.length * ((OPEN_TO - OPEN_FROM) / 60);
  const slotsBusy = familyBookings.reduce(
    (sum, b) => sum + (toMin(b.end) - toMin(b.start)) / 60,
    0,
  );
  const occupancy = slotsTotal ? Math.round((slotsBusy / slotsTotal) * 100) : 0;
  const revenue = familyBookings.reduce((sum, b) => sum + b.price, 0);
  const next = familyBookings
    .filter((b) => toMin(b.start) > (isToday ? now : 0) && b.kind !== "manutenzione")
    .sort((a, b) => toMin(a.start) - toMin(b.start))[0];

  const selected = db.bookings.find((b) => b.id === detail) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold uppercase sm:text-3xl">Prenotazioni campi</h1>
            <Badge tone="success" dot>
              LIVE TIMELINE
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Planning orario disponibilità strutture, assegnazione slot e gestione partite in
            tempo reale.
          </p>
        </div>
        <Btn
          variant="primary"
          onClick={() => setForm({ courtId: courts[0]?.id ?? "", start: Math.max(OPEN_FROM, Math.floor(now / 30) * 30) })}
        >
          <CalendarPlus className="size-4" /> Nuova prenotazione
        </Btn>
      </div>

      <div className="flex flex-wrap items-center gap-1 border-b border-border pb-2">
        {FAMILIES.map((f) => {
          const count = courtsOf(db.courts, f.key).length;
          const active = family === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setFamily(f.key)}
              className={cn(
                "label-caps flex items-center gap-2 rounded-lg px-3 py-2 transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
              <span className="mono text-[10px] opacity-80">({count})</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Btn
          size="sm"
          variant="outline"
          onClick={() => setDayOffset((d) => Math.max(0, d - 1))}
          aria-label="Giorno precedente"
        >
          <ChevronLeft className="size-4" />
        </Btn>
        <div className="flex flex-1 gap-2 overflow-x-auto">
          {Array.from({ length: 8 }).map((_, i) => {
            const d = new Date(today.getTime() + i * 86400000);
            const active = i === dayOffset;
            return (
              <button
                key={i}
                onClick={() => setDayOffset(i)}
                className={cn(
                  "min-w-[62px] shrink-0 rounded-lg border px-3 py-2 text-center transition-colors",
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-surface-container text-muted-foreground hover:text-foreground",
                )}
              >
                <div className="mono text-base font-bold">{d.getDate()}</div>
                <div className="label-caps text-[10px]">
                  {i === 0 ? "Oggi" : DAY_NAMES[d.getDay()]}
                </div>
              </button>
            );
          })}
        </div>
        <Btn
          size="sm"
          variant="outline"
          onClick={() => setDayOffset((d) => Math.min(7, d + 1))}
          aria-label="Giorno successivo"
        >
          <ChevronRight className="size-4" />
        </Btn>
      </div>

      <Panel className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
        <span className="label-caps text-muted-foreground">Legenda stati:</span>
        <LegendDot cls="bg-[#8bc34a]" label="Libero / Disponibile" />
        <LegendDot cls="bg-[#c0392b]" label="Prenotato" />
        <LegendDot cls="bg-[#6c4fc1]" label="Allenamento serie" />
        <LegendDot cls="bg-[#1d3b26]" label="Lezione privata / SAP" />
        <span className="mono ml-auto text-xs text-muted-foreground">
          {MONTHS[day.getMonth()]} {day.getDate()} · intervallo slot: 60 min
        </span>
      </Panel>

      <Panel className="overflow-x-auto p-3">
        <div style={{ width: TRACK + 150 }} className="space-y-3">
          <div className="flex items-end gap-3">
            <div className="w-[138px] shrink-0" />
            <div className="relative" style={{ width: TRACK, height: 16 }}>
              {Array.from({ length: (OPEN_TO - OPEN_FROM) / 60 }).map((_, i) => (
                <span
                  key={i}
                  className="mono absolute text-[10px] text-muted-foreground"
                  style={{ left: i * 60 * PPM }}
                >
                  {toHHMM(OPEN_FROM + i * 60)}
                </span>
              ))}
            </div>
          </div>

          {courts.map((court) => {
            const rows = dayBookings.filter((b) => b.courtId === court.id);
            return (
              <div key={court.id} className="flex items-stretch gap-3">
                <div className="flex w-[138px] shrink-0 flex-col justify-center rounded-lg border border-border bg-surface-container px-3 py-3">
                  <span className="font-display text-lg font-bold uppercase">{court.name}</span>
                  <span className="mono text-[11px] text-muted-foreground">
                    {eur(court.hourlyPrice)}/ora
                  </span>
                </div>

                <div className="relative h-[74px]" style={{ width: TRACK }}>
                  {Array.from({ length: (OPEN_TO - OPEN_FROM) / 60 }).map((_, i) => {
                    const start = OPEN_FROM + i * 60;
                    const past = isToday && start + 60 <= now;
                    return (
                      <button
                        key={i}
                        disabled={past}
                        onClick={() => setForm({ courtId: court.id, start })}
                        title={`${court.name} · ${toHHMM(start)} libero`}
                        className={cn(
                          "absolute top-0 bottom-0 rounded-md border text-left transition-opacity",
                          past
                            ? "cursor-not-allowed border-border bg-surface-high/40"
                            : "border-[#9ccc4f] bg-[#8bc34a] hover:opacity-80",
                        )}
                        style={{ left: i * 60 * PPM + 2, width: 60 * PPM - 4 }}
                      >
                        <span
                          className={cn(
                            "mono absolute top-1 left-1.5 text-[10px] font-bold",
                            past ? "text-muted-foreground" : "text-black/80",
                          )}
                        >
                          {toHHMM(start)}
                        </span>
                      </button>
                    );
                  })}

                  {rows.map((b) => {
                    const left = (toMin(b.start) - OPEN_FROM) * PPM;
                    const width = (toMin(b.end) - toMin(b.start)) * PPM;
                    return (
                      <button
                        key={b.id}
                        onClick={() => setDetail(b.id)}
                        title={`${b.title} · ${b.start}–${b.end}`}
                        className={cn(
                          "absolute top-0 bottom-0 overflow-hidden rounded-md border px-1.5 py-1 text-left transition-opacity hover:opacity-90",
                          KIND_CLS[b.kind],
                        )}
                        style={{ left: left + 2, width: width - 4 }}
                      >
                        <span className="mono block text-[10px] font-bold opacity-90">
                          {b.start} → {b.end}
                        </span>
                        <span className="mt-1 block truncate text-[11px] font-semibold">
                          {b.title}
                        </span>
                      </button>
                    );
                  })}

                  {isToday && now >= OPEN_FROM && now <= OPEN_TO && (
                    <div
                      className="pointer-events-none absolute top-0 bottom-0 z-10 w-[2px] bg-primary"
                      style={{ left: (now - OPEN_FROM) * PPM }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-3">
        <div>
          <div className="label-caps text-muted-foreground">Occupazione {family}</div>
          <div className="mono mt-1 text-2xl font-bold">{occupancy}%</div>
          <div className="text-xs text-muted-foreground">
            {Math.round(slotsBusy)}/{slotsTotal} slot
          </div>
        </div>
        <div>
          <div className="label-caps text-muted-foreground">
            <Euro className="mr-1 inline size-3" /> Incasso stimato
          </div>
          <div className="mono mt-1 text-2xl font-bold text-success">{eur(revenue)}</div>
        </div>
        <div>
          <div className="label-caps text-muted-foreground">
            <Clock className="mr-1 inline size-3" /> Prossima partita
          </div>
          <div className="mono mt-1 text-sm font-bold">
            {next
              ? `${db.courts.find((c) => c.id === next.courtId)?.name} · ${next.start} — ${next.title}`
              : "Nessuna in programma"}
          </div>
        </div>
      </Panel>

      <BookingForm
        open={!!form}
        onClose={() => setForm(null)}
        date={date}
        family={family}
        initial={form}
      />

      <BookingDetail
        booking={selected}
        onClose={() => setDetail(null)}
        canCancel={user?.role === "admin" || !!user?.permissions.includes("campi")}
      />
    </div>
  );
}

function LegendDot({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className={cn("size-3 rounded-sm", cls)} /> {label}
    </span>
  );
}

function BookingForm({
  open,
  onClose,
  date,
  family,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
  family: FamilyKey;
  initial: { courtId: string; start: number } | null;
}) {
  const db = useDB();
  const courts = courtsOf(db.courts, family);

  const [courtId, setCourtId] = useState("");
  const [start, setStart] = useState("09:00");
  const [duration, setDuration] = useState(90);
  const [kind, setKind] = useState<BookingKind>("partita");
  const [players, setPlayers] = useState("");
  const [extras, setExtras] = useState<string[]>([]);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open || !initial) return;
    setCourtId(initial.courtId || (courts[0]?.id ?? ""));
    setStart(toHHMM(initial.start));
    setDuration(90);
    setKind("partita");
    setPlayers("");
    setExtras([]);
    setNote("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.courtId, initial?.start]);

  const court = db.courts.find((c) => c.id === courtId) ?? null;
  const end = toHHMM(Math.min(OPEN_TO, toMin(start) + duration));
  const total = court ? bookingPrice(court, duration, kind === "manutenzione" ? [] : extras) : 0;
  const names = players
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);

  const submit = () => {
    if (!court) return;
    const res = reservations.create({
      courtId: court.id,
      date,
      start,
      end,
      kind,
      title:
        kind === "manutenzione"
          ? "Manutenzione campo"
          : kind === "lezione"
            ? "Lezione privata"
            : kind === "serie"
              ? "Allenamento serie"
              : (names[0] ?? "Partita libera"),
      players: names,
      extras: kind === "manutenzione" ? [] : extras,
      price: total,
      note,
    });
    if (!res.ok) {
      toast.error(res.error ?? "Impossibile salvare la prenotazione");
      return;
    }
    toast.success(`Prenotazione confermata · ${court.name} ${start}–${end}`);
    onClose();
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="w-[460px]"
      title="Nuova prenotazione"
      subtitle="Compila i dettagli per riservare lo slot"
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Btn variant="outline" onClick={onClose}>
            Annulla
          </Btn>
          <Btn variant="primary" onClick={submit} disabled={!court}>
            Conferma prenotazione
          </Btn>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="1. Campo">
          <Select value={courtId} onChange={(e) => setCourtId(e.target.value)}>
            {courts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — {eur(c.hourlyPrice)}/ora
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="2. Ora inizio">
            <Input type="time" step={1800} value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Durata">
            <Select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              <option value={60}>60 min</option>
              <option value={90}>90 min</option>
              <option value={120}>120 min</option>
            </Select>
          </Field>
        </div>

        <Field label="3. Tipologia">
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(KIND_LABEL) as BookingKind[]).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-sm font-semibold transition-colors",
                  kind === k
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-surface-container text-muted-foreground hover:text-foreground",
                )}
              >
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </Field>

        {kind !== "manutenzione" && (
          <>
            <Field label="4. Giocatori" hint="Separa i nomi con una virgola">
              <Input
                value={players}
                onChange={(e) => setPlayers(e.target.value)}
                placeholder="Alessandro Rossi, Matteo Bianchi"
              />
            </Field>

            <Field label="5. Servizi & extra">
              <div className="grid grid-cols-2 gap-2">
                {EXTRAS.map((ex) => {
                  const on = extras.includes(ex.id);
                  return (
                    <button
                      key={ex.id}
                      onClick={() =>
                        setExtras((list) =>
                          on ? list.filter((x) => x !== ex.id) : [...list, ex.id],
                        )
                      }
                      className={cn(
                        "rounded-lg border px-3 py-2 text-sm transition-colors",
                        on
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-surface-container text-muted-foreground",
                      )}
                    >
                      {ex.label} ({eur(ex.price)})
                    </button>
                  );
                })}
              </div>
            </Field>
          </>
        )}

        <Field label="Note">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opzionale" />
        </Field>

        <Panel className="space-y-2 p-4">
          <Row label={`Tariffa campo (${duration} min)`} value={eur(court ? (court.hourlyPrice * duration) / 60 : 0)} />
          {kind !== "manutenzione" && extras.length > 0 && (
            <Row
              label="Extra & noleggi"
              value={eur(
                extras.reduce((s, id) => s + (EXTRAS.find((e) => e.id === id)?.price ?? 0), 0),
              )}
            />
          )}
          <div className="flex items-center justify-between border-t border-border pt-2">
            <span className="label-caps">Totale prenotazione</span>
            <span className="mono text-xl font-bold text-success">{eur(total)}</span>
          </div>
          {names.length > 1 && (
            <div className="mono text-right text-xs text-muted-foreground">
              {eur(total / names.length)} / persona
            </div>
          )}
          <div className="mono text-xs text-muted-foreground">
            Slot: {start} → {end}
          </div>
        </Panel>
      </div>
    </Drawer>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="mono">{value}</span>
    </div>
  );
}

function BookingDetail({
  booking,
  onClose,
  canCancel,
}: {
  booking: Booking | null;
  onClose: () => void;
  canCancel: boolean;
}) {
  const db = useDB();
  const [confirm, setConfirm] = useState(false);
  if (!booking) return null;
  const court = db.courts.find((c) => c.id === booking.courtId);

  return (
    <>
      <Drawer
        open
        onClose={onClose}
        title={booking.title}
        subtitle={`${court?.name ?? "Campo"} · ${booking.start} → ${booking.end}`}
        footer={
          canCancel ? (
            <Btn variant="danger" className="w-full" onClick={() => setConfirm(true)}>
              <Trash2 className="size-4" /> Annulla prenotazione
            </Btn>
          ) : undefined
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge tone={booking.cancelled ? "danger" : "primary"}>
              {booking.cancelled ? "ANNULLATA" : KIND_LABEL[booking.kind].toUpperCase()}
            </Badge>
            <Badge tone="neutral">{booking.date}</Badge>
          </div>

          <Panel className="space-y-2 p-4">
            <Row label="Campo" value={court?.name ?? "—"} />
            <Row label="Orario" value={`${booking.start} → ${booking.end}`} />
            <Row label="Totale" value={eur(booking.price)} />
            <Row label="Creata da" value={booking.createdBy} />
          </Panel>

          <div>
            <div className="label-caps mb-2 text-muted-foreground">Giocatori</div>
            {booking.players.length ? (
              <div className="space-y-2">
                {booking.players.map((p, i) => (
                  <div
                    key={p + i}
                    className="flex items-center gap-3 rounded-lg border border-border bg-surface-container px-3 py-2 text-sm"
                  >
                    <span className="mono flex size-6 items-center justify-center rounded-full bg-primary/20 text-[11px] text-primary">
                      {i + 1}
                    </span>
                    {p}
                    {i === 0 && <Badge tone="success" className="ml-auto">TITOLARE</Badge>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nessun giocatore associato.</p>
            )}
          </div>

          {booking.extras.length > 0 && (
            <div>
              <div className="label-caps mb-2 text-muted-foreground">Extra</div>
              <div className="flex flex-wrap gap-2">
                {booking.extras.map((id) => (
                  <Badge key={id} tone="info">
                    {EXTRAS.find((e) => e.id === id)?.label ?? id}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {booking.note && (
            <p className="text-sm text-muted-foreground">Note: {booking.note}</p>
          )}
        </div>
      </Drawer>

      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Annulla prenotazione"
        footer={
          <>
            <Btn variant="outline" onClick={() => setConfirm(false)}>
              Indietro
            </Btn>
            <Btn
              variant="danger"
              onClick={() => {
                reservations.cancel(booking.id);
                toast.success("Prenotazione annullata, slot liberato");
                setConfirm(false);
                onClose();
              }}
            >
              Conferma annullamento
            </Btn>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          Lo slot {booking.start}–{booking.end} su {court?.name} tornerà disponibile e la mappa
          dei campi si aggiornerà al blocco successivo.
        </p>
      </Modal>
    </>
  );
}
