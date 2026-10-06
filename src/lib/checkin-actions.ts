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
  await prisma.dailyCheckin.upsert({
    where: { date: toDbDate(date) },
    create: { date: toDbDate(date), ...data },
    update: data,
  });
  revalidatePath("/");
  revalidatePath("/analisis");
  revalidatePath("/semana");
}
