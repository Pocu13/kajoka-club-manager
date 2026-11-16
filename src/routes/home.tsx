import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Banknote,
  CalendarClock,
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
import { bookingAt, currentBlock, dateKey, minutesNow, nextBooking, toMin } from "@/lib/bookings";
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
  const user = useCurrentUser();

  const [view, setView] = useState<"3d" | "2d">("3d");
  const [selected, setSelected] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [romeHour, setRomeHour] = useState(() => getRomeHour());
  const [now, setNow] = useState(() => new Date());
  const [pageHeight, setPageHeight] = useState<number | null>(null);
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });

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

      // Su finestre eccezionalmente basse resta possibile scorrere,
      // senza sovrapporre o nascondere i comandi.
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

  const sessionByCourt = useMemo(() => {
    const sessions = new Map<string, Session>();

    db.sessions
      .filter((session) => !session.closed)
      .forEach((session) => sessions.set(session.courtId, session));

    return sessions;
  }, [db.sessions]);

  const todayKey = dateKey(now);
  const currentMinute = minutesNow(now);
  const block = useMemo(
    () => currentBlock(db.bookings, todayKey, currentMinute),
    [db.bookings, todayKey, currentMinute],
  );

  const bookingByCourt = useMemo(() => {
    const bookings = new Map<string, Booking>();

    db.courts.forEach((court) => {
      const booking = bookingAt(db.bookings, court.id, todayKey, currentMinute);
      if (booking) bookings.set(court.id, booking);
    });

    return bookings;
  }, [db.bookings, db.courts, todayKey, currentMinute]);

  const nextBookingByCourt = useMemo(() => {
    const bookings = new Map<string, Booking>();

    db.courts.forEach((court) => {
      const booking = nextBooking(db.bookings, court.id, todayKey, currentMinute);
      if (booking) bookings.set(court.id, booking);
    });

    return bookings;
  }, [db.bookings, db.courts, todayKey, currentMinute]);

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
        <div ref={headerRef} className="flex min-w-0 flex-wrap items-start justify-between gap-3">
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
              <Link to="/prenotazioni">
                <Badge tone="neutral" className="gap-1.5">
                  <CalendarClock className="size-3" /> BLOCCO {block.label}
                </Badge>
              </Link>
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
            <Btn variant="outline" size="sm" onClick={() => toast.success("Mappa aggiornata")}>
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
                  const position = getCourtPosition(c);
                  const status = activeSession
                    ? "OCCUPATO"
                    : activeBooking
                      ? "PRENOTATO"
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
                        padding: tinyMap ? "4px 5px" : compactMap ? "5px 7px" : "7px 10px",
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

                      <span className="min-w-0 truncate font-bold uppercase">{c.name}</span>

                      {!compactMap && (
                        <span
                          className={cn(
                            "mono",
                            activeSession || activeBooking ? "text-primary" : "text-success",
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
                              s.players.filter((p) => p.paid).reduce((sum, p) => sum + p.quota, 0),
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
        canManage={!!user}
        onStart={() => setNewOpen(true)}
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

function SessionDrawer({
  court,
  session,
  booking,
  upcomingBooking,
  onClose,
  onStart,
}: {
  court: Court | null;
  session: Session | null;
  booking: Booking | null;
  upcomingBooking: Booking | null;
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
    return p.quota + p.extras.reduce((sum, e) => sum + e.price * e.qty, 0);
  };

  const payTotal = payIds.reduce((sum, id) => sum + playerTotal(id), 0);
  const collected = session
    ? session.players.filter((p) => p.paid).reduce((sum, p) => sum + p.quota, 0)
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
            : booking
              ? `Prenotazione attiva ${booking.start}–${booking.end} · ${booking.title}`
              : `Campo libero · ${eur(court.hourlyPrice)} / ora`
        }
        footer={
          session ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="label-caps text-muted-foreground">Totale da saldare</span>
                <span className="mono text-2xl font-bold">
                  {eur(
                    session.players
                      .filter((p) => !p.paid)
                      .reduce((sum, p) => sum + playerTotal(p.id), 0),
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
            {booking && (
              <Panel className="border-primary/40 bg-primary/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="label-caps text-primary">Prenotazione in corso</div>
                    <div className="mt-1 font-semibold">{booking.title}</div>
                  </div>
                  <Badge tone="primary">
                    {booking.start}–{booking.end}
                  </Badge>
                </div>
                <div className="mt-3 text-sm text-muted-foreground">
                  {booking.players.length
                    ? booking.players.join(", ")
                    : "Nessun giocatore indicato"}
                </div>
                {booking.note && (
                  <div className="mt-2 text-xs text-muted-foreground">Note: {booking.note}</div>
                )}
              </Panel>
            )}
            <Panel className="p-4">
              <div className="label-caps text-muted-foreground">Tariffa campo</div>
              <div className="mono mt-1 text-2xl font-bold">{eur(court.hourlyPrice)}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Tipologia: {court.type} · durata standard {db.settings.defaultDuration}′
              </div>
            </Panel>
            <p className="text-sm text-muted-foreground">
              {booking
                ? "La prenotazione è attiva. Avvia la sessione per registrare quote, pagamenti ed extra bar."
                : "Nessuna sessione in corso su questo campo. Avvia una sessione per registrare giocatori, quote ed extra bar."}
            </p>
            {!booking && upcomingBooking && (
              <Panel className="p-4">
                <div className="label-caps text-muted-foreground">Prossima prenotazione</div>
                <div className="mt-1 text-sm font-semibold">
                  {upcomingBooking.start}–{upcomingBooking.end} · {upcomingBooking.title}
                </div>
              </Panel>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            <Panel className="p-4">
              <div className="flex items-center justify-between">
                <span className="label-caps text-muted-foreground">Incasso quote campo</span>
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
                  {session.players.filter((p) => p.paid).length}/{session.players.length} saldati
                </span>
              </div>
            </Panel>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="label-caps text-muted-foreground">Ripartizione quota e extra</span>
                <button
                  className="text-xs font-semibold text-primary"
                  onClick={() => {
                    setQuotaDraft(
                      Object.fromEntries(session.players.map((p) => [p.id, String(p.quota)])),
                    );
                    setEditQuotas((value) => !value);
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
                            {eur(p.extras.reduce((sum, e) => sum + e.price * e.qty, 0))}
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
                              setQuotaDraft((draft) => ({
                                ...draft,
                                [p.id]: e.target.value,
                              }))
                            }
                            className="h-8 w-28"
                          />
                          <span className="text-xs text-muted-foreground">quota giocatore</span>
                        </div>
                      )}

                      {p.extras.length > 0 && (
                        <div className="mt-3 space-y-1 rounded-lg border border-border bg-surface px-3 py-2">
                          {p.extras.map((extra) => (
                            <div
                              key={extra.productId}
                              className="mono flex items-center justify-between text-[11px]"
                            >
                              <span>
                                {extra.qty}× {extra.name}
                              </span>
                              <span className="flex items-center gap-2">
                                {eur(extra.price * extra.qty)}
                                {!p.paid && (
                                  <button
                                    className="text-danger"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      courtSessions.removeExtra(session.id, p.id, extra.productId);
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
                            onClick={(event) => {
                              event.stopPropagation();
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
                        Object.entries(quotaDraft).map(([key, value]) => [key, Number(value) || 0]),
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
                  <span className="mono text-[11px] text-muted-foreground">Bar &amp; Pro Shop</span>
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
                      <div className="mono text-[10px] text-muted-foreground">{p.stock} disp.</div>
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

                const cashAmount = method === "misto" ? Number(cash) || 0 : 0;

                courtSessions.payPlayers(
                  session.id,
                  payIds,
                  method,
                  cashAmount,
                  Math.max(0, payTotal - cashAmount),
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
            <Select value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
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
                <Input readOnly value={Math.max(0, payTotal - (Number(cash) || 0)).toFixed(2)} />
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
      setNames(Array.from({ length: playerCount }, (_, index) => booking.players[index] ?? ""));
    }
  }, [open, preselect, booking]);

  const court = db.courts.find((c) => c.id === courtId);
  const total = court ? Math.round(court.hourlyPrice * (Number(duration) / 60) * 100) / 100 : 0;

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