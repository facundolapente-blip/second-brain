"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "./prisma";
import { exigirSesion } from "./session";
import { addDays, fromDbDate, isISODate, startOfWeek, toDbDate } from "./dates";
import { isPaletteKey } from "./palette";
import { isTime, QUARTERS, type KrStatus, type TaskStatus } from "./plan-logic";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

function refrescar(habitos = false) {
  revalidatePath("/plan", "layout");
  if (habitos) revalidatePath("/habitos", "layout");
}

function texto(fd: FormData, key: string, max = 200): string {
  return String(fd.get(key) ?? "").trim().slice(0, max);
}
function entero(fd: FormData, key: string, min: number, max: number): number | null {
  const raw = String(fd.get(key) ?? "").trim();
  if (raw === "") return null;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : null;
}
function fecha(fd: FormData, key: string): string | null {
  const v = texto(fd, key, 10);
  return isISODate(v) ? v : null;
}

// ─── Hábitos vinculados ─────────────────────────────────────────────────────

/** Deja la marca del hábito igual que el bloque: hecho si está hecho, sin marcar si no. */
async function syncHabit(habitId: string | null, date: Date, done: boolean) {
  if (!habitId) return;
  const habit = await prisma.habit.findUnique({ where: { id: habitId }, select: { target: true } });
  if (!habit) return;
  const key = { habitId_date: { habitId, date } };
  if (done) {
    await prisma.habitLog.upsert({
      where: key,
      create: { habitId, date, status: "done", value: habit.target },
      update: { status: "done", value: habit.target },
    });
  } else {
    // Solo se desmarca si la marca era "hecho": no se pisa un fallado o salteado.
    const log = await prisma.habitLog.findUnique({ where: key });
    if (log?.status === "done") {
      if (log.note) await prisma.habitLog.update({ where: key, data: { status: "none", value: 0 } });
      else await prisma.habitLog.delete({ where: key });
    }
  }
}

// ─── Bloques ────────────────────────────────────────────────────────────────

export async function saveBlock(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await exigirSesion();
  const id = texto(fd, "id", 40) || null;
  const title = texto(fd, "title", 120);
  if (!title) return { ok: false, error: "Ponele un nombre." };
  const date = fecha(fd, "date");
  if (!date) return { ok: false, error: "Elegí el día." };
  const start = texto(fd, "startTime", 5);
  const end = texto(fd, "endTime", 5);
  const startTime = isTime(start) ? start : null;
  const endTime = startTime && isTime(end) && end > startTime ? end : null;
  if (start && !startTime) return { ok: false, error: "La hora de inicio no es válida." };

  const data = {
    title,
    categoryId: texto(fd, "categoryId", 40) || null,
    date: toDbDate(date),
    startTime,
    endTime,
    priority: entero(fd, "priority", 0, 4) ?? 0,
    place: texto(fd, "place", 120) || null,
    notes: texto(fd, "notes", 2000) || null,
    taskId: texto(fd, "taskId", 40) || null,
    habitId: texto(fd, "habitId", 40) || null,
  };

  if (id) {
    const before = await prisma.planBlock.findUnique({ where: { id } });
    if (!before) return { ok: false, error: "Ese bloque ya no existe." };
    await prisma.planBlock.update({ where: { id }, data });
    // Si cambió el hábito o el día de un bloque hecho, se mueve la marca.
    if (before.done && (before.habitId !== data.habitId || +before.date !== +data.date)) {
      await syncHabit(before.habitId, before.date, false);
      await syncHabit(data.habitId, data.date, true);
    }
    refrescar(before.done);
    return { ok: true, id };
  }
  const created = await prisma.planBlock.create({ data });
  if (data.taskId) await prisma.planTask.update({ where: { id: data.taskId }, data: { scheduled: true } });
  refrescar();
  return { ok: true, id: created.id };
}

export async function setBlockDone(id: string, done: boolean) {
  await exigirSesion();
  const block = await prisma.planBlock.update({ where: { id }, data: { done } });
  await syncHabit(block.habitId, block.date, done);
  refrescar(!!block.habitId);
}

export async function deleteBlock(id: string) {
  await exigirSesion();
  await prisma.planBlock.delete({ where: { id } });
  refrescar();
}

/**
 * Copia los bloques de una semana a la siguiente (sin el "hecho"), para no
 * armar de cero lo que se repite: facultad, gym, trabajo.
 */
export async function copyWeekToNext(day: string): Promise<ActionResult> {
  await exigirSesion();
  if (!isISODate(day)) return { ok: false, error: "Fecha inválida." };
  const monday = startOfWeek(day);
  const blocks = await prisma.planBlock.findMany({
    where: { date: { gte: toDbDate(monday), lte: toDbDate(addDays(monday, 6)) } },
  });
  if (blocks.length === 0) return { ok: false, error: "Esta semana no tiene bloques para copiar." };
  await prisma.planBlock.createMany({
    data: blocks.map((b) => ({
      title: b.title,
      categoryId: b.categoryId,
      date: toDbDate(addDays(fromDbDate(b.date), 7)),
      startTime: b.startTime,
      endTime: b.endTime,
      priority: b.priority,
      place: b.place,
      notes: b.notes,
      habitId: b.habitId,
    })),
  });
  refrescar();
  return { ok: true };
}

