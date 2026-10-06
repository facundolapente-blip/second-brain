/**
 * Presupuestos (servidor y cliente): mensual por categoría y puntuales
 * (viajes, vacaciones). Todo en centavos enteros.
 */

export type CategoryBudgetDTO = {
  categoryId: string;
  amountCents: number;
  currency: string;
  /** Gastado en el mes, en esa moneda. */
  spentCents: number;
};

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
