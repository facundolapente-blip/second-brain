"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "./prisma";
import { exigirSesion } from "./session";
import { addDays, isISODate, todayISO, toDbDate } from "./dates";
import { cleanPatch } from "./checkin-logic";
import { logActivity } from "./trash";

/** Guarda uno o más campos del check-in de un día (hoy o días pasados, no futuros). */
export async function saveCheckin(date: string, patch: unknown) {
  await exigirSesion();
  if (!isISODate(date) || date > todayISO() || date < addDays(todayISO(), -400)) throw new Error("Fecha inválida");
  const data = cleanPatch(patch);
  if (Object.keys(data).length === 0) return;
  const before = "mood" in data ? await prisma.dailyCheckin.findUnique({ where: { date: toDbDate(date) }, select: { mood: true } }) : null;
  const row = await prisma.dailyCheckin.upsert({
    where: { date: toDbDate(date) },
    create: { date: toDbDate(date), ...data },
    update: data,
  });
  // Si quedó sin ningún dato (se borró todo), la fila sobra: si no, contaría como check-in.
  if ([row.mood, row.energy, row.stress, row.sleepMin, row.weightG, row.steps, row.note].every((v) => v === null)) {
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
}

export type HealthImportResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * Pasos y sueño por día, ya leídos en el navegador (ver health-parse.ts). Los pasos
 * se pisan con lo importado; el sueño solo completa los días que no lo tenían
 * (lo cargado a mano en el check-in manda).
 */
export async function importHealth(days: unknown): Promise<HealthImportResult> {
  await exigirSesion();
  if (!Array.isArray(days) || days.length === 0) return { ok: false, error: "No llegaron días." };
  if (days.length > 5000) return { ok: false, error: "Son demasiados días de una vez." };
  const today = todayISO();
  const clean = days
    .map((d) => d as { date?: unknown; steps?: unknown; sleepMin?: unknown })
    .filter((d): d is { date: string; steps?: unknown; sleepMin?: unknown } => isISODate(d.date) && (d.date as string) <= today)
    .map((d) => ({
      date: d.date,
      steps: Number.isInteger(d.steps) && (d.steps as number) > 0 && (d.steps as number) < 200_000 ? (d.steps as number) : null,
      sleepMin: Number.isInteger(d.sleepMin) && (d.sleepMin as number) >= 30 && (d.sleepMin as number) <= 16 * 60 ? (d.sleepMin as number) : null,
    }))
    .filter((d) => d.steps !== null || d.sleepMin !== null);
  if (!clean.length) return { ok: false, error: "No había pasos ni sueño en el archivo." };

  const existing = await prisma.dailyCheckin.findMany({
    where: { date: { in: clean.map((d) => toDbDate(d.date)) } },
    select: { date: true, sleepMin: true },
  });
  const had = new Map(existing.map((c) => [+c.date, c]));
  let steps = 0;
  let sleep = 0;
  for (const d of clean) {
    const date = toDbDate(d.date);
    const prev = had.get(+date);
    const data: { steps?: number; sleepMin?: number } = {};
    if (d.steps !== null) {
      data.steps = d.steps;
      steps++;
    }
    if (d.sleepMin !== null && (prev?.sleepMin ?? null) === null) {
      data.sleepMin = d.sleepMin;
      sleep++;
    }
    if (!Object.keys(data).length) continue;
    await prisma.dailyCheckin.upsert({ where: { date }, create: { date, ...data }, update: data });
  }
  await logActivity("imported", "import", null, `Salud: pasos de ${steps} días, sueño de ${sleep} días`);
  revalidatePath("/");
  revalidatePath("/analisis");
  revalidatePath("/datos");
  return {
    ok: true,
    message: `Listo: pasos de ${steps} ${steps === 1 ? "día" : "días"} y sueño de ${sleep} ${sleep === 1 ? "día" : "días"} (el sueño que ya tenías cargado no se tocó).`,
  };
}
