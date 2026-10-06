import { addDays, monthBounds, shiftMonth } from "./dates";

/**
 * Tarjetas de crédito como en Uruguay: el estado de cuenta cierra un día fijo del
 * mes y vence unos días después. Lo comprado entre un cierre y el siguiente va en
 * ese resumen; las compras en cuotas se cargan una por mes (cada cuota cae en su
 * resumen). Todo en días YYYY-MM-DD, sin horas.
 */

/** El día `day` de ese mes (un 31 en abril cae el 30). */
export function dayIn(month: string, day: number): string {
  const last = Number(monthBounds(month).to.slice(8));
  return `${month}-${String(Math.min(Math.max(1, day), last)).padStart(2, "0")}`;
}

/** El próximo cierre: hoy si cierra hoy, si no el de este mes o el del que viene. */
export function nextClosing(today: string, closingDay: number): string {
  const c = dayIn(today.slice(0, 7), closingDay);
  return today <= c ? c : dayIn(shiftMonth(today.slice(0, 7), 1), closingDay);
}

export function previousClosing(closing: string, closingDay: number): string {
  return dayIn(shiftMonth(closing.slice(0, 7), -1), closingDay);
}

/** El vencimiento de un resumen: el `dueDay` siguiente al cierre. */
export function dueAfter(closing: string, dueDay: number): string {
  const d = dayIn(closing.slice(0, 7), dueDay);
  return d > closing ? d : dayIn(shiftMonth(closing.slice(0, 7), 1), dueDay);
}

/** Fecha de la cuota `i` (0 = la de la compra): mismo día, meses siguientes. */
export function installmentDate(first: string, i: number): string {
  return i === 0 ? first : dayIn(shiftMonth(first.slice(0, 7), i), Number(first.slice(8)));
}

/** Reparte el total en cuotas enteras (en centavos); la primera lleva el resto. */
export function splitInstallments(totalCents: number, count: number): number[] {
  const base = Math.floor(totalCents / count);
  return Array.from({ length: count }, (_, i) => (i === 0 ? totalCents - base * (count - 1) : base));
}

export type CardMove = {
  date: string;
  /** Positivo = lo que suma a la deuda (compra, adelanto); negativo = reintegro. */
  chargeCents: number;
  /** Pago a la tarjeta (transferencia que entra). */
  paymentCents: number;
  installment: boolean;
};

export type Statement = { from: string; closing: string; due: string; amountCents: number };

export type CardSummary = {
  accountId: string;
  name: string;
  currency: string;
  /** Lo que se debe hoy (con las cuotas que faltan). */
  debtCents: number;
  limitCents: number | null;
  /** El último resumen cerrado: cuánto fue, cuánto se pagó desde el cierre y cuánto falta. */
  last: (Statement & { paidCents: number; leftCents: number }) | null;
  /** El resumen en curso (cierra en el próximo cierre). */
  current: Statement | null;
  /** Cuotas que caen después del resumen en curso. */
  pending: { count: number; cents: number; lastDate: string | null };
};

const sumCharges = (moves: CardMove[], from: string, to: string) =>
  moves.filter((m) => m.date > from && m.date <= to).reduce((n, m) => n + m.chargeCents, 0);

export function summarizeCard(
  card: { id: string; name: string; currency: string; balanceCents: number; closingDay: number | null; dueDay: number | null; limitCents: number | null },
  moves: CardMove[],
  today: string,
): CardSummary {
  const base = {
    accountId: card.id,
    name: card.name,
    currency: card.currency,
    debtCents: Math.max(0, -card.balanceCents),
    limitCents: card.limitCents,
  };
  if (!card.closingDay) {
    const future = moves.filter((m) => m.installment && m.date > today);
    return {
      ...base,
      last: null,
      current: null,
      pending: { count: future.length, cents: future.reduce((n, m) => n + m.chargeCents, 0), lastDate: future.at(-1)?.date ?? null },
    };
  }
  const due = card.dueDay ?? card.closingDay;
  const nextC = nextClosing(today, card.closingDay);
  const lastC = previousClosing(nextC, card.closingDay);
  const beforeC = previousClosing(lastC, card.closingDay);
  const lastAmount = sumCharges(moves, beforeC, lastC);
  // Lo pagado después del último cierre (hasta hoy) va contra ese resumen.
  const paid = moves.filter((m) => m.date > lastC && m.date <= today).reduce((n, m) => n + m.paymentCents, 0);
  const future = moves.filter((m) => m.installment && m.date > nextC).sort((a, b) => a.date.localeCompare(b.date));
  return {
    ...base,
    last: { from: addDays(beforeC, 1), closing: lastC, due: dueAfter(lastC, due), amountCents: lastAmount, paidCents: paid, leftCents: Math.max(0, lastAmount - paid) },
    current: { from: addDays(lastC, 1), closing: nextC, due: dueAfter(nextC, due), amountCents: sumCharges(moves, lastC, nextC) },
    pending: { count: future.length, cents: future.reduce((n, m) => n + m.chargeCents, 0), lastDate: future.at(-1)?.date ?? null },
  };
}
