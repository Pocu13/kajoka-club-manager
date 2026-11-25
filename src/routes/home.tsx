
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  Users2,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SessionDrawer } from "@/components/session-drawer";
import {
  Badge,
  Btn,
  Field,
  Input,
  Modal,
  Panel,
  SegTabs,
  Select,
} from "@/components/ui-kit";
import { courtSessions, useDB } from "@/lib/store";
import {
  bookingAt,
  currentBlock,
  dateKey,
  minutesNow,
  nextBooking,
  OPEN_FROM,
  OPEN_TO,
  toHHMM,
  toMin,
} from "@/lib/bookings";
import { eur, fmtTime } from "@/lib/format";
import type { Booking, Court, Session } from "@/lib/types";
import { cn } from "@/lib/utils";

// Rapporto della mappa mostrata nello screenshot.
// Rimane costante per evitare spostamenti delle card durante il resize.
const MAP_RATIO = 2.02;

const COURT_POSITIONS: Record<string, { x: number; y: number }> = {
  TENNIS1: { x: 22, y: 33 },
  BEACH1: { x: 70, y: 16 },
  BEACH2: { x: 76, y: 32 },
  BEACH3: { x: 88, y: 41 },
  PADEL1: { x: 36, y: 59 },
  PADEL2: { x: 66, y: 66 },
  PADEL3: { x: 88, y: 56 },
};

