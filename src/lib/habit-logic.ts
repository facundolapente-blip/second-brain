/**
 * Reglas de los hábitos, sin base ni React: las usan el servidor y el cliente.
 * Están calibradas contra HabitNow (la app que usaba Facu) con su backup real:
 * mismas rachas y mismo puntaje.
 *
 * Cómo se lee un día:
 *  - done     verde, se hizo (en cantidad: llegó a la meta)
 *  - partial  hubo algo pero no llegó a la meta
 *  - failed   rojo con borde, fallado
 *  - skipped  amarillo, salteado (no corta la racha, pero tampoco suma)
 *  - unmarked amarillo suave: tocaba, el día ya pasó y quedó sin marcar
 *  - missed   rojo suave sin borde: (en semanales) fallado en una semana que
 *             igual llegó a la meta
 *  - pending  hoy, toca y todavía no está ni hecho ni fallado: blanco hasta que
 *             termine el día (un salteado de hoy también se ve así)
 *  - idle     no toca, o no hace falta (en "X veces por semana")
 *  - before   antes de que empezara el hábito
 */
import { addDays, startOfWeek, weekday } from "./dates";

export type Frequency = "daily" | "weekdays" | "weekly";
export type LogStatus = "done" | "failed" | "skipped";
export type DayState = "done" | "partial" | "failed" | "skipped" | "unmarked" | "missed" | "pending" | "idle" | "before";

export type HabitRule = {
  frequency: Frequency;
  weekdays: number[];
  timesPerWeek: number;
  target: number;
  startDate: string;
  /** Día en que arranca la semana para "X veces por semana": 1 = lunes, 0 = domingo. */
  weekStart: number;
};

/** `none` = el día solo tiene una nota, sin marca. */
export type DayLog = { s: LogStatus | "none"; v: number; n?: string };
/** Logs de un hábito por día ISO. */
export type LogMap = Record<string, DayLog>;

export const WEEKDAY_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** "Todos los días", "Lun, Mié, Vie", "3 veces a la semana" */
export function frequencyLabel(h: Pick<HabitRule, "frequency" | "weekdays" | "timesPerWeek">): string {
  if (h.frequency === "weekly") {
    return h.timesPerWeek === 1 ? "1 vez a la semana" : `${h.timesPerWeek} veces a la semana`;
  }
  if (h.frequency === "weekdays") {
    if (h.weekdays.length === 0) return "Sin días";
    if (h.weekdays.length === 7) return "Todos los días";
    return WEEKDAY_ORDER.filter((d) => h.weekdays.includes(d))
      .map((d) => WEEKDAY_SHORT[d])
      .join(", ");
  }
  return "Todos los días";
}

/** ¿Se puede marcar ese día? En "X veces por semana" cualquier día vale. */
export function isScheduled(h: HabitRule, iso: string): boolean {
  if (iso < h.startDate) return false;
  if (h.frequency === "weekdays") return h.weekdays.includes(weekday(iso));
  return true;
}

export function isDone(h: Pick<HabitRule, "target">, log: DayLog | undefined): boolean {
  if (!log) return false;
  if (log.s !== "done") return false;
  return log.v >= h.target;
}

// ─── Semanas (hábitos "X veces por semana") ─────────────────────────────────

/** Primer día de la semana del hábito que contiene a `iso`. */
export function periodStart(h: Pick<HabitRule, "weekStart">, iso: string): string {
  return startOfWeek(iso, h.weekStart);
}

/** Cuántas veces se hizo en la semana del día dado. */
export function weekDoneCount(h: HabitRule, logs: LogMap, iso: string): number {
  const first = periodStart(h, iso);
  let n = 0;
  for (let i = 0; i < 7; i++) if (isDone(h, logs[addDays(first, i)])) n++;
  return n;
}

/**
 * Meta de una semana. Los salteados no la bajan (así lo hace HabitNow); la
 * semana en que arrancó el hábito exige como mucho los días que tuvo.
 */
