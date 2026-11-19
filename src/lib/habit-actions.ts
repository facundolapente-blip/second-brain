"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { exigirSesion } from "./session";
import { logActivity, trashAndDelete } from "./trash";
import { addDays, isISODate, todayISO, toDbDate } from "./dates";
import { isPaletteKey } from "./palette";
import type { LogStatus } from "./habit-logic";
import { HABIT_CONFIG_LOCKED } from "./importers/habitnow";
import { syncLinkedBlocks } from "./plan-habit-link";
import {
  advance,
  cleanStep,
  LADDER_GOAL_MAX,
  LADDER_MAX_STEPS,
  LADDER_TITLE_MAX,
  parseLadder,
  parseReplan,
  replanSteps,
  snoozeWeek,
  stepBack,
  stepConfig,
  type Ladder,
  type LadderStep,
} from "./habit-ladder";
import {
  newPartId,
  newPartLadder,
  PART_NAME_MAX,
  PART_UNIT_MAX,
  partPlanError,
  partsMark,
  parseParts,
  parsePartsDay,
  PARTS_MAX,
  replanPart,
  orderParts,
  type HabitPart,
  type PartMoment,
  type PartPlan,
} from "./habit-parts";

export type ActionResult = { ok: true; id?: string } | { ok: false, error: string };

function refrescar() {
  revalidatePath("/habitos", "layout");
  revalidatePath("/");
}

const STATUSES: LogStatus[] = ["done", "failed", "skipped"];

/**
 * Marca un día. `status` null borra la marca. En hábitos de cantidad `value` es
 * lo hecho ese día; en los de sí/no queda en 1. `note` undefined deja la nota
 * como estaba; un día sin marca pero con nota queda con status "none".
 *
 * En un hábito por partes, `parts` = los ids de las partes hechas ese día (con
 * `status` null o "done"): la marca sale de ahí (`partsMark`: todas = hecho, algunas =
 * a medias). Salteado o fallado borran el detalle de las partes.
 */
export async function setHabitLog(
  habitId: string,
  date: string,
  status: LogStatus | null,
  value = 1,
  note?: string | null,
  parts?: string[] | null,
) {
  await exigirSesion();
  if (!isISODate(date)) throw new Error("Fecha inválida");
  if (status !== null && !STATUSES.includes(status)) throw new Error("Estado inválido");

  const key = { habitId, date: toDbDate(date) };
  const habit = await prisma.habit.findUnique({ where: { id: habitId }, select: { target: true, parts: true } });
  const habitParts = parseParts(habit?.parts);
  let partsDay: { done: string[]; of: number } | null = null;
  let partsHalf = false;
  if (habitParts && status !== "failed" && status !== "skipped") {
    // Sin el detalle (un "hecho" que llegó de otro lado): todas o ninguna.
    const ids = habitParts.map((p) => p.id);
    const doneIds = Array.isArray(parts) ? parts.filter((x) => typeof x === "string") : status === "done" ? ids : [];
    const m = partsMark(ids, doneIds);
    partsDay = m.parts;
    partsHalf = m.status === "none";
    status = m.status === "done" ? "done" : null;
    value = m.value;
  }
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
  if (partsHalf) {
    // A medias: algunas partes hechas.
    s = "none";
  } else if (s === null) {
    if (!finalNote) {
      await prisma.habitLog.deleteMany({ where: key });
      await syncLinkedBlocks(habitId, key.date, false);
      refrescar();
      return;
    }
    s = "none";
    v = 0;
  }
  const partsJson = partsDay ? (partsDay as unknown as Prisma.InputJsonValue) : Prisma.DbNull;
  await prisma.habitLog.upsert({
    where: { habitId_date: key },
    create: { ...key, status: s, value: v, note: finalNote, source: "app", parts: partsJson },
    update: { status: s, value: v, note: finalNote, source: "app", parts: partsJson },
  });
  // Gym: marcar el hábito tilda su bloque del Plan ese día (y sacarle el hecho lo destilda).
  await syncLinkedBlocks(habitId, key.date, s === "done" && v >= Math.max(1, habit?.target ?? 1));
  refrescar();
}

