import "server-only";
import { prisma } from "./prisma";
import { addDays, fromDbDate, toDbDate, startOfWeek } from "./dates";
import { getHabitsWithLogs } from "./habits";
import { habitDayMark } from "./habit-logic";
import { isEmptyEntry, wordCount } from "./journal-logic";
import { REVIEW_TEMPLATE } from "./review-logic";
import { toCents } from "./finance-logic";
import { NOT_ADJUSTMENT, PERSONAL } from "./finance";
import { getRates, toUyu } from "./fx";
import { isFreeBlock } from "./plan-logic";

/**
 * Una fila por día con lo que pasó en los cuatro módulos más el check-in.
 * La base de la revisión semanal y del análisis: todo lo que se cruza sale de acá.
 */
export type DayMetrics = {
  date: string;
  habitsDone: number;
  habitsDue: number;
  /** Por hábito: true hecho, false tocaba y no se hizo, ausente = no tocaba. */
  habit: Record<string, boolean>;
  /**
   * Los que cuentan como no hechos pero todavía se pueden hacer (hoy sin marcar,
   * un "X veces por semana" en una semana que no terminó): no son un "no" todavía.
   */
  habitOpen: string[];
  /** Del check-in; si no hay, el ánimo de la entrada del journal. */
  mood: number | null;
  energy: number | null;
  stress: number | null;
  sleepMin: number | null;
  weightG: number | null;
  steps: number | null;
  /** Estrés promedio que midió el reloj (1 a 99); aparte del estrés del check-in. */
  stressWatch: number | null;
  /** Pulso mínimo del día (reloj), en latidos por minuto. */
  hrMin: number | null;
  /** Pulso máximo del día (reloj). */
  hrMax: number | null;
  /** Distancia del día (reloj), en metros. */
  distanceM: number | null;
  /** Calorías de actividad del día (reloj). */
  activeKcal: number | null;
  wrote: boolean;
  words: number;
  /** En pesos uruguayos (los dólares, con la cotización del día). */
  spentCents: number;
  incomeCents: number;
  blocksDone: number;
  blocksTotal: number;
};

export type HabitRef = {
  id: string;
  name: string;
  icon: string;
  color: string;
  /** "X veces por semana": la meta de cada semana (null si es diario o de días fijos). */
  weeklyTarget: number | null;
  startDate: string;
  /** Día en que se archivó (después ya no cuenta); null si está activo. */
  endDate: string | null;
};

/**
 * Cuánto se hizo un hábito en un período (revisión, resumen). Los "X veces por
 * semana" se miden contra su meta de cada semana (una semana cortada por el
 * período cuenta la parte que le toca); el resto, contra los días que tocaban.
 * `done` son las veces hechas; `pct` no pasa de 100 aunque una semana se pase.
 */
export function habitTotals(h: HabitRef, days: DayMetrics[]): { done: number; due: number; pct: number | null } {
  if (!h.weeklyTarget) {
    let done = 0;
    let due = 0;
    for (const d of days) {
      if (!(h.id in d.habit)) continue;
      due++;
      if (d.habit[h.id]) done++;
    }
    return { done, due, pct: due ? Math.round((done / due) * 100) : null };
  }
  const weeks = new Map<string, { done: number; days: number }>();
  for (const d of days) {
    if (d.date < h.startDate || (h.endDate && d.date > h.endDate)) continue;
    const w = startOfWeek(d.date);
    const x = weeks.get(w) ?? { done: 0, days: 0 };
    x.days++;
    if (d.habit[h.id]) x.done++;
    weeks.set(w, x);
  }
  let done = 0;
  let due = 0;
  let hit = 0;
  for (const x of weeks.values()) {
    // Semana entera: la meta; cortada por el período: la parte proporcional (al menos 1).
    const target = x.days >= 7 ? h.weeklyTarget : Math.max(1, Math.round((h.weeklyTarget * x.days) / 7));
    done += x.done;
    due += target;
    hit += Math.min(x.done, target);
  }
  return { done, due, pct: due ? Math.round((hit / due) * 100) : null };
}

