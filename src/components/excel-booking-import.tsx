
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { FileUp, Plus, Trash2, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Badge, Btn, Field, Input, Modal, Panel, Select } from "@/components/ui-kit";
import { reservations, useDB } from "@/lib/store";
import { bookingPrice, toHHMM, toMin } from "@/lib/bookings";
import type { Court, CourtType } from "@/lib/types";

type ExcelApi = {
  read: (data: ArrayBuffer, options: Record<string, unknown>) => {
    SheetNames: string[];
    Sheets: Record<string, unknown>;
  };
  utils: {
    sheet_to_json: (
      sheet: unknown,
      options: Record<string, unknown>,
    ) => unknown[][];
  };
};

declare global {
  interface Window {
    XLSX?: ExcelApi;
  }
}

type ImportRow = {
  id: string;
  date: string;
  courtId: string;
  start: string;
  end: string;
  players: string;
};

let excelLibraryPromise: Promise<ExcelApi> | null = null;

function loadExcelLibrary(): Promise<ExcelApi> {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (excelLibraryPromise) return excelLibraryPromise;

  excelLibraryPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-excel-library="xlsx"]',
    );

    const script = existing ?? document.createElement("script");

    const onLoad = () => {
      if (window.XLSX) {
        resolve(window.XLSX);
      } else {
        excelLibraryPromise = null;
        reject(new Error("Impossibile inizializzare il lettore Excel."));
      }
    };

    const onError = () => {
      excelLibraryPromise = null;
      reject(new Error("Non riesco a caricare il lettore Excel. Controlla la connessione."));
    };

    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });

    if (!existing) {
      script.src =
        "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
      script.async = true;
      script.dataset.excelLibrary = "xlsx";
      document.head.appendChild(script);
    }
  });

  return excelLibraryPromise;
}

function normalize(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function normalizeHeader(value: unknown): string {
  return normalize(value).replace(/[^a-z0-9]/g, "");
}

function parseExcelDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    if (Number.isNaN(date.getTime())) return "";

    return [
      date.getUTCFullYear(),
      String(date.getUTCMonth() + 1).padStart(2, "0"),
      String(date.getUTCDate()).padStart(2, "0"),
    ].join("-");
  }

  const text = String(value ?? "").trim();
  if (!text) return "";

  const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  }

  const italian = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (italian) {
    return `${italian[3]}-${italian[2].padStart(2, "0")}-${italian[1].padStart(2, "0")}`;
  }

  return "";
}