/** Hábitos cuya frecuencia se configuró en la app (HabitNow no la pisa). */
async function lockHabitConfig(id: string) {
  const row = await prisma.appSetting.findUnique({ where: { key: HABIT_CONFIG_LOCKED } });
  let ids: string[] = [];
  try {
    ids = JSON.parse(row?.value ?? "[]");
  } catch {
    ids = [];
  }
  if (ids.includes(id)) return;
  const value = JSON.stringify([...ids, id]);
  await prisma.appSetting.upsert({ where: { key: HABIT_CONFIG_LOCKED }, create: { key: HABIT_CONFIG_LOCKED, value }, update: { value } });
}

function texto(fd: FormData, key: string, max = 200): string {
  return String(fd.get(key) ?? "").trim().slice(0, max);
}

function entero(fd: FormData, key: string, min: number, max: number, def: number): number {
  // Un campo que no vino no es 0 (Number(null) daba 0): queda el valor por defecto.
  const raw = fd.get(key);
  if (raw === null || raw === "") return def;
  const n = Number(raw);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.round(n)));
}

/** Lo que define qué días tocan y cuándo uno está hecho: si cambia, el historial se lee distinto. */
type RuleFields = { frequency: string; weekdays: number[]; timesPerWeek: number; weekStart: number; target: number };

function ruleChanged(a: RuleFields, b: RuleFields): boolean {
  return (
    a.frequency !== b.frequency ||
    a.target !== b.target ||
    (b.frequency === "weekdays" && a.weekdays.join() !== b.weekdays.join()) ||
    (b.frequency === "weekly" && (a.timesPerWeek !== b.timesPerWeek || a.weekStart !== b.weekStart))
  );
}

/** La escalera que manda el formulario (JSON { goal, steps }), desde el escalón 0. */
function ladderFromForm(fd: FormData, stepStart: string): { ok: true; ladder: Ladder | null } | { ok: false; error: string } {
  const raw = texto(fd, "ladder", 20_000);
  if (!raw) return { ok: true, ladder: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "No se pudo leer la escalera." };
  }
  const p = (parsed && typeof parsed === "object" ? parsed : {}) as { goal?: unknown; steps?: unknown };
  const checked = checkSteps(p.steps);
  if (!checked.ok) return checked;
  const goal = typeof p.goal === "string" ? p.goal.trim().slice(0, LADDER_GOAL_MAX) : "";
  return {
    ok: true,
    ladder: {
      goal: goal || checked.steps[checked.steps.length - 1].title,
      steps: checked.steps,
      current: 0,
      stepStart,
      snoozeUntil: null,
      history: [],
    },
  };
}


/**
 * Crea o edita un hábito. Al editar, si cambia cuándo toca o la meta y el form
 * manda `desde = "hoy"`, la configuración vieja queda como pista cerrada hasta
 * ayer y la nueva arranca hoy (el historial se sigue leyendo como estaba); con
 * `desde = "siempre"` (o sin el campo) se aplica también al historial.
 */
