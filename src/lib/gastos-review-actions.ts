"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "./prisma";
import { exigirSesion } from "./session";
import { NOT_ADJUSTMENT, PERSONAL } from "./finance";
import { normTitle } from "./smart-logic";
import { logActivity, trashAndDelete } from "./trash";
import { restoreItem } from "./trash-actions";
import { parseUndo, reviewSelect, toReviewTx, type ReviewUndo } from "./gastos-review";
import {
  parseReviewed,
  REVIEW_CATEGORIES,
  REVIEW_UNDO_KEY,
  REVIEWED_KEY,
  type PairChoice,
  type ReviewChoice,
  type ReviewTx,
} from "./gastos-review-logic";

export type ReviewResult = { ok: true; changed: number } | { ok: false; error: string };

function refrescar() {
  revalidatePath("/", "layout");
}

/** Crea (o marca) las categorías de la revisión y devuelve sus ids. */
async function ensureReviewCategories() {
  const upsert = async (name: string, kind: "expense" | "income", extra: { icon: string; color: string; isPassThrough?: boolean; isBusiness?: boolean }) => {
    const found = await prisma.category.findUnique({ where: { name_kind: { name, kind } } });
    if (found) {
      // Gastos/Ingresos mamá siempre son "plata de otra persona" y Negocio, de trabajo; si
      // estaba archivada, vuelve.
      if ((extra.isPassThrough && !found.isPassThrough) || (extra.isBusiness && !found.isBusiness) || found.archivedAt) {
        await prisma.category.update({
          where: { id: found.id },
          data: { isPassThrough: extra.isPassThrough ?? found.isPassThrough, isBusiness: extra.isBusiness ?? found.isBusiness, archivedAt: null },
        });
      }
      return found.id;
    }
    const last = await prisma.category.aggregate({ _max: { order: true } });
    const c = await prisma.category.create({ data: { name, kind, order: (last._max.order ?? 0) + 1, ...extra } });
    return c.id;
  };
  return {
    mamaExpense: await upsert(REVIEW_CATEGORIES.mamaExpense, "expense", { icon: "HandCoins", color: "pink", isPassThrough: true }),
    mamaIncome: await upsert(REVIEW_CATEGORIES.mamaIncome, "income", { icon: "HandCoins", color: "pink", isPassThrough: true }),
    aporte: await upsert(REVIEW_CATEGORIES.aporte, "expense", { icon: "ChartLineUp", color: "orange" }),
    negocioExpense: await upsert(REVIEW_CATEGORIES.negocio, "expense", { icon: "Briefcase", color: "brown", isBusiness: true }),
    negocioIncome: await upsert(REVIEW_CATEGORIES.negocio, "income", { icon: "Briefcase", color: "brown", isBusiness: true }),
  };
}

/**
 * Aplica lo elegido en "Revisar movimientos": une los cambios de moneda en una
 * transferencia (el ingreso va a la papelera), cambia categorías (trabajo, aporte,
 * mamá u otra) y deja anotados como revisados todos los que se miraron (también los
 * que quedaron como estaban). Guarda cómo estaba todo para "Deshacer esta revisión".
 */
