import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  text: z.string().min(3).max(1000),
  today: z.string(),
  weekday: z.string(),
  now: z.string(),
  courts: z.array(z.object({ id: z.string(), name: z.string(), type: z.string() })).max(50),
});

export type AiBookingResult = {
  courtId: string | null;
  date: string | null;
  start: string | null;
  durationMin: number | null;
  kind: "partita" | "lezione" | "serie" | "manutenzione" | null;
  players: string[];
  note: string;
  missing: string[];
  summary: string;
};

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["courtId", "date", "start", "durationMin", "kind", "players", "note", "missing", "summary"],
  properties: {
    courtId: { type: ["string", "null"], description: "id del campo dalla lista, null se non determinabile" },
    date: { type: ["string", "null"], description: "AAAA-MM-GG" },
    start: { type: ["string", "null"], description: "HH:MM 24h" },
    durationMin: { type: ["integer", "null"] },
    kind: { type: ["string", "null"], enum: ["partita", "lezione", "serie", "manutenzione", null] },
    players: { type: "array", items: { type: "string" } },
    note: { type: "string" },
    missing: { type: "array", items: { type: "string" }, description: "campi mancanti o ambigui" },
    summary: { type: "string", description: "riepilogo breve in italiano" },
  },
} as const;

export const parseBookingRequest = createServerFn({ method: "POST" })
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data }): Promise<{ ok: true; result: AiBookingResult } | { ok: false; error: string }> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return { ok: false, error: "Servizio AI non configurato." };

    const system = `Sei l'assistente prenotazioni del circolo sportivo KAJOKA. Estrai i dati di una prenotazione da una richiesta in italiano.
Oggi è ${data.weekday} ${data.today}, ora attuale ${data.now} (Europe/Rome). Orari di apertura 09:00-24:00.
Campi disponibili (usa SOLO questi id): ${data.courts.map((c) => `${c.id}=${c.name} (${c.type})`).join("; ")}.
Regole: risolvi date relative (domani, sabato, tra 3 giorni) in AAAA-MM-GG. Se viene indicato solo lo sport, scegli il primo campo di quel tipo e segnala "campo" in missing. Durata di default 90 minuti se non indicata (segnalalo in missing). Tipologia: partita (default), lezione (lezione/maestro/SAP), serie (allenamento agonisti), manutenzione. Non inventare nomi di giocatori.`;

    const runIdHeader = "X-Lovable-AIG-Run-ID";
    let res: Response;
    try {
      res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": apiKey,
          "X-Lovable-AIG-SDK": "fetch",
        },
        body: JSON.stringify({
          model: "openai/gpt-6-astra",
          stream: true,
          store: false,
          reasoning: { effort: "low", summary: "auto" },
          include: ["reasoning.encrypted_content"],
          input: [
            { role: "system", content: system },
            { role: "user", content: data.text },
          ],
          text: { format: { type: "json_schema", name: "booking", strict: true, schema } },
        }),
      });
    } catch {
      return { ok: false, error: "Impossibile contattare il servizio AI." };
    }
    void res.headers.get(runIdHeader);

    if (!res.ok || !res.body) {
      const body = await res.text().catch(() => "");
      let msg = "";
      try {
        msg = JSON.parse(body)?.error?.message ?? JSON.parse(body)?.message ?? "";
      } catch {}
      if (res.status === 429) return { ok: false, error: "Troppe richieste, riprova tra poco." };
      if (res.status === 402) return { ok: false, error: msg || "Crediti AI esauriti." };
      return { ok: false, error: msg || `Errore servizio AI (${res.status}).` };
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let text = "";
    let failure = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const ev = JSON.parse(payload);
          if (ev.type === "response.output_text.delta") text += ev.delta ?? "";
          else if (ev.type === "response.refusal.delta") failure = "Richiesta rifiutata dal modello.";
          else if (ev.type === "error" || ev.type === "response.failed")
            failure = ev.error?.message ?? ev.response?.error?.message ?? "Errore AI";
        } catch {}
      }
    }
    if (failure) return { ok: false, error: failure };
    try {
      const r = JSON.parse(text) as AiBookingResult;
      if (r.courtId && !data.courts.some((c) => c.id === r.courtId)) {
        r.courtId = null;
        r.missing = [...r.missing, "campo"];
      }
      return { ok: true, result: r };
    } catch {
      return { ok: false, error: "Risposta AI non interpretabile, riformula la richiesta." };
    }
  });
