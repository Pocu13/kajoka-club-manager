import { useSyncExternalStore } from "react";
import { buildSeed, DEFAULT_SETTINGS } from "./seed";
import { expandRecurrence, overlaps, toMin } from "./bookings";
import type {
  Booking,
  RecurrenceRule,
  DB,
  Movement,
  MovementType,
  PaymentMethod,
  Player,
  Product,
  Session,
  Settings,
  Transaction,
  TxItem,
  User,
} from "./types";

const KEY = "kajoka.db.v1";

let state: DB | null = null;
const listeners = new Set<() => void>();

const emptyDB = (): DB => ({
  version: 2,
  users: [],
  products: [],
  courts: [],
  sessions: [],
  bookings: [],
  movements: [],
  transactions: [],
  settings: DEFAULT_SETTINGS,
  currentUserId: null,
});

/**
 * Prepara un database pulito preservando i dati da mantenere.
 * Prenotazioni, sessioni, movimenti e transazioni vengono svuotati.
 */
function createCleanDB(source?: DB): DB {
  const seed = buildSeed();

  const currentAdmin =
    source?.users?.find(
      (user) => user.id === source.currentUserId && user.role === "admin",
    ) ??
    source?.users?.find((user) => user.role === "admin") ??
    seed.users.find((user) => user.role === "admin")!;

  return {
    version: 2,
    users: [currentAdmin],
    products: Array.isArray(source?.products) ? source.products : seed.products,
    courts:
      Array.isArray(source?.courts) && source.courts.length > 0
        ? source.courts
        : seed.courts,
    sessions: [],
    bookings: [],
    movements: [],
    transactions: [],
    settings: source?.settings ?? seed.settings,
    currentUserId: null,
  };
}

function load(): DB {
  if (state) return state;
  if (typeof window === "undefined") return emptyDB();

  try {
    const raw = window.localStorage.getItem(KEY);

    if (raw) {
      const parsed = JSON.parse(raw) as DB;

      // Migrazione una tantum dal database precedente.
      if (!parsed.version || parsed.version < 2) {
        state = createCleanDB(parsed);
        persist();
        return state;
      }

      state = parsed;
      return state;
    }
  } catch {
    /* ignore corrupt storage */
  }

  // Prima installazione: inizializza prodotti, campi e admin,
  // senza dati dimostrativi di attività.
  state = createCleanDB();
  persist();
  return state;
}

function persist() {
  if (typeof window === "undefined" || !state) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* quota */
  }
}

