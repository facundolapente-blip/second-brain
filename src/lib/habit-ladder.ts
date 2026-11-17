/**
 * Hábitos en construcción (pedido de Facu, 2026-11-17): un hábito nuevo se arma de
 * a poco con una escalera de escalones chicos hasta la meta, y "Nunca dos seguidos":
 * en vez de mirar la racha rota, el día después de fallar es "el que importa".
 *
 * Lógica pura (sin base ni React): la usan el servidor, las pantallas y las pruebas.
 * Se guarda en `Habit.ladder` (Json) y `Habit.neverTwice`.
 */
import { addDays, diffDays, isISODate } from "./dates.ts";
import { habitDayMark, isDone as logIsDone, type HabitRule, type LogMap, type PastTrack } from "./habit-logic.ts";

/** need de window días para poder subir (ej. 7 de 10). target: meta numérica del escalón en hábitos de cantidad. */
export type LadderStep = { title: string; need: number; window: number; target?: number | null };

/**
 * current = índice del escalón actual. stepStart = día en que arrancó ese escalón.
 * history = escalones ya pasados con sus fechas (from/to inclusive).
 */
export type Ladder = {
  goal: string;
  steps: LadderStep[];
  current: number;
  stepStart: string;
  snoozeUntil?: string | null;
  history?: { step: number; from: string; to: string }[];
};

export const LADDER_MAX_STEPS = 8;
export const LADDER_TITLE_MAX = 80;
export const LADDER_GOAL_MAX = 200;
export const LADDER_WINDOW_MAX = 30;

const int = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Math.round(Number(v)) : null);

/** Un escalón válido (título no vacío, 1 ≤ need ≤ window ≤ 30) o null. */
export function cleanStep(raw: unknown): LadderStep | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const title = typeof r.title === "string" ? r.title.trim().slice(0, LADDER_TITLE_MAX) : "";
  const need = int(r.need);
  const window = int(r.window);
  if (!title || need === null || window === null) return null;
  if (need < 1 || window < need || window > LADDER_WINDOW_MAX) return null;
  const t = int(r.target);
  const step: LadderStep = { title, need, window };
  if (t !== null && t >= 1) step.target = Math.min(100_000, t);
  return step;
}

/** Lo guardado en `Habit.ladder`, controlado. null si no es una escalera usable. */
export function parseLadder(raw: unknown): Ladder | null {
  let v = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const r = v as Record<string, unknown>;
  const steps = Array.isArray(r.steps) ? r.steps.map(cleanStep).filter((s): s is LadderStep => !!s).slice(0, LADDER_MAX_STEPS) : [];
  if (!steps.length) return null;
  if (!isISODate(r.stepStart)) return null;
  const goal = typeof r.goal === "string" ? r.goal.trim().slice(0, LADDER_GOAL_MAX) : "";
  const cur = int(r.current) ?? 0;
  const ladder: Ladder = {
    goal: goal || steps[steps.length - 1].title,
    steps,
    current: Math.max(0, Math.min(steps.length - 1, cur)),
    stepStart: r.stepStart,
    snoozeUntil: isISODate(r.snoozeUntil) ? r.snoozeUntil : null,
  };
  if (Array.isArray(r.history)) {
    ladder.history = r.history.flatMap((h) => {
      if (!h || typeof h !== "object") return [];
      const x = h as Record<string, unknown>;
      const step = int(x.step);
      return step !== null && step >= 0 && isISODate(x.from) && isISODate(x.to) ? [{ step, from: x.from, to: x.to }] : [];
    });
  }
  return ladder;
}

// ─── Sugerencias (sin IA, por reglas) ──────────────────────────────────────

export type GoalKind = "amount" | "frequency" | "quit" | "plain";

type HabitShape = { frequency: string; target: number; unit: string | null; isQuit: boolean; timesPerWeek?: number | null };

/** "4 veces por semana", "3 x semana", "2 por semana", "1 vez a la semana". */
const FREQ_RE = /(\d+)\s*(?:veces|vez|x|d[ií]as)?\s*(?:por|a la|x|\/|cada)\s*semana/i;
/** Un número con su unidad: "1 hora", "20 páginas", "10 min", "1,5 km". */
const AMOUNT_RE = /(\d+(?:[.,]\d+)?)\s*([a-záéíóúñ]+\.?)?/i;
const HOUR_UNITS = /^(horas?|hs?\.?)$/i;
const MIN_UNITS = /^(minutos?|mins?\.?)$/i;

