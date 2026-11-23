/**
 * Ritual matutino (servidor y cliente, sin base): qué mostrar según la hora, el sapo
 * ("Tarea prioritaria" en la pantalla) que se propone y la racha de rituales. Diseño 3
 * "Tablero del día" que eligió Facu (2026-11-14): el ritual es la fila de arriba de Inicio.
 * La misión del día ("Hoy gano si…") se sacó el mismo día: en su lugar va "¿Cómo estás?".
 */
import { addDays, diffDays, isISODate } from "./dates";

/** Desde esta hora (Montevideo) es "Buenas noches" y se pregunta si se hizo la tarea prioritaria. */
export const NIGHT_HOUR = 19;
export const FROG_MAX = 120;

export type RitualDTO = {
  day: string;
  frogTaskId: string | null;
  /** El bloque de hoy elegido (si la tarea prioritaria salió del Plan de hoy). */
  frogBlockId: string | null;
  frogTitle: string | null;
  /** Instante (ISO) en que se tildó "La hice". */
  frogDoneAt: string | null;
  skipped: boolean;
  completedAt: string | null;
};

export function emptyRitual(day: string): RitualDTO {
  return { day, frogTaskId: null, frogBlockId: null, frogTitle: null, frogDoneAt: null, skipped: false, completedAt: null };
}

/** Lo que se puede cambiar de un ritual (cada campo, opcional). `completed` y `frogDone` ponen o sacan la hora. */
export type RitualPatch = {
  frogTaskId?: string | null;
  frogBlockId?: string | null;
  frogTitle?: string | null;
  frogDoneAt?: string | null;
  skipped?: boolean;
  completed?: boolean;
};

const oneLine = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);

/**
 * Valida un cambio que llega del cliente: el nombre del sapo en un renglón con tope, la hora
 * en que se hizo como instante válido. Lo que no se entiende (también la misión y su
 * respuesta de la noche, que ya no existen, si quedó algo en la cola sin conexión), se ignora.
 */
export function cleanRitualPatch(raw: unknown): RitualPatch {
  if (!raw || typeof raw !== "object") return {};
  const p = raw as Record<string, unknown>;
  const out: RitualPatch = {};
  if ("frogTitle" in p || "frogTaskId" in p) {
    out.frogTitle = typeof p.frogTitle === "string" ? oneLine(p.frogTitle, FROG_MAX) || null : null;
    out.frogTaskId = typeof p.frogTaskId === "string" && p.frogTaskId.length <= 40 && out.frogTitle ? p.frogTaskId : null;
    out.frogBlockId = typeof p.frogBlockId === "string" && p.frogBlockId.length <= 60 && out.frogTitle ? p.frogBlockId : null;
  }
  if ("frogDoneAt" in p) {
    const t = typeof p.frogDoneAt === "string" ? Date.parse(p.frogDoneAt) : NaN;
    out.frogDoneAt = Number.isFinite(t) ? new Date(t).toISOString() : null;
  }
  if ("skipped" in p) out.skipped = p.skipped === true;
  if ("completed" in p) out.completed = p.completed === true;
  return out;
}

/** Aplica un cambio ya validado a un ritual (lo usa la pantalla para verlo al toque). */
export function applyRitualPatch(r: RitualDTO, p: RitualPatch, now: Date = new Date()): RitualDTO {
  const next = { ...r };
  if ("frogTitle" in p) {
    // Otro sapo: lo comido era del anterior.
    if ((p.frogTitle ?? null) !== r.frogTitle || (p.frogTaskId ?? null) !== r.frogTaskId || (p.frogBlockId ?? null) !== r.frogBlockId) next.frogDoneAt = null;
    next.frogTitle = p.frogTitle ?? null;
    next.frogTaskId = p.frogTaskId ?? null;
    next.frogBlockId = p.frogBlockId ?? null;
  }
  if ("frogDoneAt" in p) next.frogDoneAt = p.frogDoneAt ?? null;
  if ("skipped" in p) next.skipped = !!p.skipped;
  if ("completed" in p) next.completedAt = p.completed ? (r.completedAt ?? now.toISOString()) : null;
  return next;
}

