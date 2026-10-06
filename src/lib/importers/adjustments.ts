/**
 * Categorías "Ajuste de saldo" (una de ingreso y una de gasto): corrigen el
 * saldo de una cuenta sin contar como gasto ni ingreso en ningún número.
 * Sin `server-only` porque también las usan los scripts.
 */
import type { PrismaClient } from "@prisma/client";

export const ADJUSTMENT_NAME = "Ajuste de saldo";

export async function ensureAdjustmentCategories(prisma: PrismaClient) {
  const out: Record<"income" | "expense", string> = { income: "", expense: "" };
  for (const kind of ["income", "expense"] as const) {
    const c = await prisma.category.upsert({
      where: { name_kind: { name: ADJUSTMENT_NAME, kind } },
      create: { name: ADJUSTMENT_NAME, kind, icon: "Scales", color: "stone", isAdjustment: true, order: 999 },
      update: { isAdjustment: true, archivedAt: null },
    });
    out[kind] = c.id;
  }
  return out;
}
