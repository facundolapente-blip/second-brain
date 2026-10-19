import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "./prisma";
import { addDays, todayISO, toDbDate } from "./dates";
import { getClassifier } from "./finance";
import { logActivity } from "./trash";
import { parseQuick } from "./smart-logic";
import { moneyCents } from "./format";
import { centsToDecimalString } from "./finance-logic";

export type QuickAddResult = { ok: true; id: string; summary: string } | { ok: false; error: string };

/**
 * El corazón de la carga rápida ("350 almuerzo itau", "+2450 disco santander ayer"),
 * sin portero: lo usan `quickAdd` (server action, que valida la sesión antes) y el bot
 * de WhatsApp (que valida la firma y el número). NO es una server action: este archivo
 * no lleva "use server", así que no se puede llamar desde afuera.
 *
 * Sin cuenta en el texto usa la del último movimiento cargado de esa moneda.
 * `picked`: cuenta o categoría elegidas a mano en la vista previa (categoryId null =
 * sin clasificar); lo que no se elige se detecta como siempre. `via` va en la actividad.
 */
export async function createQuickTransaction(
  text: string,
  picked?: { accountId?: string | null; categoryId?: string | null },
  via = "carga rápida",
): Promise<QuickAddResult> {
  const accounts = await prisma.account.findMany({ where: { archivedAt: null }, select: { id: true, name: true, currency: true } });
  const p = parseQuick(String(text ?? "").slice(0, 200), accounts);
  if (!p) return { ok: false, error: "Poné al menos un monto, por ejemplo: 350 almuerzo itau" };
  const pickedAccount = picked?.accountId ? accounts.find((a) => a.id === String(picked.accountId)) : undefined;
  if (picked?.accountId && !pickedAccount) return { ok: false, error: "Esa cuenta ya no está (¿la archivaste?)." };
  let accountId = pickedAccount?.id ?? p.accountId;
  if (!accountId) {
    const last = await prisma.transaction.findFirst({
      // Sin "usd" en el texto es en pesos: la última cuenta usada de esa moneda (antes, sin moneda
      // tomaba la última de cualquiera y un gasto en pesos podía ir a una cuenta en dólares).
      where: { account: { archivedAt: null, currency: p.currency ?? "UYU" } },
      orderBy: { createdAt: "desc" },
      select: { accountId: true },
    });
    accountId = last?.accountId ?? accounts.find((a) => a.currency === (p.currency ?? "UYU"))?.id ?? accounts[0]?.id ?? null;
  }
  if (!accountId) return { ok: false, error: "Creá una cuenta primero." };
  const acc = accounts.find((a) => a.id === accountId)!;
  let categoryId: string | null = null;
  if (picked && picked.categoryId !== undefined) {
    if (picked.categoryId) {
      const cat = await prisma.category.findUnique({ where: { id: String(picked.categoryId) } });
      // Un ingreso con categoría de gasto es un reintegro; los ajustes no se eligen acá.
      const ok = !!cat && !cat.isAdjustment && (cat.kind === p.kind || (p.kind === "income" && cat.kind === "expense"));
      if (!ok) return { ok: false, error: "Esa categoría no va con este movimiento." };
      categoryId = cat.id;
    }
  } else {
    const classify = await getClassifier();
    categoryId = p.title ? (classify(p.title, p.kind)?.categoryId ?? null) : null;
  }
  const date = addDays(todayISO(), -p.daysAgo);
  const tx = await prisma.transaction.create({
    data: {
      kind: p.kind,
      date: toDbDate(date),
      title: p.title || null,
      amount: centsToDecimalString(p.amountCents),
      accountId,
      categoryId,
    },
    include: { category: { select: { name: true } } },
  });
  revalidatePath("/gastos", "layout");
  revalidatePath("/");
  await logActivity("created", "transaction", tx.id, `${p.kind === "income" ? "Ingreso" : "Gasto"} ${centsToDecimalString(p.amountCents)} ${acc.currency}${p.title ? ` · ${p.title}` : ""} (${via})`);
  const what = `${p.kind === "income" ? "Ingreso" : "Gasto"} de ${moneyCents(p.amountCents, acc.currency)} en ${acc.name}`;
  const when = p.daysAgo ? (p.daysAgo === 1 ? " · ayer" : " · anteayer") : "";
  return { ok: true, id: tx.id, summary: `${what} · ${tx.category ? tx.category.name : "sin clasificar"}${when}` };
}
