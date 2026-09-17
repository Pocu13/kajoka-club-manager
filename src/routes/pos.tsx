import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Minus, Plus, Search, Star, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import {
  Badge,
  Btn,
  EmptyState,
  Field,
  Input,
  Modal,
  Panel,
  Select,
} from "@/components/ui-kit";
import { sales, stockState, useDB } from "@/lib/store";
import { eur } from "@/lib/format";
import type { PaymentMethod, TxItem } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/pos")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Cassa Bar POS — KAJOKA" },
      {
        name: "description",
        content:
          "Cassa rapida del bar: carrello, ricerca prodotti, sconti e pagamenti contanti, carta o misto.",
      },
      { property: "og:title", content: "Cassa Bar POS — KAJOKA" },
      {
        property: "og:description",
        content: "Cassa rapida del bar del circolo KAJOKA.",
      },
    ],
  }),
  component: () => (
    <AppShell>
      <PosPage />
    </AppShell>
  ),
});

interface Line {
  productId: string;
  qty: number;
}

function PosPage() {
  const db = useDB();
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("Tutti");
  const [lines, setLines] = useState<Line[]>([]);
  const [discount, setDiscount] = useState("0");
  const [payOpen, setPayOpen] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>(db.settings.posDefaultMethod);
  const [cash, setCash] = useState("0");
  const [mobileCartOpen, setMobileCartOpen] = useState(false);

  const categories = useMemo(
    () => ["Tutti", "Preferiti", ...Array.from(new Set(db.products.map((p) => p.category)))],
    [db.products],
  );

  const visible = db.products
    .filter((p) => p.active && p.posVisible)
    .filter((p) =>
      cat === "Tutti" ? true : cat === "Preferiti" ? p.favorite : p.category === cat,
    )
    .filter(
      (p) =>
        !query.trim() ||
        p.name.toLowerCase().includes(query.toLowerCase()) ||
        p.sku.toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      db.settings.showFavoritesFirst ? Number(b.favorite) - Number(a.favorite) : 0,
    );

  const cart = lines
    .map((l) => {
      const p = db.products.find((x) => x.id === l.productId);
      return p ? { ...l, product: p } : null;
    })
    .filter((x): x is Line & { product: (typeof db.products)[number] } => !!x);

  const subtotal = cart.reduce((s, l) => s + l.product.price * l.qty, 0);
  const disc = Math.min(subtotal, Number(discount) || 0);
  const total = Math.max(0, subtotal - disc);
  const cashNum = Number(cash) || 0;
  const cardPart = method === "misto" ? Math.max(0, total - cashNum) : 0;

  function add(productId: string) {
    const p = db.products.find((x) => x.id === productId);
    if (!p) return;
    if (p.stock <= 0 && !db.settings.negativeStock) {
      toast.error(`${p.name} è esaurito`);
      return;
    }
    setLines((prev) => {
      const ex = prev.find((l) => l.productId === productId);
      return ex
        ? prev.map((l) => (l.productId === productId ? { ...l, qty: l.qty + 1 } : l))
        : [...prev, { productId, qty: 1 }];
    });
  }

  function setQty(productId: string, delta: number) {
    setLines((prev) =>
      prev
        .map((l) => (l.productId === productId ? { ...l, qty: l.qty + delta } : l))
        .filter((l) => l.qty > 0),
    );
  }

  function confirm() {
    const items: TxItem[] = cart.map((l) => ({
      productId: l.product.id,
      name: l.product.name,
      qty: l.qty,
      price: l.product.price,
      cost: l.product.cost,
    }));
    const id = sales.record({
      items,
      discount: disc,
      method,
      cash: method === "contanti" ? total : method === "misto" ? cashNum : 0,
      card: method === "carta" ? total : method === "misto" ? cardPart : 0,
      kind: "bar",
      label: "Vendita Bar",
    });
    setLines([]);
    setDiscount("0");
    setCash("0");
    setPayOpen(false);
    toast.success(`Vendita ${id} registrata — ${eur(total)}`);
  }

  return (
    <div className="grid grid-cols-1 gap-5 pb-20 xl:grid-cols-[1fr_380px] xl:pb-0">
      <div className="min-w-0 space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold uppercase sm:text-3xl">Cassa Bar</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {visible.length} prodotti a listino · scarico magazzino automatico
            </p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Cerca prodotto o SKU…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={cn(
                "label-caps shrink-0 rounded-full border px-3 py-1.5 transition-colors",
                cat === c
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-surface-container text-muted-foreground hover:bg-surface-high",
              )}
            >
              {c}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <Panel>
            <EmptyState label="Nessun prodotto corrisponde alla ricerca." />
          </Panel>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 2xl:grid-cols-4">
            {visible.map((p) => {
              const st = stockState(p);
              return (
                <button
                  key={p.id}
                  onClick={() => add(p.id)}
                  disabled={st === "esaurito" && !db.settings.negativeStock}
                  className="group relative min-w-0 rounded-xl border border-border bg-surface-low p-3 text-left transition-colors hover:border-primary/60 hover:bg-surface-high disabled:opacity-40"
                >
                  {p.favorite && (
                    <Star className="absolute top-3 right-3 size-3.5 fill-primary text-primary" />
                  )}
                  <div className="text-2xl">{p.emoji}</div>
                  <div className="mt-2 text-sm leading-tight font-semibold">{p.name}</div>
                  <div className="label-caps mt-0.5 text-muted-foreground">
                    {p.category}
                  </div>
                   <div className="mt-2 flex flex-wrap items-end justify-between gap-1">
                    <span className="mono text-base font-bold text-primary">
                      {eur(p.price)}
                    </span>
                    <Badge
                      tone={
                        st === "ok" ? "success" : st === "sottoscorta" ? "warning" : "danger"
                      }
                    >
                      {st === "esaurito" ? "ESAURITO" : `${p.stock} ${p.unit}`}
                    </Badge>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <Panel className="fixed inset-x-3 bottom-20 z-30 flex max-h-[65vh] flex-col gap-3 overflow-auto p-3 shadow-2xl sm:inset-x-5 xl:sticky xl:inset-auto xl:top-4 xl:z-auto xl:h-fit xl:max-h-none xl:gap-4 xl:overflow-visible xl:p-4 xl:shadow-none">
        <button
          type="button"
          onClick={() => setMobileCartOpen((value) => !value)}
          className="flex w-full items-center justify-between text-left xl:pointer-events-none"
        >
          <span className="label-caps text-muted-foreground">Scontrino · {cart.reduce((sum, line) => sum + line.qty, 0)} articoli</span>
          <span className="mono font-bold text-primary xl:hidden">{eur(total)} {mobileCartOpen ? "−" : "+"}</span>
        </button>
        <div className={cn("contents", !mobileCartOpen && "max-xl:hidden")}>
          {cart.length > 0 && (
            <button
              className="flex items-center gap-1 text-xs text-danger"
              onClick={() => setLines([])}
            >
              <Trash2 className="size-3" /> Svuota
            </button>
          )}

          {cart.length === 0 ? (
          <EmptyState label="Carrello vuoto — tocca un prodotto." />
        ) : (
          <div className="max-h-[42vh] space-y-2 overflow-auto pr-1">
            {cart.map((l) => (
              <div
                key={l.productId}
                className="flex items-center gap-2 rounded-lg border border-border bg-surface-container p-2"
              >
                <span className="text-lg">{l.product.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold">{l.product.name}</div>
                  <div className="mono text-[11px] text-muted-foreground">
                    {eur(l.product.price)} × {l.qty}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    className="flex size-6 items-center justify-center rounded border border-border hover:bg-surface-highest"
                    onClick={() => setQty(l.productId, -1)}
                  >
                    <Minus className="size-3" />
                  </button>
                  <span className="mono w-6 text-center text-xs">{l.qty}</span>
                  <button
                    className="flex size-6 items-center justify-center rounded border border-border hover:bg-surface-highest"
                    onClick={() => setQty(l.productId, 1)}
                  >
                    <Plus className="size-3" />
                  </button>
                </div>
                <span className="mono w-16 text-right text-xs font-bold">
                  {eur(l.product.price * l.qty)}
                </span>
              </div>
            ))}
          </div>
          )}

          <div className="mono space-y-1 border-t border-border pt-3 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotale</span>
            <span>{eur(subtotal)}</span>
          </div>
          <div className="flex items-center justify-between text-muted-foreground">
            <span>Sconto</span>
            <Input
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              className="h-7 w-24 text-right"
            />
          </div>
          <div className="flex items-baseline justify-between pt-2 text-xl font-bold">
            <span className="label-caps text-muted-foreground">Totale</span>
            <span>{eur(total)}</span>
          </div>
          </div>

          <Btn
          variant="primary"
          size="lg"
          disabled={cart.length === 0}
          onClick={() => setPayOpen(true)}
        >
          Incassa {eur(total)}
          </Btn>
        </div>
      </Panel>

      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title="Pagamento vendita bar"
        footer={
          <>
            <Btn variant="subtle" onClick={() => setPayOpen(false)}>
              Annulla
            </Btn>
            <Btn variant="primary" onClick={confirm}>
              Conferma incasso {eur(total)}
            </Btn>
          </>
        }
      >
        <div className="space-y-4">
          <div className="mono flex items-center justify-between rounded-lg border border-border bg-surface-container p-3">
            <span className="text-sm text-muted-foreground">
              {cart.reduce((s, l) => s + l.qty, 0)} articoli
            </span>
            <span className="text-2xl font-bold">{eur(total)}</span>
          </div>
          <Field label="Metodo di pagamento">
            <Select
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
            >
              <option value="contanti">Contanti</option>
              <option value="carta">Carta / POS</option>
              <option value="misto">Misto</option>
              <option value="omaggio">Omaggio</option>
            </Select>
          </Field>
          {method === "misto" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Quota contanti">
                <Input value={cash} onChange={(e) => setCash(e.target.value)} />
              </Field>
              <Field label="Quota carta">
                <Input readOnly value={cardPart.toFixed(2)} />
              </Field>
            </div>
          )}
          {method === "contanti" && (
            <p className="text-xs text-muted-foreground">
              Resto calcolato manualmente in cassa.
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
