import type { Booking, Session } from "./types";

const eur = (n: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);

const itDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

/** Quota a testa: totale diviso per i giocatori (minimo 1). */
export function perHead(total: number, players: number): number {
  return Math.round((total / Math.max(1, players)) * 100) / 100;
}

export function bookingMessage(b: Booking, courtName: string, club = "KAJOKA"): string {
  const first = b.players[0]?.split(" ")[0];
  const n = b.players.length;
  const lines = [
    `${first ? `Ciao ${first}!` : "Ciao!"} La tua prenotazione al ${club} è confermata ✅`,
    "",
    `🎾 ${courtName}`,
    `📅 ${itDate(b.date)}`,
    `⏰ ${b.start} – ${b.end}`,
  ];
  if (n) lines.push(`👥 ${b.players.join(", ")}`);
  lines.push(`💶 Totale ${eur(b.price)}${n > 1 ? ` · ${eur(perHead(b.price, n))} a testa` : ""}`);
  if (b.note) lines.push(`📝 ${b.note}`);
  lines.push("", "A presto in campo!");
  return lines.join("\n");
}

export function sessionSummary(s: Session, courtName: string, club = "KAJOKA"): string {
  const lines = [`📋 Riepilogo partita · ${courtName} · ${club}`, ""];
  let grand = 0;
  for (const p of s.players) {
    const extras = p.extras.reduce((sum, e) => sum + e.price * e.qty, 0);
    const tot = p.quota + extras;
    grand += tot;
    const det = p.extras.map((e) => `${e.qty}× ${e.name}`).join(", ");
    lines.push(
      `• ${p.name}: ${eur(tot)}${extras ? ` (campo ${eur(p.quota)} + bar ${eur(extras)}${det ? `: ${det}` : ""})` : ""}${p.paid ? " ✅ pagato" : ""}`,
    );
  }
  lines.push("", `Totale partita: ${eur(grand)}`, "Grazie e alla prossima! 🎾");
  return lines.join("\n");
}

export function whatsappUrl(text: string, phone?: string): string {
  const num = (phone ?? "").replace(/\D/g, "");
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
}