/** El ritual quedó armado: se tocó "Listo" o se eligió la tarea prioritaria. */
export function isRitualDone(r: RitualDTO | null | undefined): boolean {
  if (!r || r.skipped) return false;
  return !!r.completedAt || !!r.frogTitle;
}

export type RitualStage = "morning" | "done" | "night" | "skipped";

/**
 * Qué se ve arriba de Inicio: (a) la mañana para elegir la tarea prioritaria, (b) plegado
 * cuando ya está, (c) la noche (desde las 19 h, si hubo tarea prioritaria y no se tildó) o
 * salteado. `editing`: se está eligiendo o se tocó "Cambiar" (no se pliega mientras tanto).
 */
export function ritualStage(r: RitualDTO, hour: number, editing = false): RitualStage {
  if (editing) return "morning";
  if (r.skipped) return "skipped";
  if (hour >= NIGHT_HOUR && r.frogTitle && !r.frogDoneAt) return "night";
  if (isRitualDone(r)) return "done";
  return "morning";
}

/** Días seguidos con el ritual hecho hasta hoy (si hoy todavía no, desde ayer). */
export function ritualStreak(doneDays: Iterable<string>, today: string): number {
  const set = new Set(doneDays);
  let day = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(day)) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}

// ─── El sapo ────────────────────────────────────────────────────────────────

export type FrogTaskInput = {
  /** La tarea del Plan ("" si es un bloque sin tarea). */
  id: string;
  /** Si sale de un bloque de hoy: su id y su hora (null = sin hora). */
  blockId?: string | null;
  time?: string | null;
  title: string;
  /** backlog | todo | doing */
  status: string;
  priority: number;
  deadline: string | null;
  /** Cuántas veces se pasó de semana (registros de sus bloques en semanas que ya empezaron). */
  passes: number;
  category: { id: string; name: string; color: string } | null;
};

export type FrogReason = { text: string; tone: string };
export type FrogCandidate = FrogTaskInput & { reasons: FrogReason[] };

function dueReason(left: number): FrogReason {
  if (left < -1) return { text: `Vencida hace ${-left} días`, tone: "red" };
  if (left === -1) return { text: "Venció ayer", tone: "red" };
  if (left === 0) return { text: "Vence hoy", tone: "orange" };
  if (left === 1) return { text: "Vence mañana", tone: "yellow" };
  return { text: `Vence en ${left} días`, tone: "stone" };
}

/** Por qué se propone (hasta dos razones, la que la puso primero adelante). */
export function frogReasons(t: FrogTaskInput, today: string): FrogReason[] {
  const left = t.deadline ? diffDays(t.deadline, today) : null;
  const out: FrogReason[] = [];
  // Lo que ya está en el Plan de hoy lo dice primero.
  if (t.blockId) out.push({ text: t.time ? `Hoy a las ${t.time}` : "Hoy en el plan", tone: "blue" });
  if (left !== null && left < 0) out.push(dueReason(left));
  if (t.priority >= 4) out.push({ text: "Urgente", tone: "red" });
  else if (t.priority === 3) out.push({ text: "Prioridad alta", tone: "orange" });
  if (t.passes >= 2) out.push({ text: `Pasada ${t.passes} veces`, tone: "purple" });
  if (left !== null && left >= 0) out.push(dueReason(left));
  if (!out.length) out.push({ text: t.status === "doing" ? "En curso" : "Sin empezar", tone: "stone" });
  return out.slice(0, 2);
}

/**
 * Las candidatas a sapo: primero las vencidas (la más vieja), después prioridad 4 y 3, después
 * las que más veces se pasaron de semana y por último el deadline más cercano. Las "Programadas"
 * (para algún día) solo entran si tienen fecha.
 */
