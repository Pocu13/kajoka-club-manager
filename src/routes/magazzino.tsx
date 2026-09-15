import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Scale, Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import {
  Badge,
  Btn,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Panel,
  SegTabs,
  Select,
  StatCard,
} from "@/components/ui-kit";
import { stock, stockState, useCurrentUser, useDB } from "@/lib/store";
import { eur } from "@/lib/format";
import type { Product } from "@/lib/types";

export const Route = createFileRoute("/magazzino")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Magazzino e giacenze — KAJOKA" },
      {
        name: "description",
        content:
          "Gestione fisica delle scorte: carichi da fornitore, scarichi con causale e rettifiche inventario.",
      },
      { property: "og:title", content: "Magazzino e giacenze — KAJOKA" },
      {
        property: "og:description",
        content: "Gestione scorte e inventario del circolo KAJOKA.",
      },
    ],
  }),
  component: () => (
    <AppShell>
      <WarehousePage />
    </AppShell>
  ),
});

type Op = "carico" | "scarico" | "rettifica";

const CAUSES = [
  "Rottura / danneggiamento",
  "Scaduto",
  "Uso interno / staff",
  "Omaggio cliente",
  "Errore di registrazione",
];

function WarehousePage() {
  const db = useDB();
  const user = useCurrentUser();
  const isAdmin = user?.role === "admin";
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"tutti" | "sottoscorta" | "esaurito">("tutti");
  const [op, setOp] = useState<Op>("carico");
  const [target, setTarget] = useState<Product | null>(null);
  const [qty, setQty] = useState("1");
  const [cause, setCause] = useState(CAUSES[0] ?? "");
  const [supplier, setSupplier] = useState("");
  const [note, setNote] = useState("");

  const rows = db.products
    .filter((p) =>
      filter === "tutti"
        ? true
        : filter === "esaurito"
          ? stockState(p) === "esaurito"
          : stockState(p) !== "ok",
    )
    .filter(
      (p) =>
        !query.trim() ||
        p.name.toLowerCase().includes(query.toLowerCase()) ||
        p.sku.toLowerCase().includes(query.toLowerCase()),
    );

  const value = db.products.reduce((s, p) => s + p.stock * p.cost, 0);
  const low = db.products.filter((p) => stockState(p) === "sottoscorta").length;
  const out = db.products.filter((p) => stockState(p) === "esaurito").length;

  function openOp(p: Product, o: Op) {
    setTarget(p);
    setOp(o);
    setQty(o === "rettifica" ? String(p.stock) : "1");
    setCause(CAUSES[0] ?? "");
    setSupplier("");
    setNote("");
  }

  function confirm() {
    if (!target) return;
    const n = Number(qty);
    if (!Number.isFinite(n)) {
      toast.error("Quantità non valida");
      return;
    }
    if (op === "rettifica") {
      stock.adjust(target.id, n, note || "Rettifica inventario");
      toast.success(`Giacenza di ${target.name} rettificata a ${n}`);
    } else if (op === "carico") {
      stock.move({
        productId: target.id,
        type: "carico",
        qty: Math.abs(n),
        origin: supplier ? `Fornitore · ${supplier}` : "Carico fornitore",
        note,
      });
      toast.success(`Caricati ${Math.abs(n)} ${target.unit} di ${target.name}`);
    } else {
      if (target.stock - Math.abs(n) < 0 && !db.settings.negativeStock) {
        toast.error("Giacenza insufficiente");
        return;
      }
      stock.move({
        productId: target.id,
        type: "scarico",
        qty: -Math.abs(n),
        origin: `Scarico · ${cause}`,
        note,
      });
      toast.success(`Scaricati ${Math.abs(n)} ${target.unit} di ${target.name}`);
    }
    setTarget(null);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Magazzino"
        subtitle="Giacenze fisiche, carichi fornitore, scarichi con causale e rettifiche"
      >
        <div className="relative w-64">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Cerca prodotto…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <SegTabs
          value={filter}
          onChange={setFilter}
          options={[
            { value: "tutti", label: "Tutti" },
            { value: "sottoscorta", label: "Da riordinare" },
            { value: "esaurito", label: "Esauriti" },
          ]}
        />
        <Link to="/movimenti">
          <Btn variant="outline">Registro movimenti</Btn>
        </Link>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Articoli gestiti" value={String(db.products.length)} />
        {isAdmin && (
          <StatCard
            label="Valore magazzino"
            value={eur(value)}
            sub="valorizzato al costo d'acquisto"
          />
        )}
        <StatCard label="Sottoscorta" value={String(low)} sub="sotto la soglia minima" />
        <StatCard label="Esauriti" value={String(out)} sub="giacenza a zero" />
      </div>

      {low + out > 0 && (
        <Panel className="flex items-center gap-3 border-[#ffc107]/40 bg-[#ffc107]/5 p-4">
          <AlertTriangle className="size-5 text-warning" />
          <span className="text-sm">
            <b>{low + out} articoli</b> richiedono un riordino: verifica i carichi
            fornitore previsti.
          </span>
        </Panel>
      )}

      <Panel className="overflow-hidden p-0">
        {rows.length === 0 ? (
          <EmptyState label="Nessun articolo in questa vista." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-container">
                  {["Prodotto", "SKU", "Giacenza", "Minima", "Stato", "Operazioni"].map(
                    (h) => (
                      <th
                        key={h}
                        className="label-caps px-4 py-3 text-left text-muted-foreground"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const st = stockState(p);
                  return (
                    <tr
                      key={p.id}
                      className="border-b border-border last:border-0 hover:bg-surface-high/60"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{p.emoji}</span>
                          <div>
                            <div className="font-semibold">{p.name}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {p.category}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="mono px-4 py-3 text-muted-foreground">{p.sku}</td>
                      <td className="mono px-4 py-3 text-base font-bold">
                        {p.stock} <span className="text-xs font-normal">{p.unit}</span>
                      </td>
                      <td className="mono px-4 py-3 text-muted-foreground">
                        {p.minStock}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          tone={
                            st === "ok"
                              ? "success"
                              : st === "sottoscorta"
                                ? "warning"
                                : "danger"
                          }
                          dot
                        >
                          {st === "ok"
                            ? "OK"
                            : st === "sottoscorta"
                              ? "SOTTOSCORTA"
                              : "ESAURITO"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <Btn size="sm" variant="outline" onClick={() => openOp(p, "carico")}>
                            <ArrowDownToLine className="size-3.5" /> Carico
                          </Btn>
                          <Btn size="sm" variant="outline" onClick={() => openOp(p, "scarico")}>
                            <ArrowUpFromLine className="size-3.5" /> Scarico
                          </Btn>
                          <Btn
                            size="sm"
                            variant="subtle"
                            onClick={() => openOp(p, "rettifica")}
                          >
                            <Scale className="size-3.5" /> Rettifica
                          </Btn>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Modal
        open={!!target}
        onClose={() => setTarget(null)}
        title={
          op === "carico"
            ? "Carico da fornitore"
            : op === "scarico"
              ? "Scarico manuale"
              : "Rettifica inventario"
        }
        footer={
          <>
            <Btn variant="subtle" onClick={() => setTarget(null)}>
              Annulla
            </Btn>
            <Btn variant="primary" onClick={confirm}>
              Conferma operazione
            </Btn>
          </>
        }
      >
        {target && (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-border bg-surface-container p-3">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <span className="text-lg">{target.emoji}</span> {target.name}
              </span>
              <span className="mono text-sm text-muted-foreground">
                attuale: {target.stock} {target.unit}
              </span>
            </div>
            <Field
              label={op === "rettifica" ? "Nuova giacenza reale" : "Quantità"}
            >
              <Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
            </Field>
            {op === "carico" && (
              <Field label="Fornitore">
                <Input
                  placeholder="es. Beverage Italia Srl"
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                />
              </Field>
            )}
            {op === "scarico" && (
              <Field label="Causale">
                <Select value={cause} onChange={(e) => setCause(e.target.value)}>
                  {CAUSES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Note">
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <p className="text-xs text-muted-foreground">
              L'operazione genera un movimento tracciato e aggiorna subito la giacenza.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
