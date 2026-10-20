import { describe, expect, it } from "vitest";
import {
  flowOf,
  netPassThrough,
  passLabel,
  personalFlowRows,
  PASS_CATEGORY_ID,
  txFlowEntries,
  type CategoryDTO,
  type FlowRow,
  type PassIn,
  type TxDTO,
} from "@/lib/finance-logic";

const p = (date: string, kind: "expense" | "income", cents: number, currency = "UYU"): PassIn => ({ date, kind, cents, currency, accountId: "itau" });
const sum = (rows: { kind: string; cents: number }[], kind: string) => rows.filter((r) => r.kind === kind).reduce((n, r) => n + r.cents, 0);

describe("netPassThrough: plata de otra persona", () => {
  it("me dieron 2.000 y gasté 1.800: cuentan 200 de ingreso", () => {
    const out = netPassThrough([p("2026-10-03", "income", 200000), p("2026-10-05", "expense", 180000)]);
    expect(sum(out, "income")).toBe(20000);
    expect(sum(out, "expense")).toBe(0);
  });

  it("gasté más de lo que me dieron: la diferencia es gasto", () => {
    const out = netPassThrough([p("2026-10-03", "expense", 150000), p("2026-10-10", "income", 100000)]);
    expect(sum(out, "expense")).toBe(50000);
    expect(sum(out, "income")).toBe(0);
    // El día de la compra cuenta todo y el del reintegro lo descuenta.
    expect(out.find((r) => r.date === "2026-10-03")?.cents).toBe(150000);
    expect(out.find((r) => r.date === "2026-10-10")?.cents).toBe(-100000);
  });

  it("todo devuelto justo: no cuenta nada en el mes", () => {
    const out = netPassThrough([p("2026-10-03", "expense", 120000), p("2026-10-04", "income", 120000)]);
    expect(sum(out, "expense")).toBe(0);
    expect(sum(out, "income")).toBe(0);
  });

  it("por mes: no se compensa con el mes siguiente", () => {
    const out = netPassThrough([p("2026-09-28", "income", 200000), p("2026-10-02", "expense", 180000)]);
    expect(sum(out.filter((r) => r.date.startsWith("2026-09")), "income")).toBe(200000);
    expect(sum(out.filter((r) => r.date.startsWith("2026-10")), "expense")).toBe(180000);
  });

  it("por moneda: los dólares no se mezclan con los pesos", () => {
    const out = netPassThrough([p("2026-10-03", "income", 200000), p("2026-10-03", "expense", 5000, "USD")]);
    expect(out.filter((r) => r.currency === "USD").map((r) => [r.kind, r.cents])).toEqual([["expense", 5000]]);
    expect(out.filter((r) => r.currency === "UYU").map((r) => [r.kind, r.cents])).toEqual([["income", 200000]]);
  });

  it("varios movimientos el mismo día se juntan en uno", () => {
    const out = netPassThrough([p("2026-10-03", "income", 100000), p("2026-10-03", "expense", 30000), p("2026-10-03", "expense", 20000)]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "income", cents: 50000 });
  });
});

describe("passLabel", () => {
  it("Gastos mamá + Ingresos mamá = Diferencia con mamá", () => {
    expect(passLabel(["Gastos mamá", "Ingresos mamá"])).toBe("Diferencia con mamá");
  });
  it("si son de personas distintas, genérico", () => {
    expect(passLabel(["Gastos mamá", "Ingresos papá"])).toBe("Diferencia de plata de otros");
    expect(passLabel([])).toBe("Diferencia de plata de otros");
  });
});

describe("personalFlowRows y txFlowEntries", () => {
  const row = (over: Partial<FlowRow>): FlowRow => ({ id: "x", title: null, date: "2026-10-05", kind: "expense", accountId: "itau", categoryId: "c", cents: 1000, ...over });

  it("saca las de trabajo con 'Personales' y deja la diferencia de la plata ajena", () => {
    const out = personalFlowRows(
      [
        row({ id: "super", cents: 50000 }),
        row({ id: "disco", cents: 900000, business: true }),
        row({ id: "dio", kind: "income", cents: 200000, pass: true }),
        row({ id: "gaste", cents: 180000, pass: true }),
      ],
      () => "UYU",
      true,
    );
    expect(out.map((r) => r.id)).not.toContain("disco");
    expect(out.find((r) => r.categoryId === PASS_CATEGORY_ID)).toMatchObject({ kind: "income", cents: 20000 });
    expect(sum(out, "expense")).toBe(50000);
  });

  it("con cuentas elegidas a mano, lo de trabajo se ve", () => {
    const out = personalFlowRows([row({ id: "disco", business: true })], () => "UYU", false);
    expect(out.map((r) => r.id)).toEqual(["disco"]);
  });

  const cats = new Map<string, Pick<CategoryDTO, "kind" | "adjustment" | "business" | "pass">>([
    ["super", { kind: "expense" }],
    ["trabajo", { kind: "expense", business: true }],
    ["gmama", { kind: "expense", pass: true }],
    ["imama", { kind: "income", pass: true }],
  ]);
  const tx = (id: string, kind: TxDTO["kind"], categoryId: string, amountCents: number): TxDTO =>
    ({ id, kind, categoryId, amountCents, date: "2026-10-05", accountId: "itau" }) as TxDTO;
  const lookup = (id: string | null) => (id ? cats.get(id) : undefined);

  it("Movimientos: la plata de mamá cuenta por la diferencia y el trabajo no, con Personales", () => {
    const txs = [tx("1", "expense", "super", 30000), tx("2", "expense", "trabajo", 500000), tx("3", "income", "imama", 200000), tx("4", "expense", "gmama", 180000)];
    const out = txFlowEntries(txs, lookup, () => "UYU", true);
    expect(sum(out, "expense")).toBe(30000);
    expect(sum(out, "income")).toBe(20000);
    expect(out.find((f) => f.kind === "income")?.categoryId).toBe(PASS_CATEGORY_ID);
    // Sin "Personales", el trabajo sí cuenta.
    expect(sum(txFlowEntries(txs, lookup, () => "UYU", false), "expense")).toBe(530000);
  });

  it("flowOf: las opciones de trabajo y de plata ajena", () => {
    expect(flowOf(tx("2", "expense", "trabajo", 100), lookup)).toEqual({ kind: "expense", cents: 100 });
    expect(flowOf(tx("2", "expense", "trabajo", 100), lookup, { personal: true })).toBeNull();
    expect(flowOf(tx("4", "expense", "gmama", 100), lookup, { skipPass: true })).toBeNull();
  });
});