function weekNeed(h: HabitRule, first: string): number {
  let available = 0;
  for (let i = 0; i < 7; i++) if (addDays(first, i) >= h.startDate) available++;
  return Math.min(h.timesPerWeek, available);
}

function weekMet(h: HabitRule, logs: LogMap, first: string): boolean {
  return weekDoneCount(h, logs, first) >= weekNeed(h, first);
}

/** Recorre las semanas del hábito, de la primera a la actual. */
function* weeks(h: HabitRule, today: string) {
  const current = periodStart(h, today);
  for (let first = periodStart(h, h.startDate); first <= current; first = addDays(first, 7)) {
    yield { first, current: first === current };
  }
}

/**
 * ¿Aparece en la lista de ese día? Lo que toca, salvo un "X veces por semana" que
 * ya llegó a la meta con marcas de otros días: el resto de la semana no se muestra
 * (como en HabitNow). El día en que se marcó sigue apareciendo, como hecho.
 */
export function showsOn(h: HabitRule, logs: LogMap, iso: string): boolean {
  if (!isScheduled(h, iso)) return false;
  if (h.frequency !== "weekly" || logs[iso]) return true;
  return !weekMet(h, logs, periodStart(h, iso));
}

// ─── Estado de un día ───────────────────────────────────────────────────────

export function dayState(h: HabitRule, logs: LogMap, iso: string, today: string): DayState {
  if (iso < h.startDate) return "before";
  const log = logs[iso];
  const weekly = h.frequency === "weekly";
  if (log) {
    if (log.s === "failed") {
      // En semanales, un fallado de una semana que igual llegó a la meta se ve
      // suave: ese día no hacía falta.
      if (weekly && weekMet(h, logs, periodStart(h, iso))) return "missed";
      return "failed";
    }
    // Mientras el día no terminó, solo verde o rojo; lo demás queda en blanco.
    if (log.s === "skipped") return iso < today ? "skipped" : iso === today ? "pending" : "idle";
    if (isDone(h, log)) return "done";
    if (log.v > 0) return "partial";
  }
  if (!isScheduled(h, iso) || iso > today) return "idle";
  if (weekly) {
    const first = periodStart(h, iso);
    if (weekMet(h, logs, first)) return "idle";
    // Un día sin marcar solo cuenta como falla cuando la semana ya terminó.
    if (addDays(first, 6) >= today) return iso === today ? "pending" : "idle";
    return "unmarked";
  }
  return iso === today ? "pending" : "unmarked";
}

// ─── Rachas ─────────────────────────────────────────────────────────────────

/**
 * Racha actual. En diarios y días específicos cuenta días seguidos; en
 * semanales, semanas seguidas en las que se llegó a la meta. Lo que está en
 * curso (hoy sin marcar, la semana actual sin completar) no la corta; los
 * salteados no la cortan ni la suman.
 */
export function currentStreak(h: HabitRule, logs: LogMap, today: string): number {
  if (h.frequency === "weekly") {
    let n = 0;
    let first = periodStart(h, today);
    let isCurrent = true;
    while (addDays(first, 6) >= h.startDate) {
      if (weekMet(h, logs, first)) n++;
      else if (!isCurrent) break;
      isCurrent = false;
      first = addDays(first, -7);
    }
    return n;
  }

  let n = 0;
  for (let iso = today; iso >= h.startDate; iso = addDays(iso, -1)) {
    if (!isScheduled(h, iso)) continue;
    const log = logs[iso];
    if (isDone(h, log)) n++;
    else if (log?.s === "skipped") continue;
    else if (!(iso === today && log?.s !== "failed")) break;
  }
  return n;
}

