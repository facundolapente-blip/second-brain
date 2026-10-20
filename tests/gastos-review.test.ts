import { describe, expect, it } from "vitest";
import { buildReview, choicesFor, findExchangePairs, looksLikeExchange, parseReviewed, summarizeChoices, type ReviewTx } from "@/lib/gastos-review-logic";

let n = 0;
const tx = (over: Partial<ReviewTx>): ReviewTx => ({
  id: `t${++n}`,
  date: "2026-09-10",
  kind: "expense",
  cents: 10000,
  accountId: "itau",
  accountName: "Itau",
  currency: "UYU",
  categoryId: "c",
  categoryName: "Casa",
  categoryKind: "expense",
  adjustment: false,
  title: null,
  note: null,
  ...over,
});
const usd = { accountId: "usd", accountName: "Dolares", currency: "USD" };

describe("cambios de dólares cargados como gasto + ingreso", () => {
  it("reconoce el título", () => {
    expect(looksLikeExchange({ title: "A pesos", note: null })).toBe(true);
    expect(looksLikeExchange({ title: "De dolares", note: null })).toBe(true);
    expect(looksLikeExchange({ title: "Gastos en pesos", note: null })).toBe(true);
    expect(looksLikeExchange({ title: "Cambio transa", note: null })).toBe(true);
    expect(looksLikeExchange({ title: "Pesos de la rifa", note: null })).toBe(false);
  });

  it("une 250 US$ 'A pesos' con $ 9.737 'A pesos' del mismo día", () => {
    const out = tx({ ...usd, date: "2026-08-02", cents: 25000, title: "A pesos" });
    const inc = tx({ date: "2026-08-02", kind: "income", cents: 973700, title: "A pesos", categoryKind: "income" });
    const { pairs, loose } = findExchangePairs([out, inc]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].out.id).toBe(out.id);
    expect(pairs[0].in.id).toBe(inc.id);
    expect(pairs[0].rate).toBeCloseTo(38.95, 1);
    expect(loose).toEqual([]);
  });

  it("alcanza con que uno de los dos lo diga ('Gastos vivir' + 'De dolares')", () => {
    const out = tx({ ...usd, date: "2026-09-06", cents: 12755, title: "Gastos vivir" });
    const inc = tx({ date: "2026-09-06", kind: "income", cents: 500000, title: "De dolares" });
    expect(findExchangePairs([out, inc]).pairs).toHaveLength(1);
  });

  it("no une si la cotización no tiene sentido o pasaron más de 3 días", () => {
    const out = tx({ ...usd, date: "2026-09-06", cents: 12755, title: "A pesos" });
    expect(findExchangePairs([out, tx({ date: "2026-09-06", kind: "income", cents: 50000, title: "De dolares" })]).pairs).toHaveLength(0);
    expect(findExchangePairs([out, tx({ date: "2026-09-12", kind: "income", cents: 500000, title: "De dolares" })]).pairs).toHaveLength(0);
  });

  it("cada movimiento va en un solo par (gana el más parecido) y el que sobra queda sin pareja", () => {
    const a = tx({ ...usd, date: "2026-09-14", cents: 13166, title: "A pesos" });
    const b = tx({ ...usd, date: "2026-09-15", cents: 10000, title: "A pesos" });
    const inc = tx({ date: "2026-09-14", kind: "income", cents: 518100, title: "De dolares" });
    const { pairs, loose } = findExchangePairs([a, b, inc]);
    expect(pairs.map((p) => p.out.id)).toEqual([a.id]);
    expect(loose.map((t) => t.id)).toEqual([b.id]);
  });

  it("la otra mitad puede ser un ajuste de saldo", () => {
    const out = tx({ ...usd, date: "2026-10-04", cents: 15571, title: "Gastos en pesos" });
    const aj = tx({ date: "2026-10-04", kind: "income", cents: 616200, adjustment: true, categoryName: "Ajuste de saldo" });
    expect(findExchangePairs([out, aj]).pairs).toHaveLength(1);
  });
});

