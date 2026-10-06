/**
 * Recalibra los saldos de Gastos (ver src/lib/importers/gastos-saldos.ts):
 * sin saldos iniciales negativos; la diferencia pasa a un "Ajuste de saldo".
 *
 *   node --env-file=.env scripts/recalibrar-saldos.ts
 */
import { PrismaClient } from "@prisma/client";
import { calibrarSaldos } from "../src/lib/importers/gastos-saldos.ts";

const prisma = new PrismaClient();
await calibrarSaldos(prisma);
const accs = await prisma.account.findMany({ select: { name: true, initialBalance: true } });
console.log(accs.map((a) => `${a.name}: inicial ${a.initialBalance}`).join("\n"));
await prisma.$disconnect();
