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
  const [editQuotas, setEditQuotas] = useState(false);
  const [quotaDraft, setQuotaDraft] = useState<Record<string, string>>({});

  // Dati modificabili della prenotazione prima del check-in.
  const [bookingParticipants, setBookingParticipants] = useState<Player[]>([]);
  const [bookingPrice, setBookingPrice] = useState("0");

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
          ) : (
            <div className="grid gap-2">
              {booking && booking.kind !== "manutenzione" && (
                <Btn
                  variant="primary"
                  className="w-full"
                  onClick={() => onCheckIn(booking)}
                >
                  <Users2 className="size-4" /> Check-in{" "}
                  {booking.start}–{booking.end} · {eur(booking.price)}
                </Btn>
              )}

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
