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
 *  - missed   rojo suave sin borde: tocaba y quedó sin marcar, o (en semanales)
 *             fallado en una semana que igual llegó a la meta
 *  - pending  hoy, toca y todavía no se marcó
 *  - idle     no toca, o no hace falta (en "X veces por semana")
 *  - before   antes de que empezara el hábito
 */
import { addDays, startOfWeek, weekday } from "./dates";

export type Frequency = "daily" | "weekdays" | "weekly";
export type LogStatus = "done" | "failed" | "skipped";
export type DayState = "done" | "partial" | "failed" | "skipped" | "missed" | "pending" | "idle" | "before";

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
    if (log.s === "skipped") return "skipped";
    if (isDone(h, log)) return "done";
    if (log.v > 0) return "partial";
  }
  if (!isScheduled(h, iso) || iso > today) return "idle";
  if (weekly) {
    const first = periodStart(h, iso);
    if (weekMet(h, logs, first)) return "idle";
    // Un día sin marcar solo cuenta como falla cuando la semana ya terminó.
    if (addDays(first, 6) >= today) return iso === today ? "pending" : "idle";
    return "missed";
  }
  return iso === today ? "pending" : "missed";
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
  return den === 0 ? 0 : Math.round((num / den) * 100);
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
 * semanales). Lo que está en curso solo cuenta si ya se logró.
 */
export function periodSummary(h: HabitRule, logs: LogMap, today: string) {
  let achieved = 0;
  let missed = 0;
  if (h.frequency === "weekly") {
    for (const w of weeks(h, today)) {
      if (weekNeed(h, w.first) === 0) continue;
      if (weekMet(h, logs, w.first)) achieved++;
      else if (!w.current) missed++;
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

/** Siguiente estado al tocar un día en la tarjeta: nada → hecho → fallado → salteado → nada. */
export function nextStatus(current: DayLog | undefined): LogStatus | null {
  if (!current || current.s === "none") return "done";
  if (current.s === "done") return "failed";
  if (current.s === "failed") return "skipped";
  return null;
}
