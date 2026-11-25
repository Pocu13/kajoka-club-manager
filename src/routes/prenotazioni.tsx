import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarPlus, ChevronLeft, ChevronRight, Clock, Euro, Loader2, Pencil, Plus, Repeat, Trash2, Wand2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { parseBookingRequest } from "@/lib/ai-booking.functions";
import { AppShell } from "@/components/app-shell";
import { SessionDrawer } from "@/components/session-drawer";
import { WhatsAppShare } from "@/components/whatsapp-share";
import { bookingMessage } from "@/lib/whatsapp";
import { Badge, Btn, Drawer, Field, Input, Modal, Panel, Select } from "@/components/ui-kit";
import { courtSessions, reservations, series, useCurrentUser, useDB, type SeriesScope } from "@/lib/store";
import { eur } from "@/lib/format";
import {
  bookingPrice,
  courtsOf,
  dateKey,
  EXTRAS,
  expandRecurrence,
  FAMILIES,
  FREQ_LABEL,
  KIND_CLS,
  KIND_LABEL,
  minutesNow,
  OPEN_FROM,
  OPEN_TO,
  toHHMM,
  toMin,
  type FamilyKey,
} from "@/lib/bookings";
import type { Booking, BookingKind, Player, RecurrenceFreq } from "@/lib/types";
import { cn } from "@/lib/utils";

export type FormInit = {
  courtId: string;
  start: number;
  date?: string;
  duration?: number;
  kind?: BookingKind;
  players?: string[];
  note?: string;
  source?: "ai";
};

