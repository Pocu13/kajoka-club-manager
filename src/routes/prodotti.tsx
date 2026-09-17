import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Search, Star, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import {
  Badge,
  Btn,
  Drawer,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Panel,
  Select,
  Toggle,
} from "@/components/ui-kit";
import { catalog, stockState, useCurrentUser, useDB } from "@/lib/store";
import { eur, pct } from "@/lib/format";
import type { Product } from "@/lib/types";

export const Route = createFileRoute("/prodotti")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Catalogo prodotti — KAJOKA" },
      {
        name: "description",
        content:
          "Anagrafica master dei prodotti del bar e pro shop: prezzi, costi, categorie e visibilità in cassa.",
      },
      { property: "og:title", content: "Catalogo prodotti — KAJOKA" },
      {
        property: "og:description",
        content: "Anagrafica prodotti bar e pro shop del circolo KAJOKA.",
      },
    ],
  }),
  component: () => (
    <AppShell>
      <ProductsPage />
    </AppShell>
  ),
});

const blank = (): Omit<Product, "id"> => ({
  name: "",
  sku: "",
  category: "Bibite",
  description: "",
  cost: 0,
  price: 0,
  stock: 0,
  minStock: 5,
  unit: "pz",
  active: true,
  posVisible: true,
  favorite: false,
  emoji: "🥤",
});

