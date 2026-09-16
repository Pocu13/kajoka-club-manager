import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import {
  Badge,
  Btn,
  Drawer,
  EmptyState,
  Input,
  Modal,
  PageHeader,
  Panel,
  Select,
  StatCard,
  Toggle,
} from "@/components/ui-kit";
import { sales, useCurrentUser, useDB } from "@/lib/store";
import { eur, fmtDateTime } from "@/lib/format";
import type { PaymentMethod, Transaction } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/storico")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Storico operazioni — KAJOKA" },
      {
        name: "description",
        content:
          "Tutte le vendite bar e i pagamenti campo registrati, con dettaglio scontrino e annullamenti.",
      },
      { property: "og:title", content: "Storico operazioni — KAJOKA" },
      {
        property: "og:description",
        content: "Registro economico completo di incassi, metodi di pagamento e storni.",
      },
    ],
  }),
  component: () => (
    <AppShell>
      <HistoryPage />
    </AppShell>
  ),
});

const METHODS: Record<PaymentMethod, string> = {
  contanti: "Contanti",
  carta: "Carta",
  misto: "Misto",
  omaggio: "Omaggio",
};

function HistoryPage() {
  const db = useDB();
  const user = useCurrentUser();
  const isAdmin = user?.role === "admin";
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"tutti" | "bar" | "campo">("tutti");
  const [method, setMethod] = useState<"tutti" | PaymentMethod>("tutti");
  const [period, setPeriod] = useState<"oggi" | "7" | "30" | "tutto">("7");
  const [detail, setDetail] = useState<Transaction | null>(null);
  const [cancelling, setCancelling] = useState<Transaction | null>(null);
  const [restore, setRestore] = useState(true);
  const [reason, setReason] = useState("");
  const [limit, setLimit] = useState(50);

  const now = Date.now();
  const cutoff =
    period === "oggi"
      ? new Date(new Date().setHours(0, 0, 0, 0)).getTime()
      : period === "7"
        ? now - 7 * 864e5
        : period === "30"
          ? now - 30 * 864e5
          : 0;

  const rows = db.transactions
    .filter((t) => new Date(t.ts).getTime() >= cutoff)
    .filter((t) => (kind === "tutti" ? true : t.kind === kind))
    .filter((t) => (method === "tutti" ? true : t.method === method))
    .filter(
      (t) =>
        !query.trim() ||
        t.id.toLowerCase().includes(query.toLowerCase()) ||
        t.label.toLowerCase().includes(query.toLowerCase()) ||
        t.operatorName.toLowerCase().includes(query.toLowerCase()),
    );

  const valid = rows.filter((t) => !t.cancelled);
  const total = valid.reduce((s, t) => s + t.amount, 0);
  const cash = valid.reduce((s, t) => s + t.cash, 0);
  const card = valid.reduce((s, t) => s + t.card, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Storico operazioni"
        subtitle="Vendite bar, quote campo ed extra: ogni incasso registrato è consultabile e annullabile"
      >
        <div className="relative w-64">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Cerca numero, campo, operatore…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={period}
          onChange={(e) => setPeriod(e.target.value as typeof period)}
          className="w-36"
        >
          <option value="oggi">Oggi</option>
          <option value="7">Ultimi 7 giorni</option>
          <option value="30">Ultimi 30 giorni</option>
          <option value="tutto">Tutto</option>
        </Select>
        <Select
          value={kind}
          onChange={(e) => setKind(e.target.value as typeof kind)}
          className="w-36"
        >
          <option value="tutti">Tutte le origini</option>
          <option value="bar">Bar / POS</option>
          <option value="campo">Campi</option>
        </Select>
        <Select
          value={method}
          onChange={(e) => setMethod(e.target.value as typeof method)}
          className="w-36"
        >
          <option value="tutti">Tutti i metodi</option>
          {Object.entries(METHODS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Operazioni" value={String(valid.length)} />
        <StatCard label="Incasso totale" value={eur(total)} tone="primary" />
        <StatCard label="Contanti" value={eur(cash)} />
        <StatCard label="Carta" value={eur(card)} />
      </div>

      <Panel className="overflow-hidden p-0">
        {rows.length === 0 ? (
          <EmptyState label="Nessuna operazione nel periodo selezionato." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-container">
                  {[
                    "Numero",
                    "Data e ora",
                    "Descrizione",
                    "Origine",
                    "Metodo",
                    "Operatore",
                    "Importo",
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
                {rows.slice(0, limit).map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => setDetail(t)}
                    className={cn(
                      "cursor-pointer border-b border-border last:border-0 hover:bg-surface-high/60",
                      t.cancelled && "opacity-50",
                    )}
                  >
                    <td className="mono px-4 py-3 font-semibold">{t.id}</td>
                    <td className="mono px-4 py-3 text-muted-foreground">
                      {fmtDateTime(t.ts)}
                    </td>
                    <td className="px-4 py-3">{t.label}</td>
                    <td className="px-4 py-3">
                      <Badge tone={t.kind === "bar" ? "info" : "primary"}>
                        {t.kind === "bar" ? "Bar" : "Campo"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {METHODS[t.method]}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{t.operatorName}</td>
                    <td className="mono px-4 py-3 font-bold">{eur(t.amount)}</td>
                    <td className="px-4 py-3 text-right">
                      {t.cancelled && <Badge tone="danger">ANNULLATA</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > limit && (
              <div className="border-t border-border p-3 text-center">
                <Btn variant="subtle" size="sm" onClick={() => setLimit((l) => l + 50)}>
                  Carica altre operazioni ({rows.length - limit} rimanenti)
                </Btn>
              </div>
            )}
          </div>
        )}
      </Panel>

      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.id ?? ""}
        subtitle={detail ? fmtDateTime(detail.ts) : ""}
        footer={
          detail && !detail.cancelled && isAdmin ? (
            <Btn
              variant="danger"
              className="w-full"
              onClick={() => {
                setCancelling(detail);
                setReason("");
                setRestore(true);
                setDetail(null);
              }}
            >
              Annulla operazione
            </Btn>
          ) : undefined
        }
      >
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge tone={detail.kind === "bar" ? "info" : "primary"}>
                {detail.kind === "bar" ? "Bar / POS" : "Campo"}
              </Badge>
              <Badge>{METHODS[detail.method]}</Badge>
              {detail.cancelled && <Badge tone="danger">ANNULLATA</Badge>}
            </div>
            <div className="text-sm">{detail.label}</div>

            <Panel className="divide-y divide-border p-0">
              {detail.items.length === 0 ? (
                <div className="px-4 py-3 text-sm text-muted-foreground">
                  Nessun prodotto: solo quota campo.
                </div>
              ) : (
                detail.items.map((i, idx) => (
                  <div
                    key={`${i.productId}-${idx}`}
                    className="flex items-center justify-between px-4 py-2.5 text-sm"
                  >
                    <span>
                      <span className="mono text-muted-foreground">{i.qty}×</span>{" "}
                      {i.name}
                    </span>
                    <span className="mono">{eur(i.price * i.qty)}</span>
                  </div>
                ))
              )}
            </Panel>

            <div className="space-y-1.5 text-sm">
              <Row label="Subtotale" value={eur(detail.subtotal)} />
              {detail.discount > 0 && (
                <Row label="Sconto" value={"− " + eur(detail.discount)} />
              )}
              <Row label="Contanti" value={eur(detail.cash)} />
              <Row label="Carta" value={eur(detail.card)} />
              <div className="flex items-center justify-between border-t border-border pt-2 text-base font-bold">
                <span>Totale</span>
                <span className="mono text-primary">{eur(detail.amount)}</span>
              </div>
            </div>

            <div className="text-xs text-muted-foreground">
              Operatore: {detail.operatorName}
              {detail.note && <div className="mt-1">{detail.note}</div>}
              {detail.cancelReason && (
                <div className="mt-1 text-danger">
                  Annullata: {detail.cancelReason}
                </div>
              )}
            </div>
          </div>
        )}
      </Drawer>

      <Modal
        open={!!cancelling}
        onClose={() => setCancelling(null)}
        title="Annulla operazione"
        footer={
          <>
            <Btn variant="subtle" onClick={() => setCancelling(null)}>
              Indietro
            </Btn>
            <Btn
              variant="danger"
              onClick={() => {
                if (cancelling)
                  sales.cancel(cancelling.id, restore, reason || "Annullata da operatore");
                setCancelling(null);
                toast.success("Operazione annullata");
              }}
            >
              Conferma annullamento
            </Btn>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            L&apos;operazione <b className="text-foreground">{cancelling?.id}</b> da{" "}
            <b className="text-foreground">{cancelling ? eur(cancelling.amount) : ""}</b>{" "}
            resta nello storico contrassegnata come annullata e non viene più conteggiata
            negli incassi.
          </p>
          <Toggle
            checked={restore}
            onChange={setRestore}
            label="Ripristina le giacenze"
            hint="Genera movimenti di storno che rimettono i prodotti in magazzino."
          />
          <Input
            placeholder="Motivo dell'annullamento"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      </Modal>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="mono">{value}</span>
    </div>
  );
}
