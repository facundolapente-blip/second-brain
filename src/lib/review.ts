import "server-only";
import { prisma } from "./prisma";
import { addDays, fromDbDate, startOfWeek, toDbDate, todayISO } from "./dates";
import { getDailyMetrics, type DayMetrics } from "./daily-metrics";
import { toCents } from "./finance-logic";
import { NOT_ADJUSTMENT, PERSONAL } from "./finance";
import { getRates, toUyu } from "./fx";
import { REVIEW_TAG } from "./review-logic";

function avg(xs: (number | null)[]) {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function summarize(days: DayMetrics[]) {
  const done = days.reduce((n, d) => n + d.habitsDone, 0);
  const due = days.reduce((n, d) => n + d.habitsDue, 0);
  return {
    habitPct: due ? Math.round((done / due) * 100) : null,
    habitsDone: done,
    habitsDue: due,
    wroteDays: days.filter((d) => d.wrote).length,
    words: days.reduce((n, d) => n + d.words, 0),
    spentCents: days.reduce((n, d) => n + d.spentCents, 0),
    incomeCents: days.reduce((n, d) => n + d.incomeCents, 0),
    blocksDone: days.reduce((n, d) => n + d.blocksDone, 0),
    blocksTotal: days.reduce((n, d) => n + d.blocksTotal, 0),
    mood: avg(days.map((d) => d.mood)),
    energy: avg(days.map((d) => d.energy)),
    stress: avg(days.map((d) => d.stress)),
    sleepMin: avg(days.map((d) => d.sleepMin)),
    steps: avg(days.map((d) => d.steps)),
  };
}

/** Todo lo de una semana (lunes a domingo) comparado con la anterior. */
export async function getWeeklyReview(day: string) {
  const today = todayISO();
  const monday = startOfWeek(day);
  const sunday = addDays(monday, 6);
  const prevMonday = addDays(monday, -7);

  const [{ days: all, habits }, txs, categories, tasksDone, tasksNext, review] = await Promise.all([
    getDailyMetrics(prevMonday, sunday),
    prisma.transaction.findMany({
      where: { kind: "expense", date: { gte: toDbDate(monday), lte: toDbDate(sunday) }, ...NOT_ADJUSTMENT, ...PERSONAL },
      select: { title: true, amount: true, categoryId: true, date: true, account: { select: { currency: true } } },
    }),
    prisma.category.findMany({ select: { id: true, name: true, color: true, icon: true } }),
    prisma.planTask.findMany({
      where: { completedAt: { gte: new Date(`${monday}T03:00:00Z`), lt: new Date(`${addDays(sunday, 1)}T03:00:00Z`) } },
      select: { id: true, title: true },
    }),
    prisma.planTask.findMany({
      where: { status: { not: "done" }, deadline: { gte: toDbDate(addDays(sunday, 1)), lte: toDbDate(addDays(sunday, 7)) } },
      select: { id: true, title: true, deadline: true },
      orderBy: { deadline: "asc" },
    }),
    prisma.journalEntry.findFirst({
      where: { tags: { has: REVIEW_TAG }, date: { gte: toDbDate(monday), lte: toDbDate(addDays(sunday, 1)) } },
      select: { id: true, body: true },
    }),
  ]);

  // En la semana en curso se compara contra la anterior hasta el mismo día
  // (como el resumen del mes): si no, todo da en baja hasta el domingo.
  const isCurrent = today >= monday && today <= sunday;
  const cut = isCurrent ? addDays(today, -7) : addDays(monday, -1);
  const week = all.filter((d) => d.date >= monday && (!isCurrent || d.date <= today));
  const prev = all.filter((d) => d.date < monday && d.date <= cut);
  /** Días que van de la semana (7 si ya terminó). */
  const elapsed = isCurrent ? week.length : 7;

  // Hábitos: cuántas veces se hizo cada uno de las que tocaba.
  const perHabit = habits
    .map((h) => {
      let done = 0;
      let due = 0;
      for (const d of week) {
        if (!(h.id in d.habit)) continue;
        due++;
        if (d.habit[h.id]) done++;
      }
      return { ...h, done, due, pct: due ? Math.round((done / due) * 100) : null };
    })
    .filter((h) => h.due > 0)
    .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0) || b.done - a.done);

  const catById = new Map(categories.map((c) => [c.id, c]));
  const byCat = new Map<string | null, number>();
  let biggest: { title: string | null; cents: number; date: string } | null = null;
  const rates = await getRates();
  for (const t of txs) {
    const c = toUyu(toCents(t.amount), t.account.currency, rates);
    byCat.set(t.categoryId, (byCat.get(t.categoryId) ?? 0) + c);
    if (!biggest || c > biggest.cents) biggest = { title: t.title, cents: c, date: fromDbDate(t.date) };
  }
  const topCategories = [...byCat]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([id, cents]) => {
      const c = id ? catById.get(id) : undefined;
      return { id, name: c?.name ?? "Sin clasificar", color: c?.color ?? "stone", icon: c?.icon ?? "Question", cents };
    });

  const weights = week.filter((d) => d.weightG !== null);

  return {
    today,
    monday,
    sunday,
    isCurrent,
    elapsed,
    isFuture: monday > today,
    // Los siete días (los gráficos y la tabla van de lunes a domingo).
    days: all.filter((d) => d.date >= monday),
    now: summarize(week),
    before: summarize(prev),
    perHabit,
    topCategories,
    biggest,
    tasksDone,
    tasksNext: tasksNext.map((t) => ({ id: t.id, title: t.title, deadline: fromDbDate(t.deadline!) })),
    weight:
      weights.length >= 1
        ? { first: weights[0].weightG!, last: weights.at(-1)!.weightG!, n: weights.length }
        : null,
    review: review ? { id: review.id, written: review.body.trim().length > 0 } : null,
  };
}

export type WeeklyReview = Awaited<ReturnType<typeof getWeeklyReview>>;
