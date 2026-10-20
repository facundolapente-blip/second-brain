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

// ─── Historial de lo aplicado ───────────────────────────────────────────────

type HistTx = { id: string; date: string; title: string | null; accountName: string; currency: string; cents: number; kind: string; categoryName: string | null };

export type ReviewHistoryItem =
  | { type: "transfer"; at: string; out: HistTx; in: HistTx | null; rate: number | null }
  | { type: "category"; at: string; tx: HistTx | null; id: string; from: string; to: string }
  | { type: "kept"; at: string; tx: HistTx | null; id: string };

/**
 * Todo lo que se aplicó en "Revisar movimientos" (lo que todavía no se deshizo), para
 * chequearlo: cada cambio de moneda unido (el gasto, que ahora es la transferencia, y el
 * ingreso que fue a la papelera), cada cambio de categoría (antes → ahora) y lo que se
 * marcó como revisado sin cambios. Lo más nuevo primero.
 */
export async function getReviewHistory(): Promise<ReviewHistoryItem[]> {
  const row = await prisma.appSetting.findUnique({ where: { key: REVIEW_UNDO_KEY } });
  const stack = parseUndoStack(row?.value);
  const ids = [...new Set(stack.flatMap((b) => [...b.rows.map((r) => r.id), ...b.reviewed]))];
  const trashedIds = stack.flatMap((b) => b.trashed);
  const [txs, accounts, cats, trash] = await Promise.all([
    prisma.transaction.findMany({
      where: { id: { in: ids } },
      select: { id: true, date: true, title: true, kind: true, amount: true, toAmount: true, accountId: true, toAccountId: true, categoryId: true },
    }),
    prisma.account.findMany({ select: { id: true, name: true, currency: true } }),
    prisma.category.findMany({ select: { id: true, name: true } }),
    prisma.trashItem.findMany({ where: { kind: "transaction", entityId: { in: trashedIds } }, select: { entityId: true, data: true } }),
  ]);
  const acc = new Map(accounts.map((a) => [a.id, a]));
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const toHist = (t: { id: string; date: Date | string; title: string | null; kind: string; amount: unknown; accountId: string; categoryId: string | null }): HistTx => ({
    id: t.id,
    date: typeof t.date === "string" ? t.date.slice(0, 10) : fromDbDate(t.date),
    title: t.title?.trim() || null,
    accountName: acc.get(t.accountId)?.name ?? "?",
    currency: acc.get(t.accountId)?.currency ?? "UYU",
    cents: toCents(String(t.amount)),
    kind: t.kind,
    categoryName: t.categoryId ? (catName.get(t.categoryId) ?? "(borrada)") : null,
  });
  const byId = new Map(txs.map((t) => [t.id, t]));
  const trashed = new Map(
    trash.map((x) => {
      const r = (x.data as { row?: Record<string, unknown> } | null)?.row ?? {};
      return [x.entityId, r] as const;
    }),
  );

  const out: ReviewHistoryItem[] = [];
  for (const b of [...stack].reverse()) {
    const changed = new Set<string>();
    // Cada ingreso unido va con el gasto de su par (en la tanda, en el mismo orden).
    const trashedQueue = [...b.trashed];
    for (const r of b.rows) {
      changed.add(r.id);
      const now = byId.get(r.id);
      if ("kind" in r.before) {
        const inId = trashedQueue.shift();
        if (inId) changed.add(inId);
        const inRow = inId ? trashed.get(inId) : undefined;
        const inTx = inRow
          ? toHist({
              id: inId!,
              date: String(inRow.date),
              title: (inRow.title as string | null) ?? null,
              kind: "income",
              amount: inRow.amount,
              accountId: String(inRow.accountId),
              categoryId: (inRow.categoryId as string | null) ?? null,
            })
          : null;
        const outTx = now ? toHist({ ...now, categoryId: r.before.categoryId ?? null }) : null;
        if (!outTx) continue;
        const dollars = outTx.currency === "USD" ? outTx.cents : inTx?.currency === "USD" ? inTx.cents : 0;
        const pesos = outTx.currency === "UYU" ? outTx.cents : inTx?.currency === "UYU" ? inTx.cents : 0;
        out.push({ type: "transfer", at: b.at, out: outTx, in: inTx, rate: dollars && pesos ? Math.round((pesos / dollars) * 100) / 100 : null });
      } else {
        const from = r.before.categoryId ? (catName.get(r.before.categoryId) ?? "(borrada)") : "Sin clasificar";
        out.push({ type: "category", at: b.at, id: r.id, tx: now ? toHist(now) : null, from, to: now ? (now.categoryId ? (catName.get(now.categoryId) ?? "(borrada)") : "Sin clasificar") : "(ya no existe)" });
      }
    }
    for (const id of b.reviewed) {
      if (changed.has(id) || trashedIds.includes(id)) continue;
      const now = byId.get(id);
      out.push({ type: "kept", at: b.at, id, tx: now ? toHist(now) : null });
    }
  }
  return out;
}
