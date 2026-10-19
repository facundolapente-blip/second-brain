import { describe, expect, it } from "vitest";
import {
  centsToDecimalString,
  centsToInput,
  computeBalances,
  effects,
  flowOf,
  isAmountExpr,
  netByCurrency,
  parseAmount,
  periodFromParams,
  periodHref,
  scopeOf,
  toCents,
  type TxDTO,
} from "@/lib/finance-logic";
import { isISODate } from "@/lib/dates";

const TODAY = "2026-10-19";

describe("parseAmount", () => {
  it("números solos con separadores de Uruguay", () => {
    expect(parseAmount("1250")).toBe(125000);
    expect(parseAmount("1.250")).toBe(125000);
    expect(parseAmount("1.250,50")).toBe(125050);
    expect(parseAmount("1250,5")).toBe(125050);
    expect(parseAmount("1250.50")).toBe(125050);
    expect(parseAmount("12.5")).toBe(1250);
    expect(parseAmount("$ 1.250")).toBe(125000);
    expect(parseAmount("1.250.000")).toBe(125000000);
  });

  it("cuentas: × y ÷ antes que + y −", () => {
    expect(parseAmount("500+20")).toBe(52000);
    expect(parseAmount("20x3")).toBe(6000);
    expect(parseAmount("20X3")).toBe(6000);
    expect(parseAmount("20×3")).toBe(6000);
    expect(parseAmount("20*3")).toBe(6000);
    expect(parseAmount("1500/3")).toBe(50000);
    expect(parseAmount("10÷4")).toBe(250);
    expect(parseAmount("1.250,50-250")).toBe(100050);
    expect(parseAmount("500−30")).toBe(47000);
    expect(parseAmount("500 + 20 x 3")).toBe(56000);
    expect(parseAmount("100-20/4")).toBe(9500);
  });

  it("rechaza lo que no es un monto", () => {
    expect(parseAmount("5e3")).toBeNull();
    expect(parseAmount("x3")).toBeNull();
    expect(parseAmount("500-600")).toBeNull(); // resultado negativo
    expect(parseAmount("500-500")).toBeNull(); // cero
    expect(parseAmount("10/0")).toBeNull();
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("0")).toBeNull();
    expect(parseAmount("-500")).toBeNull();
    expect(parseAmount("1.2.3")).toBeNull();
    expect(parseAmount("500+")).toBeNull();
  });

  it("isAmountExpr distingue una cuenta de un número", () => {
    expect(isAmountExpr("500+20")).toBe(true);
    expect(isAmountExpr("20 x 3")).toBe(true);
    expect(isAmountExpr("1.250,50")).toBe(false);
    expect(isAmountExpr("500")).toBe(false);
  });
});

describe("centavos", () => {
  it("toCents sin pasar por float", () => {
    expect(toCents({ toFixed: () => "1234.56" })).toBe(123456);
    expect(toCents("12.3")).toBe(1230);
    expect(toCents("-5.5")).toBe(-550);
    expect(toCents(0)).toBe(0);
    expect(toCents("1000")).toBe(100000);
  });

  it("centsToDecimalString", () => {
    expect(centsToDecimalString(123456)).toBe("1234.56");
    expect(centsToDecimalString(5)).toBe("0.05");
    expect(centsToDecimalString(-5)).toBe("-0.05");
    expect(centsToDecimalString(0)).toBe("0.00");
  });

  it("ida y vuelta", () => {
    for (const c of [1, 99, 100, 123456, -98765, 1999999]) expect(toCents(centsToDecimalString(c))).toBe(c);
  });

  it("centsToInput", () => {
    expect(centsToInput(125050)).toBe("1250,50");
    expect(centsToInput(125000)).toBe("1250");
    expect(centsToInput(5)).toBe("0,05");
    expect(centsToInput(null)).toBe("");
    expect(centsToInput(0)).toBe("");
  });
});

