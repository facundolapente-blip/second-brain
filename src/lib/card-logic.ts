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
  /** Ajuste de saldo: mueve la deuda pero no es una compra del resumen. */
  adjustment?: boolean;
};

export type Statement = { from: string; closing: string; due: string; amountCents: number };

export type CardSummary = {
  accountId: string;
  name: string;
  currency: string;
  /** Lo que se debe hoy (con las cuotas que faltan). */
  debtCents: number;
  limitCents: number | null;
  /**
   * El último resumen cerrado. `amountCents` = lo que se debía al cierre (con lo que quedó
   * sin pagar de antes), `chargesCents` = lo comprado en ese período, `paidCents` = lo pagado
   * desde el cierre y `leftCents` = lo que falta pagar.
   */
  last: (Statement & { chargesCents: number; paidCents: number; leftCents: number }) | null;
  /** El resumen en curso (cierra en el próximo cierre): lo que se debe aparte del último resumen. */
  current: Statement | null;
  /** Cuotas que caen después del resumen en curso. */
  pending: { count: number; cents: number; lastDate: string | null };
};

const sumCharges = (moves: CardMove[], from: string, to: string) =>
  moves.filter((m) => !m.adjustment && m.date > from && m.date <= to).reduce((n, m) => n + m.chargeCents, 0);

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
  // La deuda al final de un día: el saldo de hoy (que ya tiene todo, también las cuotas
  // futuras) sin lo que tiene fecha posterior. Los pagos hechos antes del cierre ya bajan
  // la deuda de ese cierre, y lo que quedó sin pagar de un resumen viejo sigue en el nuevo.
  const debtAt = (day: string) =>
    Math.max(0, -(card.balanceCents - moves.filter((m) => m.date > day).reduce((n, m) => n + m.paymentCents - m.chargeCents, 0)));
  const due = card.dueDay ?? card.closingDay;
  const nextC = nextClosing(today, card.closingDay);
  const lastC = previousClosing(nextC, card.closingDay);
  const beforeC = previousClosing(lastC, card.closingDay);
  const atClosing = debtAt(lastC);
  // Lo pagado después del último cierre (hasta hoy) va contra ese resumen.
  const paid = moves.filter((m) => m.date > lastC && m.date <= today).reduce((n, m) => n + m.paymentCents, 0);
  const left = Math.max(0, Math.min(atClosing - paid, debtAt(today)));
  const future = moves.filter((m) => m.installment && m.date > nextC).sort((a, b) => a.date.localeCompare(b.date));
  return {
    ...base,
    last: {
      from: addDays(beforeC, 1),
      closing: lastC,
      due: dueAfter(lastC, due),
      amountCents: atClosing,
      chargesCents: sumCharges(moves, beforeC, lastC),
      paidCents: paid,
      leftCents: left,
    },
    // Hasta el próximo cierre: una cuota que cae antes del cierre ya va en este resumen.
    current: { from: addDays(lastC, 1), closing: nextC, due: dueAfter(nextC, due), amountCents: Math.max(0, debtAt(nextC) - left) },
    pending: { count: future.length, cents: future.reduce((n, m) => n + m.chargeCents, 0), lastDate: future.at(-1)?.date ?? null },
  };
}
