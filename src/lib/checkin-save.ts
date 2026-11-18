import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "./prisma";
import { toDbDate } from "./dates";
import type { CheckinPatch } from "./checkin-logic";

/**
 * Guarda campos ya validados (`cleanPatch`) del check-in de un día. Lo usan la tarjeta de
 * Inicio (`saveCheckin`, con sesión) y el bot de WhatsApp (CC). El ánimo de acá es el de la
 * mañana: no toca las entradas del journal, que tienen el suyo (el de la noche).
 */
export async function applyCheckin(date: string, data: CheckinPatch) {
  if (Object.keys(data).length === 0) return null;
  const row = await prisma.dailyCheckin.upsert({
    where: { date: toDbDate(date) },
    create: { date: toDbDate(date), ...data },
    update: data,
  });
  // Si quedó sin ningún dato (se borró todo), la fila sobra: si no, contaría como check-in.
  if ([row.mood, row.energy, row.stress, row.sleepMin, row.weightG, row.steps, row.stressScore, row.hrMin, row.hrMax, row.distanceM, row.activeKcal, row.note].every((v) => v === null)) {
    await prisma.dailyCheckin.delete({ where: { id: row.id } });
  }
  revalidatePath("/");
  revalidatePath("/analisis");
  revalidatePath("/semana");
  return row;
}
