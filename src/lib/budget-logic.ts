/**
 * Presupuestos (servidor y cliente): mensual por categoría y puntuales
 * (viajes, vacaciones). Todo en centavos enteros.
 */

export type CategoryBudgetDTO = {
  categoryId: string;
  /** Lo disponible este mes: el monto mensual más lo que sobró antes (con arrastre). */
  amountCents: number;
  /** El monto mensual que se puso (lo que edita el formulario). */
  monthlyCents: number;
  /** Lo que sobró de meses anteriores y se suma a este (0 sin arrastre). */
  carriedCents: number;
  /** "Pasar lo que sobra al mes siguiente". */
  rollover: boolean;
  currency: string;
  /** Gastado en el mes, en esa moneda (lo de otras monedas, pasado con la cotización de hoy). */
  spentCents: number;
  /** Lo gastado en otras monedas (neto de reintegros), en su moneda y su equivalente. */
  foreign: ForeignSpend[];
};

export type ForeignSpend = { currency: string; cents: number; equivCents: number };

/**
 * Arrastre de un presupuesto mensual: desde el mes en que se activó (`since`, YYYY-MM),
 * disponible_m = monto + arrastre_{m-1} y arrastre_m = max(0, disponible_m − gastado_m).
 * Devuelve lo que llega a `month` desde los meses anteriores (0 si `month` es el primero
 * o anterior a `since`). `spentOf(m)` = lo gastado en el mes m, en la moneda del presupuesto.
 */
export function rolloverCarry(monthlyCents: number, since: string | null, month: string, spentOf: (m: string) => number): number {
  if (!since || month <= since) return 0;
  let carry = 0;
  for (let m = since; m < month; m = nextMonth(m)) carry = Math.max(0, monthlyCents + carry - spentOf(m));
  return carry;
}

function nextMonth(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
}

export type ProjectDTO = {
  id: string;
  name: string;
  icon: string;
  color: string;
  amountCents: number;
  currency: string;
  startDate: string | null;
  endDate: string | null;
  note: string | null;
  archived: boolean;
  /** Gastos menos ingresos asignados (un reintegro baja lo gastado). */
  spentCents: number;
  txCount: number;
};

export type BudgetState = "ok" | "ahead" | "near" | "over";

/**
 * Cómo viene un presupuesto: pasado, cerca del tope (90%), adelantado al
 * ritmo esperado (en el mes en curso, lo que "tocaba" gastar hasta hoy) o bien.
 */
export function budgetState(spent: number, budget: number, expectedShare: number | null): BudgetState {
  if (budget <= 0) return spent > 0 ? "over" : "ok";
  if (spent > budget) return "over";
  if (spent >= budget * 0.9) return "near";
  if (expectedShare !== null && spent > budget * expectedShare * 1.1) return "ahead";
  return "ok";
}

export const STATE_LABEL: Record<BudgetState, string> = {
  ok: "Vas bien",
  ahead: "Vas más rápido que el mes",
  near: "Cerca del tope",
  over: "Te pasaste",
};

/** Parte del mes que ya pasó (0 a 1): en el mes en curso, día de hoy / días del mes. */
export function monthShare(month: string, today: string): number | null {
  if (today.slice(0, 7) !== month) return null;
  const [y, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Number(today.slice(8, 10)) / days;
}

/**
 * Centavos de una moneda a otra con las cotizaciones en pesos (`toUyu`: pesos por unidad).
 * Misma moneda = igual; a pesos se redondea a pesos enteros (como `toUyu` de fx.ts).
 */
export function convertCents(cents: number, from: string, to: string, toUyu: Record<string, number>): number {
  if (from === to) return cents;
  const rf = from === "UYU" ? 1 : toUyu[from];
  const rt = to === "UYU" ? 1 : toUyu[to];
  if (!rf || !rt) return 0;
  const v = (cents * rf) / rt;
  return to === "UYU" ? Math.round(v / 100) * 100 : Math.round(v);
}
