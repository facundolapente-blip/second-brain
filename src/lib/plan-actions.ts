"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { QUARTER_REVIEW_TAG } from "./review-logic";
import { prisma } from "./prisma";
import { syncLinkedHabit } from "./plan-habit-link";
import { exigirSesion } from "./session";
import { logActivity, trashAndDelete } from "./trash";
import { addDays, fromDbDate, isISODate, startOfWeek, toDbDate, todayISO } from "./dates";
import { isPaletteKey } from "./palette";
import { isTime, nextQuarter, normalizeTime, QUARTERS, quarterRange, quarterReviewTemplate, REVIEW_DISMISSED_KEY, type KrStatus, type TaskStatus, parseTaskColumns, parseTaskColumnOrder, TASK_COLUMN_ORDER_KEY, type TaskColumnWidths, parseTaskLinks, topSortKey, type SortKeyPatch, isClientId } from "./plan-logic";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

function refrescar() {
  revalidatePath("/plan", "layout");
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

// ─── Bloques ────────────────────────────────────────────────────────────────

/**
 * Un bloque creado sin señal se ve en la pantalla con id `pendiente-<id de la
 * llamada>` (`applyPendingBlocks`). Lo que se le haga antes de subir (tildarlo,
 * moverlo) llega con ese id: la creación ya pasó por `runOnce`, que guardó su
 * resultado con el id de verdad, así que se busca ahí.
 */
async function blockId(raw: unknown): Promise<string> {
  const s = String(raw ?? "").slice(0, 80);
  const m = s.match(/^pendiente-([\w-]{8,64})$/);
  if (!m) return s;
  const r = await prisma.actionReceipt.findUnique({ where: { id: m[1] }, select: { result: true } });
  const real = (r?.result as { id?: unknown } | null)?.id;
  return typeof real === "string" ? real : s;
}

/**
 * Id que mandó el aparato para algo nuevo (`newClientId`): así lo que se vio al
 * instante y lo guardado son lo mismo. Si no tiene la forma o ya existe, el de siempre.
 */
async function freshId(raw: unknown, exists: (id: string) => Promise<unknown>): Promise<string | undefined> {
  if (!isClientId(raw)) return undefined;
  return (await exists(raw)) ? undefined : raw;
}

/** Lugar de los bloques sin hora vecinos que se renumeraron al soltar uno (`placeAt`). */
async function applySortKeys(others: unknown) {
  if (!Array.isArray(others)) return;
  for (const p of others.slice(0, 200) as SortKeyPatch[]) {
    if (!Array.isArray(p) || !Number.isFinite(Number(p[1]))) continue;
    await prisma.planBlock.updateMany({ where: { id: await blockId(p[0]), startTime: null }, data: { sortKey: Number(p[1]) } });
  }
}

/** Un bloque nuevo sin hora va arriba de todo en su día, con lugar propio (si no, empata con los demás). */
async function newSortKey(date: Date): Promise<number> {
  const day = await prisma.planBlock.findMany({ where: { date }, select: { startTime: true, sortKey: true } });
  return topSortKey(day);
}

/**
 * La tarjeta es la misma semana a semana (se le cambia la fecha). Cuando deja una
 * semana que ya empezó, queda registro de cómo estaba ese día, así los números de
 * esa semana no se pierden; y si va a una semana posterior, llega sin tildar.
 * Devuelve el "hecho" con el que queda.
 */
async function changeWeek(b: { id: string; date: Date; title: string; categoryId: string | null; done: boolean }, to: Date) {
  const from = fromDbDate(b.date);
  const dest = fromDbDate(to);
  const destMonday = startOfWeek(dest);
  // Si vuelve a una semana donde dejó registro (cualquier día), el registro sobra:
  // la tarjeta está ahí (si no, contaría doble) y recupera el "hecho" que tenía.
  const logs = await prisma.planBlockLog.findMany({
    where: { blockId: b.id, date: { gte: toDbDate(destMonday), lte: toDbDate(addDays(destMonday, 6)) } },
    select: { id: true, done: true },
  });
  if (logs.length) await prisma.planBlockLog.deleteMany({ where: { id: { in: logs.map((l) => l.id) } } });
  if (startOfWeek(from) === destMonday) return b.done;
  if (from <= todayISO()) {
    await prisma.planBlockLog.create({ data: { blockId: b.id, date: b.date, title: b.title, categoryId: b.categoryId, done: b.done } });
  }
  if (logs.length) return logs.some((l) => l.done);
  return destMonday > startOfWeek(from) ? false : b.done;
}

export async function saveBlock(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await exigirSesion();
  const id = (await blockId(texto(fd, "id", 80))) || null;
  const title = texto(fd, "title", 120);
  if (!title) return { ok: false, error: "Ponele un nombre." };
  const date = fecha(fd, "date");
  if (!date) return { ok: false, error: "Elegí el día." };
  // Se escribe a mano en el celular ("930", "21"): se pasa a HH:MM.
  const start = normalizeTime(texto(fd, "startTime", 8)) ?? texto(fd, "startTime", 8);
  const end = normalizeTime(texto(fd, "endTime", 8)) ?? "";
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
  };

  if (id) {
    const before = await prisma.planBlock.findUnique({ where: { id } });
    if (!before) return { ok: false, error: "Ese bloque ya no existe." };
    const done = +before.date === +data.date ? before.done : await changeWeek(before, data.date);
    await prisma.planBlock.update({ where: { id }, data: { ...data, done } });
    if (data.taskId && data.taskId !== before.taskId) {
      await prisma.planTask.updateMany({ where: { id: data.taskId }, data: { scheduled: true } });
    }
    refrescar();
    return { ok: true, id };
  }
  const newId = await freshId(fd.get("clientId"), (x) => prisma.planBlock.findUnique({ where: { id: x }, select: { id: true } }));
  const created = await prisma.planBlock.create({ data: { ...data, ...(newId ? { id: newId } : {}), sortKey: startTime ? null : await newSortKey(data.date) } });
  await logActivity("created", "block", created.id, `${title} (${date})`);
  if (data.taskId) await prisma.planTask.update({ where: { id: data.taskId }, data: { scheduled: true } });
  refrescar();
  return { ok: true, id: created.id };
}

