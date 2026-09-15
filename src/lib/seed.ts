import type {
  Court,
  DB,
  Movement,
  Product,
  Session,
  Settings,
  Transaction,
  User,
} from "./types";

/* Deterministic pseudo random so demo data is stable within a seed run. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export const CATEGORIES = [
  "Acqua",
  "Bibite",
  "Birre",
  "Caffetteria",
  "Panini & Food",
  "Snack",
  "Energy & Sport",
  "Gelati",
  "Articoli Sportivi",
];

const PRODUCTS: Omit<Product, "id">[] = [
  { name: "Acqua Naturale 50cl", sku: "ACQ-01", category: "Acqua", description: "Bottiglia PET 50cl", cost: 0.35, price: 1.5, stock: 48, minStock: 24, unit: "pz", active: true, posVisible: true, favorite: true, emoji: "💧" },
  { name: "Acqua Frizzante 50cl", sku: "ACQ-02", category: "Acqua", description: "Bottiglia PET 50cl", cost: 0.35, price: 1.5, stock: 36, minStock: 24, unit: "pz", active: true, posVisible: true, favorite: false, emoji: "🫧" },
  { name: "Coca-Cola 33cl", sku: "BIB-04", category: "Bibite", description: "Lattina 33cl", cost: 0.65, price: 2.5, stock: 5, minStock: 12, unit: "pz", active: true, posVisible: true, favorite: true, emoji: "🥤" },
  { name: "Sprite Lattina 33cl", sku: "BIB-08", category: "Bibite", description: "Lattina 33cl", cost: 0.6, price: 2.5, stock: 10, minStock: 12, unit: "pz", active: true, posVisible: true, favorite: false, emoji: "🥤" },
  { name: "Tè Freddo Pesca 33cl", sku: "BIB-12", category: "Bibite", description: "Lattina 33cl", cost: 0.55, price: 2.2, stock: 26, minStock: 12, unit: "pz", active: true, posVisible: true, favorite: false, emoji: "🍹" },
  { name: "Birra Artigianale 33cl", sku: "BIR-02", category: "Birre", description: "Bionda alla spina 33cl", cost: 1.4, price: 4.5, stock: 18, minStock: 12, unit: "pz", active: true, posVisible: true, favorite: true, emoji: "🍺" },
  { name: "Birra Lager 33cl", sku: "BIR-05", category: "Birre", description: "Lager in bottiglia", cost: 1.0, price: 3.5, stock: 22, minStock: 12, unit: "pz", active: true, posVisible: true, favorite: false, emoji: "🍻" },
  { name: "Caffè Espresso", sku: "BAR-01", category: "Caffetteria", description: "Miscela arabica bar", cost: 0.18, price: 1.2, stock: 220, minStock: 40, unit: "dosi", active: true, posVisible: true, favorite: true, emoji: "☕" },
  { name: "Caffè Decaffeinato", sku: "BAR-02", category: "Caffetteria", description: "Miscela decerata", cost: 0.2, price: 1.3, stock: 90, minStock: 30, unit: "dosi", active: true, posVisible: true, favorite: false, emoji: "☕" },
  { name: "Cappuccino", sku: "BAR-05", category: "Caffetteria", description: "Caffè e latte montato", cost: 0.4, price: 1.8, stock: 120, minStock: 30, unit: "dosi", active: true, posVisible: true, favorite: false, emoji: "🥛" },
  { name: "Panino Cotto & Mozzarella", sku: "PAN-01", category: "Panini & Food", description: "Pane rustico tostato", cost: 2.1, price: 5.5, stock: 8, minStock: 6, unit: "pz", active: true, posVisible: true, favorite: true, emoji: "🥪" },
  { name: "Piadina Crudo & Rucola", sku: "PAN-04", category: "Panini & Food", description: "Piadina romagnola", cost: 2.4, price: 6.5, stock: 6, minStock: 5, unit: "pz", active: true, posVisible: true, favorite: false, emoji: "🌯" },
  { name: "Croissant Burro", sku: "PAN-09", category: "Panini & Food", description: "Sfornato stamattina", cost: 0.45, price: 1.4, stock: 11, minStock: 8, unit: "pz", active: true, posVisible: true, favorite: false, emoji: "🥐" },
  { name: "Snack Barretta Proteica", sku: "SNK-05", category: "Snack", description: "Gusto cioccolato 50g", cost: 0.95, price: 2.5, stock: 24, minStock: 15, unit: "pz", active: true, posVisible: true, favorite: true, emoji: "🍫" },
  { name: "Patatine Classiche 50g", sku: "SNK-09", category: "Snack", description: "Busta 50g", cost: 0.5, price: 1.8, stock: 30, minStock: 12, unit: "pz", active: true, posVisible: true, favorite: false, emoji: "🥨" },
  { name: "Isotonico Sport 500ml", sku: "ENE-03", category: "Energy & Sport", description: "Gusto arancia rossa", cost: 0.85, price: 2.8, stock: 16, minStock: 10, unit: "pz", active: true, posVisible: true, favorite: true, emoji: "⚡" },
  { name: "Energy Drink 25cl", sku: "ENE-07", category: "Energy & Sport", description: "Lattina 25cl", cost: 0.9, price: 3.0, stock: 14, minStock: 10, unit: "pz", active: true, posVisible: true, favorite: false, emoji: "🔋" },
  { name: "Ghiacciolo Frutta", sku: "GEL-02", category: "Gelati", description: "Limone o fragola", cost: 0.4, price: 1.8, stock: 0, minStock: 10, unit: "pz", active: true, posVisible: true, favorite: false, emoji: "🍧" },
  { name: "Gelato Cono Vaniglia", sku: "GEL-06", category: "Gelati", description: "Cono confezionato", cost: 0.7, price: 2.5, stock: 12, minStock: 8, unit: "pz", active: true, posVisible: true, favorite: false, emoji: "🍦" },
  { name: "Tubo Palline Padel Pro", sku: "PAD-11", category: "Articoli Sportivi", description: "Confezione 3 palline", cost: 3.8, price: 6.0, stock: 3, minStock: 5, unit: "pz", active: true, posVisible: true, favorite: true, emoji: "🎾" },
  { name: "Overgrip Padel 3pz", sku: "PAD-09", category: "Articoli Sportivi", description: "Pacco da 3 pezzi", cost: 1.9, price: 4.0, stock: 18, minStock: 8, unit: "pz", active: true, posVisible: true, favorite: false, emoji: "🥍" },
  { name: "Noleggio Racchetta Padel", sku: "PAD-20", category: "Articoli Sportivi", description: "Noleggio a sessione", cost: 0, price: 5.0, stock: 9, minStock: 3, unit: "pz", active: true, posVisible: true, favorite: false, emoji: "🏓" },
];

const COURTS: Court[] = [
  { id: "c-padel-1", name: "Padel 1", type: "padel", hourlyPrice: 40, active: true, x: 24, y: 70 },
  { id: "c-padel-2", name: "Padel 2", type: "padel", hourlyPrice: 40, active: true, x: 53, y: 82 },
  { id: "c-padel-3", name: "Padel 3", type: "padel", hourlyPrice: 40, active: true, x: 76, y: 66 },
  { id: "c-tennis-1", name: "Tennis 1", type: "tennis", hourlyPrice: 24, active: true, x: 22, y: 33 },
  { id: "c-beach-1", name: "Beach 1", type: "beach", hourlyPrice: 30, active: true, x: 62, y: 24 },
  { id: "c-beach-2", name: "Beach 2", type: "beach", hourlyPrice: 30, active: true, x: 76, y: 32 },
  { id: "c-beach-3", name: "Beach 3", type: "beach", hourlyPrice: 30, active: true, x: 88, y: 41 },
];

const USERS: Omit<User, "id">[] = [
  { name: "Marco Rossi", username: "admin", email: "marco.rossi@kajoka.it", role: "admin", active: true, password: "1234", passwordSet: true, lastAccess: null, createdAt: "2024-05-12T09:00:00", permissions: ["pos", "prodotti", "magazzino", "movimenti", "storico", "statistiche", "utenti", "impostazioni", "annullamenti", "margini"] },
  { name: "Luca Bianchi", username: "luca.bianchi", email: "luca.bianchi@kajoka.it", role: "dipendente", active: true, password: "1234", passwordSet: true, lastAccess: null, createdAt: "2024-06-01T09:00:00", permissions: ["pos", "magazzino", "storico"] },
  { name: "Sara Conti", username: "sara.c", email: "sara.conti@kajoka.it", role: "admin", active: true, password: "1234", passwordSet: true, lastAccess: null, createdAt: "2024-06-14T09:00:00", permissions: ["pos", "prodotti", "magazzino", "movimenti", "storico", "statistiche", "utenti", "impostazioni", "annullamenti", "margini"] },
  { name: "Matteo Galli", username: "m.galli", email: "matteo.galli@kajoka.it", role: "dipendente", active: true, password: "1234", passwordSet: true, lastAccess: null, createdAt: "2024-09-02T09:00:00", permissions: ["pos", "magazzino"] },
  { name: "Anna Verdi", username: "anna.verdi", email: "anna.verdi@kajoka.it", role: "dipendente", active: false, password: "", passwordSet: false, lastAccess: null, createdAt: "2024-11-20T09:00:00", permissions: ["pos"] },
  { name: "Davide Rinaldi", username: "d.rinaldi", email: "davide.rinaldi@kajoka.it", role: "dipendente", active: true, password: "1234", passwordSet: true, lastAccess: null, createdAt: "2025-01-08T09:00:00", permissions: ["pos", "storico"] },
  { name: "Elena Neri", username: "elena.neri", email: "elena.neri@kajoka.it", role: "dipendente", active: false, password: "", passwordSet: false, lastAccess: null, createdAt: "2025-02-17T09:00:00", permissions: ["pos"] },
  { name: "Giulia Fontana", username: "g.fontana", email: "giulia.fontana@kajoka.it", role: "dipendente", active: true, password: "1234", passwordSet: true, lastAccess: null, createdAt: "2025-03-30T09:00:00", permissions: ["pos", "magazzino", "storico"] },
];

export const DEFAULT_SETTINGS: Settings = {
  clubName: "KAJOKA Sporting Club",
  language: "it-IT",
  currency: "EUR",
  dateFormat: "GG/MM/AAAA",
  timeFormat: "24",
  timezone: "Europe/Rome",
  numberFormat: "1.234,56",
  defaultDuration: 90,
  slotStep: 30,
  defaultPricingMode: "giocatore",
  posQuickPay: true,
  posRequireConfirm: true,
  posDefaultMethod: "carta",
  showFavoritesFirst: true,
  lowStockAlert: true,
  defaultMinStock: 10,
  negativeStock: false,
  stockUnit: "pz",
  sessionTimeout: 30,
  requireStrongPassword: false,
  auditLog: true,
  lockPriceEdit: false,
};

const PLAYER_NAMES = [
  "Alessandro Neri",
  "Luca Bianchi",
  "Matteo Ferrari",
  "Davide Costa",
  "Giorgio Sala",
  "Paolo Greco",
  "Marta Riva",
  "Chiara Moro",
  "Simone Villa",
  "Andrea Pini",
  "Filippo Bruno",
  "Nicola Gatti",
];

const uid = (p: string, n: number) => `${p}-${n.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

export function buildSeed(): DB {
  const rand = rng(20250902);
  const now = new Date();

  const users: User[] = USERS.map((u, i) => ({ ...u, id: `u-${i + 1}` }));
  const products: Product[] = PRODUCTS.map((p, i) => ({ ...p, id: `p-${i + 1}` }));

  const transactions: Transaction[] = [];
  const movements: Movement[] = [];
  let txn = 400;
  let mvn = 1;

  const opFor = () => {
    const pool = users.filter((u) => u.active);
    return pool[Math.floor(rand() * pool.length)] ?? users[0]!;
  };

  const barProducts = products.filter((p) => p.category !== "Articoli Sportivi");

  // 30 days of history, bar sales + court sessions.
  for (let d = 29; d >= 0; d--) {
    const day = new Date(now);
    day.setDate(day.getDate() - d);
    const weekend = day.getDay() === 0 || day.getDay() === 6;
    const barCount = Math.floor((weekend ? 10 : 6) + rand() * 6);
    const courtCount = Math.floor((weekend ? 8 : 5) + rand() * 4);

    for (let i = 0; i < barCount; i++) {
      const op = opFor();
      const when = new Date(day);
      when.setHours(9 + Math.floor(rand() * 13), Math.floor(rand() * 60), 0, 0);
      if (when > now) continue;
      const lines = 1 + Math.floor(rand() * 3);
      const items = [];
      for (let l = 0; l < lines; l++) {
        const p = barProducts[Math.floor(rand() * barProducts.length)]!;
        const qty = 1 + Math.floor(rand() * 3);
        items.push({ productId: p.id, name: p.name, qty, price: p.price, cost: p.cost });
      }
      const subtotal = items.reduce((s, it) => s + it.price * it.qty, 0);
      const discount = rand() > 0.9 ? Math.round(subtotal * 0.1 * 100) / 100 : 0;
      const amount = Math.round((subtotal - discount) * 100) / 100;
      const r = rand();
      const method = r > 0.66 ? "contanti" : r > 0.12 ? "carta" : "misto";
      const cash = method === "contanti" ? amount : method === "misto" ? Math.round(amount * 0.5 * 100) / 100 : 0;
      const id = `#V-00${txn++}`;
      const cancelled = rand() > 0.97;
      transactions.push({
        id,
        ts: when.toISOString(),
        kind: "bar",
        label: "Vendita POS",
        items,
        subtotal,
        discount,
        amount,
        method: method as Transaction["method"],
        cash,
        card: Math.round((amount - cash) * 100) / 100,
        operatorId: op.id,
        operatorName: op.name,
        note: "Registrato automaticamente dalla cassa Bar.",
        cancelled,
        cancelledAt: cancelled ? when.toISOString() : undefined,
        cancelReason: cancelled ? "Errore di battitura cassa" : undefined,
      });
      if (!cancelled) {
        for (const it of items) {
          const prod = products.find((p) => p.id === it.productId)!;
          movements.push({
            id: `m-${mvn++}`,
            ts: when.toISOString(),
            productId: prod.id,
            productName: prod.name,
            sku: prod.sku,
            type: "vendita_pos",
            qty: -it.qty,
            before: prod.stock + it.qty,
            after: prod.stock,
            origin: "Cassa POS (Bar Centrale)",
            ref: id,
            operatorId: op.id,
            operatorName: op.name,
            note: "Scarico automatico da vendita cassa Bar.",
            cancelled: false,
          });
        }
      }
    }

    for (let i = 0; i < courtCount; i++) {
      const op = opFor();
      const court = COURTS[Math.floor(rand() * COURTS.length)]!;
      const when = new Date(day);
      when.setHours(9 + Math.floor(rand() * 12), rand() > 0.5 ? 30 : 0, 0, 0);
      if (when > now) continue;
      const players = court.type === "tennis" ? 2 : 4;
      const amount = Math.round((court.hourlyPrice * 1.5) / players) * (rand() > 0.5 ? players : 1);
      const method = rand() > 0.5 ? "carta" : "contanti";
      transactions.push({
        id: `#P-00${txn++}`,
        ts: when.toISOString(),
        kind: "campo",
        label: `${court.name} · Quota campo`,
        items: [],
        subtotal: amount,
        discount: 0,
        amount,
        method: method as Transaction["method"],
        cash: method === "contanti" ? amount : 0,
        card: method === "carta" ? amount : 0,
        operatorId: op.id,
        operatorName: op.name,
        courtId: court.id,
        note: "Incasso quota campo.",
        cancelled: false,
      });
    }
  }

  // Supplier loads
  for (const p of products.slice(0, 10)) {
    const when = new Date(now);
    when.setDate(when.getDate() - 2);
    when.setHours(11, 20, 0, 0);
    movements.push({
      id: `m-${mvn++}`,
      ts: when.toISOString(),
      productId: p.id,
      productName: p.name,
      sku: p.sku,
      type: "carico",
      qty: 24,
      before: Math.max(0, p.stock - 24),
      after: p.stock,
      origin: "Magazzino · Fornitore",
      ref: "#DDT-1182",
      operatorId: users[0]!.id,
      operatorName: users[0]!.name,
      note: "Carico da bolla fornitore.",
      cancelled: false,
    });
  }

  transactions.sort((a, b) => b.ts.localeCompare(a.ts));
  movements.sort((a, b) => b.ts.localeCompare(a.ts));

  // Two live sessions
  const mk = (courtId: string, mins: number, names: string[], mode: "campo" | "giocatore", total: number): Session => {
    const started = new Date(now.getTime() - mins * 60000);
    return {
      id: uid("s", 1),
      courtId,
      startedAt: started.toISOString(),
      durationMin: 90,
      pricingMode: mode,
      total,
      players: names.map((n, i) => ({
        id: `g${i + 1}`,
        name: n,
        quota: Math.round((total / names.length) * 100) / 100,
        paid: i < names.length - 2,
        extras: [],
      })),
      closed: false,
    };
  };

  const sessions: Session[] = [
    mk("c-padel-2", 45, PLAYER_NAMES.slice(0, 4), "giocatore", 40),
    mk("c-padel-1", 20, PLAYER_NAMES.slice(4, 8), "giocatore", 40),
    mk("c-tennis-1", 35, PLAYER_NAMES.slice(8, 10), "giocatore", 24),
    mk("c-beach-2", 10, PLAYER_NAMES.slice(6, 10), "campo", 30),
  ];
  const s0 = sessions[0]!;
  s0.players[2]!.extras = [
    { productId: products[0]!.id, name: products[0]!.name, qty: 1, price: 1.5, cost: 0.35 },
    { productId: products[19]!.id, name: products[19]!.name, qty: 1, price: 6, cost: 3.8 },
  ];

  return {
    version: 1,
    users,
    products,
    courts: COURTS,
    sessions,
    movements,
    transactions,
    settings: DEFAULT_SETTINGS,
    currentUserId: null,
  };
}
