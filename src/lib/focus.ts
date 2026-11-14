import "server-only";
import { prisma } from "./prisma";
import { addDays, fromDbDate, startOfWeek, todayISO, toDbDate } from "./dates";
import { FOCUS_SETTINGS_KEY, parseFocusSettings, type FocusSettings } from "./focus-logic";
import { isFreeBlock } from "./plan-logic";

export type FocusSessionDTO = {
  id: string;
  day: string;
  startedAt: string;
  endedAt: string;
  minutes: number;
  note: string | null;
  taskId: string | null;
  blockId: string | null;
  title: string | null;
};

export type FocusStep = { id: string; title: string; done: boolean };
/** Algo en qué enfocarse: una tarea abierta o un bloque de hoy. */
export type FocusTarget = { kind: "task" | "block"; id: string; title: string; taskId: string | null; steps: FocusStep[] };

export async function getFocusSettings(): Promise<FocusSettings> {
  const row = await prisma.appSetting.findUnique({ where: { key: FOCUS_SETTINGS_KEY } });
  return parseFocusSettings(row?.value);
}

/** Todo lo de la pantalla de Enfoque: tiempos, sesiones de los últimos `days` días (y la semana), tareas y bloques de hoy. */
export async function getFocusPage(days = 14) {
  const today = todayISO();
  const monday = startOfWeek(today);
  const from = [addDays(today, -(days - 1)), monday].sort()[0];
  const [settings, rows, older, tasks, blocks] = await Promise.all([
    getFocusSettings(),
    prisma.focusSession.findMany({ where: { day: { gte: toDbDate(from) } }, orderBy: [{ startedAt: "desc" }, { id: "desc" }] }),
    prisma.focusSession.count({ where: { day: { lt: toDbDate(from) } } }),
    prisma.planTask.findMany({
      where: { status: { not: "done" } },
      orderBy: [{ status: "asc" }, { deadline: { sort: "asc", nulls: "last" } }, { title: "asc" }],
      select: { id: true, title: true, status: true, subtasks: { orderBy: { order: "asc" }, select: { id: true, title: true, done: true } } },
      take: 200,
    }),
    prisma.planBlock.findMany({
      where: { date: toDbDate(today), done: false },
      orderBy: [{ startTime: { sort: "asc", nulls: "first" } }, { sortKey: "asc" }],
      select: { id: true, title: true, taskId: true, startTime: true },
    }),
  ]);
  const sessions: FocusSessionDTO[] = rows.map((r) => ({
    id: r.id,
    day: fromDbDate(r.day),
    startedAt: r.startedAt.toISOString(),
    endedAt: r.endedAt.toISOString(),
    minutes: r.minutes,
    note: r.note,
    taskId: r.taskId,
    blockId: r.blockId,
    title: r.title,
  }));
  // En curso primero (como en el tablero), después lo que vence antes.
  const rank: Record<string, number> = { doing: 0, todo: 1, backlog: 2 };
  const taskSteps = new Map(tasks.map((t) => [t.id, t.subtasks]));
  const targets: FocusTarget[] = [
    ...blocks.filter((b) => !isFreeBlock(b)).map((b) => ({ kind: "block" as const, id: b.id, title: b.title, taskId: b.taskId, steps: (b.taskId && taskSteps.get(b.taskId)) || [] })),
    ...[...tasks].sort((a, b) => (rank[a.status] ?? 3) - (rank[b.status] ?? 3)).map((t) => ({ kind: "task" as const, id: t.id, title: t.title, taskId: t.id, steps: t.subtasks })),
  ];
  return { today, monday, days, settings, sessions, hasOlder: older > 0, targets };
}

export type FocusPageData = Awaited<ReturnType<typeof getFocusPage>>;

/** Lo que pide `/enfoque?tarea=` o `?bloque=` (con el nombre del momento). */
export async function getFocusLink(params: { tarea?: string; bloque?: string }) {
  if (params.bloque) {
    const b = await prisma.planBlock.findUnique({ where: { id: params.bloque }, select: { id: true, title: true, taskId: true } });
    if (b) return { taskId: b.taskId, blockId: b.id, title: b.title };
  }
  if (params.tarea) {
    const t = await prisma.planTask.findUnique({ where: { id: params.tarea }, select: { id: true, title: true } });
    if (t) return { taskId: t.id, blockId: null, title: t.title };
  }
  return null;
}
