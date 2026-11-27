import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Banknote,
  CreditCard,
  Minus,
  Plus,
  Trash2,
  Users2,
} from "lucide-react";
import { WhatsAppShare } from "@/components/whatsapp-share";
import {
  Badge,
  Btn,
  Drawer,
  Field,
  Input,
  Modal,
  Panel,
  Select,
  Toggle,
} from "@/components/ui-kit";
import {
  courtSessions,
  reservations,
  useDB,
} from "@/lib/store";
import { sessionSummary } from "@/lib/whatsapp";
import { eur, fmtTime } from "@/lib/format";
import type { Booking, Court, Player, Session } from "@/lib/types";
import { cn } from "@/lib/utils";

type SessionDrawerProps = {
  court: Court | null;
  session: Session | null;
  booking: Booking | null;
  bookingOnly?: boolean;
  canPayBooking?: boolean;
  displayOnly?: boolean;
  onToggleBookingOnly?: (enabled: boolean) => void;
  upcomingBooking: Booking | null;
  onClose: () => void;
  onStart: () => void;
  onCheckIn: (booking: Booking) => void;
};

export function SessionDrawer({
  court,
  session: sourceSession,
  booking,
  bookingOnly = false,
  displayOnly = false,
  canPayBooking = false,
  onToggleBookingOnly,
  upcomingBooking,
  onClose,
  onStart,
  onCheckIn,
}: SessionDrawerProps) {
  const historicalPlayers: Player[] = sourceSession?.players?.length
    ? sourceSession.players.map((item) => ({ ...item, extras: [...(item.extras ?? [])] }))
    : booking?.participants?.length
      ? booking.participants.map((item) => ({ ...item, extras: [...(item.extras ?? [])] }))
      : (booking?.players ?? []).filter((name) => name.trim()).map((name, index) => ({
          id: `booking-${booking?.id ?? "historical"}-player-${index + 1}`,
          name,
          quota: Math.round(((booking?.price ?? 0) / Math.max(1, booking?.players.length ?? 1)) * 100) / 100,
          paid: false,
          extras: [],
        }));

  const session: Session | null =
    displayOnly && booking
      ? {
          id: `historical-${booking.id}`,
          courtId: booking.courtId,
          startedAt: new Date(`${booking.date}T${booking.start}:00`).toISOString(),
          durationMin: Math.max(
  30,
  (Number(booking.end.slice(0, 2)) * 60 +
    Number(booking.end.slice(3, 5))) -
    (Number(booking.start.slice(0, 2)) * 60 +
      Number(booking.start.slice(3, 5))),
),
          pricingMode: "campo",
          total: booking.price,
          players: historicalPlayers,
          closed: true,
          bookingId: booking.id,
        }
      : bookingOnly && booking
        ? {
            id: `booking-${booking.id}`,
            courtId: booking.courtId,
            startedAt: new Date(`${booking.date}T${booking.start}:00`).toISOString(),
            durationMin: Math.max(
  30,
  (Number(booking.end.slice(0, 2)) * 60 +
    Number(booking.end.slice(3, 5))) -
    (Number(booking.start.slice(0, 2)) * 60 +
      Number(booking.start.slice(3, 5))),
),
            pricingMode: "campo",
            total: booking.price,
            players: booking.participants ?? [],
            closed: false,
            bookingId: booking.id,
          }
        : sourceSession;

    const db = useDB();
  const [selPlayer, setSelPlayer] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payIds, setPayIds] = useState<string[]>([]);
  const [method, setMethod] = useState<"contanti" | "carta" | "misto">("carta");
  const [cash, setCash] = useState("0");
  const [payQuotaAmount, setPayQuotaAmount] = useState("0");
  const [editQuotas, setEditQuotas] = useState(false);
  const [quotaDraft, setQuotaDraft] = useState<Record<string, string>>({});

  // Dati modificabili della prenotazione prima del check-in.
  const [bookingParticipants, setBookingParticipants] = useState<Player[]>([]);
  const [bookingPrice, setBookingPrice] = useState("0");

  // Dati modificabili del resoconto di una partita conclusa.
  const [closedTotal, setClosedTotal] = useState("0");
  const [closedPlayers, setClosedPlayers] = useState<Player[]>([]);
  const [editingClosedDetails, setEditingClosedDetails] = useState(false);
  const [editingHistoricalBooking, setEditingHistoricalBooking] = useState(false);
  useEffect(() => {
    if (!booking) {
      setBookingParticipants([]);
      setBookingPrice("0");
      return;
    }

    setBookingPrice(String(booking.price));

    const courtType = db.courts.find(
      (item) => item.id === booking.courtId,
    )?.type;

    const maxParticipants = courtType === "beach" ? 12 : 4;
const fixedParticipants = courtType === "padel";

const existingCount =
  booking.participants?.length || booking.players.length || 0;

const count = displayOnly
  ? Math.max(1, Math.min(maxParticipants, existingCount || 1))
  : fixedParticipants
    ? 4
    : Math.max(2, Math.min(maxParticipants, existingCount || 2));
    const initialParticipants: Player[] = Array.from(
      { length: count },
      (_, index) => {
        const existing = booking.participants?.[index];

        if (existing) {
          return {
            ...existing,
            extras: [...(existing.extras ?? [])],
          };
        }

        return {
          id: `booking-${booking.id}-player-${index + 1}`,
          name: booking.players[index] ?? "",
          quota:
            Math.round((booking.price / count) * 100) / 100,
          paid: false,
          extras: [],
        };
      },
    );

    setBookingParticipants(initialParticipants);
  }, [booking?.id]); // eslint-disable-line react-hooks/exhaustive-deps

   useEffect(() => {
    if (!session?.closed) {
      setClosedTotal("0");
      setClosedPlayers([]);
      setEditingClosedDetails(false);
      setSelPlayer(null);
      return;
    }

    setClosedTotal(String(session.total));

    const players = session.players.map((player) => ({
      ...player,
      extras: [...(player.extras ?? [])],
    }));

    setClosedPlayers(players);
    setSelPlayer(players[0]?.id ?? null);
    setEditingClosedDetails(false);
    setPayOpen(false);
    setPayIds([]);
    setEditQuotas(false);
  }, [session?.id, session?.closed]);

  if (!court) return null;

  const player =
    session?.players.find((p) => p.id === selPlayer) ??
    session?.players[0] ??
    null;
    const canEditClosedDetails =
    displayOnly &&
    !!booking &&
    !!session?.closed &&
    session.bookingId === booking.id;

  const selectedClosedPlayer =
    closedPlayers.find((item) => item.id === selPlayer) ??
    closedPlayers[0] ??
    null;

  const quickExtras = db.products
    .filter((p) => p.posVisible && p.active)
    .slice(0, 6);

  const playerTotal = (pid: string) => {
    const p = session?.players.find((x) => x.id === pid);
    if (!p) return 0;

    return (
      p.quota +
      p.extras.reduce((sum, e) => sum + e.price * e.qty, 0)
    );
  };
  const payQuotaBase = payIds.reduce((sum, id) => {
    const p = session?.players.find((player) => player.id === id);
    return sum + (p?.quota ?? 0);
  }, 0);

  const payExtrasTotal = payIds.reduce((sum, id) => {
    const p = session?.players.find((player) => player.id === id);
    return (
      sum +
      (p?.extras.reduce(
        (extraSum, extra) => extraSum + extra.price * extra.qty,
        0,
      ) ?? 0)
    );
  }, 0);

  const parsedPayQuota = Number(payQuotaAmount.replace(",", "."));
  const payQuotaTotal =
    payIds.length === 1 &&
    Number.isFinite(parsedPayQuota) &&
    parsedPayQuota >= 0
      ? Math.min(parsedPayQuota, payQuotaBase)
      : payQuotaBase;
  const payTotal = payQuotaTotal + payExtrasTotal;

  const collected = session
    ? session.players
        .filter((p) => p.paid)
        .reduce((sum, p) => sum + p.quota, 0)
    : 0;