export async function getDailyMetrics(from: string, to: string): Promise<{ days: DayMetrics[]; habits: HabitRef[] }> {
  const range = { gte: toDbDate(from), lte: toDbDate(to) };
  const [active, archived, checkins, entries, accounts, txs, blocks, blockLogs] = await Promise.all([
    getHabitsWithLogs(),
    // Los archivados también: cuentan en los días antes de archivarse (si no, desaparecen del pasado).
    getHabitsWithLogs({ archived: true }),
    prisma.dailyCheckin.findMany({ where: { date: range } }),
    prisma.journalEntry.findMany({
      where: { date: range },
      select: { date: true, title: true, body: true, mood: true, tags: true, _count: { select: { attachments: true } } },
    }),
    prisma.account.findMany({ select: { id: true, currency: true } }),
    prisma.transaction.findMany({
      where: { date: range, kind: { in: ["expense", "income"] }, ...NOT_ADJUSTMENT, ...PERSONAL },
      select: { date: true, kind: true, amount: true, accountId: true, category: { select: { kind: true } } },
    }),
    prisma.planBlock.findMany({ where: { date: range }, select: { date: true, title: true, done: true } }),
    // Tarjetas que se pasaron a otra semana: cuentan en el día donde estaban.
    prisma.planBlockLog.findMany({ where: { date: range }, select: { date: true, title: true, done: true } }),
  ]);
  const rates = await getRates();
  const today = active.today;
  const habits = [...active.habits, ...archived.habits];
  const logs = { ...archived.logs, ...active.logs };

  const currencyOf = new Map(accounts.map((a) => [a.id, a.currency]));
  const byDate = new Map<string, DayMetrics>();
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const m: DayMetrics = {
      date: d,
      habitsDone: 0,
      habitsDue: 0,
      habit: {},
      habitOpen: [],
      mood: null,
      energy: null,
      stress: null,
      sleepMin: null,
      weightG: null,
      steps: null,
      stressWatch: null,
      hrMin: null,
      hrMax: null,
      distanceM: null,
      activeKcal: null,
      wrote: false,
      words: 0,
      spentCents: 0,
      incomeCents: 0,
      blocksDone: 0,
      blocksTotal: 0,
    };
    if (d <= today) {
      // La misma regla que la lista de Hoy y que Inicio (`habitDayMark` = `dayProgress`).
      for (const h of habits) {
        const mark = habitDayMark(h, logs[h.id] ?? {}, d, today);
        if (!mark) continue;
        m.habitsDue++;
        m.habit[h.id] = mark === "done";
        if (mark === "done") m.habitsDone++;
        if (mark === "open") m.habitOpen.push(h.id);
      }
    }
    byDate.set(d, m);
  }

  for (const c of checkins) {
    const m = byDate.get(fromDbDate(c.date));
    if (!m) continue;
    m.mood = c.mood;
    m.energy = c.energy;
    m.stress = c.stress;
    m.sleepMin = c.sleepMin;
    m.weightG = c.weightG;
    m.steps = c.steps;
    m.stressWatch = c.stressScore;
    m.hrMin = c.hrMin;
    m.hrMax = c.hrMax;
    m.distanceM = c.distanceM;
    m.activeKcal = c.activeKcal;
  }
  for (const e of entries) {
    const m = byDate.get(fromDbDate(e.date));
    if (!m) continue;
    if (m.mood === null && e.mood) m.mood = e.mood;
    // Escribiste = el criterio del Journal (título, texto, etiquetas o fotos). La
    // reflexión semanal con las preguntas sin tocar no cuenta ni suma palabras.
    if (e.body.trim() === REVIEW_TEMPLATE.trim()) continue;
    if (!isEmptyEntry(e) || e._count.attachments > 0) m.wrote = true;
    m.words += wordCount(e.body) + wordCount(e.title ?? "");
  }
  for (const t of txs) {
    const m = byDate.get(fromDbDate(t.date));
    if (!m) continue;
    const cents = toUyu(toCents(t.amount), currencyOf.get(t.accountId) ?? "UYU", rates);
    if (t.kind === "expense") m.spentCents += cents;
    else if (t.category?.kind === "expense") m.spentCents -= cents; // reintegro
    else m.incomeCents += cents;
  }
  for (const b of [...blocks, ...blockLogs]) {
    const m = byDate.get(fromDbDate(b.date));
    if (!m || isFreeBlock(b)) continue;
    m.blocksTotal++;
    if (b.done) m.blocksDone++;
  }

  return {
    days: [...byDate.values()],
    habits: habits.map((h) => ({
      id: h.id,
      name: h.name,
      icon: h.icon,
      color: h.color,
      weeklyTarget: h.frequency === "weekly" ? h.timesPerWeek : null,
      startDate: h.startDate,
      endDate: h.archivedOn,
    })),
  };
}
