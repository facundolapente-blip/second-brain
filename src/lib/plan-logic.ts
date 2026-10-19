/**
 * Reglas del Plan semanal, sin base ni React (servidor y cliente).
 * Calcadas del "Plan Semanal" de Notion de Facu.
 */
import { addDays, diffDays, startOfWeek } from "./dates";

export type TaskStatus = "backlog" | "todo" | "doing" | "done";
export type KrStatus = "todo" | "doing" | "done" | "closed";

export const TASK_STATUS: Record<TaskStatus, { label: string; tone: string }> = {
  backlog: { label: "Programada", tone: "purple" },
  todo: { label: "Sin empezar", tone: "stone" },
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

/**
 * Un link escrito a mano: sin esquema se le agrega https://. Solo http/https
 * (nada de javascript: ni similares); null si no es un link válido.
 */
export function normalizeLink(raw: string): string | null {
  const t = raw.trim();
  if (!t || t.length > 600) return null;
  // "ejemplo.com:8080" o "localhost:3000" no traen esquema (lo de antes de ":" es el dominio):
  // solo cuenta como esquema "algo://" o uno conocido sin barras (javascript:, mailto:…, que se rechazan abajo).
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(t) || /^(javascript|data|vbscript|mailto|file|blob|about|tel|sms):/i.test(t);
  const withScheme = hasScheme ? t : `https://${t}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname.includes(".") && u.hostname !== "localhost") return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Un link de una tarea, con nombre opcional. */
export type TaskLink = { url: string; name: string };

/**
 * Lista de links desde lo guardado o lo que manda el formulario: acepta
 * `{ url, name }` o un texto con el link (como se guardaban antes); sin repetidos.
 */
export function parseTaskLinks(raw: unknown): TaskLink[] {
  if (!Array.isArray(raw)) return [];
  const out: TaskLink[] = [];
  for (const item of raw.slice(0, 60)) {
    const obj = typeof item === "string" ? { url: item, name: "" } : (item as Partial<TaskLink> | null);
    const url = normalizeLink(String(obj?.url ?? ""));
    if (!url || out.some((l) => l.url === url)) continue;
    out.push({ url, name: String(obj?.name ?? "").trim().slice(0, 80) });
  }
  return out.slice(0, 30);
}

/** Cómo se muestra un link: dominio (sin www) y el camino, cortado. */
export function linkLabel(url: string): string {
  try {
    const u = new URL(url);
    const path = (u.pathname + u.search).replace(/\/$/, "");
    const label = u.hostname.replace(/^www\./, "") + path;
    return label.length > 60 ? `${label.slice(0, 57)}…` : label;
  } catch {
    return url;
  }
}

/** Columnas de la tabla de tareas (compu) con su ancho por defecto en px. La última (Progreso) toma lo que sobra. */
export const TASK_COLUMNS = [
  { key: "date", label: "Fecha", width: 76 },
  { key: "title", label: "Tarea", width: 340 },
  { key: "category", label: "Categoría", width: 136 },
  { key: "priority", label: "Prioridad", width: 104 },
  { key: "deadline", label: "Vence", width: 120 },
  { key: "progress", label: "Progreso", width: 240 },
  { key: "scheduled", label: "Agendada", width: 96 },
] as const;
/** Todas las columnas tienen ancho propio y se cambian arrastrando; la tabla mide la suma (ninguna se estira sola). */
export type TaskColumnKey = (typeof TASK_COLUMNS)[number]["key"];
export type TaskColumnWidths = Partial<Record<TaskColumnKey, number>>;
export const TASK_COLUMN_MIN = 48;
export const TASK_COLUMN_MAX = 900;

/** Anchos guardados (`AppSetting "tareas_columnas"`), solo los válidos. */
export function parseTaskColumns(raw: string | null | undefined): TaskColumnWidths {
  const out: TaskColumnWidths = {};
  try {
    const v = JSON.parse(raw ?? "{}") as Record<string, unknown>;
    for (const c of TASK_COLUMNS) {
      const n = Number(v[c.key]);
      if (Number.isFinite(n)) out[c.key] = Math.round(Math.min(TASK_COLUMN_MAX, Math.max(TASK_COLUMN_MIN, n)));
    }
  } catch {
    // Valor roto: se usan los anchos por defecto.
  }
  return out;
}

/** Tipo de dato al arrastrar una tarea de la tabla a un día de la semana. */
export const TASK_DRAG = "text/x-tarea";

/** Cookie con los pendientes sin hora plegados en la vista por horas. */
export const HOURS_TODO_FOLD_COOKIE = "plan_pendientes_plegados";

/** Cookie con las tareas plegadas en el celular (se recuerda entre visitas). */
export const TASKS_FOLD_COOKIE = "plan_tareas_plegadas";

/** Cookie con el paso de las flechas de la semana ("dia" o "semana"). */
export const PLAN_STEP_COOKIE = "plan_paso";

/** Cookie con la vista de la semana elegida ("lista" u "horas"). */
export const PLAN_VIEW_COOKIE = "plan_vista";

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
  links: TaskLink[];
  blockCount: number;
  /** Pasos (checklist). */
  subtasks: { id: string; title: string; done: boolean }[];
  /** Se repite al terminarla: daily | weekly | monthly. */
  repeat: "daily" | "weekly" | "monthly" | null;
  repeatEvery: number;
  /** Orden arrastrado a mano. */
  order: number;
  /** Cuándo se terminó (ISO), solo las terminadas. */
  doneAt: string | null;
};

/** Vistas donde se puede arrastrar: en "Con deadline" manda la fecha y en "Terminadas", cuándo. */
export const SORTABLE_VIEWS: TaskView[] = ["todo", "priority", "chill", "backlog"];

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
  /** Lugar en el día de un bloque sin hora (minutos); null = arriba. */
  sortKey: number | null;
  priority: number;
  done: boolean;
  place: string | null;
  notes: string | null;
  taskId: string | null;
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

/**
 * Hora escrita a mano → "HH:MM" ("" si está vacía, null si no es una hora):
 * "9" → 09:00, "930" → 09:30, "2130" → 21:30, "9:5" → 09:05, "21.30" o "21 30" → 21:30.
 */
export function normalizeTime(raw: string): string | null {
  const t = raw.trim();
  if (!t) return "";
  let h: number;
  let m: number;
  if (/[^\d:.,\s]/.test(t)) return null; // "9:30 pm" y similares no: solo números y separadores
  const parts = t.split(/[:.,\s]+/).filter(Boolean);
  if (parts.length > 2) return null;
  if (parts.length === 2) {
    h = Number(parts[0]);
    m = Number(parts[1]);
  } else {
    const d = t.replace(/\D/g, "");
    if (!d || d !== t) return null;
    if (d.length <= 2) [h, m] = [Number(d), 0];
    else if (d.length === 3) [h, m] = [Number(d[0]), Number(d.slice(1))];
    else if (d.length === 4) [h, m] = [Number(d.slice(0, 2)), Number(d.slice(2))];
    else return null;
  }
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
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
/**
 * Lugar de un bloque en la columna del día, en minutos: los que tienen hora, su
 * hora de inicio; los que no, el lugar donde se soltaron (`sortKey`) o arriba.
 */
export function blockSortKey(b: Pick<BlockDTO, "startTime"> & { sortKey?: number | null }): number {
  if (b.startTime) return Number(b.startTime.slice(0, 2)) * 60 + Number(b.startTime.slice(3, 5));
  return b.sortKey ?? -1;
}

export function sortBlocks<T extends Pick<BlockDTO, "startTime" | "title"> & { sortKey?: number | null }>(blocks: T[]): T[] {
  return [...blocks].sort(
    (a, b) =>
      blockSortKey(a) - blockSortKey(b) ||
      // Empatados: primero el que no tiene hora (se soltó justo antes de ese horario).
      Number(!!a.startTime) - Number(!!b.startTime) ||
      a.title.localeCompare(b.title, "es"),
  );
}

/**
 * `sortKey` para soltar un bloque sin hora en la posición `index` de la lista
 * del día (ya ordenada y sin el bloque que se mueve): entre sus dos vecinos.
 */
export type SortKeyPatch = [id: string, sortKey: number];

/**
 * Dónde queda un bloque sin hora soltado en la posición `index` de la lista del
 * día (ya ordenada y sin el bloque que se mueve): `key` es su `sortKey`, entre sus
 * dos vecinos. Si los vecinos empatan (dos sin lugar guardado valen -1, o uno sin
 * hora soltado justo a la hora del siguiente), no hay lugar en el medio: se
 * renumeran los sin hora de ese tramo (entre los dos bloques con hora que lo
 * rodean) y `others` trae los que cambian, para mandarlos junto con el movimiento.
 */
export function placeAt<T extends Pick<BlockDTO, "id" | "startTime"> & { sortKey?: number | null }>(
  list: T[],
  index: number,
): { key: number; others: SortKeyPatch[] } {
  const prev = index > 0 ? blockSortKey(list[index - 1]) : null;
  const next = index < list.length ? blockSortKey(list[index]) : null;
  if (prev === null && next === null) return { key: 0, others: [] };
  if (prev === null) return { key: next! - 10, others: [] };
  if (next === null) return { key: prev + 10, others: [] };
  if (next - prev > 0.001) return { key: (prev + next) / 2, others: [] };
  // Sin lugar: el tramo de sin hora (en el orden final) alrededor de donde cae.
  const MOVED = null;
  const order: (T | typeof MOVED)[] = [...list.slice(0, index), MOVED, ...list.slice(index)];
  let a = index;
  while (a > 0 && !order[a - 1]?.startTime) a--;
  let z = index;
  while (z < order.length - 1 && !order[z + 1]?.startTime) z++;
  const lo = a > 0 ? blockSortKey(order[a - 1]!) : null;
  const hi = z < order.length - 1 ? blockSortKey(order[z + 1]!) : null;
  const n = z - a + 1;
  const keyOf = (i: number) =>
    lo !== null && hi !== null ? lo + ((hi - lo) * (i + 1)) / (n + 1) : lo !== null ? lo + 10 * (i + 1) : hi !== null ? hi - 10 * (n - i) : 10 * i;
  let key = 0;
  const others: SortKeyPatch[] = [];
  for (let i = 0; i < n; i++) {
    const b = order[a + i];
    if (b === MOVED) key = keyOf(i);
    else if (keyOf(i) !== b.sortKey) others.push([b.id, keyOf(i)]);
  }
  return { key, others };
}

/** `sortKey` para un bloque sin hora nuevo: arriba de todo en su día (como antes, pero con lugar propio). */
export function topSortKey(dayBlocks: (Pick<BlockDTO, "startTime"> & { sortKey?: number | null })[]): number {
  return dayBlocks.length ? Math.min(0, ...dayBlocks.map(blockSortKey)) - 10 : 0;
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

/** Sin "Para hacer" (pedido de Facu, 2026-10-13): Con deadline, Prioridades (3 y 4) y Más chill (1 y 2) cubren todo. */
export const TASK_VIEWS: { id: TaskView; label: string }[] = [
  { id: "deadline", label: "Con deadline" },
  { id: "priority", label: "Prioridades" },
  { id: "chill", label: "Más chill" },
  { id: "backlog", label: "Programadas" },
  { id: "done", label: "Terminadas" },
];

const active = (t: TaskDTO) => t.status === "todo" || t.status === "doing";

/** Las vistas guardadas de Notion: filtro y orden de cada una. */
export function applyTaskView(tasks: TaskDTO[], view: TaskView, manualOrder = false): TaskDTO[] {
  const byDeadline = (a: TaskDTO, b: TaskDTO) =>
    (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999");
  const byPriority = (a: TaskDTO, b: TaskDTO) => b.priority - a.priority || byDeadline(a, b);
  // Desde que se arrastró una vez, las vistas que se pueden ordenar usan ese orden.
  const byOrder = (a: TaskDTO, b: TaskDTO) => a.order - b.order;
  const manual = manualOrder && SORTABLE_VIEWS.includes(view);
  switch (view) {
    // Ya no está entre las vistas (queda por si alguna dirección vieja la pide): todas las abiertas.
    case "todo":
      return tasks
        .filter(active)
        .sort(manual ? byOrder : (a, b) => (a.status === b.status ? byPriority(a, b) : a.status === "doing" ? -1 : 1));
    case "deadline":
      return tasks.filter((t) => active(t) && t.deadline).sort(byDeadline);
    // Prioridades = Alta o Urgente; Más chill = Baja o Media (o sin prioridad); Con deadline = todas las que
    // tienen fecha. Las tres sin importar lo demás (pedido de Facu, 2026-10-13).
    case "priority":
      return tasks.filter((t) => active(t) && t.priority >= 3).sort(manual ? byOrder : byPriority);
    case "chill":
      return tasks.filter((t) => active(t) && t.priority <= 2).sort(manual ? byOrder : byDeadline);
    case "backlog":
      return tasks.filter((t) => t.status === "backlog").sort(manual ? byOrder : byPriority);
    case "done":
      // De la terminada más reciente a la más vieja.
      return tasks.filter((t) => t.status === "done").sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? ""));
  }
}