export function bestStreak(h: HabitRule, logs: LogMap, today: string): number {
  let best = 0;
  let run = 0;
  if (h.frequency === "weekly") {
    for (const w of weeks(h, today)) {
      if (weekMet(h, logs, w.first)) run++;
      else if (!w.current) run = 0;
      best = Math.max(best, run);
    }
    return best;
  }
  for (let iso = h.startDate; iso <= today; iso = addDays(iso, 1)) {
    if (!isScheduled(h, iso)) continue;
    const log = logs[iso];
    if (isDone(h, log)) run++;
    else if (log?.s === "skipped") continue;
    else if (iso !== today || log?.s === "failed") run = 0;
    best = Math.max(best, run);
  }
  return best;
}

// ─── Estadísticas ───────────────────────────────────────────────────────────

/**
 * Puntaje de 0 a 100, igual que el de HabitNow (el % de cada tarjeta):
 *  - Semanales: promedio, semana por semana, de lo hecho sobre la meta (tope 1).
 *    La semana en curso entra solo si ya se cumplió.
 *  - Diarios y días específicos: días hechos sobre días que tocaban. Un
 *    salteado cuenta como no hecho; hoy entra solo si ya se hizo.
 */
export function habitScore(h: HabitRule, logs: LogMap, today: string): number {
  const { num, den } = scoreParts(h, logs, today);
  return den === 0 ? 0 : Math.round((num / den) * 100);
}

function scoreParts(h: HabitRule, logs: LogMap, today: string) {
  let num = 0;
  let den = 0;
  if (h.frequency === "weekly") {
    for (const w of weeks(h, today)) {
      const need = weekNeed(h, w.first);
      if (need === 0) continue;
      const ratio = Math.min(1, weekDoneCount(h, logs, w.first) / need);
      if (w.current && ratio < 1) continue;
      num += ratio;
      den++;
    }
  } else {
    for (let iso = h.startDate; iso <= today; iso = addDays(iso, 1)) {
      if (!isScheduled(h, iso)) continue;
      const done = isDone(h, logs[iso]);
      if (iso === today && !done) continue;
      if (done) num++;
      den++;
    }
  }
  return { num, den };
}

/** Veces hecho esta semana, este mes, este año y en total. */
export function doneCounts(h: HabitRule, logs: LogMap, today: string) {
  const first = periodStart(h, today);
  const out = { week: 0, month: 0, year: 0, total: 0 };
  for (const [d, l] of Object.entries(logs)) {
    if (!isDone(h, l)) continue;
    out.total++;
    if (d.startsWith(today.slice(0, 4))) out.year++;
    if (d.startsWith(today.slice(0, 7))) out.month++;
    if (d >= first && d <= today) out.week++;
  }
  return out;
}

export function totalDone(h: Pick<HabitRule, "target">, logs: LogMap): number {
  return Object.values(logs).filter((l) => isDone(h, l)).length;
}

/**
 * Períodos logrados contra incompletos (días en diarios, semanas en
 * semanales). Hoy sin marcar no cuenta; la semana en curso sí (igual que HabitNow).
 */
export function periodSummary(h: HabitRule, logs: LogMap, today: string) {
  let achieved = 0;
  let missed = 0;
  if (h.frequency === "weekly") {
    for (const w of weeks(h, today)) {
      if (weekNeed(h, w.first) === 0) continue;
      // Como HabitNow: la semana en curso sin completar ya cuenta como incompleta.
      if (weekMet(h, logs, w.first)) achieved++;
      else missed++;
    }
  } else {
    for (let iso = h.startDate; iso <= today; iso = addDays(iso, 1)) {
      if (!isScheduled(h, iso)) continue;
      if (isDone(h, logs[iso])) achieved++;
      else if (iso !== today) missed++;
    }
  }
  return { achieved, missed };
}

/** Metas del "Desafío de racha". En semanales se cuentan semanas; si no, días. */
export function streakMilestones(h: Pick<HabitRule, "frequency">): number[] {
  return h.frequency === "weekly" ? [1, 5, 15, 25, 50, 75, 100] : [3, 7, 15, 30, 60, 100, 200, 365];
}

