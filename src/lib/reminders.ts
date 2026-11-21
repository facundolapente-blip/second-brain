import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { addDays, diffDays, formatLong, fromDbDate, startOfWeek, toDbDate, todayISO, TZ, weekday } from "./dates";
import { getHabitsWithLogs } from "./habits";
import { dayProgress, unitLabel } from "./habit-logic";
import { habitNeverTwice, ladderDoneFn, stepLong, stepProgress } from "./habit-ladder";
import { getCardSummaries, getCategoryBudgets } from "./finance";
import { budgetState, monthShare } from "./budget-logic";
import { backupWarning } from "./backup";
import { wheelDue } from "./wheels";
import { getWrittenDays } from "./journal";
import { currentStreak as journalStreak } from "./journal-logic";
import { REVIEW_TAG } from "./review-logic";
import { moneyWhole } from "./format";
import { isFreeBlock, sortBlocks } from "./plan-logic";
import { sendPush, type PushResult } from "./push";
import {
  backupMessage,
  budgetsMessage,
  checkinMessage,
  customMessage,
  isCustomDue,
  dueHabits,
  habitMessage,
  journalMessage,
  priorityMessage,
  reviewMessage,
  targetDevices,
  wheelMessage,
  cardsMessage,
  deadlinesMessage,
  dueKinds,
  habitsMessage,
  ladderMessage,
  morningMessage,
  normalizePrefs,
  REMINDER_KINDS,
  type PushPayload,
  type ReminderKind,
  type ReminderPrefs,
} from "./reminder-logic";

/** Qué avisos van y a qué hora (JSON). */
export const REMINDERS_KEY = "avisos";

export async function getReminderPrefs(): Promise<ReminderPrefs> {
  const row = await prisma.appSetting.findUnique({ where: { key: REMINDERS_KEY } });
  try {
    return normalizePrefs(row ? JSON.parse(row.value) : null);
  } catch {
    return normalizePrefs(null);
  }
}

/** Hora actual en Montevideo (0 a 23). */
export function hourInMontevideo(now = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(now));
}