export function frogCandidates(tasks: FrogTaskInput[], today: string, n = 3): FrogCandidate[] {
  const open = tasks.filter((t) => t.status !== "done" && (t.status !== "backlog" || t.deadline));
  const left = (t: FrogTaskInput) => (t.deadline ? diffDays(t.deadline, today) : Infinity);
  const bucket = (t: FrogTaskInput) => (left(t) < 0 ? 0 : t.priority >= 3 ? 1 : t.passes >= 2 ? 2 : t.deadline ? 3 : 4);
  return [...open]
    .sort(
      (a, b) =>
        bucket(a) - bucket(b) ||
        (bucket(a) === 1 ? b.priority - a.priority : 0) ||
        (bucket(a) === 2 ? b.passes - a.passes : 0) ||
        left(a) - left(b) ||
        Number(b.status === "doing") - Number(a.status === "doing") ||
        b.priority - a.priority ||
        b.passes - a.passes ||
        a.title.localeCompare(b.title, "es"),
    )
    .slice(0, n)
    .map((t) => ({ ...t, reasons: frogReasons(t, today) }));
}

export type FrogBlockInput = {
  id: string;
  title: string;
  startTime: string | null;
  priority: number;
  taskId: string | null;
  category: { id: string; name: string; color: string } | null;
};

/**
 * Las candidatas del día (pedido de Facu, 2026-11-23: "es muy probable que la tarea ya esté
 * agendada en los bloques"): primero los bloques de hoy que faltan (sin los "Libre"), con la
 * prioridad, el deadline y las veces pasada de su tarea si tienen; después, las tareas que no
 * están hoy en el Plan y piden atención (vencidas, prioridad 3 o 4, pasadas 2 veces o más),
 * para agendarlas. Sin bloques hoy, las tareas de siempre.
 */
export function dayFrogCandidates(blocks: FrogBlockInput[], tasks: FrogTaskInput[], today: string, n = 4): FrogCandidate[] {
  const byTask = new Map(tasks.map((t) => [t.id, t]));
  const fromBlocks: FrogTaskInput[] = blocks.map((b) => {
    const t = b.taskId ? byTask.get(b.taskId) : undefined;
    return {
      id: t?.id ?? "",
      blockId: b.id,
      time: b.startTime,
      title: b.title,
      status: t?.status ?? "todo",
      priority: Math.max(b.priority, t?.priority ?? 0),
      deadline: t?.deadline ?? null,
      passes: t?.passes ?? 0,
      category: b.category ?? t?.category ?? null,
    };
  });
  const inToday = new Set(blocks.map((b) => b.taskId).filter(Boolean));
  const rest = tasks.filter((t) => !inToday.has(t.id));
  if (!fromBlocks.length) return frogCandidates(rest, today, n);
  const pressing = rest.filter((t) => (t.deadline && diffDays(t.deadline, today) < 0) || t.priority >= 3 || t.passes >= 2);
  // Los bloques se ordenan con las mismas reglas (lo vencido y urgente, primero); a igualdad, por hora.
  const rankedBlocks = frogCandidates(
    [...fromBlocks].sort((a, b) => (a.time ?? "99").localeCompare(b.time ?? "99")).map((b) => ({ ...b, status: b.status === "backlog" ? "todo" : b.status })),
    today,
    fromBlocks.length,
  );
  return [...rankedBlocks, ...frogCandidates(pressing, today, n)].slice(0, n);
}

// ─── Revisión semanal ───────────────────────────────────────────────────────

export type RitualWeek = { frogs: number; eaten: number };

/** "Tareas prioritarias hechas N de M" (null si esa semana no se eligió ninguna). */
export function ritualWeek(rows: Pick<RitualDTO, "frogTitle" | "frogDoneAt" | "skipped">[]): RitualWeek | null {
  const frogs = rows.filter((r) => !r.skipped && r.frogTitle);
  if (!frogs.length) return null;
  return { frogs: frogs.length, eaten: frogs.filter((r) => r.frogDoneAt).length };
}

/** Día válido para guardar: hoy o hasta una semana atrás (la pregunta de la noche pasada medianoche). */
export function isRitualDay(day: unknown, today: string): day is string {
  return isISODate(day) && day <= today && day >= addDays(today, -7);
}