/**
 * Siguiente estado al tocar un día (en Hoy y en la tarjeta): nada → hecho (tilde
 * verde) → fallado (cruz roja) → nada. Un día pasado que queda en nada se ve
 * amarillo. El salteado se elige desde la hoja del día.
 */
export function nextStatus(current: DayLog | undefined): LogStatus | null {
  if (!current || current.s === "none") return "done";
  if (current.s === "done") return "failed";
  return null;
}

// ─── Pistas ─────────────────────────────────────────────────────────────────

/** Una pista cerrada, con la configuración que tenía. */
export type PastTrack = Pick<HabitRule, "frequency" | "weekdays" | "timesPerWeek" | "weekStart" | "target"> & {
  startDate: string;
  endDate: string;
};

/** Qué pista se está mirando en el detalle: la actual, todas, o una vieja (índice). */
export type TrackView = "current" | "all" | number;

export type TrackStats = {
  score: number;
  streak: number;
  best: number;
  counts: { week: number; month: number; year: number; total: number };
  periods: { achieved: number; missed: number };
  /** Marcas que caen dentro de lo que se está mirando. */
  logs: LogMap;
  /** Estado de un día según la pista a la que pertenece. */
  stateOf: (iso: string) => DayState;
  from: string;
};

function pick(logs: LogMap, from: string, to: string | null): LogMap {
  const out: LogMap = {};
  for (const [d, l] of Object.entries(logs)) if (d >= from && (to === null || d <= to)) out[d] = l;
  return out;
}

function trackRule(h: HabitRule, t: PastTrack): HabitRule {
  return { ...h, ...t };
}

/** Estadísticas de la pista actual, de una vieja o de todas juntas. */
export function trackStats(
  h: HabitRule,
  tracks: PastTrack[],
  allLogs: LogMap,
  today: string,
  view: TrackView,
): TrackStats {
  if (view === "current" || (typeof view === "number" && !tracks[view])) {
    const logs = pick(allLogs, h.startDate, null);
    return {
      score: habitScore(h, logs, today),
      streak: currentStreak(h, logs, today),
      best: bestStreak(h, logs, today),
      counts: doneCounts(h, logs, today),
      periods: periodSummary(h, logs, today),
      logs,
      stateOf: (iso) => dayState(h, logs, iso, today),
      from: h.startDate,
    };
  }
  if (typeof view === "number") {
    const t = tracks[view];
    const r = trackRule(h, t);
    const logs = pick(allLogs, t.startDate, t.endDate);
    return {
      score: habitScore(r, logs, t.endDate),
      streak: currentStreak(r, logs, t.endDate),
      best: bestStreak(r, logs, t.endDate),
      counts: doneCounts(r, logs, today),
      periods: periodSummary(r, logs, t.endDate),
      logs,
      stateOf: (iso) => (iso > t.endDate ? "idle" : dayState(r, logs, iso, t.endDate)),
      from: t.startDate,
    };
  }

  // Todas: cada pista se evalúa con su propia configuración y se suman.
  const parts = [
    ...tracks.map((t) => ({ r: trackRule(h, t), end: t.endDate })),
    { r: h, end: today },
  ];
  let num = 0;
  let den = 0;
  let best = 0;
  const periods = { achieved: 0, missed: 0 };
  for (const { r, end } of parts) {
    const logs = pick(allLogs, r.startDate, end);
    const sp = scoreParts(r, logs, end);
    num += sp.num;
    den += sp.den;
    best = Math.max(best, bestStreak(r, logs, end));
    const ps = periodSummary(r, logs, end);
    periods.achieved += ps.achieved;
    periods.missed += ps.missed;
  }
  const current = pick(allLogs, h.startDate, null);
  return {
    score: den === 0 ? 0 : Math.round((num / den) * 100),
    streak: currentStreak(h, current, today),
    best,
    counts: doneCounts(h, allLogs, today),
    periods,
    logs: allLogs,
    stateOf: (iso) => {
      if (iso >= h.startDate) return dayState(h, current, iso, today);
      const t = tracks.find((x) => iso >= x.startDate && iso <= x.endDate);
      if (!t) return "before";
      return dayState(trackRule(h, t), pick(allLogs, t.startDate, t.endDate), iso, t.endDate);
    },
    from: tracks[0]?.startDate ?? h.startDate,
  };
}

