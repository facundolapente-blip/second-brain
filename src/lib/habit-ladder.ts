/**
 * Hábitos en construcción (pedido de Facu, 2026-11-17): un hábito se arma de a poco,
 * un paso por cada día por semana ("No fumar": 1 día, después 2, 3... hasta 7), y
 * "Nunca dos seguidos": en vez de mirar la racha rota, el día después de fallar es
 * "el que importa".
 *
 * Todo va **por semanas**: cada paso dice cuántos días por semana (`perWeek`) y cuántas
 * semanas seguidas hay que cumplirlo para subir (`weeks`). El paso **cambia el hábito
 * de verdad**: con `perWeek` el hábito pasa a ser de "N veces por semana" (7 = todos
 * los días) y con `target` (escaleras viejas de cantidad) cambia la meta; así la racha
 * y el puntaje se miden contra el paso y no contra la meta final. La app nunca sube
 * sola: pregunta.
 *
 * Lógica pura (sin base ni React): la usan el servidor, las pantallas y las pruebas.
 * Se guarda en `Habit.ladder` (Json) y `Habit.neverTwice`.
 */
import { addDays, diffDays, isISODate, startOfWeek } from "./dates.ts";
import { habitDayMark, isDone as logIsDone, type Frequency, type HabitRule, type LogMap, type PastTrack } from "./habit-logic.ts";

/**
 * perWeek: días por semana de este escalón (1 a 7; null = los que ya pide el hábito).
 * target: meta numérica del escalón en hábitos de cantidad. weeks: semanas seguidas
 * cumpliéndolo para poder subir (en la meta no se usa).
 */
export type LadderStep = { title: string; perWeek?: number | null; target?: number | null; weeks: number };

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
export const LADDER_WEEKS_MAX = 8;
/** Semanas seguidas que se proponen para subir de escalón. */
export const LADDER_DEFAULT_WEEKS = 2;

const int = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Math.round(Number(v)) : null);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * Un escalón válido o null. Acepta el formato viejo (`need` de `window` días): los de
 * 14 días sin meta numérica eran de frecuencia ("2 por semana" = 4 de 14) y pasan a
 * días por semana; los demás quedan con la frecuencia del hábito.
 */
