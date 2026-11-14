/**
 * Ritual matutino (servidor y cliente, sin base): qué mostrar según la hora, el sapo
 * que se propone, los logros recientes y la racha de rituales. Diseño 3 "Tablero del día"
 * que eligió Facu (2026-11-14): el ritual es la fila de arriba de Inicio.
 */
import { addDays, diffDays, isISODate } from "./dates";

export type MissionResult = "yes" | "partial" | "no";
export const MISSION_RESULTS: { value: MissionResult; label: string; done: string }[] = [
  { value: "yes", label: "Sí", done: "Misión cumplida" },
  { value: "partial", label: "A medias", done: "Misión a medias" },
  { value: "no", label: "No", done: "Misión sin cumplir" },
];

/** Desde esta hora (Montevideo) la misión pregunta cómo te fue. */
export const NIGHT_HOUR = 19;
export const MISSION_MAX = 200;
export const FROG_MAX = 120;

export type RitualDTO = {
  day: string;
  mission: string | null;
  frogTaskId: string | null;
  frogTitle: string | null;
  /** Instante (ISO) en que se tildó "Me lo comí". */
  frogDoneAt: string | null;
  missionResult: MissionResult | null;
  skipped: boolean;
  completedAt: string | null;
};

export function emptyRitual(day: string): RitualDTO {
  return { day, mission: null, frogTaskId: null, frogTitle: null, frogDoneAt: null, missionResult: null, skipped: false, completedAt: null };
}

/** Lo que se puede cambiar de un ritual (cada campo, opcional). `completed` y `frogDone` ponen o sacan la hora. */
export type RitualPatch = {
  mission?: string | null;
  frogTaskId?: string | null;
  frogTitle?: string | null;
  frogDoneAt?: string | null;
  missionResult?: MissionResult | null;
  skipped?: boolean;
  completed?: boolean;
};

const oneLine = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);

/** La misión sin el "Hoy gano si" del principio (la pantalla ya lo pone delante). */
export function missionText(raw: string): string | null {
  return oneLine(raw.replace(/^\s*hoy\s+gano\s+si(?![a-záéíóúñ])[\s.:,…-]*/i, ""), MISSION_MAX) || null;
}

/**
 * Valida un cambio que llega del cliente: textos de un renglón con tope, el resultado de la
 * noche en su lista, la hora del sapo como instante válido. Lo que no se entiende, se ignora.
 */
export function cleanRitualPatch(raw: unknown): RitualPatch {
  if (!raw || typeof raw !== "object") return {};
  const p = raw as Record<string, unknown>;
  const out: RitualPatch = {};
  if ("mission" in p) out.mission = typeof p.mission === "string" ? missionText(p.mission) : null;
  if ("frogTitle" in p || "frogTaskId" in p) {
    out.frogTitle = typeof p.frogTitle === "string" ? oneLine(p.frogTitle, FROG_MAX) || null : null;
    out.frogTaskId = typeof p.frogTaskId === "string" && p.frogTaskId.length <= 40 && out.frogTitle ? p.frogTaskId : null;
  }
  if ("frogDoneAt" in p) {
    const t = typeof p.frogDoneAt === "string" ? Date.parse(p.frogDoneAt) : NaN;
    out.frogDoneAt = Number.isFinite(t) ? new Date(t).toISOString() : null;
  }
  if ("missionResult" in p) out.missionResult = MISSION_RESULTS.some((r) => r.value === p.missionResult) ? (p.missionResult as MissionResult) : null;
  if ("skipped" in p) out.skipped = p.skipped === true;
  if ("completed" in p) out.completed = p.completed === true;
  return out;
}

/** Aplica un cambio ya validado a un ritual (lo usa la pantalla para verlo al toque). */
export function applyRitualPatch(r: RitualDTO, p: RitualPatch, now: Date = new Date()): RitualDTO {
  const next = { ...r };
  if ("mission" in p) next.mission = p.mission ?? null;
  if ("frogTitle" in p) {
    // Otro sapo: lo comido era del anterior.
    if ((p.frogTitle ?? null) !== r.frogTitle || (p.frogTaskId ?? null) !== r.frogTaskId) next.frogDoneAt = null;
    next.frogTitle = p.frogTitle ?? null;
    next.frogTaskId = p.frogTaskId ?? null;
  }
  if ("frogDoneAt" in p) next.frogDoneAt = p.frogDoneAt ?? null;
  if ("missionResult" in p) next.missionResult = p.missionResult ?? null;
  if ("skipped" in p) next.skipped = !!p.skipped;
  if ("completed" in p) next.completedAt = p.completed ? (r.completedAt ?? now.toISOString()) : null;
  return next;
}

/** El ritual quedó armado: se tocó "Listo" o tiene misión y sapo. */
export function isRitualDone(r: RitualDTO | null | undefined): boolean {
  if (!r || r.skipped) return false;
  return !!r.completedAt || (!!r.mission && !!r.frogTitle);
}

export type RitualStage = "morning" | "done" | "night" | "skipped";

/**
 * Qué se ve arriba de Inicio: (a) la mañana para armar el día, (b) plegado cuando ya está,
 * (c) la noche (desde las 19 h, si hubo misión y no se respondió) o salteado.
 * `editing`: se está completando o se tocó "Editar" (no se pliega mientras tanto).
 */
export function ritualStage(r: RitualDTO, hour: number, editing = false): RitualStage {
  if (editing) return "morning";
  if (r.skipped) return "skipped";
  if (hour >= NIGHT_HOUR && r.mission && !r.missionResult) return "night";
  if (isRitualDone(r) || r.missionResult) return "done";
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
  id: string;
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

// ─── Revisión semanal ───────────────────────────────────────────────────────

export type RitualWeek = { missions: number; yes: number; partial: number; frogs: number; eaten: number; days: number };

/** "Misiones cumplidas N de M · sapos comidos N" (null si esa semana no hubo rituales). */
export function ritualWeek(rows: Pick<RitualDTO, "mission" | "missionResult" | "frogTitle" | "frogDoneAt" | "skipped" | "completedAt">[]): RitualWeek | null {
  const used = rows.filter((r) => !r.skipped && (r.mission || r.frogTitle || r.completedAt));
  if (!used.length) return null;
  return {
    days: used.length,
    missions: used.filter((r) => r.mission).length,
    yes: used.filter((r) => r.mission && r.missionResult === "yes").length,
    partial: used.filter((r) => r.mission && r.missionResult === "partial").length,
    frogs: used.filter((r) => r.frogTitle).length,
    eaten: used.filter((r) => r.frogTitle && r.frogDoneAt).length,
  };
}

/** Día válido para guardar: hoy o hasta una semana atrás (la pregunta de la noche pasada medianoche). */
export function isRitualDay(day: unknown, today: string): day is string {
  return isISODate(day) && day <= today && day >= addDays(today, -7);
}