// ─── Marcas compactas (para mandar al navegador) ────────────────────────────

/**
 * Las marcas de un hábito en una cadena de un carácter por día desde `from`
 * ("." sin marca, d hecho, f fallado, s salteado, o solo nota) más los valores
 * que no son 1 y las notas. Pasa de ~50 bytes por marca a ~1: Hábitos carga
 * mucho más rápido en el celular.
 */
export type PackedLogs = { from: string; s: string; v?: Record<number, number>; n?: Record<number, string> };
export type PackedLogMap = Record<string, PackedLogs | null>;

const CODE: Record<string, string> = { done: "d", failed: "f", skipped: "s", none: "o" };
const DECODE: Record<string, DayLog["s"]> = { d: "done", f: "failed", s: "skipped", o: "none" };

export function packLogs(m: LogMap): PackedLogs | null {
  const dates = Object.keys(m).sort();
  if (dates.length === 0) return null;
  const from = dates[0];
  const len = diffDaysUtc(dates.at(-1)!, from) + 1;
  const chars = Array<string>(len).fill(".");
  const v: Record<number, number> = {};
  const n: Record<number, string> = {};
  for (const d of dates) {
    const i = diffDaysUtc(d, from);
    const log = m[d];
    chars[i] = CODE[log.s] ?? ".";
    if (log.v !== 1) v[i] = log.v;
    if (log.n) n[i] = log.n;
  }
  const out: PackedLogs = { from, s: chars.join("") };
  if (Object.keys(v).length) out.v = v;
  if (Object.keys(n).length) out.n = n;
  return out;
}

export function unpackLogs(p: PackedLogs | null | undefined): LogMap {
  const out: LogMap = {};
  if (!p) return out;
  for (let i = 0; i < p.s.length; i++) {
    const c = p.s[i];
    if (c === ".") continue;
    const log: DayLog = { s: DECODE[c] ?? "done", v: p.v?.[i] ?? 1 };
    if (p.n?.[i]) log.n = p.n[i];
    out[addDays(p.from, i)] = log;
  }
  return out;
}

export function packAll(logs: Record<string, LogMap>): PackedLogMap {
  return Object.fromEntries(Object.entries(logs).map(([id, m]) => [id, packLogs(m)]));
}

export function unpackAll(p: PackedLogMap): Record<string, LogMap> {
  return Object.fromEntries(Object.entries(p).map(([id, m]) => [id, unpackLogs(m)]));
}

function diffDaysUtc(a: string, b: string) {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
}

// ─── Días limpios (hábitos de dejar algo) ───────────────────────────────────

/**
 * Para un hábito de dejar algo (No fumar): días seguidos sin un "fallado"
 * hasta hoy, y el récord. Empieza a contar desde el inicio de la pista.
 */
export function cleanDays(h: Pick<HabitRule, "startDate">, logs: LogMap, today: string): { current: number; best: number } {
  const fails = Object.entries(logs)
    .filter(([d, l]) => l.s === "failed" && d >= h.startDate && d <= today)
    .map(([d]) => d)
    .sort();
  let best = 0;
  let from = h.startDate;
  for (const f of fails) {
    best = Math.max(best, diffDaysUtc(f, from));
    from = addDays(f, 1);
  }
  const current = Math.max(0, diffDaysUtc(today, from) + (from <= today ? 1 : 0));
  return { current, best: Math.max(best, current) };
}