function parseExcelTime(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${String(value.getHours()).padStart(2, "0")}:${String(
      value.getMinutes(),
    ).padStart(2, "0")}`;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const totalMinutes = Math.round((value % 1) * 1440);
    return toHHMM(totalMinutes);
  }

  const text = String(value ?? "").trim();
  if (!text) return "";

  const match = text.match(/^(\d{1,2})[:.](\d{2})(?:[:.]\d{2})?$/);
  if (!match) return "";

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours > 23 || minutes > 59) return "";

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function splitPlayers(value: unknown): string[] {
  return String(value ?? "")
    .split(/[,;\n\r]+/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function getCourtType(resource: string, sport: string): CourtType | null {
  const value = normalize(`${resource} ${sport}`);

  if (value.includes("padel")) return "padel";
  if (value.includes("tennis") || value.includes("tennis")) return "tennis";
  if (value.includes("beach")) return "beach";

  return null;
}

function findCourt(
  courts: Court[],
  type: CourtType,
  resource: string,
): Court | undefined {
  const available = courts.filter((court) => court.active && court.type === type);

  if (type === "tennis") {
    return available[0];
  }

  const normalizedResource = normalize(resource);
  const exact = available.find(
    (court) => normalize(court.name) === normalizedResource,
  );

  if (exact) return exact;

  const resourceNumber = normalizedResource.match(/\d+/)?.[0];

  if (resourceNumber) {
    const numbered = available.find((court) => {
      const name = normalize(court.name);
      const courtNumber = name.match(/\d+/)?.[0];
      return courtNumber === resourceNumber;
    });

    if (numbered) return numbered;
  }

  return available.length === 1 ? available[0] : undefined;
}

function getColumn(
  headers: string[],
  ...names: string[]
): number {
  const normalizedNames = names.map(normalizeHeader);

  return headers.findIndex((header) =>
    normalizedNames.includes(normalizeHeader(header)),
  );
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getRowConflict(
  row: ImportRow,
  otherRows: ImportRow[],
  bookings: ReturnType<typeof useDB>["bookings"],
): string | null {
  const start = toMin(row.start);
  const end = toMin(row.end);

  if (!row.date || !row.courtId || !row.start || !row.end) {
    return "Completa data, campo e orari.";
  }

  if (end <= start) {
    return "L'orario finale deve essere successivo a quello iniziale.";
  }

  if (!row.players.trim()) {
    return "Inserisci almeno un partecipante.";
  }

  const existing = bookings.find(
    (booking) =>
      !booking.cancelled &&
      booking.courtId === row.courtId &&
      booking.date === row.date &&
      start < toMin(booking.end) &&
      end > toMin(booking.start),
  );

  if (existing) {
    return `Conflitto con ${existing.title}, ${existing.start}–${existing.end}.`;
  }

  const duplicate = otherRows.find(
    (other) =>
      other.id !== row.id &&
      other.courtId === row.courtId &&
      other.date === row.date &&
      start < toMin(other.end) &&
      end > toMin(other.start),
  );

  if (duplicate) {
    return "Conflitto con un'altra prenotazione presente nell'importazione.";
  }

  return null;
}

export function ExcelBookingImport() {
  const db = useDB();
  const fileInput = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ImportRow[]>([]);

  const activeCourts = db.courts.filter((court) => court.active);

  const conflicts = useMemo(
    () =>
      rows.map((row) => ({
        id: row.id,
        error: getRowConflict(
          row,
          rows,
          db.bookings,
        ),
      })),
    [rows, db.bookings],
  );

  const invalidCount = conflicts.filter((item) => item.error).length;

  const updateRow = (id: string, patch: Partial<ImportRow>) => {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  };

  const removeRow = (id: string) => {
    setRows((current) => current.filter((row) => row.id !== id));
  };

  const readFile = async (file: File) => {
    setLoading(true);

    try {
      const extension = file.name.split(".").pop()?.toLowerCase();

      if (!["xlsx", "xls"].includes(extension ?? "")) {
        throw new Error("Seleziona un file Excel .xlsx oppure .xls.");
      }

      const XLSX = await loadExcelLibrary();
      const buffer = await file.arrayBuffer();

      const workbook = XLSX.read(buffer, {
        type: "array",
        cellDates: true,
      });

      const firstSheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[firstSheetName];

      if (!sheet) {
        throw new Error("Il file Excel non contiene un foglio leggibile.");
      }

      const matrix = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: "",
        raw: true,
      });

      if (!matrix.length) {
        throw new Error("Il foglio Excel è vuoto.");
      }

      const headerIndex = matrix.findIndex((line) => {
        const headers = line.map((value) => normalizeHeader(value));
        return (
          headers.includes("giorno") &&
          headers.includes("risorsa")
        );
      });

      if (headerIndex < 0) {
        throw new Error(
          "Non trovo le colonne Giorno e Risorsa nel foglio Excel.",
        );
      }

      const headers = matrix[headerIndex].map((value) => String(value ?? ""));

      const dateCol = getColumn(headers, "Giorno");
      const typeCol = getColumn(headers, "Tipo");
      const resourceCol = getColumn(headers, "Risorsa");
      const sportCol = getColumn(headers, "Sport");
      const startCol = getColumn(headers, "Orario iniziale");
      const endCol = getColumn(headers, "Orario finale");
      const bookerCol = getColumn(
        headers,
        "Prenotante nome",
        "Prenotante nome / Causale Blocco",
      );
      const playersCol = getColumn(headers, "Partecipanti");

      if (
        dateCol < 0 ||
        resourceCol < 0 ||
        startCol < 0 ||
        endCol < 0
      ) {
        throw new Error(
          "Mancano una o più colonne necessarie: Giorno, Risorsa, Orario iniziale e Orario finale.",
        );
      }

      const imported: ImportRow[] = [];
      let ignored = 0;
      let unresolved = 0;

      for (const line of matrix.slice(headerIndex + 1)) {
        const typeValue = normalize(
          typeCol >= 0 ? line[typeCol] : "",
        );

        if (
          typeValue === "blocco" ||
          typeValue === "attivita" ||
          typeValue.startsWith("blocco ") ||
          typeValue.startsWith("attivita ")
        ) {
          ignored++;
          continue;
        }

        const resource = String(line[resourceCol] ?? "").trim();
        const sport = String(
          sportCol >= 0 ? line[sportCol] ?? "" : "",
        ).trim();

        const courtType = getCourtType(resource, sport);

        if (!courtType) {
          ignored++;
          continue;
        }

        const date = parseExcelDate(line[dateCol]);
        const start = parseExcelTime(line[startCol]);
        const end = parseExcelTime(line[endCol]);

        if (!date || !start || !end || toMin(end) <= toMin(start)) {
          ignored++;
          continue;
        }

        const court = findCourt(activeCourts, courtType, resource);

        if (!court) {
          unresolved++;
          continue;
        }

        const participants = splitPlayers(
          playersCol >= 0 ? line[playersCol] : "",
        );

        const booker =
          bookerCol >= 0
            ? String(line[bookerCol] ?? "").trim()
            : "";

        const names = participants.length
          ? participants
          : booker
            ? [booker]
            : [];

        if (!names.length) {
          ignored++;
          continue;
        }

        imported.push({
          id: makeId(),
          date,
          courtId: court.id,
          start,
          end,
          players: names.join(", "),
        });
      }

      if (!imported.length) {
        throw new Error(
          unresolved
            ? `Non ho trovato prenotazioni importabili. ${unresolved} righe hanno un campo non riconosciuto o non disponibile.`
            : "Non ho trovato prenotazioni sportive valide nel file.",
        );
      }

      setRows(imported);
      setOpen(true);

      toast.success(
        `${imported.length} prenotazioni individuate${
          ignored ? ` · ${ignored} righe ignorate` : ""
        }${unresolved ? ` · ${unresolved} righe senza campo associato` : ""}`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Errore durante la lettura del file Excel.",
      );
    } finally {
      setLoading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const confirmImport = () => {
    if (!rows.length) {
      toast.error("Non ci sono prenotazioni da importare.");
      return;
    }

    if (invalidCount > 0) {
      toast.error("Correggi prima tutte le righe segnalate.");
      return;
    }

    const createdIds: string[] = [];

    for (const row of rows) {
      const court = db.courts.find(
        (item) => item.id === row.courtId,
      );

      if (!court) {
        createdIds.forEach((id) => reservations.remove(id));
        toast.error("Uno dei campi selezionati non è più disponibile.");
        return;
      }

      const duration = toMin(row.end) - toMin(row.start);
      const players = splitPlayers(row.players);

      const result = reservations.create({
        courtId: court.id,
        date: row.date,
        start: row.start,
        end: row.end,
        kind: "partita",
        title: players[0] ?? "Partita",
        players,
        extras: [],
        price: bookingPrice(court, duration, []),
        note: "Importato da Excel",
        source: "manuale",
      });

      if (!result.ok || !result.id) {
        createdIds.forEach((id) => reservations.remove(id));

        toast.error(
          result.error
            ? `Importazione interrotta: ${result.error}. Le prenotazioni create in questo tentativo sono state annullate.`
            : "Importazione interrotta. Le prenotazioni create in questo tentativo sono state annullate.",
        );
        return;
      }

      createdIds.push(result.id);
    }

    toast.success(
      `Importazione completata: ${createdIds.length} prenotazioni salvate.`,
    );

    setRows([]);
    setOpen(false);
  };

  return (
    <>
      <input
        ref={fileInput}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void readFile(file);
        }}
      />

      <Btn
        variant="outline"
        onClick={() => fileInput.current?.click()}
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <FileUp className="size-4" />
        )}
        {loading ? "Lettura Excel..." : "Importa Excel"}
      </Btn>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Conferma importazione prenotazioni"
        className="max-w-5xl"
        footer={
          <>
            <Btn variant="outline" onClick={() => setOpen(false)}>
              Annulla
            </Btn>
            <Btn
              variant="primary"
              onClick={confirmImport}
              disabled={!rows.length || invalidCount > 0}
            >
              <CheckCircle2 className="size-4" />
              Importa {rows.length} prenotazioni
            </Btn>
          </>
        }
      >
        <div className="space-y-4">
          <Panel className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div>
              <div className="font-semibold">
                {rows.length} prenotazioni da importare
              </div>
              <div className="text-xs text-muted-foreground">
                Controlla e correggi i dati prima di confermare.
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge tone="success">
                {rows.length - invalidCount} valide
              </Badge>
              {invalidCount > 0 && (
                <Badge tone="danger">
                  {invalidCount} da correggere
                </Badge>
              )}
            </div>
          </Panel>

          {invalidCount > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              Alcune prenotazioni presentano dati mancanti o conflitti. Correggile
              prima di procedere con il salvataggio.
            </div>
          )}

          <div className="space-y-3">
            {rows.map((row, index) => {
              const error = conflicts.find(
                (item) => item.id === row.id,
              )?.error;

              return (
                <Panel key={row.id} className="space-y-3 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="mono text-xs text-muted-foreground">
                        #{index + 1}
                      </span>
                      <span className="text-sm font-semibold">
                        Prenotazione sportiva
                      </span>
                      {error ? (
                        <Badge tone="danger">Da correggere</Badge>
                      ) : (
                        <Badge tone="success">Valida</Badge>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => removeRow(row.id)}
                      className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      title="Rimuovi questa prenotazione"
                      aria-label="Rimuovi prenotazione"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Field label="Data">
                      <Input
                        type="date"
                        value={row.date}
                        onChange={(event) =>
                          updateRow(row.id, {
                            date: event.target.value,
                          })
                        }
                      />
                    </Field>

                    <Field label="Campo">
                      <Select
                        value={row.courtId}
                        onChange={(event) =>
                          updateRow(row.id, {
                            courtId: event.target.value,
                          })
                        }
                      >
                        <option value="">Seleziona campo</option>
                        {activeCourts.map((court) => (
                          <option key={court.id} value={court.id}>
                            {court.name}
                          </option>
                        ))}
                      </Select>
                    </Field>

                    <Field label="Ora iniziale">
                      <Input
                        type="time"
                        step={1800}
                        value={row.start}
                        onChange={(event) =>
                          updateRow(row.id, {
                            start: event.target.value,
                          })
                        }
                      />
                    </Field>

                    <Field label="Ora finale">
                      <Input
                        type="time"
                        step={1800}
                        value={row.end}
                        onChange={(event) =>
                          updateRow(row.id, {
                            end: event.target.value,
                          })
                        }
                      />
                    </Field>
                  </div>

                  <Field
                    label="Partecipanti"
                    hint="Inserisci esclusivamente i nomi, separati da virgola."
                  >
                    <Input
                      value={row.players}
                      onChange={(event) =>
                        updateRow(row.id, {
                          players: event.target.value,
                        })
                      }
                      placeholder="Nome Cognome, Nome Cognome"
                    />
                  </Field>

                  {error && (
                    <div className="flex items-start gap-2 text-xs text-destructive">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                      {error}
                    </div>
                  )}
                </Panel>
              );
            })}
          </div>

          {rows.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Non ci sono prenotazioni nell'elenco.
            </div>
          )}

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Plus className="size-3.5" />
            Puoi modificare i dati o eliminare una singola prenotazione prima
            del salvataggio.
          </div>
        </div>
      </Modal>
    </>
  );
}
