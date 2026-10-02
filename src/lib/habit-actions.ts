"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "./prisma";
import { exigirSesion } from "./session";
import { isISODate, todayISO, toDbDate } from "./dates";
import { isPaletteKey } from "./palette";
import type { LogStatus } from "./habit-logic";

export type ActionResult = { ok: true; id?: string } | { ok: false, error: string };

function refrescar() {
  revalidatePath("/habitos", "layout");
}

const STATUSES: LogStatus[] = ["done", "failed", "skipped"];

/**
 * Marca un día. `status` null borra la marca. En hábitos de cantidad `value` es
 * lo hecho ese día; en los de sí/no queda en 1. `note` undefined deja la nota
 * como estaba; un día sin marca pero con nota queda con status "none".
 */
export async function setHabitLog(
  habitId: string,
  date: string,
  status: LogStatus | null,
  value = 1,
  note?: string | null,
) {
  await exigirSesion();
  if (!isISODate(date)) throw new Error("Fecha inválida");
  if (status !== null && !STATUSES.includes(status)) throw new Error("Estado inválido");

  const key = { habitId, date: toDbDate(date) };
  let finalNote: string | null;
  if (note === undefined) {
    const existing = await prisma.habitLog.findUnique({ where: { habitId_date: key }, select: { note: true } });
    finalNote = existing?.note ?? null;
  } else {
    finalNote = note?.trim().slice(0, 2000) || null;
  }

  let s: string | null = status;
  let v = Math.max(0, Math.min(100_000, Math.round(value)));
  if (s === "done" && v <= 0) s = null;
  if (s === null) {
    if (!finalNote) {
      await prisma.habitLog.deleteMany({ where: key });
      refrescar();
      return;
    }
    s = "none";
    v = 0;
  }
  await prisma.habitLog.upsert({
    where: { habitId_date: key },
    create: { ...key, status: s, value: v, note: finalNote },
    update: { status: s, value: v, note: finalNote },
  });
  refrescar();
}

function texto(fd: FormData, key: string, max = 200): string {
  return String(fd.get(key) ?? "").trim().slice(0, max);
}

function entero(fd: FormData, key: string, min: number, max: number, def: number): number {
  const n = Number(fd.get(key));
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.round(n)));
}

export async function saveHabit(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await exigirSesion();
  const id = texto(fd, "id", 40) || null;
  const name = texto(fd, "name", 80);
  if (!name) return { ok: false, error: "Ponele un nombre." };

  const frequency = ["daily", "weekdays", "weekly"].includes(texto(fd, "frequency"))
    ? texto(fd, "frequency")
    : "daily";
  const weekdays = fd
    .getAll("weekdays")
    .map(Number)
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  if (frequency === "weekdays" && weekdays.length === 0) {
    return { ok: false, error: "Elegí al menos un día." };
  }

  const kind = texto(fd, "kind");
  const target = kind === "count" ? entero(fd, "target", 1, 100_000, 1) : 1;
  const unit = kind === "count" ? texto(fd, "unit", 30) || null : null;
  const startRaw = texto(fd, "startDate", 10);
  const startDate = isISODate(startRaw) ? startRaw : todayISO();
  const categoryId = texto(fd, "categoryId", 40) || null;

  const data = {
    name,
    description: texto(fd, "description", 500) || null,
    categoryId,
    frequency,
    weekdays: frequency === "weekdays" ? [...new Set(weekdays)].sort() : [],
    timesPerWeek: entero(fd, "timesPerWeek", 1, 7, 1),
    target,
    unit,
    priority: entero(fd, "priority", 1, 5, 1),
    startDate: toDbDate(startDate),
  };

  if (id) {
    await prisma.habit.update({ where: { id }, data });
    refrescar();
    return { ok: true, id };
  }
  const last = await prisma.habit.aggregate({ _max: { order: true } });
  const created = await prisma.habit.create({ data: { ...data, order: (last._max.order ?? 0) + 1 } });
  refrescar();
  return { ok: true, id: created.id };
}

export async function archiveHabit(id: string, archived: boolean) {
  await exigirSesion();
  await prisma.habit.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
  refrescar();
}

export async function deleteHabit(id: string) {
  await exigirSesion();
  await prisma.habit.delete({ where: { id } });
  refrescar();
}

/** Reordena la lista: recibe los ids en el orden nuevo. */
export async function reorderHabits(ids: string[]) {
  await exigirSesion();
  await prisma.$transaction(ids.map((id, i) => prisma.habit.update({ where: { id }, data: { order: i } })));
  refrescar();
}

export async function saveCategory(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await exigirSesion();
  const id = texto(fd, "id", 40) || null;
  const name = texto(fd, "name", 40);
  if (!name) return { ok: false, error: "Ponele un nombre." };
  const color = texto(fd, "color");
  const data = {
    name,
    icon: texto(fd, "icon", 40) || "Circle",
    color: isPaletteKey(color) ? color : "stone",
  };
  try {
    if (id) await prisma.habitCategory.update({ where: { id }, data });
    else {
      const last = await prisma.habitCategory.aggregate({ _max: { order: true } });
      await prisma.habitCategory.create({ data: { ...data, order: (last._max.order ?? 0) + 1 } });
    }
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return { ok: false, error: "Ya hay una categoría con ese nombre." };
    throw e;
  }
  refrescar();
  return { ok: true };
}

/** Borra la categoría; sus hábitos quedan sin categoría. */
export async function deleteCategory(id: string) {
  await exigirSesion();
  await prisma.habitCategory.delete({ where: { id } });
  refrescar();
}
