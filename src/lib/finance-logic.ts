/**
 * Reglas puras de Gastos (sin base): sirven en el servidor y en el cliente.
 *
 * Todos los montos viajan en CENTAVOS enteros (nunca floats de pesos) para que
 * las sumas no acumulen error. En la base son Decimal(14,2) siempre positivos y
 * el signo lo da el tipo de movimiento; acá se traduce a "efectos" con signo
 * sobre cada cuenta, que es lo único que se suma.
 */
import { diffDays, formatLong, formatMonth, formatShort, isISODate, monthBounds, todayISO } from "./dates";

export type TxKind = "expense" | "income" | "transfer";
export const TX_KINDS: TxKind[] = ["expense", "income", "transfer"];

export type AccountDTO = {
  id: string;
  name: string;
  type: string;
  currency: string;
  icon: string;
  color: string;
  initialCents: number;
  /** Saldo actual (todo el historial, también movimientos con fecha futura). */
  balanceCents: number;
  order: number;
  archived: boolean;
  txCount: number;
  /** Tarjeta de crédito: día de cierre y de vencimiento, límite. */
  closingDay: number | null;
  dueDay: number | null;
  limitCents: number | null;
};

export type CategoryDTO = {
  id: string;
  name: string;
  kind: "expense" | "income";
  icon: string;
  color: string;
  order: number;
  txCount: number;
  /** "Ajuste de saldo": no cuenta como gasto ni ingreso. */
  adjustment?: boolean;
};

export type TxDTO = {
  id: string;
  kind: TxKind;
  date: string;
  title: string | null;
  amountCents: number;
  accountId: string;
  categoryId: string | null;
  toAccountId: string | null;
  toAmountCents: number | null;
  note: string | null;
  /** Presupuesto puntual al que está asignado. */
  projectId: string | null;
  /** Comprobantes (fotos). */
  photos: { id: string; width: number | null; height: number | null }[];
  /** Cuota de una compra en cuotas. */
  installment: { group: string; no: number; count: number } | null;
};

export type TemplateDTO = {
  id: string;
  name: string;
  kind: TxKind;
  title: string | null;
  amountCents: number | null;
  accountId: string | null;
  categoryId: string | null;
  toAccountId: string | null;
  toAmountCents: number | null;
  note: string | null;
};

/** Ícono de cuenta según su tipo (claves de src/lib/finance-icons.tsx). */
export const ACCOUNT_TYPE_ICON: Record<string, string> = {
  cash: "Money",
  bank: "Bank",
  card: "CreditCard",
  savings: "PiggyBank",
  investment: "ChartLineUp",
};

/** Cuentas elegidas en el selector. null = todas. */
export type Selection = string[] | null;

/** Cookie con las cuentas elegidas (ids separados por coma; sin cookie = todas). */
export const SELECTION_COOKIE = "gastos_cuentas";

/** Descarta ids que ya no existen; si no queda ninguno, todas. */
export function normalizeSelection(sel: Selection, accountIds: string[]): Selection {
  if (!sel) return null;
  const valid = sel.filter((id) => accountIds.includes(id));
  return valid.length ? valid : null;
}

// ─── Montos ─────────────────────────────────────────────────────────────────

/** Decimal de Prisma (o string/number) a centavos, sin pasar por float. */
export function toCents(d: { toFixed(n: number): string } | string | number): number {
  const s = typeof d === "object" ? d.toFixed(2) : Number(d).toFixed(2);
  const neg = s.startsWith("-");
  const [int, dec = "00"] = s.replace("-", "").split(".");
  const cents = Number(int) * 100 + Number(dec.padEnd(2, "0").slice(0, 2));
  return neg ? -cents : cents;
}

