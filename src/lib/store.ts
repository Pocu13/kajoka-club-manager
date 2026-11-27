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

const roundUpHalf = (value: number) =>
  Math.ceil((Math.max(0, value) - 0.000001) * 2) / 2;

function distributeHalfEuroTotal(
  players: Player[],
  targetTotal: number,
  excludedIds: Set<string> = new Set(),
): Player[] {
  const eligible = players.filter((player) => !player.paid && !excludedIds.has(player.id));
  if (!eligible.length) return players;
  const halfUnits = Math.max(0, Math.round(roundUpHalf(targetTotal) * 2));
  const baseUnits = Math.floor(halfUnits / eligible.length);
  const remainder = halfUnits % eligible.length;
  const quotas = new Map(eligible.map((player, index) => [
    player.id,
    (baseUnits + (index < remainder ? 1 : 0)) / 2,
  ]));
  return players.map((player) =>
    quotas.has(player.id) ? { ...player, quota: quotas.get(player.id)! } : player,
  );
}

function addHalfEuroDifference(
  players: Player[],
  excludedIds: Set<string>,
  difference: number,
): Player[] {
  const eligible = players.filter((player) => !player.paid && !excludedIds.has(player.id));
  if (!eligible.length || difference <= 0) return players;
  const halfUnits = Math.max(0, Math.round(roundUpHalf(difference) * 2));
  const baseUnits = Math.floor(halfUnits / eligible.length);
  const remainder = halfUnits % eligible.length;
  const increments = new Map(eligible.map((player, index) => [
    player.id,
    (baseUnits + (index < remainder ? 1 : 0)) / 2,
  ]));
  return players.map((player) =>
    increments.has(player.id)
      ? { ...player, quota: roundUpHalf(player.quota + increments.get(player.id)!) }
      : player,
  );
}

