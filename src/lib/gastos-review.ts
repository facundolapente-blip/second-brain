import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { fromDbDate } from "./dates";
import { PERSONAL } from "./finance";
import { toCents } from "./finance-logic";
import { buildReview, parseReviewed, REVIEW_UNDO_KEY, REVIEWED_KEY, type ReviewData, type ReviewTx } from "./gastos-review-logic";

export const reviewSelect = {
  id: true,
  date: true,
  kind: true,
  amount: true,
  accountId: true,
  title: true,
  note: true,
  categoryId: true,
  account: { select: { name: true, currency: true } },
  category: { select: { name: true, kind: true, isAdjustment: true } },
} satisfies Prisma.TransactionSelect;

type Row = Prisma.TransactionGetPayload<{ select: typeof reviewSelect }>;

export function toReviewTx(r: Row): ReviewTx {
  return {
    id: r.id,
    date: fromDbDate(r.date),
    kind: r.kind === "income" ? "income" : "expense",
    cents: toCents(r.amount),
    accountId: r.accountId,
    accountName: r.account.name,
    currency: r.account.currency,
    categoryId: r.categoryId,
    categoryName: r.category?.name ?? null,
    categoryKind: r.category ? (r.category.kind === "income" ? "income" : "expense") : null,
    adjustment: !!r.category?.isAdjustment,
    title: r.title?.trim() || null,
    note: r.note?.trim() || null,
  };
}

export type ReviewUndo = {
  at: string;
  count: number;
  /** Cómo estaba cada movimiento cambiado. */
  rows: { id: string; before: Record<string, string | null>; after?: Record<string, string | null> }[];
  /** Ingresos de los cambios de moneda que se unieron (están en la papelera). */
  trashed: string[];
  /** Categorías a las que se les cambió la marca de trabajo. */
  flags: { id: string; isBusiness: boolean }[];
  /** Ids que se sumaron a los revisados en esta tanda. */
  reviewed: string[];
};

/**
 * Lo aplicado, de a una tanda por vez (se puede aplicar de a un movimiento): "Deshacer"
 * vuelve atrás la última y, si se toca de nuevo, la anterior. Acepta el formato viejo
 * (una sola tanda).
 */
export function parseUndoStack(raw: string | null | undefined): ReviewUndo[] {
  try {
    const v = JSON.parse(raw ?? "[]");
    const list = Array.isArray(v) ? v : [v];
    return list.filter((u): u is ReviewUndo => !!u && typeof u === "object" && Array.isArray(u.rows));
  } catch {
    return [];
  }
}

/** Cuántas tandas se guardan para deshacer (las más viejas se olvidan). */
export const UNDO_KEEP = 300;

/** Lo que muestra la pantalla: los movimientos dudosos que todavía no se revisaron. */
export async function getGastosReview(): Promise<{
  data: ReviewData;
  categories: { id: string; name: string; kind: "expense" | "income" }[];
  undo: { at: string; count: number; batches: number } | null;
}> {
  const [reviewedRow, undoRow, rows, cats] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: REVIEWED_KEY } }),
    prisma.appSetting.findUnique({ where: { key: REVIEW_UNDO_KEY } }),
    prisma.transaction.findMany({
      where: { kind: { in: ["expense", "income"] }, ...PERSONAL },
      select: reviewSelect,
      orderBy: [{ date: "desc" }, { id: "desc" }],
    }),
    prisma.category.findMany({
      where: { archivedAt: null, isAdjustment: false },
      orderBy: [{ order: "asc" }, { name: "asc" }],
      select: { id: true, name: true, kind: true },
    }),
  ]);
  const reviewed = parseReviewed(reviewedRow?.value);
  const stack = parseUndoStack(undoRow?.value);
  const undo = stack.at(-1);
  return {
    data: buildReview(rows.filter((r) => !reviewed.has(r.id)).map(toReviewTx)),
    categories: cats.map((c) => ({ id: c.id, name: c.name, kind: c.kind === "income" ? "income" : "expense" })),
    undo: undo ? { at: undo.at, count: undo.count, batches: stack.length } : null,
  };
}
