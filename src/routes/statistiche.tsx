import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/app-shell";
import {
  Badge,
  EmptyState,
  PageHeader,
  Panel,
  SegTabs,
  StatCard,
} from "@/components/ui-kit";
import { useCurrentUser, useDB } from "@/lib/store";
import { eur, eurShort, pct } from "@/lib/format";

export const Route = createFileRoute("/statistiche")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Statistiche del circolo — KAJOKA" },
      {
        name: "description",
        content:
          "Andamento incassi, mix bar e campi, prodotti più venduti e metodi di pagamento in tempo reale.",
      },
      { property: "og:title", content: "Statistiche del circolo — KAJOKA" },
      {
        property: "og:description",
        content: "Numeri calcolati sui dati reali di vendite, campi e magazzino.",
      },
    ],
  }),
  component: () => (
    <AppShell>
      <StatsPage />
    </AppShell>
  ),
});

type Tab = "panoramica" | "bar" | "campi" | "prodotti" | "pagamenti";
type Period = "oggi" | "7" | "30" | "mese";

const COLORS = ["#ff4d00", "#5b9dff", "#00e676", "#ffc107", "#ff5a52", "#b388ff"];

const chartTooltip = {
  contentStyle: {
    background: "#1c1b1b",
    border: "1px solid rgba(255,255,255,0.09)",
    borderRadius: 10,
    fontSize: 12,
    color: "#e5e2e1",
  },
};