export function goalKindOf(goal: string, habit: HabitShape): GoalKind {
  const g = goal.trim();
  if (FREQ_RE.test(g)) return "frequency";
  if (habit.isQuit || /^no\b/i.test(g)) return "quit";
  if (/\d/.test(g)) return "amount";
  if (habit.frequency === "weekly") return "frequency";
  if (habit.target > 1) return "amount";
  return "plain";
}

/** Condición para subir: 7 de 10 en los primeros; 10 de 14 en el anteúltimo y en la meta (que no tiene condición: ahí se queda). */
function withRules(titles: { title: string; target?: number | null }[]): LadderStep[] {
  const n = titles.length;
  return titles.map((t, i) => {
    const late = i >= n - 2;
    const step: LadderStep = { title: t.title.slice(0, LADDER_TITLE_MAX), need: late ? 10 : 7, window: late ? 14 : 10 };
    if (t.target) step.target = t.target;
    return step;
  });
}

const isQuantity = (h: HabitShape) => h.target > 1 || !!h.unit;
const pct = [0.25, 0.5, 0.75, 1];

function minutesText(min: number): string {
  if (min >= 60 && min % 60 === 0) return min === 60 ? "1 hora" : `${min / 60} horas`;
  return `${min} min`;
}

function plainSteps(goal: string): { title: string }[] {
  const g = goal.trim() || "el hábito";
  return [{ title: `Versión mínima: ${g} 2 minutos` }, { title: `Media versión: ${g}, la mitad` }, { title: g }];
}

function amountSteps(goal: string, habit: HabitShape): { title: string; target?: number | null }[] | null {
  const m = AMOUNT_RE.exec(goal);
  const qty = isQuantity(habit);
  const targets = pct.map((p) => (qty ? Math.max(1, Math.round(habit.target * p)) : null));
  if (!m) {
    if (!qty) return null;
    const unit = habit.unit ? ` ${habit.unit}` : "";
    const vals = [...new Set(targets as number[])];
    if (vals.length < 3) return null;
    return vals.map((v, i) => ({ title: i === vals.length - 1 ? goal : `${goal} · ${v}${unit}`, target: v }));
  }
  const n = Number(m[1].replace(",", "."));
  const unit = (m[2] ?? "").trim();
  if (!(n > 0)) return null;
  let texts: string[];
  if (HOUR_UNITS.test(unit) || MIN_UNITS.test(unit)) {
    const total = HOUR_UNITS.test(unit) ? Math.round(n * 60) : Math.round(n);
    const mins = pct.map((p) => Math.max(1, total >= 20 ? Math.round((total * p) / 5) * 5 : Math.round(total * p)));
    texts = mins.map((x, i) => (i === mins.length - 1 ? m[0].trim() : minutesText(x)));
  } else {
    const vals = pct.map((p) => Math.max(1, Math.round(n * p)));
    texts = vals.map((x, i) => (i === vals.length - 1 ? m[0].trim() : `${x}${unit ? ` ${unit}` : ""}`));
  }
  const out: { title: string; target?: number | null }[] = [];
  texts.forEach((t, i) => {
    if (out.some((o) => o.title.toLowerCase() === goal.replace(m[0], t).toLowerCase())) return;
    out.push({ title: goal.replace(m[0], t), target: targets[i] });
  });
  // Con números chicos ("2 páginas") los escalones se repiten: con menos de 3 no sirve.
  if (out.length < 3) return null;
  out[out.length - 1] = { title: goal, target: qty ? habit.target : null };
  return out;
}

function frequencySteps(goal: string, habit: HabitShape): LadderStep[] | null {
  const m = FREQ_RE.exec(goal);
  const total = m ? Number(m[1]) : (habit.timesPerWeek ?? 0);
  if (!(total >= 1) || total > 7) return null;
  if (total < 3) return null;
  const n = Math.min(5, total);
  const counts = [...new Set(Array.from({ length: n }, (_, i) => Math.max(1, Math.round((total * (i + 1)) / n))))];
  const text = (k: number) => `${k} ${k === 1 ? "vez" : "veces"} por semana`;
  // Para subir: dos semanas cumpliendo ese escalón (días hechos en 14).
  return counts.map((k, i) => ({
    title: (i === counts.length - 1 ? goal : m ? goal.replace(m[0], text(k)) : `${goal} · ${text(k)}`).slice(0, LADDER_TITLE_MAX),
    need: Math.min(14, 2 * k),
    window: 14,
  }));
}