export function cleanStep(raw: unknown): LadderStep | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const title = text(r.title, LADDER_TITLE_MAX);
  if (!title) return null;
  const t = int(r.target);
  const target = t !== null && t >= 1 ? Math.min(100_000, t) : null;
  let perWeek = int(r.perWeek);
  let weeks = int(r.weeks);
  if (weeks === null) {
    // Formato viejo.
    const need = int(r.need);
    const window = int(r.window);
    if (need === null || window === null || need < 1 || window < need) return null;
    weeks = window >= 14 ? 2 : 1;
    if (perWeek === null && window === 14 && target === null) perWeek = clamp(Math.round(need / 2), 1, 7);
  }
  const step: LadderStep = { title, weeks: clamp(weeks, 1, LADDER_WEEKS_MAX) };
  if (perWeek !== null && perWeek >= 1) step.perWeek = clamp(perWeek, 1, 7);
  if (target !== null) step.target = target;
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
  const goal = text(r.goal, LADDER_GOAL_MAX);
  const cur = int(r.current) ?? 0;
  const ladder: Ladder = {
    goal: goal || steps[steps.length - 1].title,
    steps,
    current: clamp(cur, 0, steps.length - 1),
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

// ─── Lo que pide cada escalón ──────────────────────────────────────────────

type WeeklyShape = { frequency: string; weekdays?: number[]; timesPerWeek?: number | null };

/** Días por semana que pide el hábito como está (todos los días = 7). */
export function habitPerWeek(h: WeeklyShape): number {
  if (h.frequency === "weekly") return clamp(h.timesPerWeek ?? 1, 1, 7);
  if (h.frequency === "weekdays") return clamp(h.weekdays?.length || 1, 1, 7);
  return 7;
}

/** Días por semana de un escalón (los del hábito si el escalón no dice). */
export function stepPerWeek(step: LadderStep, h: WeeklyShape): number {
  return step.perWeek ?? habitPerWeek(h);
}

export const daysText = (n: number) => (n >= 7 ? "todos los días" : `${n} ${n === 1 ? "día" : "días"} por semana`);
export const weeksText = (n: number) => (n === 1 ? "1 semana" : `${n} semanas seguidas`);

/** "3 días por semana · 2 semanas seguidas para subir" (o "· la meta"). */
export function stepRuleText(step: LadderStep, h: WeeklyShape, isLast: boolean): string {
  const days = daysText(stepPerWeek(step, h));
  const cap = days.charAt(0).toUpperCase() + days.slice(1);
  return isLast ? `${cap} · la meta` : `${cap} · ${weeksText(step.weeks)} para subir`;
}

/**
 * La configuración que el escalón le pone al hábito: con `perWeek` pasa a ser de
 * "N veces por semana" (7 = todos los días); con `target`, cambia la meta si el
 * hábito es de cantidad. Devuelve solo lo que cambia (null = nada).
 */
export function stepConfig(
  step: LadderStep,
  h: { frequency: string; timesPerWeek: number; target: number; unit?: string | null; weekdays?: number[] },
): { frequency?: Frequency; timesPerWeek?: number; weekdays?: number[]; target?: number } | null {
  const out: { frequency?: Frequency; timesPerWeek?: number; weekdays?: number[]; target?: number } = {};
  if (step.perWeek) {
    if (step.perWeek >= 7) {
      if (h.frequency !== "daily") {
        out.frequency = "daily";
        out.weekdays = [];
      }
    } else if (h.frequency !== "weekly" || h.timesPerWeek !== step.perWeek) {
      out.frequency = "weekly";
      out.timesPerWeek = step.perWeek;
      out.weekdays = [];
    }
  }
  const quantity = h.target > 1 || !!h.unit;
  if (step.target && quantity && step.target !== h.target) out.target = step.target;
  return Object.keys(out).length ? out : null;
}

// ─── El plan: de cuántos días a cuántos ────────────────────────────────────

/** Días por semana con que se arranca, a los que se quiere llegar y semanas seguidas para subir. */
export type LadderPlan = { from: number; to: number; weeks: number };

/** "1 día por semana", "3 días por semana", "Todos los días". */
export const stepTitle = (n: number) => (n >= 7 ? "Todos los días" : `${n} ${n === 1 ? "día" : "días"} por semana`);
/** El texto corto del paso: "4 días", "todos los días". */
export const daysShort = (n: number) => (n >= 7 ? "todos los días" : `${n} ${n === 1 ? "día" : "días"}`);

/** Un paso por cada número de días, de `from` a `to`. */
export function planSteps(from: number, to: number, weeks: number): LadderStep[] {
  const a = clamp(Math.round(from), 1, 7);
  const b = clamp(Math.round(to), a, 7);
  const w = clamp(Math.round(weeks), 1, LADDER_WEEKS_MAX);
  return Array.from({ length: b - a + 1 }, (_, i) => ({ title: stepTitle(a + i), perWeek: a + i, weeks: w }));
}

/** Hasta cuántos días se propone llegar: los que pide el hábito, al menos 2. */
export const planTarget = (h: WeeklyShape) => Math.max(2, habitPerWeek(h));

/**
 * El plan de una escalera, o null si no es de días por semana: las viejas de cantidad
 * o de texto siguen andando, numeradas 1, 2, 3 y con su título.
 */
export function ladderPlan(ladder: Pick<Ladder, "steps" | "current">): LadderPlan | null {
  const days: number[] = [];
  for (const s of ladder.steps) {
    if (!s.perWeek || s.target) return null;
    if (days.length && s.perWeek <= days[days.length - 1]) return null;
    days.push(s.perWeek);
  }
  const cur = ladder.steps[clamp(ladder.current, 0, ladder.steps.length - 1)];
  return { from: days[0], to: days[days.length - 1], weeks: cur.weeks };
}

/** Lo que se ve en cada barra: los días del paso o, sin plan, su número. */
export function stepLabels(ladder: Pick<Ladder, "steps" | "current">): number[] {
  return ladderPlan(ladder) ? ladder.steps.map((s) => s.perWeek as number) : ladder.steps.map((_, i) => i + 1);
}

/** Cómo se nombra un paso en una frase corta: "4 días" o, sin plan, su título. */
export function stepShort(ladder: Pick<Ladder, "steps" | "current">, i: number): string {
  const s = ladder.steps[i];
  return ladderPlan(ladder) ? daysShort(s.perWeek as number) : s.title;
}

/** Cómo se nombra un paso entero: "4 días por semana" o, sin plan, su título. */
export function stepLong(ladder: Pick<Ladder, "steps" | "current">, i: number): string {
  const s = ladder.steps[i];
  return ladderPlan(ladder) ? daysText(s.perWeek as number) : s.title;
}

/**
 * Los pasos con otro destino o con otras semanas: lo ya subido queda igual y se rearma
 * desde el paso actual (nunca para abajo), así el paso en el que está no cambia.
 */
export function replanSteps(ladder: Ladder, to: number, weeks: number): LadderStep[] {
  const cur = clamp(ladder.current, 0, ladder.steps.length - 1);
  const days = ladder.steps[cur].perWeek ?? 1;
  return [...ladder.steps.slice(0, cur), ...planSteps(days, Math.max(days, to), weeks)];
}

/** Lo que se puede cambiar en "Editar hábito": desde cuántos días, en cuántos está, hasta cuántos y semanas para subir. */
export type LadderReplan = { from: number; current: number; to: number; weeks: number };

/**
 * Lo que manda el formulario "Editar hábito" para cambiar el plan (JSON `{ from, current,
 * to, weeks }`; el viejo `{ to, weeks }` también sirve: desde y el paso quedan como
 * están), controlado contra la escalera: hace falta que tenga plan, 1 ≤ from ≤ current ≤
 * to ≤ 7 y `weeks` de 1 a `LADDER_WEEKS_MAX`. Vacío = sin cambios (plan null).
 */
export function parseReplan(raw: string | null | undefined, ladder: Ladder): { ok: true; plan: LadderReplan | null } | { ok: false; error: string } {
  if (!raw || !raw.trim()) return { ok: true, plan: null };
  const plan = ladderPlan(ladder);
  if (!plan) return { ok: false, error: "Esta construcción no tiene plan de días por semana." };
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return { ok: false, error: "No se pudo leer el plan." };
  }
  const r = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const n = (k: string) => (typeof r[k] === "number" && Number.isInteger(r[k]) ? (r[k] as number) : null);
  const curDays = ladder.steps[clamp(ladder.current, 0, ladder.steps.length - 1)].perWeek ?? 1;
  const from = r.from === undefined ? plan.from : n("from");
  const current = r.current === undefined ? curDays : n("current");
  const to = n("to");
  const weeks = n("weeks");
  if (from === null || from < 1 || from > 7) return { ok: false, error: "Podés empezar con entre 1 y 7 días por semana." };
  if (current === null || current < from || current > 7) return { ok: false, error: `El paso en el que estás va de ${from} a 7 días por semana.` };
  if (to === null || to < current || to > 7) return { ok: false, error: `Podés llegar a entre ${current} y 7 días por semana.` };
  if (weeks === null || weeks < 1 || weeks > LADDER_WEEKS_MAX) return { ok: false, error: `Las semanas para subir van de 1 a ${LADDER_WEEKS_MAX}.` };
  return { ok: true, plan: { from, current, to, weeks } };
}

