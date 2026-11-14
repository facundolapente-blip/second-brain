import "server-only";
import { prisma } from "./prisma";
import { addDays, dayOfInstant, fromDbDate, toDbDate } from "./dates";
import { parseScores } from "./life-wheel";
import { frogCandidates, isRitualDone, ritualStreak, ritualWeek, type MissionResult, type RitualDTO, type WinsInput } from "./ritual-logic";

type RitualRow = NonNullable<Awaited<ReturnType<typeof prisma.dailyRitual.findFirst>>>;

export function ritualDTO(r: RitualRow): RitualDTO {
  return {
    day: fromDbDate(r.day),
    mission: r.mission,
    frogTaskId: r.frogTaskId,
    frogTitle: r.frogTitle,
    frogDoneAt: r.frogDoneAt?.toISOString() ?? null,
    missionResult: (r.missionResult as MissionResult | null) ?? null,
    skipped: r.skipped,
    completedAt: r.completedAt?.toISOString() ?? null,
  };
}

/**
 * Lo del ritual matutino para Inicio: el de hoy, las candidatas a sapo, la racha de rituales
 * y lo que hace falta para los logros recientes (lo demás sale de `getDashboard`).
 */
export async function getRitualData(today: string) {
  const since14 = new Date(Date.now() - 14 * 86_400_000);
  const [row, recent, tasks, krs, minors, dreams, wheels] = await Promise.all([
    prisma.dailyRitual.findUnique({ where: { day: toDbDate(today) } }),
    prisma.dailyRitual.findMany({ where: { day: { gte: toDbDate(addDays(today, -400)), lte: toDbDate(today) } } }),
    prisma.planTask.findMany({
      where: { status: { not: "done" } },
      select: { id: true, title: true, status: true, priority: true, deadline: true, category: { select: { id: true, name: true, color: true } } },
    }),
    prisma.planKeyResult.findMany({ where: { status: "done", updatedAt: { gte: since14 } }, select: { title: true, updatedAt: true } }),
    prisma.planMinorGoal.findMany({ where: { done: true, doneAt: { gte: since14 } }, select: { title: true, doneAt: true } }),
    prisma.planDream.findMany({ where: { done: true, doneAt: { gte: since14 } }, select: { title: true, doneAt: true } }),
    prisma.lifeWheel.findMany({ orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 2, select: { date: true, scores: true } }),
  ]);

  // Cuántas veces se pasó de semana cada tarea: los registros que dejan sus bloques al
  // cambiar de una semana que ya había empezado (`PlanBlockLog`).
  const blocks = tasks.length
    ? await prisma.planBlock.findMany({ where: { taskId: { in: tasks.map((t) => t.id) } }, select: { id: true, taskId: true } })
    : [];
  const logs = blocks.length
    ? await prisma.planBlockLog.groupBy({ by: ["blockId"], where: { blockId: { in: blocks.map((b) => b.id) } }, _count: { _all: true } })
    : [];
  const perBlock = new Map(logs.map((l) => [l.blockId, l._count._all]));
  const passes = new Map<string, number>();
  for (const b of blocks) if (b.taskId) passes.set(b.taskId, (passes.get(b.taskId) ?? 0) + (perBlock.get(b.id) ?? 0));

  const candidates = frogCandidates(
    tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      deadline: t.deadline ? fromDbDate(t.deadline) : null,
      passes: passes.get(t.id) ?? 0,
      category: t.category,
    })),
    today,
    3,
  );

  const goals: WinsInput["goals"] = [
    ...krs.map((k) => ({ title: k.title, kind: "kr" as const, at: k.updatedAt })),
    ...minors.map((m) => ({ title: m.title, kind: "minor" as const, at: m.doneAt! })),
    ...dreams.map((m) => ({ title: m.title, kind: "dream" as const, at: m.doneAt! })),
  ]
    .sort((a, b) => +b.at - +a.at)
    .map(({ title, kind, at }) => ({ title, kind, date: dayOfInstant(at) }));

  const [w, wPrev] = wheels;
  return {
    ritual: row ? ritualDTO(row) : null,
    candidates,
    streak: ritualStreak(
      recent.filter((r) => isRitualDone(ritualDTO(r))).map((r) => fromDbDate(r.day)),
      today,
    ),
    goals,
    wheel: w ? { date: fromDbDate(w.date), scores: parseScores(w.scores), prev: wPrev ? parseScores(wPrev.scores) : null } : null,
  };
}

export type RitualData = Awaited<ReturnType<typeof getRitualData>>;

/** Para la Revisión semanal: misiones cumplidas y sapos comidos de lunes a domingo. */
export async function getRitualWeek(monday: string, sunday: string) {
  const rows = await prisma.dailyRitual.findMany({ where: { day: { gte: toDbDate(monday), lte: toDbDate(sunday) } } });
  return ritualWeek(rows.map(ritualDTO));
}