/**
 * Escalones sugeridos para llegar a `goal` (3 a 5; el último es la meta). Se pueden
 * editar todos. Ejemplos: "Dejar el celular 1 hora antes de dormir" → 15/30/45 min
 * y 1 hora; "Leer 20 páginas" → 5/10/15/20; "Gym 4 veces por semana" → 1, 2, 3 y 4
 * veces; "No fumar" → algunos días, 4 por semana, todos; "Meditar" → versión mínima,
 * media y la meta.
 */
export function suggestSteps(goal: string, habit: HabitShape): LadderStep[] {
  const g = goal.trim().slice(0, LADDER_GOAL_MAX) || "El hábito";
  const kind = goalKindOf(g, habit);
  if (kind === "frequency") {
    const s = frequencySteps(g, habit);
    if (s) return s;
  }
  if (kind === "quit") {
    // En días sin hacerlo, de 14: 2 por semana → 4; 4 por semana → 8; todos → 10 de 14.
    return [
      { title: "Algunos días (2 por semana)", need: 4, window: 14 },
      { title: "4 días por semana", need: 8, window: 14 },
      { title: "Todos los días", need: 10, window: 14 },
    ];
  }
  if (kind === "amount" || kind === "frequency") {
    const s = amountSteps(g, habit);
    if (s) return withRules(s);
  }
  return withRules(plainSteps(g));
}

// ─── Progreso del escalón ──────────────────────────────────────────────────

export type StepProgress = {
  step: number;
  total: number;
  done: number;
  need: number;
  window: number;
  days: { date: string; done: boolean }[];
  ready: boolean;
  struggling: boolean;
  atGoal: boolean;
  daysLeft: number;
};

/**
 * Cómo va el escalón actual: los días desde max(inicio del escalón, hoy − window + 1)
 * hasta hoy. `ready` = llegó a need (y no está en la meta ni pospuesto); `struggling`
 * = pasaron 14 días o más del escalón y no llega a la mitad de lo que tocaba.
 */
export function stepProgress(ladder: Ladder, isDone: (date: string) => boolean, today: string): StepProgress {
  const last = ladder.steps.length - 1;
  const idx = Math.max(0, Math.min(last, ladder.current));
  const step = ladder.steps[idx];
  const winStart = addDays(today, -(step.window - 1));
  const from = ladder.stepStart > winStart ? ladder.stepStart : winStart;
  const days: { date: string; done: boolean }[] = [];
  for (let d = from; d <= today; d = addDays(d, 1)) days.push({ date: d, done: isDone(d) });
  const done = days.filter((d) => d.done).length;
  const atGoal = idx === last;
  const snoozed = !!ladder.snoozeUntil && today <= ladder.snoozeUntil;
  const elapsed = diffDays(today, ladder.stepStart) + 1;
  // Lo que tocaba en los días que van de la ventana (need repartido en window).
  const expected = (step.need * days.length) / step.window;
  return {
    step: idx,
    total: days.length,
    done,
    need: step.need,
    window: step.window,
    days,
    ready: done >= step.need && !atGoal && !snoozed,
    struggling: elapsed >= 14 && done < expected / 2,
    atGoal,
    daysLeft: Math.max(0, step.need - done),
  };
}

/** Sube un escalón (no pasa de la meta): guarda el tramo en history y arranca hoy. */
export function advance(ladder: Ladder, today: string): Ladder {
  return moveTo(ladder, ladder.current + 1, today);
}

/** Baja un escalón (no menos del primero). */
export function stepBack(ladder: Ladder, today: string): Ladder {
  return moveTo(ladder, ladder.current - 1, today);
}

function moveTo(ladder: Ladder, to: number, today: string): Ladder {
  const next = Math.max(0, Math.min(ladder.steps.length - 1, to));
  if (next === ladder.current) return ladder;
  const end = today > ladder.stepStart ? addDays(today, -1) : ladder.stepStart;
  return {
    ...ladder,
    current: next,
    stepStart: today,
    snoozeUntil: null,
    history: [...(ladder.history ?? []), { step: ladder.current, from: ladder.stepStart, to: end }],
  };
}