export async function setBlockDone(id: string, done: boolean) {
  await exigirSesion();
  const real = await blockId(id);
  await prisma.planBlock.updateMany({ where: { id: real }, data: { done: !!done } });
  // Gym: tildar su bloque marca el hábito (el único atado al Plan).
  await syncLinkedHabit(real, !!done);
  refrescar();
}

const cleanTitle = (t: unknown) => String(t ?? "").trim().replace(/\s+/g, " ").slice(0, 160);

/**
 * Arrastrar una tarea a un día de la semana: crea el bloque vinculado (nombre,
 * categoría y prioridad de la tarea) y la marca como agendada. Con hora, el
 * bloque dura una hora; sin hora queda para el día, en el lugar donde se soltó.
 */
export async function scheduleTask(taskId: string, date: string, startTime: string | null, sortKey?: number, others?: SortKeyPatch[], clientId?: string): Promise<ActionResult | undefined> {
  await exigirSesion();
  if (!isISODate(date)) return;
  const t = await prisma.planTask.findUnique({ where: { id: String(taskId) } });
  if (!t) return;
  const start = startTime && isTime(startTime) ? startTime : null;
  const mins = start ? Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5)) + 60 : 0;
  const end = start ? `${String(Math.min(23, Math.floor(mins / 60))).padStart(2, "0")}:${String(mins >= 24 * 60 ? 59 : mins % 60).padStart(2, "0")}` : null;
  const newId = await freshId(clientId, (x) => prisma.planBlock.findUnique({ where: { id: x }, select: { id: true } }));
  const block = await prisma.planBlock.create({
    data: {
      ...(newId ? { id: newId } : {}),
      title: t.title,
      categoryId: t.categoryId,
      priority: t.priority,
      taskId: t.id,
      date: toDbDate(date),
      startTime: start,
      endTime: end,
      sortKey: start ? null : sortKey !== undefined && Number.isFinite(sortKey) ? sortKey : await newSortKey(toDbDate(date)),
    },
  });
  if (!start) await applySortKeys(others);
  await prisma.planTask.update({ where: { id: t.id }, data: { scheduled: true } });
  await logActivity("created", "block", block.id, `${t.title} (${date})`);
  refrescar();
  return { ok: true, id: block.id };
}

