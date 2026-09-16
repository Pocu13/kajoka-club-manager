import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, RotateCcw, Save, Upload } from "lucide-react";
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
  Toggle,
} from "@/components/ui-kit";
import { config, useCurrentUser, useDB } from "@/lib/store";
import { eur } from "@/lib/format";
import type { Court, PaymentMethod, Settings } from "@/lib/types";

export const Route = createFileRoute("/impostazioni")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Impostazioni gestionale — KAJOKA" },
      {
        name: "description",
        content:
          "Configura circolo, campi, cassa bar, soglie di magazzino, sicurezza e backup dei dati.",
      },
      { property: "og:title", content: "Impostazioni gestionale — KAJOKA" },
      {
        property: "og:description",
        content: "Parametri operativi del circolo e gestione dei dati locali.",
      },
    ],
  }),
  component: () => (
    <AppShell>
      <SettingsPage />
    </AppShell>
  ),
});

type Tab = "generale" | "campi" | "bar" | "magazzino" | "sicurezza" | "dati";

function SettingsPage() {
  const db = useDB();
  const user = useCurrentUser();
  const [tab, setTab] = useState<Tab>("generale");
  const [form, setForm] = useState<Settings>(db.settings);
  const [courts, setCourts] = useState<Court[]>(db.courts);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [resetOpen, setResetOpen] = useState(false);

  const dirty =
    JSON.stringify(form) !== JSON.stringify(db.settings) ||
    JSON.stringify(courts) !== JSON.stringify(db.courts);

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  if (user?.role !== "admin") {
    return <EmptyState label="Sezione riservata agli amministratori." />;
  }

  const s = <K extends keyof Settings>(k: K, v: Settings[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const save = () => {
    config.save(form);
    config.saveCourts(courts);
    toast.success("Impostazioni salvate");
  };

  const download = () => {
    const blob = new Blob([config.exportJSON()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kajoka-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Backup esportato");
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Impostazioni"
        subtitle="Parametri del circolo, della cassa e dei dati archiviati su questo dispositivo"
      >
        {dirty && <Badge tone="warning">Modifiche non salvate</Badge>}
        <Btn variant="primary" disabled={!dirty} onClick={save}>
          <Save className="size-4" /> Salva
        </Btn>
      </PageHeader>

      <SegTabs
        value={tab}
        onChange={setTab}
        options={[
          { value: "generale", label: "Generale" },
          { value: "campi", label: "Campi" },
          { value: "bar", label: "Bar & POS" },
          { value: "magazzino", label: "Magazzino" },
          { value: "sicurezza", label: "Sicurezza" },
          { value: "dati", label: "Dati & Backup" },
        ]}
      />

      {tab === "generale" && (
        <Panel className="space-y-4 p-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Nome del circolo">
              <Input
                value={form.clubName}
                onChange={(e) => s("clubName", e.target.value)}
              />
            </Field>
            <Field label="Lingua">
              <Select value={form.language} onChange={(e) => s("language", e.target.value)}>
                <option value="it">Italiano</option>
                <option value="en">English</option>
              </Select>
            </Field>
            <Field label="Valuta">
              <Select value={form.currency} onChange={(e) => s("currency", e.target.value)}>
                <option value="EUR">Euro (€)</option>
                <option value="CHF">Franco svizzero</option>
              </Select>
            </Field>
            <Field label="Formato data">
              <Select
                value={form.dateFormat}
                onChange={(e) => s("dateFormat", e.target.value)}
              >
                <option value="dd/MM/yyyy">GG/MM/AAAA</option>
                <option value="yyyy-MM-dd">AAAA-MM-GG</option>
              </Select>
            </Field>
            <Field label="Formato ora">
              <Select
                value={form.timeFormat}
                onChange={(e) => s("timeFormat", e.target.value as "24" | "12")}
              >
                <option value="24">24 ore</option>
                <option value="12">12 ore</option>
              </Select>
            </Field>
            <Field label="Fuso orario">
              <Input value={form.timezone} onChange={(e) => s("timezone", e.target.value)} />
            </Field>
          </div>
        </Panel>
      )}

      {tab === "campi" && (
        <div className="space-y-5">
          <Panel className="space-y-4 p-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Field label="Durata predefinita (minuti)">
                <Input
                  type="number"
                  value={form.defaultDuration}
                  onChange={(e) => s("defaultDuration", Number(e.target.value))}
                />
              </Field>
              <Field label="Passo degli slot (minuti)">
                <Input
                  type="number"
                  value={form.slotStep}
                  onChange={(e) => s("slotStep", Number(e.target.value))}
                />
              </Field>
              <Field label="Modalità prezzo predefinita">
                <Select
                  value={form.defaultPricingMode}
                  onChange={(e) =>
                    s("defaultPricingMode", e.target.value as "campo" | "giocatore")
                  }
                >
                  <option value="campo">Prezzo per campo</option>
                  <option value="giocatore">Prezzo per giocatore</option>
                </Select>
              </Field>
            </div>
          </Panel>

          <Panel className="overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-container">
                  {["Campo", "Tipo", "Prezzo orario", "Attivo"].map((h) => (
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
                {courts.map((c, idx) => (
                  <tr key={c.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2">
                      <Input
                        value={c.name}
                        onChange={(e) =>
                          setCourts((list) =>
                            list.map((x, i) =>
                              i === idx ? { ...x, name: e.target.value } : x,
                            ),
                          )
                        }
                      />
                    </td>
                    <td className="px-4 py-2">
                      <Badge tone="neutral">{c.type}</Badge>
                    </td>
                    <td className="px-4 py-2 w-40">
                      <Input
                        type="number"
                        value={c.hourlyPrice}
                        onChange={(e) =>
                          setCourts((list) =>
                            list.map((x, i) =>
                              i === idx
                                ? { ...x, hourlyPrice: Number(e.target.value) }
                                : x,
                            ),
                          )
                        }
                      />
                    </td>
                    <td className="px-4 py-2">
                      <Toggle
                        checked={c.active}
                        onChange={(v) =>
                          setCourts((list) =>
                            list.map((x, i) => (i === idx ? { ...x, active: v } : x)),
                          )
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>
      )}

      {tab === "bar" && (
        <Panel className="space-y-3 p-5">
          <Toggle
            checked={form.posQuickPay}
            onChange={(v) => s("posQuickPay", v)}
            label="Pagamento rapido"
            hint="Mostra i pulsanti contanti e carta direttamente nel carrello."
          />
          <Toggle
            checked={form.posRequireConfirm}
            onChange={(v) => s("posRequireConfirm", v)}
            label="Conferma prima di incassare"
            hint="Richiede una conferma esplicita per chiudere la vendita."
          />
          <Toggle
            checked={form.showFavoritesFirst}
            onChange={(v) => s("showFavoritesFirst", v)}
            label="Preferiti in cima"
            hint="I prodotti preferiti compaiono per primi nella griglia POS."
          />
          <Field label="Metodo di pagamento predefinito" className="max-w-xs pt-2">
            <Select
              value={form.posDefaultMethod}
              onChange={(e) => s("posDefaultMethod", e.target.value as PaymentMethod)}
            >
              <option value="contanti">Contanti</option>
              <option value="carta">Carta</option>
              <option value="misto">Misto</option>
            </Select>
          </Field>
        </Panel>
      )}

      {tab === "magazzino" && (
        <Panel className="space-y-3 p-5">
          <Toggle
            checked={form.lowStockAlert}
            onChange={(v) => s("lowStockAlert", v)}
            label="Avvisi di sottoscorta"
            hint="Segnala nella barra laterale i prodotti sotto la soglia minima."
          />
          <Toggle
            checked={form.negativeStock}
            onChange={(v) => s("negativeStock", v)}
            label="Consenti giacenza negativa"
            hint="Permette di vendere prodotti esauriti registrando una giacenza sotto zero."
          />
          <div className="grid grid-cols-1 gap-4 pt-2 md:grid-cols-2">
            <Field label="Soglia minima predefinita">
              <Input
                type="number"
                value={form.defaultMinStock}
                onChange={(e) => s("defaultMinStock", Number(e.target.value))}
              />
            </Field>
            <Field label="Unità di misura predefinita">
              <Input
                value={form.stockUnit}
                onChange={(e) => s("stockUnit", e.target.value)}
              />
            </Field>
          </div>
        </Panel>
      )}

      {tab === "sicurezza" && (
        <Panel className="space-y-3 p-5">
          <Field label="Timeout sessione (minuti)" className="max-w-xs">
            <Input
              type="number"
              value={form.sessionTimeout}
              onChange={(e) => s("sessionTimeout", Number(e.target.value))}
            />
          </Field>
          <Toggle
            checked={form.requireStrongPassword}
            onChange={(v) => s("requireStrongPassword", v)}
            label="Password robuste obbligatorie"
            hint="Minimo 8 caratteri con numeri e maiuscole."
          />
          <Toggle
            checked={form.auditLog}
            onChange={(v) => s("auditLog", v)}
            label="Registro attività"
            hint="Traccia annullamenti, rettifiche e modifiche ai prezzi."
          />
          <Toggle
            checked={form.lockPriceEdit}
            onChange={(v) => s("lockPriceEdit", v)}
            label="Blocca modifica prezzi ai dipendenti"
          />
        </Panel>
      )}

      {tab === "dati" && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Panel className="p-4">
              <div className="label-caps text-muted-foreground">Prodotti</div>
              <div className="mono mt-2 text-2xl font-bold">{db.products.length}</div>
            </Panel>
            <Panel className="p-4">
              <div className="label-caps text-muted-foreground">Operazioni</div>
              <div className="mono mt-2 text-2xl font-bold">{db.transactions.length}</div>
            </Panel>
            <Panel className="p-4">
              <div className="label-caps text-muted-foreground">Movimenti</div>
              <div className="mono mt-2 text-2xl font-bold">{db.movements.length}</div>
            </Panel>
            <Panel className="p-4">
              <div className="label-caps text-muted-foreground">Valore magazzino</div>
              <div className="mono mt-2 text-2xl font-bold">
                {eur(db.products.reduce((t, p) => t + p.cost * p.stock, 0))}
              </div>
            </Panel>
          </div>

          <Panel className="space-y-4 p-5">
            <p className="text-sm text-muted-foreground">
              I dati del gestionale sono archiviati su questo dispositivo. Esporta un
              backup per conservarli o trasferirli su un altro computer.
            </p>
            <div className="flex flex-wrap gap-2">
              <Btn variant="outline" onClick={download}>
                <Download className="size-4" /> Esporta backup
              </Btn>
              <Btn variant="outline" onClick={() => setImportOpen(true)}>
                <Upload className="size-4" /> Importa backup
              </Btn>
              <Btn variant="danger" onClick={() => setResetOpen(true)}>
                <RotateCcw className="size-4" /> Ripristina dati dimostrativi
              </Btn>
            </div>
          </Panel>
        </div>
      )}

      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Importa backup"
        footer={
          <>
            <Btn variant="subtle" onClick={() => setImportOpen(false)}>
              Annulla
            </Btn>
            <Btn
              variant="primary"
              onClick={() => {
                if (config.importJSON(importText)) {
                  setImportOpen(false);
                  setImportText("");
                  toast.success("Backup importato");
                } else {
                  toast.error("File di backup non valido");
                }
              }}
            >
              Importa
            </Btn>
          </>
        }
      >
        <div className="space-y-3">
          <input
            type="file"
            accept="application/json"
            className="text-sm text-muted-foreground"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setImportText(await f.text());
            }}
          />
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="…oppure incolla qui il contenuto del backup"
            className="h-40 w-full rounded-lg border border-border bg-surface p-3 font-mono text-xs outline-none focus:border-primary/60"
          />
        </div>
      </Modal>

      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Ripristina dati dimostrativi"
        footer={
          <>
            <Btn variant="subtle" onClick={() => setResetOpen(false)}>
              Annulla
            </Btn>
            <Btn
              variant="danger"
              onClick={() => {
                config.reset();
                setResetOpen(false);
                toast.success("Dati ripristinati");
              }}
            >
              Ripristina
            </Btn>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          Tutte le vendite, i movimenti e le modifiche fatte finora verranno sostituiti
          dai dati dimostrativi iniziali. L&apos;operazione non è reversibile.
        </p>
      </Modal>
    </div>
  );
}