/**
 * La escalera con el plan nuevo de "Editar hábito".
 * - Si no cambian ni desde cuántos días ni el paso en el que está, es `replanSteps`: lo ya
 *   subido queda igual (también los saltos) y el paso sigue con su cuenta.
 * - Si no, los pasos se rearman con `planSteps(from, to, weeks)` y la historia se lee por
 *   días: cada tramo pasa al paso nuevo con los mismos días; los tramos de días que ya no
 *   están en la escalera (por ejemplo, empezar en 3 en vez de 1) se dejan afuera.
 * - Si cambia el paso en el que está, como al subir o bajar: el tramo de ahora queda en
 *   la historia hasta ayer, el paso nuevo arranca hoy y se olvida el "todavía no".
 *   Si es el mismo, sigue la cuenta de semanas desde cuando arrancó.
 */
export function replanLadder(ladder: Ladder, p: LadderReplan, today: string): Ladder {
  const cur = clamp(ladder.current, 0, ladder.steps.length - 1);
  const curDays = ladder.steps[cur].perWeek ?? 1;
  const plan = ladderPlan(ladder);
  if (plan && p.from === plan.from && p.current === curDays) return { ...ladder, steps: replanSteps(ladder, p.to, p.weeks) };
  const steps = planSteps(p.from, Math.max(p.current, p.to), p.weeks);
  const indexOf = (days: number | null | undefined) => steps.findIndex((s) => s.perWeek === days);
  const daysOf = (i: number) => ladder.steps[clamp(i, 0, ladder.steps.length - 1)].perWeek;
  const history = (ladder.history ?? []).flatMap((h) => {
    const i = indexOf(daysOf(h.step));
    return i < 0 ? [] : [{ ...h, step: i }];
  });
  const current = Math.max(0, indexOf(p.current));
  if (p.current === curDays) return { ...ladder, steps, current, history };
  const before = indexOf(curDays);
  if (before >= 0 && today > ladder.stepStart) history.push({ step: before, from: ladder.stepStart, to: addDays(today, -1) });
  return { ...ladder, steps, current, stepStart: today, snoozeUntil: null, history };
}