/** El texto de un aviso con los datos de hoy, o null si no hay nada que avisar. */
export async function buildReminder(kind: ReminderKind, today = todayISO(), opts: { commit?: boolean } = {}): Promise<PushPayload | null> {
  switch (kind) {
    case "escalones": {
      // Una vez por escalón: el recibo "escalon-<hábito>-<escalón>-<inicio>" queda al mandarlo.
      const { habits, logs } = await getHabitsWithLogs();
      const ready = habits.flatMap((h) => {
        const l = h.ladder;
        if (!l || h.archived) return [];
        const p = stepProgress(l, ladderDoneFn(h, logs[h.id] ?? {}), today, h);
        if (!p.ready) return [];
        return l.steps[p.step + 1] ? [{ h, id: `escalon-${h.id}-${p.step}-${l.stepStart}`, weeks: p.streak, next: stepLong(l, p.step + 1) }] : [];
      });
      if (!ready.length) return null;
      const seen = new Set((await prisma.actionReceipt.findMany({ where: { id: { in: ready.map((r) => r.id) } }, select: { id: true } })).map((r) => r.id));
      const fresh = ready.filter((r) => !seen.has(r.id));
      if (opts.commit && fresh.length) {
        await prisma.actionReceipt.createMany({ data: fresh.map((r) => ({ id: r.id, name: "aviso.escalon" })), skipDuplicates: true });
      }
      return ladderMessage(fresh.map((r) => ({ name: r.h.name, weeks: r.weeks, next: r.next })));
    }
    case "habitos": {
      // La misma cuenta que Hoy e Inicio (`dayProgress`, con `showsOn` y sin salteados).
      const [{ habits, logs }, manual] = await Promise.all([
        getHabitsWithLogs(),
        prisma.appSetting.findUnique({ where: { key: "habitos_orden_manual" } }),
      ]);
      const { done, total } = dayProgress(habits, logs, today, today);
      const open = habits
        .filter((h) => {
          const l = logs[h.id] ?? {};
          const p = dayProgress([h], { [h.id]: l }, today, today);
          // Sin marcar: los que cuentan hoy, no están hechos y no se marcaron como fallados.
          return p.total === 1 && p.done === 0 && l[today]?.s !== "failed";
        })
        // El orden de la lista de Hoy (`useHabitOrder`).
        .sort((a, b) =>
          manual ? a.order - b.order || a.name.localeCompare(b.name, "es") : b.priority - a.priority || a.name.localeCompare(b.name, "es"),
        )
        .map((h) => h.name);
      // "Nunca dos seguidos": los que fallaron ayer van primero ("Hoy importa").
      const important = habits.filter((h) => h.neverTwice && habitNeverTwice(h, logs[h.id] ?? {}, today).failedYesterday).map((h) => h.name);
      return habitsMessage(open, done, total, important);
    }
    case "deadlines": {
      const tasks = await prisma.planTask.findMany({
        where: { status: { not: "done" }, deadline: { not: null, lte: toDbDate(addDays(today, 1)) } },
        select: { title: true, deadline: true },
        orderBy: [{ deadline: "asc" }, { priority: "desc" }],
      });
      return deadlinesMessage(tasks.map((t) => ({ title: t.title, left: diffDays(fromDbDate(t.deadline!), today) })));
    }
    case "tarjetas": {
      // Como el aviso de Inicio: el último resumen con saldo sin pagar.
      const cards = await getCardSummaries();
      return cardsMessage(
        cards
          .filter((c) => c.last && c.last.leftCents > 0)
          .map((c) => ({ name: c.name, amount: moneyWhole(c.last!.leftCents, c.currency), left: diffDays(c.last!.due, today) })),
      );
    }
    case "checkin": {
      const row = await prisma.dailyCheckin.findUnique({ where: { date: toDbDate(today) }, select: { mood: true } });
      return row?.mood ? null : checkinMessage();
    }
    case "prioritaria": {
      const r = await prisma.dailyRitual.findUnique({ where: { day: toDbDate(today) } });
      if (r?.skipped) return null;
      if (r?.frogTitle) return r.frogDoneAt ? null : priorityMessage(r.frogTitle);
      // "Listo" sin elegir ninguna: ya lo decidió.
      return r?.completedAt ? null : priorityMessage(null);
    }
    case "journal": {
      const days = new Set(await getWrittenDays());
      if (days.has(today)) return null;
      return journalMessage(journalStreak(days, addDays(today, -1)));
    }
    case "presupuestos": {
      const month = today.slice(0, 7);
      const [{ budgets }, cats] = await Promise.all([
        getCategoryBudgets(month),
        prisma.category.findMany({ select: { id: true, name: true } }),
      ]);
      const names = new Map(cats.map((c) => [c.id, c.name]));
      const items = budgets.flatMap((b) => {
        const st = budgetState(b.spentCents, b.amountCents, monthShare(month, today));
        if (st !== "over" && st !== "near") return [];
        const pct = Math.round((b.spentCents / Math.max(1, b.amountCents)) * 100);
        const text = `${moneyWhole(b.spentCents, b.currency)} de ${moneyWhole(b.amountCents, b.currency)} (${pct} %)`;
        return [{ name: names.get(b.categoryId) ?? "?", state: st, text }];
      });
      return budgetsMessage(items);
    }
    case "revision": {
      const monday = startOfWeek(today);
      const done = await prisma.journalEntry.findFirst({
        where: { tags: { has: REVIEW_TAG }, date: { gte: toDbDate(monday), lte: toDbDate(addDays(monday, 6)) } },
        select: { id: true },
      });
      return done ? null : reviewMessage();
    }
    case "rueda": {
      const due = await wheelDue(today);
      return due ? wheelMessage(formatLong(due.last, today)) : null;
    }
    case "respaldo": {
      const w = await backupWarning();
      return w ? backupMessage(w) : null;
    }
    case "manana": {
      const blocks = await prisma.planBlock.findMany({
        where: { date: toDbDate(today), done: false },
        select: { title: true, startTime: true, sortKey: true },
      });
      return morningMessage(sortBlocks(blocks.filter((b) => !isFreeBlock(b))));
    }
  }
}

/** Cómo saldría cada aviso ahora (la vista previa de la pantalla de Avisos). */
export async function previewReminders(): Promise<Record<ReminderKind, PushPayload | null>> {
  const today = todayISO();
  const out = {} as Record<ReminderKind, PushPayload | null>;
  // De a uno: en la compu la base admite una sola conexión.
  for (const k of REMINDER_KINDS) out[k] = await buildReminder(k, today).catch(() => null);
  return out;
}

/** Avisos de cada hábito con aviso propio: los que hoy tocan y no están hechos (null = nada que avisar). */
export async function buildHabitReminders(ids: string[], today = todayISO()): Promise<Record<string, PushPayload | null>> {
  const out: Record<string, PushPayload | null> = {};
  if (!ids.length) return out;
  const { habits, logs } = await getHabitsWithLogs();
  for (const id of ids) {
    const h = habits.find((x) => x.id === id);
    if (!h) {
      out[id] = null;
      continue;
    }
    const l = logs[h.id] ?? {};
    const p = dayProgress([h], { [h.id]: l }, today, today);
    const log = l[today];
    if (p.total !== 1 || p.done === 1 || log?.s === "failed" || log?.s === "skipped") {
      out[id] = null;
      continue;
    }
    // En uno de cantidad ya empezado, cuánto falta ("Te faltan 2 vasos hoy").
    const left = h.unit && h.target > 1 && !h.parts ? Math.max(0, h.target - (log?.v ?? 0)) : 0;
    out[id] = habitMessage(h.id, h.name, left > 0 && log?.v ? unitLabel(left, h.unit) : null);
  }
  return out;
}