export async function saveHabit(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await exigirSesion();
  const id = texto(fd, "id", 40) || null;
  const name = texto(fd, "name", 80);
  if (!name) return { ok: false, error: "Ponele un nombre." };
  const before = id ? await prisma.habit.findUnique({ where: { id } }) : null;
  if (id && !before) return { ok: false, error: "No existe ese hábito." };

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
  // Por partes: la lista viene como JSON (se valida acá, antes de escribir nada).
  const partsIn = kind === "parts" ? partsFromForm(texto(fd, "parts", 40_000), parseParts(before?.parts), todayISO()) : null;
  if (partsIn && !partsIn.ok) return partsIn;
  const newParts = partsIn?.ok ? partsIn.parts : null;
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
    // Si el campo no vino, queda lo que tenía el hábito (antes pasaba a 0 = domingo).
    timesPerWeek: entero(fd, "timesPerWeek", 1, 7, before?.timesPerWeek ?? 1),
    weekStart: entero(fd, "weekStart", 0, 1, before?.weekStart ?? 1),
    target,
    unit,
    priority: entero(fd, "priority", 1, 5, 1),
    isQuit: fd.get("isQuit") === "on",
    startDate: toDbDate(startDate),
    parts: newParts ? (newParts as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
  };

  if (id && before) {
    const today = todayISO();
    // Si ya está en construcción: cambiar el plan o sacarla, desde el mismo formulario.
    // Se valida antes de escribir nada.
    const ladderBefore = parseLadder(before.ladder);
    const endLadderNow = !!ladderBefore && fd.get("ladderEnd") === "1";
    const replan = ladderBefore && !endLadderNow ? parseReplan(texto(fd, "ladderPlan", 200), ladderBefore) : null;
    if (replan && !replan.ok) return replan;
    // Al editar, la escalera se cambia con sus acciones; "Nunca dos seguidos" sí viene del formulario.
    const nt = fd.get("neverTwice");
    if (nt === "1" || nt === "0") await prisma.habit.update({ where: { id }, data: { neverTwice: nt === "1" } });
    const newTrack = texto(fd, "desde") === "hoy" && ruleChanged(before, data) && toDbDate(today) > before.startDate;
    if (newTrack) data.startDate = toDbDate(today);
    // La pista actual no puede arrancar antes de que termine la anterior.
    const last = await prisma.habitTrack.findFirst({ where: { habitId: id }, orderBy: { endDate: "desc" } });
    if (!newTrack && last && data.startDate <= last.endDate) {
      return { ok: false, error: "La fecha de inicio tiene que ser posterior a la pista anterior." };
    }
    if (newTrack) {
      // Como "Empezar pista nueva": la configuración de antes queda cerrada hasta ayer.
      await prisma.$transaction([
        prisma.habitTrack.create({
          data: {
            habitId: id,
            startDate: before.startDate,
            endDate: toDbDate(addDays(today, -1)),
            frequency: before.frequency,
            weekdays: before.weekdays,
            timesPerWeek: before.timesPerWeek,
            weekStart: before.weekStart,
            target: before.target,
          },
        }),
        prisma.habit.update({ where: { id }, data }),
      ]);
    } else {
      await prisma.habit.update({ where: { id }, data });
    }
    // Si se cambió cuándo toca, la configuración pasa a ser de la app: los backups
    // de HabitNow ya no la pisan (las marcas sí se siguen importando).
    if (
      before.frequency !== data.frequency ||
      before.weekdays.join() !== data.weekdays.join() ||
      before.timesPerWeek !== data.timesPerWeek ||
      before.weekStart !== data.weekStart ||
      before.target !== data.target
    ) {
      await lockHabitConfig(id);
    }
    // Partes que cambiaron: el día de hoy (si ya estaba marcado) se vuelve a leer con
    // las partes nuevas; los anteriores quedan como estaban (guardan cuántas había).
    const partsBefore = parseParts(before.parts);
    if (JSON.stringify(partsBefore) !== JSON.stringify(newParts)) {
      await refreshPartsDay(id, today, newParts);
      // Por partes es de la app: la importación de HabitNow no le pisa la configuración.
      if (newParts) await lockHabitConfig(id);
      await logActivity("updated", "habit", id, `${name}: partes cambiadas`);
    }
    if (endLadderNow) {
      // Como endLadder: queda como hábito común con la configuración de ahora.
      await prisma.habit.update({ where: { id }, data: { ladder: Prisma.DbNull } });
      await logActivity("updated", "habit", id, `${name}: terminó la construcción`);
    } else if (ladderBefore && replan?.ok && replan.plan) {
      // Lo ya subido y el paso actual no cambian (replanSteps).
      const fresh = await prisma.habit.findUnique({ where: { id } });
      if (fresh) {
        await writeLadder(fresh, { ...ladderBefore, steps: replanSteps(ladderBefore, replan.plan.to, replan.plan.weeks) });
        await logActivity("updated", "habit", id, `${fresh.name}: plan cambiado`);
      }
    }
    // Pasar a "en construcción" un hábito que ya existe (desde el mismo formulario).
    if (!ladderBefore) {
      const fromForm = ladderFromForm(fd, today);
      if (!fromForm.ok) return fromForm;
      if (fromForm.ladder) {
        const fresh = await prisma.habit.findUnique({ where: { id } });
        if (fresh) {
          await writeLadder(fresh, fromForm.ladder, { neverTwice: nt === "1" });
          await logActivity("updated", "habit", id, `${fresh.name}: en construcción`);
        }
      }
    }
    refrescar();
    return { ok: true, id };
  }
  // Crear un hábito ya "en construcción": la escalera viene como JSON ({ goal, steps }).
  const fromForm = ladderFromForm(fd, startDate);
  if (!fromForm.ok) return fromForm;
  const ladder = fromForm.ladder;
  if (ladder) {
    // Arranca con lo que pide el primer escalón (días por semana y, si es de cantidad, la meta).
    Object.assign(data, stepConfig(ladder.steps[0], data) ?? {});
  }
  const last = await prisma.habit.aggregate({ _max: { order: true } });
  const created = await prisma.habit.create({
    data: {
      ...data,
      order: (last._max.order ?? 0) + 1,
      ...(ladder ? { ladder: ladder as unknown as Prisma.InputJsonValue } : {}),
      // Sin el campo, un hábito en construcción arranca con "Nunca dos seguidos".
      neverTwice: fd.get("neverTwice") === "1" || (ladder !== null && fd.get("neverTwice") === null),
    },
  });
  if (ladder || newParts) {
    // La configuración es de la app: la importación de HabitNow no la pisa.
    await lockHabitConfig(created.id);
    if (ladder) await logActivity("created", "habit", created.id, `${created.name} (en construcción)`);
  }
  refrescar();
  return { ok: true, id: created.id };
}

