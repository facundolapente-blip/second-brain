import "server-only";
import { prisma } from "./prisma";
import { addDays, fromDbDate, startOfWeek, toDbDate, todayISO } from "./dates";
import type {
  BlockDTO,
  CategoryDTO,
  KeyResultDTO,
  KrStatus,
  ObjectiveDTO,
  TaskDTO,
  TaskStatus,
} from "./plan-logic";

/** Categorías con las que arranca, las mismas del Notion de Facu. */
const DEFAULT_CATEGORIES = [
  { name: "Trabajo", color: "pink" },
  { name: "ORT", color: "red" },
  { name: "Personal", color: "yellow" },
  { name: "Deporte", color: "green" },
  { name: "DJ", color: "blue" },
  { name: "Producción", color: "purple" },
  { name: "Nuevos Ingresos", color: "teal" },
  { name: "Casa", color: "orange" },
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

/** Hábitos activos, para vincular bloques. */
export async function getLinkableHabits() {
  const rows = await prisma.habit.findMany({
    where: { archivedAt: null },
    select: { id: true, name: true, category: { select: { icon: true, color: true } } },
    orderBy: [{ priority: "desc" }, { name: "asc" }],
  });
  return rows.map((h) => ({ id: h.id, name: h.name, icon: h.category?.icon ?? "Circle", color: h.category?.color ?? "stone" }));
}
export type LinkableHabit = Awaited<ReturnType<typeof getLinkableHabits>>[number];

type BlockRow = Awaited<ReturnType<typeof prisma.planBlock.findMany>>[number];
function blockDTO(b: BlockRow): BlockDTO {
  return {
    id: b.id,
    title: b.title,
    categoryId: b.categoryId,
    date: fromDbDate(b.date),
    startTime: b.startTime,
    endTime: b.endTime,
    priority: b.priority,
    done: b.done,
    place: b.place,
    notes: b.notes,
    taskId: b.taskId,
    habitId: b.habitId,
  };
}

/** Bloques de la semana (lunes a domingo) que contiene `day`. */
export async function getWeek(day: string) {
  const monday = startOfWeek(day);
  const rows = await prisma.planBlock.findMany({
    where: { date: { gte: toDbDate(monday), lte: toDbDate(addDays(monday, 6)) } },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });
  return { monday, blocks: rows.map(blockDTO), today: todayISO() };
}

export async function getTasks(): Promise<TaskDTO[]> {
  const rows = await prisma.planTask.findMany({
    include: { _count: { select: { blocks: true } } },
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
    scheduled: t.scheduled || t._count.blocks > 0,
    notes: t.notes,
    blockCount: t._count.blocks,
  }));
}

export async function getObjectives(): Promise<{ objectives: ObjectiveDTO[]; loose: KeyResultDTO[] }> {
  const [objs, krs] = await Promise.all([
    prisma.planObjective.findMany({ orderBy: [{ order: "asc" }, { title: "asc" }] }),
    prisma.planKeyResult.findMany({ orderBy: [{ createdAt: "asc" }] }),
  ]);
  const dto = (k: (typeof krs)[number]): KeyResultDTO => ({
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
      keyResults: krs.filter((k) => k.objectiveId === o.id).map(dto),
    })),
    loose: krs.filter((k) => !k.objectiveId).map(dto),
  };
}
