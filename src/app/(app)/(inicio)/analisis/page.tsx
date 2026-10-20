import { FILLED_CHECKIN } from "@/lib/checkin-logic";
import { addDays, todayISO, toDbDate } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { getDailyMetrics } from "@/lib/daily-metrics";
import { buildInsights, byWeekday, correlations, weeklySeries } from "@/lib/insights";
import { AnalysisView } from "./analysis-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Análisis" };

const RANGES = [30, 90, 180, 365];

export default async function AnalisisPage({ searchParams }: PageProps<"/analisis">) {
  const { dias } = await searchParams;
  const n = RANGES.includes(Number(dias)) ? Number(dias) : 90;
  const today = todayISO();
  // Hoy todavía no terminó: el análisis llega hasta ayer.
  const to = addDays(today, -1);
  const from = addDays(to, -(n - 1));
  // Los check-ins cargados de verdad (el ánimo de los días también puede venir del
  // journal, así que no sirve para contarlos): el mismo número que muestra Datos.
  const [{ days, habits }, checkinDays] = await Promise.all([
    getDailyMetrics(from, to),
    prisma.dailyCheckin.count({ where: { date: { gte: toDbDate(from), lte: toDbDate(to) }, ...FILLED_CHECKIN } }),
  ]);
  return (
    <div data-module="inicio" className="min-h-dvh">
      <AnalysisView
        range={n}
        ranges={RANGES}
        insights={buildInsights(days, habits)}
        weekdays={byWeekday(days)}
        corr={correlations(days)}
        weeks={weeklySeries(days)}
        checkinDays={checkinDays}
      />
    </div>
  );
}