const fixedBookingParticipants = court.type === "padel" && !displayOnly;
  const bookingParticipantLimit = court.type === "beach" ? 12 : 4;

  const updateBookingParticipant = (
    playerId: string,
    patch: Partial<Player>,
  ) => {
    setBookingParticipants((current) =>
      current.map((item) =>
        item.id === playerId && !item.paid
          ? { ...item, ...patch }
          : item,
      ),
    );
  };

  const addBookingParticipant = () => {
    if (
      fixedBookingParticipants ||
      bookingParticipants.length >= bookingParticipantLimit
    ) {
      return;
    }

    setBookingParticipants((current) => [
      ...current,
      {
        id: `booking-${booking?.id ?? "new"}-player-${Date.now()}`,
        name: "",
        quota: 0,
        paid: false,
        extras: [],
      },
    ]);
  };

  const removeBookingParticipant = (playerId: string) => {
    const target = bookingParticipants.find(
      (item) => item.id === playerId,
    );

    if (
      fixedBookingParticipants ||
     bookingParticipants.length <= (displayOnly ? 1 : 2) ||
      target?.paid
    ) {
      return;
    }

    setBookingParticipants((current) =>
      current.filter((item) => item.id !== playerId),
    );
  };

  const saveActiveBooking = () => {
    if (!booking) return;

    const participantsToSave = displayOnly
      ? bookingParticipants.filter((item) => item.name.trim())
      : bookingParticipants;

    const names = participantsToSave.map((item) =>
      item.name.trim(),
    );

    if (!displayOnly && names.some((name) => !name)) {
      toast.error("Inserisci il nome di tutti i partecipanti.");
      return;
    }

    const price = Number(bookingPrice.replace(",", "."));

    if (!Number.isFinite(price) || price < 0) {
      toast.error("Inserisci un prezzo totale valido.");
      return;
    }

    for (const item of participantsToSave) {
      if (!Number.isFinite(item.quota) || item.quota < 0) {
        toast.error(`Controlla la quota di ${item.name || "un giocatore"}.`);
        return;
      }
    }

    const result = reservations.update(booking.id, {
      participants: participantsToSave,
      players: names,
      price: Math.round(price * 100) / 100,
    });

    if (!result.ok) {
      toast.error(
        result.error ?? "Impossibile salvare la prenotazione.",
      );
      return;
    }

    setEditingHistoricalBooking(false);
    toast.success("Prezzo, giocatori e quote salvati.");
  };

      const updateClosedPlayer = (
    playerId: string,
    patch: Partial<
      Pick<Player, "name" | "quota" | "paid" | "extras">
    >,
  ) => {
    if (!editingClosedDetails || !canEditClosedDetails) return;

    setClosedPlayers((current) =>
      current.map((item) =>
        item.id === playerId
          ? { ...item, ...patch }
          : item,
      ),
    );
  };

  const updateClosedExtra = (
    playerId: string,
    productId: string,
    patch: Partial<Player["extras"][number]>,
  ) => {
    const item = closedPlayers.find((player) => player.id === playerId);
    if (!item) return;

    updateClosedPlayer(playerId, {
      extras: item.extras.map((extra) =>
        extra.productId === productId
          ? { ...extra, ...patch }
          : extra,
      ),
    });
  };
  const removeClosedExtra = (
    playerId: string,
    productId: string,
  ) => {
    const item = closedPlayers.find((player) => player.id === playerId);
    if (!item) return;
    updateClosedPlayer(playerId, {
      extras: item.extras.filter((extra) => extra.productId !== productId),
    });
  };

  const addClosedPlayer = () => {
    if (!editingClosedDetails || closedPlayers.length >= (court?.type === "beach" ? 12 : 4)) return;
    setClosedPlayers((current) => [...current, {
      id: `historical-${booking?.id ?? "session"}-player-${Date.now()}`,
      name: "", quota: 0, paid: false, extras: [],
    }]);
  };

  const removeClosedPlayer = (playerId: string) => {
    if (!editingClosedDetails) return;
    setClosedPlayers((current) => current.filter((item) => item.id !== playerId));
  };

  const addClosedExtra = (playerId: string, product: (typeof quickExtras)[number]) => {
    const item = closedPlayers.find((player) => player.id === playerId);
    if (!item || !editingClosedDetails) return;
    const existing = item.extras.find((extra) => extra.productId === product.id);
    updateClosedPlayer(playerId, {
      extras: existing
        ? item.extras.map((extra) => extra.productId === product.id ? { ...extra, qty: extra.qty + 1 } : extra)
        : [...item.extras, {
            productId: product.id, name: product.name, qty: 1,
            price: product.price, cost: product.cost,
          }],
    });
  };

    const saveClosedSession = () => {
    if (!canEditClosedDetails || !editingClosedDetails || !session?.closed) {
      return;
    }

    const total = Number(closedTotal.replace(",", "."));

    if (!Number.isFinite(total) || total < 0) {
      toast.error("Inserisci un prezzo totale valido.");
      return;
    }

    const playersToSave = closedPlayers
      .filter((item) => item.name.trim())
      .map((item) => ({
        id: item.id,
        name: item.name.trim(),
        quota: item.quota,
        paid: item.paid,
        extras: item.extras,
      }));

    for (const item of playersToSave) {
      if (!Number.isFinite(item.quota) || item.quota < 0) {
        toast.error(`Controlla la quota di ${item.name}.`);
        return;
      }

      for (const extra of item.extras) {
        if (
          !Number.isFinite(extra.qty) ||
          extra.qty <= 0 ||
          !Number.isFinite(extra.price) ||
          extra.price < 0
        ) {
          toast.error(`Controlla gli extra di ${item.name}.`);
          return;
        }
      }
    }

    if (!booking) {
      toast.error("Prenotazione non trovata.");
      return;
    }
    const names = playersToSave.map((item) => item.name);
    const result = reservations.update(booking.id, {
      participants: playersToSave,
      players: names,
      price: Math.round(total * 100) / 100,
    });
    if (!result.ok) {
      toast.error(result.error ?? "Impossibile salvare la prenotazione.");
      return;
    }
    setClosedPlayers(playersToSave);
    setClosedTotal(String(Math.round(total * 100) / 100));
    setEditingClosedDetails(false);
    toast.success("Modifiche della partita salvate.");
  };

  return (
    <>
      <Drawer
        open={!!court}
        onClose={onClose}
        width="w-[520px]"
        title={court.name}
        subtitle={
          session
            ? session.closed
              ? `Partita conclusa · ${fmtTime(session.startedAt)} · ${session.players.length} giocatori`
              : `Sessione attiva dalle ${fmtTime(session.startedAt)} · ${session.players.length} giocatori`
            : booking
             ? `${displayOnly ? "Prenotazione passata" : "Prenotazione attiva"} ${booking.start}–${booking.end} · ${booking.title}`
              : `Campo libero · ${eur(court.hourlyPrice)} / ora`
        }
               footer={displayOnly ? null : (
          session ? (
            session.closed ? (
              <div className="rounded-lg border border-border bg-surface-container p-3 text-center text-sm text-muted-foreground">
                Partita conclusa · Resoconto storico modificabile
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="label-caps text-muted-foreground">
                    Totale da saldare
                  </span>
                  <span className="mono text-2xl font-bold">
                    {eur(
                      session.players
                        .filter((p) => !p.paid)
                        .reduce(
                          (sum, p) => sum + playerTotal(p.id),
                          0,
                        ),
                    )}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Btn
                    variant="outline"
                    onClick={() => {
                      const unpaid = session.players
                        .filter((p) => !p.paid)
                        .map((p) => p.id);

                      if (!unpaid.length) {
                        toast.info("Tutti i giocatori hanno saldato");
                        return;
                      }

                      setPayIds(unpaid);
                      setPayQuotaAmount(
                String(
        unpaid.reduce(
        (sum, id) =>
        sum +
        (session.players.find((p) => p.id === id)?.quota ?? 0),
      0,
    ),
  ),
);
                      setMethod("contanti");
                      setCash("0");
                      setPayOpen(true);
                    }}
                  >
                    <Banknote className="size-4" /> Contanti
                  </Btn>

                  <Btn
                    variant="primary"
                    onClick={() => {
                      const unpaid = session.players
                        .filter((p) => !p.paid)
                        .map((p) => p.id);

                      if (!unpaid.length) {
                        toast.info("Tutti i giocatori hanno saldato");
                        return;
                      }

                      setPayIds(unpaid);
                      setPayQuotaAmount(
  String(
    unpaid.reduce(
      (sum, id) =>
        sum +
        (session.players.find((p) => p.id === id)?.quota ?? 0),
      0,
    ),
  ),
);
                      setMethod("carta");
                      setCash("0");
                      setPayOpen(true);
                    }}
                  >
                    <CreditCard className="size-4" /> Carta / POS
                  </Btn>
                </div>

                                  {!bookingOnly && (
                  <Btn
                    variant="subtle"
                    className="w-full"
                    onClick={() => {
                      if (booking) {
                        const result = courtSessions.deactivateBooking(booking.id);

                        if (!result.ok) {
                          toast.error(
                            result.error ?? "Impossibile disattivare la prenotazione.",
                          );
                          return;
                        }

                        toast.success("Prenotazione disattivata. Campo liberato.");
                        onClose();
                        return;
                      }

                      courtSessions.close(session.id);
                      toast.success(`Sessione ${court.name} chiusa`);
                      onClose();
                    }}
                  >
                    {booking
                      ? "Disattiva prenotazione"
                      : "Chiudi sessione e libera il campo"}
                  </Btn>
                )}
              </div>
            )
          ) : (
            <div className="grid gap-2">


              <Btn
                variant={booking ? "subtle" : "primary"}
                className="w-full"
                onClick={() => {
                  onStart();
                  onClose();
                }}
              >
                <Plus className="size-4" />{" "}
                {booking
                  ? "Sessione personalizzata"
                  : `Avvia sessione su ${court.name}`}
              </Btn>
            </div>
          )
     )}
      >
                {booking &&
          canPayBooking &&
          onToggleBookingOnly && (
            <Panel className="p-3">
              <Toggle
                checked={bookingOnly}
                onChange={onToggleBookingOnly}
                label="PAGA"
                hint="Attiva o disattiva la scheda operativa della prenotazione."
              />
            </Panel>
          )}
        {!session ? (
          <div className="space-y-4">
            {booking && (
              <>
                <Panel className="border-primary/40 bg-primary/5 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="label-caps text-primary">
                      {displayOnly ? "Prenotazione passata" : "Prenotazione in corso"}
                      </div>
                      <div className="mt-1 font-semibold">
                        {booking.title}
                      </div>
                    </div>

                    <Badge tone="primary">
                      {booking.start}–{booking.end}
                    </Badge>
                  </div>

                  <div className="mt-3 text-sm text-muted-foreground">
                    {bookingParticipants
                      .map((item) => item.name.trim())
                      .filter(Boolean)
                      .join(", ") || "Nessun giocatore indicato"}
                  </div>

                  {booking.note && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      Note: {booking.note}
                    </div>
                  )}
                </Panel>

                <Panel className="space-y-4 p-4">
                  <div className="label-caps text-primary">
                    Modifica prenotazione
                  </div>

               <Field label="Prezzo totale prenotazione (€)">
  <Input
    type="number"
    min="0"
    step="0.01"
    value={bookingPrice}
    disabled={displayOnly && !editingHistoricalBooking}
    onChange={(event) => setBookingPrice(event.target.value)}
  />
</Field>

                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="label-caps text-muted-foreground">
                        Giocatori e quote
                      </div>

                      {(!displayOnly || editingHistoricalBooking) &&
  !fixedBookingParticipants &&
  bookingParticipants.length < bookingParticipantLimit && (
    <Btn
      variant="outline"
      size="sm"
      onClick={addBookingParticipant}
    >
      <Plus className="size-3" /> Aggiungi
    </Btn>
  )}
                      </div>
                    <div className="space-y-2">
                      {bookingParticipants.map((item, index) => (
                        <div
                          key={item.id}
                          className="rounded-lg border border-border bg-surface-container p-3"
                        >
                          <div className="flex items-center gap-2">
                            <span className="mono flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[11px] text-primary">
                              {index + 1}
                            </span>

                            <Input
                              value={item.name}
                              placeholder={`Giocatore ${index + 1}`}
                              disabled={item.paid || (displayOnly && !editingHistoricalBooking)}
                              onChange={(event) =>
                                updateBookingParticipant(item.id, {
                                  name: event.target.value,
                                })
                              }
                              className="min-w-0 flex-1"
                            />

                            {item.paid ? (
                              <Badge tone="success">PAGATO</Badge>
                            ) : (
                              <Badge tone="warning">DA PAGARE</Badge>
                            )}

                           {(!displayOnly || editingHistoricalBooking) &&
  !fixedBookingParticipants &&
  bookingParticipants.length > (displayOnly ? 1 : 2) &&
  !item.paid && (
                                <button
                                  type="button"
                                  className="rounded p-1 text-muted-foreground hover:text-destructive"
                                  title="Rimuovi giocatore"
                                  onClick={() =>
                                    removeBookingParticipant(item.id)
                                  }
                                                                  >
                                  <Trash2 className="size-4" />
                                </button>
                              )}
                          </div>

                          <div className="mt-2 flex items-center gap-2 pl-8">
                            <div className="w-32">
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={String(item.quota)}
                                disabled={item.paid || (displayOnly && !editingHistoricalBooking)}
                                onChange={(event) =>
                                  updateBookingParticipant(item.id, {
                                    quota: Math.max(
                                      0,
                                      Number(event.target.value) || 0,
                                    ),
                                  })
                                }
                              />
                            </div>
                            <span className="text-xs text-muted-foreground">
                              Quota giocatore (€)
                            </span>
                          </div>

                          {item.extras.length > 0 && (
                            <div className="mt-2 pl-8 text-xs text-muted-foreground">
                              Extra già assegnati:{" "}
                              {eur(
                                item.extras.reduce(
                                  (sum, extra) =>
                                    sum + extra.price * extra.qty,
                                  0,
                                ),
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    <p className="mt-2 text-xs text-muted-foreground">
                      {court.type === "padel"
                        ? "Padel: 4 partecipanti obbligatori."
                        : court.type === "beach"
                          ? "Beach: da 2 a 12 partecipanti."
                          : "Tennis: da 2 a 4 partecipanti."}{" "}
                      Le quote dei giocatori già pagati non sono modificabili.
                      Aggiungere o rimuovere un partecipante non modifica le
                      quote degli altri.
                    </p>
                  </div>
{!displayOnly ? (
  <Btn
    variant="primary"
    className="w-full"
    onClick={saveActiveBooking}
  >
    Salva prezzo, giocatori e quote
  </Btn>
) : (
  <Btn
    variant={editingHistoricalBooking ? "primary" : "outline"}
    className="w-full"
    onClick={() => {
      if (editingHistoricalBooking) {
        saveActiveBooking();
      } else {
        setEditingHistoricalBooking(true);
      }
    }}
  >
    {editingHistoricalBooking ? "Salva modifiche" : "Modifica"}
  </Btn>
)}
                </Panel>
              </>
            )}

            <Panel className="p-4">
              <div className="label-caps text-muted-foreground">
                Tariffa campo
              </div>
              <div className="mono mt-1 text-2xl font-bold">
                {eur(court.hourlyPrice)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Tipologia: {court.type} · durata standard{" "}
                {db.settings.defaultDuration}′
              </div>
            </Panel>

            <p className="text-sm text-muted-foreground">
              {booking
                ? "Puoi modificare e salvare la prenotazione prima del check-in. Dopo il check-in, la gestione passa alla sessione operativa."
                : "Nessuna sessione in corso su questo campo. Avvia una sessione per registrare giocatori, quote ed extra bar."}
            </p>

            {!booking && upcomingBooking && (
              <Panel className="p-4">
                <div className="label-caps text-muted-foreground">
                  Prossima prenotazione
                </div>
                <div className="mt-1 text-sm font-semibold">
                  {upcomingBooking.start}–{upcomingBooking.end} ·{" "}
                  {upcomingBooking.title}
                </div>
              </Panel>
            )}
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
                  <span className="text-muted-foreground">
                    / {eur(session.total)}
                  </span>
                </span>
              </div>

              <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-highest">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{
                    width: `${Math.min(
                      100,
                      (collected / Math.max(1, session.total)) * 100,
                    )}%`,
                  }}
                />
              </div>

              <div className="mt-2 flex justify-between text-xs">
                <span className="text-muted-foreground">
                  {session.players.length} giocatori · modalità{" "}
                  {session.pricingMode === "campo"
                    ? "prezzo campo"
                    : "quota giocatore"}
                </span>
                <span className="text-success">
                  {session.players.filter((p) => p.paid).length}/
                  {session.players.length} saldati
                </span>
              </div>
            </Panel>

                      {!displayOnly && (
              <WhatsAppShare
                title="Invia riepilogo conto su WhatsApp"
                text={sessionSummary(session, court.name)}
              />
            )}

            <div>

              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="label-caps text-muted-foreground">
                  Ripartizione quota e extra
                </span>

                {canEditClosedDetails ? (
                  <div className="flex gap-2">
                    {editingClosedDetails && (
                      <Btn
                        size="sm"
                        variant="subtle"
                        onClick={() => {
                          setClosedPlayers(
                            session.players.map((item) => ({
                              ...item,
                              extras: [...(item.extras ?? [])],
                            })),
                          );
                          setClosedTotal(String(session.total));
                          setEditingClosedDetails(false);
                        }}
                      >
                        Annulla
                      </Btn>
                    )}

                    <Btn
                      size="sm"
                      variant={editingClosedDetails ? "primary" : "outline"}
                      onClick={() => {
                        if (editingClosedDetails) {
                          saveClosedSession();
                        } else {
                          setClosedPlayers(
                            session.players.map((item) => ({
                              ...item,
                              extras: [...(item.extras ?? [])],
                            })),
                          );
                          setClosedTotal(String(session.total));
                          setEditingClosedDetails(true);
                        }
                      }}
                    >
                      {editingClosedDetails
                        ? "Salva modifiche"
                        : "Modifica"}
                    </Btn>
                  </div>
                ) : (
                  !displayOnly && (
                    <button
                      className="text-xs font-semibold text-primary"
                      onClick={() => {
                        setQuotaDraft(
                          Object.fromEntries(
                            session.players.map((p) => [
                              p.id,
                              String(p.quota),
                            ]),
                          ),
                        );
                        setEditQuotas((value) => !value);
                      }}
                    >
                      {editQuotas ? "Chiudi" : "Modifica quote"}
                    </button>
                  )
                )}
              </div>



              <div className="space-y-2">

              {editingClosedDetails && (
                <div className="mb-4 space-y-3 rounded-xl border border-border bg-surface p-3">
                  <Field label="Prezzo totale della partita (€)">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={closedTotal}
                      onChange={(event) =>
                        setClosedTotal(event.target.value)
                      }
                    />
                  </Field>

                </div>
              )}

                {editingClosedDetails && (
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">{closedPlayers.length} partecipanti</span>
                    <Btn size="sm" variant="outline" onClick={addClosedPlayer} disabled={closedPlayers.length >= (court.type === "beach" ? 12 : 4)}>
                      <Plus className="size-3" /> Aggiungi giocatore
                    </Btn>
                  </div>
                )}
                {(displayOnly || editingClosedDetails ? closedPlayers : session.players).map((p, index) => {
                  const active = player?.id === p.id;
                  const closedItem =
                    closedPlayers.find((item) => item.id === p.id) ?? p;
                  const visiblePlayer = editingClosedDetails
                    ? closedItem
                    : p;

                  return (
                    <div
                      key={p.id}
                      onClick={
                        displayOnly ? undefined : () => setSelPlayer(p.id)
                      }
                      className={cn(
                        "cursor-pointer rounded-xl border p-3 transition-colors",
                        active
                          ? "border-primary/70 bg-primary/5"
                          : "border-border bg-surface-container hover:bg-surface-high",
                        visiblePlayer.paid && "opacity-80",
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
                          {`G${index + 1}`}
                        </span>

                        <div className="min-w-0 flex-1">
                          {editingClosedDetails ? (
                            <Input
                              value={visiblePlayer.name}
                              placeholder={`Giocatore ${index + 1}`}
                              onChange={(event) =>
                                updateClosedPlayer(p.id, {
                                  name: event.target.value,
                                })
                              }
                            />
                          ) : (
                            <div className="truncate text-sm font-semibold">
                              {visiblePlayer.name}
                            </div>
                          )}

                          {!editingClosedDetails && (
                            <div className="mono text-[11px] text-muted-foreground">
                              Quota: {eur(visiblePlayer.quota)} · Extra:{" "}
                              {eur(
                                visiblePlayer.extras.reduce(
                                  (sum, extra) =>
                                    sum + extra.price * extra.qty,
                                  0,
                                ),
                              )}
                            </div>
                          )}
                        </div>

                        {!editingClosedDetails ? (
                          visiblePlayer.paid ? <Badge tone="success">✓ PAGATO</Badge> : <Badge tone="primary" dot>DA PAGARE</Badge>
                        ) : (
                          <button type="button" className="rounded p-1 text-danger" title="Rimuovi giocatore" onClick={() => removeClosedPlayer(p.id)}>
                            <Trash2 className="size-4" />
                          </button>
                        )}
                      </div>

                      {editingClosedDetails ? (
                        <div className="mt-3 space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <Field label="Quota (€)">
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={String(visiblePlayer.quota)}
                                onChange={(event) =>
                                  updateClosedPlayer(p.id, {
                                    quota: Number(event.target.value),
                                  })
                                }
                              />
                            </Field>

                            <div className="flex items-end">
                              <Toggle
                                checked={visiblePlayer.paid}
                                onChange={(checked) =>
                                  updateClosedPlayer(p.id, {
                                    paid: checked,
                                  })
                                }
                                label="Pagato"
                                hint="Stato del pagamento"
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div className="label-caps text-muted-foreground">
                              Extra del giocatore
                            </div>

                            {visiblePlayer.extras.length === 0 && (
                              <div className="text-xs text-muted-foreground">
                                Nessun extra registrato.
                              </div>
                            )}
                                                        {visiblePlayer.extras.map((extra) => (
                              <div
                                key={extra.productId}
                                className="rounded-lg border border-border bg-surface p-2"
                              >
                                <div className="mb-2 flex items-center justify-between gap-2">
                                  <span className="text-xs font-semibold">
                                    {extra.name}
                                  </span>
                                  <button
                                    type="button"
                                    className="text-danger"
                                    onClick={() =>
                                      removeClosedExtra(
                                        p.id,
                                        extra.productId,
                                      )
                                    }
                                  >
                                    <Trash2 className="size-3.5" />
                                  </button>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                  <Field label="Quantità">
                                    <Input
                                      type="number"
                                      min="0.01"
                                      step="0.01"
                                      value={String(extra.qty)}
                                      onChange={(event) =>
                                        updateClosedExtra(
                                          p.id,
                                          extra.productId,
                                          {
                                            qty: Number(event.target.value),
                                          },
                                        )
                                      }
                                    />
                                  </Field>

                                  <Field label="Prezzo unitario (€)">
                                    <Input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={String(extra.price)}
                                      onChange={(event) =>
                                        updateClosedExtra(
                                          p.id,
                                          extra.productId,
                                          {
                                            price: Number(event.target.value),
                                          },
                                        )
                                      }
                                    />
                                  </Field>
                                </div>
                              </div>
                            ))}
                            {quickExtras.length > 0 && (
                              <div className="flex flex-wrap gap-2 pt-2">
                                {quickExtras.map((product) => (
                                  <Btn key={product.id} size="sm" variant="outline" onClick={() => addClosedExtra(p.id, product)}>
                                    <Plus className="size-3" /> {product.name}
                                  </Btn>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <>
                          {!displayOnly && editQuotas && !p.paid && (
                            <div className="mt-3 flex items-center gap-2">
                              <Input
                                type="number"
                                step="0.5"
                                value={quotaDraft[p.id] ?? String(p.quota)}
                                onChange={(event) =>
                                  setQuotaDraft((draft) => ({
                                    ...draft,
                                    [p.id]: event.target.value,
                                  }))
                                }
                                className="h-8 w-28"
                              />
                              <span className="text-xs text-muted-foreground">
                                quota giocatore
                              </span>
                            </div>
                          )}

                          {visiblePlayer.extras.length > 0 && (
                            <div className="mt-3 space-y-1 rounded-lg border border-border bg-surface px-3 py-2">
                              {visiblePlayer.extras.map((extra) => (
                                <div
                                  key={extra.productId}
                                  className="mono flex items-center justify-between text-[11px]"
                                >
                                  <span>
                                    {extra.qty}× {extra.name}
                                  </span>
                                  <span>
                                    {eur(extra.price * extra.qty)}
                                  </span>
                                </div>
                              ))}

                              <div className="mono flex justify-between border-t border-border pt-1 text-[11px] font-bold">
                                <span>Totale giocatore</span>
                                <span>{eur(playerTotal(p.id))}</span>
                              </div>
                            </div>
                          )}

                          {!displayOnly && !p.paid && (
                            <div className="mt-3 flex justify-end">
                              <Btn
                                size="sm"
                                variant="outline"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setPayIds([p.id]);
                                  setPayQuotaAmount(String(p.quota));
                                  setMethod("carta");
                                  setCash("0");
                                  setPayOpen(true);
                                }}
                              >
                                Salda {eur(playerTotal(p.id))}
                              </Btn>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

               {!displayOnly && editQuotas && (
                <Btn
                  variant="primary"
                  size="sm"
                  className="mt-3 w-full"
                  onClick={() => {
                                       const quotas = Object.fromEntries(
                      Object.entries(quotaDraft).map(([key, value]) => [
                        key,
                        Number(value) || 0,
                      ]),
                    );

                    if (bookingOnly && booking) {
                      courtSessions.updateBookingQuotas(booking.id, quotas);
                    } else {
                      courtSessions.updateQuotas(session.id, quotas);
                    }
                    setEditQuotas(false);
                    toast.success("Quote aggiornate");
                  }}
                >
                  Salva ripartizione
                </Btn>
              )}
            </div>

           {!displayOnly && player && !player.paid && (
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
                        if (bookingOnly && booking) {
                          const result = courtSessions.addBookingExtra(
                            booking.id,
                            player.id,
                            p.id,
                          );

                          if (!result.ok) {
                            toast.error(result.error ?? "Impossibile aggiungere l'extra.");
                            return;
                          }
                        } else {
                          courtSessions.addExtra(session.id, player.id, p.id);
                        }

                        toast.success(
                          `${p.name} addebitato a ${player.name}`,
                        );
                      }}
                      className="rounded-lg border border-border bg-surface-container p-2 text-left transition-colors hover:border-primary/50 hover:bg-surface-high disabled:opacity-40"
                    >
                      <div className="label-caps text-muted-foreground">
                        {p.category}
                      </div>
                      <div className="mt-1 truncate text-xs font-semibold">
                        {p.name}
                      </div>
                      <div className="mono mt-1 text-xs text-primary">
                        {eur(p.price)}
                      </div>
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
        open={!displayOnly && payOpen && !!session && !session.closed}
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
                if (!session || session.closed) return;

                const cashAmount =
                  method === "misto" ? Number(cash) || 0 : 0;

                                if (bookingOnly && booking) {
                  const result = courtSessions.payBookingPlayers(
                    booking.id,
                    payIds,
                    method,
                    cashAmount,
                    Math.max(0, payTotal - cashAmount),
                    payQuotaTotal,
                  );

                  if (!result.ok) {
                    toast.error(result.error ?? "Errore durante l'incasso.");
                    return;
                  }
                } else {
                  courtSessions.payPlayers(
                    session.id,
                    payIds,
                    method,
                    cashAmount,
                    Math.max(0, payTotal - cashAmount),
                    payQuotaTotal,
                  );
                }

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
              {payIds.length} giocator
              {payIds.length === 1 ? "e" : "i"}
            </span>
            <span className="text-xl font-bold">{eur(payTotal)}</span>
          </div>
          {payIds.length === 1 && (
            <Field label="Quota campo da incassare (€)">
              <Input
                type="number"
                min="0"
                max={payQuotaBase}
                step="0.50"
                value={payQuotaAmount}
                onChange={(e) => setPayQuotaAmount(e.target.value)}
              />
              <div className="grid grid-cols-2 gap-2 mt-2">
                <Btn
                  variant="outline"
                  onClick={() =>
                    setPayQuotaAmount(
                      Math.max(
                        0,
                        (Number(payQuotaAmount.replace(",", ".")) || 0) - 0.5,
                      ).toFixed(2),
                    )
                  }
                >
                  − 0,50 €
                </Btn>
                <Btn
                  variant="outline"
                  onClick={() =>
                    setPayQuotaAmount(
                      Math.min(
                        payQuotaBase,
                        (Number(payQuotaAmount.replace(",", ".")) || 0) + 0.5,
                      ).toFixed(2),
                    )
                  }
                >
                  + 0,50 €
                </Btn>
              </div>
            </Field>
          )}

          {payExtrasTotal > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                Extra (importo integrale)
              </span>
              <span className="font-semibold">{eur(payExtrasTotal)}</span>
            </div>
          )}
          <Field label="Metodo di pagamento">
            <Select
              value={method}
              onChange={(e) =>
                setMethod(e.target.value as typeof method)
              }
            >
              <option value="contanti">Contanti</option>
              <option value="carta">Carta / POS</option>
              <option value="misto">Misto</option>
            </Select>
          </Field>

          {method === "misto" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Contanti">
                <Input
                  value={cash}
                  onChange={(e) => setCash(e.target.value)}
                />
              </Field>

              <Field label="Carta">
                <Input
                  readOnly
                  value={Math.max(
                    0,
                    payTotal - (Number(cash) || 0),
                  ).toFixed(2)}
                />
              </Field>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