/**
 * Empieza una pista nueva desde `date`: la actual se guarda como pista cerrada
 * (con su configuración) y la tarjeta, la racha y el puntaje arrancan de cero.
 * El historial no se borra: se ve en "Todas las pistas".
 */
export async function startNewTrack(habitId: string, date: string): Promise<ActionResult> {
  await exigirSesion();
  if (!isISODate(date)) return { ok: false, error: "Fecha inválida." };
  const habit = await prisma.habit.findUnique({ where: { id: habitId } });
  if (!habit) return { ok: false, error: "No existe ese hábito." };
  const start = toDbDate(date);
  if (start <= habit.startDate) {
    return { ok: false, error: "La pista nueva tiene que empezar después del inicio de la actual." };
  }
  const end = new Date(start.getTime() - 86_400_000);
  await prisma.$transaction([
    prisma.habitTrack.create({
      data: {
        habitId,
        startDate: habit.startDate,
        endDate: end,
        frequency: habit.frequency,
        weekdays: habit.weekdays,
        timesPerWeek: habit.timesPerWeek,
        weekStart: habit.weekStart,
        target: habit.target,
      },
    }),
    prisma.habit.update({ where: { id: habitId }, data: { startDate: start } }),
  ]);
  refrescar();
  return { ok: true };
}

