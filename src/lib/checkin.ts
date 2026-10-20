import "server-only";
import { prisma } from "./prisma";
import { fromDbDate, toDbDate } from "./dates";
import { emptyCheckin, type CheckinDTO, type WatchDay } from "./checkin-logic";

type Row = Awaited<ReturnType<typeof prisma.dailyCheckin.findMany>>[number];

export function toCheckinDTO(r: Row): CheckinDTO {
  return {
    date: fromDbDate(r.date),
    mood: r.mood,
    energy: r.energy,
    stress: r.stress,
    sleepMin: r.sleepMin,
    weightG: r.weightG,
    note: r.note,
  };
}

/** Check-ins entre dos días inclusive, por fecha. */
export async function getCheckins(from: string, to: string): Promise<Map<string, CheckinDTO>> {
  const rows = await prisma.dailyCheckin.findMany({ where: { date: { gte: toDbDate(from), lte: toDbDate(to) } } });
  return new Map(rows.map((r) => [fromDbDate(r.date), toCheckinDTO(r)]));
}

export async function getCheckin(date: string): Promise<CheckinDTO> {
  return (await getCheckinDay(date)).checkin;
}

/** Lo que mandó el reloj en una fila (null si no mandó nada). */
export function toWatchDay(r: Row): WatchDay | null {
  const w = { steps: r.steps, stressScore: r.stressScore, hrMin: r.hrMin, hrMax: r.hrMax, distanceM: r.distanceM, activeKcal: r.activeKcal };
  return Object.values(w).some((v) => v !== null) ? w : null;
}

/** El check-in de un día y, aparte, lo del reloj (Inicio lo muestra solo para leer). */
export async function getCheckinDay(date: string): Promise<{ checkin: CheckinDTO; watch: WatchDay | null }> {
  const r = await prisma.dailyCheckin.findUnique({ where: { date: toDbDate(date) } });
  return r ? { checkin: toCheckinDTO(r), watch: toWatchDay(r) } : { checkin: emptyCheckin(date), watch: null };
}

/** Último peso cargado (para sugerirlo). */
export async function lastWeight(): Promise<number | null> {
  const r = await prisma.dailyCheckin.findFirst({
    where: { weightG: { not: null } },
    orderBy: { date: "desc" },
    select: { weightG: true },
  });
  return r?.weightG ?? null;
}
