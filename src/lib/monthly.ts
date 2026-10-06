import "server-only";
import { prisma } from "./prisma";
import { addDays, fromDbDate, monthBounds, shiftMonth, toDbDate, todayISO } from "./dates";
import { getDailyMetrics } from "./daily-metrics";
import { toCents } from "./finance-logic";
import { getCategoryBudgets, NOT_ADJUSTMENT } from "./finance";
import { getRates, toUyu } from "./fx";
import { wordCount } from "./journal-logic";
import { summarize } from "./review";

/** Medianoche de Montevideo (UTC-3) de un día, para columnas con hora. */
const mvd = (iso: string) => new Date(`${iso}T03:00:00Z`);

/**
 * Resumen de un mes de los cuatro módulos más el check-in. Si es el mes en curso,
 * va hasta hoy y se compara con el anterior hasta el mismo día.
 */
export async function getMonthlySummary(month: string) {
  const today = todayISO();
  const isCurrent = month === today.slice(0, 7);
  const { from, to: end } = monthBounds(month);
  const to = end < today ? end : today;
  const prevMonth = shiftMonth(month, -1);
  const prev = monthBounds(prevMonth);
  const sameDay = `${prevMonth}-${today.slice(8)}`;
  const prevTo = isCurrent && sameDay < prev.to ? sameDay : prev.to;

  const [{ days: all, habits }, txs, categories, budgets, entries, tasksDone, checkins] = await Promise.all([
    getDailyMetrics(prev.from, to),
    prisma.transaction.findMany({
      where: { kind: "expense", date: { gte: toDbDate(from), lte: toDbDate(to) }, ...NOT_ADJUSTMENT },
      select: { title: true, amount: true, categoryId: true, date: true, account: { select: { currency: true } } },
    }),
    prisma.category.findMany({ select: { id: true, name: true, color: true, icon: true } }),
    getCategoryBudgets(month),
    prisma.journalEntry.findMany({
      where: { date: { gte: toDbDate(from), lte: toDbDate(to) } },
      select: { id: true, date: true, title: true, body: true, tags: true },
    }),
    prisma.planTask.findMany({
      where: { completedAt: { gte: mvd(from), lt: mvd(addDays(to, 1)) } },
      select: { id: true, title: true, completedAt: true },
      orderBy: { completedAt: "asc" },
    }),
    prisma.dailyCheckin.count({ where: { date: { gte: toDbDate(from), lte: toDbDate(to) } } }),
  ]);

  const days = all.filter((d) => d.date >= from);
  const before = all.filter((d) => d.date >= prev.from && d.date <= prevTo);

  // Hábitos: cuántas veces se hizo cada uno de las que tocaba.
  const perHabit = habits
    .map((h) => {
      let done = 0;
      let due = 0;
      for (const d of days) {
        if (!(h.id in d.habit)) continue;
        due++;
        if (d.habit[h.id]) done++;
      }
      return { ...h, done, due, pct: due ? Math.round((done / due) * 100) : null };
    })
    .filter((h) => h.due > 0)
    .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0) || b.done - a.done);
  const perfectDays = days.filter((d) => d.habitsDue > 0 && d.habitsDone === d.habitsDue).length;

  // Gastos por categoría, en pesos (los dólares con la cotización de hoy).
  const rates = await getRates();
  const catById = new Map(categories.map((c) => [c.id, c]));
  const byCat = new Map<string | null, number>();
  let biggest: { title: string | null; cents: number; date: string } | null = null;
  for (const t of txs) {
    const c = toUyu(toCents(t.amount), t.account.currency, rates);
    byCat.set(t.categoryId, (byCat.get(t.categoryId) ?? 0) + c);
    if (!biggest || c > biggest.cents) biggest = { title: t.title, cents: c, date: fromDbDate(t.date) };
  }
  const topCategories = [...byCat]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([id, cents]) => {
      const c = id ? catById.get(id) : undefined;
      return { id, name: c?.name ?? "Sin clasificar", color: c?.color ?? "stone", icon: c?.icon ?? "Question", cents };
    });
  const budgetsOver = budgets.budgets.filter((b) => b.spentCents > b.amountCents);

  // Journal: palabras, etiquetas y la entrada más larga.
  const written = entries
    .map((e) => ({ ...e, words: wordCount(e.body) + wordCount(e.title ?? "") }))
    .filter((e) => e.words > 0);
  const tagCount = new Map<string, number>();
  for (const e of written) for (const t of e.tags) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
  const longest = written.reduce<(typeof written)[number] | null>((a, e) => (!a || e.words > a.words ? e : a), null);

  const weights = days.filter((d) => d.weightG !== null);

  return {
    month,
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
      tags: [...tagCount].sort((a, b) => b[1] - a[1]).slice(0, 6),
      longest: longest
        ? { id: longest.id, title: longest.title, date: fromDbDate(longest.date), words: longest.words }
        : null,
    },
    tasksDone: tasksDone.map((t) => ({ id: t.id, title: t.title })),
    checkins,
    weight: weights.length ? { first: weights[0].weightG!, last: weights.at(-1)!.weightG!, n: weights.length } : null,
  };
}

export type MonthlySummary = Awaited<ReturnType<typeof getMonthlySummary>>;