/** Deshace la última pista nueva: la pista cerrada más reciente vuelve a ser parte de la actual. */
export async function mergeLastTrack(habitId: string): Promise<ActionResult> {
  await exigirSesion();
  const last = await prisma.habitTrack.findFirst({ where: { habitId }, orderBy: { endDate: "desc" } });
  if (!last) return { ok: false, error: "No hay pistas anteriores." };
  await prisma.$transaction([
    prisma.habit.update({ where: { id: habitId }, data: { startDate: last.startDate } }),
    prisma.habitTrack.delete({ where: { id: last.id } }),
  ]);
  refrescar();
  return { ok: true };
}

export async function archiveHabit(id: string, archived: boolean) {
  await exigirSesion();
  const h = await prisma.habit.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
  await logActivity(archived ? "updated" : "restored", "habit", id, `${h.name} ${archived ? "archivado" : "desarchivado"}`);
  refrescar();
}

export async function deleteHabit(id: string) {
  await exigirSesion();
  await trashAndDelete("habit", id);
  refrescar();
}

/** Reordena la lista: recibe los ids en el orden nuevo. */
export async function reorderHabits(ids: string[]) {
  await exigirSesion();
  await prisma.$transaction(ids.map((id, i) => prisma.habit.update({ where: { id }, data: { order: i } })));
  // Desde que se ordena a mano, la lista respeta ese orden (no el de prioridad).
  await prisma.appSetting.upsert({
    where: { key: "habitos_orden_manual" },
    create: { key: "habitos_orden_manual", value: "1" },
    update: { value: "1" },
  });
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
  await trashAndDelete("habitCategory", id);
  refrescar();
}

// ─── Hábitos en construcción ────────────────────────────────────────────────

export type LadderResult = { ok: true } | { ok: false; error: string };

/** Valida los escalones que mandó la pantalla: 1 a 8, títulos de hasta 80, need ≤ window ≤ 30. */
function checkSteps(raw: unknown): { ok: true; steps: LadderStep[] } | { ok: false; error: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error: "Poné al menos un paso." };
  if (raw.length > LADDER_MAX_STEPS) return { ok: false, error: `Como mucho ${LADDER_MAX_STEPS} pasos.` };
  const steps: LadderStep[] = [];
  for (const [i, r] of raw.entries()) {
    const title = r && typeof r === "object" && typeof (r as { title?: unknown }).title === "string" ? (r as { title: string }).title.trim() : "";
    if (!title) return { ok: false, error: `Ponele un nombre al paso ${i + 1}.` };
    if (title.length > LADDER_TITLE_MAX) return { ok: false, error: `El paso ${i + 1} es muy largo (hasta ${LADDER_TITLE_MAX} letras).` };
    const step = cleanStep(r);
    if (!step) return { ok: false, error: `Revisá el paso ${i + 1}: días por semana de 1 a 7 y semanas seguidas de 1 a 8.` };
    steps.push(step);
  }
  return { ok: true, steps };
}


type HabitRow = NonNullable<Awaited<ReturnType<typeof prisma.habit.findUnique>>>;

/**
 * Guarda la escalera y, si el escalón actual tiene meta numérica y el hábito es de
 * cantidad, cambia `Habit.target` como "pista nueva desde hoy" de `saveHabit`: la
 * configuración vieja queda cerrada hasta ayer, así las estadísticas siguen justas.
 */