const PPM = 1.7;
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
  const [operationalBookingId, setOperationalBookingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormInit | null>(null);
  const [pastSlot, setPastSlot] = useState<{
    courtName: string;
    date: string;
    start: string;
    end: string;
  } | null>(null);

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

  const operationalBooking =
    db.bookings.find((b) => b.id === operationalBookingId && !b.cancelled) ?? null;
  const operationalCourt = operationalBooking
    ? db.courts.find((c) => c.id === operationalBooking.courtId) ?? null
    : null;
  const operationalSession = operationalBooking
    ? db.sessions.find(
        (session) => !session.closed && session.bookingId === operationalBooking.id,
      ) ?? null
    : null;

  const openBooking = (booking: Booking) => {
    const todayKey = dateKey(new Date());
    const isStartedBooking =
      booking.date === todayKey &&
      minutesNow() >= toMin(booking.start);

    if (isStartedBooking && booking.kind !== "manutenzione") {
      try {
        courtSessions.checkIn(booking);
        setDetail(null);
        setOperationalBookingId(booking.id);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Impossibile avviare la sessione");
      }
      return;
    }

    setDetail(booking.id);
  };

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

      <AiAssistant onExtract={(init) => setForm(init)} />

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
        <LegendDot cls="bg-[#1b472b]" label="Slot passato" />
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
                    const end = start + 60;
                    const past = isToday && end <= now;

                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          if (past) {
                            setPastSlot({
                              courtName: court.name,
                              date,
                              start: toHHMM(start),
                              end: toHHMM(end),
                            });
                            return;
                          }
                          setForm({ courtId: court.id, start });
                        }}
                        title={
                          past
                            ? `${court.name} · ${toHHMM(start)}–${toHHMM(end)} · Slot passato, non prenotabile`
                            : `${court.name} · ${toHHMM(start)} libero`
                        }
                        aria-label={
                          past
                            ? `Visualizza slot passato ${court.name} ${toHHMM(start)}–${toHHMM(end)}`
                            : `Prenota ${court.name} ${toHHMM(start)}`
                        }
                        className={cn(
                          "absolute top-0 bottom-0 rounded-md border text-left transition-colors",
                          past
                            ? "cursor-pointer border-[#285b38] bg-[#1b472b] text-white hover:bg-[#245b37]"
                            : "border-[#9ccc4f] bg-[#8bc34a] hover:opacity-80",
                        )}
                        style={{ left: i * 60 * PPM + 2, width: 60 * PPM - 4 }}
                      >
                        <span className="mono absolute top-1 left-1.5 text-[10px] font-bold text-white">
                          {toHHMM(start)}
                        </span>
                        {past && (
                          <span className="absolute bottom-1 left-1.5 text-[9px] font-medium text-white/80">
                            PASSATO
                          </span>
                        )}
                      </button>
                    );
                  })}

                  {rows.map((b) => {
                    const left = (toMin(b.start) - OPEN_FROM) * PPM;
                    const width = (toMin(b.end) - toMin(b.start)) * PPM;
                    return (
                      <button
                        key={b.id}
                        onClick={() => openBooking(b)}
                        title={`${b.title} · ${b.start}–${b.end}`}
                        className={cn(
                          "absolute top-0 bottom-0 overflow-hidden rounded-md border px-1.5 py-1 text-left transition-opacity hover:opacity-90",
                          KIND_CLS[b.kind],
                        )}
                        style={{ left: left + 2, width: width - 4 }}
                      >
                        <span className="mono flex items-center gap-1 text-[10px] font-bold opacity-90">
                          {b.seriesId && <Repeat className="size-3" />}
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
        canPrepay={
          !!selected &&
          selected.kind === "partita" &&
          !selected.cancelled &&
          (selected.date > dateKey(new Date()) ||
            (selected.date === dateKey(new Date()) && minutesNow() < toMin(selected.start)))
        }
      />

      <SessionDrawer
        court={operationalCourt}
        session={operationalSession}
        booking={operationalBooking}
        upcomingBooking={null}
        onClose={() => setOperationalBookingId(null)}
        onStart={() => setOperationalBookingId(null)}
        onCheckIn={(b) => {
          try {
            courtSessions.checkIn(b);
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Impossibile avviare la sessione");
          }
        }}
      />

      <Drawer
        open={!!pastSlot}
        onClose={() => setPastSlot(null)}
        title="Slot passato"
        subtitle="Consultazione disponibilità"
        width="w-[400px]"
      >
        {pastSlot && (
          <div className="space-y-4">
            <Badge tone="neutral">NON PRENOTABILE</Badge>
            <Panel className="space-y-3 p-4">
              <Row label="Campo" value={pastSlot.courtName} />
              <Row label="Data" value={pastSlot.date} />
              <Row label="Orario" value={`${pastSlot.start} → ${pastSlot.end}`} />
            </Panel>
            <p className="text-sm text-muted-foreground">
              Questo intervallo orario è già trascorso. Puoi consultarlo, ma non è possibile
              creare una nuova prenotazione per questo slot.
            </p>
            <Btn variant="outline" className="w-full" onClick={() => setPastSlot(null)}>
              Chiudi
            </Btn>
          </div>
        )}
      </Drawer>
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
  initial: FormInit | null;
}) {
  const db = useDB();
  const courts = db.courts.filter((c) => c.active);
  void family;
  const [bDate, setBDate] = useState(date);
  const [recurring, setRecurring] = useState(false);
  const [freq, setFreq] = useState<RecurrenceFreq>("weekly");
  const [until, setUntil] = useState(date);
  const [exceptions, setExceptions] = useState<string[]>([]);
  const [skipConflicts, setSkipConflicts] = useState(true);

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
    setDuration(initial.duration ?? 90);
    setKind(initial.kind ?? "partita");
    setPlayers((initial.players ?? []).join(", "));
    setExtras([]);
    setNote(initial.note ?? "");
    const d0 = initial.date ?? date;
    setBDate(d0);
    const u = new Date(d0);
    u.setDate(u.getDate() + 28);
    setUntil(u.toISOString().slice(0, 10));
    setRecurring(false);
    setExceptions([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.courtId, initial?.start]);

  const court = db.courts.find((c) => c.id === courtId) ?? null;
  const end = toHHMM(Math.min(OPEN_TO, toMin(start) + duration));
  const total = court ? bookingPrice(court, duration, kind === "manutenzione" ? [] : extras) : 0;
  const names = players
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);

  const rule = { freq, until, exceptions };
  const preview = useMemo(
    () =>
      recurring && court
        ? series.preview({ courtId: court.id, date: bDate, start, end, kind, title: "", players: [], extras: [], price: 0, note: "" }, rule)
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recurring, court?.id, bDate, start, end, freq, until, exceptions.join(","), db.bookings],
  );
  const conflicts = preview.filter((p) => p.conflict).length;
  const allDates = recurring ? expandRecurrence(bDate, { freq, until, exceptions: [] }) : [];

  const submit = () => {
    if (!court) return;
    const draft = {
      courtId: court.id,
      date: bDate,
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
      source: initial?.source ?? ("manuale" as const),
    };
    if (recurring) {
      const r = series.create(draft, rule, skipConflicts);
      if (!r.ok) {
        toast.error(r.error ?? "Impossibile creare la serie");
        return;
      }
      toast.success(`Serie creata: ${r.created} blocchi${r.skipped?.length ? ` · ${r.skipped.length} date saltate per conflitto` : ""}`);
      onClose();
      return;
    }
    const res = reservations.create(draft);
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
      title={initial?.source === "ai" ? "Verifica prenotazione AI" : "Nuova prenotazione"}
      subtitle={initial?.source === "ai" ? "Controlla i dati estratti prima di confermare" : "Compila i dettagli per riservare lo slot"}
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Btn variant="outline" onClick={onClose}>
            Annulla
          </Btn>
          <Btn variant="primary" onClick={submit} disabled={!court || (recurring && conflicts > 0 && !skipConflicts)}>
            {recurring ? `Crea ${preview.length - (skipConflicts ? conflicts : 0)} blocchi` : "Conferma prenotazione"}
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

        <Field label="Data">
          <Input type="date" value={bDate} onChange={(e) => setBDate(e.target.value)} />
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

        <Panel className="space-y-3 p-4">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
            <Repeat className="size-4 text-primary" /> Prenotazione ricorrente
          </label>
          {recurring && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Frequenza">
                  <Select value={freq} onChange={(e) => setFreq(e.target.value as RecurrenceFreq)}>
                    {(Object.keys(FREQ_LABEL) as RecurrenceFreq[]).map((f) => (
                      <option key={f} value={f}>{FREQ_LABEL[f]}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Fino al">
                  <Input type="date" min={bDate} value={until} onChange={(e) => setUntil(e.target.value)} />
                </Field>
              </div>
              <div>
                <div className="label-caps mb-2 text-muted-foreground">
                  Date generate ({preview.length}) · tocca per escludere
                </div>
                <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto">
                  {allDates.map((d) => {
                    const excluded = exceptions.includes(d);
                    const p = preview.find((x) => x.date === d);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setExceptions((l) => (excluded ? l.filter((x) => x !== d) : [...l, d]))}
                        title={p?.conflict ? `Occupato: ${p.conflict.title} ${p.conflict.start}–${p.conflict.end}` : excluded ? "Esclusa" : "Libera"}
                        className={cn(
                          "mono rounded border px-2 py-1 text-[11px]",
                          excluded
                            ? "border-border text-muted-foreground line-through"
                            : p?.conflict
                              ? "border-destructive bg-destructive/15 text-destructive"
                              : "border-success/50 bg-success/10 text-success",
                        )}
                      >
                        {d.slice(8)}/{d.slice(5, 7)}
                      </button>
                    );
                  })}
                </div>
              </div>
              {conflicts > 0 && (
                <div className="space-y-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-xs">
                  <div className="font-semibold text-destructive">{conflicts} date sovrapposte a prenotazioni esistenti</div>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={skipConflicts} onChange={(e) => setSkipConflicts(e.target.checked)} />
                    Salta le date in conflitto (diventano eccezioni)
                  </label>
                </div>
              )}
            </>
          )}
        </Panel>

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
  canPrepay,
}: {
  booking: Booking | null;
  onClose: () => void;
  canCancel: boolean;
  canPrepay: boolean;
}) {
  const db = useDB();
  const [confirm, setConfirm] = useState(false);
  const [scope, setScope] = useState<SeriesScope>("this");
  const [editing, setEditing] = useState(false);
  const [eStart, setEStart] = useState("");
  const [eDur, setEDur] = useState(90);
  const [eCourt, setECourt] = useState("");
  const [participants, setParticipants] = useState<Player[]>([]);
  const [payOpen, setPayOpen] = useState(false);
  const [payIds, setPayIds] = useState<string[]>([]);
  const [payMethod, setPayMethod] = useState<"contanti" | "carta" | "misto">("carta");
  const [payCash, setPayCash] = useState("0");

  useEffect(() => {
    if (!booking) return;
    setScope("this");
    setEditing(false);
    setEStart(booking.start);
    setEDur(toMin(booking.end) - toMin(booking.start));
    setECourt(booking.courtId);

    const courtType = db.courts.find((c) => c.id === booking.courtId)?.type;
    const isPadel = courtType === "padel";
    const maxParticipants = courtType === "beach" ? 12 : 4;
    const count = isPadel
      ? 4
      : Math.max(2, Math.min(maxParticipants, booking.participants?.length || booking.players.length || 2));

    const initialPlayers: Player[] = Array.from({ length: count }, (_, index) => {
      const existing = booking.participants?.[index];
      return existing
        ? { ...existing, extras: [...(existing.extras ?? [])] }
        : {
            id: `booking-${booking.id}-player-${index + 1}`,
            name: booking.players[index] ?? "",
            quota: Math.round((booking.price / count) * 100) / 100,
            paid: false,
            extras: [],
          };
    });

    setParticipants(initialPlayers);
    setPayOpen(false);
    setPayIds([]);
  }, [booking?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!booking) return null;

  const seriesCount = booking.seriesId
    ? db.bookings.filter((b) => b.seriesId === booking.seriesId && !b.cancelled).length
    : 0;

  const saveEdit = () => {
    const c = db.courts.find((x) => x.id === eCourt);
    if (!c) return;
    const end = toHHMM(Math.min(OPEN_TO, toMin(eStart) + eDur));
    const r = series.update(
      booking.id,
      { courtId: eCourt, start: eStart, end, price: bookingPrice(c, eDur, booking.extras) },
      booking.seriesId ? scope : "this",
    );
    if (!r.ok) {
      toast.error(r.error ?? "Modifica non riuscita");
      return;
    }
    toast.success(`Aggiornati ${r.updated} blocchi`);
    setEditing(false);
  };

  const court = db.courts.find((c) => c.id === booking.courtId);
  const fixedParticipants = court?.type === "padel";
  const participantLimit = court?.type === "beach" ? 12 : 4;

  const selectedPlayers = participants.filter(
    (player) => payIds.includes(player.id) && !player.paid,
  );

  const payTotal = Math.round(
    selectedPlayers.reduce(
      (sum, player) =>
        sum +
        player.quota +
        player.extras.reduce((extraSum, extra) => extraSum + extra.price * extra.qty, 0),
      0,
    ) * 100,
  ) / 100;

  const cashAmount = Number(payCash.replace(",", ".")) || 0;

  const updateParticipants = (next: Player[]) => {
    const quota = Math.round((booking.price / Math.max(1, next.length)) * 100) / 100;
    setParticipants(
      next.map((player, index) => ({
        ...player,
        quota:
          index === next.length - 1
            ? Math.round((booking.price - quota * (next.length - 1)) * 100) / 100
            : quota,
      })),
    );
  };

  const saveParticipants = () => {
    const names = participants.map((player) => player.name.trim());
    if (names.some((name) => !name)) {
      toast.error("Inserisci il nome di tutti i partecipanti.");
      return false;
    }

    const result = reservations.update(booking.id, { participants, players: names });
    if (!result.ok) {
      toast.error(result.error ?? "Impossibile salvare i partecipanti");
      return false;
    }
    return true;
  };

  const addParticipant = () => {
    if (participants.length >= participantLimit || fixedParticipants) return;

    updateParticipants([
      ...participants,
      {
        id: `booking-${booking.id}-player-${Date.now()}`,
        name: "",
        quota: 0,
        paid: false,
        extras: [],
      },
    ]);
  };

  const removeParticipant = (playerId: string) => {
    if (fixedParticipants || participants.length <= 2 || participants.some((p) => p.paid)) return;
    updateParticipants(participants.filter((player) => player.id !== playerId));
  };

  const submitPrepayment = () => {
    if (!payIds.length) {
      toast.error("Seleziona almeno un partecipante da pagare.");
      return;
    }

    if (participants.some((player) => !player.name.trim())) {
      toast.error("Inserisci il nome di tutti i partecipanti.");
      return;
    }

    if (payMethod === "misto" && (cashAmount < 0 || cashAmount > payTotal)) {
      toast.error("Controlla la ripartizione tra contanti e carta.");
      return;
    }

    const saved = reservations.update(booking.id, {
      participants,
      players: participants.map((player) => player.name.trim()),
    });

    if (!saved.ok) {
      toast.error(saved.error ?? "Impossibile salvare i partecipanti");
      return;
    }

    const result = courtSessions.payBookingPlayers(
      booking.id,
      payIds,
      payMethod,
      payMethod === "misto" ? cashAmount : payMethod === "contanti" ? payTotal : 0,
      payMethod === "misto"
        ? Math.round((payTotal - cashAmount) * 100) / 100
        : payMethod === "carta"
          ? payTotal
          : 0,
    );

    if (!result.ok) {
      toast.error(result.error ?? "Pagamento non riuscito");
      return;
    }

    setParticipants((current) =>
      current.map((player) =>
        payIds.includes(player.id) ? { ...player, paid: true } : player,
      ),
    );

    toast.success(`Pagamento anticipato registrato: ${eur(payTotal)}`);
    setPayOpen(false);
    setPayIds([]);
  };

  return (
    <>
      <Drawer
        open
        onClose={onClose}
        title={booking.title}
        subtitle={`${court?.name ?? "Campo"} · ${booking.start} → ${booking.end}`}
        footer={
          canCancel && !booking.cancelled ? (
            <div className="grid grid-cols-2 gap-2">
              {editing ? (
                <Btn variant="primary" onClick={saveEdit}>Salva modifiche</Btn>
              ) : (
                <Btn variant="outline" onClick={() => setEditing(true)}>
                  <Pencil className="size-4" /> Modifica
                </Btn>
              )}
              <Btn variant="danger" onClick={() => setConfirm(true)}>
                <Trash2 className="size-4" /> Annulla
              </Btn>
            </div>
          ) : undefined
        }
      >
        <div className="space-y-4">
          <div className="flex w-full flex-wrap items-center gap-2">
            <Badge tone={booking.cancelled ? "danger" : "primary"}>
              {booking.cancelled ? "ANNULLATA" : KIND_LABEL[booking.kind].toUpperCase()}
            </Badge>
            <Badge tone="neutral">{booking.date}</Badge>
            {booking.source === "ai" && <Badge tone="info">DA AI</Badge>}

            {canPrepay && participants.some((player) => !player.paid) && (
              <Btn
                variant="primary"
                size="sm"
                className="ml-auto"
                onClick={() => {
                  setPayIds(
                    participants.filter((player) => !player.paid).map((player) => player.id),
                  );
                  setPayMethod("carta");
                  setPayCash("0");
                  setPayOpen(true);
                }}
              >
                <Euro className="size-4" /> PAGA
              </Btn>
            )}
          </div>

          {booking.seriesId && booking.recurrence && (
            <Panel className="space-y-2 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Repeat className="size-4 text-primary" /> Serie ricorrente · {seriesCount} blocchi attivi
              </div>
              <div className="mono text-xs text-muted-foreground">
                {FREQ_LABEL[booking.recurrence.freq]} fino al {booking.recurrence.until}
                {booking.recurrence.exceptions.length > 0 && ` · eccezioni: ${booking.recurrence.exceptions.join(", ")}`}
              </div>
              <Field label="Applica modifiche / annullamento a">
                <Select value={scope} onChange={(e) => setScope(e.target.value as SeriesScope)}>
                  <option value="this">Solo questo blocco</option>
                  <option value="future">Questo e i successivi</option>
                  <option value="all">Tutta la serie</option>
                </Select>
              </Field>
            </Panel>
          )}

          {editing && (
            <Panel className="space-y-3 p-4">
              <Field label="Campo">
                <Select value={eCourt} onChange={(e) => setECourt(e.target.value)}>
                  {db.courts.filter((c) => c.active).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Ora inizio">
                  <Input type="time" step={1800} value={eStart} onChange={(e) => setEStart(e.target.value)} />
                </Field>
                <Field label="Durata">
                  <Select value={eDur} onChange={(e) => setEDur(Number(e.target.value))}>
                    {[60, 90, 120].map((m) => <option key={m} value={m}>{m} min</option>)}
                  </Select>
                </Field>
              </div>
              <p className="text-xs text-muted-foreground">
                Se anche un solo blocco va in conflitto, nessuna modifica viene applicata.
              </p>
            </Panel>
          )}

          <Panel className="space-y-2 p-4">
            <Row label="Campo" value={court?.name ?? "—"} />
            <Row label="Orario" value={`${booking.start} → ${booking.end}`} />
            <Row label="Totale" value={eur(booking.price)} />
            <Row label="Creata da" value={booking.createdBy} />
          </Panel>

          {!booking.cancelled && booking.kind !== "manutenzione" && (
            <WhatsAppShare title="Condividi su WhatsApp" text={bookingMessage(booking, court?.name ?? "Campo")} />
          )}

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="label-caps text-muted-foreground">Giocatori e quote</div>
              {!fixedParticipants &&
                participants.length < participantLimit &&
                !participants.some((player) => player.paid) &&
                !booking.cancelled && (
                  <Btn variant="outline" size="sm" onClick={addParticipant}>
                    <Plus className="size-3" /> Aggiungi
                  </Btn>
                )}
            </div>

            <div className="space-y-2">
              {participants.map((player, index) => (
                <div
                  key={player.id}
                  className="flex items-center gap-2 rounded-lg border border-border bg-surface-container px-3 py-2"
                >
                  <span className="mono flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[11px] text-primary">
                    {index + 1}
                  </span>
                  <Input
                    value={player.name}
                    placeholder={`Giocatore ${index + 1}`}
                    disabled={player.paid || booking.cancelled}
                    onChange={(event) =>
                      setParticipants((current) =>
                        current.map((item) =>
                          item.id === player.id ? { ...item, name: event.target.value } : item,
                        ),
                      )
                    }
                    className="min-w-0"
                  />
                  <span className="mono shrink-0 text-xs">{eur(player.quota)}</span>
                  {player.paid ? (
                    <Badge tone="success">PAGATO</Badge>
                  ) : (
                    <Badge tone="warning">DA PAGARE</Badge>
                  )}
                  {!fixedParticipants &&
                    participants.length > 2 &&
                    !participants.some((item) => item.paid) &&
                    !booking.cancelled && (
                      <button
                        type="button"
                        className="rounded p-1 text-muted-foreground hover:text-destructive"
                        title="Rimuovi giocatore"
                        onClick={() => removeParticipant(player.id)}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                </div>
              ))}
            </div>

            <p className="mt-2 text-xs text-muted-foreground">
              {court?.type === "padel"
                ? "Padel: 4 partecipanti obbligatori."
                : court?.type === "beach"
                  ? "Beach: da 2 a 12 partecipanti."
                  : "Tennis: da 2 a 4 partecipanti."}{" "}
              Quota campo ripartita tra i partecipanti.
            </p>

            {!booking.cancelled && (
              <Btn
                variant="outline"
                size="sm"
                className="mt-2 w-full"
                onClick={() => {
                  if (saveParticipants()) toast.success("Partecipanti e quote salvati");
                }}
              >
                Salva partecipanti
              </Btn>
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
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title="Pagamento anticipato"
        footer={
          <>
            <Btn variant="outline" onClick={() => setPayOpen(false)}>
              Annulla
            </Btn>
            <Btn
              variant="primary"
              disabled={
                !payIds.length ||
                payTotal <= 0 ||
                (payMethod === "misto" && (cashAmount < 0 || cashAmount > payTotal))
              }
              onClick={submitPrepayment}
            >
              Registra pagamento · {eur(payTotal)}
            </Btn>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Seleziona i partecipanti che saldano ora. La prenotazione rimane confermata fino
            all'orario di inizio.
          </p>

          <div className="space-y-2">
            {participants.map((player) => (
              <label
                key={player.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-surface-container p-3"
              >
                <input
                  type="checkbox"
                  checked={payIds.includes(player.id)}
                  disabled={player.paid}
                  onChange={(event) =>
                    setPayIds((current) =>
                      event.target.checked
                        ? [...current, player.id]
                        : current.filter((id) => id !== player.id),
                    )
                  }
                />
                <span className="min-w-0 flex-1 text-sm">
                  {player.name || "Nome da inserire"}
                </span>
                <span className="mono text-sm">{eur(player.quota)}</span>
                {player.paid && <Badge tone="success">PAGATO</Badge>}
              </label>
            ))}
          </div>

          <Field label="Metodo di pagamento">
            <Select
              value={payMethod}
              onChange={(event) =>
                setPayMethod(event.target.value as "contanti" | "carta" | "misto")
              }
            >
              <option value="contanti">Contanti</option>
              <option value="carta">Carta / POS</option>
              <option value="misto">Misto</option>
            </Select>
          </Field>

          {payMethod === "misto" && (
            <Field label="Importo in contanti">
              <Input
                type="number"
                min="0"
                max={payTotal}
                step="0.01"
                value={payCash}
                onChange={(event) => setPayCash(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Carta: {eur(Math.max(0, payTotal - cashAmount))}
              </p>
            </Field>
          )}

          <Panel className="flex items-center justify-between p-3">
            <span className="label-caps text-muted-foreground">Totale selezionato</span>
            <span className="mono text-xl font-bold">{eur(payTotal)}</span>
          </Panel>
        </div>
      </Modal>

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
                const n = series.cancel(booking.id, booking.seriesId ? scope : "this");
                toast.success(n > 1 ? `${n} blocchi annullati` : "Prenotazione annullata, slot liberato");
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

const WEEKDAYS = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];

function AiAssistant({ onExtract }: { onExtract: (init: FormInit) => void }) {
  const db = useDB();
  const parse = useServerFn(parseBookingRequest);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<{ summary: string; missing: string[] } | null>(null);
  const [error, setError] = useState("");

  const run = async () => {
    if (text.trim().length < 3 || loading) return;
    setLoading(true);
    setError("");
    setInfo(null);
    try {
      const n = new Date();
      const r = await parse({
        data: {
          text,
          today: dateKey(n),
          weekday: WEEKDAYS[n.getDay()] ?? "",
          now: toHHMM(minutesNow(n)),
          courts: db.courts.filter((c) => c.active).map((c) => ({ id: c.id, name: c.name, type: c.type })),
        },
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const x = r.result;
      setInfo({ summary: x.summary, missing: x.missing });
      onExtract({
        courtId: x.courtId ?? "",
        start: x.start ? toMin(x.start) : OPEN_FROM,
        ...(x.date ? { date: x.date } : {}),
        duration: x.durationMin && [60, 90, 120].includes(x.durationMin) ? x.durationMin : 90,
        kind: x.kind ?? "partita",
        players: x.players,
        note: x.note,
        source: "ai",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore imprevisto");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Panel className="space-y-2 p-3">
      <div className="label-caps flex items-center gap-2 text-primary">
        <Wand2 className="size-4" /> Prenotazione rapida con AI
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          placeholder="Es. domani alle 18:30 padel 2 per 90 minuti, Rossi e Bianchi"
          className="flex-1"
        />
        <Btn variant="primary" onClick={run} disabled={loading || text.trim().length < 3}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />} Estrai
        </Btn>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {info && (
        <p className="text-xs text-muted-foreground">
          {info.summary}
          {info.missing.length > 0 && <span className="text-warning"> · Da verificare: {info.missing.join(", ")}</span>}
        </p>
      )}
    </Panel>
  );
}
