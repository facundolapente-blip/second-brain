import "server-only";
import { prisma } from "./prisma";
import { addDays, fromDbDate, monthBounds, shiftMonth, toDbDate, todayISO } from "./dates";
import { getDailyMetrics, habitTotals, type DayMetrics } from "./daily-metrics";
import { toCents } from "./finance-logic";
import { getCategoryBudgets, NOT_ADJUSTMENT, PERSONAL } from "./finance";
import { getRates, toUyu } from "./fx";
import { isEmptyEntry, wordCount } from "./journal-logic";
import { REVIEW_TEMPLATE } from "./review-logic";
import { summarize } from "./review";

/** Medianoche de Montevideo (UTC-3) de un día, para columnas con hora. */
const mvd = (iso: string) => new Date(`${iso}T03:00:00Z`);

export type Period = { kind: "month"; key: string } | { kind: "year"; key: string };

/**
 * Resumen de un período (un mes o un año) de los cuatro módulos más el check-in,
 * comparado con el período anterior. Si es el período en curso, va hasta hoy y
 * se compara con el anterior hasta el mismo punto.
 */
async function summarizeRange(period: Period, from: string, to: string, prevFrom: string, prevTo: string, isCurrent: boolean) {
  const today = todayISO();
  const [{ days: all, habits }, txs, categories, budgets, entries, tasksDone, checkins] = await Promise.all([
    getDailyMetrics(prevFrom, to),
    prisma.transaction.findMany({
      // Gastos y reintegros (ingresos con categoría de gasto): el reintegro resta de su categoría,
      // igual que en el total, así categorías y total coinciden.
      where: {
        date: { gte: toDbDate(from), lte: toDbDate(to) },
        AND: [NOT_ADJUSTMENT, { OR: [{ kind: "expense" }, { kind: "income", category: { kind: "expense" } }] }],
        ...PERSONAL,
      },
      select: { title: true, kind: true, amount: true, categoryId: true, date: true, account: { select: { currency: true } } },
    }),
    prisma.category.findMany({ select: { id: true, name: true, color: true, icon: true } }),
    period.kind === "month" ? getCategoryBudgets(period.key) : Promise.resolve({ budgets: [] }),
    prisma.journalEntry.findMany({
      where: { date: { gte: toDbDate(from), lte: toDbDate(to) } },
      select: { id: true, date: true, title: true, body: true, tags: true, _count: { select: { attachments: true } } },
    }),
    prisma.planTask.findMany({
      where: { completedAt: { gte: mvd(from), lt: mvd(addDays(to, 1)) } },
      select: { id: true, title: true, completedAt: true },
      orderBy: { completedAt: "asc" },
    }),
    prisma.dailyCheckin.count({ where: { date: { gte: toDbDate(from), lte: toDbDate(to) } } }),
  ]);

  const days = all.filter((d) => d.date >= from);
  const before = all.filter((d) => d.date >= prevFrom && d.date <= prevTo);

  // Hábitos: cuántas veces se hizo cada uno de las que tocaba.
  const perHabit = habits
    .map((h) => ({ ...h, ...habitTotals(h, days) }))
    .filter((h) => h.due > 0)
    .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0) || b.done - a.done);
  const perfectDays = days.filter((d) => d.habitsDue > 0 && d.habitsDone === d.habitsDue).length;

  // Gastos por categoría, en pesos (los dólares con la cotización de hoy).
  const rates = await getRates();
  const catById = new Map(categories.map((c) => [c.id, c]));
  const byCat = new Map<string | null, number>();
  let biggest: { title: string | null; cents: number; date: string } | null = null;
  for (const t of txs) {
    const c = toUyu(toCents(t.amount), t.account.currency, rates) * (t.kind === "income" ? -1 : 1);
    byCat.set(t.categoryId, (byCat.get(t.categoryId) ?? 0) + c);
    if (t.kind === "expense" && (!biggest || c > biggest.cents)) biggest = { title: t.title, cents: c, date: fromDbDate(t.date) };
  }
  const topCategories = [...byCat]
    .sort((a, b) => b[1] - a[1])
    .slice(0, period.kind === "year" ? 8 : 6)
    .map(([id, cents]) => {
      const c = id ? catById.get(id) : undefined;
      return { id, name: c?.name ?? "Sin clasificar", color: c?.color ?? "stone", icon: c?.icon ?? "Question", cents };
    });
  const budgetsOver = budgets.budgets.filter((b) => b.spentCents > b.amountCents);

  // Journal: palabras, etiquetas y la entrada más larga. Cuentan las que cuenta el
  // Journal (título, texto, etiquetas o fotos), sin la reflexión semanal sin tocar.
  const written = entries
    .filter((e) => (!isEmptyEntry(e) || e._count.attachments > 0) && e.body.trim() !== REVIEW_TEMPLATE.trim())
    .map((e) => ({ ...e, words: wordCount(e.body) + wordCount(e.title ?? "") }));
  const tagCount = new Map<string, number>();
  for (const e of written) for (const t of e.tags) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
  const longest = written.filter((e) => e.words > 0).reduce<(typeof written)[number] | null>((a, e) => (!a || e.words > a.words ? e : a), null);

  const weights = days.filter((d) => d.weightG !== null);

  return {
    period,
    today,
    from,
    to,
    isCurrent,
    days,
    now: summarize(days),
    before: summarize(before),
    perHabit,
    perfectDays,
    topCategories,
    biggest,
    budgets: { total: budgets.budgets.length, over: budgetsOver.map((b) => catById.get(b.categoryId)?.name ?? "Categoría") },
    journal: {
      entries: written.length,
      tags: [...tagCount].sort((a, b) => b[1] - a[1]).slice(0, period.kind === "year" ? 10 : 6),
      longest: longest ? { id: longest.id, title: longest.title, date: fromDbDate(longest.date), words: longest.words } : null,
    },
    tasksDone: tasksDone.map((t) => ({ id: t.id, title: t.title })),
    checkins,
    weight: weights.length ? { first: weights[0].weightG!, last: weights.at(-1)!.weightG!, n: weights.length } : null,
    byMonth: period.kind === "year" ? byMonth(days) : [],
  };
}

