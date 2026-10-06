import "server-only";
import { prisma } from "./prisma";
import { addDays, fromDbDate, toDbDate } from "./dates";
import { getHabitsWithLogs } from "./habits";
import { dayState, type DayState } from "./habit-logic";
import { wordCount } from "./journal-logic";
import { toCents } from "./finance-logic";
import { NOT_ADJUSTMENT } from "./finance";
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
  /** Del check-in; si no hay, el ánimo de la entrada del journal. */
  mood: number | null;
  energy: number | null;
  stress: number | null;
  sleepMin: number | null;
  weightG: number | null;
  steps: number | null;
  wrote: boolean;
  words: number;
  /** En pesos uruguayos (los dólares, con la cotización del día). */
  spentCents: number;
  incomeCents: number;
  blocksDone: number;
  blocksTotal: number;
};

export type HabitRef = { id: string; name: string; icon: string; color: string };

const DUE: DayState[] = ["done", "partial", "failed", "unmarked", "missed", "pending"];

export async function getDailyMetrics(from: string, to: string): Promise<{ days: DayMetrics[]; habits: HabitRef[] }> {
  const range = { gte: toDbDate(from), lte: toDbDate(to) };
  const [{ habits, logs, today }, checkins, entries, accounts, txs, blocks, blockLogs] = await Promise.all([
    getHabitsWithLogs(),
    prisma.dailyCheckin.findMany({ where: { date: range } }),
    prisma.journalEntry.findMany({ where: { date: range }, select: { date: true, title: true, body: true, mood: true } }),
    prisma.account.findMany({ select: { id: true, currency: true } }),
    prisma.transaction.findMany({
      where: { date: range, kind: { in: ["expense", "income"] }, ...NOT_ADJUSTMENT },
      select: { date: true, kind: true, amount: true, accountId: true, category: { select: { kind: true } } },
    }),
    prisma.planBlock.findMany({ where: { date: range }, select: { date: true, title: true, done: true } }),
    // Tarjetas que se pasaron a otra semana: cuentan en el día donde estaban.
    prisma.planBlockLog.findMany({ where: { date: range }, select: { date: true, title: true, done: true } }),
  ]);
  const rates = await getRates();

  const currencyOf = new Map(accounts.map((a) => [a.id, a.currency]));
  const byDate = new Map<string, DayMetrics>();
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const m: DayMetrics = {
      date: d,
      habitsDone: 0,
      habitsDue: 0,
      habit: {},
      mood: null,
      energy: null,
      stress: null,
      sleepMin: null,
      weightG: null,
      steps: null,
      wrote: false,
      words: 0,
      spentCents: 0,
      incomeCents: 0,
      blocksDone: 0,
      blocksTotal: 0,
    };
    if (d <= today) {
      for (const h of habits) {
        const s = dayState(h, logs[h.id], d, today);
        if (!DUE.includes(s)) continue;
        // Hoy sin marcar todavía no es un "no".
        if (s === "pending") continue;
        m.habitsDue++;
        m.habit[h.id] = s === "done";
        if (s === "done") m.habitsDone++;
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
  }
  for (const e of entries) {
    const m = byDate.get(fromDbDate(e.date));
    if (!m) continue;
    const w = wordCount(e.body) + wordCount(e.title ?? "");
    if (w > 0) m.wrote = true;
    m.words += w;
    if (m.mood === null && e.mood) m.mood = e.mood;
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
    habits: habits.map((h) => ({ id: h.id, name: h.name, icon: h.icon, color: h.color })),
  };
}
