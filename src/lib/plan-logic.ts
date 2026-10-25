/**
 * Reglas del Plan semanal, sin base ni React (servidor y cliente).
 * Calcadas del "Plan Semanal" de Notion de Facu.
 */
import { addDays, diffDays, isISODate, startOfWeek, TZ } from "./dates";

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

/** Orden de las columnas de la tabla de tareas (`AppSetting "tareas_columnas_orden"`). */
export const TASK_COLUMN_ORDER_KEY = "tareas_columnas_orden";

/**
 * Orden guardado: solo claves conocidas, sin repetir; las que falten (una columna nueva)
 * van al final en su lugar de fábrica. Sin nada guardado, el orden de `TASK_COLUMNS`.
 */
export function parseTaskColumnOrder(raw: string | null | undefined | unknown[]): TaskColumnKey[] {
  const known = TASK_COLUMNS.map((c) => c.key) as TaskColumnKey[];
  let v: unknown = raw;
  if (typeof raw === "string" || raw == null) {
    try {
      v = JSON.parse(typeof raw === "string" ? raw : "[]");
    } catch {
      v = [];
    }
  }
  const out: TaskColumnKey[] = [];
  if (Array.isArray(v)) for (const k of v) if (known.includes(k as TaskColumnKey) && !out.includes(k as TaskColumnKey)) out.push(k as TaskColumnKey);
  for (const k of known) if (!out.includes(k)) out.push(k);
  return out;
}

/** Mueve la columna `key` antes (o después) de `target`. */
export function moveTaskColumn(order: TaskColumnKey[], key: TaskColumnKey, target: TaskColumnKey, after: boolean): TaskColumnKey[] {
  if (key === target) return order;
  const rest = order.filter((k) => k !== key);
  const at = rest.indexOf(target);
  if (at < 0) return order;
  rest.splice(after ? at + 1 : at, 0, key);
  return rest;
}

/** Tipo de dato al arrastrar una columna de la tabla de tareas (no se confunde con una tarea). */
export const TASK_COLUMN_DRAG = "text/x-columna";

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
  /** Meta del trimestre a la que empuja (Objetivos → Semana). */
  keyResultId: string | null;
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

export type ObjectiveDTO = {
  id: string;
  title: string;
  year: number;
  role: string | null;
  area: string | null;
  priority: number;
  deadline: string | null;
  status: KrStatus;
  /** Meta propia ("1 de 4"); sin meta, el avance es el promedio de sus resultados clave. */
  progress: number | null;
  goal: number | null;
  /** Trimestres en los que está en foco ("Q4"). */
  focus: string[];
  keyResults: KeyResultDTO[];
};

// ─── Objetivos: trimestres y avance ─────────────────────────────────────────

export type Quarter = (typeof QUARTERS)[number];

/** Trimestre de un día ("2026-10-19" → "Q4"). */
export function quarterOf(iso: string): Quarter {
  return QUARTERS[Math.floor((Number(iso.slice(5, 7)) - 1) / 3)];
}

/** Primer y último día de un trimestre. */
export function quarterRange(year: number, q: Quarter): { from: string; to: string } {
  const i = QUARTERS.indexOf(q);
  const from = `${year}-${String(i * 3 + 1).padStart(2, "0")}-01`;
  const to = addDays(i === 3 ? `${year + 1}-01-01` : `${year}-${String(i * 3 + 4).padStart(2, "0")}-01`, -1);
  return { from, to };
}

/** El trimestre siguiente (después del Q4 viene el Q1 del año que sigue). */
export function nextQuarter(year: number, q: Quarter): { year: number; quarter: Quarter } {
  const i = QUARTERS.indexOf(q);
  return i === 3 ? { year: year + 1, quarter: "Q1" } : { year, quarter: QUARTERS[i + 1] };
}

/**
 * En qué trimestres va un resultado clave: los marcados; si no tiene, el de su
 * deadline (Notion pone de deadline el primer día del trimestre siguiente, así
 * que se mira el día anterior: "1 de julio" es del Q2). Sin nada, ninguno.
 */
export function krQuarters(k: Pick<KeyResultDTO, "quarters" | "deadline">): Quarter[] {
  const marked = k.quarters.filter((q): q is Quarter => (QUARTERS as readonly string[]).includes(q));
  if (marked.length) return marked;
  return k.deadline ? [quarterOf(addDays(k.deadline, -1))] : [];
}

