import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { addDays, diffDays, fromDbDate, toDbDate, todayISO, TZ } from "./dates";
import { getHabitsWithLogs } from "./habits";
import { dayProgress } from "./habit-logic";
import { getCardSummaries } from "./finance";
import { moneyWhole } from "./format";
import { isFreeBlock, sortBlocks } from "./plan-logic";
import { sendPush, type PushResult } from "./push";
import {
  cardsMessage,
  deadlinesMessage,
  dueKinds,
  habitsMessage,
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
export async function buildReminder(kind: ReminderKind, today = todayISO()): Promise<PushPayload | null> {
  switch (kind) {
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
      return habitsMessage(open, done, total);
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

export type ReminderRun = {
  today: string;
  hour: number;
  results: { kind: ReminderKind; status: "enviado" | "ya enviado" | "nada que avisar" | "falló" | "simulado"; payload?: PushPayload; push?: PushResult }[];
  skipped?: string;
};

/**
 * Lo que corre cada cron de avisos (uno por hora, ver vercel.json): manda los avisos
 * activos cuya hora llegó y que hoy todavía no salieron. Vercel puede saltearse una
 * corrida o repetirla: cada aviso se anota antes de mandarse con un recibo único por
 * tipo y día (`ActionReceipt` "aviso-<tipo>-<día>"), así sale una sola vez, y si la
 * corrida de su hora no llegó, lo manda la siguiente (hasta 2 horas después).
 * `dryRun`: calcula qué mandaría, sin mandar ni anotar nada (con `hour`, como si fuera esa hora).
 */
export async function runReminders(opts: { dryRun?: boolean; hour?: number } = {}): Promise<ReminderRun> {
  const today = todayISO();
  const hour = opts.dryRun && opts.hour !== undefined ? opts.hour : hourInMontevideo();
  const kinds = dueKinds(await getReminderPrefs(), hour);
  const run: ReminderRun = { today, hour, results: [] };
  if (!kinds.length) return { ...run, skipped: "ningún aviso a esta hora" };
  if (!opts.dryRun && !(await prisma.pushSubscription.count())) return { ...run, skipped: "ningún aparato con avisos" };

  for (const kind of kinds) {
    const receipt = `aviso-${kind}-${today}`;
    if (!opts.dryRun) {
      try {
        await prisma.actionReceipt.create({ data: { id: receipt, name: `aviso.${kind}` } });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          run.results.push({ kind, status: "ya enviado" });
          continue;
        }
        throw e;
      }
    }
    const payload = await buildReminder(kind, today);
    if (!payload) {
      run.results.push({ kind, status: "nada que avisar" });
      continue;
    }
    if (opts.dryRun) {
      run.results.push({ kind, status: "simulado", payload });
      continue;
    }
    const push = await sendPush(payload);
    // No llegó a ningún aparato por un error pasajero: se saca el recibo y prueba la corrida siguiente.
    if (!push.sent && push.failed) {
      await prisma.actionReceipt.delete({ where: { id: receipt } }).catch(() => {});
      run.results.push({ kind, status: "falló", payload, push });
    } else {
      await prisma.actionReceipt.update({ where: { id: receipt }, data: { result: { sent: push.sent, removed: push.removed } } }).catch(() => {});
      run.results.push({ kind, status: "enviado", payload, push });
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
