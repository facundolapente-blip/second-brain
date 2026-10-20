import "server-only";
import { prisma } from "./prisma";
import { addDays, fromDbDate, startOfWeek, toDbDate, todayISO } from "./dates";
import { getDailyMetrics, habitTotals, type DayMetrics } from "./daily-metrics";
import { toCents } from "./finance-logic";
import { NOT_ADJUSTMENT, PERSONAL } from "./finance";
import { getRates, toUyu } from "./fx";
import { REVIEW_TAG, REVIEW_TEMPLATE } from "./review-logic";

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
    // Del reloj (promedio de los días que mandó el dato).
    stressWatch: avg(days.map((d) => d.stressWatch)),
    hrMin: avg(days.map((d) => d.hrMin)),
    distanceM: avg(days.map((d) => d.distanceM)),
    activeKcal: avg(days.map((d) => d.activeKcal)),
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
      // Gastos y reintegros (ingresos con categoría de gasto): el reintegro resta de su categoría,
      // igual que en el total, así categorías y total coinciden.
      where: {
        date: { gte: toDbDate(monday), lte: toDbDate(sunday) },
        AND: [NOT_ADJUSTMENT, { OR: [{ kind: "expense" }, { kind: "income", category: { kind: "expense" } }] }],
        ...PERSONAL,
      },
      select: { title: true, kind: true, amount: true, categoryId: true, date: true, account: { select: { currency: true } } },
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
    // La reflexión de esta semana: solo la de lunes a domingo (`writeWeeklyReview` la
    // crea el domingo, o hoy si la semana no terminó). Con el lunes siguiente, una
    // escrita ese lunes contaba para las dos semanas.
    prisma.journalEntry.findFirst({
      where: { tags: { has: REVIEW_TAG }, date: { gte: toDbDate(monday), lte: toDbDate(sunday) } },
      select: { id: true, body: true },
      orderBy: { createdAt: "asc" },
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

  // Hábitos: cuántas veces se hizo cada uno de las que tocaba (los semanales, contra su meta).
  // Los siete días, así un semanal se mide contra la meta entera de la semana ("1 de 4").
  const fullWeek = all.filter((d) => d.date >= monday);
  const todayRow = week.find((d) => d.date === today);
  /**
   * "Para reforzar". En la semana en curso no se juzga lo que todavía se puede
   * hacer: un semanal entra solo si ya no llega a la meta con los días que quedan
   * (si no, un lunes todos daban "0 de 5"), y los demás se miden sobre los días
   * cerrados (hoy sin marcar todavía no es un "no").
   */
  const reinforce = (h: (typeof habits)[number], t: { done: number; due: number; pct: number | null }) => {
    if (!isCurrent) return (t.pct ?? 0) < 50;
    if (h.weeklyTarget) {
      const left = fullWeek.filter((d) => d.date > today).length + (todayRow?.habitOpen.includes(h.id) ? 1 : 0);
      return t.done + left < t.due;
    }
    const closed = week.filter((d) => h.id in d.habit && !d.habitOpen.includes(h.id));
    return closed.length > 0 && closed.filter((d) => d.habit[h.id]).length / closed.length < 0.5;
  };
  const perHabit = habits
    .map((h) => {
      const t = habitTotals(h, h.weeklyTarget ? fullWeek : week);
      return { ...h, ...t, reinforce: reinforce(h, t) };
    })
    .filter((h) => h.due > 0)
    .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0) || b.done - a.done);

  const catById = new Map(categories.map((c) => [c.id, c]));
  const byCat = new Map<string | null, number>();
  let biggest: { title: string | null; cents: number; date: string } | null = null;
  const rates = await getRates();
  for (const t of txs) {
    const c = toUyu(toCents(t.amount), t.account.currency, rates) * (t.kind === "income" ? -1 : 1);
    byCat.set(t.categoryId, (byCat.get(t.categoryId) ?? 0) + c);
    if (t.kind === "expense" && (!biggest || c > biggest.cents)) biggest = { title: t.title, cents: c, date: fromDbDate(t.date) };
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
    // "Ya la empezaste" solo si escribió algo además de las preguntas.
    review: review ? { id: review.id, written: review.body.trim().length > 0 && review.body.trim() !== REVIEW_TEMPLATE.trim() } : null,
  };
}

export type WeeklyReview = Awaited<ReturnType<typeof getWeeklyReview>>;
