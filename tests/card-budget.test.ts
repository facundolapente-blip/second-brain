import { describe, expect, it } from "vitest";
import {
  dayIn,
  dueAfter,
  installmentDate,
  nextClosing,
  previousClosing,
  splitInstallments,
  summarizeCard,
  type CardMove,
} from "@/lib/card-logic";
import { budgetState, convertCents, monthShare, rolloverCarry } from "@/lib/budget-logic";

const TODAY = "2026-10-19";

describe("fechas de tarjeta", () => {
  it("dayIn: un 31 en abril cae el 30", () => {
    expect(dayIn("2026-04", 31)).toBe("2026-04-30");
    expect(dayIn("2026-02", 30)).toBe("2026-02-28");
    expect(dayIn("2028-02", 30)).toBe("2028-02-29");
    expect(dayIn("2026-10", 5)).toBe("2026-10-05");
  });

  it("próximo cierre: hoy si cierra hoy, si no este mes o el que viene", () => {
    expect(nextClosing("2026-10-19", 20)).toBe("2026-10-20");
    expect(nextClosing("2026-10-20", 20)).toBe("2026-10-20");
    expect(nextClosing("2026-10-21", 20)).toBe("2026-11-20");
    expect(nextClosing("2026-12-25", 20)).toBe("2027-01-20");
    expect(previousClosing("2026-10-20", 20)).toBe("2026-09-20");
    expect(previousClosing("2026-03-31", 31)).toBe("2026-02-28");
  });

  it("vencimiento: el día de vencimiento siguiente al cierre", () => {
    expect(dueAfter("2026-09-20", 5)).toBe("2026-10-05");
    expect(dueAfter("2026-09-05", 20)).toBe("2026-09-20");
  });

  it("cuotas: mismo día los meses siguientes; la primera lleva el resto", () => {
    expect(installmentDate("2026-01-31", 0)).toBe("2026-01-31");
    expect(installmentDate("2026-01-31", 1)).toBe("2026-02-28");
    expect(installmentDate("2026-01-31", 2)).toBe("2026-03-31");
    expect(splitInstallments(1000, 3)).toEqual([334, 333, 333]);
    expect(splitInstallments(1200, 3)).toEqual([400, 400, 400]);
    for (const [t, n] of [
      [99999, 7],
      [1, 2],
      [123456, 24],
    ]) {
      const parts = splitInstallments(t, n);
      expect(parts).toHaveLength(n);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(t);
    }
  });
});

describe("resumen de tarjeta (summarizeCard)", () => {
  // Cierra el 20, vence el 5. Hoy 19/10: último cierre 20/9 (resumen del 21/8 al 20/9).
  const card = (balanceCents: number) => ({
    id: "visa",
    name: "Visa",
    currency: "UYU",
    balanceCents,
    closingDay: 20,
    dueDay: 5,
    limitCents: 500000,
  });
  const charge = (date: string, cents: number, installment = false): CardMove => ({ date, chargeCents: cents, paymentCents: 0, installment });
  const pay = (date: string, cents: number): CardMove => ({ date, chargeCents: 0, paymentCents: cents, installment: false });

  it("fechas del último resumen y del que está en curso", () => {
    const s = summarizeCard(card(-1000), [charge("2026-09-10", 1000)], TODAY);
    expect(s.last).toMatchObject({ from: "2026-08-21", closing: "2026-09-20", due: "2026-10-05" });
    expect(s.current).toMatchObject({ from: "2026-09-21", closing: "2026-10-20", due: "2026-11-05" });
  });

  it("pago antes del cierre: ese resumen ya no debe nada", () => {
    const s = summarizeCard(card(0), [charge("2026-09-10", 1000), pay("2026-09-15", 1000)], TODAY);
    expect(s.debtCents).toBe(0);
    expect(s.last).toMatchObject({ amountCents: 0, chargesCents: 1000, paidCents: 0, leftCents: 0 });
    expect(s.current?.amountCents).toBe(0);
  });

  it("pago parcial después del cierre: falta la diferencia", () => {
    const s = summarizeCard(card(-600), [charge("2026-09-10", 1000), pay("2026-10-01", 400)], TODAY);
    expect(s.debtCents).toBe(600);
    expect(s.last).toMatchObject({ amountCents: 1000, paidCents: 400, leftCents: 600 });
    expect(s.current?.amountCents).toBe(0);
  });

  it("compras nuevas van al resumen en curso, no al último", () => {
    const s = summarizeCard(card(-800), [charge("2026-09-10", 1000), pay("2026-10-01", 400), charge("2026-10-05", 200)], TODAY);
    expect(s.last).toMatchObject({ amountCents: 1000, leftCents: 600 });
    expect(s.current?.amountCents).toBe(200);
    expect(s.debtCents).toBe(800);
  });

  it("lo impago de un resumen viejo se arrastra al siguiente", () => {
    const s = summarizeCard(card(-1500), [charge("2026-08-10", 1000), charge("2026-09-10", 500)], TODAY);
    expect(s.last).toMatchObject({ amountCents: 1500, chargesCents: 500, leftCents: 1500 });
    expect(s.current?.amountCents).toBe(0);
  });

  it("pagar de más no deja saldo negativo a pagar", () => {
    const s = summarizeCard(card(500), [charge("2026-09-10", 1000), pay("2026-10-01", 1500)], TODAY);
    expect(s.debtCents).toBe(0);
    expect(s.last?.leftCents).toBe(0);
    expect(s.current?.amountCents).toBe(0);
  });

  it("cuotas: cada una en su resumen; las que vienen después del en curso quedan pendientes", () => {
    const moves = [charge("2026-09-10", 1000, true), charge("2026-10-10", 1000, true), charge("2026-11-10", 1000, true)];
    const s = summarizeCard(card(-3000), moves, TODAY);
    expect(s.debtCents).toBe(3000); // las cuotas futuras ya cuentan en la deuda
    expect(s.last).toMatchObject({ amountCents: 1000, chargesCents: 1000, leftCents: 1000 });
    expect(s.current?.amountCents).toBe(1000);
    expect(s.pending).toEqual({ count: 1, cents: 1000, lastDate: "2026-11-10" });
  });

  it("los ajustes de saldo no cuentan como compras del resumen", () => {
    const s = summarizeCard(card(-1300), [charge("2026-09-10", 1000), { ...charge("2026-09-12", 300), adjustment: true }], TODAY);
    expect(s.last?.chargesCents).toBe(1000);
    expect(s.last?.amountCents).toBe(1300);
  });

  it("sin día de cierre: solo deuda y cuotas futuras", () => {
    const s = summarizeCard({ ...card(-2000), closingDay: null }, [charge("2026-10-10", 1000, true), charge("2026-11-10", 1000, true)], TODAY);
    expect(s.last).toBeNull();
    expect(s.current).toBeNull();
    expect(s.pending).toEqual({ count: 1, cents: 1000, lastDate: "2026-11-10" });
  });
});