describe("efectos y saldos", () => {
  const base = { toAccountId: null, toAmountCents: null };

  it("gasto resta, ingreso suma", () => {
    expect(effects({ ...base, kind: "expense", amountCents: 500, accountId: "a" })).toEqual([{ accountId: "a", cents: -500 }]);
    expect(effects({ ...base, kind: "income", amountCents: 500, accountId: "a" })).toEqual([{ accountId: "a", cents: 500 }]);
  });

  it("transferencia: sale de una, entra en la otra (con otro monto si cambia la moneda)", () => {
    expect(effects({ kind: "transfer", amountCents: 500, accountId: "a", toAccountId: "b", toAmountCents: null })).toEqual([
      { accountId: "a", cents: -500 },
      { accountId: "b", cents: 500 },
    ]);
    expect(effects({ kind: "transfer", amountCents: 40500, accountId: "uyu", toAccountId: "usd", toAmountCents: 1000 })).toEqual([
      { accountId: "uyu", cents: -40500 },
      { accountId: "usd", cents: 1000 },
    ]);
  });

  it("computeBalances = saldo inicial + efectos", () => {
    const b = computeBalances(
      [
        { id: "a", initialCents: 10000 },
        { id: "b", initialCents: 0 },
      ],
      [
        { ...base, kind: "expense", amountCents: 2500, accountId: "a" },
        { ...base, kind: "income", amountCents: 1000, accountId: "b" },
        { kind: "transfer", amountCents: 3000, accountId: "a", toAccountId: "b", toAmountCents: null },
      ],
    );
    expect(b).toEqual({ a: 4500, b: 4000 });
  });

  it("neto: transferencia entre dos elegidas de la misma moneda no mueve nada; con una sola, sí", () => {
    const tx: TxDTO = {
      id: "t",
      kind: "transfer",
      date: TODAY,
      title: null,
      amountCents: 3000,
      accountId: "a",
      categoryId: null,
      toAccountId: "b",
      toAmountCents: null,
      note: null,
      projectId: null,
      photos: [],
      installment: null,
    };
    const cur = () => "UYU";
    expect(netByCurrency([tx], null, cur)).toEqual({ UYU: 0 });
    expect(netByCurrency([tx], ["a", "b"], cur)).toEqual({ UYU: 0 });
    expect(netByCurrency([tx], ["a"], cur)).toEqual({ UYU: -3000 });
    expect(netByCurrency([tx], ["b"], cur)).toEqual({ UYU: 3000 });
  });

  it("flowOf: transferencias y ajustes no cuentan; un ingreso con categoría de gasto es reintegro", () => {
    const cats: Record<string, { kind: "expense" | "income"; adjustment?: boolean }> = {
      food: { kind: "expense" },
      salary: { kind: "income" },
      adj: { kind: "income", adjustment: true },
    };
    const of = (id: string | null) => (id ? cats[id] : undefined);
    expect(flowOf({ kind: "transfer", amountCents: 100, categoryId: null }, of)).toBeNull();
    expect(flowOf({ kind: "income", amountCents: 100, categoryId: "adj" }, of)).toBeNull();
    expect(flowOf({ kind: "income", amountCents: 100, categoryId: "food" }, of)).toEqual({ kind: "expense", cents: -100 });
    expect(flowOf({ kind: "income", amountCents: 100, categoryId: "salary" }, of)).toEqual({ kind: "income", cents: 100 });
    expect(flowOf({ kind: "expense", amountCents: 100, categoryId: null }, of)).toEqual({ kind: "expense", cents: 100 });
  });
});

