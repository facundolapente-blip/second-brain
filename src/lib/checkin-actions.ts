"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "./prisma";
import { exigirSesion } from "./session";
import { addDays, isISODate, todayISO, toDbDate } from "./dates";
import { cleanPatch } from "./checkin-logic";

/** Guarda uno o más campos del check-in de un día (hoy o días pasados, no futuros). */
export async function saveCheckin(date: string, patch: unknown) {
  await exigirSesion();
  if (!isISODate(date) || date > todayISO() || date < addDays(todayISO(), -400)) throw new Error("Fecha inválida");
  const data = cleanPatch(patch);
  if (Object.keys(data).length === 0) return;
  const before = "mood" in data ? await prisma.dailyCheckin.findUnique({ where: { date: toDbDate(date) }, select: { mood: true } }) : null;
  await prisma.dailyCheckin.upsert({
    where: { date: toDbDate(date) },
    create: { date: toDbDate(date), ...data },
    update: data,
  });
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
}
