import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "./prisma";
import { toDbDate } from "./dates";
import type { CheckinPatch } from "./checkin-logic";

/**
 * Guarda campos ya validados (`cleanPatch`) del check-in de un día. Lo usan la tarjeta de
 * Inicio (`saveCheckin`, con sesión) y el bot de WhatsApp (CC).
 */
export async function applyCheckin(date: string, data: CheckinPatch) {
  if (Object.keys(data).length === 0) return null;
  const before = "mood" in data ? await prisma.dailyCheckin.findUnique({ where: { date: toDbDate(date) }, select: { mood: true } }) : null;
  const row = await prisma.dailyCheckin.upsert({
    where: { date: toDbDate(date) },
    create: { date: toDbDate(date), ...data },
    update: data,
  });
  // Si quedó sin ningún dato (se borró todo), la fila sobra: si no, contaría como check-in.
  if ([row.mood, row.energy, row.stress, row.sleepMin, row.weightG, row.steps, row.stressScore, row.hrMin, row.hrMax, row.distanceM, row.activeKcal, row.note].every((v) => v === null)) {
    await prisma.dailyCheckin.delete({ where: { id: row.id } });
  }
  // El ánimo es uno solo por día: pasa a las entradas del journal de ese día que
  // no tenían ánimo o tenían el mismo que el check-in (no pisa uno distinto elegido a mano).
  if ("mood" in data) {
    const old = before?.mood ?? null;
    const n = await prisma.journalEntry.updateMany({
      where: { date: toDbDate(date), OR: [{ mood: null }, ...(old !== null ? [{ mood: old }] : [])] },
      data: { mood: data.mood ?? null },
    });
    if (n.count) revalidatePath("/journal", "layout");
  }
  revalidatePath("/");
  revalidatePath("/analisis");
  revalidatePath("/semana");
  return row;
}
