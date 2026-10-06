/**
 * Ajuste de saldos compartido por los importadores de Gastos.
 *
 * Los exports de la app de gastos no traen el saldo con el que arrancó cada
 * cuenta (y el CSV tampoco trae las transferencias). Para que el saldo de hoy
 * dé el que muestra la app, el saldo inicial se calcula al revés:
 * saldo inicial = saldo de la captura - efecto de los movimientos hasta ese día.
 * Lo posterior a la captura (movimientos nuevos) sí mueve el saldo de hoy.
 * Cuantas más transferencias haya cargadas, más se acerca el saldo inicial al
 * real y más fieles quedan los saldos de meses viejos. Nunca queda un saldo
 * inicial negativo: eso pasa a un ajuste visible (ver calibrarSaldos).
 */
import type { PrismaClient } from "@prisma/client";
import { ensureAdjustmentCategories } from "./adjustments.ts";

/** Día de las capturas: SALDOS_HOY es el saldo al cierre de ese día. */
export const FECHA_SALDOS = "2026-10-02";

/** Saldos según la app en FECHA_SALDOS. */
export const SALDOS_HOY: Record<string, number> = {
  // Saldos de las capturas de la app (datos personales, fuera de git).
  Itau: 0,
  "Banque Heritage": 0,
  Dolares: 0,
  Efectivo: 0,
  "Inversiones prex": 0,
  "Mercado Pago": 0,
  Santander: 0,
};

const CAL_SOURCE = "calibracion";

/**
 * Deja cada cuenta con su saldo de FECHA_SALDOS. Si lo importado no alcanza a
 * explicarlo, la diferencia va al saldo inicial; si haría falta un saldo inicial
 * negativo (faltan transferencias de salida que el export no trae), el saldo
 * inicial queda en 0 y la diferencia es un "Ajuste de saldo" visible el día
 * del último movimiento de la cuenta. Los ajustes no cuentan como gasto.
 * Una cuenta que Facu cuadró a mano no se toca más.
 */
export async function calibrarSaldos(prisma: PrismaClient) {
  const adj = await ensureAdjustmentCategories(prisma);
  const anchor = new Date(`${FECHA_SALDOS}T00:00:00.000Z`);
  for (const [name, target] of Object.entries(SALDOS_HOY)) {
    const acc = await prisma.account.findFirst({ where: { name }, select: { id: true } });
    if (!acc) continue;
    // Si Facu ya cuadró la cuenta a mano ("Ajustar saldo"), su dato manda.
    const manual = await prisma.transaction.count({
      where: { accountId: acc.id, category: { isAdjustment: true }, source: null },
    });
    if (manual > 0) continue;
    const calId = `cal:${acc.id}`;
    const txs = await prisma.transaction.findMany({
      where: {
        OR: [{ accountId: acc.id }, { toAccountId: acc.id }],
        date: { lte: anchor },
        NOT: { source: CAL_SOURCE, externalId: calId },
      },
      select: { kind: true, amount: true, toAmount: true, accountId: true, date: true },
      orderBy: { date: "desc" },
    });
    let net = 0;
    for (const t of txs) {
      const amt = Math.round(Number(t.amount) * 100);
      if (t.kind === "income") net += amt;
      else if (t.kind === "expense") net -= amt;
      else if (t.accountId === acc.id) net -= amt;
      else net += Math.round(Number(t.toAmount ?? t.amount) * 100);
    }
    const needed = Math.round(target * 100) - net;
    const where = { source_externalId: { source: CAL_SOURCE, externalId: calId } };
    if (needed >= 0) {
      await prisma.account.update({ where: { id: acc.id }, data: { initialBalance: (needed / 100).toFixed(2) } });
      await prisma.transaction.deleteMany({ where: { source: CAL_SOURCE, externalId: calId } });
      continue;
    }
    await prisma.account.update({ where: { id: acc.id }, data: { initialBalance: "0.00" } });
    const data = {
      kind: "expense",
      date: txs[0]?.date ?? anchor,
      title: "Ajuste: transferencias que no vinieron en el export",
      amount: (-needed / 100).toFixed(2),
      accountId: acc.id,
      categoryId: adj.expense,
    };
    await prisma.transaction.upsert({ where, create: { ...data, source: CAL_SOURCE, externalId: calId }, update: data });
  }
}
