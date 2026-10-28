import "server-only";
import { prisma } from "./prisma";
import { addDays, fromDbDate, todayISO, toDbDate } from "./dates";
import {
  emptyHealthDay,
  hasAnyData,
  healthPeriod,
  monthlyAverages,
  summarizeHealth,
  type HealthDay,
  type HealthKind,
} from "./health-logic";

/**
 * Lo que midió el reloj en un mes o un año, contra el período anterior (en el
 * período en curso, hasta el mismo día). Sale de `DailyCheckin` directo: no hace
 * falta todo `getDailyMetrics` (hábitos, gastos, plan) para esto.
 */
export async function getHealth(kind: HealthKind, key: string) {
  const today = todayISO();
  const period = healthPeriod(kind, key, today);
  const range = { gte: toDbDate(period.prevFrom), lte: toDbDate(period.to) };
  // El ánimo es uno solo por día (check-in y journal se copian entre sí); si un día
  // viejo solo lo tiene en el journal, vale ese (la primera entrada con ánimo).
  const [rows, entries] = await Promise.all([
    prisma.dailyCheckin.findMany({
    where: { date: range },
    select: {
      date: true,
      steps: true,
      sleepMin: true,
      stressScore: true,
      hrMin: true,
      hrMax: true,
      distanceM: true,
      activeKcal: true,
      weightG: true,
      mood: true,
      energy: true,
      stress: true,
    },
    orderBy: { date: "asc" },
    }),
    prisma.journalEntry.findMany({
      where: { date: range, mood: { not: null } },
      select: { date: true, mood: true },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    }),
  ]);
  const byDate = new Map<string, HealthDay>();
  for (const r of rows) {
    byDate.set(fromDbDate(r.date), {
      date: fromDbDate(r.date),
      steps: r.steps,
      sleepMin: r.sleepMin,
      stress: r.stressScore,
      hrMin: r.hrMin,
      hrMax: r.hrMax,
      distanceM: r.distanceM,
      activeKcal: r.activeKcal,
      weightG: r.weightG,
      mood: r.mood,
      energy: r.energy,
      feel: r.stress,
    });
  }
  for (const e of entries) {
    const d = fromDbDate(e.date);
    const day = byDate.get(d) ?? emptyHealthDay(d);
    if (day.mood === null) byDate.set(d, { ...day, mood: e.mood });
  }
  // Todos los días del período (los que no tienen dato quedan vacíos: son huecos en los gráficos).
  const days: HealthDay[] = [];
  for (let d = period.from; d <= period.to; d = addDays(d, 1)) days.push(byDate.get(d) ?? emptyHealthDay(d));
  const before = [...byDate.values()].filter((d) => d.date >= period.prevFrom && d.date <= period.prevTo);
  return {
    period,
    today,
    days,
    summary: summarizeHealth(days, before, today),
    months: kind === "year" ? monthlyAverages(days, today) : [],
    /** Ya hay algo del reloj (sin eso, la pantalla invita a conectarlo). */
    hasWatch: hasAnyData(days.map((d) => ({ ...d, mood: null, energy: null, feel: null }))),
    hasData: hasAnyData(days),
  };
}

export type HealthData = Awaited<ReturnType<typeof getHealth>>;