/** El resultado clave con el progreso que cuenta: si se mide solo (hábito, cuenta, meta), el del vínculo. */
export function effectiveKr(k: KeyResultDTO): KeyResultDTO {
  return k.auto ? { ...k, progress: k.auto.progress, goal: k.auto.goal ?? k.goal } : k;
}

/** Avance de un resultado clave: completado = 100; si no, progreso sobre meta. */
export function krPct(k: KeyResultDTO): number | null {
  const e = effectiveKr(k);
  if (e.status === "done") return 100;
  return progressPct(e.progress, e.goal);
}

/** Promedio de avance de una lista de resultados clave (null si ninguno tiene meta). */
export function avgPct(krs: KeyResultDTO[]): number | null {
  const ps = krs.map(krPct).filter((p): p is number => p !== null);
  return ps.length ? Math.round(ps.reduce((a, b) => a + b, 0) / ps.length) : null;
}

/** Avance de un objetivo: con meta propia, progreso / meta; si no, el promedio de sus resultados clave. */
export function objectivePct(o: ObjectiveDTO): number | null {
  if (o.status === "done") return 100;
  if (o.goal) return progressPct(o.progress, o.goal);
  return avgPct(o.keyResults);
}

export const isFinishedKr = (k: Pick<KeyResultDTO, "status">) => k.status === "done" || k.status === "closed";

/**
 * Qué trimestre toca revisar hoy: el que está por terminar (últimos 10 días) o el
 * que terminó hace menos de 30. Null el resto del tiempo.
 */
export function reviewQuarter(today: string): { year: number; quarter: Quarter } | null {
  const year = Number(today.slice(0, 4));
  const q = quarterOf(today);
  const { from, to } = quarterRange(year, q);
  if (diffDays(to, today) < 10) return { year, quarter: q };
  if (diffDays(today, from) < 30) {
    const i = QUARTERS.indexOf(q);
    return i === 0 ? { year: year - 1, quarter: "Q4" } : { year, quarter: QUARTERS[i - 1] };
  }
  return null;
}

/** El trimestre anterior al de hoy (para "Revisar Qn" fuera de la ventana). */
export function previousQuarter(today: string): { year: number; quarter: Quarter } {
  const year = Number(today.slice(0, 4));
  const i = QUARTERS.indexOf(quarterOf(today));
  return i === 0 ? { year: year - 1, quarter: "Q4" } : { year, quarter: QUARTERS[i - 1] };
}

export const OBJECTIVES_VIEW_COOKIE = "objetivos_vista";

// ─── Objetivos: año → trimestre → semana ────────────────────────────────────

/** Pestañas de Objetivos (2026-10-25): el año (mapa), el trimestre (13 semanas y metas) y la semana (acciones). */
export type ObjectivesTab = "anio" | "trimestre" | "semana";
export function objectivesTab(raw: string | undefined): ObjectivesTab {
  return raw === "trimestre" || raw === "semana" ? raw : "anio";
}

/** Sugerencia de cuántos objetivos tener en foco por trimestre (se pueden marcar más). */
export const FOCUS_SUGGESTED = 3;

export const inFocus = (o: { focus: string[] }, q: Quarter) => o.focus.includes(q);

/**
 * Qué objetivos se miran en un trimestre: los que están en foco y, aparte, los que tienen
 * metas ese trimestre pero quedaron en pausa. Si no se puso ninguno en foco, cuentan todos
 * los que tienen metas ahí (nada queda en pausa).
 */
export function splitByFocus<T extends Pick<ObjectiveDTO, "focus" | "keyResults">>(objectives: T[], q: Quarter): { active: T[]; paused: T[] } {
  const hasKrs = (o: T) => o.keyResults.some((k) => krQuarters(k).includes(q));
  const focused = objectives.filter((o) => inFocus(o, q));
  if (!focused.length) return { active: objectives.filter(hasKrs), paused: [] };
  return { active: focused, paused: objectives.filter((o) => !inFocus(o, q) && hasKrs(o)) };
}

/**
 * Una acción de la semana: un bloque del Plan atado a una meta del trimestre, o el registro
 * que dejó un bloque al pasar a otra semana (así lo hecho en una semana vieja no se pierde).
 */
export type ObjectiveAction = {
  id: string;
  /** El bloque del Plan (null si es un registro de una semana que ya pasó). */
  blockId: string | null;
  title: string;
  date: string;
  startTime: string | null;
  done: boolean;
  keyResultId: string;
};

/** Una semana del trimestre (lunes a domingo); la primera es la que tiene el primer día. */
export type QuarterWeek = { from: string; to: string; n: number };