function set(mutator: (db: DB) => void) {
  const db = load();
  const next: DB = { ...db };
  mutator(next);
  state = next;
  persist();
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const serverSnapshot = emptyDB();

export function useDB(): DB {
  return useSyncExternalStore(
    subscribe,
    () => load(),
    () => serverSnapshot,
  );
}

export function useCurrentUser(): User | null {
  const db = useDB();
  return db.users.find((u) => u.id === db.currentUserId) ?? null;
}

export const getDB = load;

const nid = (p: string) =>
  `${p}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

const round = (n: number) => Math.round(n * 100) / 100;

function currentOperator(db: DB): { id: string; name: string } {
  const u = db.users.find((x) => x.id === db.currentUserId);
  return { id: u?.id ?? "system", name: u?.name ?? "Sistema" };
}

function nextTxId(db: DB, kind: "bar" | "campo") {
  const prefix = kind === "bar" ? "#V-" : "#P-";
  const nums = db.transactions
    .filter((t) => t.id.startsWith(prefix))
    .map((t) => Number(t.id.replace(prefix, "")) || 0);
  const n = (nums.length ? Math.max(...nums) : 0) + 1;
  return prefix + String(n).padStart(5, "0");
}

/**
 * Crea i dati iniziali dei partecipanti quando una prenotazione
 * non ha ancora una lista operativa salvata.
 */

/**
 * Crea i dati iniziali dei partecipanti in base allo sport.
 * Padel: 4 partecipanti obbligatori.
 * Tennis: da 2 a 4 partecipanti.
 * Beach: da 2 a 12 partecipanti.
 */
function createBookingParticipants(booking: Booking, total: number): Player[] {
  const court = load().courts.find((c) => c.id === booking.courtId);

  const minCount = court?.type === "padel" ? 4 : 2;
  const maxCount =
    court?.type === "beach"
      ? 12
      : court?.type === "tennis"
        ? 4
        : 4;

  const names = (booking.players ?? [])
    .map((name) => name.trim())
    .filter(Boolean)
    .slice(0, maxCount);

  const count = Math.min(
    maxCount,
    Math.max(minCount, names.length),
  );

  const baseQuota = round(total / count);
  let assigned = 0;

  return Array.from({ length: count }, (_, index) => {
    const quota =
      index === count - 1
        ? round(total - assigned)
        : baseQuota;

    assigned = round(assigned + quota);

    return {
      id: `g${index + 1}`,
      name: names[index] || `Giocatore ${index + 1}`,
      quota,
      paid: false,
      extras: [],
    };
  });
}


/* ---------------------------------- auth --------------------------------- */

export const auth = {
  login(username: string, password: string): { ok: boolean; error?: string } {
    const db = load();
    const user = db.users.find(
      (u) => u.username.toLowerCase() === username.trim().toLowerCase(),
    );
    if (!user) return { ok: false, error: "Utente non trovato" };
    if (!user.active) return { ok: false, error: "Account disattivato" };
    if (!user.passwordSet) return { ok: false, error: "Password non impostata" };
    if (user.password !== password) return { ok: false, error: "Password errata" };
    set((d) => {
      d.currentUserId = user.id;
      d.users = d.users.map((u) =>
        u.id === user.id ? { ...u, lastAccess: new Date().toISOString() } : u,
      );
    });
    return { ok: true };
  },
  logout() {
    set((d) => {
      d.currentUserId = null;
    });
  },
};

/* --------------------------------- stock --------------------------------- */

function pushMovement(
  d: DB,
  product: Product,
  type: MovementType,
  qty: number,
  origin: string,
  ref: string,
  note: string,
) {
  const before = product.stock;
  const after = round(before + qty);
  const op = currentOperator(d);
  const mv: Movement = {
    id: nid("m"),
    ts: new Date().toISOString(),
    productId: product.id,
    productName: product.name,
    sku: product.sku,
    type,
    qty,
    before,
    after,
    origin,
    ref,
    operatorId: op.id,
    operatorName: op.name,
    note,
    cancelled: false,
  };
  d.movements = [mv, ...d.movements];
  d.products = d.products.map((p) => (p.id === product.id ? { ...p, stock: after } : p));
  return mv;
}

export const stock = {
  move(input: {
    productId: string;
    type: MovementType;
    qty: number;
    origin?: string;
    ref?: string;
    note?: string;
  }) {
    set((d) => {
      const p = d.products.find((x) => x.id === input.productId);
      if (!p) return;
      pushMovement(
        d,
        p,
        input.type,
        input.qty,
        input.origin ?? "Magazzino",
        input.ref ?? "—",
        input.note ?? "",
      );
    });
  },
  adjust(productId: string, newQty: number, note: string) {
    set((d) => {
      const p = d.products.find((x) => x.id === productId);
      if (!p) return;
      pushMovement(d, p, "rettifica", round(newQty - p.stock), "Magazzino · Rettifica", "—", note);
    });
  },
  cancelMovement(id: string) {
    set((d) => {
      const mv = d.movements.find((m) => m.id === id);
      if (!mv || mv.cancelled) return;
      const p = d.products.find((x) => x.id === mv.productId);
      d.movements = d.movements.map((m) => (m.id === id ? { ...m, cancelled: true } : m));
      if (p) {
        pushMovement(
          d,
          p,
          "storno",
          -mv.qty,
          "Sistema · Storno",
          mv.ref,
          `Movimento inverso automatico per annullamento ${mv.id}.`,
        );
      }
    });
  },
};
/* -------------------------------- products -------------------------------- */

export const catalog = {
  create(p: Omit<Product, "id">) {
    set((d) => {
      d.products = [{ ...p, id: nid("p") }, ...d.products];
    });
  },
  update(id: string, patch: Partial<Product>) {
    set((d) => {
      d.products = d.products.map((p) => (p.id === id ? { ...p, ...patch } : p));
    });
  },
  remove(id: string) {
    set((d) => {
      d.products = d.products.filter((p) => p.id !== id);
    });
  },
};

/* ------------------------------ transactions ------------------------------ */

export const sales = {
  record(input: {
    items: TxItem[];
    discount: number;
    method: PaymentMethod;
    cash: number;
    card: number;
    kind?: "bar" | "campo";
    label?: string;
    courtId?: string;
    sessionId?: string;
    bookingId?: string;
    playerName?: string;
    note?: string;
    decrementStock?: boolean;
  }): string {
    let id = "";

    set((d) => {
      const kind = input.kind ?? "bar";
      const isGift = input.method === "omaggio";

      const subtotal = round(
        input.items.reduce((s, i) => s + i.price * i.qty, 0),
      );

      const discount = isGift ? subtotal : input.discount;
      const amount = isGift ? 0 : round(subtotal - discount);
      const op = currentOperator(d);

      id = nextTxId(d, kind);

      const tx: Transaction = {
        id,
        ts: new Date().toISOString(),
        kind,
        label: input.label ?? "Vendita POS",
        items: input.items,
        subtotal,
        discount,
        amount,
        method: input.method,
        cash: isGift ? 0 : input.cash,
        card: isGift ? 0 : input.card,
        operatorId: op.id,
        operatorName: op.name,
        courtId: input.courtId,
        sessionId: input.sessionId,
        bookingId: input.bookingId,
        playerName: input.playerName,
        note: isGift
          ? [input.note, "Operazione omaggio: nessun incasso registrato."]
              .filter(Boolean)
              .join(" ")
          : input.note ?? "",
        cancelled: false,
      };

      d.transactions = [tx, ...d.transactions];

      if (input.decrementStock !== false) {
        for (const it of input.items) {
          const p = d.products.find((x) => x.id === it.productId);

          if (p) {
            pushMovement(
              d,
              p,
              kind === "bar" ? "vendita_pos" : "prodotto_campo",
              -it.qty,
              isGift
                ? "Cassa POS · Omaggio"
                : kind === "bar"
                  ? "Cassa POS (Bar Centrale)"
                  : "Campo · Extra giocatore",
              id,
              isGift
                ? "Scarico automatico per omaggio; nessun incasso registrato."
                : "Scarico automatico da vendita.",
            );
          }
        }
      }
    });

    return id;
  },

  cancel(id: string, restoreStock: boolean, reason: string) {
    set((d) => {
      const tx = d.transactions.find((t) => t.id === id);
      if (!tx || tx.cancelled) return;
      d.transactions = d.transactions.map((t) =>
        t.id === id
          ? { ...t, cancelled: true, cancelledAt: new Date().toISOString(), cancelReason: reason }
          : t,
      );
      if (restoreStock) {
        for (const it of tx.items) {
          const p = d.products.find((x) => x.id === it.productId);
          if (p) {
            pushMovement(
              d,
              p,
              "storno",
              it.qty,
              "Sistema · Annullamento vendita",
              id,
              `Ripristino scorte da annullamento ${id}.`,
            );
          }
        }
      }
    });
  },
};

/* -------------------------------- sessions -------------------------------- */
export const courtSessions = {
  /**
   * Avvia la sessione dalla prenotazione.
   * Mantiene partecipanti, quote, extra e pagamenti già registrati.
   * Le transazioni anticipate vengono collegate anche alla sessione.
   */
  checkIn(booking: Booking) {
    const d0 = getDB();

    const existingSession = d0.sessions.find(
      (x) => !x.closed && x.courtId === booking.courtId && x.bookingId === booking.id,
    );

    if (existingSession) return existingSession.id;

    if (d0.sessions.some((x) => !x.closed && x.courtId === booking.courtId)) {
      throw new Error("Il campo ha già una sessione attiva");
    }

    const court = d0.courts.find((c) => c.id === booking.courtId);
    const minutes = Math.max(30, toMin(booking.end) - toMin(booking.start));
    const total =
      booking.price > 0
        ? booking.price
        : round((court?.hourlyPrice ?? 0) * (minutes / 60));

    const participants =
      booking.participants?.length
        ? booking.participants.map((p) => ({
            ...p,
            extras: [...(p.extras ?? [])],
          }))
        : createBookingParticipants(booking, total);

    const sessionId = nid("s");

    const session: Session = {
      id: sessionId,
      courtId: booking.courtId,
     startedAt: new Date(`${booking.date}T${booking.start}:00`).toISOString(),
      durationMin: minutes,
      pricingMode: "giocatore",
      total,
      players: participants,
      closed: false,
      bookingId: booking.id,
    };

    set((d) => {
      // Evita di creare due sessioni per la stessa prenotazione.
      const alreadyStarted = d.sessions.some(
        (x) => !x.closed && x.courtId === booking.courtId,
      );

      if (alreadyStarted) return;

      d.sessions = [...d.sessions, session];

      // Le transazioni anticipate restano nella contabilità originale,
      // ma da questo momento sono collegate anche alla sessione.
      d.transactions = d.transactions.map((tx) =>
        tx.bookingId === booking.id && !tx.cancelled
          ? { ...tx, sessionId }
          : tx,
      );

      // Salva i partecipanti inizializzati anche nella prenotazione.
      d.bookings = d.bookings.map((b) =>
        b.id === booking.id
          ? {
              ...b,
              participants,
              players: participants.map((p) => p.name),
            }
          : b,
      );
    });

    const fresh = getDB().sessions.find(
      (x) => !x.closed && x.bookingId === booking.id,
    );

    if (!fresh) {
      throw new Error("Impossibile avviare la sessione: il campo risulta già occupato");
    }

    return fresh.id;
  },

  start(input: {
    courtId: string;
    pricingMode: "campo" | "giocatore";
    total: number;
    durationMin: number;
    playerNames: string[];
    bookingId?: string;
    players?: Player[];
  }) {
    let sessionId = "";

    set((d) => {
      const players: Player[] =
        input.players?.length
          ? input.players.map((p) => ({
              ...p,
              extras: [...(p.extras ?? [])],
            }))
          : input.playerNames.map((n, i) => ({
              id: `g${i + 1}`,
              name: n.trim() || `Giocatore ${i + 1}`,
              quota: round(input.total / Math.max(1, input.playerNames.length)),
              paid: false,
              extras: [],
            }));

      const s: Session = {
        id: nid("s"),
        courtId: input.courtId,
        startedAt: new Date().toISOString(),
        durationMin: input.durationMin,
        pricingMode: input.pricingMode,
        total: input.total,
        players,
        closed: false,
        ...(input.bookingId ? { bookingId: input.bookingId } : {}),
      };

      sessionId = s.id;
      d.sessions = [...d.sessions, s];
    });

    return sessionId;
  },

  updateQuotas(sessionId: string, quotas: Record<string, number>) {
    set((d) => {
      d.sessions = d.sessions.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              players: s.players.map((p) => ({ ...p, quota: quotas[p.id] ?? p.quota })),
              total: round(
                s.players.reduce((sum, p) => sum + (quotas[p.id] ?? p.quota), 0),
              ),
            }
          : s,
      );
    });
  },
    addExtra(sessionId: string, playerId: string, productId: string) {
    set((d) => {
      const p = d.products.find((x) => x.id === productId);
      if (!p) return;

      d.sessions = d.sessions.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              players: s.players.map((pl) => {
                if (pl.id !== playerId) return pl;
                const existing = pl.extras.find((e) => e.productId === productId);
                return {
                  ...pl,
                  extras: existing
                    ? pl.extras.map((e) =>
                        e.productId === productId ? { ...e, qty: e.qty + 1 } : e,
                      )
                    : [
                        ...pl.extras,
                        { productId: p.id, name: p.name, qty: 1, price: p.price, cost: p.cost },
                      ],
                };
              }),
            }
          : s,
      );

      const fresh = d.products.find((x) => x.id === productId)!;
      pushMovement(
        d,
        fresh,
        "prodotto_campo",
        -1,
        "Campo · Extra giocatore",
        sessionId,
        "Consumo addebitato al giocatore in campo.",
      );
    });
  },

  removeExtra(sessionId: string, playerId: string, productId: string) {
    set((d) => {
      d.sessions = d.sessions.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              players: s.players.map((pl) =>
                pl.id === playerId
                  ? { ...pl, extras: pl.extras.filter((e) => e.productId !== productId) }
                  : pl,
              ),
            }
          : s,
      );
    });
  },

   /**
   * Inizializza i partecipanti direttamente nella prenotazione.
   * Non crea sessioni e non occupa il campo.
   */
  ensureBookingParticipants(bookingId: string): Player[] {
    const db = getDB();
    const booking = db.bookings.find((item) => item.id === bookingId);

    if (!booking) return [];

    if (booking.participants?.length) {
      return booking.participants;
    }

    const court = db.courts.find((item) => item.id === booking.courtId);
    const minutes = Math.max(30, toMin(booking.end) - toMin(booking.start));
    const total =
      booking.price > 0
        ? booking.price
        : round((court?.hourlyPrice ?? 0) * (minutes / 60));

    const participants = createBookingParticipants(booking, total);

    set((d) => {
      d.bookings = d.bookings.map((item) =>
        item.id === bookingId && !item.participants?.length
          ? {
              ...item,
              participants,
              players: participants.map((player) => player.name),
            }
          : item,
      );
    });

    return (
      getDB().bookings.find((item) => item.id === bookingId)?.participants ??
      participants
    );
  }, 
  /**
   * Gestione operativa anticipata direttamente sulla prenotazione.
   * Non crea sessioni e non occupa il campo.
   */
  updateBookingQuotas(bookingId: string, quotas: Record<string, number>) {
    set((d) => {
      d.bookings = d.bookings.map((booking) => {
        if (booking.id !== bookingId) return booking;

        const participants = (booking.participants ?? []).map((player) => ({
          ...player,
          quota: player.paid ? player.quota : Math.max(0, quotas[player.id] ?? player.quota),
        }));

        return {
          ...booking,
          participants,
          price: round(participants.reduce((sum, player) => sum + player.quota, 0)),
        };
      });
    });
  },

  addBookingExtra(bookingId: string, playerId: string, productId: string) {
    const db = getDB();
    const product = db.products.find((item) => item.id === productId);

    if (!product || !product.active) {
      return { ok: false, error: "Prodotto non disponibile." };
    }

    if (product.stock <= 0) {
      return { ok: false, error: "Prodotto esaurito." };
    }

    const booking = db.bookings.find((item) => item.id === bookingId);
    if (!booking) return { ok: false, error: "Prenotazione non trovata." };

    const participant = (booking.participants ?? []).find(
      (item) => item.id === playerId,
    );

    if (!participant || participant.paid) {
      return { ok: false, error: "Giocatore non disponibile." };
    }

    set((d) => {
      const currentProduct = d.products.find((item) => item.id === productId);
      if (!currentProduct || currentProduct.stock <= 0) return;

      d.bookings = d.bookings.map((item) =>
        item.id !== bookingId
          ? item
          : {
              ...item,
              participants: (item.participants ?? []).map((player) => {
                if (player.id !== playerId) return player;

                const existing = player.extras.find(
                  (extra) => extra.productId === productId,
                );

                return {
                  ...player,
                  extras: existing
                    ? player.extras.map((extra) =>
                        extra.productId === productId
                          ? { ...extra, qty: extra.qty + 1 }
                          : extra,
                      )
                    : [
                        ...player.extras,
                        {
                          productId: currentProduct.id,
                          name: currentProduct.name,
                          qty: 1,
                          price: currentProduct.price,
                          cost: currentProduct.cost,
                        },
                      ],
                };
              }),
            },
      );

      pushMovement(
        d,
        currentProduct,
        "prodotto_campo",
        -1,
        "Prenotazione · Extra giocatore",
        bookingId,
        "Extra assegnato prima dell'inizio della partita.",
      );
    });

    return { ok: true };
  },

  removeBookingExtra(bookingId: string, playerId: string, productId: string) {
    set((d) => {
      d.bookings = d.bookings.map((booking) =>
        booking.id !== bookingId
          ? booking
          : {
              ...booking,
              participants: (booking.participants ?? []).map((player) =>
                player.id !== playerId
                  ? player
                  : {
                      ...player,
                      extras: player.extras.filter(
                        (extra) => extra.productId !== productId,
                      ),
                    },
              ),
            },
      );
    });
  },

  /**
   * Registra un pagamento anticipato direttamente sulla prenotazione.
   * La quota non incassata viene redistribuita solo tra gli altri
   * partecipanti ancora da pagare. Gli extra vengono sempre saldati
   * per intero.
   */
  payBookingPlayers(
    bookingId: string,
    playerIds: string[],
    method: PaymentMethod,
    cash: number,
    card: number,
    quotaAmount?: number,
  ): { ok: boolean; error?: string } {
    const db = getDB();
    const booking = db.bookings.find((item) => item.id === bookingId);

    if (!booking) {
      return { ok: false, error: "Prenotazione non trovata." };
    }

    const participants = booking.participants ?? [];
    const targets = participants.filter(
      (player) => playerIds.includes(player.id) && !player.paid,
    );

    if (!targets.length) {
      return { ok: false, error: "I partecipanti selezionati hanno già saldato." };
    }

    const quotaTotal = round(
      targets.reduce((sum, player) => sum + player.quota, 0),
    );

    const requestedQuota =
      targets.length === 1 && Number.isFinite(quotaAmount)
        ? Math.max(0, Math.min(quotaTotal, round(quotaAmount!)))
        : quotaTotal;

    const unpaidOthers = participants.filter(
      (player) => !player.paid && !playerIds.includes(player.id),
    );

    const difference = round(quotaTotal - requestedQuota);

    if (difference > 0 && unpaidOthers.length === 0) {
      return {
        ok: false,
        error: "Non ci sono altri giocatori non pagati a cui redistribuire la differenza.",
      };
    }

    const items: TxItem[] = targets.flatMap((player) =>
      player.extras.map((extra) => ({
        productId: extra.productId,
        name: extra.name,
        qty: extra.qty,
        price: extra.price,
        cost: extra.cost,
      })),
    );

    const extraTotal = round(
      items.reduce((sum, item) => sum + item.price * item.qty, 0),
    );
    const amount = round(requestedQuota + extraTotal);

    if (amount <= 0) {
      return { ok: false, error: "L'importo da pagare deve essere maggiore di zero." };
    }

    if (
      method === "misto" &&
      (cash < 0 || card < 0 || round(cash + card) !== amount)
    ) {
      return {
        ok: false,
        error: "La somma di contanti e carta deve corrispondere al totale da pagare.",
      };
    }

    const court = db.courts.find((item) => item.id === booking.courtId);

    set((d) => {
      const currentBooking = d.bookings.find((item) => item.id === bookingId);
      if (!currentBooking) return;

      const currentParticipants = currentBooking.participants ?? [];
      const currentTargets = currentParticipants.filter(
        (player) => playerIds.includes(player.id) && !player.paid,
      );

      if (!currentTargets.length) return;

      const currentItems: TxItem[] = currentTargets.flatMap((player) =>
        player.extras.map((extra) => ({
          productId: extra.productId,
          name: extra.name,
          qty: extra.qty,
          price: extra.price,
          cost: extra.cost,
        })),
      );

      const currentQuota = round(
        currentTargets.reduce((sum, player) => sum + player.quota, 0),
      );
      const currentExtras = round(
        currentItems.reduce((sum, item) => sum + item.price * item.qty, 0),
      );
      const currentRequestedQuota =
        currentTargets.length === 1 && Number.isFinite(quotaAmount)
          ? Math.max(0, Math.min(currentQuota, round(quotaAmount!)))
          : currentQuota;
      const currentAmount = round(currentRequestedQuota + currentExtras);

      if (currentAmount <= 0) return;

      const currentUnpaidOthers = currentParticipants.filter(
        (player) => !player.paid && !playerIds.includes(player.id),
      );
      const currentDifference = round(currentQuota - currentRequestedQuota);

      if (currentDifference > 0 && !currentUnpaidOthers.length) return;

      const op = currentOperator(d);
      const id = nextTxId(d, "campo");

      const tx: Transaction = {
        id,
        ts: new Date().toISOString(),
        kind: "campo",
        label: `${court?.name ?? "Campo"} · ${currentTargets.map((player) => player.name).join(", ")}`,
        items: currentItems,
        subtotal: currentAmount,
        discount: 0,
        amount: currentAmount,
        method,
        cash: method === "misto" ? cash : method === "contanti" ? currentAmount : 0,
        card: method === "misto" ? card : method === "carta" ? currentAmount : 0,
        operatorId: op.id,
        operatorName: op.name,
        courtId: currentBooking.courtId,
        bookingId,
        playerName: currentTargets.map((player) => player.name).join(", "),
        note: "Pagamento anticipato quota campo ed extra.",
        cancelled: false,
      };

      d.transactions = [tx, ...d.transactions];

      const totalCents = Math.round(currentDifference * 100);
      const shareCents = currentUnpaidOthers.length
        ? Math.floor(totalCents / currentUnpaidOthers.length)
        : 0;
      let extraCents = currentUnpaidOthers.length
        ? totalCents % currentUnpaidOthers.length
        : 0;

      d.bookings = d.bookings.map((item) =>
        item.id !== bookingId
          ? item
          : {
              ...item,
              participants: currentParticipants.map((player) => {
                if (playerIds.includes(player.id) && !player.paid) {
                  return {
                    ...player,
                    quota:
                      currentTargets.length === 1
                        ? currentRequestedQuota
                        : player.quota,
                    paid: true,
                  };
                }

                if (
                  currentDifference > 0 &&
                  currentUnpaidOthers.some((other) => other.id === player.id)
                ) {
                  const additionCents =
                    shareCents + (extraCents > 0 ? 1 : 0);

                  if (extraCents > 0) extraCents -= 1;

                  return {
                    ...player,
                    quota: round(player.quota + additionCents / 100),
                  };
                }

                return player;
              }),
            },
      );
    });

    return { ok: true };
  },

   
  payPlayers(
    sessionId: string,
    playerIds: string[],
    method: PaymentMethod,
    cash: number,
    card: number,
    quotaAmount?: number,
  ) {
    set((d) => {
      const session = d.sessions.find((item) => item.id === sessionId);
      if (!session) return;

      const court = d.courts.find((item) => item.id === session.courtId);
      const targets = session.players.filter(
        (player) => playerIds.includes(player.id) && !player.paid,
      );
      if (!targets.length) return;

      const currentQuotaTotal = round(
        targets.reduce((sum, player) => sum + player.quota, 0),
      );

      // L'importo personalizzato è previsto per il saldo di un singolo giocatore.
      // Gli incassi cumulativi mantengono le quote complete selezionate.
      const requestedQuota =
        targets.length === 1 && Number.isFinite(quotaAmount)
          ? Math.max(0, Math.min(currentQuotaTotal, round(quotaAmount!)))
          : currentQuotaTotal;

      const unpaidOthers = session.players.filter(
        (player) => !player.paid && !playerIds.includes(player.id),
      );

      const difference = round(currentQuotaTotal - requestedQuota);

      // Non consentire un pagamento parziale se non ci sono altri giocatori
      // non saldati a cui redistribuire la differenza.
      if (difference > 0 && unpaidOthers.length === 0) return;

      const items: TxItem[] = targets.flatMap((player) =>
        player.extras.map((extra) => ({
          productId: extra.productId,
          name: extra.name,
          qty: extra.qty,
          price: extra.price,
          cost: extra.cost,
        })),
      );

      const extraTotal = round(
        items.reduce((sum, item) => sum + item.price * item.qty, 0),
      );
      const amount = round(requestedQuota + extraTotal);
      const op = currentOperator(d);
      const id = nextTxId(d, "campo");

      d.transactions = [
        {
          id,
          ts: new Date().toISOString(),
          kind: "campo",
          label: `${court?.name ?? "Campo"} · ${targets.map((target) => target.name).join(", ")}`,
          items,
          subtotal: amount,
          discount: 0,
          amount,
          method,
          cash: method === "misto" ? cash : method === "contanti" ? amount : 0,
          card: method === "misto" ? card : method === "carta" ? amount : 0,
          operatorId: op.id,
          operatorName: op.name,
          courtId: session.courtId,
          sessionId: session.id,
          bookingId: session.bookingId,
          playerName: targets.map((target) => target.name).join(", "),
          note: "Saldo quota campo ed extra. La quota campo può essere redistribuita tra i giocatori non ancora saldati.",
          cancelled: false,
        },
        ...d.transactions,
      ];

      d.sessions = d.sessions.map((item) => {
        if (item.id !== sessionId) return item;

        const totalCents = Math.round(difference * 100);
        const shareCents =
          unpaidOthers.length > 0
            ? Math.floor(totalCents / unpaidOthers.length)
            : 0;
        let extraCents =
          unpaidOthers.length > 0
            ? totalCents % unpaidOthers.length
            : 0;

        return {
          ...item,
          players: item.players.map((player) => {
            if (playerIds.includes(player.id) && !player.paid) {
              return {
                ...player,
                quota: targets.length === 1 ? requestedQuota : player.quota,
                paid: true,
              };
            }

            if (
              difference > 0 &&
              !player.paid &&
              unpaidOthers.some((other) => other.id === player.id)
            ) {
              const additionCents =
                shareCents + (extraCents > 0 ? 1 : 0);

              if (extraCents > 0) extraCents -= 1;

              return {
                ...player,
                quota: round(player.quota + additionCents / 100),
              };
            }

            return player;
          }),
        };
      });
    });
  },

  close(sessionId: string) {
    set((d) => {
      d.sessions = d.sessions.map((session) =>
        session.id === sessionId
          ? { ...session, closed: true }
          : session,
      );
    });
  },
  deactivateBooking(bookingId: string): { ok: boolean; error?: string } {
    const db = getDB();
    const session = db.sessions.find(
      (item) => item.bookingId === bookingId && !item.closed,
    );

    if (!session) {
      return {
        ok: false,
        error: "Nessuna sessione attiva collegata alla prenotazione.",
      };
    }

    set((d) => {
      const currentSession = d.sessions.find(
        (item) => item.id === session.id,
      );

      if (!currentSession) return;

      const participants = currentSession.players.map((player) => ({
        ...player,
        extras: [...(player.extras ?? [])],
      }));

      d.bookings = d.bookings.map((booking) =>
        booking.id === bookingId
          ? {
              ...booking,
              participants,
              players: participants.map((player) => player.name),
            }
          : booking,
      );

      d.transactions = d.transactions.map((transaction) =>
        transaction.sessionId === currentSession.id
          ? {
              ...transaction,
              sessionId: undefined,
              bookingId,
            }
          : transaction,
      );

      d.sessions = d.sessions.filter(
        (item) => item.id !== currentSession.id,
      );
    });

    return { ok: true };
  },
  /**
   * Modifica esclusivamente i dettagli di una sessione conclusa.
   * Le quote e i nomi dei giocatori pagati restano invariati.
   * Le transazioni e i movimenti contabili non vengono toccati.
   */
  updateClosedDetails(
    sessionId: string,
    input: {
      total: number;
      players: Array<{
        id: string;
        name: string;
        quota: number;
      }>;
    },
  ): { ok: boolean; error?: string } {
    const db = getDB();
    const session = db.sessions.find((item) => item.id === sessionId);

    if (!session) {
      return { ok: false, error: "Partita non trovata." };
    }

    if (!session.closed) {
      return {
        ok: false,
        error: "Puoi modificare da qui soltanto una partita conclusa.",
      };
    }

    if (!Number.isFinite(input.total) || input.total < 0) {
      return { ok: false, error: "Il prezzo totale non è valido." };
    }

    if (!Array.isArray(input.players)) {
      return { ok: false, error: "Elenco giocatori non valido." };
    }

    const submittedIds = new Set<string>();

    for (const item of input.players) {
      if (!item || typeof item.id !== "string" || !item.id) {
        return { ok: false, error: "Un giocatore non è valido." };
      }

      if (submittedIds.has(item.id)) {
        return { ok: false, error: "Un giocatore è presente più di una volta." };
      }

      submittedIds.add(item.id);

      const existingPlayer = session.players.find(
        (player) => player.id === item.id,
      );

      if (!existingPlayer) {
        return { ok: false, error: "Uno dei giocatori non appartiene a questa partita." };
      }

      if (existingPlayer.paid) {
        continue;
      }

      if (typeof item.name !== "string") {
        return { ok: false, error: "Il nome di un giocatore non è valido." };
      }

      if (!Number.isFinite(item.quota) || item.quota < 0) {
        return { ok: false, error: "Una delle quote non è valida." };
      }
    }

    set((d) => {
      d.sessions = d.sessions.map((current) => {
        if (current.id !== sessionId || !current.closed) {
          return current;
        }

        return {
          ...current,
          total: round(input.total),
          players: current.players.map((player) => {
            if (player.paid) {
              return player;
            }

            const updated = input.players.find(
              (item) => item.id === player.id,
            );

            if (!updated) {
              return player;
            }

            return {
              ...player,
              name: updated.name,
              quota: round(updated.quota),
            };
          }),
        };
      });
    });

    return { ok: true };
  },
};
/* ---------------------------------- users --------------------------------- */

export const staff = {
  create(u: Omit<User, "id">) {
    set((d) => {
      d.users = [...d.users, { ...u, id: nid("u") }];
    });
  },
  update(id: string, patch: Partial<User>) {
    set((d) => {
      d.users = d.users.map((u) => (u.id === id ? { ...u, ...patch } : u));
    });
  },
  remove(id: string) {
    set((d) => {
      d.users = d.users.filter((u) => u.id !== id);
    });
  },
  resetPassword(id: string, password: string) {
    set((d) => {
      d.users = d.users.map((u) =>
        u.id === id ? { ...u, password, passwordSet: password.length > 0 } : u,
      );
    });
  },
};

/* -------------------------------- settings -------------------------------- */

export const config = {
  save(patch: Partial<Settings>) {
    set((d) => {
      d.settings = { ...d.settings, ...patch };
    });
  },
  saveCourts(courts: DB["courts"]) {
    set((d) => {
      d.courts = courts;
    });
  },
  exportJSON(): string {
    return JSON.stringify(load(), null, 2);
  },
  importJSON(raw: string): boolean {
    try {
      const parsed = JSON.parse(raw) as DB;
      if (!parsed.products || !parsed.users) return false;
      set((d) => {
        Object.assign(d, parsed);
      });
      return true;
    } catch {
      return false;
    }
  },
  reset() {
    const cleanDB = createCleanDB();
    set((d) => {
      Object.assign(d, cleanDB);
    });
  },
};

export type StockState = "ok" | "sottoscorta" | "esaurito";

export function stockState(p: Product): StockState {
  if (p.stock <= 0) return "esaurito";
  if (p.stock <= p.minStock) return "sottoscorta";
  return "ok";
}

/* ------------------------------ prenotazioni ------------------------------ */

export type BookingDraft = Omit<Booking, "id" | "createdAt" | "createdBy" | "cancelled">;

function courtIsFree(db: DB, draft: BookingDraft, ignoreId?: string) {
  const s = toMin(draft.start);
  const e = toMin(draft.end);
  return !db.bookings.some(
    (b) =>
      !b.cancelled &&
      b.id !== ignoreId &&
      b.courtId === draft.courtId &&
      b.date === draft.date &&
      overlaps(s, e, toMin(b.start), toMin(b.end)),
  );
}

export const reservations = {
  isFree(draft: BookingDraft, ignoreId?: string) {
    return courtIsFree(load(), draft, ignoreId);
  },
  create(draft: BookingDraft): { ok: boolean; error?: string; id?: string } {
    const db = load();
    if (toMin(draft.end) <= toMin(draft.start))
      return { ok: false, error: "L'orario di fine deve seguire quello di inizio" };
    if (!courtIsFree(db, draft))
      return { ok: false, error: "Lo slot è già occupato su questo campo" };

    const id = nid("b");
    set((d) => {
      const op = currentOperator(d);
      d.bookings = [
        ...d.bookings,
        {
          ...draft,
          id,
          createdAt: new Date().toISOString(),
          createdBy: op.name,
          cancelled: false,
        },
      ];
    });
    return { ok: true, id };
  },
  update(id: string, patch: Partial<Booking>): { ok: boolean; error?: string } {
    const db = load();
    const existing = db.bookings.find((b) => b.id === id);
    if (!existing) return { ok: false, error: "Prenotazione non trovata" };
    const next = { ...existing, ...patch };
    if (!courtIsFree(db, next, id))
      return { ok: false, error: "Lo slot è già occupato su questo campo" };
    set((d) => {
      d.bookings = d.bookings.map((b) => (b.id === id ? next : b));
    });
    return { ok: true };
  },
  cancel(id: string) {
    set((d) => {
      d.bookings = d.bookings.map((b) => (b.id === id ? { ...b, cancelled: true } : b));
    });
  },
  remove(id: string) {
    set((d) => {
      d.bookings = d.bookings.filter((b) => b.id !== id);
    });
  },
};
/* --------------------------- serie ricorrenti --------------------------- */

export type SeriesScope = "this" | "future" | "all";

export interface OccurrencePreview {
  date: string;
  conflict: Booking | null;
}

function findConflict(
  db: DB,
  d: { courtId: string; date: string; start: string; end: string },
  ignore: Set<string>,
) {
  const s = toMin(d.start);
  const e = toMin(d.end);
  return (
    db.bookings.find(
      (b) =>
        !b.cancelled &&
        !ignore.has(b.id) &&
        b.courtId === d.courtId &&
        b.date === d.date &&
        overlaps(s, e, toMin(b.start), toMin(b.end)),
    ) ?? null
  );
}

function scopeMembers(
  db: DB,
  seriesId: string,
  scope: SeriesScope,
  fromDate: string,
  id?: string,
) {
  return db.bookings.filter(
    (b) =>
      b.seriesId === seriesId &&
      !b.cancelled &&
      (scope === "all" || (scope === "future" ? b.date >= fromDate : b.id === id)),
  );
}

export const series = {
  preview(draft: BookingDraft, rule: RecurrenceRule): OccurrencePreview[] {
    const db = load();
    return expandRecurrence(draft.date, rule).map((date) => ({
      date,
      conflict: findConflict(db, { ...draft, date }, new Set()),
    }));
  },

  /** Crea tutti i blocchi in modo atomico. Con skipConflicts le date occupate vengono aggiunte alle eccezioni. */
  create(
    draft: BookingDraft,
    rule: RecurrenceRule,
    skipConflicts: boolean,
  ): { ok: boolean; error?: string; created?: number; skipped?: string[] } {
    if (toMin(draft.end) <= toMin(draft.start))
      return { ok: false, error: "L'orario di fine deve seguire quello di inizio" };
    if (rule.until < draft.date)
      return { ok: false, error: "La data di fine precede quella di inizio" };

    const prev = series.preview(draft, rule);
    if (!prev.length)
      return { ok: false, error: "Nessuna data generata dalla regola" };

    const conflicts = prev.filter((p) => p.conflict);
    if (conflicts.length && !skipConflicts)
      return {
        ok: false,
        error: `${conflicts.length} date in conflitto: ${conflicts.map((c) => c.date).join(", ")}`,
      };

    const skipped = conflicts.map((c) => c.date);
    const finalRule = {
      ...rule,
      exceptions: [...new Set([...rule.exceptions, ...skipped])],
    };
    const seriesId = nid("s");
    const free = prev.filter((p) => !p.conflict);

    set((d) => {
      const op = currentOperator(d);
      const now = new Date().toISOString();

      d.bookings = [
        ...d.bookings,
        ...free.map((p) => ({
          ...draft,
          date: p.date,
          id: nid("b"),
          createdAt: now,
          createdBy: op.name,
          cancelled: false,
          seriesId,
          recurrence: finalRule,
        })),
      ];
    });

    return { ok: true, created: free.length, skipped };
  },

  /** Modifica uno, i futuri o tutti i blocchi. Fallisce senza modifiche se anche un solo blocco va in conflitto. */
  update(
    id: string,
    patch: Partial<
      Pick<Booking, "courtId" | "start" | "end" | "kind" | "title" | "players" | "note" | "price">
    >,
    scope: SeriesScope,
  ): { ok: boolean; error?: string; updated?: number } {
    const db = load();
    const base = db.bookings.find((b) => b.id === id);
    if (!base) return { ok: false, error: "Prenotazione non trovata" };

    const members = base.seriesId
      ? scopeMembers(db, base.seriesId, scope, base.date, id)
      : [base];

    const ignore = new Set(members.map((m) => m.id));
    const next = members.map((m) => ({ ...m, ...patch }));

    if (next.some((n) => toMin(n.end) <= toMin(n.start)))
      return { ok: false, error: "L'orario di fine deve seguire quello di inizio" };

    const clashes = next.filter((n) => findConflict(db, n, ignore));

    if (clashes.length)
      return {
        ok: false,
        error: `Conflitto su ${clashes.length} blocchi: ${clashes.map((c) => c.date).join(", ")}`,
      };

    const map = new Map(next.map((n) => [n.id, n]));

    set((d) => {
      d.bookings = d.bookings.map((b) => map.get(b.id) ?? b);
    });

    return { ok: true, updated: next.length };
  },

  /** Annulla blocchi: "this" aggiunge anche l'eccezione alla regola. */
  cancel(id: string, scope: SeriesScope): number {
    const db = load();
    const base = db.bookings.find((b) => b.id === id);
    if (!base) return 0;

    const members = base.seriesId
      ? scopeMembers(db, base.seriesId, scope, base.date, id)
      : [base];

    const ids = new Set(members.map((m) => m.id));

    set((d) => {
      d.bookings = d.bookings.map((b) => {
        if (ids.has(b.id)) return { ...b, cancelled: true };

        if (base.seriesId && b.seriesId === base.seriesId && b.recurrence) {
          const exc = new Set(b.recurrence.exceptions);
          members.forEach((m) => exc.add(m.date));

          return {
            ...b,
            recurrence: { ...b.recurrence, exceptions: [...exc].sort() },
          };
        }

        return b;
      });
    });

    return ids.size;
  },
};
