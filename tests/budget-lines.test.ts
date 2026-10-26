import { describe, expect, it } from "vitest";
import { freqText, lineTotal, monthlyCents, parseNotionMoney, type BudgetLineDTO } from "@/lib/budget-lines";

let n = 0;
const line = (amountCents: number | null, currency = "UYU"): BudgetLineDTO => ({
  id: `l${++n}`,
  list: "mine",
  name: `g${n}`,
  amountCents,
  currency,
  category: null,
  variable: false,
  wouldCut: false,
  note: null,
  order: n,
  freq: "month",
  times: 1,
});

describe("gastos fijos", () => {
  it("lee los montos de Notion", () => {
    expect(parseNotionMoney("30.000,00 UYU")).toEqual({ cents: 3000000, currency: "UYU" });
    expect(parseNotionMoney("16,39 US$")).toEqual({ cents: 1639, currency: "USD" });
    expect(parseNotionMoney("1500,00 UYU")).toEqual({ cents: 150000, currency: "UYU" });
    expect(parseNotionMoney("")).toBeNull();
  });

  it("suma por moneda y todo en pesos (cada moneda a pesos enteros); las sin monto no cuentan", () => {
    const t = lineTotal([line(2700000), line(75000), line(3000, "USD"), line(1639, "USD"), line(null)], { UYU: 1, USD: 40.5 });
    expect(t.byCurrency).toEqual({ UYU: 2775000, USD: 4639 });
    // US$ 46,39 × 40,5 = 1878,795 → $ 1.879
    expect(t.uyuCents).toBe(2775000 + 187900);
    expect(t.count).toBe(5);
  });

  it("frecuencia: lo que sale por mes", () => {
    expect(monthlyCents({ amountCents: 150000, freq: "month", times: 4 })).toBe(600000);
    expect(monthlyCents({ amountCents: 1200000, freq: "year", times: 1 })).toBe(100000);
    expect(monthlyCents({ amountCents: 120000, freq: "week", times: 1 })).toBe(520000);
    expect(monthlyCents({ amountCents: 300000, freq: "quarter", times: 1 })).toBe(100000);
    expect(monthlyCents({ amountCents: null, freq: "month", times: 1 })).toBeNull();
    expect(freqText({ freq: "year", times: 1 })).toBe("Anual");
    expect(freqText({ freq: "month", times: 4 })).toBe("4× por mes");
  });

  it("los totales usan lo que sale por mes", () => {
    const uber = { ...line(150000), times: 4 };
    const seguro = { ...line(1200000), freq: "year" as const };
    expect(lineTotal([uber, seguro], { UYU: 1 }).uyuCents).toBe(700000);
  });
});

describe("colores de las categorías", () => {
  it("cada una toma el primero libre y las que tenían no cambian", async () => {
    const { assignCategoryColors } = await import("@/lib/budget-lines");
    const a = assignCategoryColors(["Salud", "Casa"], {});
    expect(a.colors).toEqual({ Casa: "blue", Salud: "orange" });
    const b = assignCategoryColors(["Salud", "Casa", "DJ"], { Casa: "green" });
    expect(b.colors).toEqual({ Casa: "green", DJ: "blue", Salud: "orange" });
    expect(assignCategoryColors(["Casa"], { Casa: "green" }).changed).toBe(false);
  });
});