/** Centavos al string que entiende Decimal: 123456 -> "1234.56". */
export function centsToDecimalString(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(Math.round(cents));
  return `${neg ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/**
 * Lee un monto escrito a mano y devuelve centavos (o null si no se entiende).
 * Acepta "1250", "1.250", "1.250,50", "1250,5", "1250.50", "$ 1.250".
 * Con coma, la coma es decimal. Con solo puntos, "1.250" son miles y "12.5" es decimal.
 */
export function parseAmount(raw: string): number | null {
  let s = raw.replace(/[^\d.,-]/g, "");
  if (!s || s.includes("-")) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    const dec = lastComma > lastDot ? "," : ".";
    const thou = dec === "," ? "." : ",";
    s = s.split(thou).join("").replace(dec, ".");
  } else if (lastComma >= 0) {
    s = s.split(".").join("").replace(/,(?=.*,)/g, "").replace(",", ".");
  } else if (lastDot >= 0) {
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.split(".").join("");
    else if ((s.match(/\./g) ?? []).length > 1) return null;
  }
  if (!/^\d*\.?\d*$/.test(s) || s === ".") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0 || n >= 1e12) return null;
  return Math.round(n * 100);
}

/** Centavos al texto que se muestra en un campo de monto ("1250,5" -> "1250,50"). */
export function centsToInput(cents: number | null | undefined): string {
  if (!cents) return "";
  const abs = Math.abs(cents);
  const int = Math.floor(abs / 100);
  const dec = abs % 100;
  return dec ? `${int},${String(dec).padStart(2, "0")}` : String(int);
}

// ─── Efectos sobre las cuentas ──────────────────────────────────────────────

export type Effect = { accountId: string; cents: number };

/** Lo que un movimiento le hace a cada cuenta, con signo. */
export function effects(tx: Pick<TxDTO, "kind" | "amountCents" | "accountId" | "toAccountId" | "toAmountCents">): Effect[] {
  if (tx.kind === "expense") return [{ accountId: tx.accountId, cents: -tx.amountCents }];
  if (tx.kind === "income") return [{ accountId: tx.accountId, cents: tx.amountCents }];
  const out: Effect[] = [{ accountId: tx.accountId, cents: -tx.amountCents }];
  if (tx.toAccountId) out.push({ accountId: tx.toAccountId, cents: tx.toAmountCents ?? tx.amountCents });
  return out;
}

export function isSelected(sel: Selection, accountId: string): boolean {
  return sel === null || sel.includes(accountId);
}

/** ¿El movimiento toca alguna de las cuentas elegidas? */
export function touchesSelection(tx: TxDTO, sel: Selection): boolean {
  return isSelected(sel, tx.accountId) || (!!tx.toAccountId && isSelected(sel, tx.toAccountId));
}

/** Totales por moneda: { UYU: 120000, USD: -4050 }. */
export type CurrencyTotals = Record<string, number>;

export function addTo(totals: CurrencyTotals, currency: string, cents: number) {
  totals[currency] = (totals[currency] ?? 0) + cents;
}

/**
 * Neto por moneda de un conjunto de movimientos, mirado desde las cuentas
 * elegidas: una transferencia entre dos cuentas elegidas de la misma moneda da 0;
 * si solo una de las dos está elegida, cuenta como entrada o salida.
 */
export function netByCurrency(txs: TxDTO[], sel: Selection, currencyOf: (accountId: string) => string): CurrencyTotals {
  const t: CurrencyTotals = {};
  for (const tx of txs) {
    for (const e of effects(tx)) {
      if (isSelected(sel, e.accountId)) addTo(t, currencyOf(e.accountId), e.cents);
    }
  }
  return t;
}

/** Saldo por moneda de las cuentas elegidas. */
export function balanceByCurrency(accounts: AccountDTO[], sel: Selection): CurrencyTotals {
  const t: CurrencyTotals = {};
  for (const a of accounts) if (isSelected(sel, a.id)) addTo(t, a.currency, a.balanceCents);
  return t;
}

/** Monedas en orden fijo: UYU primero, después USD, después el resto. */
export function sortedCurrencies(t: CurrencyTotals): string[] {
  const rank = (c: string) => (c === "UYU" ? 0 : c === "USD" ? 1 : 2);
  return Object.keys(t).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/** Saldo de cada cuenta a partir del saldo inicial y los movimientos. */
export function computeBalances(
  accounts: { id: string; initialCents: number }[],
  txs: Pick<TxDTO, "kind" | "amountCents" | "accountId" | "toAccountId" | "toAmountCents">[],
): Record<string, number> {
  const b: Record<string, number> = Object.fromEntries(accounts.map((a) => [a.id, a.initialCents]));
  for (const tx of txs) for (const e of effects(tx)) b[e.accountId] = (b[e.accountId] ?? 0) + e.cents;
  return b;
}

// ─── Agrupación por día ─────────────────────────────────────────────────────

export type DayGroup = { date: string; txs: TxDTO[]; net: CurrencyTotals };

/** Movimientos agrupados por día, del más nuevo al más viejo. */
export function groupByDay(txs: TxDTO[], sel: Selection, currencyOf: (id: string) => string): DayGroup[] {
  const map = new Map<string, TxDTO[]>();
  for (const tx of txs) {
    const list = map.get(tx.date);
    if (list) list.push(tx);
    else map.set(tx.date, [tx]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([date, list]) => ({ date, txs: list, net: netByCurrency(list, sel, currencyOf) }));
}

/**
 * Rótulo de un día como en la app de Facu: "Hoy", "Ayer", "Anteayer",
 * "Hace 3 días" (hasta 6) y después la fecha. A futuro: "Mañana", "En 3 días".
 */
// ─── Período de Movimientos ─────────────────────────────────────────────────

/** Lo que se ve en Movimientos: un mes, un año o un período con inicio y fin (días inclusive). */
export type Period =
  | { kind: "month"; month: string; from: string; to: string }
  | { kind: "year"; year: string; from: string; to: string }
  | { kind: "range"; from: string; to: string };

const MAX_RANGE_DAYS = 366 * 5;

/** Período desde la URL: ?desde=&hasta= (período), ?anio= (año) o ?mes= (mes; sin nada, el de hoy). */
export function periodFromParams(sp: { mes?: unknown; anio?: unknown; desde?: unknown; hasta?: unknown }, today = todayISO()): Period {
  const s = (v: unknown) => (typeof v === "string" ? v : Array.isArray(v) ? String(v[0] ?? "") : "");
  let from = s(sp.desde);
  let to = s(sp.hasta);
  if (isISODate(from) && isISODate(to)) {
    if (from > to) [from, to] = [to, from];
    // Tope de 5 años para no traer la base entera de una vez.
    if (diffDays(to, from) > MAX_RANGE_DAYS) from = to.slice(0, 4) === from.slice(0, 4) ? from : `${Number(to.slice(0, 4)) - 5}${to.slice(4)}`;
    return { kind: "range", from, to };
  }
  const anio = s(sp.anio);
  if (/^(19|20)\d{2}$/.test(anio)) return { kind: "year", year: anio, from: `${anio}-01-01`, to: `${anio}-12-31` };
  const mes = s(sp.mes);
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) ? mes : today.slice(0, 7);
  return { kind: "month", month, ...monthBounds(month) };
}

/** URL de un período (el mes en curso queda sin parámetros). */
export function periodHref(
  p: { kind: "month"; month: string } | { kind: "year"; year: string } | { kind: "range"; from: string; to: string },
  today = todayISO(),
  basePath = "/gastos",
): string {
  if (p.kind === "month") return p.month === today.slice(0, 7) ? basePath : `${basePath}?mes=${p.month}`;
  if (p.kind === "year") return `${basePath}?anio=${p.year}`;
  return `${basePath}?desde=${p.from}&hasta=${p.to}`;
}

/** "octubre 2026", "2026" o "3 ago 2026 – 15 oct 2026". */
export function periodLabel(p: Period): string {
  if (p.kind === "month") return formatMonth(p.month);
  if (p.kind === "year") return p.year;
  const f = (iso: string) => `${formatShort(iso)} ${iso.slice(0, 4)}`;
  return p.from === p.to ? f(p.from) : `${f(p.from)} – ${f(p.to)}`;
}

/** Si hoy cae dentro del período. */
export function periodIncludes(p: Period, iso: string): boolean {
  return iso >= p.from && iso <= p.to;
}

export function dayLabel(iso: string, today = todayISO()): { label: string; relative: boolean } {
  const d = diffDays(today, iso);
  if (d === 0) return { label: "Hoy", relative: true };
  if (d === 1) return { label: "Ayer", relative: true };
  if (d === 2) return { label: "Anteayer", relative: true };
  if (d > 2 && d <= 6) return { label: `Hace ${d} días`, relative: true };
  if (d === -1) return { label: "Mañana", relative: true };
  if (d < -1 && d >= -6) return { label: `En ${-d} días`, relative: true };
  // De otro año, con el año (al ver un año entero o un período largo).
  const long = formatLong(iso) + (iso.slice(0, 4) !== today.slice(0, 4) ? ` de ${iso.slice(0, 4)}` : "");
  return { label: long.charAt(0).toUpperCase() + long.slice(1), relative: false };
}

// ─── Informes ───────────────────────────────────────────────────────────────

/** Fila mínima para análisis (gastos e ingresos; las transferencias no son consumo). */
export type FlowRow = {
  date: string;
  kind: "expense" | "income";
  accountId: string;
  categoryId: string | null;
  cents: number;
};

/**
 * Cómo cuenta un movimiento en gastos e ingresos: las transferencias y los
 * ajustes de saldo no cuentan; un ingreso con categoría de gasto es un
 * reintegro y resta de ese gasto (cents negativos).
 */
export function flowOf(
  tx: Pick<TxDTO, "kind" | "amountCents" | "categoryId">,
  categoryOf: (id: string | null) => Pick<CategoryDTO, "kind" | "adjustment"> | undefined,
): { kind: "expense" | "income"; cents: number } | null {
  if (tx.kind === "transfer") return null;
  const c = categoryOf(tx.categoryId);
  if (c?.adjustment) return null;
  if (tx.kind === "income" && c?.kind === "expense") return { kind: "expense", cents: -tx.amountCents };
  return { kind: tx.kind, cents: tx.amountCents };
}

export function toFlowRows(txs: TxDTO[]): FlowRow[] {
  const rows: FlowRow[] = [];
  for (const t of txs) {
    if (t.kind === "transfer") continue;
    rows.push({ date: t.date, kind: t.kind, accountId: t.accountId, categoryId: t.categoryId, cents: t.amountCents });
  }
  return rows;
}

/** Total por categoría (null = sin clasificar), de mayor a menor. */
export function byCategory(rows: FlowRow[], kind: "expense" | "income"): { categoryId: string | null; cents: number }[] {
  const m = new Map<string | null, number>();
  for (const r of rows) if (r.kind === kind) m.set(r.categoryId, (m.get(r.categoryId) ?? 0) + r.cents);
  return [...m.entries()].map(([categoryId, cents]) => ({ categoryId, cents })).sort((a, b) => b.cents - a.cents);
}

/** Gasto e ingreso por mes ("YYYY-MM"), para los meses pedidos (en ese orden). */
export function byMonth(rows: FlowRow[], months: string[]): { month: string; expense: number; income: number }[] {
  const m = new Map(months.map((k) => [k, { month: k, expense: 0, income: 0 }]));
  for (const r of rows) {
    const e = m.get(r.date.slice(0, 7));
    if (e) e[r.kind] += r.cents;
  }
  return months.map((k) => m.get(k)!);
}