describe("buildReview: trabajo y mamá", () => {
  it("ventas de discos, compras en Trabajo y Arcano se proponen al negocio; 'Disco' el súper no aparece", () => {
    const compra = tx({ ...usd, cents: 45620, title: "Discos", categoryName: "Trabajo" });
    const venta = tx({ kind: "income", cents: 130000, title: "Venta disco", categoryName: "Salario", categoryKind: "income" });
    const anuncios = tx({ ...usd, cents: 3900, title: "Anuncios Arcano", categoryName: "Trabajo" });
    const super_ = tx({ ...usd, cents: 8086, title: "Disco casa", categoryName: "Supermercado" });
    const resto = tx({ cents: 25000, title: "Disco", categoryName: "Restaurante" });
    const r = buildReview([compra, venta, anuncios, super_, resto]);
    expect(Object.fromEntries(r.trabajo.map((i) => [i.tx.title, i.proposal]))).toEqual({ Discos: "trabajo", "Venta disco": "trabajo", "Anuncios Arcano": "trabajo" });
  });

  it("los sueldos en Trabajo y las compras de vinilos personales aparecen, pero sin proponer nada", () => {
    const sueldo = tx({ kind: "income", cents: 1632500, title: "Sueldo HM", categoryName: "Trabajo", categoryKind: "income" });
    const vinilos = tx({ ...usd, cents: 17804, title: "Vinilos", categoryName: "Entretenimiento" });
    const r = buildReview([sueldo, vinilos]);
    expect(Object.fromEntries(r.trabajo.map((i) => [i.tx.title, i.proposal]))).toEqual({ "Sueldo HM": "keep", Vinilos: "keep" });
  });

  it("'Disco mama' es el súper que pagó mamá: va a mamá; un regalo se propone dejar", () => {
    const a = tx({ kind: "income", cents: 120000, title: "Disco mama", categoryKind: "income" });
    const b = tx({ cents: 75500, title: "Regalo mama" });
    const r = buildReview([a, b]);
    expect(r.trabajo).toEqual([]);
    expect(Object.fromEntries(r.mama.map((i) => [i.tx.title, i.proposal]))).toEqual({ "Disco mama": "mama", "Regalo mama": "keep" });
  });

  it("lo que nombra a mamá va a mamá; un ingreso de Casa con 'nafta' aparece sin proponer nada", () => {
    const a = tx({ kind: "income", cents: 200000, title: "mama x comida", categoryKind: "income" });
    const b = tx({ cents: 400000, title: "Psiquiatra (paga mama)", categoryName: "Salud y belleza" });
    const c = tx({ kind: "income", cents: 120000, title: "X nafta", categoryKind: "income" });
    const d = tx({ kind: "income", cents: 9200, title: "Iva", categoryKind: "income" });
    const r = buildReview([a, b, c, d]);
    expect(Object.fromEntries(r.mama.map((i) => [i.tx.title, i.proposal]))).toEqual({
      "mama x comida": "mama",
      "Psiquiatra (paga mama)": "mama",
      "X nafta": "keep",
    });
  });

  it("opciones: el aporte solo para gastos", () => {
    expect(choicesFor("trabajo", { kind: "expense" })).toEqual(["trabajo", "aporte", "keep"]);
    expect(choicesFor("trabajo", { kind: "income" })).toEqual(["trabajo", "keep"]);
    expect(choicesFor("mama", { kind: "income" })).toEqual(["mama", "keep"]);
  });

  it("un ajuste de saldo como pareja: solo el mismo día o el siguiente", () => {
    const out = tx({ ...usd, date: "2026-10-02", cents: 7734, title: "A pesos" });
    const aj = tx({ date: "2026-09-30", kind: "income", cents: 261500, adjustment: true, categoryName: "Ajuste de saldo" });
    expect(findExchangePairs([out, aj]).pairs).toHaveLength(0);
  });

  it("resumen del botón y lista de revisados", () => {
    expect(summarizeChoices({ a: "transfer", b: "keep" }, { x: "trabajo", y: "mama", z: "keep", w: "cat:1" })).toEqual({
      transfers: 1,
      trabajo: 1,
      aporte: 0,
      mama: 1,
      other: 1,
      total: 4,
    });
    expect([...parseReviewed('["a","b",3]')]).toEqual(["a", "b"]);
    expect(parseReviewed("nada").size).toBe(0);
  });
});