/** Una fila por mes del año (para "Mes a mes"). */
function byMonth(days: DayMetrics[]) {
  const months = new Map<string, DayMetrics[]>();
  for (const d of days) months.set(d.date.slice(0, 7), [...(months.get(d.date.slice(0, 7)) ?? []), d]);
  return [...months].map(([month, ds]) => ({ month, days: ds.length, ...summarize(ds) }));
}

/** Un mes. En el mes en curso, comparado con el anterior hasta el mismo día. */
export async function getMonthlySummary(month: string) {
  const today = todayISO();
  const isCurrent = month === today.slice(0, 7);
  const { from, to: end } = monthBounds(month);
  const prevMonth = shiftMonth(month, -1);
  const prev = monthBounds(prevMonth);
  const sameDay = `${prevMonth}-${today.slice(8)}`;
  const prevTo = isCurrent && sameDay < prev.to ? sameDay : prev.to;
  return summarizeRange({ kind: "month", key: month }, from, end < today ? end : today, prev.from, prevTo, isCurrent);
}

/** Un año. En el año en curso, comparado con el anterior hasta el mismo día. */
export async function getYearSummary(year: string) {
  const today = todayISO();
  const isCurrent = year === today.slice(0, 4);
  const prevYear = String(Number(year) - 1);
  const end = `${year}-12-31`;
  // 29 de febrero contra un año sin él: se toma el 28.
  const sameDay = today.slice(5) === "02-29" ? `${prevYear}-02-28` : `${prevYear}-${today.slice(5)}`;
  return summarizeRange(
    { kind: "year", key: year },
    `${year}-01-01`,
    end < today ? end : today,
    `${prevYear}-01-01`,
    isCurrent ? sameDay : `${prevYear}-12-31`,
    isCurrent,
  );
}

export type MonthlySummary = Awaited<ReturnType<typeof getMonthlySummary>>;
