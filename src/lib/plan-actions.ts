"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "./prisma";
import { exigirSesion } from "./session";
import { logActivity, trashAndDelete } from "./trash";
import { addDays, fromDbDate, isISODate, startOfWeek, toDbDate, todayISO } from "./dates";
import { isPaletteKey } from "./palette";
import { isTime, QUARTERS, type KrStatus, type TaskStatus } from "./plan-logic";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

function refrescar(habitos = false) {
  revalidatePath("/plan", "layout");
  if (habitos) revalidatePath("/habitos", "layout");
  revalidatePath("/");
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
      create: { habitId, date, status: "done", value: habit.target, source: "app" },
      update: { status: "done", value: habit.target, source: "app" },
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
    if (data.taskId && data.taskId !== before.taskId) {
      await prisma.planTask.updateMany({ where: { id: data.taskId }, data: { scheduled: true } });
    }
    // Si cambió el hábito o el día de un bloque hecho, se mueve la marca.
    if (before.done && (before.habitId !== data.habitId || +before.date !== +data.date)) {
      await syncHabit(before.habitId, before.date, false);
      await syncHabit(data.habitId, data.date, true);
    }
    refrescar(before.done);
    return { ok: true, id };
  }
  const created = await prisma.planBlock.create({ data });
  await logActivity("created", "block", created.id, `${title} (${date})`);
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
  const block = await prisma.planBlock.findUnique({ where: { id } });
  if (!block) return;
  await trashAndDelete("block", id);
  // Si estaba hecho y vinculado a un hábito, la marca se va con él.
  if (block.done) await syncHabit(block.habitId, block.date, false);
  refrescar(block.done && !!block.habitId);
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
  // Si ya se copió (o se armó a mano igual), no se duplica: mismo día, hora y nombre.
  const next = await prisma.planBlock.findMany({
    where: { date: { gte: toDbDate(addDays(monday, 7)), lte: toDbDate(addDays(monday, 13)) } },
    select: { date: true, startTime: true, title: true },
  });
  const key = (date: string, start: string | null, title: string) => `${date}|${start ?? ""}|${title.trim().toLowerCase()}`;
  const taken = new Set(next.map((b) => key(fromDbDate(b.date), b.startTime, b.title)));
  const fresh = blocks.filter((b) => !taken.has(key(addDays(fromDbDate(b.date), 7), b.startTime, b.title)));
  if (fresh.length === 0) return { ok: false, error: "La semana que viene ya tiene estos bloques." };
  await prisma.planBlock.createMany({
    data: fresh.map((b) => ({
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
    repeat: ["daily", "weekly", "monthly"].includes(texto(fd, "repeat")) ? texto(fd, "repeat") : null,
    repeatEvery: entero(fd, "repeatEvery", 1, 60) ?? 1,
  };
  if (id) {
    const before = await prisma.planTask.findUnique({ where: { id }, select: { status: true } });
    if (!before) return { ok: false, error: "Esa tarea ya no existe." };
    await prisma.planTask.update({
      where: { id },
      data: {
        ...data,
        completedAt: status === "done" ? (before.status === "done" ? undefined : new Date()) : null,
      },
    });
    // Después de guardar, así la siguiente sale con la repetición recién elegida
    // y la terminada queda sin repetirse.
    if (status === "done" && before.status !== "done") await spawnNext(id);
    refrescar();
    return { ok: true, id };
  }
  // Pasos escritos al crear (uno por renglón).
  const steps = texto(fd, "subtasks", 4000)
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 50);
  const created = await prisma.planTask.create({
    data: {
      ...data,
      completedAt: status === "done" ? new Date() : null,
      subtasks: { create: steps.map((title, order) => ({ title: title.slice(0, 200), order })) },
    },
  });
  await logActivity("created", "task", created.id, title);
  refrescar();
  return { ok: true, id: created.id };
}

export async function setTaskStatus(id: string, status: TaskStatus) {
  await exigirSesion();
  if (!TASK_STATUSES.includes(status)) throw new Error("Estado inválido");
  const before = await prisma.planTask.findUnique({ where: { id }, select: { status: true } });
  if (!before || before.status === status) return;
  const t = await prisma.planTask.update({
    where: { id },
    data: { status, completedAt: status === "done" ? new Date() : null },
  });
  if (status === "done") await spawnNext(id);
  if (status === "done") await logActivity("done", "task", id, `Terminada: ${t.title}`);
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
  await trashAndDelete("task", id);
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

  // El objetivo se elige de la lista o se escribe uno nuevo (en el año que se está viendo).
  let year = entero(fd, "year", 2000, 2100) ?? Number(todayISO().slice(0, 4));
  let objectiveId = texto(fd, "objectiveId", 40) || null;
  if (objectiveId === "__new") objectiveId = null;
  const newObjective = texto(fd, "newObjective", 120);
  if (newObjective) {
    const o = await prisma.planObjective.upsert({
      where: { title_year: { title: newObjective, year } },
      create: { title: newObjective, year, order: await prisma.planObjective.count({ where: { year } }) },
      update: {},
    });
    objectiveId = o.id;
  } else if (objectiveId) {
    // El resultado clave va en el año de su objetivo.
    const o = await prisma.planObjective.findUnique({ where: { id: objectiveId }, select: { year: true } });
    if (o) year = o.year;
    else objectiveId = null;
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
    year,
    ...linkOf(texto(fd, "link", 60)),
  };
  if (id) await prisma.planKeyResult.update({ where: { id }, data });
  else await prisma.planKeyResult.create({ data });
  refrescar();
  return { ok: true };
}

export async function deleteKeyResult(id: string) {
  await exigirSesion();
  await trashAndDelete("keyResult", id);
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

/**
 * Mueve un bloque a otro día (y opcionalmente a otra hora, conservando la
 * duración). Si estaba hecho y vinculado a un hábito, la marca se muda con él.
 */
export async function moveBlock(id: string, date: string, startTime?: string | null) {
  await exigirSesion();
  if (!isISODate(date)) return;
  const b = await prisma.planBlock.findUnique({ where: { id } });
  if (!b) return;
  let start = b.startTime;
  let end = b.endTime;
  if (startTime !== undefined && (startTime === null || isTime(startTime))) {
    if (startTime && b.startTime && b.endTime) {
      const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
      const dur = mins(b.endTime) - mins(b.startTime);
      const e = Math.min(23 * 60 + 59, mins(startTime) + dur);
      end = `${String(Math.floor(e / 60)).padStart(2, "0")}:${String(e % 60).padStart(2, "0")}`;
    } else if (!startTime) end = null;
    start = startTime;
  }
  const to = toDbDate(date);
  await prisma.planBlock.update({ where: { id }, data: { date: to, startTime: start, endTime: end } });
  if (b.done && +b.date !== +to) {
    await syncHabit(b.habitId, b.date, false);
    await syncHabit(b.habitId, to, true);
  }
  refrescar(b.done && !!b.habitId);
}

// ─── Tareas que se repiten y pasos ──────────────────────────────────────────

function shiftDate(iso: string, repeat: string, every: number): string {
  if (repeat === "daily") return addDays(iso, every);
  if (repeat === "weekly") return addDays(iso, 7 * every);
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + every, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, last));
  return t.toISOString().slice(0, 10);
}

/** Al terminar una tarea que se repite aparece la siguiente (con los pasos sin tildar). */
async function spawnNext(id: string) {
  const t = await prisma.planTask.findUnique({ where: { id }, include: { subtasks: { orderBy: { order: "asc" } } } });
  if (!t?.repeat) return;
  const today = todayISO();
  const base = t.deadline ? fromDbDate(t.deadline) : today;
  // Si estaba vencida, la siguiente se corre hasta hoy o después (nunca nace vencida).
  let next = shiftDate(base, t.repeat, t.repeatEvery);
  for (let i = 0; next < today && i < 1000; i++) next = shiftDate(next, t.repeat, t.repeatEvery);
  const created = await prisma.planTask.create({
    data: {
      title: t.title,
      categoryId: t.categoryId,
      status: "todo",
      priority: t.priority,
      deadline: toDbDate(next),
      goal: t.goal,
      progress: t.goal ? 0 : null,
      notes: t.notes,
      repeat: t.repeat,
      repeatEvery: t.repeatEvery,
      subtasks: { create: t.subtasks.map((s) => ({ title: s.title, order: s.order })) },
    },
  });
  // La que se terminó deja de repetirse (la posta la toma la nueva).
  await prisma.planTask.update({ where: { id }, data: { repeat: null } });
  await logActivity("created", "task", created.id, `${t.title} (se repite, para el ${next})`);
}

export async function addSubtask(taskId: string, title: string) {
  await exigirSesion();
  const tt = title.trim().slice(0, 200);
  if (!tt) return;
  const max = await prisma.planSubtask.aggregate({ where: { taskId }, _max: { order: true } });
  await prisma.planSubtask.create({ data: { taskId, title: tt, order: (max._max.order ?? -1) + 1 } });
  refrescar();
}

export async function toggleSubtask(id: string, done: boolean) {
  await exigirSesion();
  await prisma.planSubtask.update({ where: { id }, data: { done } });
  refrescar();
}

export async function deleteSubtask(id: string) {
  await exigirSesion();
  await prisma.planSubtask.deleteMany({ where: { id } });
  refrescar();
}

/** "habit:id" → { linkType, linkId }; vacío o raro → sin vínculo. */
function linkOf(raw: string): { linkType: string | null; linkId: string | null } {
  const m = raw.match(/^(habit|account|goal):([a-z0-9]{10,40})$/i);
  return m ? { linkType: m[1], linkId: m[2] } : { linkType: null, linkId: null };
}

// ─── Objetivos por año ──────────────────────────────────────────────────────

/** Crea o renombra un objetivo. */
export async function saveObjective(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await exigirSesion();
  const id = texto(fd, "id", 40) || null;
  const title = texto(fd, "title", 120);
  if (!title) return { ok: false, error: "Ponele un nombre." };
  const year = entero(fd, "year", 2000, 2100) ?? Number(todayISO().slice(0, 4));
  try {
    if (id) {
      await prisma.planObjective.update({ where: { id }, data: { title } });
      await logActivity("updated", "objective", id, title);
    } else {
      const o = await prisma.planObjective.create({ data: { title, year, order: await prisma.planObjective.count({ where: { year } }) } });
      await logActivity("created", "objective", o.id, `${title} (${year})`);
    }
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return { ok: false, error: "Ya hay un objetivo con ese nombre en ese año." };
    throw e;
  }
  refrescar();
  return { ok: true };
}

/** Borra un objetivo con sus resultados clave (va a la papelera, se puede restaurar). */
export async function deleteObjective(id: string) {
  await exigirSesion();
  await trashAndDelete("objective", id);
  refrescar();
}

/** Corre una fecha un año (el 29/2 cae el 28/2). */
function nextYearDate(d: Date | null, years: number): Date | null {
  if (!d) return null;
  const iso = fromDbDate(d);
  const y = Number(iso.slice(0, 4)) + years;
  const md = iso.slice(5) === "02-29" ? "02-28" : iso.slice(5);
  return toDbDate(`${y}-${md}`);
}

/**
 * Arranca otro año copiando lo elegido (como duplicar la hoja de Notion): los
 * objetivos y resultados clave quedan iguales pero sin empezar, sin progreso y
 * con la fecha límite corrida al año nuevo. Después se editan como cualquier otro.
 */
export async function copyToYear(input: { to: number; objectiveIds: string[]; krIds: string[] }): Promise<ActionResult> {
  await exigirSesion();
  const to = Math.round(Number(input?.to));
  if (!Number.isInteger(to) || to < 2000 || to > 2100) return { ok: false, error: "Año inválido." };
  const objIds = (Array.isArray(input.objectiveIds) ? input.objectiveIds : []).map(String).slice(0, 200);
  const krIds = (Array.isArray(input.krIds) ? input.krIds : []).map(String).slice(0, 500);
  if (!objIds.length && !krIds.length) return { ok: false, error: "Elegí qué copiar." };

  const krs = await prisma.planKeyResult.findMany({ where: { id: { in: krIds } }, orderBy: { createdAt: "asc" } });
  // Un resultado clave elegido trae su objetivo aunque no se haya marcado.
  const wanted = new Set([...objIds, ...krs.map((k) => k.objectiveId).filter((x): x is string => !!x)]);
  const objs = await prisma.planObjective.findMany({ where: { id: { in: [...wanted] } }, orderBy: { order: "asc" } });
  const newId = new Map<string, string>();
  let order = await prisma.planObjective.count({ where: { year: to } });
  for (const o of objs) {
    const copy = await prisma.planObjective.upsert({
      where: { title_year: { title: o.title, year: to } },
      create: { title: o.title, year: to, order: order++ },
      update: {},
    });
    newId.set(o.id, copy.id);
  }
  for (const k of krs) {
    await prisma.planKeyResult.create({
      data: {
        title: k.title,
        objectiveId: k.objectiveId ? (newId.get(k.objectiveId) ?? null) : null,
        kind: k.kind,
        status: "todo",
        quarters: k.quarters,
        deadline: nextYearDate(k.deadline, to - k.year),
        progress: k.goal !== null ? 0 : null,
        goal: k.goal,
        linkType: k.linkType,
        linkId: k.linkId,
        year: to,
      },
    });
  }
  await logActivity("created", "objective", null, `Plan ${to}: ${objs.length} objetivos y ${krs.length} resultados clave copiados`);
  refrescar();
  return { ok: true };
}