describe("scopeOf (cuentas personales y de trabajo)", () => {
  const accounts = [
    { id: "itau", business: false },
    { id: "santander", business: true },
    { id: "efectivo", business: false },
  ];

  it("lo elegido a mano manda", () => {
    expect(scopeOf(["santander"], accounts)).toEqual(["santander"]);
  });

  it("'Todas' son las personales si hay cuentas de trabajo", () => {
    expect(scopeOf(null, accounts)).toEqual(["itau", "efectivo"]);
  });

  it("sin cuentas de trabajo sigue siendo null (todas)", () => {
    expect(scopeOf(null, [{ id: "itau", business: false }])).toBeNull();
  });
});

describe("período de Movimientos", () => {
  it("sin nada: el mes de hoy", () => {
    expect(periodFromParams({}, TODAY)).toEqual({ kind: "month", month: "2026-10", from: "2026-10-01", to: "2026-10-31" });
  });

  it("mes, mes inválido y febrero", () => {
    expect(periodFromParams({ mes: "2026-02" }, TODAY)).toMatchObject({ kind: "month", from: "2026-02-01", to: "2026-02-28" });
    expect(periodFromParams({ mes: "2028-02" }, TODAY)).toMatchObject({ to: "2028-02-29" });
    expect(periodFromParams({ mes: "2026-13" }, TODAY)).toMatchObject({ kind: "month", month: "2026-10" });
    expect(periodFromParams({ mes: ["2026-03"] }, TODAY)).toMatchObject({ kind: "month", month: "2026-03" });
  });

  it("año", () => {
    expect(periodFromParams({ anio: "2025" }, TODAY)).toEqual({ kind: "year", year: "2025", from: "2025-01-01", to: "2025-12-31" });
    expect(periodFromParams({ anio: "25" }, TODAY)).toMatchObject({ kind: "month" });
  });

  it("período: da vuelta las fechas, rechaza días que no existen y tiene tope de 5 años", () => {
    expect(periodFromParams({ desde: "2026-10-10", hasta: "2026-10-01" }, TODAY)).toEqual({ kind: "range", from: "2026-10-01", to: "2026-10-10" });
    expect(periodFromParams({ desde: "2026-02-30", hasta: "2026-03-10" }, TODAY)).toMatchObject({ kind: "month" });
    expect(periodFromParams({ desde: "2015-01-01", hasta: TODAY }, TODAY)).toEqual({ kind: "range", from: "2021-10-19", to: TODAY });
  });

  // BUG (finance-logic.ts:327): el tope de 5 años arma el inicio como "año − 5 + mes-día del fin";
  // si el fin es un 29 de febrero, el inicio queda en un día que no existe ("2023-02-29").
  it("período: el tope de 5 años no deja un inicio inexistente (fin el 29 de febrero)", () => {
    const p = periodFromParams({ desde: "2010-01-01", hasta: "2028-02-29" }, "2028-03-01");
    expect(isISODate(p.from)).toBe(true);
  });

  it("periodHref: el mes en curso sin parámetros", () => {
    expect(periodHref({ kind: "month", month: "2026-10" }, TODAY)).toBe("/gastos");
    expect(periodHref({ kind: "month", month: "2026-09" }, TODAY)).toBe("/gastos?mes=2026-09");
    expect(periodHref({ kind: "year", year: "2025" }, TODAY)).toBe("/gastos?anio=2025");
    expect(periodHref({ kind: "range", from: "2026-10-01", to: "2026-10-10" }, TODAY)).toBe("/gastos?desde=2026-10-01&hasta=2026-10-10");
    expect(periodHref({ kind: "month", month: "2026-09" }, TODAY, "/gastos/informes")).toBe("/gastos/informes?mes=2026-09");
  });

  it("periodHref y periodFromParams van y vuelven", () => {
    for (const p of [
      { kind: "month" as const, month: "2026-03" },
      { kind: "year" as const, year: "2024" },
      { kind: "range" as const, from: "2026-01-05", to: "2026-02-10" },
    ]) {
      const sp = Object.fromEntries(new URLSearchParams(periodHref(p, TODAY).split("?")[1]));
      expect(periodFromParams(sp, TODAY)).toMatchObject(p);
    }
  });
});
