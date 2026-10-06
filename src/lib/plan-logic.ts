/**
 * Reglas del Plan semanal, sin base ni React (servidor y cliente).
 * Calcadas del "Plan Semanal" de Notion de Facu.
 */
import { addDays, diffDays, startOfWeek } from "./dates";

export type TaskStatus = "backlog" | "todo" | "doing" | "done";
export type KrStatus = "todo" | "doing" | "done" | "closed";

export const TASK_STATUS: Record<TaskStatus, { label: string; tone: string }> = {
  backlog: { label: "Programada", tone: "stone" },
  todo: { label: "Sin empezar", tone: "red" },
  doing: { label: "En curso", tone: "blue" },
  done: { label: "Terminado", tone: "green" },
};
export const TASK_STATUS_ORDER: TaskStatus[] = ["todo", "doing", "backlog", "done"];

export const KR_STATUS: Record<KrStatus, { label: string; tone: string }> = {
  todo: { label: "Sin empezar", tone: "stone" },
  doing: { label: "Haciendo", tone: "blue" },
  done: { label: "Completado", tone: "green" },
  closed: { label: "Finalizado", tone: "yellow" },
};

export const QUARTERS = ["Q1", "Q2", "Q3", "Q4"] as const;

export type CategoryDTO = { id: string; name: string; color: string };

export type TaskDTO = {
  id: string;
  title: string;
  categoryId: string | null;
  status: TaskStatus;
  priority: number;
  deadline: string | null;
  progress: number | null;
  goal: number | null;
  scheduled: boolean;
  notes: string | null;
  blockCount: number;
  /** Pasos (checklist). */
  subtasks: { id: string; title: string; done: boolean }[];
  /** Se repite al terminarla: daily | weekly | monthly. */
  repeat: "daily" | "weekly" | "monthly" | null;
  repeatEvery: number;
};

export const REPEAT_LABEL = { daily: "día", weekly: "semana", monthly: "mes" } as const;

/** "Se repite cada semana", "cada 2 meses". */
export function repeatLabel(repeat: TaskDTO["repeat"], every: number): string | null {
  if (!repeat) return null;
  const unit = REPEAT_LABEL[repeat];
  return every > 1 ? `Cada ${every} ${repeat === "monthly" ? "meses" : `${unit}s`}` : `Cada ${unit}`;
}

export type BlockDTO = {
  id: string;
  title: string;
  categoryId: string | null;
  date: string;
  startTime: string | null;
  endTime: string | null;
  priority: number;
  done: boolean;
  place: string | null;
  notes: string | null;
  taskId: string | null;
  habitId: string | null;
};

export type KeyResultDTO = {
  id: string;
  objectiveId: string | null;
  title: string;
  kind: "activity" | "habit";
  status: KrStatus;
  quarters: string[];
  deadline: string | null;
  progress: number | null;
  goal: number | null;
  /** Vínculo para medirse solo: "habit:id", "account:id" o "goal:id". */
  link: string | null;
  /** Progreso calculado desde el vínculo (pisa al cargado a mano). */
  auto: { progress: number; goal: number | null; label: string } | null;
};

/** Opciones para vincular un resultado clave. */
export type KrLinkOption = { value: string; label: string; group: "Hábitos" | "Cuentas" | "Metas de ahorro" };

export type ObjectiveDTO = { id: string; title: string; year: number; keyResults: KeyResultDTO[] };

// ─── Fechas y horarios ──────────────────────────────────────────────────────

export const WEEKDAY_LONG = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

/** Los 7 días (lunes a domingo) de la semana que contiene `iso`. */
export function weekDays(iso: string): string[] {
  const monday = startOfWeek(iso);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function isTime(s: unknown): s is string {
  return typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

/** "9:00 a 12:00", "22:00" o null (todo el día). */
export function timeRange(b: Pick<BlockDTO, "startTime" | "endTime">): string | null {
  const f = (t: string) => t.replace(/^0(\d)/, "$1");
  if (!b.startTime) return null;
  return b.endTime ? `${f(b.startTime)} a ${f(b.endTime)}` : f(b.startTime);
}

/** Duración en minutos (0 si no tiene rango). */
export function durationMinutes(b: Pick<BlockDTO, "startTime" | "endTime">): number {
  if (!b.startTime || !b.endTime) return 0;
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  return Math.max(0, m(b.endTime) - m(b.startTime));
}

/** Bloques del día en orden: primero los de todo el día, después por hora. */
export function sortBlocks<T extends Pick<BlockDTO, "startTime" | "title">>(blocks: T[]): T[] {
  return [...blocks].sort(
    (a, b) =>
      (a.startTime ?? "").localeCompare(b.startTime ?? "") || a.title.localeCompare(b.title, "es"),
  );
}

/** Un bloque "Libre" es tiempo propio: se ve más tenue. */
export function isFreeBlock(b: Pick<BlockDTO, "title">): boolean {
  return b.title.trim().toLowerCase() === "libre";
}

// ─── Tareas ─────────────────────────────────────────────────────────────────

/** Días que faltan para el deadline (negativo si ya pasó). */
export function daysLeft(deadline: string | null, today: string): number | null {
  return deadline ? diffDays(deadline, today) : null;
}

/** "Hoy", "Mañana", "En 3 días", "Hace 2 días". */
export function daysLeftLabel(n: number | null): string | null {
  if (n === null) return null;
  if (n === 0) return "Hoy";
  if (n === 1) return "Mañana";
  if (n === -1) return "Ayer";
  return n > 0 ? `En ${n} días` : `Hace ${-n} días`;
}

/** Porcentaje de avance (0 a 100) o null si no tiene meta. */
export function progressPct(p: number | null, goal: number | null): number | null {
  if (!goal || goal <= 0) return null;
  return Math.max(0, Math.min(100, Math.round(((p ?? 0) / goal) * 100)));
}

export type TaskView = "todo" | "deadline" | "priority" | "chill" | "backlog" | "done";

export const TASK_VIEWS: { id: TaskView; label: string }[] = [
  { id: "todo", label: "Para hacer" },
  { id: "deadline", label: "Con deadline" },
  { id: "priority", label: "Prioridades" },
  { id: "chill", label: "Más chill" },
  { id: "backlog", label: "Programadas" },
  { id: "done", label: "Terminadas" },
];

const active = (t: TaskDTO) => t.status === "todo" || t.status === "doing";

/** Las vistas guardadas de Notion: filtro y orden de cada una. */
export function applyTaskView(tasks: TaskDTO[], view: TaskView): TaskDTO[] {
  const byDeadline = (a: TaskDTO, b: TaskDTO) =>
    (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999");
  const byPriority = (a: TaskDTO, b: TaskDTO) => b.priority - a.priority || byDeadline(a, b);
  switch (view) {
    case "todo":
      return tasks.filter(active).sort((a, b) => (a.status === b.status ? byPriority(a, b) : a.status === "doing" ? -1 : 1));
    case "deadline":
      return tasks.filter((t) => active(t) && t.deadline).sort(byDeadline);
    case "priority":
      return tasks.filter((t) => active(t) && t.priority >= 3).sort(byPriority);
    case "chill":
      return tasks.filter((t) => active(t) && t.priority <= 1).sort(byDeadline);
    case "backlog":
      return tasks.filter((t) => t.status === "backlog").sort(byPriority);
    case "done":
      return tasks.filter((t) => t.status === "done");
  }
}