/** Cambiar el nombre desde el menú de clic derecho. */
export async function renameBlock(id: string, title: string) {
  await exigirSesion();
  const t = cleanTitle(title);
  if (!t) return;
  await prisma.planBlock.updateMany({ where: { id: await blockId(id) }, data: { title: t } });
  refrescar();
}

/** Duplicar desde el menú de clic derecho: la copia queda el mismo día, justo después y sin tildar. */
export async function duplicateBlock(id: string, clientId?: string): Promise<ActionResult | undefined> {
  await exigirSesion();
  const b = await prisma.planBlock.findUnique({ where: { id: await blockId(id) } });
  if (!b) return;
  const newId = await freshId(clientId, (x) => prisma.planBlock.findUnique({ where: { id: x }, select: { id: true } }));
  const copy = await prisma.planBlock.create({
    data: {
      ...(newId ? { id: newId } : {}),
      title: b.title,
      categoryId: b.categoryId,
      date: b.date,
      startTime: b.startTime,
      endTime: b.endTime,
      // Un sin hora queda pegado debajo del original.
      sortKey: b.startTime ? null : (b.sortKey ?? -1) + 0.01,
      priority: b.priority,
      place: b.place,
      notes: b.notes,
      taskId: b.taskId,
    },
  });
  await logActivity("created", "block", copy.id, `${b.title} (copia)`);
  refrescar();
  return { ok: true, id: copy.id };
}

export async function deleteBlock(raw: string) {
  await exigirSesion();
  const id = await blockId(raw);
  const block = await prisma.planBlock.findUnique({ where: { id } });
  if (!block) return;
  await trashAndDelete("block", id);
  refrescar();
}

/** "Pasar a la semana que viene": la misma tarjeta, el mismo día de la semana, sin tildar. */
export async function passToNextWeek(raw: string): Promise<ActionResult> {
  await exigirSesion();
  const b = await prisma.planBlock.findUnique({ where: { id: await blockId(raw) } });
  if (!b) return { ok: false, error: "Ese bloque ya no existe." };
  const to = toDbDate(addDays(fromDbDate(b.date), 7));
  const done = await changeWeek(b, to);
  await prisma.planBlock.update({ where: { id: b.id }, data: { date: to, done } });
  refrescar();
  return { ok: true };
}

/**
 * "Pasar toda la semana": todas las tarjetas de la semana van a la siguiente (mismo
 * día, sin tildar). Después se ajusta la que cambie de día.
 */
export async function passWeek(day: string): Promise<ActionResult & { count?: number }> {
  await exigirSesion();
  if (!isISODate(day)) return { ok: false, error: "Fecha inválida." };
  const monday = startOfWeek(day);
  const blocks = await prisma.planBlock.findMany({
    where: { date: { gte: toDbDate(monday), lte: toDbDate(addDays(monday, 6)) } },
  });
  if (!blocks.length) return { ok: false, error: "Esta semana no tiene tarjetas para pasar." };
  for (const b of blocks) {
    const to = toDbDate(addDays(fromDbDate(b.date), 7));
    const done = await changeWeek(b, to);
    await prisma.planBlock.update({ where: { id: b.id }, data: { date: to, done } });
  }
  await logActivity("updated", "block", null, `${blocks.length} tarjetas pasadas a la semana del ${addDays(monday, 7)}`);
  refrescar();
  return { ok: true, count: blocks.length };
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
      // El lugar de los sin hora y la tarea vinculada también pasan a la copia.
      sortKey: b.sortKey,
      taskId: b.taskId,
      priority: b.priority,
      place: b.place,
      notes: b.notes,
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
    scheduled: fd.get("scheduled") === "on",
    notes: texto(fd, "notes", 4000) || null,
    links: parseTaskLinks(jsonOrEmpty(String(fd.get("links") ?? "[]"))),
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
    // Con pasos, el progreso no es el escrito a mano: lo dan los pasos.
    await syncStepsProgress(id, false);
    refrescar();
    return { ok: true, id };
  }
  // Pasos escritos al crear (uno por renglón).
  const steps = texto(fd, "subtasks", 4000)
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 50);
  // Las nuevas van arriba de todo (si no, con el orden a mano quedarían escondidas al final).
  const first = await prisma.planTask.aggregate({ _min: { order: true } });
  const newId = await freshId(fd.get("clientId"), (x) => prisma.planTask.findUnique({ where: { id: x }, select: { id: true } }));
  const created = await prisma.planTask.create({
    data: {
      ...data,
      ...(newId ? { id: newId } : {}),
      order: (first._min.order ?? 0) - 1,
      completedAt: status === "done" ? new Date() : null,
      subtasks: { create: steps.map((title, order) => ({ title: title.slice(0, 200), order })) },
    },
  });
  if (steps.length) await syncStepsProgress(created.id, false);
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

