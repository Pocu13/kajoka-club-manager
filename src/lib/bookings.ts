import type { Booking, Court } from "./types";

export const OPEN_FROM = 9 * 60; // 09:00
export const OPEN_TO = 24 * 60; // 24:00

export const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":");
  return Number(h) * 60 + Number(m ?? 0);
};

export const toHHMM = (min: number) =>
  `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

export const dateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const parseDateKey = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y ?? 2026, (m ?? 1) - 1, d ?? 1);
};

export const minutesNow = (d = new Date()) => d.getHours() * 60 + d.getMinutes();

export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

/** Prenotazione attiva su un campo in un dato istante. */
export function bookingAt(
  bookings: Booking[],
  courtId: string,
  date: string,
  minute: number,
): Booking | null {
  return (
    bookings.find(
      (b) =>
        !b.cancelled &&
        b.courtId === courtId &&
        b.date === date &&
        toMin(b.start) <= minute &&
        minute < toMin(b.end),
    ) ?? null
  );
}

/** Prossima prenotazione del campo dopo l'istante indicato. */
export function nextBooking(
  bookings: Booking[],
  courtId: string,
  date: string,
  minute: number,
): Booking | null {
  return (
    bookings
      .filter(
        (b) => !b.cancelled && b.courtId === courtId && b.date === date && toMin(b.start) > minute,
      )
      .sort((a, b) => toMin(a.start) - toMin(b.start))[0] ?? null
  );
}

/**
 * Blocco orario corrente del circolo: dall'inizio della prenotazione più
 * recente ancora in corso fino alla sua fine. Se nessun campo è occupato,
 * il blocco è la fascia oraria in corso (arrotondata a 30′).
 */
export function currentBlock(bookings: Booking[], date: string, minute: number) {
  const live = bookings.filter(
    (b) =>
      !b.cancelled && b.date === date && toMin(b.start) <= minute && minute < toMin(b.end),
  );
  if (live.length) {
    const start = Math.min(...live.map((b) => toMin(b.start)));
    const end = Math.min(...live.map((b) => toMin(b.end)));
    return { start, end, label: `${toHHMM(start)} – ${toHHMM(end)}`, live: true };
  }
  const start = Math.floor(minute / 30) * 30;
  return { start, end: start + 30, label: `${toHHMM(start)} – ${toHHMM(start + 30)}`, live: false };
}

export const KIND_LABEL: Record<Booking["kind"], string> = {
  partita: "Partita libera",
  lezione: "Lezione / SAP",
  serie: "Allenamento serie",
  manutenzione: "Manutenzione",
};

export const KIND_CLS: Record<Booking["kind"], string> = {
  partita: "bg-[#c0392b] text-white border-[#e05a4b]",
  lezione: "bg-[#1d3b26] text-[#bfe6c8] border-[#2f5c3c]",
  serie: "bg-[#6c4fc1] text-white border-[#8a70dd]",
  manutenzione: "bg-[#4a3a12] text-warning border-[#7a6320]",
};

export const FAMILIES = [
  { key: "padel", label: "Padel" },
  { key: "tennis", label: "Tennis" },
  { key: "beach", label: "Beach" },
] as const;

export type FamilyKey = (typeof FAMILIES)[number]["key"];

export const courtsOf = (courts: Court[], family: FamilyKey) =>
  courts.filter((c) => c.type === family && c.active);

export const EXTRAS = [
  { id: "racchette", label: "2x Racchette", price: 6 },
  { id: "palline", label: "Tubo palline", price: 6 },
] as const;

export function bookingPrice(court: Court, minutes: number, extras: string[]) {
  const base = (court.hourlyPrice * minutes) / 60;
  const add = extras.reduce(
    (sum, id) => sum + (EXTRAS.find((e) => e.id === id)?.price ?? 0),
    0,
  );
  return Math.round((base + add) * 100) / 100;
}
