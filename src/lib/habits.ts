import "server-only";
import { prisma } from "./prisma";
import { fromDbDate, todayISO } from "./dates";
import type { DayLog, Frequency, LogMap, PastTrack } from "./habit-logic";

export type CategoryDTO = { id: string; name: string; icon: string; color: string; habitCount: number };

export type HabitDTO = {
  id: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  icon: string;
  color: string;
  categoryName: string | null;
  frequency: Frequency;
  weekdays: number[];
  timesPerWeek: number;
  weekStart: number;
  target: number;
  unit: string | null;
  priority: number;
  /** Hábito de dejar algo: muestra los días limpios. */
  isQuit: boolean;
  /** Orden manual de la lista. */
  order: number;
  startDate: string;
  archived: boolean;
  /** Pistas cerradas, de la más vieja a la más nueva. */
  tracks: PastTrack[];
};

/** Categorías con las que arranca la app, las mismas que había en HabitNow. */
const DEFAULT_CATEGORIES = [
  { name: "Malos hábitos", icon: "Prohibit", color: "red" },
  { name: "Mente", icon: "Moon", color: "purple" },
  { name: "Deporte", icon: "PersonSimpleRun", color: "green" },
  { name: "Salud", icon: "FirstAid", color: "teal" },
  { name: "Trabajo", icon: "Briefcase", color: "yellow" },
  { name: "Comida", icon: "ForkKnife", color: "orange" },
];

async function ensureCategories() {
  if ((await prisma.habitCategory.count()) > 0) return;
  await prisma.habitCategory.createMany({
    data: DEFAULT_CATEGORIES.map((c, i) => ({ ...c, order: i })),
    skipDuplicates: true,
  });
}

export async function getCategories(): Promise<CategoryDTO[]> {
  await ensureCategories();
  const rows = await prisma.habitCategory.findMany({
    orderBy: [{ order: "asc" }, { name: "asc" }],
    include: { _count: { select: { habits: { where: { archivedAt: null } } } } },
  });
  return rows.map((c) => ({ id: c.id, name: c.name, icon: c.icon, color: c.color, habitCount: c._count.habits }));
}

type HabitRow = Awaited<ReturnType<typeof queryHabits>>[number];

function queryHabits(where: { archivedAt: null } | { archivedAt: { not: null } } | { id: string }) {
  return prisma.habit.findMany({
    where,
    include: { category: true, tracks: { orderBy: { startDate: "asc" } } },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
}

function toDTO(h: HabitRow): HabitDTO {
  return {
    id: h.id,
    name: h.name,
    description: h.description,
    categoryId: h.categoryId,
    icon: h.category?.icon ?? "Circle",
    color: h.category?.color ?? "stone",
    categoryName: h.category?.name ?? null,
    frequency: h.frequency as Frequency,
    weekdays: h.weekdays,
    timesPerWeek: h.timesPerWeek,
    weekStart: h.weekStart,
    target: h.target,
    unit: h.unit,
    priority: h.priority,
    isQuit: h.isQuit,
    order: h.order,
    startDate: fromDbDate(h.startDate),
    archived: h.archivedAt !== null,
    tracks: h.tracks.map((t) => ({
      startDate: fromDbDate(t.startDate),
      endDate: fromDbDate(t.endDate),
      frequency: t.frequency as Frequency,
      weekdays: t.weekdays,
      timesPerWeek: t.timesPerWeek,
      weekStart: t.weekStart,
      target: t.target,
    })),
  };
}

async function logsFor(habitIds: string[]): Promise<Record<string, LogMap>> {
  const out: Record<string, LogMap> = Object.fromEntries(habitIds.map((id) => [id, {}]));
  if (habitIds.length === 0) return out;
  const logs = await prisma.habitLog.findMany({
    where: { habitId: { in: habitIds } },
    select: { habitId: true, date: true, status: true, value: true, note: true },
  });
  for (const l of logs) {
    const log: DayLog = { s: l.status as DayLog["s"], v: l.value };
    if (l.note) log.n = l.note;
    out[l.habitId][fromDbDate(l.date)] = log;
  }
  return out;
}

export async function getHabitsWithLogs(opts: { archived?: boolean } = {}) {
  await ensureCategories();
  const rows = await queryHabits(opts.archived ? { archivedAt: { not: null } } : { archivedAt: null });
  const habits = rows.map(toDTO);
  const logs = await logsFor(habits.map((h) => h.id));
  return { habits, logs, today: todayISO() };
}

export async function getHabit(id: string) {
  const rows = await queryHabits({ id });
  if (rows.length === 0) return null;
  const habit = toDTO(rows[0]);
  const logs = (await logsFor([id]))[id];
  return { habit, logs, today: todayISO() };
}