function ProductsPage() {
  const db = useDB();
  const user = useCurrentUser();
  const isAdmin = user?.role === "admin";
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("Tutte");
  const [editing, setEditing] = useState<Product | null>(null);
  const [draft, setDraft] = useState<Omit<Product, "id">>(blank());
  const [open, setOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Product | null>(null);

  const categories = ["Tutte", ...Array.from(new Set(db.products.map((p) => p.category)))];
  const rows = db.products
    .filter((p) => (cat === "Tutte" ? true : p.category === cat))
    .filter(
      (p) =>
        !query.trim() ||
        p.name.toLowerCase().includes(query.toLowerCase()) ||
        p.sku.toLowerCase().includes(query.toLowerCase()),
    );

  function openNew() {
    setEditing(null);
    setDraft(blank());
    setOpen(true);
  }
  function openEdit(p: Product) {
    setEditing(p);
    const { id: _id, ...rest } = p;
    setDraft(rest);
    setOpen(true);
  }
  function save() {
    if (!draft.name.trim()) {
      toast.error("Il nome prodotto è obbligatorio");
      return;
    }
    if (editing) {
      catalog.update(editing.id, draft);
      toast.success("Prodotto aggiornato");
    } else {
      catalog.create(draft);
      toast.success("Prodotto creato");
    }
    setOpen(false);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Catalogo prodotti"
        subtitle={`${db.products.length} articoli a listino · ${db.products.filter((p) => p.posVisible).length} visibili in cassa`}
      >
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Cerca nome o SKU…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={cat} onChange={(e) => setCat(e.target.value)} className="min-w-0 flex-1 sm:w-44 sm:flex-none">
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
        <Btn variant="primary" onClick={openNew} className="flex-1 sm:flex-none">
          <Plus className="size-4" /> Nuovo prodotto
        </Btn>
      </PageHeader>

      <Panel className="overflow-hidden p-0">
        {rows.length === 0 ? (
          <EmptyState label="Nessun prodotto trovato." />
        ) : (
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-container">
                  {[
                    "Prodotto",
                    "SKU",
                    "Categoria",
                    ...(isAdmin ? ["Costo"] : []),
                    "Prezzo",
                    ...(isAdmin ? ["Margine"] : []),
                    "Giacenza",
                    "Stato",
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
                {rows.map((p) => {
                  const st = stockState(p);
                  const margin = p.price > 0 ? ((p.price - p.cost) / p.price) * 100 : 0;
                  return (
                    <tr
                      key={p.id}
                      className="border-b border-border last:border-0 hover:bg-surface-high/60"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{p.emoji}</span>
                          <div>
                            <div className="flex items-center gap-1.5 font-semibold">
                              {p.name}
                              {p.favorite && (
                                <Star className="size-3 fill-primary text-primary" />
                              )}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {p.active ? "Attivo" : "Disattivato"} ·{" "}
                              {p.posVisible ? "in cassa" : "non in cassa"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="mono px-4 py-3 text-muted-foreground">{p.sku}</td>
                      <td className="px-4 py-3">{p.category}</td>
                      {isAdmin && (
                        <td className="mono px-4 py-3 text-muted-foreground">
                          {eur(p.cost)}
                        </td>
                      )}
                      <td className="mono px-4 py-3 font-bold">{eur(p.price)}</td>
                      {isAdmin && (
                        <td className="mono px-4 py-3 text-success">{pct(margin)}</td>
                      )}
                      <td className="mono px-4 py-3">
                        {p.stock} {p.unit}
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
                        <div className="flex justify-end gap-1">
                          <button
                            className="rounded-md border border-border p-1.5 hover:bg-surface-highest"
                            onClick={() => openEdit(p)}
                          >
                            <Pencil className="size-3.5" />
                          </button>
                          {isAdmin && (
                            <button
                              className="rounded-md border border-border p-1.5 text-danger hover:bg-surface-highest"
                              onClick={() => setToDelete(p)}
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="divide-y divide-border md:hidden">
            {rows.map((p) => {
              const st = stockState(p);
              const margin = p.price > 0 ? ((p.price - p.cost) / p.price) * 100 : 0;
              return (
                <article key={p.id} className="p-4">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                    <div className="flex min-w-0 gap-3">
                      <span className="text-2xl">{p.emoji}</span>
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <h2 className="truncate text-base font-semibold">{p.name}</h2>
                          {p.favorite && <Star className="size-3 shrink-0 fill-primary text-primary" />}
                        </div>
                        <div className="mono mt-0.5 text-[11px] text-muted-foreground">{p.sku} · {p.category}</div>
                      </div>
                    </div>
                    <Badge tone={st === "ok" ? "success" : st === "sottoscorta" ? "warning" : "danger"} dot>
                      {st === "ok" ? "OK" : st === "sottoscorta" ? "BASSA" : "ESAURITO"}
                    </Badge>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 border-y border-border py-3">
                    <div><div className="label-caps text-muted-foreground">Prezzo</div><div className="mono mt-1 font-bold">{eur(p.price)}</div></div>
                    <div><div className="label-caps text-muted-foreground">Giacenza</div><div className="mono mt-1">{p.stock} {p.unit}</div></div>
                    <div><div className="label-caps text-muted-foreground">{isAdmin ? "Margine" : "Cassa"}</div><div className="mono mt-1 text-success">{isAdmin ? pct(margin) : p.posVisible ? "SÌ" : "NO"}</div></div>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{p.active ? "Attivo" : "Disattivato"} · {p.posVisible ? "in cassa" : "non in cassa"}</span>
                    <div className="flex gap-2">
                      <Btn variant="outline" size="sm" onClick={() => openEdit(p)} aria-label={`Modifica ${p.name}`}><Pencil className="size-3.5" /> Modifica</Btn>
                      {isAdmin && <Btn variant="subtle" size="sm" onClick={() => setToDelete(p)} aria-label={`Elimina ${p.name}`}><Trash2 className="size-3.5 text-danger" /></Btn>}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Panel>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Modifica prodotto" : "Nuovo prodotto"}
        subtitle={editing ? editing.sku : "Anagrafica master del catalogo"}
        footer={
          <div className="flex gap-2">
            <Btn variant="subtle" className="flex-1" onClick={() => setOpen(false)}>
              Annulla
            </Btn>
            <Btn variant="primary" className="flex-1" onClick={save}>
              Salva prodotto
            </Btn>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-[72px_1fr] gap-3">
            <Field label="Icona">
              <Input
                value={draft.emoji}
                onChange={(e) => setDraft({ ...draft, emoji: e.target.value })}
                className="text-center text-xl"
              />
            </Field>
            <Field label="Nome prodotto">
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="SKU">
              <Input
                value={draft.sku}
                onChange={(e) => setDraft({ ...draft, sku: e.target.value })}
              />
            </Field>
            <Field label="Categoria">
              <Input
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Descrizione">
            <Input
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Costo (€)">
              <Input
                type="number"
                step="0.01"
                value={draft.cost}
                disabled={!isAdmin}
                onChange={(e) => setDraft({ ...draft, cost: Number(e.target.value) })}
              />
            </Field>
            <Field label="Prezzo (€)">
              <Input
                type="number"
                step="0.01"
                value={draft.price}
                disabled={db.settings.lockPriceEdit && !isAdmin}
                onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) })}
              />
            </Field>
            <Field label="Unità">
              <Input
                value={draft.unit}
                onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Giacenza iniziale">
              <Input
                type="number"
                value={draft.stock}
                disabled={!!editing}
                onChange={(e) => setDraft({ ...draft, stock: Number(e.target.value) })}
              />
            </Field>
            <Field label="Scorta minima">
              <Input
                type="number"
                value={draft.minStock}
                onChange={(e) => setDraft({ ...draft, minStock: Number(e.target.value) })}
              />
            </Field>
          </div>
          {editing && (
            <p className="text-xs text-muted-foreground">
              La giacenza si modifica solo dal magazzino, tramite carico, scarico o
              rettifica, così ogni variazione resta tracciata nei movimenti.
            </p>
          )}
          <div className="space-y-2 rounded-xl border border-border bg-surface-container p-3">
            <Toggle
              label="Prodotto attivo"
              checked={draft.active}
              onChange={(v) => setDraft({ ...draft, active: v })}
            />
            <Toggle
              label="Visibile in cassa POS"
              checked={draft.posVisible}
              onChange={(v) => setDraft({ ...draft, posVisible: v })}
            />
            <Toggle
              label="Preferito (in cima alla cassa)"
              checked={draft.favorite}
              onChange={(v) => setDraft({ ...draft, favorite: v })}
            />
          </div>
        </div>
      </Drawer>

      <Modal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Elimina prodotto"
        footer={
          <>
            <Btn variant="subtle" onClick={() => setToDelete(null)}>
              Annulla
            </Btn>
            <Btn
              variant="danger"
              onClick={() => {
                if (toDelete) catalog.remove(toDelete.id);
                setToDelete(null);
                toast.success("Prodotto eliminato");
              }}
            >
              Elimina definitivamente
            </Btn>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          Stai per eliminare <b className="text-foreground">{toDelete?.name}</b>. Lo
          storico delle vendite resta invariato, ma il prodotto non sarà più
          disponibile in cassa.
        </p>
      </Modal>
    </div>
  );
}