/**
 * Con pasos, el progreso de la tarea son los pasos (pedido de Facu): meta = cuántos
 * hay, progreso = cuántos están tildados. Si se saca el último paso, la tarea queda
 * sin progreso. Se llama después de todo lo que toca pasos.
 */
async function syncStepsProgress(taskId: string, hadSteps = true) {
  const [total, done] = await Promise.all([
    prisma.planSubtask.count({ where: { taskId } }),
    prisma.planSubtask.count({ where: { taskId, done: true } }),
  ]);
  if (total > 0) await prisma.planTask.updateMany({ where: { id: taskId }, data: { goal: total, progress: done } });
  else if (hadSteps) await prisma.planTask.updateMany({ where: { id: taskId }, data: { goal: null, progress: null } });
}

/** Ya no se usa desde la pantalla (el progreso son los pasos); queda para lo que siga en alguna cola sin conexión. */
export async function bumpTaskProgress(id: string, delta: 1 | -1) {
  await exigirSesion();
  const t = await prisma.planTask.findUnique({ where: { id }, select: { progress: true, goal: true, _count: { select: { subtasks: true } } } });
  if (!t || t._count.subtasks > 0) return;
  const next = Math.max(0, (t.progress ?? 0) + delta);
  await prisma.planTask.update({ where: { id }, data: { progress: t.goal ? Math.min(t.goal, next) : next } });
  refrescar();
}

/** Anchos de las columnas de la tabla de tareas, arrastrando el borde del encabezado. */
export async function saveTaskColumns(widths: TaskColumnWidths) {
  await exigirSesion();
  const value = JSON.stringify(parseTaskColumns(JSON.stringify(widths ?? {})));
  await prisma.appSetting.upsert({ where: { key: "tareas_columnas" }, create: { key: "tareas_columnas", value }, update: { value } });
}

/** Orden de las columnas de la tabla de tareas (arrastrando los encabezados). */
export async function saveTaskColumnOrder(order: string[]) {
  await exigirSesion();
  const value = JSON.stringify(parseTaskColumnOrder(Array.isArray(order) ? order : []));
  await prisma.appSetting.upsert({ where: { key: TASK_COLUMN_ORDER_KEY }, create: { key: TASK_COLUMN_ORDER_KEY, value }, update: { value } });
}

