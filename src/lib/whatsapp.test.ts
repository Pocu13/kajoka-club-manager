import { describe, expect, it } from "vitest";
import { perHead, sessionSummary, whatsappUrl } from "./whatsapp";

describe("whatsapp", () => {
  it("divide il totale per giocatore", () => {
    expect(perHead(40, 4)).toBe(10);
  });
  it("somma quota campo ed extra bar nel totale partita", () => {
    const txt = sessionSummary(
      { id: "s", courtId: "c", startedAt: "", durationMin: 90, pricingMode: "campo", total: 20, closed: false,
        players: [{ id: "a", name: "Marco", quota: 10, paid: false, extras: [{ productId: "x", name: "Acqua", qty: 2, price: 1.5, cost: 0 }] },
                  { id: "b", name: "Luca", quota: 10, paid: true, extras: [] }] },
      "Padel 1",
    );
    expect(txt.replace(/\u00a0/g, " ")).toContain("Totale partita: 23,00 €");
  });
  it("pulisce il numero di telefono", () => {
    expect(whatsappUrl("ciao", "+39 333-1234567")).toBe("https://wa.me/393331234567?text=ciao");
  });
});