describe("arrastre de presupuesto (rolloverCarry)", () => {
  const spent: Record<string, number> = { "2026-08": 6000, "2026-09": 12000 };
  const of = (m: string) => spent[m] ?? 0;

  it("disponible = monto + lo que sobró; nunca negativo", () => {
    // Agosto: sobran 4000. Septiembre: 10000 + 4000 − 12000 = 2000.
    expect(rolloverCarry(10000, "2026-08", "2026-10", of)).toBe(2000);
    expect(rolloverCarry(10000, "2026-08", "2026-09", of)).toBe(4000);
    expect(rolloverCarry(10000, "2026-08", "2026-10", (m) => (m === "2026-08" ? 25000 : 5000))).toBe(5000);
  });

  it("sin arrastre, el primer mes o antes de activarlo: 0", () => {
    expect(rolloverCarry(10000, null, "2026-10", of)).toBe(0);
    expect(rolloverCarry(10000, "2026-10", "2026-10", of)).toBe(0);
    expect(rolloverCarry(10000, "2026-11", "2026-10", of)).toBe(0);
  });

  it("pasa el cambio de año", () => {
    expect(rolloverCarry(10000, "2025-11", "2026-02", () => 7000)).toBe(9000);
  });
});

describe("estado del presupuesto", () => {
  it("pasado, cerca del tope (90%), adelantado o bien", () => {
    expect(budgetState(0, 0, null)).toBe("ok");
    expect(budgetState(1, 0, null)).toBe("over");
    expect(budgetState(110, 100, null)).toBe("over");
    expect(budgetState(100, 100, null)).toBe("near");
    expect(budgetState(90, 100, null)).toBe("near");
    expect(budgetState(89, 100, null)).toBe("ok");
    expect(budgetState(60, 100, 0.5)).toBe("ahead");
    expect(budgetState(55, 100, 0.5)).toBe("ok");
  });

  it("monthShare: parte del mes que pasó, solo en el mes en curso", () => {
    expect(monthShare("2026-10", "2026-10-15")).toBeCloseTo(15 / 31);
    expect(monthShare("2026-09", "2026-10-15")).toBeNull();
  });

  it("convertCents: a pesos redondea a pesos enteros", () => {
    const rates = { USD: 40.5 };
    expect(convertCents(1000, "USD", "UYU", rates)).toBe(40500);
    expect(convertCents(1001, "USD", "UYU", rates)).toBe(40500);
    expect(convertCents(40500, "UYU", "USD", rates)).toBe(1000);
    expect(convertCents(123, "UYU", "UYU", rates)).toBe(123);
    expect(convertCents(100, "EUR", "UYU", rates)).toBe(0);
  });
});
