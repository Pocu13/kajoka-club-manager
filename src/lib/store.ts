
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
    playerName?: string;
    note?: string;
    decrementStock?: boolean;
  }): string {
    let id = "";
    set((d) => {
      const subtotal = round(input.items.reduce((s, i) => s + i.price * i.qty, 0));
      const amount = round(subtotal - input.discount);
      const op = currentOperator(d);
      const kind = input.kind ?? "bar";
      id = nextTxId(d, kind);
      const tx: Transaction = {
        id,
        ts: new Date().toISOString(),
        kind,
        label: input.label ?? "Vendita POS",
        items: input.items,
        subtotal,
        discount: input.discount,
        amount,
        method: input.method,
        cash: input.cash,
        card: input.card,
        operatorId: op.id,
        operatorName: op.name,
        courtId: input.courtId,
        sessionId: input.sessionId,
        playerName: input.playerName,
        note: input.note ?? "",
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
              kind === "bar" ? "Cassa POS (Bar Centrale)" : "Campo · Extra giocatore",
              id,
              "Scarico automatico da vendita.",
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
  /** Check-in con un click: avvia la sessione dai dati della prenotazione. */
  checkIn(booking: Booking) {
    const d0 = getDB();
    if (d0.sessions.some((x) => !x.closed && x.courtId === booking.courtId)) {
      throw new Error("Il campo ha già una sessione attiva");
    }
    const court = d0.courts.find((c) => c.id === booking.courtId);
    const minutes = Math.max(30, toMin(booking.end) - toMin(booking.start));
    const total = booking.price > 0 ? booking.price : round((court?.hourlyPrice ?? 0) * (minutes / 60));
    const names = booking.players.length ? booking.players : ["", "", "", ""];
    courtSessions.start({
      courtId: booking.courtId,
      pricingMode: "giocatore",
      total,
      durationMin: minutes,
      playerNames: names,
      bookingId: booking.id,
    });
  },
  start(input: {
    courtId: string;
    pricingMode: "campo" | "giocatore";
    total: number;
    durationMin: number;
    playerNames: string[];
    bookingId?: string;
  }) {
    set((d) => {
      const players: Player[] = input.playerNames.map((n, i) => ({
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
      d.sessions = [...d.sessions, s];
    });
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
  payPlayers(
    sessionId: string,
    playerIds: string[],
    method: PaymentMethod,
    cash: number,
    card: number,
  ) {
    set((d) => {
      const s = d.sessions.find((x) => x.id === sessionId);
      if (!s) return;
      const court = d.courts.find((c) => c.id === s.courtId);
      const targets = s.players.filter((p) => playerIds.includes(p.id) && !p.paid);
      if (!targets.length) return;
      const items: TxItem[] = targets.flatMap((p) =>
        p.extras.map((e) => ({
          productId: e.productId,
          name: e.name,
          qty: e.qty,
          price: e.price,
          cost: e.cost,
        })),
      );
      const quotaTotal = round(targets.reduce((sum, p) => sum + p.quota, 0));
      const extraTotal = round(items.reduce((sum, i) => sum + i.price * i.qty, 0));
      const amount = round(quotaTotal + extraTotal);
      const op = currentOperator(d);
      const id = nextTxId(d, "campo");
      d.transactions = [
        {
          id,
          ts: new Date().toISOString(),
          kind: "campo",
          label: `${court?.name ?? "Campo"} · ${targets.map((t) => t.name).join(", ")}`,
          items,
          subtotal: amount,
          discount: 0,
          amount,
          method,
          cash: method === "misto" ? cash : method === "contanti" ? amount : 0,
          card: method === "misto" ? card : method === "carta" ? amount : 0,
          operatorId: op.id,
          operatorName: op.name,
          courtId: s.courtId,
          sessionId: s.id,
          playerName: targets.map((t) => t.name).join(", "),
          note: "Saldo quota campo ed extra.",
          cancelled: false,
        },
        ...d.transactions,
      ];
      d.sessions = d.sessions.map((x) =>
        x.id === sessionId
          ? {
              ...x,
              players: x.players.map((p) =>
                playerIds.includes(p.id) ? { ...p, paid: true } : p,
              ),
            }
          : x,
      );
    });
  },
  close(sessionId: string) {
    set((d) => {
      d.sessions = d.sessions.filter((s) => s.id !== sessionId);
    });
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

function findConflict(db: DB, d: { courtId: string; date: string; start: string; end: string }, ignore: Set<string>) {
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

function scopeMembers(db: DB, seriesId: string, scope: SeriesScope, fromDate: string, id?: string) {
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
    if (rule.until < draft.date) return { ok: false, error: "La data di fine precede la data di inizio" };
    const prev = series.preview(draft, rule);
    if (!prev.length) return { ok: false, error: "Nessuna data generata dalla regola" };
    const conflicts = prev.filter((p) => p.conflict);
    if (conflicts.length && !skipConflicts)
      return {
        ok: false,
        error: `${conflicts.length} date in conflitto: ${conflicts.map((c) => c.date).join(", ")}`,
      };
    const skipped = conflicts.map((c) => c.date);
    const finalRule = { ...rule, exceptions: [...new Set([...rule.exceptions, ...skipped])] };
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
    patch: Partial<Pick<Booking, "courtId" | "start" | "end" | "kind" | "title" | "players" | "note" | "price">>,
    scope: SeriesScope,
  ): { ok: boolean; error?: string; updated?: number } {
    const db = load();
    const base = db.bookings.find((b) => b.id === id);
    if (!base) return { ok: false, error: "Prenotazione non trovata" };
    const members = base.seriesId ? scopeMembers(db, base.seriesId, scope, base.date, id) : [base];
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
    const members = base.seriesId ? scopeMembers(db, base.seriesId, scope, base.date, id) : [base];
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