export function quarterWeeks(year: number, q: Quarter): QuarterWeek[] {
  const { from, to } = quarterRange(year, q);
  const out: QuarterWeek[] = [];
  for (let d = startOfWeek(from); d <= to; d = addDays(d, 7)) out.push({ from: d, to: addDays(d, 6), n: out.length + 1 });
  return out;
}

/** Cómo salió una semana: todo lo planeado hecho, más de la mitad, menos, sin nada planeado o todavía no llegó. */
export type WeekMark = "full" | "most" | "few" | "empty" | "future";

export function weekMark(planned: number, done: number, future: boolean): WeekMark {
  if (future) return "future";
  if (!planned) return "empty";
  if (done >= planned) return "full";
  return done * 2 >= planned ? "most" : "few";
}

/** Las semanas del trimestre para un grupo de metas: cuántas acciones había y cuántas se hicieron. */
export function weekMarks(
  actions: ObjectiveAction[],
  krIds: ReadonlySet<string>,
  weeks: QuarterWeek[],
  today: string,
): { week: QuarterWeek; planned: number; done: number; mark: WeekMark; current: boolean }[] {
  return weeks.map((w) => {
    const mine = actions.filter((a) => krIds.has(a.keyResultId) && a.date >= w.from && a.date <= w.to);
    const done = mine.filter((a) => a.done).length;
    return { week: w, planned: mine.length, done, mark: weekMark(mine.length, done, w.from > today), current: w.from <= today && today <= w.to };
  });
}

/** Ejecución del trimestre hasta hoy: acciones hechas sobre planeadas (null sin nada planeado). */
export function executionPct(actions: ObjectiveAction[], krIds: ReadonlySet<string>, from: string, today: string): number | null {
  const mine = actions.filter((a) => krIds.has(a.keyResultId) && a.date >= from && a.date <= today);
  return mine.length ? Math.round((mine.filter((a) => a.done).length / mine.length) * 100) : null;
}

/**
 * Si una meta del trimestre va al día: su avance contra cuánto pasó del trimestre (en la
 * semana 4 de 13 tendría que ir por el 30 %), con 10 puntos de margen. Sin meta medible, null.
 */
export type KrPace = "done" | "ontrack" | "behind";

export function krPace(k: KeyResultDTO, year: number, q: Quarter, today: string): KrPace | null {
  if (k.status === "done") return "done";
  if (k.status === "closed") return null;
  const pct = krPct(k);
  if (pct === null) return null;
  if (pct >= 100) return "done";
  const { from, to } = quarterRange(year, q);
  if (today < from) return null;
  const total = diffDays(to, from) + 1;
  const elapsed = Math.min(total, diffDays(today, from) + 1);
  return pct + 10 >= (elapsed / total) * 100 ? "ontrack" : "behind";
}

/** En el tablero de tareas, "Terminado" muestra lo de las últimas dos semanas (salvo en la vista Terminadas). */
export const BOARD_DONE_DAYS = 14;

/**
 * Qué tareas entran al tablero en cada vista: el mismo filtro que la tabla pero
 * sin mirar el estado (las columnas son los estados). Con deadline = todas las
 * que tienen fecha, Prioridades = 3 y 4, Más chill = 1 y 2 (o sin prioridad).
 */
export function boardTasks(tasks: TaskDTO[], view: TaskView, today: string): TaskDTO[] {
  const since = addDays(today, -BOARD_DONE_DAYS);
  const recent = (t: TaskDTO) => t.status !== "done" || (t.doneAt ?? "").slice(0, 10) >= since;
  const pick = (t: TaskDTO) => {
    switch (view) {
      case "deadline":
        return !!t.deadline;
      case "priority":
        return t.priority >= 3;
      case "chill":
        return t.priority <= 2;
      case "backlog":
        return t.status === "backlog";
      case "done":
        return t.status === "done";
      case "todo":
        return t.status !== "done";
    }
  };
  return tasks.filter((t) => pick(t) && (view === "done" || recent(t)));
}
/** AppSetting con el último trimestre revisado ("2026-Q3"): su tarjeta ya no aparece. */
export const REVIEW_DISMISSED_KEY = "objetivos_revision_cerrada";

