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
  upcomingBooking: Booking | null;
  onClose: () => void;
  onStart: () => void;
  onCheckIn: (booking: Booking) => void;
};

export function SessionDrawer({
  court,
  session,
  booking,
  upcomingBooking,
  onClose,
  onStart,
  onCheckIn,
}: SessionDrawerProps) {
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
    const count = fixedParticipants
      ? 4
      : Math.max(
          2,
          Math.min(
            maxParticipants,
            booking.participants?.length || booking.players.length || 2,
          ),
        );

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
      return;
    }

    setClosedTotal(String(session.total));
    setClosedPlayers(
      session.players.map((player) => ({
        ...player,
        extras: [...(player.extras ?? [])],
      })),
    );
    setPayOpen(false);
    setPayIds([]);
    setEditQuotas(false);
  }, [session?.id, session?.closed]);

  if (!court) return null;

  const player =
    session?.players.find((p) => p.id === selPlayer) ??
    session?.players[0] ??
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

  const payTotal = payIds.reduce(
    (sum, id) => sum + playerTotal(id),
    0,
  );

  const collected = session
    ? session.players
        .filter((p) => p.paid)
        .reduce((sum, p) => sum + p.quota, 0)
    : 0;

  const fixedBookingParticipants = court.type === "padel";
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
      bookingParticipants.length <= 2 ||
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

    const names = bookingParticipants.map((item) =>
      item.name.trim(),
    );

    if (names.some((name) => !name)) {
      toast.error("Inserisci il nome di tutti i partecipanti.");
      return;
    }

    const price = Number(bookingPrice.replace(",", "."));

    if (!Number.isFinite(price) || price < 0) {
      toast.error("Inserisci un prezzo totale valido.");
      return;
    }

    for (const item of bookingParticipants) {
      if (
        !Number.isFinite(item.quota) ||
        item.quota < 0
      ) {
        toast.error(`Controlla la quota di ${item.name || "un giocatore"}.`);
        return;
      }
    }

    const result = reservations.update(booking.id, {
      participants: bookingParticipants,
      players: names,
      price: Math.round(price * 100) / 100,
    });

    if (!result.ok) {
      toast.error(
        result.error ?? "Impossibile salvare la prenotazione.",
      );
      return;
    }

    toast.success("Prezzo, partecipanti e quote salvati.");
  };

  const updateClosedPlayer = (
    playerId: string,
    patch: Partial<Pick<Player, "name" | "quota">>,
  ) => {
    setClosedPlayers((current) =>
      current.map((item) =>
        item.id === playerId && !item.paid
          ? { ...item, ...patch }
          : item,
      ),
    );
  };

  const saveClosedSession = () => {
    if (!session?.closed) return;

    const total = Number(closedTotal.replace(",", "."));

    if (!Number.isFinite(total) || total < 0) {
      toast.error("Inserisci un prezzo totale valido.");
      return;
    }

    for (const item of closedPlayers) {
      if (item.paid) continue;

      if (!item.name.trim()) {
        toast.error("Inserisci il nome di tutti i giocatori non pagati.");
        return;
      }

      if (!Number.isFinite(item.quota) || item.quota < 0) {
        toast.error(`Controlla la quota di ${item.name || "un giocatore"}.`);
        return;
      }
    }

    const result = courtSessions.updateClosedDetails(session.id, {
      total: Math.round(total * 100) / 100,
      players: closedPlayers.map((item) => ({
        id: item.id,
        name: item.name.trim(),
        quota: item.quota,
      })),
    });

    if (!result.ok) {
      toast.error(result.error ?? "Impossibile salvare il resoconto.");
      return;
    }

    toast.success("Resoconto della partita aggiornato.");
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
              ? `Prenotazione attiva ${booking.start}–${booking.end} · ${booking.title}`
              : `Campo libero · ${eur(court.hourlyPrice)} / ora`
        }
                footer={
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
                      setMethod("carta");
                      setCash("0");
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
        }
      >
        {!session ? (
          <div className="space-y-4">
            {booking && (
              <>
                <Panel className="border-primary/40 bg-primary/5 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="label-caps text-primary">
                        Prenotazione in corso
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
                      onChange={(event) =>
                        setBookingPrice(event.target.value)
                      }
                    />
                  </Field>

                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="label-caps text-muted-foreground">
                        Giocatori e quote
                      </div>

                      {!fixedBookingParticipants &&
                        bookingParticipants.length <
                          bookingParticipantLimit && (
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
                              disabled={item.paid}
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

                            {!fixedBookingParticipants &&
                              bookingParticipants.length > 2 &&
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
                                disabled={item.paid}
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

                  <Btn
                    variant="primary"
                    className="w-full"
                    onClick={saveActiveBooking}
                  >
                    Salva prezzo, giocatori e quote
                  </Btn>
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
        ) : session.closed ? (
          <div className="space-y-5">
            <Panel className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="label-caps text-muted-foreground">
                    Resoconto partita
                  </div>
                  <div className="mt-1 text-sm font-semibold">
                    {new Date(session.startedAt).toLocaleDateString("it-IT")} ·{" "}
                    {fmtTime(session.startedAt)}
                  </div>
                </div>
                <Badge tone="success">CONCLUSA</Badge>
              </div>

              <Field label="Prezzo totale partita (€)">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={closedTotal}
                  onChange={(event) => setClosedTotal(event.target.value)}
                />
              </Field>

              <p className="text-xs text-muted-foreground">
                La modifica del prezzo totale aggiorna il resoconto, ma non
                cambia gli incassi già registrati.
              </p>
            </Panel>
                        <Panel className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="label-caps text-muted-foreground">
                  Giocatori e quote
                </div>
                <span className="text-xs text-muted-foreground">
                  {session.players.filter((item) => item.paid).length}/
                  {session.players.length} pagati
                </span>
              </div>

              {closedPlayers.map((item, index) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-border bg-surface-container p-3"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <span className="mono flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-highest text-xs">
                      {index + 1}
                    </span>

                    <div className="min-w-0 flex-1">
                      <Input
                        value={item.name}
                        disabled={item.paid}
                        placeholder={`Giocatore ${index + 1}`}
                        onChange={(event) =>
                          updateClosedPlayer(item.id, {
                            name: event.target.value,
                          })
                        }
                      />
                    </div>

                    {item.paid ? (
                      <Badge tone="success">PAGATO</Badge>
                    ) : (
                      <Badge tone="warning">DA PAGARE</Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pl-9">
                    <div className="w-32">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={String(item.quota)}
                        disabled={item.paid}
                        onChange={(event) =>
                          updateClosedPlayer(item.id, {
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
                    <div className="mt-3 space-y-1 rounded-lg border border-border bg-surface px-3 py-2">
                      <div className="label-caps text-muted-foreground">
                        Extra registrati
                      </div>

                      {item.extras.map((extra) => (
                        <div
                          key={extra.productId}
                          className="mono flex items-center justify-between text-[11px]"
                        >
                          <span>
                            {extra.qty}× {extra.name}
                          </span>
                          <span>{eur(extra.price * extra.qty)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              <p className="text-xs text-muted-foreground">
                I dati dei giocatori già pagati sono bloccati. Puoi correggere
                i nomi e le quote dei soli giocatori non pagati.
              </p>

              <Btn
                variant="primary"
                className="w-full"
                onClick={saveClosedSession}
              >
                Salva modifiche al resoconto
              </Btn>
            </Panel>

            <Panel className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <span className="label-caps text-muted-foreground">
                  Incasso storico quote
                </span>
                <span className="mono font-semibold">
                  {eur(collected)}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="label-caps text-muted-foreground">
                  Prezzo totale partita
                </span>
                <span className="mono font-semibold">
                  {eur(session.total)}
                </span>
              </div>

              <div className="text-xs text-muted-foreground">
                Gli incassi storici sono mostrati a titolo informativo e non
                vengono ricalcolati dalle modifiche del resoconto.
              </div>
            </Panel>

            <WhatsAppShare
              title="Invia riepilogo partita su WhatsApp"
              text={sessionSummary(
                {
                  ...session,
                  total: Number(closedTotal.replace(",", ".")) || session.total,
                  players: closedPlayers,
                },
                court.name,
              )}
            />
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

            <WhatsAppShare
              title="Invia riepilogo conto su WhatsApp"
              text={sessionSummary(session, court.name)}
            />

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
                          <div className="truncate text-sm font-semibold">
                            {p.name}
                          </div>
                          <div className="mono text-[11px] text-muted-foreground">
                            Quota: {eur(p.quota)} · Extra:{" "}
                            {eur(
                              p.extras.reduce(
                                (sum, e) => sum + e.price * e.qty,
                                0,
                              ),
                            )}
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
                          <span className="text-xs text-muted-foreground">
                            quota giocatore
                          </span>
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
                                      courtSessions.removeExtra(
                                        session.id,
                                        p.id,
                                        extra.productId,
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
                            onClick={(event) => {
                              event.stopPropagation();
                              setPayIds([p.id]);
                              setMethod("carta");
                              setCash("0");
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
                        Object.entries(quotaDraft).map(([key, value]) => [
                          key,
                          Number(value) || 0,
                        ]),
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
        open={payOpen && !!session && !session.closed}
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
              {payIds.length} giocator
              {payIds.length === 1 ? "e" : "i"}
            </span>
            <span className="text-xl font-bold">{eur(payTotal)}</span>
          </div>

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
