/**
 * Reglas de los hábitos, sin base ni React: las usan el servidor y el cliente.
 *
 * Cómo se lee un día (igual que en HabitNow):
 *  - done     verde, se hizo (en cantidad: llegó a la meta)
 *  - partial  hubo algo pero no llegó a la meta
 *  - failed   rojo con borde, marcado como fallado a propósito
 *  - skipped  amarillo, salteado (no rompe la racha ni baja el porcentaje)
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

/** Cuántas veces se hizo en la semana (lunes a domingo) del día dado. */
export function weekDoneCount(h: HabitRule, logs: LogMap, iso: string): number {
  const monday = startOfWeek(iso);
  let n = 0;
  for (let i = 0; i < 7; i++) if (isDone(h, logs[addDays(monday, i)])) n++;
  return n;
}

function weekSkippedCount(logs: LogMap, monday: string): number {
  let n = 0;
  for (let i = 0; i < 7; i++) if (logs[addDays(monday, i)]?.s === "skipped") n++;
  return n;
}

export function dayState(h: HabitRule, logs: LogMap, iso: string, today: string): DayState {
  if (iso < h.startDate) return "before";
  const log = logs[iso];
  if (log) {
    if (log.s === "failed") {
      // Como HabitNow: en semanales, un fallado de una semana que igual llegó a
      // la meta se ve suave (no hacía falta ese día).
      if (h.frequency === "weekly") {
        const need = h.timesPerWeek - weekSkippedCount(logs, startOfWeek(iso));
        if (weekDoneCount(h, logs, iso) >= need) return "missed";
      }
      return "failed";
    }
    if (log.s === "skipped") return "skipped";
    if (isDone(h, log)) return "done";
    if (log.v > 0) return "partial";
  }
  if (!isScheduled(h, iso) || iso > today) return "idle";
  if (iso === today) {
    if (h.frequency === "weekly" && weekDoneCount(h, logs, iso) >= h.timesPerWeek) return "idle";
    return "pending";
  }
  if (h.frequency === "weekly") {
    // En semanales, un día sin marcar solo cuenta como falla si la semana ya
    // terminó sin llegar a la meta.
    const monday = startOfWeek(iso);
    const sunday = addDays(monday, 6);
    if (sunday >= today) return "idle";
    const need = h.timesPerWeek - weekSkippedCount(logs, monday);
    return weekDoneCount(h, logs, iso) >= need ? "idle" : "missed";
  }
  return "missed";
}

/**
 * Racha actual. En diarios y días específicos cuenta días seguidos; en
 * semanales, semanas seguidas en las que se llegó a la meta. Hoy sin marcar no
 * corta la racha (todavía hay tiempo), y los salteados no la cortan ni la suman.
 */
export function currentStreak(h: HabitRule, logs: LogMap, today: string): number {
  return streakEndingAt(h, logs, today, true);
}

function streakEndingAt(h: HabitRule, logs: LogMap, end: string, graceForEnd: boolean): number {
  if (h.frequency === "weekly") {
    let monday = startOfWeek(end);
    let n = 0;
    let first = true;
    while (addDays(monday, 6) >= h.startDate) {
      const done = weekDoneCount(h, logs, monday);
      const need = Math.max(1, h.timesPerWeek - weekSkippedCount(logs, monday));
      if (done >= need) n++;
      else if (!(first && graceForEnd)) break;
      first = false;
      monday = addDays(monday, -7);
    }
    return n;
  }

  let n = 0;
  let iso = end;
  while (iso >= h.startDate) {
    if (isScheduled(h, iso)) {
      const log = logs[iso];
      if (isDone(h, log)) n++;
      else if (log?.s === "skipped") {
        /* no corta */
      } else {
        // El último día todavía está en curso: sin marcar o a medias no corta.
        const inProgress = iso === end && graceForEnd && log?.s !== "failed";
        if (!inProgress) break;
      }
    }
    iso = addDays(iso, -1);
  }
  return n;
}