export type ReminderRun = {
  today: string;
  hour: number;
  results: { kind: string; status: "enviado" | "ya enviado" | "nada que avisar" | "falló" | "simulado"; payload?: PushPayload; push?: PushResult }[];
  skipped?: string;
};

/**
 * Lo que corre cada cron de avisos (uno por hora, ver vercel.json): manda los avisos
 * activos de hoy (por día de la semana) cuya hora llegó y que todavía no salieron, cada
 * uno a sus aparatos. Vercel puede saltearse una corrida o repetirla: cada aviso se anota
 * antes de mandarse con un recibo único por tipo y día (`ActionReceipt` "aviso-<tipo>-<día>",
 * "aviso-habito-<id>-<día>" para los de un hábito, "aviso-propio-<id>-<día>" para los propios), así sale una sola vez, y si la corrida
 * de su hora no llegó, lo manda la siguiente (hasta 2 horas después).
 * `dryRun`: calcula qué mandaría, sin mandar ni anotar nada (con `hour`, como si fuera esa hora).
 */
export async function runReminders(opts: { dryRun?: boolean; hour?: number } = {}): Promise<ReminderRun> {
  const today = todayISO();
  const hour = opts.dryRun && opts.hour !== undefined ? opts.hour : hourInMontevideo();
  const dow = weekday(today);
  const prefs = await getReminderPrefs();
  const kinds = dueKinds(prefs, hour, dow);
  const habitIds = dueHabits(prefs, hour, dow);
  const custom = prefs.custom.filter((c) => isCustomDue(c, hour, dow, today));
  const run: ReminderRun = { today, hour, results: [] };
  if (!kinds.length && !habitIds.length && !custom.length) return { ...run, skipped: "ningún aviso a esta hora" };
  const existing = (await prisma.pushSubscription.findMany({ select: { id: true } })).map((d) => d.id);
  if (!opts.dryRun && !existing.length) return { ...run, skipped: "ningún aparato con avisos" };

  const jobs: { key: string; receipt: string; ids: string[] | null; build: () => Promise<PushPayload | null> }[] = kinds.map((kind) => ({
    key: kind,
    receipt: `aviso-${kind}-${today}`,
    ids: targetDevices(prefs[kind], existing),
    build: () => buildReminder(kind, today, { commit: !opts.dryRun }),
  }));
  if (habitIds.length) {
    const built = await buildHabitReminders(habitIds, today);
    for (const id of habitIds)
      jobs.push({
        key: `habito:${id}`,
        receipt: `aviso-habito-${id}-${today}`,
        ids: targetDevices(prefs.habits[id], existing),
        build: async () => built[id] ?? null,
      });
  }

  for (const c of custom)
    jobs.push({
      key: `propio:${c.id}`,
      receipt: `aviso-propio-${c.id}-${today}`,
      ids: targetDevices(c, existing),
      build: async () => customMessage(c),
    });

  for (const job of jobs) {
    if (!opts.dryRun) {
      try {
        await prisma.actionReceipt.create({ data: { id: job.receipt, name: `aviso.${job.key}` } });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          run.results.push({ kind: job.key, status: "ya enviado" });
          continue;
        }
        throw e;
      }
    }
    const payload = await job.build();
    if (!payload) {
      run.results.push({ kind: job.key, status: "nada que avisar" });
      continue;
    }
    if (opts.dryRun) {
      run.results.push({ kind: job.key, status: "simulado", payload });
      continue;
    }
    const push = await sendPush(payload, { ids: job.ids ?? undefined });
    // No llegó a ningún aparato por un error pasajero: se saca el recibo y prueba la corrida siguiente.
    if (!push.sent && push.failed) {
      await prisma.actionReceipt.delete({ where: { id: job.receipt } }).catch(() => {});
      run.results.push({ kind: job.key, status: "falló", payload, push });
    } else {
      await prisma.actionReceipt.update({ where: { id: job.receipt }, data: { result: { sent: push.sent, removed: push.removed } } }).catch(() => {});
      run.results.push({ kind: job.key, status: "enviado", payload, push });
    }
  }
  // Los recibos de avisos viejos se van (los de las acciones se limpian en runOnce).
  if (!opts.dryRun) {
    await prisma.actionReceipt
      .deleteMany({ where: { name: { startsWith: "aviso." }, createdAt: { lt: new Date(Date.now() - 14 * 86_400_000) } } })
      .catch(() => {});
  }
  return run;
}
