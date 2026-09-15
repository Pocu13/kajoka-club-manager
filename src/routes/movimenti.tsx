import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Search, Undo2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import {
  Badge,
  Btn,
  EmptyState,
  Input,
  Modal,
  PageHeader,
  Panel,
  Select,
  StatCard,
} from "@/components/ui-kit";
import { stock, useCurrentUser, useDB } from "@/lib/store";
import { fmtDateTime } from "@/lib/format";
import type { Movement, MovementType } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/movimenti")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Movimenti di magazzino — KAJOKA" },
      {
        name: "description",
        content:
          "Registro completo di carichi, scarichi, vendite, rettifiche e storni delle giacenze.",
      },
      { property: "og:title", content: "Movimenti di magazzino — KAJOKA" },
      {
        property: "og:description",
        content: "Registro tracciato di tutte le variazioni di giacenza.",
      },
    ],
  }),
  component: () => (
    <AppShell>
      <MovementsPage />
    </AppShell>
  ),
});

const LABELS: Record<MovementType, string> = {
  carico: "Carico",
  scarico: "Scarico",
  rettifica: "Rettifica",
  vendita_pos: "Vendita POS",
  prodotto_campo: "Extra campo",
  storno: "Storno",
};

function MovementsPage() {
  const db = useDB();
  const user = useCurrentUser();
  const [query, setQuery] = useState("");
  const [type, setType] = useState<"tutti" | MovementType>("tutti");
  const [toCancel, setToCancel] = useState<Movement | null>(null);
  const [limit, setLimit] = useState(60);

  const rows = db.movements
    .filter((m) => (type === "tutti" ? true : m.type === type))
    .filter(
      (m) =>
        !query.trim() ||
        m.productName.toLowerCase().includes(query.toLowerCase()) ||
        m.sku.toLowerCase().includes(query.toLowerCase()) ||
        m.ref.toLowerCase().includes(query.toLowerCase()),
    );

  const today = new Date().toDateString();
  const todayRows = db.movements.filter((m) => new Date(m.ts).toDateString() === today);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Movimenti magazzino"
        subtitle={`${db.movements.length} movimenti registrati · ogni variazione di giacenza è tracciata`}
      >
        <div className="relative w-64">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Cerca prodotto o riferimento…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={type}
          onChange={(e) => setType(e.target.value as typeof type)}
          className="w-48"
        >
          <option value="tutti">Tutti i tipi</option>
          {Object.entries(LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Movimenti oggi" value={String(todayRows.length)} />
        <StatCard
          label="Carichi oggi"
          value={String(todayRows.filter((m) => m.qty > 0 && m.type === "carico").length)}
        />
        <StatCard
          label="Scarichi oggi"
          value={String(todayRows.filter((m) => m.qty < 0).length)}
        />
        <StatCard
          label="Storni"
          value={String(db.movements.filter((m) => m.type === "storno").length)}
        />
      </div>

      <Panel className="overflow-hidden p-0">
        {rows.length === 0 ? (
          <EmptyState label="Nessun movimento corrisponde ai filtri." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-container">
                  {[
                    "Data e ora",
                    "Prodotto",
                    "Tipo",
                    "Qtà",
                    "Prima → Dopo",
                    "Origine",
                    "Rif.",
                    "Operatore",
                    "",
                  ].map((h) => (
                    <th
                      key={h}
                      className="label-caps px-4 py-3 text-left text-muted-foreground"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, limit).map((m) => (
                  <tr
                    key={m.id}
                    className={cn(
                      "border-b border-border last:border-0 hover:bg-surface-high/60",
                      m.cancelled && "opacity-50",
                    )}
                  >
                    <td className="mono px-4 py-3 text-muted-foreground">
                      {fmtDateTime(m.ts)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold">{m.productName}</div>
                      <div className="mono text-[11px] text-muted-foreground">{m.sku}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        tone={
                          m.type === "carico"
                            ? "success"
                            : m.type === "storno"
                              ? "warning"
                              : m.type === "rettifica"
                                ? "info"
                                : "neutral"
                        }
                      >
                        {LABELS[m.type]}
                      </Badge>
                    </td>
                    <td
                      className={cn(
                        "mono px-4 py-3 font-bold",
                        m.qty > 0 ? "text-success" : "text-danger",
                      )}
                    >
                      {m.qty > 0 ? "+" : ""}
                      {m.qty}
                    </td>
                    <td className="mono px-4 py-3 text-muted-foreground">
                      {m.before} → {m.after}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{m.origin}</td>
                    <td className="mono px-4 py-3 text-muted-foreground">{m.ref}</td>
                    <td className="px-4 py-3 text-muted-foreground">{m.operatorName}</td>
                    <td className="px-4 py-3 text-right">
                      {m.cancelled ? (
                        <Badge tone="danger">ANNULLATO</Badge>
                      ) : (
                        user?.role === "admin" &&
                        m.type !== "storno" && (
                          <button
                            className="flex items-center gap-1 text-xs text-danger"
                            onClick={() => setToCancel(m)}
                          >
                            <Undo2 className="size-3" /> Annulla
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > limit && (
              <div className="border-t border-border p-3 text-center">
                <Btn variant="subtle" size="sm" onClick={() => setLimit((l) => l + 60)}>
                  Carica altri movimenti ({rows.length - limit} rimanenti)
                </Btn>
              </div>
            )}
          </div>
        )}
      </Panel>

      <Modal
        open={!!toCancel}
        onClose={() => setToCancel(null)}
        title="Annulla movimento"
        footer={
          <>
            <Btn variant="subtle" onClick={() => setToCancel(null)}>
              Indietro
            </Btn>
            <Btn
              variant="danger"
              onClick={() => {
                if (toCancel) stock.cancelMovement(toCancel.id);
                setToCancel(null);
                toast.success("Movimento annullato con storno automatico");
              }}
            >
              Annulla movimento
            </Btn>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          Il movimento resta nello storico e viene generato un movimento inverso di
          storno che riporta la giacenza di{" "}
          <b className="text-foreground">{toCancel?.productName}</b> al valore
          precedente.
        </p>
      </Modal>
    </div>
  );
}