export function bestStreak(h: HabitRule, logs: LogMap, today: string): number {
  if (h.frequency === "weekly") {
    let best = 0;
    let run = 0;
    let monday = startOfWeek(h.startDate);
    const last = startOfWeek(today);
    while (monday <= last) {
      const done = weekDoneCount(h, logs, monday);
      const need = Math.max(1, h.timesPerWeek - weekSkippedCount(logs, monday));
      if (done >= need) run++;
      else if (monday !== last) run = 0;
      best = Math.max(best, run);
      monday = addDays(monday, 7);
    }
    return best;
  }
  let best = 0;
  let run = 0;
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

/**
 * Porcentaje de cumplimiento desde que empezó. Los salteados no cuentan, y lo
 * que todavía está en curso (hoy sin marcar, la semana actual) no penaliza.
 */
export function completionRate(h: HabitRule, logs: LogMap, today: string): number | null {
  let num = 0;
  let den = 0;
  if (h.frequency === "weekly") {
    const current = startOfWeek(today);
    for (let monday = startOfWeek(h.startDate); monday <= current; monday = addDays(monday, 7)) {
      // Una semana que arranca a mitad de camino exige como mucho los días que tuvo.
      let available = 0;
      for (let i = 0; i < 7; i++) if (addDays(monday, i) >= h.startDate) available++;
      const need = Math.max(0, Math.min(h.timesPerWeek, available) - weekSkippedCount(logs, monday));
      const done = Math.min(weekDoneCount(h, logs, monday), need);
      num += done;
      den += monday === current ? done : need;
    }
  } else {
    for (let iso = h.startDate; iso <= today; iso = addDays(iso, 1)) {
      if (!isScheduled(h, iso)) continue;
      const log = logs[iso];
      if (log?.s === "skipped") continue;
      if (isDone(h, log)) {
        num++;
        den++;
      } else if (iso !== today || log?.s === "failed") den++;
    }
  }
  return den === 0 ? null : Math.round((num / den) * 100);
}

export function totalDone(h: Pick<HabitRule, "target">, logs: LogMap): number {
  return Object.values(logs).filter((l) => isDone(h, l)).length;
}

/** Siguiente estado al tocar un día en la tarjeta: nada → hecho → fallado → salteado → nada. */
export function nextStatus(current: DayLog | undefined): LogStatus | null {
  if (!current || current.s === "none") return "done";
  if (current.s === "done") return "failed";
  if (current.s === "failed") return "skipped";
  return null;
}

// ─── Estadísticas ───────────────────────────────────────────────────────────

/**
 * Puntaje de 0 a 100, como el de HabitNow: un promedio que pesa más lo
 * reciente. Cada día que toca (o cada semana, en semanales) mueve el puntaje
 * hacia 100 si se cumplió y hacia 0 si no. Media vida: ~20 días / ~4 semanas.
 */
export function habitScore(h: HabitRule, logs: LogMap, today: string): number {
  let score = 0;
  if (h.frequency === "weekly") {
    const m = Math.pow(0.5, 1 / 4);
    const current = startOfWeek(today);
    for (let monday = startOfWeek(h.startDate); monday <= current; monday = addDays(monday, 7)) {
      const need = Math.max(1, h.timesPerWeek - weekSkippedCount(logs, monday));
      const done = weekDoneCount(h, logs, monday);
      if (monday === current && done < need) break; // semana en curso: todavía no cuenta
      score = score * m + Math.min(1, done / need) * (1 - m);
    }
  } else {
    const m = Math.pow(0.5, 1 / 20);
    for (let iso = h.startDate; iso <= today; iso = addDays(iso, 1)) {
      if (!isScheduled(h, iso)) continue;
      const log = logs[iso];
      if (log?.s === "skipped") continue;
      const done = isDone(h, log);
      if (iso === today && !done) break;
      score = score * m + (done ? 1 : 0) * (1 - m);
    }
  }
  return Math.round(score * 100);
}

/** Veces hecho esta semana, este mes, este año y en total. */
export function doneCounts(h: HabitRule, logs: LogMap, today: string) {
  const monday = startOfWeek(today);
  const out = { week: 0, month: 0, year: 0, total: 0 };
  for (const [d, l] of Object.entries(logs)) {
    if (!isDone(h, l)) continue;
    out.total++;
    if (d.startsWith(today.slice(0, 4))) out.year++;
    if (d.startsWith(today.slice(0, 7))) out.month++;
    if (d >= monday && d <= today) out.week++;
  }
  return out;
}

/**
 * Períodos logrados contra incompletos (días en diarios, semanas en
 * semanales). Lo que está en curso no cuenta para ningún lado.
 */
export function periodSummary(h: HabitRule, logs: LogMap, today: string) {
  let achieved = 0;
  let missed = 0;
  if (h.frequency === "weekly") {
    const current = startOfWeek(today);
    for (let monday = startOfWeek(h.startDate); monday < current; monday = addDays(monday, 7)) {
      const need = Math.max(1, h.timesPerWeek - weekSkippedCount(logs, monday));
      if (weekDoneCount(h, logs, monday) >= need) achieved++;
      else missed++;
    }
    if (weekDoneCount(h, logs, today) >= h.timesPerWeek) achieved++;
  } else {
    for (let iso = h.startDate; iso <= today; iso = addDays(iso, 1)) {
      if (!isScheduled(h, iso)) continue;
      const log = logs[iso];
      if (log?.s === "skipped") continue;
      if (isDone(h, log)) achieved++;
      else if (iso !== today || log?.s === "failed") missed++;
    }
  }
  return { achieved, missed };
}

/** Metas del "Desafío de racha". En semanales se cuentan semanas; si no, días. */
export function streakMilestones(h: Pick<HabitRule, "frequency">): number[] {
  return h.frequency === "weekly"
    ? [1, 5, 15, 25, 50, 75, 100]
    : [3, 7, 15, 30, 60, 100, 200, 365];
}