/** "Me quedo una semana más": no ofrece subir hasta dentro de 7 días. */
export function snoozeWeek(ladder: Ladder, today: string): Ladder {
  return { ...ladder, snoozeUntil: addDays(today, 7) };
}

// ─── Nunca dos seguidos ────────────────────────────────────────────────────

export type NeverTwice = { failedYesterday: boolean; failedTwice: boolean; daysWithoutTwo: number; recoveries: number };

/**
 * `status(día)`: "done", "failed" (tocaba y no se hizo), "open" (todavía se puede) o
 * null (ese día no cuenta). "Seguidos" son días que cuentan seguidos (en "Días
 * específicos", el lunes y el miércoles son seguidos). Las cifras solo suben:
 * `daysWithoutTwo` = días desde `from` (o desde el último doble fallo) sin dos
 * fallos seguidos; `recoveries` = fallos a los que les siguió un hecho.
 */
export function neverTwiceStats(status: (date: string) => "done" | "failed" | "open" | null, from: string, today: string): NeverTwice {
  let prev: "done" | "failed" | "open" | null = null;
  let prevPrev: "done" | "failed" | "open" | null = null;
  let recoveries = 0;
  let cleanFrom = from;
  let todayStatus: "done" | "failed" | "open" | null = null;
  for (let d = from; d <= today; d = addDays(d, 1)) {
    const s = status(d);
    if (d === today) todayStatus = s;
    if (s === null) continue;
    if (d === today) break;
    if (s === "done" && prev === "failed") recoveries++;
    if (s === "failed" && prev === "failed") cleanFrom = addDays(d, 1);
    prevPrev = prev;
    prev = s;
  }
  // Hoy: un fallo explícito que hace el segundo seguido también corta; un hecho recupera.
  if (todayStatus === "done" && prev === "failed") recoveries++;
  if (todayStatus === "failed" && prev === "failed") cleanFrom = addDays(today, 1);
  const daysWithoutTwo = from > today ? 0 : Math.max(0, diffDays(today, cleanFrom) + 1);
  return {
    failedYesterday: prev === "failed" && todayStatus !== null && todayStatus !== "done",
    failedTwice: prev === "failed" && prevPrev === "failed",
    daysWithoutTwo,
    recoveries,
  };
}

// ─── Atajos con los datos de un hábito ─────────────────────────────────────

type HabitForLadder = HabitRule & { id: string; archivedOn?: string | null; tracks?: PastTrack[] };

/** ¿Ese día está hecho? (con la meta actual del hábito: la del escalón si tiene `target`). */
export function ladderDoneFn(h: Pick<HabitRule, "target">, logs: LogMap): (date: string) => boolean {
  return (date) => logIsDone(h, logs[date]);
}

/**
 * Estado de cada día para "Nunca dos seguidos", con la misma regla que las cifras
 * (`habitDayMark`): hecho, fallado (tocaba y no se hizo), abierto o no cuenta. Los
 * días de pistas viejas se leen con la configuración que tenían.
 */
export function neverTwiceStatusFn(h: HabitForLadder, logs: LogMap, today: string): (date: string) => "done" | "failed" | "open" | null {
  return (iso) => {
    let mark;
    if (iso >= h.startDate) mark = habitDayMark(h, logs, iso, today);
    else {
      const t = h.tracks?.find((x) => x.startDate <= iso && iso <= x.endDate);
      if (!t) return null;
      const end = addDays(t.endDate, 1);
      mark = habitDayMark({ ...h, ...t, trackEnd: t.endDate, archivedOn: null }, logs, iso, end < today ? end : today);
    }
    return mark === "done" ? "done" : mark === "missed" ? "failed" : mark === "open" ? "open" : null;
  };
}

/** "Nunca dos seguidos" de un hábito, desde su primera pista. */
export function habitNeverTwice(h: HabitForLadder, logs: LogMap, today: string): NeverTwice {
  const from = h.tracks?.[0]?.startDate ?? h.startDate;
  return neverTwiceStats(neverTwiceStatusFn(h, logs, today), from, today);
}