function jsonOrEmpty(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/** Casilla "Agendada" de la tabla de tareas. */
export async function setTaskScheduled(id: string, scheduled: boolean) {
  await exigirSesion();
  await prisma.planTask.updateMany({ where: { id: String(id) }, data: { scheduled: !!scheduled } });
  refrescar();
}

/** Cambia el deadline de una tarea desde la tabla, el tablero o la lista (null = sin fecha). */
export async function setTaskDeadline(id: string, deadline: string | null): Promise<ActionResult> {
  await exigirSesion();
  if (deadline !== null && !isISODate(deadline)) return { ok: false, error: "Fecha inválida." };
  const t = await prisma.planTask.findUnique({ where: { id: String(id) }, select: { title: true } });
  if (!t) return { ok: false, error: "La tarea ya no existe." };
  await prisma.planTask.update({ where: { id: String(id) }, data: { deadline: deadline ? toDbDate(deadline) : null } });
  await logActivity("updated", "task", String(id), `${t.title}: ${deadline ? `vence ${deadline}` : "sin fecha"}`);
  refrescar();
  return { ok: true };
}

/** Orden arrastrado: recibe todas las tareas en el orden nuevo. Desde ahí las vistas lo usan. */
export async function reorderTasks(ids: string[]) {
  await exigirSesion();
  if (!Array.isArray(ids)) return;
  const clean = ids.map(String).slice(0, 2000);
  await prisma.$transaction(clean.map((id, i) => prisma.planTask.updateMany({ where: { id }, data: { order: i } })));
  await prisma.appSetting.upsert({
    where: { key: "tareas_orden_manual" },
    create: { key: "tareas_orden_manual", value: "1" },
    update: { value: "1" },
  });
  refrescar();
}

export async function renameTask(id: string, title: string) {
  await exigirSesion();
  const t = cleanTitle(title);
  if (!t) return;
  await prisma.planTask.updateMany({ where: { id: String(id) }, data: { title: t } });
  refrescar();
}

/** Duplicar una tarea: misma configuración, pasos sin tildar, justo debajo de la original. */
export async function duplicateTask(id: string, clientId?: string) {
  await exigirSesion();
  const t = await prisma.planTask.findUnique({ where: { id: String(id) }, include: { subtasks: { orderBy: { order: "asc" } } } });
  if (!t) return;
  await prisma.planTask.updateMany({ where: { order: { gt: t.order } }, data: { order: { increment: 1 } } });
  const newId = await freshId(clientId, (x) => prisma.planTask.findUnique({ where: { id: x }, select: { id: true } }));
  const copy = await prisma.planTask.create({
    data: {
      ...(newId ? { id: newId } : {}),
      title: t.title,
      categoryId: t.categoryId,
      status: t.status === "done" ? "todo" : t.status,
      priority: t.priority,
      deadline: t.deadline,
      progress: t.goal ? 0 : t.progress,
      goal: t.goal,
      scheduled: false,
      notes: t.notes,
      links: parseTaskLinks(t.links),
      repeat: t.repeat,
      repeatEvery: t.repeatEvery,
      order: t.order + 1,
      subtasks: { create: t.subtasks.map((s) => ({ title: s.title, order: s.order })) },
    },
  });
  await logActivity("created", "task", copy.id, `${t.title} (copia)`);
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
 * duración). Es la misma tarjeta: no se crea otra.
 */
/** Mueve un bloque de día (y hora). `sortKey`: lugar en la columna de uno sin hora. */
/**
 * Cambiar día y horario de una vez (clic derecho → "Cambiar fecha y hora").
 * Sin "desde" queda para todo el día; un "hasta" que no es posterior se descarta.
 * Si cambia de semana, igual que arrastrar: llega sin tildar y deja el registro.
 */
export async function rescheduleBlock(id: string, date: string, startTime: string | null, endTime: string | null) {
  await exigirSesion();
  if (!isISODate(date)) return;
  const b = await prisma.planBlock.findUnique({ where: { id: await blockId(id) } });
  if (!b) return;
  const start = startTime && isTime(startTime) ? startTime : null;
  const end = start && endTime && isTime(endTime) && endTime > start ? endTime : null;
  const to = toDbDate(date);
  const done = +b.date === +to ? b.done : await changeWeek(b, to);
  await prisma.planBlock.update({ where: { id: b.id }, data: { date: to, startTime: start, endTime: end, done } });
  refrescar();
}

export async function moveBlock(raw: string, date: string, startTime?: string | null, sortKey?: number, others?: SortKeyPatch[]) {
  await exigirSesion();
  if (!isISODate(date)) return;
  const b = await prisma.planBlock.findUnique({ where: { id: await blockId(raw) } });
  if (!b) return;
  const id = b.id;
  let start = b.startTime;
  let end = b.endTime;
  if (startTime !== undefined && (startTime === null || isTime(startTime))) {
    if (startTime && b.startTime && b.endTime) {
      const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
      const dur = mins(b.endTime) - mins(b.startTime);
      const e = Math.min(23 * 60 + 59, mins(startTime) + dur);
      // Cerca de medianoche el fin se recorta; si no queda después del inicio, sin fin.
      end = e > mins(startTime) ? `${String(Math.floor(e / 60)).padStart(2, "0")}:${String(e % 60).padStart(2, "0")}` : null;
    } else if (!startTime) end = null;
    start = startTime;
  }
  const to = toDbDate(date);
  const done = +b.date === +to ? b.done : await changeWeek(b, to);
  const key = sortKey !== undefined && Number.isFinite(sortKey) && !start ? { sortKey } : {};
  await prisma.planBlock.update({ where: { id }, data: { date: to, startTime: start, endTime: end, done, ...key } });
  if (!start) await applySortKeys(others);
  refrescar();
}

// ─── Tareas que se repiten y pasos ──────────────────────────────────────────

const lastDayOf = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Corre una fecha; en las mensuales cae el día `day` (o el último del mes si no lo tiene). */
function shiftDate(iso: string, repeat: string, every: number, day?: number): string {
  if (repeat === "daily") return addDays(iso, every);
  if (repeat === "weekly") return addDays(iso, 7 * every);
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + every, 1));
  t.setUTCDate(Math.min(day ?? d, lastDayOf(t.getUTCFullYear(), t.getUTCMonth() + 1)));
  return t.toISOString().slice(0, 10);
}