// ─── Progreso del escalón, por semanas ─────────────────────────────────────

export type LadderWeek = {
  /** Primer día de la semana (según `weekStart` del hábito). */
  start: string;
  done: number;
  /** Días que pedía esa semana (la primera, si el escalón arrancó a mitad, prorrateada). */
  need: number;
  /** true cumplida · false no se cumplió · null es la semana en curso y todavía no llegó. */
  met: boolean | null;
};

export type StepProgress = {
  step: number;
  atGoal: boolean;
  /** Días por semana de este escalón. */
  perWeek: number;
  /** Semanas seguidas que pide para subir. */
  weeksNeeded: number;
  /** Semanas cumplidas seguidas hasta ahora (la en curso cuenta si ya se cumplió). */
  streak: number;
  weeksLeft: number;
  /** La semana en curso, día por día (future = todavía no llegó). */
  thisWeek: { done: number; need: number; days: { date: string; done: boolean; future: boolean }[] };
  weeks: LadderWeek[];
  ready: boolean;
  /** Las dos últimas semanas terminadas de este escalón no se cumplieron. */
  struggling: boolean;
};

export type ProgressOpts = { weekStart?: number; frequency: string; weekdays?: number[]; timesPerWeek?: number | null };

/** Semanas de [from, today] con lo hecho y lo que pedía cada una (`needOf(día)` = días de una semana completa). */
export function weeksBetween(from: string, today: string, isDone: (d: string) => boolean, needOf: (d: string) => number, weekStart = 1): LadderWeek[] {
  const out: LadderWeek[] = [];
  if (from > today) return out;
  for (let ws = startOfWeek(from, weekStart); ws <= today; ws = addDays(ws, 7)) {
    const we = addDays(ws, 6);
    const a = from > ws ? from : ws;
    let done = 0;
    for (let d = a; d <= we && d <= today; d = addDays(d, 1)) if (isDone(d)) done++;
    const full = needOf(a);
    // Semana que arrancó a mitad: lo que tocaba en los días que tuvo.
    const avail = diffDays(we, a) + 1;
    const need = avail >= 7 ? full : Math.max(1, Math.min(avail, Math.ceil((full * avail) / 7)));
    const current = we >= today;
    out.push({ start: ws, done, need, met: done >= need ? true : current ? null : false });
  }
  return out;
}

