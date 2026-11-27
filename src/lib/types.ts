
export type Role = "admin" | "dipendente";

export type PaymentMethod = "contanti" | "carta" | "misto" | "omaggio";

export interface User {
  id: string;
  name: string;
  username: string;
  email: string;
  role: Role;
  active: boolean;
  password: string;
  passwordSet: boolean;
  lastAccess: string | null;
  createdAt: string;
  permissions: string[];
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  description: string;
  cost: number;
  price: number;
  stock: number;
  minStock: number;
  unit: string;
  active: boolean;
  posVisible: boolean;
  favorite: boolean;
  emoji: string;
}

export type MovementType =
  | "carico"
  | "scarico"
  | "rettifica"
  | "vendita_pos"
  | "prodotto_campo"
  | "storno";

export interface Movement {
  id: string;
  ts: string;
  productId: string;
  productName: string;
  sku: string;
  type: MovementType;
  qty: number;
  before: number;
  after: number;
  origin: string;
  ref: string;
  operatorId: string;
  operatorName: string;
  note: string;
  cancelled: boolean;
}

export interface TxItem {
  productId: string;
  name: string;
  qty: number;
  price: number;
  cost: number;
}

export interface Transaction {
  id: string;
  ts: string;
  kind: "bar" | "campo";
  label: string;
  items: TxItem[];
  subtotal: number;
  discount: number;
  amount: number;
  method: PaymentMethod;
  cash: number;
  card: number;
  operatorId: string;
  operatorName: string;
  courtId?: string | undefined;
  sessionId?: string | undefined;
  bookingId?: string | undefined;
   playerName?: string | undefined;
  playerIds?: string[] | undefined;
  playerPayments?: Array<{
    playerId: string;
    playerName: string;
    quota: number;
    extras: TxItem[];
    amount: number;
  }> | undefined;
  adjustmentOf?: string | undefined;
  adjustmentType?: "storno" | "integrazione" | undefined;
  cancelled: boolean;
  cancelledAt?: string | undefined;
  cancelReason?: string | undefined;
}

export type CourtType = "padel" | "tennis" | "beach";

export interface Court {
  id: string;
  name: string;
  type: CourtType;
  hourlyPrice: number;
  active: boolean;
  x: number;
  y: number;
}

export interface PlayerExtra {
  productId: string;
  name: string;
  qty: number;
  price: number;
  cost: number;
}

export interface Player {
  id: string;
  name: string;
  quota: number;
  paid: boolean;
  extras: PlayerExtra[];
}

export interface Session {
  id: string;
  courtId: string;
  startedAt: string;
  durationMin: number;
  pricingMode: "campo" | "giocatore";
  total: number;
  players: Player[];
  closed: boolean;
  /** Prenotazione da cui è stato avviato il check-in o la sessione automatica. */
  bookingId?: string;
}

export type BookingKind = "partita" | "lezione" | "serie" | "manutenzione";

export interface Booking {
  id: string;
  courtId: string;
  /** Data locale in formato AAAA-MM-GG */
  date: string;
  /** Orario locale HH:MM */
  start: string;
  end: string;
  kind: BookingKind;
  title: string;
  players: string[];
  /**
   * Partecipanti operativi della prenotazione.
   * Conserva quote, pagamenti anticipati ed eventuali extra
   * anche prima della creazione della sessione.
   */
  participants?: Player[];
  extras: string[];
  price: number;
  note: string;
  createdAt: string;
  createdBy: string;
  cancelled: boolean;
  /** Serie ricorrente di appartenenza */
  seriesId?: string;
  recurrence?: RecurrenceRule;
  /** Origine: inserimento manuale o richiesta AI */
  source?: "manuale" | "ai";
}

export type RecurrenceFreq = "daily" | "weekly" | "biweekly" | "monthly";

export interface RecurrenceRule {
  freq: RecurrenceFreq;
  /** Data di fine inclusa AAAA-MM-GG */
  until: string;
  /** Date escluse AAAA-MM-GG */
  exceptions: string[];
}

export interface Settings {
  clubName: string;
  language: string;
  currency: string;
  dateFormat: string;
  timeFormat: "24" | "12";
  timezone: string;
  numberFormat: string;
  defaultDuration: number;
  slotStep: number;
  defaultPricingMode: "campo" | "giocatore";
  posQuickPay: boolean;
  posRequireConfirm: boolean;
  posDefaultMethod: PaymentMethod;
  showFavoritesFirst: boolean;
  lowStockAlert: boolean;
  defaultMinStock: number;
  negativeStock: boolean;
  stockUnit: string;
  sessionTimeout: number;
  requireStrongPassword: boolean;
  auditLog: boolean;
  lockPriceEdit: boolean;
}

export interface DB {
  version: number;
  users: User[];
  products: Product[];
  courts: Court[];
  sessions: Session[];
  bookings: Booking[];
  movements: Movement[];
  transactions: Transaction[];
  settings: Settings;
  currentUserId: string | null;
}