function getCourtPosition(court: Court) {
  const name = court.name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

  const type = String(court.type).toUpperCase();
  const number = name.match(/\d+/)?.[0] ?? "1";

  let family = "";

  if (name.includes("PADEL")) family = "PADEL";
  else if (name.includes("BEACH") || name.includes("SABBIA")) family = "BEACH";
  else if (name.includes("TENNIS")) family = "TENNIS";
  else if (type.includes("PADEL")) family = "PADEL";
  else if (type.includes("BEACH") || type.includes("SABBIA") || type.includes("VOLLEY"))
    family = "BEACH";
  else if (type.includes("TENNIS")) family = "TENNIS";

  return (
    COURT_POSITIONS[`${family}${number}`] ?? {
      x: court.x,
      y: court.y,
    }
  );
}

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

  const [view, setView] = useState<"3d" | "2d">("3d");
  const [selected, setSelected] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [romeHour, setRomeHour] = useState(() => getRomeHour());
  const [now, setNow] = useState(() => new Date());
  const [pageHeight, setPageHeight] = useState<number | null>(null);
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });
  const [selectedBlockStart, setSelectedBlockStart] = useState<number | null>(null);
  const [blockMenuOpen, setBlockMenuOpen] = useState(false);

  const pageRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const mapSpaceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateClock = () => {
      setNow(new Date());
      setRomeHour(getRomeHour());
    };
    const timer = window.setInterval(updateClock, 15_000);
    return () => window.clearInterval(timer);
  }, []);

  // Misura lo spazio reale disponibile nella finestra,
  // tenendo conto dell'AppShell, dell'intestazione e dei pulsanti.
  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;

    let frame = 0;

    const measure = () => {
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;

      let scrollOffset = window.scrollY;
      let ancestor = page.parentElement;

      while (ancestor) {
        if (ancestor !== document.body && ancestor !== document.documentElement) {
          scrollOffset += ancestor.scrollTop;
        }
        ancestor = ancestor.parentElement;
      }

      const pageTop = Math.max(0, page.getBoundingClientRect().top + scrollOffset);

      const headerHeight = headerRef.current?.offsetHeight ?? 0;
      const footerHeight = footerRef.current?.offsetHeight ?? 0;

      const minimumHeight = headerHeight + footerHeight + 24 + 80;
      const availableHeight = Math.floor(viewportHeight - pageTop - 16);

      const nextHeight = Math.max(minimumHeight, availableHeight);

      setPageHeight((current) => (current === nextHeight ? current : nextHeight));
    };

    const scheduleMeasure = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    };

    const observer = new ResizeObserver(scheduleMeasure);

    observer.observe(page);
    if (headerRef.current) observer.observe(headerRef.current);
    if (footerRef.current) observer.observe(footerRef.current);
    if (page.parentElement) observer.observe(page.parentElement);

    window.addEventListener("resize", scheduleMeasure);
    window.visualViewport?.addEventListener("resize", scheduleMeasure);

    scheduleMeasure();

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
      window.visualViewport?.removeEventListener("resize", scheduleMeasure);
    };
  }, []);

  // Ridimensiona insieme immagine e coordinate delle card,
  // mantenendo sempre le stesse proporzioni.
  useEffect(() => {
    if (view !== "3d") return;

    const space = mapSpaceRef.current;
    if (!space) return;

    const measure = () => {
      const availableWidth = space.clientWidth;
      const availableHeight = space.clientHeight;

      const width = Math.max(0, Math.min(availableWidth, availableHeight * MAP_RATIO));
      const height = width / MAP_RATIO;

      setMapSize((current) => {
        if (Math.abs(current.width - width) < 0.5 && Math.abs(current.height - height) < 0.5) {
          return current;
        }

        return { width, height };
      });
    };

    const observer = new ResizeObserver(measure);
    observer.observe(space);
    measure();

    return () => observer.disconnect();
  }, [view]);

  const activeMap =
    romeHour < 12
      ? {
          src: "/images/mappa_diurna.png",
          alt: "Vista aerea diurna del circolo",
        }
      : romeHour < 18
        ? {
            src: "/images/mappa_pomeriggio.png",
            alt: "Vista aerea pomeridiana del circolo",
          }
        : {
            src: "/images/mappa_notturna.png",
            alt: "Vista aerea notturna del circolo",
          };

  const todayKey = dateKey(now);
  const currentMinute = minutesNow(now);

  const block = useMemo(
    () => currentBlock(db.bookings, todayKey, currentMinute),
    [db.bookings, todayKey, currentMinute],
  );

  // I blocchi selezionabili seguono l'intervallo operativo configurato
  // e includono anche gli orari di inizio delle prenotazioni.
  const blockOptions = useMemo(() => {
    const step = Math.max(15, db.settings.slotStep || 30);
    const starts = new Set<number>();

    for (let minute = OPEN_FROM; minute < OPEN_TO; minute += step) {
      starts.add(minute);
    }

    starts.add(block.start);

    db.bookings
      .filter((booking) => !booking.cancelled && booking.date === todayKey)
      .forEach((booking) => {
        const start = toMin(booking.start);
        if (start >= OPEN_FROM && start < OPEN_TO) starts.add(start);
      });

    return [...starts].sort((a, b) => a - b).map((start) => {
      const startingBooking = db.bookings.find(
        (booking) =>
          !booking.cancelled &&
          booking.date === todayKey &&
          toMin(booking.start) === start,
      );

      const end = startingBooking
        ? toMin(startingBooking.end)
        : Math.min(OPEN_TO, start + step);

      return {
        start,
        end,
        label: toHHMM(start) + " – " + toHHMM(end),
      };
    });
  }, [db.settings.slotStep, db.bookings, todayKey, block.start]);

  const activeBlock =
    (selectedBlockStart === null
      ? null
      : blockOptions.find((option) => option.start === selectedBlockStart)) ?? block;

  const activeBlockIndex = blockOptions.findIndex(
    (option) => option.start === activeBlock.start,
  );

  const moveBlock = (direction: -1 | 1) => {
    const next = blockOptions[activeBlockIndex + direction];
    if (!next) return;

    setSelectedBlockStart(next.start);
    setBlockMenuOpen(false);
  };

  const selectBlock = (value: string) => {
    setSelectedBlockStart(Number(value));
    setBlockMenuOpen(false);
  };

  // Mostra le sessioni soltanto nei blocchi temporali in cui sono effettivamente attive.
  const sessionByCourt = useMemo(() => {
    const sessions = new Map<string, Session>();

    db.sessions.filter((session) => !session.closed).forEach((session) => {
      const startedAt = new Date(session.startedAt);

      if (dateKey(startedAt) !== todayKey) return;

      const startMinute = minutesNow(startedAt);

      if (
        startMinute <= activeBlock.start &&
        activeBlock.start < startMinute + session.durationMin
      ) {
        sessions.set(session.courtId, session);
      }
    });

    return sessions;
  }, [db.sessions, todayKey, activeBlock.start]);

  const bookingByCourt = useMemo(() => {
    const bookings = new Map<string, Booking>();

    db.courts.forEach((court) => {
      const booking = bookingAt(db.bookings, court.id, todayKey, activeBlock.start);
      if (booking) bookings.set(court.id, booking);
    });

    return bookings;
  }, [db.bookings, db.courts, todayKey, activeBlock.start]);

  const nextBookingByCourt = useMemo(() => {
    const bookings = new Map<string, Booking>();

    db.courts.forEach((court) => {
      const booking = nextBooking(db.bookings, court.id, todayKey, activeBlock.start);
      if (booking) bookings.set(court.id, booking);
    });

    return bookings;
  }, [db.bookings, db.courts, todayKey, activeBlock.start]);

  const occupied = db.courts.filter(
    (c) => sessionByCourt.has(c.id) || bookingByCourt.has(c.id),
  ).length;

  const free = db.courts.length - occupied;
  const today = new Date().toDateString();

  const todayTransactions = db.transactions.filter(
    (t) => !t.cancelled && new Date(t.ts).toDateString() === today,
  );

  const todayTotal = todayTransactions.reduce((sum, t) => sum + t.amount, 0);
  const todayCount = todayTransactions.length;
  const lowStock = db.products.filter((p) => p.stock <= p.minStock).length;

  const court = db.courts.find((c) => c.id === selected) ?? null;
  const session = court ? (sessionByCourt.get(court.id) ?? null) : null;
  const booking = court ? (bookingByCourt.get(court.id) ?? null) : null;
  const upcomingBooking = court ? (nextBookingByCourt.get(court.id) ?? null) : null;

  const compactMap = mapSize.width < 760;
  const tinyMap = mapSize.width < 440;

  const cardFontSize = Math.max(8, Math.min(11, mapSize.width / 105));

  return (
    <>
      <div
        ref={pageRef}
        className="grid min-w-0 gap-3"
        style={{
          height: pageHeight ?? "calc(100dvh - 140px)",
          gridTemplateRows: "auto minmax(0, 1fr) auto",
        }}
      >
        <div
          ref={headerRef}
          className="flex min-w-0 flex-wrap items-start justify-between gap-3"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <h1 className="text-xl font-bold uppercase sm:text-2xl xl:text-3xl">
                Club Management
              </h1>

              <Badge tone="primary">
                {occupied}/{db.courts.length} OCCUPATI
              </Badge>

              <Badge tone="success">
                {free}/{db.courts.length} LIBERI
              </Badge>

              {/* Navigazione blocchi */}
              <div className="relative inline-flex items-center gap-1">
                <Btn
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 w-8 px-0"
                  aria-label="Blocco precedente"
                  title="Blocco precedente"
                  disabled={activeBlockIndex <= 0}
                  onClick={() => moveBlock(-1)}
                >
                  <ChevronLeft className="size-4" />
                </Btn>

                <button
                  type="button"
                  aria-expanded={blockMenuOpen}
                  aria-haspopup="listbox"
                  onClick={() => setBlockMenuOpen((open) => !open)}
                  className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Badge tone="neutral" className="gap-1.5 cursor-pointer py-1.5">
                    <CalendarClock className="size-3" />
                    BLOCCO {activeBlock.label}
                  </Badge>
                </button>

                <Btn
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 w-8 px-0"
                  aria-label="Blocco successivo"
                  title="Blocco successivo"
                  disabled={
                    activeBlockIndex < 0 ||
                    activeBlockIndex >= blockOptions.length - 1
                  }
                  onClick={() => moveBlock(1)}
                >
                  <ChevronRight className="size-4" />
                </Btn>

                {blockMenuOpen && (
                  <div className="absolute left-1/2 top-full z-40 mt-2 w-64 -translate-x-1/2 rounded-xl border border-border bg-surface p-3 shadow-2xl">
                    <label className="block space-y-1.5">
                      <span className="label-caps text-muted-foreground">
                        Seleziona blocco orario
                      </span>

                      <Select
                        autoFocus
                        value={String(activeBlock.start)}
                        onChange={(event) => selectBlock(event.target.value)}
                      >
                        {blockOptions.map((option) => (
                          <option key={option.start} value={option.start}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </label>

                    <Btn
                      type="button"
                      variant="subtle"
                      size="sm"
                      className="mt-2 w-full"
                      onClick={() => {
                        setSelectedBlockStart(null);
                        setBlockMenuOpen(false);
                      }}
                    >
                      Torna al blocco corrente
                    </Btn>
                  </div>
                )}
              </div>
            </div>

            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              Controllo operativo del circolo — {db.courts.length} campi attivi
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
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
          <div
            ref={mapSpaceRef}
            className="flex min-h-0 min-w-0 items-center justify-center overflow-hidden"
          >
            <div
              className="relative shrink-0 overflow-hidden rounded-xl border border-border bg-black"
              style={{
                width: mapSize.width,
                height: mapSize.height,
                visibility: mapSize.width > 0 ? "visible" : "hidden",
              }}
            >
              <img
                src={activeMap.src}
                alt={activeMap.alt}
                draggable={false}
                className="absolute inset-0 block h-full w-full select-none object-cover object-center"
              />

              <div className="absolute inset-0">
                {db.courts.map((c) => {
                  const activeSession = sessionByCourt.get(c.id);
                  const activeBooking = bookingByCourt.get(c.id);
                  const upcoming = nextBookingByCourt.get(c.id);
                  const minsToNext = upcoming
                    ? toMin(upcoming.start) - activeBlock.start
                    : null;

                  const position = getCourtPosition(c);

                  const status = activeSession
                    ? "IN CORSO"
                    : activeBooking
                      ? `PRENOTATO → ${activeBooking.end}`
                      : minsToNext !== null && minsToNext <= 60
                        ? `LIBERO · TRA ${minsToNext}′`
                        : "LIBERO";

                  return (
                    <button
                      key={c.id}
                      type="button"
                      title={`${c.name} — ${status}`}
                      aria-label={`${c.name}, ${status}. Apri dettagli campo`}
                      onClick={() => setSelected(c.id)}
                      style={{
                        left: `${position.x}%`,
                        top: `${position.y}%`,
                        fontSize: cardFontSize,
                        padding: tinyMap
                          ? "4px 5px"
                          : compactMap
                            ? "5px 7px"
                            : "7px 10px",
                        gap: compactMap ? 4 : 7,
                        maxWidth: "24%",
                      }}
                      className={cn(
                        "absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center whitespace-nowrap rounded-lg border bg-black/85 leading-tight shadow-lg backdrop-blur-sm transition-colors hover:z-20 hover:bg-black focus-visible:z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                        activeSession || activeBooking
                          ? "border-primary/70"
                          : "border-border-strong",
                      )}
                    >
                      <span
                        className={cn(
                          "shrink-0 rounded-full",
                          activeSession || activeBooking ? "bg-primary" : "bg-success",
                        )}
                        style={{
                          width: compactMap ? 6 : 8,
                          height: compactMap ? 6 : 8,
                        }}
                      />

                      <span className="min-w-0 truncate font-bold uppercase">
                        {c.name}
                      </span>

                      {!compactMap && (
                        <span
                          className={cn(
                            "mono",
                            activeSession || activeBooking
                              ? "text-primary"
                              : "text-success",
                          )}
                          style={{ fontSize: cardFontSize - 1 }}
                        >
                          {status}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="min-h-0 overflow-y-auto pr-1">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {db.courts.map((c) => {
                const s = sessionByCourt.get(c.id);
                const activeBooking = bookingByCourt.get(c.id);
                const upcoming = nextBookingByCourt.get(c.id);
                const busy = !!s || !!activeBooking;

                return (
                  <button
                    key={c.id}
                    onClick={() => setSelected(c.id)}
                    className={cn(
                      "rounded-xl border p-4 text-left transition-colors",
                      busy
                        ? "border-primary/50 bg-primary/5 hover:bg-primary/10"
                        : "border-border bg-surface-low hover:bg-surface-high",
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-display text-xl font-bold">{c.name}</span>

                      <Badge tone={busy ? "primary" : "success"} dot>
                        {s ? "OCCUPATO" : activeBooking ? "PRENOTATO" : "LIBERO"}
                      </Badge>
                    </div>

                    <div className="label-caps mt-1 text-muted-foreground">{c.type}</div>

                    <div className="mono mt-4 text-sm">
                      {s ? (
                        <>
                          dalle {fmtTime(s.startedAt)} · {s.players.length} giocatori
                          <div className="mt-1 text-primary">
                            {eur(
                              s.players
                                .filter((p) => p.paid)
                                .reduce((sum, p) => sum + p.quota, 0),
                            )}{" "}
                            / {eur(s.total)}
                          </div>
                        </>
                      ) : activeBooking ? (
                        <>
                          {activeBooking.start}–{activeBooking.end} · {activeBooking.title}
                          <div className="mt-1 text-primary">
                            {activeBooking.players.length} giocatori prenotati
                          </div>
                        </>
                      ) : (
                        <span className="text-muted-foreground">
                          {upcoming
                            ? `Prossima ${upcoming.start}–${upcoming.end}`
                            : `${eur(c.hourlyPrice)} / ora`}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div ref={footerRef} className="min-w-0">
          <Panel className="flex min-w-0 flex-wrap items-center gap-2 p-2 sm:gap-3 sm:p-3">
            <Link to="/pos" className="max-sm:flex-1">
              <Btn variant="primary" size="sm" className="max-sm:w-full">
                <Plus className="size-4" /> Apri POS Bar
              </Btn>
            </Link>

            <Btn
              variant="outline"
              size="sm"
              className="max-sm:flex-1"
              onClick={() => setNewOpen(true)}
            >
              <Users2 className="size-4" /> Apri sessione campo
            </Btn>

            {lowStock > 0 && (
              <Link to="/magazzino" className="flex min-w-0 flex-wrap items-center gap-2">
                <Badge tone="warning">
                  <AlertTriangle className="size-3" /> {lowStock} prodotti sottoscorta
                </Badge>
                <span className="hidden text-xs text-muted-foreground underline xl:inline">
                  Visualizza magazzino →
                </span>
              </Link>
            )}

            <div className="mono ml-auto text-xs sm:text-sm">
              <span className="text-muted-foreground">Incasso oggi: </span>
              <span className="font-bold sm:text-lg">{eur(todayTotal)}</span>
              <span className="ml-2 text-muted-foreground">({todayCount} tx)</span>
            </div>
          </Panel>
        </div>
      </div>

      <SessionDrawer
        court={court}
        session={session}
        booking={booking}
        upcomingBooking={upcomingBooking}
        onClose={() => setSelected(null)}
        onStart={() => setNewOpen(true)}
        onCheckIn={(b) => {
          try {
            courtSessions.checkIn(b);
            toast.success(`Check-in ${b.title || "prenotazione"} — sessione avviata`);
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      />

      <NewSessionModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        preselect={court && !session ? court.id : undefined}
        booking={court && !session ? booking : null}
      />
    </>
  );
}

function getRomeHour() {
  const hour = new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    hour: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(new Date())
    .find((part) => part.type === "hour")?.value;

  return Number(hour ?? new Date().getHours());
}

function NewSessionModal({
  open,
  onClose,
  preselect,
  booking,
}: {
  open: boolean;
  onClose: () => void;
  preselect?: string | undefined;
  booking?: Booking | null;
}) {
  const db = useDB();
  const busy = new Set(db.sessions.filter((s) => !s.closed).map((s) => s.courtId));
  const freeCourts = db.courts.filter((c) => !busy.has(c.id));

  const [courtId, setCourtId] = useState(preselect ?? freeCourts[0]?.id ?? "");
  const [mode, setMode] = useState<"campo" | "giocatore">(db.settings.defaultPricingMode);
  const [duration, setDuration] = useState(String(db.settings.defaultDuration));
  const [count, setCount] = useState("4");
  const [names, setNames] = useState<string[]>(["", "", "", ""]);

  useEffect(() => {
    if (!open) return;

    if (preselect) setCourtId(preselect);

    if (booking) {
      const bookingDuration = Math.max(30, toMin(booking.end) - toMin(booking.start));
      const playerCount = Math.max(1, booking.players.length || 4);

      setDuration(String(bookingDuration));
      setCount(String(playerCount));
      setNames(
        Array.from(
          { length: playerCount },
          (_, index) => booking.players[index] ?? "",
        ),
      );
    }
  }, [open, preselect, booking]);

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
            {freeCourts.length === 0 && (
              <option value="">Nessun campo libero</option>
            )}

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

              {booking && ![60, 90, 120].includes(Number(duration)) && (
                <option value={duration}>{duration}</option>
              )}
            </Select>
          </Field>

          <Field label="Giocatori">
            <Select
              value={count}
              onChange={(e) => {
                setCount(e.target.value);

                setNames((previous) => {
                  const n = Number(e.target.value);
                  const next = [...previous];

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

          {Array.from({ length: Number(count) || 4 }).map((_, index) => (
            <Input
              key={index}
              placeholder={`Giocatore ${index + 1}`}
              value={names[index] ?? ""}
              onChange={(e) =>
                setNames((previous) => {
                  const next = [...previous];
                  next[index] = e.target.value;
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