/**
 * Día del mes original de cada tarea mensual que se repite (id → día), para que un
 * 31 que pasó por febrero (28) vuelva al 31 en marzo. Sin cambiar el esquema:
 * `AppSetting "tareas_dia_mensual"`; solo quedan las que siguen repitiéndose.
 */
const MONTH_DAY_KEY = "tareas_dia_mensual";
async function readMonthDays(): Promise<Record<string, number>> {
  const row = await prisma.appSetting.findUnique({ where: { key: MONTH_DAY_KEY } });
  try {
    const v = JSON.parse(row?.value ?? "{}") as Record<string, unknown>;
    return Object.fromEntries(Object.entries(v).filter(([, d]) => Number.isInteger(d) && (d as number) >= 1 && (d as number) <= 31)) as Record<string, number>;
  } catch {
    return {};
  }
}

/** Al terminar una tarea que se repite aparece la siguiente (con los pasos sin tildar). */
async function spawnNext(id: string) {
  const t = await prisma.planTask.findUnique({ where: { id }, include: { subtasks: { orderBy: { order: "asc" } } } });
  if (!t?.repeat) return;
  const today = todayISO();
  const base = t.deadline ? fromDbDate(t.deadline) : today;
  // Mensual: el día original de la serie (si la fecha no se cambió a mano), no el de
  // esta vuelta: un 31/1 va al 28/2 y después al 31/3, no se queda en 28.
  const monthDays = t.repeat === "monthly" ? await readMonthDays() : null;
  let day: number | undefined;
  if (monthDays) {
    const [y, m, d] = base.split("-").map(Number);
    const saved = monthDays[t.id];
    day = saved && Math.min(saved, lastDayOf(y, m)) === d ? saved : d;
  }
  // Si estaba vencida, la siguiente se corre hasta hoy o después (nunca nace vencida),
  // siempre contando desde la misma fecha (n vueltas de una).
  let n = 1;
  let next = shiftDate(base, t.repeat, t.repeatEvery, day);
  while (next < today && n < 1000) next = shiftDate(base, t.repeat, t.repeatEvery * ++n, day);
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
      links: parseTaskLinks(t.links),
      repeat: t.repeat,
      repeatEvery: t.repeatEvery,
      // Toma el lugar de la que se terminó.
      order: t.order,
      subtasks: { create: t.subtasks.map((s) => ({ title: s.title, order: s.order })) },
    },
  });
  // La que se terminó deja de repetirse (la posta la toma la nueva).
  await prisma.planTask.update({ where: { id }, data: { repeat: null } });
  if (monthDays && day) {
    delete monthDays[t.id];
    monthDays[created.id] = day;
    const value = JSON.stringify(monthDays);
    await prisma.appSetting.upsert({ where: { key: MONTH_DAY_KEY }, create: { key: MONTH_DAY_KEY, value }, update: { value } });
  }
  await logActivity("created", "task", created.id, `${t.title} (se repite, para el ${next})`);
}