function redistributeOneQuota(
  players: Player[],
  requested: Record<string, number>,
): Player[] {
  const selected = players.find(
    (player) =>
      !player.paid &&
      Object.prototype.hasOwnProperty.call(requested, player.id) &&
      Math.abs((Number(requested[player.id]) || 0) - player.quota) > 0.001,
  );
  if (!selected) return players;
  const selectedQuota = roundUpHalf(Number(requested[selected.id]) || 0);
  const paidTotal = players.filter((player) => player.paid).reduce((sum, player) => sum + player.quota, 0);
  const totalBefore = players.reduce((sum, player) => sum + player.quota, 0);
  const remaining = Math.max(0, totalBefore - paidTotal - selectedQuota);
  const withSelected = players.map((player) =>
    player.id === selected.id ? { ...player, quota: selectedQuota } : player,
  );
  return distributeHalfEuroTotal(withSelected, remaining, new Set([selected.id]));
}
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

  const baseQuota = roundUpHalf(total / count);

  return Array.from({ length: count }, (_, index) => ({
    id: `g${index + 1}`,
    name: names[index] || `Giocatore ${index + 1}`,
    quota: baseQuota,
    paid: false,
    extras: [],
  }));
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
      total: round(participants.reduce((sum, player) => sum + player.quota, 0)),
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
              price: round(participants.reduce((sum, player) => sum + player.quota, 0)),
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
              quota: roundUpHalf(input.total / Math.max(1, input.playerNames.length)),
              paid: false,
              extras: [],
            }));

      const s: Session = {
        id: nid("s"),
        courtId: input.courtId,
        startedAt: new Date().toISOString(),
        durationMin: input.durationMin,
        pricingMode: input.pricingMode,
        total: round(players.reduce((sum, player) => sum + player.quota, 0)),
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
      d.sessions = d.sessions.map((session) => {
        if (session.id !== sessionId) return session;
        const players = redistributeOneQuota(session.players, quotas);
        return {
          ...session,
          players,
          total: round(players.reduce((sum, player) => sum + player.quota, 0)),
        };
      });
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
              price: round(participants.reduce((sum, player) => sum + player.quota, 0)),
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

  updateBookingQuotas(
    bookingId: string,
    quotasOrPlayerId: Record<string, number> | string,
    newQuota?: number,
  ) {
    set((d) => {
      d.bookings = d.bookings.map((booking) => {
        if (booking.id !== bookingId) return booking;
        const participants = booking.participants ?? [];
        const requested =
          typeof quotasOrPlayerId === "string"
            ? {
                ...Object.fromEntries(participants.map((player) => [player.id, player.quota])),
                [quotasOrPlayerId]: newQuota ?? 0,
              }
            : quotasOrPlayerId;
        const updatedParticipants = redistributeOneQuota(participants, requested);
        return {
          ...booking,
          participants: updatedParticipants,
          players: updatedParticipants.map((player) => player.name),
          price: round(updatedParticipants.reduce((sum, player) => sum + player.quota, 0)),
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
      const booking = d.bookings.find((item) => item.id === bookingId);
      const player = booking?.participants?.find(
        (item) => item.id === playerId,
      );
      const extra = player?.extras.find(
        (item) => item.productId === productId,
      );

      if (!booking || !player || !extra) return;

      const product = d.products.find((item) => item.id === productId);

      d.bookings = d.bookings.map((item) =>
        item.id !== bookingId
          ? item
          : {
              ...item,
              participants: (item.participants ?? []).map((participant) =>
                participant.id !== playerId
                  ? participant
                  : {
                      ...participant,
                      extras: participant.extras.filter(
                        (item) => item.productId !== productId,
                      ),
                    },
              ),
            },
      );

      if (product) {
        pushMovement(
          d,
          product,
          "storno",
          extra.qty,
          "Prenotazione · Rimozione extra",
          bookingId,
          `Ripristino di ${extra.qty} unità rimosse dalla prenotazione.`,
        );
      }
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
        ? Math.min(quotaTotal, roundUpHalf(Math.min(quotaTotal, quotaAmount!)))
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
          ? Math.min(currentQuota, roundUpHalf(Math.min(currentQuota, quotaAmount!)))
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
                playerIds: currentTargets.map((player) => player.id),
                playerPayments: currentTargets.map((player) => {
          const extras = player.extras.map((extra) => ({
            productId: extra.productId,
            name: extra.name,
            qty: extra.qty,
            price: extra.price,
            cost: extra.cost,
          }));
          const quota =
            currentTargets.length === 1
              ? currentRequestedQuota
              : player.quota;

          return {
            playerId: player.id,
            playerName: player.name,
            quota,
            extras,
            amount: round(
              quota +
                extras.reduce(
                  (sum, extra) => sum + extra.price * extra.qty,
                  0,
                ),
            ),
          };
        }),
        note: "Pagamento anticipato quota campo ed extra.",
        
        cancelled: false,
      };

      d.transactions = [tx, ...d.transactions];

      d.bookings = d.bookings.map((item) => {
        if (item.id !== bookingId) return item;
        const paidIds = new Set(currentTargets.map((player) => player.id));
        const paidParticipants = currentParticipants.map((player) =>
          paidIds.has(player.id) && !player.paid
            ? {
                ...player,
                quota: currentTargets.length === 1 ? currentRequestedQuota : player.quota,
                paid: true,
              }
            : player,
        );
        const updatedParticipants = addHalfEuroDifference(
          paidParticipants,
          paidIds,
          currentDifference,
        );
        return {
          ...item,
          participants: updatedParticipants,
          players: updatedParticipants.map((player) => player.name),
          price: round(updatedParticipants.reduce((sum, player) => sum + player.quota, 0)),
        };
      });
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
          ? Math.min(currentQuotaTotal, roundUpHalf(Math.min(currentQuotaTotal, quotaAmount!)))
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
          playerIds: targets.map((target) => target.id),
          playerPayments: targets.map((target) => {
            const extras = target.extras.map((extra) => ({
              productId: extra.productId,
              name: extra.name,
              qty: extra.qty,
              price: extra.price,
              cost: extra.cost,
            }));

            const quota =
              targets.length === 1 ? requestedQuota : target.quota;

            return {
              playerId: target.id,
              playerName: target.name,
              quota,
              extras,
              amount: round(
                quota +
                  extras.reduce(
                    (sum, extra) => sum + extra.price * extra.qty,
                    0,
                  ),
              ),
            };
          }),
          note: "Saldo quota campo ed extra. La quota campo può essere redistribuita tra i giocatori non ancora saldati.",
          cancelled: false,
        },
        ...d.transactions,
      ];

      d.sessions = d.sessions.map((item) => {
        if (item.id !== sessionId) return item;
        const paidIds = new Set(targets.map((player) => player.id));
        const paidPlayers = item.players.map((player) =>
          paidIds.has(player.id) && !player.paid
            ? {
                ...player,
                quota: targets.length === 1 ? requestedQuota : player.quota,
                paid: true,
              }
            : player,
        );
        const updatedPlayers = addHalfEuroDifference(
          paidPlayers,
          paidIds,
          difference,
        );
        return {
          ...item,
          players: updatedPlayers,
          total: round(updatedPlayers.reduce((sum, player) => sum + player.quota, 0)),
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
   * Aggiorna una partita conclusa e registra le relative rettifiche.
   * Le transazioni originali non vengono mai modificate.
   */
    updateClosedDetails(
    sessionId: string,
    input: {
      total: number;
      paymentMethod: "contanti" | "carta" | "misto";
      paymentCash: number;
      players: Array<{
        id: string;
        name: string;
        quota: number;
        paid: boolean;
        extras: Player["extras"];
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
        error: "Puoi modificare soltanto una partita conclusa.",
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
        return {
          ok: false,
          error: "Un giocatore è presente più di una volta.",
        };
      }

      submittedIds.add(item.id);

      if (!session.players.some((player) => player.id === item.id)) {
        return {
          ok: false,
          error: "Uno dei giocatori non appartiene a questa partita.",
        };
      }

      if (
        typeof item.name !== "string" ||
        !item.name.trim() ||
        !Number.isFinite(item.quota) ||
        item.quota < 0 ||
        typeof item.paid !== "boolean" ||
        !Array.isArray(item.extras)
      ) {
        return {
          ok: false,
          error: "Controlla i dati di uno dei giocatori.",
        };
      }

      for (const extra of item.extras) {
        if (
          !extra ||
          typeof extra.productId !== "string" ||
          typeof extra.name !== "string" ||
          !Number.isFinite(extra.qty) ||
          extra.qty <= 0 ||
          !Number.isFinite(extra.price) ||
          extra.price < 0 ||
          !Number.isFinite(extra.cost) ||
          extra.cost < 0
        ) {
          return {
            ok: false,
            error: "Uno degli extra non è valido.",
          };
        }
      }
    }

    const updatedPlayers = session.players.map((player) => {
      const updated = input.players.find((item) => item.id === player.id);

      if (!updated) {
        return {
          ...player,
          extras: player.extras.map((extra) => ({ ...extra })),
        };
      }

      return {
        ...player,
        name: updated.name.trim(),
        quota: round(updated.quota),
        paid: updated.paid,
        extras: updated.extras.map((extra) => ({ ...extra })),
      };
    });

    const affectsPaidLedger = session.players.some((oldPlayer) => {
      const updated = updatedPlayers.find(
        (player) => player.id === oldPlayer.id,
      );

      if (!updated) return false;

      if (oldPlayer.paid !== updated.paid) return true;
      if (!oldPlayer.paid) return false;

      return (
        round(oldPlayer.quota) !== round(updated.quota) ||
        JSON.stringify(oldPlayer.extras) !==
          JSON.stringify(updated.extras)
      );
    });

    const linkedTransactions = db.transactions.filter(
      (tx) =>
        !tx.cancelled &&
        tx.kind === "campo" &&
        (tx.sessionId === sessionId ||
          (!!session.bookingId && tx.bookingId === session.bookingId)),
    );

    const legacyTransactions = linkedTransactions.filter(
      (tx) => !tx.adjustmentOf && !Array.isArray(tx.playerPayments),
    );

    if (affectsPaidLedger && legacyTransactions.length > 0) {
      return {
        ok: false,
        error:
          "Questa partita contiene vecchi incassi senza dettaglio contabile per giocatore. Per sicurezza non posso rettificarli automaticamente.",
      };
    }

    const adjustments: Transaction[] = [];
    const operator = currentOperator(db);

    for (const player of updatedPlayers) {
      const entries = linkedTransactions.flatMap(
        (tx) =>
          (tx.playerPayments ?? []).filter(
            (payment) => payment.playerId === player.id,
          ),
      );

      const ledgerQuota = round(
        entries.reduce((sum, payment) => sum + payment.quota, 0),
      );

      const targetQuota = player.paid ? round(player.quota) : 0;
      const deltaQuota = round(targetQuota - ledgerQuota);

      const itemDeltas = new Map<string, TxItem>();

      const addItemDelta = (item: TxItem, direction: number) => {
        const key = JSON.stringify([
          item.productId,
          item.name,
          item.price,
          item.cost,
        ]);

        const current = itemDeltas.get(key);

        itemDeltas.set(key, {
          ...item,
          qty: round((current?.qty ?? 0) + item.qty * direction),
        });
      };

      for (const payment of entries) {
        for (const extra of payment.extras) {
          addItemDelta(extra, -1);
        }
      }

      if (player.paid) {
        for (const extra of player.extras) {
          addItemDelta(
            {
              productId: extra.productId,
              name: extra.name,
              qty: extra.qty,
              price: extra.price,
              cost: extra.cost,
            },
            1,
          );
        }
      }

      const deltaItems = [...itemDeltas.values()].filter(
        (item) => Math.abs(item.qty) > 0.0001,
      );

      const deltaAmount = round(
        deltaQuota +
          deltaItems.reduce(
            (sum, item) => sum + item.price * item.qty,
            0,
          ),
      );

      if (
        Math.abs(deltaQuota) < 0.005 &&
        deltaItems.length === 0
      ) {
        continue;
      }

      const sourceTransactions = linkedTransactions.filter(
        (tx) =>
          !tx.adjustmentOf &&
          tx.playerPayments?.some(
            (payment) => payment.playerId === player.id,
          ),
      );

           const hasOriginalPayment = sourceTransactions.length > 0;

      if (!hasOriginalPayment && deltaAmount < -0.005) {
        return {
          ok: false,
          error:
            `Non trovo un incasso originale collegato a ${player.name}. ` +
            "Non posso registrare uno storno senza una transazione di origine.",
        };
      }

      let originalCash = 0;
      let originalCard = 0;

      for (const tx of sourceTransactions) {
        const playerAmount = round(
          (tx.playerPayments ?? [])
            .filter((payment) => payment.playerId === player.id)
            .reduce((sum, payment) => sum + payment.amount, 0),
        );

        if (tx.amount > 0) {
          originalCash += tx.cash * (playerAmount / tx.amount);
          originalCard += tx.card * (playerAmount / tx.amount);
        }
      }

      const originalSplit = originalCash + originalCard;

      let cashDelta = 0;
      let cardDelta = 0;

      if (hasOriginalPayment && originalSplit > 0) {
        cashDelta = round(deltaAmount * (originalCash / originalSplit));
        cardDelta = round(deltaAmount - cashDelta);
      } else {
        if (
          !["contanti", "carta", "misto"].includes(input.paymentMethod)
        ) {
          return {
            ok: false,
            error: "Seleziona un metodo di pagamento valido.",
          };
        }

        const requestedCash =
          input.paymentMethod === "contanti"
            ? deltaAmount
            : input.paymentMethod === "carta"
              ? 0
              : round(input.paymentCash);

        if (
          !Number.isFinite(requestedCash) ||
          requestedCash < 0 ||
          requestedCash > deltaAmount
        ) {
          return {
            ok: false,
            error: "La ripartizione tra contanti e carta non è valida.",
          };
        }

        cashDelta = round(requestedCash);
        cardDelta = round(deltaAmount - cashDelta);
      }

      const method: PaymentMethod =
        Math.abs(cashDelta) > 0.005 &&
        Math.abs(cardDelta) > 0.005
          ? "misto"
          : Math.abs(cashDelta) > 0.005
            ? "contanti"
            : Math.abs(cardDelta) > 0.005
              ? "carta"
              : hasOriginalPayment
                ? sourceTransactions[0].method
                : input.paymentMethod;

      const originalIds = sourceTransactions.map((tx) => tx.id);

      const originalIds = sourceTransactions.map((tx) => tx.id);

      adjustments.push({
        id: nid("rett"),
        ts: new Date().toISOString(),
        kind: "campo",
        label: `Rettifica partita · ${player.name}`,
        items: deltaItems,
        subtotal: deltaAmount,
        discount: 0,
        amount: deltaAmount,
        method,
        cash: cashDelta,
        card: cardDelta,
        operatorId: operator.id,
        operatorName: operator.name,
        courtId: session.courtId,
        sessionId: session.id,
        bookingId: session.bookingId,
        playerName: player.name,
        playerIds: [player.id],
        playerPayments: [
          {
            playerId: player.id,
            playerName: player.name,
            quota: deltaQuota,
            extras: deltaItems,
            amount: deltaAmount,
          },
        ],
        adjustmentOf: originalIds[0],
        adjustmentType:
          deltaAmount < -0.005 ? "storno" : "integrazione",
        note:
          `Rettifica collegata alle operazioni originali: ${originalIds.join(", ")}.`,
        cancelled: false,
      });
    }

    const stockChanges = new Map<string, number>();

    for (const player of session.players) {
      for (const extra of player.extras) {
        stockChanges.set(
          extra.productId,
          round(
            (stockChanges.get(extra.productId) ?? 0) - extra.qty,
          ),
        );
      }
    }

    for (const player of updatedPlayers) {
      for (const extra of player.extras) {
        stockChanges.set(
          extra.productId,
          round(
            (stockChanges.get(extra.productId) ?? 0) + extra.qty,
          ),
        );
      }
    }

    for (const [productId, change] of stockChanges) {
      if (Math.abs(change) < 0.0001) continue;

      const product = db.products.find(
        (item) => item.id === productId,
      );

      if (!product) continue;

      if (
        change > 0 &&
        !db.settings.negativeStock &&
        product.stock < change
      ) {
        return {
          ok: false,
          error:
            `Scorte insufficienti per ${product.name}. ` +
            "Non posso aggiungere questo extra alla partita.",
        };
      }
    }

    set((d) => {
      d.sessions = d.sessions.map((current) =>
        current.id === sessionId
          ? {
              ...current,
              total: round(input.total),
              players: updatedPlayers,
            }
          : current,
      );

      if (session.bookingId) {
        d.bookings = d.bookings.map((booking) =>
          booking.id === session.bookingId
            ? {
                ...booking,
                participants: updatedPlayers,
                players: updatedPlayers.map((player) => player.name),
                price: round(
                  updatedPlayers.reduce(
                    (sum, player) => sum + player.quota,
                    0,
                  ),
                ),
              }
            : booking,
        );
      }

      d.transactions = [...adjustments, ...d.transactions];

      for (const [productId, change] of stockChanges) {
        if (Math.abs(change) < 0.0001) continue;

        const product = d.products.find(
          (item) => item.id === productId,
        );

        if (!product) continue;

        pushMovement(
          d,
          product,
          change > 0 ? "prodotto_campo" : "storno",
          -change,
          "Partita · Rettifica extra",
          sessionId,
          "Rettifica automatica delle scorte dopo la modifica della partita.",
        );
      }
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
