import "server-only";
import { prisma } from "./prisma";
import { fromDbDate } from "./dates";
import { nextWheelDate, parseScores, type WheelScores } from "./life-wheel";

export type WheelDTO = { id: string; date: string; scores: WheelScores; note: string | null };

/** Todas las ruedas, de la más nueva a la más vieja. */
export async function getWheels(): Promise<WheelDTO[]> {
  const rows = await prisma.lifeWheel.findMany({ orderBy: [{ date: "desc" }, { createdAt: "desc" }] });
  return rows.map((w) => ({ id: w.id, date: fromDbDate(w.date), scores: parseScores(w.scores), note: w.note }));
}

/** Para el aviso de Inicio: la fecha de la próxima rueda si ya llegó (null si no toca o no hay ninguna). */
export async function wheelDue(today: string): Promise<{ last: string; next: string } | null> {
  const last = await prisma.lifeWheel.findFirst({ orderBy: { date: "desc" }, select: { date: true } });
  if (!last) return null;
  const lastIso = fromDbDate(last.date);
  const next = nextWheelDate(lastIso);
  return next <= today ? { last: lastIso, next } : null;
}