/** Agrega un paso y devuelve su id (la hoja lo usa para tildarlo o sacarlo enseguida). */
export async function addSubtask(taskId: string, title: string): Promise<{ id: string } | undefined> {
  await exigirSesion();
  const tt = title.trim().slice(0, 200);
  if (!tt) return;
  const max = await prisma.planSubtask.aggregate({ where: { taskId }, _max: { order: true } });
  const created = await prisma.planSubtask.create({ data: { taskId, title: tt, order: (max._max.order ?? -1) + 1 }, select: { id: true } });
  await syncStepsProgress(taskId);
  refrescar();
  return { id: created.id };
}

export async function toggleSubtask(id: string, done: boolean) {
  await exigirSesion();
  const s = await prisma.planSubtask.update({ where: { id }, data: { done }, select: { taskId: true } });
  await syncStepsProgress(s.taskId);
  refrescar();
}

export async function deleteSubtask(id: string) {
  await exigirSesion();
  const s = await prisma.planSubtask.findUnique({ where: { id }, select: { taskId: true } });
  await prisma.planSubtask.deleteMany({ where: { id } });
  if (s) await syncStepsProgress(s.taskId);
  refrescar();
}

/** "habit:id" → { linkType, linkId }; vacío o raro → sin vínculo. */
function linkOf(raw: string): { linkType: string | null; linkId: string | null } {
  const m = raw.match(/^(habit|account|goal):([a-z0-9]{10,40})$/i);
  return m ? { linkType: m[1], linkId: m[2] } : { linkType: null, linkId: null };
}

// ─── Objetivos por año ──────────────────────────────────────────────────────

/** Crea o edita un objetivo (nombre, rol, categoría, prioridad, deadline, estado y meta propia). */
export async function saveObjective(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await exigirSesion();
  const id = texto(fd, "id", 40) || null;
  const title = texto(fd, "title", 120);
  if (!title) return { ok: false, error: "Ponele un nombre." };
  const year = entero(fd, "year", 2000, 2100) ?? Number(todayISO().slice(0, 4));
  const statusRaw = texto(fd, "status") as KrStatus;
  const deadline = fecha(fd, "deadline");
  const goal = decimal(fd, "goal");
  // Solo los campos que vienen en el formulario (renombrar desde otro lado no borra el resto).
  const extra = fd.has("role")
    ? {
        role: texto(fd, "role", 60) || null,
        area: texto(fd, "area", 60) || null,
        priority: entero(fd, "priority", 0, 4) ?? 0,
        deadline: deadline ? toDbDate(deadline) : null,
        status: KR_STATUSES.includes(statusRaw) ? statusRaw : "doing",
        goal,
        progress: goal ? (decimal(fd, "progress") ?? 0) : null,
      }
    : {};
  try {
    if (id) {
      await prisma.planObjective.update({ where: { id }, data: { title, ...extra } });
      await logActivity("updated", "objective", id, title);
    } else {
      const o = await prisma.planObjective.create({ data: { title, year, ...extra, order: await prisma.planObjective.count({ where: { year } }) } });
      await logActivity("created", "objective", o.id, `${title} (${year})`);
    }
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return { ok: false, error: "Ya hay un objetivo con ese nombre en ese año." };
    throw e;
  }
  refrescar();
  return { ok: true };
}

/** −1 / +1 a la meta propia de un objetivo ("1 de 4"). */
export async function bumpObjective(id: string, delta: 1 | -1) {
  await exigirSesion();
  const o = await prisma.planObjective.findUnique({ where: { id }, select: { progress: true, goal: true, status: true } });
  if (!o?.goal) return;
  const progress = Math.max(0, Math.min(o.goal, (o.progress ?? 0) + (delta > 0 ? 1 : -1)));
  // Llegar a la meta lo termina; bajar de la meta lo vuelve a "en curso".
  const status = progress >= o.goal ? "done" : o.status === "done" ? "doing" : o.status;
  await prisma.planObjective.update({ where: { id }, data: { progress, status } });
  refrescar();
}

/**
 * "Llevar al Qn": copia los resultados clave elegidos al trimestre siguiente, sin
 * empezar y con el progreso en 0 (como en Notion, cada trimestre es su propia fila).
 * El del trimestre que terminó queda como está. Del Q4 pasa al Q1 del año que sigue
 * (con su objetivo, que se copia si hace falta). Correrlo dos veces no duplica.
 */