/**
 * Cómo va el escalón actual, por semanas desde que arrancó. `ready` = cumplió
 * `weeks` semanas seguidas (y no está en la meta ni pospuesto).
 */
export function stepProgress(ladder: Ladder, isDone: (date: string) => boolean, today: string, opts: ProgressOpts): StepProgress {
  const last = ladder.steps.length - 1;
  const idx = clamp(ladder.current, 0, last);
  const step = ladder.steps[idx];
  const perWeek = stepPerWeek(step, opts);
  const weekStart = opts.weekStart ?? 1;
  const weeks = weeksBetween(ladder.stepStart, today, isDone, () => perWeek, weekStart);
  let streak = 0;
  for (let i = weeks.length - 1; i >= 0; i--) {
    const w = weeks[i];
    if (w.met === null) continue;
    if (!w.met) break;
    streak++;
  }
  const ws = startOfWeek(today, weekStart);
  const days: { date: string; done: boolean; future: boolean }[] = [];
  // Los días antes de que arrancara el escalón no cuentan: se ven como los que todavía no llegaron.
  for (let d = ws; d <= addDays(ws, 6); d = addDays(d, 1)) days.push({ date: d, done: d <= today && d >= ladder.stepStart && isDone(d), future: d > today || d < ladder.stepStart });
  const cur = weeks.at(-1);
  const atGoal = idx === last;
  const snoozed = !!ladder.snoozeUntil && today <= ladder.snoozeUntil;
  const ended = weeks.filter((w) => w.met !== null && w.start < ws);
  return {
    step: idx,
    atGoal,
    perWeek,
    weeksNeeded: step.weeks,
    streak,
    weeksLeft: Math.max(0, step.weeks - streak),
    thisWeek: { done: cur?.done ?? 0, need: cur?.need ?? perWeek, days },
    weeks,
    ready: streak >= step.weeks && !atGoal && !snoozed,
    struggling: ended.length >= 2 && ended.slice(-2).every((w) => w.met === false),
  };
}

/**
 * Todas las semanas desde que empezó la escalera, con el escalón de cada una (para
 * el gráfico del camino): lo hecho contra lo que pedía el escalón de esa semana.
 */
export function ladderWeeks(ladder: Ladder, isDone: (d: string) => boolean, today: string, opts: ProgressOpts): (LadderWeek & { step: number })[] {
  const spans = [...(ladder.history ?? []), { step: ladder.current, from: ladder.stepStart, to: today }].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  const first = spans[0].from;
  const stepAt = (d: string) => {
    let s = spans[0].step;
    for (const x of spans) if (x.from <= d) s = x.step;
    return clamp(s, 0, ladder.steps.length - 1);
  };
  const needOf = (d: string) => stepPerWeek(ladder.steps[stepAt(d)], opts);
  return weeksBetween(first, today, isDone, needOf, opts.weekStart ?? 1).map((w) => {
    const a = first > w.start ? first : w.start;
    return { ...w, step: stepAt(a) };
  });
}

/** Semanas (redondeadas, al menos 1) que duró un tramo de la historia. */
export const spanWeeks = (from: string, to: string) => Math.max(1, Math.round((diffDays(to, from) + 1) / 7));

/**
 * El día en que se llegó a poder subir: hoy está listo y ayer no (para avisar una
 * sola vez, sin repetir todos los días).
 */
export function becameReady(ladder: Ladder, isDone: (date: string) => boolean, today: string, opts: ProgressOpts): boolean {
  if (!stepProgress(ladder, isDone, today, opts).ready) return false;
  const y = addDays(today, -1);
  return y < ladder.stepStart || !stepProgress(ladder, isDone, y, opts).ready;
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
  const next = clamp(to, 0, ladder.steps.length - 1);
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

/** "Una semana más": no ofrece subir hasta dentro de 7 días. */
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
