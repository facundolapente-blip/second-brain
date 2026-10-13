import "server-only";
import { prisma } from "./prisma";
import { getHabitsWithLogs } from "./habits";
import { habitScore } from "./habit-logic";
import { getAccounts, getGoals } from "./finance";
import { addDays, fromDbDate, startOfWeek, toDbDate, todayISO } from "./dates";
import { parseTaskLinks } from "./plan-logic";
import type {
  BlockDTO,
  CategoryDTO,
  KeyResultDTO,
  KrLinkOption,
  KrStatus,
  ObjectiveDTO,
  TaskDTO,
  TaskStatus,
} from "./plan-logic";

/** Categorías con las que arranca, las mismas del Notion de Facu. */
const DEFAULT_CATEGORIES = [
  { name: "Trabajo", color: "purple" },
  { name: "ORT", color: "red" },
  { name: "Personal", color: "yellow" },
  { name: "Deporte", color: "green" },
  { name: "DJ", color: "blue" },
  { name: "Producción", color: "purple" },
  { name: "Nuevos Ingresos", color: "teal" },
  { name: "Casa", color: "brown" },
];

export async function ensurePlanCategories() {
  if ((await prisma.planCategory.count()) > 0) return;
  await prisma.planCategory.createMany({
    data: DEFAULT_CATEGORIES.map((c, i) => ({ ...c, order: i })),
    skipDuplicates: true,
  });
}

export async function getPlanCategories(): Promise<CategoryDTO[]> {
  await ensurePlanCategories();
  const rows = await prisma.planCategory.findMany({ orderBy: [{ order: "asc" }, { name: "asc" }] });
  return rows.map((c) => ({ id: c.id, name: c.name, color: c.color }));
}


type BlockRow = Awaited<ReturnType<typeof prisma.planBlock.findMany>>[number];
function blockDTO(b: BlockRow): BlockDTO {
  return {
    id: b.id,
    title: b.title,
    categoryId: b.categoryId,
    date: fromDbDate(b.date),
    startTime: b.startTime,
    endTime: b.endTime,
    sortKey: b.sortKey,
    priority: b.priority,
    done: b.done,
    place: b.place,
    notes: b.notes,
    taskId: b.taskId,
  };
}

/** Bloques de la semana (lunes a domingo) que contiene `day`. */
/**
 * Siete días de bloques. Sin `start`, la semana de lunes a domingo de `day`; con
 * `start`, siete días corridos desde ese día (avanzar de a un día). `monday` es
 * siempre el lunes de la semana del primer día (lo usan "pasar/copiar la semana").
 */
export async function getWeek(day: string, start?: string) {
  const monday = startOfWeek(start ?? day);
  const from = start ?? monday;
  const rows = await prisma.planBlock.findMany({
    where: { date: { gte: toDbDate(from), lte: toDbDate(addDays(from, 6)) } },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });
  return { monday, start: from, blocks: rows.map(blockDTO), today: todayISO() };
}

export async function getTasks(): Promise<TaskDTO[]> {
  const rows = await prisma.planTask.findMany({
    include: { _count: { select: { blocks: true } }, subtasks: { orderBy: [{ order: "asc" }] } },
    orderBy: [{ createdAt: "asc" }],
  });
  return rows.map((t) => ({
    id: t.id,
    title: t.title,
    categoryId: t.categoryId,
    status: t.status as TaskStatus,
    priority: t.priority,
    deadline: t.deadline ? fromDbDate(t.deadline) : null,
    progress: t.progress,
    goal: t.goal,
    scheduled: t.scheduled,
    notes: t.notes,
    links: parseTaskLinks(t.links),
    blockCount: t._count.blocks,
    subtasks: t.subtasks.map((s) => ({ id: s.id, title: s.title, done: s.done })),
    repeat: t.repeat === "daily" || t.repeat === "weekly" || t.repeat === "monthly" ? t.repeat : null,
    repeatEvery: t.repeatEvery,
    order: t.order,
    // Cuándo se terminó (las viejas sin la fecha, la última vez que se tocó).
    doneAt: t.status === "done" ? (t.completedAt ?? t.updatedAt).toISOString() : null,
  }));
}