export async function carryOverKrs(input: { krIds: string[]; year: number; quarter: string }): Promise<ActionResult & { count?: number }> {
  await exigirSesion();
  const quarter = QUARTERS.find((q) => q === input?.quarter);
  const year = Math.round(Number(input?.year));
  if (!quarter || !Number.isInteger(year) || year < 2000 || year > 2100) return { ok: false, error: "Trimestre inválido." };
  const ids = (Array.isArray(input.krIds) ? input.krIds : []).map(String).slice(0, 200);
  const krs = await prisma.planKeyResult.findMany({ where: { id: { in: ids } }, include: { objective: true }, orderBy: { createdAt: "asc" } });
  // Deadline: el último día del trimestre nuevo.
  const end = quarterRange(year, quarter).to;
  let count = 0;
  for (const k of krs) {
    let objectiveId = k.objectiveId;
    if (k.objective && k.objective.year !== year) {
      const o = k.objective;
      const copy = await prisma.planObjective.upsert({
        where: { title_year: { title: o.title, year } },
        create: { title: o.title, year, role: o.role, area: o.area, priority: o.priority, goal: o.goal, progress: o.goal ? 0 : null, order: o.order },
        update: {},
      });
      objectiveId = copy.id;
    }
    const exists = await prisma.planKeyResult.findFirst({
      where: { title: k.title, objectiveId, year, quarters: { has: quarter } },
      select: { id: true },
    });
    if (exists) continue;
    await prisma.planKeyResult.create({
      data: {
        title: k.title,
        objectiveId,
        kind: k.kind,
        status: "todo",
        quarters: [quarter],
        deadline: toDbDate(end),
        progress: k.goal !== null ? 0 : null,
        goal: k.goal,
        linkType: k.linkType,
        linkId: k.linkId,
        year,
      },
    });
    count++;
  }
  if (count) await logActivity("created", "keyResult", null, `${count} resultados clave llevados al ${quarter} ${year}`);
  refrescar();
  return { ok: true, count };
}

/** "Ya lo revisé": la tarjeta de revisión de ese trimestre no vuelve a aparecer. */
export async function dismissQuarterReview(key: string) {
  await exigirSesion();
  if (!/^\d{4}-Q[1-4]$/.test(key)) return;
  await prisma.appSetting.upsert({ where: { key: REVIEW_DISMISSED_KEY }, create: { key: REVIEW_DISMISSED_KEY, value: key }, update: { value: key } });
  refrescar();
}

/**
 * Abre la reflexión del trimestre (entrada con la etiqueta `revision-trimestral`
 * y el trimestre en el título) o la crea con las preguntas.
 */
export async function writeQuarterReview(year: number, quarter: string, unfinished: number) {
  await exigirSesion();
  const q = QUARTERS.find((x) => x === quarter);
  if (!q || !Number.isInteger(year) || year < 2000 || year > 2100) throw new Error("Trimestre inválido");
  const title = `Revisión del ${q} ${year}`;
  const existing = await prisma.journalEntry.findFirst({
    where: { tags: { has: QUARTER_REVIEW_TAG }, title },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (existing) redirect(`/journal/${existing.id}`);
  const next = nextQuarter(year, q).quarter;
  const created = await prisma.journalEntry.create({
    data: { date: toDbDate(todayISO()), title, body: quarterReviewTemplate(Math.max(0, Math.round(Number(unfinished) || 0)), next), tags: [QUARTER_REVIEW_TAG] },
    select: { id: true },
  });
  await logActivity("created", "journal", created.id, title);
  revalidatePath("/journal", "layout");
  redirect(`/journal/${created.id}`);
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
  let copied = 0;
  for (const k of krs) {
    const objectiveId = k.objectiveId ? (newId.get(k.objectiveId) ?? null) : null;
    // Correrlo dos veces no duplica: mismo nombre, mismo objetivo y mismo año ya está.
    const exists = await prisma.planKeyResult.findFirst({ where: { title: k.title, objectiveId, year: to }, select: { id: true } });
    if (exists) continue;
    copied++;
    await prisma.planKeyResult.create({
      data: {
        title: k.title,
        objectiveId,
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
  await logActivity("created", "objective", null, `Plan ${to}: ${objs.length} objetivos y ${copied} resultados clave copiados`);
  refrescar();
  return { ok: true };
}
