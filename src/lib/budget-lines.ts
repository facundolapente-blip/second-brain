/**
 * Gastos fijos de Presupuestos (2026-10-25): lo que se paga todos los meses, separado en
 * lo que paga Facu y lo que le pagan, más el plan "Si vivo solo". Reglas puras (cliente y servidor).
 */

export const BUDGET_LISTS = ["mine", "paid", "solo"] as const;
export type BudgetList = (typeof BUDGET_LISTS)[number];

export const LIST_LABEL: Record<BudgetList, string> = {
  mine: "Lo pago yo",
  paid: "Me lo pagan",
  solo: "Si vivo solo",
};

export const isBudgetList = (v: unknown): v is BudgetList => (BUDGET_LISTS as readonly string[]).includes(String(v));

export type BudgetLineDTO = {
  id: string;
  list: BudgetList;
  name: string;
  /** null = sin monto (todavía no se sabe o no se cobra por mes). */
  amountCents: number | null;
  currency: string;
  category: string | null;
  variable: boolean;
  wouldCut: boolean;
  note: string | null;
  order: number;
};

export type LineTotal = {
  /** Lo de cada moneda, tal cual. */
  byCurrency: Record<string, number>;
  /** Todo pasado a pesos (cada moneda a pesos enteros, como Inicio). */
  uyuCents: number;
  count: number;
};

/** Suma de una lista (sin las que no tienen monto). `toUyu` = pesos por 1 de cada moneda. */
export function lineTotal(lines: BudgetLineDTO[], toUyu: Record<string, number>): LineTotal {
  const byCurrency: Record<string, number> = {};
  for (const l of lines) {
    if (l.amountCents === null) continue;
    byCurrency[l.currency] = (byCurrency[l.currency] ?? 0) + l.amountCents;
  }
  let uyuCents = 0;
  for (const [cur, cents] of Object.entries(byCurrency)) {
    uyuCents += cur === "UYU" ? cents : Math.round((cents / 100) * (toUyu[cur] ?? 0)) * 100;
  }
  return { byCurrency, uyuCents, count: lines.length };
}

export function byLineOrder(a: BudgetLineDTO, b: BudgetLineDTO): number {
  return a.order - b.order || a.name.localeCompare(b.name, "es");
}

/** Montos de Notion: "30.000,00 UYU", "16,39 US$", "1500,00 UYU" → centavos y moneda. */
export function parseNotionMoney(raw: string): { cents: number; currency: string } | null {
  const s = raw.trim();
  if (!s) return null;
  const currency = /US\$|USD/i.test(s) ? "USD" : "UYU";
  const num = s.replace(/[^\d.,]/g, "").replace(/\./g, "").replace(",", ".");
  if (!num || isNaN(Number(num))) return null;
  return { cents: Math.round(Number(num) * 100), currency };
}
