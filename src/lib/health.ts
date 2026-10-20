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
} from "./health-logic";

/**
 * Lo que midió el reloj en un mes o un año, contra el período anterior (en el
 * período en curso, hasta el mismo día). Sale de `DailyCheckin` directo: no hace
 * falta todo `getDailyMetrics` (hábitos, gastos, plan) para esto.
 */
export async function getHealth(kind: "month" | "year", key: string) {
  const today = todayISO();
  const period = healthPeriod(kind, key, today);
  const rows = await prisma.dailyCheckin.findMany({
    where: { date: { gte: toDbDate(period.prevFrom), lte: toDbDate(period.to) } },
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
    },
    orderBy: { date: "asc" },
  });
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
    });
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
    hasData: hasAnyData(days),
  };
}

export type HealthData = Awaited<ReturnType<typeof getHealth>>;
