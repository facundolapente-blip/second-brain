import "server-only";
import { prisma } from "./prisma";
import { addDays, fromDbDate, toDbDate } from "./dates";
import { frogCandidates, isRitualDone, ritualStreak, ritualWeek, type RitualDTO } from "./ritual-logic";

type RitualRow = NonNullable<Awaited<ReturnType<typeof prisma.dailyRitual.findFirst>>>;

export function ritualDTO(r: RitualRow): RitualDTO {
  return {
    day: fromDbDate(r.day),
    frogTaskId: r.frogTaskId,
    frogTitle: r.frogTitle,
    frogDoneAt: r.frogDoneAt?.toISOString() ?? null,
    skipped: r.skipped,
    completedAt: r.completedAt?.toISOString() ?? null,
  };
}

/**
 * Lo del ritual matutino para Inicio: el de hoy, las candidatas a tarea prioritaria y la
 * racha de rituales (lo demás sale de `getDashboard`).
 */
export async function getRitualData(today: string) {
  const [row, recent, tasks] = await Promise.all([
    prisma.dailyRitual.findUnique({ where: { day: toDbDate(today) } }),
    prisma.dailyRitual.findMany({ where: { day: { gte: toDbDate(addDays(today, -400)), lte: toDbDate(today) } } }),
    prisma.planTask.findMany({
      where: { status: { not: "done" } },
      select: { id: true, title: true, status: true, priority: true, deadline: true, category: { select: { id: true, name: true, color: true } } },
    }),
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

  return {
    ritual: row ? ritualDTO(row) : null,
    candidates,
    streak: ritualStreak(
      recent.filter((r) => isRitualDone(ritualDTO(r))).map((r) => fromDbDate(r.day)),
      today,
    ),
  };
}

export type RitualData = Awaited<ReturnType<typeof getRitualData>>;

/** Para la Revisión semanal: tareas prioritarias elegidas y hechas de lunes a domingo. */
export async function getRitualWeek(monday: string, sunday: string) {
  const rows = await prisma.dailyRitual.findMany({ where: { day: { gte: toDbDate(monday), lte: toDbDate(sunday) } } });
  return ritualWeek(rows.map(ritualDTO));
}
