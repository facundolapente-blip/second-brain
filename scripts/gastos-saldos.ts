/**
 * Ajuste de saldos compartido por los importadores de Gastos.
 *
 * Los exports de la app de gastos no traen el saldo con el que arrancó cada
 * cuenta (y el CSV tampoco trae las transferencias). Para que el saldo de hoy
 * dé el que muestra la app, el saldo inicial se calcula al revés:
 * saldo inicial = saldo de hoy - efecto de todos los movimientos importados.
 * Cuantas más transferencias haya cargadas, más se acerca el saldo inicial al
 * real y más fieles quedan los saldos de meses viejos.
 */
import type { PrismaClient } from "@prisma/client";

/** Saldos de hoy según la app (capturas del 2026-10-02). */
export const SALDOS_HOY: Record<string, number> = {
  Itau: 0,
  "Banque Heritage": 0,
  Dolares: 0,
  Efectivo: 0,
  "Inversiones prex": 0,
  "Mercado Pago": 0,
  Santander: 0,
};

export async function calibrarSaldos(prisma: PrismaClient) {
  for (const [name, target] of Object.entries(SALDOS_HOY)) {
    const acc = await prisma.account.findFirst({ where: { name }, select: { id: true } });
    if (!acc) continue;
    const txs = await prisma.transaction.findMany({
      where: { OR: [{ accountId: acc.id }, { toAccountId: acc.id }] },
      select: { kind: true, amount: true, toAmount: true, accountId: true },
    });
    let net = 0;
    for (const t of txs) {
      const amt = Math.round(Number(t.amount) * 100);
      if (t.kind === "income") net += amt;
      else if (t.kind === "expense") net -= amt;
      else if (t.accountId === acc.id) net -= amt;
      else net += Math.round(Number(t.toAmount ?? t.amount) * 100);
    }
    await prisma.account.update({
      where: { id: acc.id },
      data: { initialBalance: ((Math.round(target * 100) - net) / 100).toFixed(2) },
    });
  }
}