/** Las tres preguntas de la revisión del trimestre (en la tarjeta y en la entrada del journal). */
export function quarterReviewQuestions(unfinished: number, next: Quarter): string[] {
  return [
    "¿Qué te ayudó a terminar lo que terminaste?",
    unfinished === 1
      ? "¿Qué frenó el que quedó sin terminar?"
      : unfinished
        ? `¿Qué frenó los ${unfinished} que quedaron sin terminar?`
        : "¿Qué hizo que esta vez saliera todo?",
    `¿Qué vas a hacer distinto en el ${next}?`,
  ];
}

export function quarterReviewTemplate(unfinished: number, next: Quarter): string {
  return quarterReviewQuestions(unfinished, next)
    .flatMap((q) => [q, "", ""])
    .join("\n")
    .trimEnd();
}
export const TASKS_LAYOUT_COOKIE = "tareas_vista";

// ─── Fechas y horarios ──────────────────────────────────────────────────────

export const WEEKDAY_LONG = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

/** Los 7 días (lunes a domingo) de la semana que contiene `iso`. */
export function weekDays(iso: string): string[] {
  const monday = startOfWeek(iso);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/**
 * Al cambiar la hora de inicio, la de fin se corre lo mismo (se mantiene la duración):
 * de 15:00–17:00 a empezar 13:00 queda 13:00–15:00. Sin las tres horas válidas, o si el
 * fin no era posterior al inicio, null (no se toca). Tope 23:59: un bloque no pasa al otro día.
 */
export function shiftEnd(prevStart: string, prevEnd: string, newStart: string): string | null {
  if (!isTime(prevStart) || !isTime(prevEnd) || !isTime(newStart)) return null;
  const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const duration = mins(prevEnd) - mins(prevStart);
  if (duration <= 0) return null;
  const end = Math.min(23 * 60 + 59, mins(newStart) + duration);
  return `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
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

// ─── Experiencia de uso (auditoría 2026-10-19) ──────────────────────────────

/**
 * Id que pone el aparato a un bloque o una tarea nueva (con forma de cuid): lo
 * provisorio que se ve al instante y lo que guarda el servidor tienen el mismo id,
 * así la tarjeta no se vuelve a montar (ni a animar) cuando llega la respuesta.
 */
export function newClientId(): string {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  return "c" + Array.from(a, (b) => "0123456789abcdefghijklmnopqrstuvwxyz"[b % 36]).join("");
}
export function isClientId(s: unknown): s is string {
  return typeof s === "string" && /^c[a-z0-9]{24}$/.test(s);
}

/** Lo mínimo de un formulario que hace falta para leerlo (FormData lo cumple). */
export type FormLike = { get(name: string): FormDataEntryValue | null };
const field = (fd: FormLike, k: string, max = 200) => String(fd.get(k) ?? "").trim().slice(0, max);

/**
 * El bloque como va a quedar al guardar la hoja, para mostrarlo al instante
 * (mismas reglas que `saveBlock`): horas escritas a mano normalizadas, el fin solo
 * si es después del inicio, un bloque nuevo sin hora arriba de su día y uno que
 * pasa a una semana posterior llega sin tildar. null si no se puede guardar.
 */
export function blockFromForm(fd: FormLike, base: BlockDTO | null, dayBlocks: BlockDTO[], id: string): BlockDTO | null {
  const title = field(fd, "title", 120);
  const date = field(fd, "date", 10);
  if (!title || !isISODate(date)) return null;
  const start = normalizeTime(field(fd, "startTime", 8));
  if (start === null) return null;
  const end = normalizeTime(field(fd, "endTime", 8)) ?? "";
  const startTime = start || null;
  const endTime = startTime && isTime(end) && end > startTime ? end : null;
  const done = base ? (base.date !== date && startOfWeek(date) > startOfWeek(base.date) ? false : base.done) : false;
  return {
    id,
    title,
    date,
    startTime,
    endTime,
    categoryId: field(fd, "categoryId", 40) || null,
    priority: Math.max(0, Math.min(4, Math.round(Number(field(fd, "priority", 2)) || 0))),
    place: field(fd, "place", 120) || null,
    notes: field(fd, "notes", 2000) || null,
    taskId: field(fd, "taskId", 40) || null,
    // Como en el servidor: la meta solo cambia si la hoja la manda.
    keyResultId: fd.get("keyResultId") !== null ? field(fd, "keyResultId", 40) || null : (base?.keyResultId ?? null),
    done,
    sortKey: base ? base.sortKey : startTime ? null : topSortKey(dayBlocks.filter((b) => b.date === date)),
  };
}

/**
 * La tarea como va a quedar al guardar la hoja (mismas reglas que `saveTask`),
 * para verla cambiada al instante. Una nueva trae sus pasos escritos (uno por renglón).
 */
export function taskFromForm(fd: FormLike, base: TaskDTO | null, id: string, now = new Date()): TaskDTO | null {
  const title = field(fd, "title", 160);
  if (!title) return null;
  const st = field(fd, "status") as TaskStatus;
  const status: TaskStatus = (["backlog", "todo", "doing", "done"] as TaskStatus[]).includes(st) ? st : "todo";
  const deadline = field(fd, "deadline", 10);
  const repeat = field(fd, "repeat");
  const every = Math.round(Number(field(fd, "repeatEvery", 4)));
  let links: TaskLink[] = base?.links ?? [];
  try {
    links = parseTaskLinks(JSON.parse(String(fd.get("links") ?? "[]")));
  } catch {
    // Se queda con los que tenía.
  }
  const prio = field(fd, "priority", 2);
  const subtasks = base
    ? base.subtasks
    : field(fd, "subtasks", 4000)
        .split(/\r?\n/)
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 50)
        .map((t, i) => ({ id: `tmp-${id}-${i}`, title: t.slice(0, 200), done: false }));
  return {
    id,
    title,
    status,
    categoryId: field(fd, "categoryId", 40) || null,
    priority: prio === "" ? 1 : Math.max(0, Math.min(4, Math.round(Number(prio)) || 0)),
    deadline: isISODate(deadline) ? deadline : null,
    scheduled: fd.get("scheduled") === "on",
    notes: field(fd, "notes", 4000) || null,
    links,
    repeat: repeat === "daily" || repeat === "weekly" || repeat === "monthly" ? repeat : null,
    repeatEvery: Number.isFinite(every) ? Math.max(1, Math.min(60, every)) : 1,
    subtasks,
    progress: subtasks.length ? subtasks.filter((s) => s.done).length : (base?.progress ?? null),
    goal: subtasks.length ? subtasks.length : (base?.goal ?? null),
    blockCount: base?.blockCount ?? 0,
    order: base?.order ?? -1e9,
    doneAt: status === "done" ? (base?.status === "done" ? base.doneAt : now.toISOString()) : null,
  };
}

const clockFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
/** Minuto del día ahora en Montevideo (0 a 1439). */
export function minutesNow(d = new Date()): number {
  const [h, m] = clockFmt.format(d).split(":").map(Number);
  return (h % 24) * 60 + m;
}

/** ¿El bloque está pasando ahora? Hoy, con hora, entre su inicio y su fin (sin fin, una hora). */
export function isBlockNow(b: Pick<BlockDTO, "date" | "startTime" | "endTime">, today: string, now: number): boolean {
  if (b.date !== today || !b.startTime) return false;
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const start = m(b.startTime);
  const end = b.endTime && m(b.endTime) > start ? m(b.endTime) : start + 60;
  return now >= start && now < end;
}

/**
 * A qué hora abrir la grilla de Por horas: una hora antes de ahora, o el primer
 * bloque de esos días si empieza antes (en horas enteras, nunca antes de `from`).
 */
export function hoursScrollTarget(now: number, firstBlockMin: number | null, from: number): number {
  const target = Math.min(Math.floor(now / 60) - 1, firstBlockMin === null ? Infinity : Math.floor(firstBlockMin / 60));
  return Math.max(from, target);
}

/**
 * Atajos del selector de deadline: Hoy, Mañana, Próximo lunes y +1 semana (desde el
 * deadline que tenga; si no tiene o ya venció, desde hoy: correr una vencida y que siga vencida no sirve).
 */
export function deadlineShortcuts(today: string, current: string | null): { label: string; date: string }[] {
  return [
    { label: "Hoy", date: today },
    { label: "Mañana", date: addDays(today, 1) },
    { label: "Próximo lunes", date: addDays(startOfWeek(today), 7) },
    { label: "+1 semana", date: addDays(current && current > today ? current : today, 7) },
  ];
}

/**
 * Las semanas (de lunes a domingo) que muestran un mes en un calendario chico:
 * siempre semanas completas, con los días del mes de al lado.
 */
export function monthGrid(month: string): string[][] {
  const first = `${month}-01`;
  const start = startOfWeek(first);
  const weeks: string[][] = [];
  for (let d = start; d.slice(0, 7) <= month || weeks.length === 0; ) {
    const week = Array.from({ length: 7 }, (_, i) => addDays(d, i));
    weeks.push(week);
    d = addDays(d, 7);
    if (d.slice(0, 7) > month) break;
  }
  return weeks;
}