function StatsPage() {
  const db = useDB();
  const user = useCurrentUser();
  const isAdmin = user?.role === "admin";
  const [tab, setTab] = useState<Tab>("panoramica");
  const [period, setPeriod] = useState<Period>("7");

  const data = useMemo(() => {
    const now = new Date();
    let from: number;
    if (period === "oggi") from = new Date(now).setHours(0, 0, 0, 0);
    else if (period === "7") from = Date.now() - 7 * 864e5;
    else if (period === "30") from = Date.now() - 30 * 864e5;
    else from = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    const tx = db.transactions.filter(
      (t) => !t.cancelled && new Date(t.ts).getTime() >= from,
    );
    const bar = tx.filter((t) => t.kind === "bar");
    const campi = tx.filter((t) => t.kind === "campo");
    const revenue = tx.reduce((s, t) => s + t.amount, 0);
    const cost = tx.reduce(
      (s, t) => s + t.items.reduce((c, i) => c + i.cost * i.qty, 0),
      0,
    );

    const days: { label: string; bar: number; campi: number; totale: number }[] = [];
    const span = period === "oggi" ? 1 : period === "7" ? 7 : 30;
    for (let i = span - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toDateString();
      const dayTx = tx.filter((t) => new Date(t.ts).toDateString() === key);
      days.push({
        label: `${d.getDate()}/${d.getMonth() + 1}`,
        bar: Math.round(
          dayTx.filter((t) => t.kind === "bar").reduce((s, t) => s + t.amount, 0),
        ),
        campi: Math.round(
          dayTx.filter((t) => t.kind === "campo").reduce((s, t) => s + t.amount, 0),
        ),
        totale: Math.round(dayTx.reduce((s, t) => s + t.amount, 0)),
      });
    }

    const byProduct = new Map<
      string,
      { name: string; qty: number; revenue: number; margin: number }
    >();
    for (const t of tx)
      for (const i of t.items) {
        const e = byProduct.get(i.productId) ?? {
          name: i.name,
          qty: 0,
          revenue: 0,
          margin: 0,
        };
        e.qty += i.qty;
        e.revenue += i.price * i.qty;
        e.margin += (i.price - i.cost) * i.qty;
        byProduct.set(i.productId, e);
      }
    const products = [...byProduct.values()].sort((a, b) => b.revenue - a.revenue);

    const byCourt = db.courts.map((c) => {
      const list = campi.filter((t) => t.courtId === c.id);
      return {
        name: c.name,
        type: c.type,
        revenue: list.reduce((s, t) => s + t.amount, 0),
        sessions: list.length,
      };
    });
    const maxCourt = Math.max(1, ...byCourt.map((c) => c.sessions));

    const methods = (["contanti", "carta", "misto", "omaggio"] as const).map((m) => ({
      name: m[0]!.toUpperCase() + m.slice(1),
      value: Math.round(
        tx.filter((t) => t.method === m).reduce((s, t) => s + t.amount, 0),
      ),
      count: tx.filter((t) => t.method === m).length,
    }));

    const byCategory = new Map<string, number>();
    for (const t of bar)
      for (const i of t.items) {
        const p = db.products.find((x) => x.id === i.productId);
        const cat = p?.category ?? "Altro";
        byCategory.set(cat, (byCategory.get(cat) ?? 0) + i.price * i.qty);
      }

    return {
      tx,
      bar,
      campi,
      revenue,
      cost,
      days,
      products,
      byCourt,
      maxCourt,
      methods,
      categories: [...byCategory.entries()]
        .map(([name, value]) => ({ name, value: Math.round(value) }))
        .sort((a, b) => b.value - a.value),
    };
  }, [db, period]);

  const avgTicket = data.tx.length ? data.revenue / data.tx.length : 0;
  const margin = data.revenue - data.cost;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Statistiche"
        subtitle="Tutti i numeri sono calcolati sulle operazioni realmente registrate"
      >
        <SegTabs
          value={period}
          onChange={setPeriod}
          options={[
            { value: "oggi", label: "Oggi" },
            { value: "7", label: "7 giorni" },
            { value: "30", label: "30 giorni" },
            { value: "mese", label: "Mese" },
          ]}
        />
      </PageHeader>

      <SegTabs
        value={tab}
        onChange={setTab}
        options={[
          { value: "panoramica", label: "Panoramica" },
          { value: "bar", label: "Bar" },
          { value: "campi", label: "Campi" },
          { value: "prodotti", label: "Prodotti" },
          { value: "pagamenti", label: "Pagamenti" },
        ]}
      />

      {data.tx.length === 0 ? (
        <Panel className="p-6">
          <EmptyState label="Nessuna operazione nel periodo selezionato." />
        </Panel>
      ) : tab === "panoramica" ? (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Incasso totale" value={eur(data.revenue)} tone="primary" />
            <StatCard label="Operazioni" value={String(data.tx.length)} />
            <StatCard label="Scontrino medio" value={eur(avgTicket)} />
            {isAdmin ? (
              <StatCard
                label="Margine lordo"
                value={eur(margin)}
                sub={data.revenue > 0 ? pct((margin / data.revenue) * 100) : undefined}
              />
            ) : (
              <StatCard
                label="Incasso campi"
                value={eur(data.campi.reduce((s, t) => s + t.amount, 0))}
              />
            )}
          </div>

          <Panel className="p-5">
            <h2 className="label-caps mb-4 text-muted-foreground">Andamento incassi</h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.days}>
                  <defs>
                    <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ff4d00" stopOpacity={0.55} />
                      <stop offset="100%" stopColor="#ff4d00" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke="#8d8a89"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="#8d8a89"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => eurShort(v)}
                  />
                  <Tooltip
                    {...chartTooltip}
                    formatter={(v: number) => eur(Number(v))}
                  />
                  <Area
                    type="monotone"
                    dataKey="totale"
                    stroke="#ff4d00"
                    strokeWidth={2}
                    fill="url(#g1)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Panel className="p-5">
              <h2 className="label-caps mb-4 text-muted-foreground">Bar vs Campi</h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.days}>
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis dataKey="label" stroke="#8d8a89" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="#8d8a89" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip {...chartTooltip} formatter={(v: number) => eur(Number(v))} />
                    <Bar dataKey="bar" stackId="a" fill="#5b9dff" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="campi" stackId="a" fill="#ff4d00" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel className="p-5">
              <h2 className="label-caps mb-4 text-muted-foreground">Top prodotti</h2>
              <div className="space-y-3">
                {data.products.slice(0, 6).map((p) => (
                  <div key={p.name} className="flex items-center justify-between text-sm">
                    <span className="truncate">{p.name}</span>
                    <span className="mono text-muted-foreground">
                      {p.qty}× · {eur(p.revenue)}
                    </span>
                  </div>
                ))}
                {data.products.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nessun prodotto venduto.</p>
                )}
              </div>
            </Panel>
          </div>
        </div>
      ) : tab === "bar" ? (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Incasso bar"
              value={eur(data.bar.reduce((s, t) => s + t.amount, 0))}
              tone="primary"
            />
            <StatCard label="Vendite" value={String(data.bar.length)} />
            <StatCard
              label="Scontrino medio bar"
              value={eur(
                data.bar.length
                  ? data.bar.reduce((s, t) => s + t.amount, 0) / data.bar.length
                  : 0,
              )}
            />
            <StatCard
              label="Pezzi venduti"
              value={String(
                data.bar.reduce(
                  (s, t) => s + t.items.reduce((q, i) => q + i.qty, 0),
                  0,
                ),
              )}
            />
          </div>
          <Panel className="p-5">
            <h2 className="label-caps mb-4 text-muted-foreground">Incasso per categoria</h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.categories} layout="vertical">
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" horizontal={false} />
                  <XAxis type="number" stroke="#8d8a89" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={130}
                    stroke="#8d8a89"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip {...chartTooltip} formatter={(v: number) => eur(Number(v))} />
                  <Bar dataKey="value" fill="#ff4d00" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </div>
      ) : tab === "campi" ? (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Incasso campi"
              value={eur(data.campi.reduce((s, t) => s + t.amount, 0))}
              tone="primary"
            />
            <StatCard label="Pagamenti campo" value={String(data.campi.length)} />
            <StatCard
              label="Sessioni aperte"
              value={String(db.sessions.filter((s) => !s.closed).length)}
            />
            <StatCard label="Campi attivi" value={String(db.courts.length)} />
          </div>
          <Panel className="p-5">
            <h2 className="label-caps mb-4 text-muted-foreground">Utilizzo campi</h2>
            <div className="space-y-4">
              {data.byCourt.map((c) => (
                <div key={c.name}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      {c.name}
                      <Badge tone="neutral">{c.type}</Badge>
                    </span>
                    <span className="mono text-muted-foreground">
                      {c.sessions} pagamenti · {eur(c.revenue)}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-high">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${(c.sessions / data.maxCourt) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      ) : tab === "prodotti" ? (
        <Panel className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-container">
                  {["Prodotto", "Pezzi", "Ricavo", ...(isAdmin ? ["Margine"] : [])].map(
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
                {data.products.map((p) => (
                  <tr key={p.name} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium">{p.name}</td>
                    <td className="mono px-4 py-3 text-muted-foreground">{p.qty}</td>
                    <td className="mono px-4 py-3 font-semibold">{eur(p.revenue)}</td>
                    {isAdmin && (
                      <td className="mono px-4 py-3 text-success">{eur(p.margin)}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Panel className="p-5">
            <h2 className="label-caps mb-4 text-muted-foreground">Mix metodi di pagamento</h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.methods.filter((m) => m.value > 0)}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={65}
                    outerRadius={105}
                    paddingAngle={3}
                  >
                    {data.methods
                      .filter((m) => m.value > 0)
                      .map((m, i) => (
                        <Cell key={m.name} fill={COLORS[i % COLORS.length]} />
                      ))}
                  </Pie>
                  <Tooltip {...chartTooltip} formatter={(v: number) => eur(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <Panel className="p-5">
            <h2 className="label-caps mb-4 text-muted-foreground">Dettaglio incassi</h2>
            <div className="space-y-3">
              {data.methods.map((m, i) => (
                <div key={m.name} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span
                      className="size-2.5 rounded-full"
                      style={{ background: COLORS[i % COLORS.length] }}
                    />
                    {m.name}
                  </span>
                  <span className="mono text-muted-foreground">
                    {m.count} op. · {eur(m.value)}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-border pt-3 font-bold">
                <span>Totale</span>
                <span className="mono text-primary">{eur(data.revenue)}</span>
              </div>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
