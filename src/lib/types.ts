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
  courtId?: string;
  sessionId?: string;
  playerName?: string;
  note: string;
  cancelled: boolean;
  cancelledAt?: string;
  cancelReason?: string;
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
  movements: Movement[];
  transactions: Transaction[];
  settings: Settings;
  currentUserId: string | null;
}