export async function applyGastosReview(input: {
  pairs: { outId: string; inId: string; choice: PairChoice }[];
  items: { id: string; choice: ReviewChoice }[];
}): Promise<ReviewResult> {
  await exigirSesion();
  const pairs = (input.pairs ?? []).slice(0, 500);
  const items = (input.items ?? []).slice(0, 2000);
  if (!pairs.length && !items.length) return { ok: false, error: "No hay nada para aplicar." };

  const cats = await ensureReviewCategories();
  const undo: ReviewUndo = { at: new Date().toISOString(), count: 0, rows: [], trashed: [], flags: [], reviewed: [] };
  const reviewedRow = await prisma.appSetting.findUnique({ where: { key: REVIEWED_KEY } });
  const reviewed = parseReviewed(reviewedRow?.value);
  const markReviewed = (id: string) => {
    if (!reviewed.has(id)) {
      reviewed.add(id);
      undo.reviewed.push(id);
    }
  };

  // Categorías.
  const txs = await prisma.transaction.findMany({
    where: { id: { in: items.map((i) => i.id) }, kind: { in: ["expense", "income"] }, account: { isBusiness: false } },
    select: { id: true, kind: true, categoryId: true },
  });
  const byId = new Map(txs.map((t) => [t.id, t]));
  const otherCats = new Map(
    (
      await prisma.category.findMany({
        where: { id: { in: items.filter((i) => i.choice.startsWith("cat:")).map((i) => i.choice.slice(4)) }, isAdjustment: false },
        select: { id: true, kind: true },
      })
    ).map((c) => [c.id, c.kind]),
  );
  for (const { id, choice } of items) {
    const t = byId.get(id);
    if (!t) continue;
    markReviewed(id);
    const expense = t.kind === "expense";
    let target: string | null | undefined;
    if (choice === "trabajo") target = expense ? cats.negocioExpense : cats.negocioIncome;
    else if (choice === "aporte" && expense) target = cats.aporte;
    else if (choice === "mama") target = expense ? cats.mamaExpense : cats.mamaIncome;
    else if (choice.startsWith("cat:") && otherCats.get(choice.slice(4)) === t.kind) target = choice.slice(4);
    if (target === undefined || target === t.categoryId) continue;
    undo.rows.push({ id, before: { categoryId: t.categoryId } });
    await prisma.transaction.update({ where: { id }, data: { categoryId: target } });
    undo.count++;
  }

  // Cambios de moneda: el gasto pasa a ser una transferencia y el ingreso va a la papelera.
  for (const p of pairs) {
    const [o, i] = await Promise.all([
      prisma.transaction.findUnique({ where: { id: p.outId }, include: { account: true } }),
      prisma.transaction.findUnique({ where: { id: p.inId }, include: { account: true } }),
    ]);
    if (!o || !i) continue;
    markReviewed(o.id);
    markReviewed(i.id);
    if (p.choice !== "transfer") continue;
    if (o.kind !== "expense" || i.kind !== "income" || o.account.currency === i.account.currency || o.installmentGroup) continue;
    undo.rows.push({
      id: o.id,
      before: {
        kind: o.kind,
        toAccountId: o.toAccountId,
        toAmount: o.toAmount?.toString() ?? null,
        categoryId: o.categoryId,
        projectId: o.projectId,
        title: o.title,
      },
    });
    await prisma.transaction.update({
      where: { id: o.id },
      data: {
        kind: "transfer",
        toAccountId: i.accountId,
        toAmount: i.amount,
        categoryId: null,
        projectId: null,
        title: o.title?.trim() || i.title?.trim() || "Cambio de moneda",
      },
    });
    if (await trashAndDelete("transaction", i.id)) undo.trashed.push(i.id);
    undo.count++;
  }

  await prisma.appSetting.upsert({
    where: { key: REVIEWED_KEY },
    create: { key: REVIEWED_KEY, value: JSON.stringify([...reviewed]) },
    update: { value: JSON.stringify([...reviewed]) },
  });
  if (undo.count || undo.flags.length) {
    await prisma.appSetting.upsert({
      where: { key: REVIEW_UNDO_KEY },
      create: { key: REVIEW_UNDO_KEY, value: JSON.stringify(undo) },
      update: { value: JSON.stringify(undo) },
    });
    await logActivity("updated", "transaction", null, `Revisión de movimientos: ${undo.count} ${undo.count === 1 ? "cambio" : "cambios"}`);
  }
  refrescar();
  return { ok: true, changed: undo.count };
}

/** Vuelve todo como estaba antes de la última revisión aplicada. */
export async function undoGastosReview(): Promise<ReviewResult> {
  await exigirSesion();
  const row = await prisma.appSetting.findUnique({ where: { key: REVIEW_UNDO_KEY } });
  const undo = parseUndo(row?.value);
  if (!undo) return { ok: false, error: "No hay ninguna revisión para deshacer." };
  // Primero vuelven los ingresos de la papelera, después cada movimiento como estaba.
  for (const id of undo.trashed) {
    const item = await prisma.trashItem.findFirst({ where: { kind: "transaction", entityId: id }, orderBy: { deletedAt: "desc" } });
    if (item) await restoreItem(item.id);
  }
  for (const r of undo.rows) {
    await prisma.transaction.update({ where: { id: r.id }, data: r.before }).catch(() => {});
  }
  for (const f of undo.flags) await prisma.category.update({ where: { id: f.id }, data: { isBusiness: f.isBusiness } }).catch(() => {});
  const reviewedRow = await prisma.appSetting.findUnique({ where: { key: REVIEWED_KEY } });
  const reviewed = parseReviewed(reviewedRow?.value);
  for (const id of undo.reviewed) reviewed.delete(id);
  await prisma.appSetting.upsert({
    where: { key: REVIEWED_KEY },
    create: { key: REVIEWED_KEY, value: JSON.stringify([...reviewed]) },
    update: { value: JSON.stringify([...reviewed]) },
  });
  await prisma.appSetting.delete({ where: { key: REVIEW_UNDO_KEY } });
  await logActivity("restored", "transaction", null, `Se deshizo la revisión de movimientos (${undo.count} ${undo.count === 1 ? "cambio" : "cambios"})`);
  refrescar();
  return { ok: true, changed: undo.count };
}

/** Buscar cualquier movimiento personal para sumarlo a "Plata de mamá" (título o nota, sin tildes). */
export async function searchReviewTx(q: string): Promise<ReviewTx[]> {
  await exigirSesion();
  const needle = normTitle(q ?? "");
  if (needle.length < 2) return [];
  const rows = await prisma.transaction.findMany({
    where: { kind: { in: ["expense", "income"] }, ...PERSONAL, ...NOT_ADJUSTMENT },
    select: reviewSelect,
    orderBy: [{ date: "desc" }, { id: "desc" }],
  });
  return rows
    .filter((r) => normTitle(`${r.title ?? ""} ${r.note ?? ""}`).includes(needle))
    .slice(0, 30)
    .map(toReviewTx);
}
