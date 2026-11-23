"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "./prisma";
import { exigirSesion } from "./session";
import { todayISO, toDbDate } from "./dates";
import { cleanRitualPatch, isRitualDay } from "./ritual-logic";
import { markBlockDone } from "./block-done";

/**
 * Guarda uno o más campos del ritual matutino de un día (la tarea prioritaria, "La hice",
 * "Saltar hoy" o "Listo"). Energía y ánimo van por `saveCheckin`.
 */
export async function saveRitual(day: string, patch: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  await exigirSesion();
  if (!isRitualDay(day, todayISO())) return { ok: false, error: "Fecha inválida." };
  const p = cleanRitualPatch(patch);
  const data: {
    frogTaskId?: string | null;
    frogBlockId?: string | null;
    frogTitle?: string | null;
    frogDoneAt?: Date | null;
    skipped?: boolean;
    completedAt?: Date | null;
  } = {};
  if ("frogTitle" in p) {
    // Una tarea del Plan: el nombre es el suyo (si ya no está, queda como sapo escrito).
    const task = p.frogTaskId ? await prisma.planTask.findUnique({ where: { id: p.frogTaskId }, select: { id: true, title: true } }) : null;
    // Un bloque de ese día (de ahí sale primero la tarea prioritaria): su nombre manda.
    const block = p.frogBlockId
      ? await prisma.planBlock.findFirst({ where: { id: p.frogBlockId, date: toDbDate(day) }, select: { id: true, title: true, taskId: true } })
      : null;
    data.frogBlockId = block?.id ?? null;
    data.frogTaskId = task?.id ?? block?.taskId ?? null;
    data.frogTitle = block?.title ?? task?.title ?? p.frogTitle ?? null;
  }
  if ("frogDoneAt" in p) {
    // La hora del aparato (sin señal se sube más tarde); una hora imposible pasa a "ahora".
    const at = p.frogDoneAt ? new Date(p.frogDoneAt) : null;
    data.frogDoneAt = at && Math.abs(+at - Date.now()) < 8 * 86_400_000 ? at : at ? new Date() : null;
  }
  if ("skipped" in p) data.skipped = p.skipped;
  const where = { day: toDbDate(day) };
  if ("completed" in p) {
    const prev = await prisma.dailyRitual.findUnique({ where, select: { completedAt: true } });
    data.completedAt = p.completed ? (prev?.completedAt ?? new Date()) : null;
  }
  if (Object.keys(data).length === 0) return { ok: true };
  // Otro sapo: lo comido era del anterior.
  if ("frogTitle" in data && !("frogDoneAt" in data)) {
    const prev = await prisma.dailyRitual.findUnique({ where, select: { frogTitle: true, frogTaskId: true, frogBlockId: true } });
    if (prev && (prev.frogTitle !== data.frogTitle || prev.frogTaskId !== data.frogTaskId || prev.frogBlockId !== data.frogBlockId)) data.frogDoneAt = null;
  }
  const saved = await prisma.dailyRitual.upsert({ where, create: { day: toDbDate(day), ...data }, update: data });
  // "La hice" de un bloque de hoy: el bloque se tilda igual (y al revés, desde el Plan, markBlockDone).
  if ("frogDoneAt" in data && saved.frogBlockId) {
    await markBlockDone(saved.frogBlockId, !!saved.frogDoneAt, { fromRitual: true });
    revalidatePath("/plan");
  }
  revalidatePath("/");
  revalidatePath("/semana");
  return { ok: true };
}