async function writeLadder(habit: HabitRow, ladder: Ladder | null, extra: { neverTwice?: boolean } = {}) {
  const today = todayISO();
  const step = ladder?.steps[ladder.current];
  const config = step ? stepConfig(step, habit) : null;
  const data: Prisma.HabitUpdateInput = {
    ladder: ladder ? (ladder as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
    ...extra,
  };
  if (!config) {
    await prisma.habit.update({ where: { id: habit.id }, data });
    return;
  }
  const todayDb = toDbDate(today);
  if (todayDb > habit.startDate) {
    await prisma.$transaction([
      prisma.habitTrack.create({
        data: {
          habitId: habit.id,
          startDate: habit.startDate,
          endDate: toDbDate(addDays(today, -1)),
          frequency: habit.frequency,
          weekdays: habit.weekdays,
          timesPerWeek: habit.timesPerWeek,
          weekStart: habit.weekStart,
          target: habit.target,
        },
      }),
      prisma.habit.update({ where: { id: habit.id }, data: { ...data, ...config, startDate: todayDb } }),
    ]);
  } else {
    await prisma.habit.update({ where: { id: habit.id }, data: { ...data, ...config } });
  }
  await lockHabitConfig(habit.id);
}

async function loadLadder(habitId: string): Promise<{ habit: HabitRow; ladder: Ladder | null } | { error: string }> {
  const habit = await prisma.habit.findUnique({ where: { id: habitId } });
  if (!habit) return { error: "No existe ese hábito." };
  return { habit, ladder: parseLadder(habit.ladder) };
}

/** Pone un hábito "en construcción": escalones, escalón 0 desde hoy y "Nunca dos seguidos". */
export async function startLadder(
  habitId: string,
  input: { goal: string; steps: LadderStep[]; neverTwice: boolean },
): Promise<LadderResult> {
  await exigirSesion();
  const r = await loadLadder(habitId);
  if ("error" in r) return { ok: false, error: r.error };
  const checked = checkSteps(input?.steps);
  if (!checked.ok) return checked;
  const goal = typeof input.goal === "string" ? input.goal.trim().slice(0, LADDER_GOAL_MAX) : "";
  const ladder: Ladder = {
    goal: goal || checked.steps[checked.steps.length - 1].title,
    steps: checked.steps,
    current: 0,
    stepStart: todayISO(),
    snoozeUntil: null,
    history: [],
  };
  await writeLadder(r.habit, ladder, { neverTwice: !!input.neverTwice });
  await logActivity("updated", "habit", habitId, `${r.habit.name}: en construcción`);
  refrescar();
  return { ok: true };
}

async function moveLadder(habitId: string, fn: (l: Ladder, today: string) => Ladder, label: (l: Ladder) => string): Promise<LadderResult> {
  await exigirSesion();
  const r = await loadLadder(habitId);
  if ("error" in r) return { ok: false, error: r.error };
  if (!r.ladder) return { ok: false, error: "Ese hábito no está en construcción." };
  const next = fn(r.ladder, todayISO());
  if (next === r.ladder) return { ok: true };
  await writeLadder(r.habit, next);
  await logActivity("updated", "habit", habitId, `${r.habit.name}: ${label(next)}`);
  refrescar();
  return { ok: true };
}

/** Sube al escalón siguiente (no pasa de la meta). */
export async function advanceLadder(habitId: string): Promise<LadderResult> {
  return moveLadder(habitId, advance, (l) => `subió a "${l.steps[l.current].title}"`);
}

/** Baja al escalón anterior. */
export async function stepBackLadder(habitId: string): Promise<LadderResult> {
  return moveLadder(habitId, stepBack, (l) => `volvió a "${l.steps[l.current].title}"`);
}

/** "Me quedo una semana más": no ofrece subir por 7 días. */
export async function stayLadder(habitId: string): Promise<LadderResult> {
  await exigirSesion();
  const r = await loadLadder(habitId);
  if ("error" in r) return { ok: false, error: r.error };
  if (!r.ladder) return { ok: false, error: "Ese hábito no está en construcción." };
  await prisma.habit.update({ where: { id: habitId }, data: { ladder: snoozeWeek(r.ladder, todayISO()) as unknown as Prisma.InputJsonValue } });
  refrescar();
  return { ok: true };
}

/** Cambia los escalones; el actual se mantiene si sigue existiendo (si no, pasa al último). */
export async function saveLadderSteps(habitId: string, steps: LadderStep[]): Promise<LadderResult> {
  await exigirSesion();
  const r = await loadLadder(habitId);
  if ("error" in r) return { ok: false, error: r.error };
  if (!r.ladder) return { ok: false, error: "Ese hábito no está en construcción." };
  const checked = checkSteps(steps);
  if (!checked.ok) return checked;
  const current = Math.min(r.ladder.current, checked.steps.length - 1);
  const stepStart = current === r.ladder.current ? r.ladder.stepStart : todayISO();
  await writeLadder(r.habit, { ...r.ladder, steps: checked.steps, current, stepStart });
  await logActivity("updated", "habit", habitId, `${r.habit.name}: plan cambiado`);
  refrescar();
  return { ok: true };
}

/** Deja de estar en construcción: queda como hábito normal con su configuración de ahora (mantiene "Nunca dos seguidos"). */
export async function endLadder(habitId: string): Promise<LadderResult> {
  await exigirSesion();
  const habit = await prisma.habit.findUnique({ where: { id: habitId }, select: { name: true } });
  if (!habit) return { ok: false, error: "No existe ese hábito." };
  await prisma.habit.update({ where: { id: habitId }, data: { ladder: Prisma.DbNull } });
  await logActivity("updated", "habit", habitId, `${habit.name}: terminó la construcción`);
  refrescar();
  return { ok: true };
}

/** Prende o apaga "Nunca dos seguidos" en cualquier hábito. */
export async function setNeverTwice(habitId: string, on: boolean): Promise<LadderResult> {
  await exigirSesion();
  const res = await prisma.habit.updateMany({ where: { id: habitId }, data: { neverTwice: !!on } });
  if (!res.count) return { ok: false, error: "No existe ese hábito." };
  refrescar();
  return { ok: true };
}

// ─── Hábitos por partes ─────────────────────────────────────────────────────

type PartInput = { id?: unknown; name?: unknown; moment?: unknown; build?: unknown };

/**
 * Las partes que manda el formulario (JSON: `[{ id?, name, moment, build: null |
 * { from, to, by, unit, weeks } }]`), validadas. Una parte que ya existía conserva su
 * id, desde cuándo existe y lo avanzado de su escalera (`replanPart`).
 */
function partsFromForm(raw: string, before: HabitPart[] | null, today: string): { ok: true; parts: HabitPart[] } | { ok: false; error: string } {
  let v: unknown;
  try {
    v = JSON.parse(raw || "[]");
  } catch {
    return { ok: false, error: "No se pudieron leer las partes." };
  }
  if (!Array.isArray(v) || v.length === 0) return { ok: false, error: "Agregá al menos una parte." };
  if (v.length > PARTS_MAX) return { ok: false, error: `Como mucho ${PARTS_MAX} partes.` };
  const old = new Map((before ?? []).map((p) => [p.id, p]));
  const used = new Set<string>();
  const out: HabitPart[] = [];
  for (const [i, x] of (v as PartInput[]).entries()) {
    const name = typeof x?.name === "string" ? x.name.trim() : "";
    if (!name) return { ok: false, error: `Ponele un nombre a la parte ${i + 1}.` };
    if (name.length > PART_NAME_MAX) return { ok: false, error: `La parte ${i + 1} es muy larga (hasta ${PART_NAME_MAX} letras).` };
    const moment: PartMoment = x.moment === "night" ? "night" : "morning";
    const prev = typeof x.id === "string" ? old.get(x.id) : undefined;
    let id = prev?.id ?? newPartId();
    while (used.has(id)) id = newPartId();
    used.add(id);
    let ladder = null;
    if (x.build && typeof x.build === "object") {
      const b = x.build as Record<string, unknown>;
      const num = (k: string) => (typeof b[k] === "number" && Number.isFinite(b[k]) ? Math.round(b[k] as number) : NaN);
      const plan: PartPlan = {
        from: num("from"),
        to: num("to"),
        by: num("by"),
        weeks: Math.max(1, Math.min(8, num("weeks") || 2)),
        unit: typeof b.unit === "string" ? b.unit.trim().slice(0, PART_UNIT_MAX) : "",
      };
      const err = partPlanError(plan);
      if (err) return { ok: false, error: `Parte ${i + 1}: ${err}` };
      if (plan.to > 100_000) return { ok: false, error: `Parte ${i + 1}: el número es muy grande.` };
      ladder = prev?.ladder ? replanPart(prev.ladder, plan, today) : newPartLadder(plan, today);
    }
    out.push({ id, name, moment, since: prev?.since ?? today, ladder });
  }
  return { ok: true, parts: orderParts(out) };
}

/** Vuelve a leer la marca de hoy con las partes de ahora (si tenía el detalle de partes). */
async function refreshPartsDay(habitId: string, today: string, parts: HabitPart[] | null) {
  const key = { habitId, date: toDbDate(today) };
  const log = await prisma.habitLog.findUnique({ where: { habitId_date: key } });
  if (!log) return;
  const prev = parsePartsDay(log.parts);
  if (!parts) {
    // Dejó de ser por partes: el detalle se va; un día a medias queda solo con su nota (o sin marca).
    if (!prev) return;
    if (log.status === "done") await prisma.habitLog.update({ where: { id: log.id }, data: { parts: Prisma.DbNull } });
    else if (log.note) await prisma.habitLog.update({ where: { id: log.id }, data: { parts: Prisma.DbNull, value: 0 } });
    else await prisma.habitLog.delete({ where: { id: log.id } });
    return;
  }
  if (log.status === "failed" || log.status === "skipped") return;
  if (!prev && log.status !== "done") return;
  const ids = parts.map((p) => p.id);
  const m = partsMark(ids, prev ? prev.done : ids);
  if (!m.status) {
    if (log.note) await prisma.habitLog.update({ where: { id: log.id }, data: { status: "none", value: 0, parts: Prisma.DbNull } });
    else await prisma.habitLog.delete({ where: { id: log.id } });
    return;
  }
  await prisma.habitLog.update({ where: { id: log.id }, data: { status: m.status, value: m.value, parts: m.parts as unknown as Prisma.InputJsonValue } });
}

async function movePart(habitId: string, partId: string, fn: (p: HabitPart, today: string) => HabitPart | null, label: (p: HabitPart) => string): Promise<LadderResult> {
  await exigirSesion();
  const habit = await prisma.habit.findUnique({ where: { id: habitId }, select: { name: true, parts: true } });
  if (!habit) return { ok: false, error: "No existe ese hábito." };
  const parts = parseParts(habit.parts);
  const part = parts?.find((p) => p.id === partId);
  if (!parts || !part?.ladder) return { ok: false, error: "Esa parte no se está construyendo." };
  const next = fn(part, todayISO());
  if (!next) return { ok: true };
  await prisma.habit.update({
    where: { id: habitId },
    data: { parts: parts.map((p) => (p.id === partId ? next : p)) as unknown as Prisma.InputJsonValue },
  });
  await logActivity("updated", "habit", habitId, `${habit.name}: ${label(next)}`);
  refrescar();
  return { ok: true };
}

/** Sube la escalera de una parte un paso (no pasa de la meta). */
export async function advancePart(habitId: string, partId: string): Promise<LadderResult> {
  return movePart(
    habitId,
    partId,
    (p, today) => {
      const l = p.ladder!;
      if (l.current >= l.steps.length - 1) return null;
      return { ...p, ladder: { ...advance(l, today), unit: l.unit } };
    },
    (p) => `${p.name} subió a ${p.ladder!.steps[p.ladder!.current].title}`,
  );
}

/** "Todavía no": la parte no ofrece subir por 7 días. */
export async function stayPart(habitId: string, partId: string): Promise<LadderResult> {
  return movePart(habitId, partId, (p, today) => ({ ...p, ladder: { ...snoozeWeek(p.ladder!, today), unit: p.ladder!.unit } }), (p) => `${p.name}: todavía no sube`);
}
