/**
 * Gastos fijos de Presupuestos (2026-10-25): lo que se paga todos los meses, separado en
 * lo que paga Facu, lo que le pagan y lo pausado (no suma), más el plan "Si vivo solo". Reglas puras (cliente y servidor).
 */

export const BUDGET_LISTS = ["mine", "paid", "paused", "solo"] as const;
export type BudgetList = (typeof BUDGET_LISTS)[number];

export const LIST_LABEL: Record<BudgetList, string> = {
  mine: "Lo pago yo",
  paid: "Me lo pagan",
  paused: "Pausado",
  solo: "Si vivo solo",
};

export const isBudgetList = (v: unknown): v is BudgetList => (BUDGET_LISTS as readonly string[]).includes(String(v));

/** Cada cuánto se paga (con `times`: cuántas veces en ese período). */
export const FREQS = ["month", "week", "quarter", "year"] as const;
export type Freq = (typeof FREQS)[number];
export const FREQ_LABEL: Record<Freq, string> = { month: "Mensual", week: "Semanal", quarter: "Trimestral", year: "Anual" };
const FREQ_PER: Record<Freq, string> = { month: "por mes", week: "por semana", quarter: "por trimestre", year: "por año" };
/** Cuántas veces entra el período en un mes (una semana: 52 / 12). */
const PER_MONTH: Record<Freq, number> = { month: 1, week: 52 / 12, quarter: 1 / 3, year: 1 / 12 };
export const isFreq = (v: unknown): v is Freq => (FREQS as readonly string[]).includes(String(v));
export const MAX_TIMES = 31;

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
  freq: Freq;
  /** Veces en cada período (1 = una vez). */
  times: number;
};

/** Lo que sale por mes: monto × veces × (períodos por mes), en centavos. Sin monto, null. */
export function monthlyCents(l: Pick<BudgetLineDTO, "amountCents" | "freq" | "times">): number | null {
  if (l.amountCents === null) return null;
  return Math.round(l.amountCents * Math.max(1, l.times) * PER_MONTH[l.freq]);
}

/** "Mensual", "Anual", "4× por mes", "2× por semana". */
export function freqText(l: Pick<BudgetLineDTO, "freq" | "times">): string {
  return l.times > 1 ? `${l.times}× ${FREQ_PER[l.freq]}` : FREQ_LABEL[l.freq];
}

/** Mensual una vez = nada que aclarar. */
export const isPlainMonthly = (l: Pick<BudgetLineDTO, "freq" | "times">) => l.freq === "month" && l.times <= 1;

export type LineTotal = {
  /** Lo de cada moneda, tal cual. */
  byCurrency: Record<string, number>;
  /** Todo pasado a pesos (cada moneda a pesos enteros, como Inicio). */
  uyuCents: number;
  count: number;
};

/** Suma por mes de una lista (cada renglón con su frecuencia; sin las que no tienen monto). `toUyu` = pesos por 1 de cada moneda. */
export function lineTotal(lines: BudgetLineDTO[], toUyu: Record<string, number>): LineTotal {
  const byCurrency: Record<string, number> = {};
  for (const l of lines) {
    const m = monthlyCents(l);
    if (m === null) continue;
    byCurrency[l.currency] = (byCurrency[l.currency] ?? 0) + m;
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

/** Colores de las etiquetas de categoría (sin los de "Quién paga": petróleo, violeta y gris). */
export const CATEGORY_COLORS = ["blue", "orange", "green", "pink", "yellow", "red", "brown"] as const;
export const CATEGORY_COLORS_KEY = "gastos_fijos_categoria_colores";

/**
 * Le da color a las categorías que no tienen: el primero que no usa otra (si se acaban, vuelve
 * a empezar). Las que ya tenían no cambian. Devuelve el mapa completo y si hubo algo nuevo.
 */
export function assignCategoryColors(categories: string[], saved: Record<string, string>): { colors: Record<string, string>; changed: boolean } {
  const colors = { ...saved };
  let changed = false;
  for (const c of [...new Set(categories)].sort((a, b) => a.localeCompare(b, "es"))) {
    if (colors[c]) continue;
    const used = new Set(Object.values(colors));
    const free = CATEGORY_COLORS.find((k) => !used.has(k));
    colors[c] = free ?? CATEGORY_COLORS[Object.keys(colors).length % CATEGORY_COLORS.length];
    changed = true;
  }
  return { colors, changed };
}

export function parseColorMap(raw: string | null | undefined): Record<string, string> {
  try {
    const v = JSON.parse(raw ?? "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).filter(([, c]) => typeof c === "string")) as Record<string, string> : {};
  } catch {
    return {};
  }
}

/** Columnas de la tabla de gastos fijos (compu), con su ancho de entrada en px. */
export const FIXED_COLUMNS = [
  { key: "name", label: "Gasto", width: 250 },
  { key: "category", label: "Categoría", width: 170 },
  { key: "amount", label: "Monto", width: 120 },
  { key: "freq", label: "Frecuencia", width: 140 },
  { key: "monthly", label: "Por mes", width: 120 },
  { key: "payer", label: "Quién paga", width: 140 },
] as const;
export type FixedColumnKey = (typeof FIXED_COLUMNS)[number]["key"];
export type FixedColumnWidths = Partial<Record<FixedColumnKey, number>>;
export const FIXED_COLUMNS_KEY = "gastos_fijos_columnas";
export const FIXED_COLUMN_MIN = 60;
export const FIXED_COLUMN_MAX = 640;

/** Los anchos guardados, solo los que valen (entre el mínimo y el máximo). */
export function parseFixedWidths(raw: string | null | undefined): FixedColumnWidths {
  const out: FixedColumnWidths = {};
  try {
    const v = JSON.parse(raw ?? "{}") as Record<string, unknown>;
    for (const c of FIXED_COLUMNS) {
      const w = Number(v?.[c.key]);
      if (Number.isFinite(w)) out[c.key] = Math.round(Math.min(FIXED_COLUMN_MAX, Math.max(FIXED_COLUMN_MIN, w)));
    }
  } catch {
    /* vacío */
  }
  return out;
}

/** Nombre de una categoría: sin espacios de más, hasta 40 caracteres. */
export const cleanCategory = (s: unknown) => String(s ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