// ─── Tareas ─────────────────────────────────────────────────────────────────

const TASK_STATUSES: TaskStatus[] = ["backlog", "todo", "doing", "done"];

export async function saveTask(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await exigirSesion();
  const id = texto(fd, "id", 40) || null;
  const title = texto(fd, "title", 160);
  if (!title) return { ok: false, error: "Ponele un nombre." };
  const statusRaw = texto(fd, "status") as TaskStatus;
  const status = TASK_STATUSES.includes(statusRaw) ? statusRaw : "todo";
  const deadline = fecha(fd, "deadline");
  const data = {
    title,
    categoryId: texto(fd, "categoryId", 40) || null,
    status,
    priority: entero(fd, "priority", 0, 4) ?? 1,
    deadline: deadline ? toDbDate(deadline) : null,
    progress: entero(fd, "progress", 0, 1_000_000),
    goal: entero(fd, "goal", 0, 1_000_000),
    scheduled: fd.get("scheduled") === "on",
    notes: texto(fd, "notes", 4000) || null,
  };
  if (id) {
    const before = await prisma.planTask.findUnique({ where: { id }, select: { status: true } });
    await prisma.planTask.update({
      where: { id },
      data: {
        ...data,
        completedAt: status === "done" ? (before?.status === "done" ? undefined : new Date()) : null,
      },
    });
    refrescar();
    return { ok: true, id };
  }
  const created = await prisma.planTask.create({
    data: { ...data, completedAt: status === "done" ? new Date() : null },
  });
  refrescar();
  return { ok: true, id: created.id };
}

export async function setTaskStatus(id: string, status: TaskStatus) {
  await exigirSesion();
  if (!TASK_STATUSES.includes(status)) throw new Error("Estado inválido");
  await prisma.planTask.update({
    where: { id },
    data: { status, completedAt: status === "done" ? new Date() : null },
  });
  refrescar();
}

/** Suma (o resta) uno al progreso de una tarea. */
export async function bumpTaskProgress(id: string, delta: 1 | -1) {
  await exigirSesion();
  const t = await prisma.planTask.findUnique({ where: { id }, select: { progress: true, goal: true } });
  if (!t) return;
  const next = Math.max(0, (t.progress ?? 0) + delta);
  await prisma.planTask.update({ where: { id }, data: { progress: t.goal ? Math.min(t.goal, next) : next } });
  refrescar();
}

export async function deleteTask(id: string) {
  await exigirSesion();
  await prisma.planTask.delete({ where: { id } });
  refrescar();
}

// ─── Objetivos y resultados clave ───────────────────────────────────────────

const KR_STATUSES: KrStatus[] = ["todo", "doing", "done", "closed"];

/** Acepta "120.000", "120000", "15,5" o "15.5". */
function decimal(fd: FormData, key: string): number | null {
  let raw = String(fd.get(key) ?? "").trim();
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(raw)) raw = raw.replace(/\./g, "");
  raw = raw.replace(",", ".");
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export async function saveKeyResult(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await exigirSesion();
  const id = texto(fd, "id", 40) || null;
  const title = texto(fd, "title", 160);
  if (!title) return { ok: false, error: "Ponele un nombre." };

  // El objetivo se elige de la lista o se escribe uno nuevo.
  let objectiveId = texto(fd, "objectiveId", 40) || null;
  if (objectiveId === "__new") objectiveId = null;
  const newObjective = texto(fd, "newObjective", 120);
  if (newObjective) {
    const o = await prisma.planObjective.upsert({
      where: { title: newObjective },
      create: { title: newObjective, order: await prisma.planObjective.count() },
      update: {},
    });
    objectiveId = o.id;
  }
  const statusRaw = texto(fd, "status") as KrStatus;
  const deadline = fecha(fd, "deadline");
  const data = {
    title,
    objectiveId,
    kind: texto(fd, "kind") === "habit" ? "habit" : "activity",
    status: KR_STATUSES.includes(statusRaw) ? statusRaw : "todo",
    quarters: fd.getAll("quarters").map(String).filter((q) => (QUARTERS as readonly string[]).includes(q)),
    deadline: deadline ? toDbDate(deadline) : null,
    progress: decimal(fd, "progress"),
    goal: decimal(fd, "goal"),
  };
  if (id) await prisma.planKeyResult.update({ where: { id }, data });
  else await prisma.planKeyResult.create({ data });
  refrescar();
  return { ok: true };
}

export async function deleteKeyResult(id: string) {
  await exigirSesion();
  await prisma.planKeyResult.delete({ where: { id } });
  refrescar();
}

export async function saveCategory(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await exigirSesion();
  const id = texto(fd, "id", 40) || null;
  const name = texto(fd, "name", 40);
  if (!name) return { ok: false, error: "Ponele un nombre." };
  const color = texto(fd, "color");
  const data = { name, color: isPaletteKey(color) ? color : "stone" };
  try {
    if (id) await prisma.planCategory.update({ where: { id }, data });
    else await prisma.planCategory.create({ data: { ...data, order: await prisma.planCategory.count() } });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return { ok: false, error: "Ya hay una categoría con ese nombre." };
    throw e;
  }
  refrescar();
  return { ok: true };
}