/** Los objetivos de un año (cada año es como una hoja de Notion). */
export async function getObjectives(
  year: number,
): Promise<{ objectives: ObjectiveDTO[]; loose: KeyResultDTO[]; years: number[] }> {
  const [objs, krs, { habits, logs, today }, accounts, goals, objYears, krYears] = await Promise.all([
    prisma.planObjective.findMany({ where: { year }, orderBy: [{ order: "asc" }, { title: "asc" }] }),
    prisma.planKeyResult.findMany({ where: { year }, orderBy: [{ createdAt: "asc" }] }),
    getHabitsWithLogs(),
    getAccounts(),
    getGoals(),
    prisma.planObjective.findMany({ distinct: ["year"], select: { year: true } }),
    prisma.planKeyResult.findMany({ distinct: ["year"], select: { year: true } }),
  ]);
  // Lo que se mide solo: cumplimiento de un hábito, saldo de una cuenta, avance de una meta.
  const autoOf = (k: (typeof krs)[number]): KeyResultDTO["auto"] => {
    if (!k.linkType || !k.linkId) return null;
    if (k.linkType === "habit") {
      const h = habits.find((x) => x.id === k.linkId);
      return h ? { progress: habitScore(h, logs[h.id] ?? {}, today), goal: 100, label: `% de ${h.name}` } : null;
    }
    if (k.linkType === "account") {
      const a = accounts.find((x) => x.id === k.linkId);
      return a ? { progress: Math.round(a.balanceCents) / 100, goal: k.goal, label: `saldo de ${a.name}` } : null;
    }
    if (k.linkType === "goal") {
      const g = goals.find((x) => x.id === k.linkId);
      return g ? { progress: g.savedCents / 100, goal: g.targetCents / 100, label: g.name } : null;
    }
    return null;
  };
  const dto = (k: (typeof krs)[number]): KeyResultDTO => ({
    link: k.linkType && k.linkId ? `${k.linkType}:${k.linkId}` : null,
    auto: autoOf(k),
    id: k.id,
    objectiveId: k.objectiveId,
    title: k.title,
    kind: k.kind === "habit" ? "habit" : "activity",
    status: k.status as KrStatus,
    quarters: k.quarters,
    deadline: k.deadline ? fromDbDate(k.deadline) : null,
    progress: k.progress,
    goal: k.goal,
  });
  return {
    objectives: objs.map((o) => ({
      id: o.id,
      title: o.title,
      year: o.year,
      keyResults: krs.filter((k) => k.objectiveId === o.id).map(dto),
    })),
    loose: krs.filter((k) => !k.objectiveId).map(dto),
    years: [...new Set([...objYears, ...krYears].map((y) => y.year).concat(Number(today.slice(0, 4)), year))].sort(),
  };
}

/** Hábitos, cuentas y metas para vincular resultados clave. */
export async function getKrLinkOptions(): Promise<KrLinkOption[]> {
  const [habits, accounts, goals] = await Promise.all([
    prisma.habit.findMany({ where: { archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.account.findMany({ where: { archivedAt: null }, select: { id: true, name: true, currency: true }, orderBy: { order: "asc" } }),
    prisma.savingsGoal.findMany({ where: { archivedAt: null }, select: { id: true, name: true } }),
  ]);
  return [
    ...habits.map((h) => ({ value: `habit:${h.id}`, label: h.name, group: "Hábitos" as const })),
    ...accounts.map((a) => ({ value: `account:${a.id}`, label: `${a.name} (${a.currency})`, group: "Cuentas" as const })),
    ...goals.map((g) => ({ value: `goal:${g.id}`, label: g.name, group: "Metas de ahorro" as const })),
  ];
}
