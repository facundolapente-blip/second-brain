import "server-only";
import { prisma } from "./prisma";
import { dayOfInstant, fromDbDate, todayISO } from "./dates";
import { HABITS_PLAN_LINKED_KEY, type DayLog, type Frequency, type LogMap, type PastTrack } from "./habit-logic";

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
  /** Día en que se archivó: sus números quedan congelados ahí (no siguen bajando). */
  archivedOn: string | null;
  /** Pistas cerradas, de la más vieja a la más nueva. */
  tracks: PastTrack[];
  /** Atado al Plan (Gym): los días con un bloque de su mismo nombre (`withPlanDays`). */
  planDays?: string[];
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
    archivedOn: h.archivedAt ? dayOfInstant(h.archivedAt) : null,
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

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

/**
 * A los hábitos atados al Plan (`AppSetting "habitos_ligados_plan"`, hoy solo Gym) les
 * pone los días que tienen un bloque con su mismo nombre: los bloques de ahora y los
 * registros de los que se pasaron a otra semana (la misma tarjeta va cambiando de día).
 */
async function withPlanDays(habits: HabitDTO[]): Promise<HabitDTO[]> {
  const row = await prisma.appSetting.findUnique({ where: { key: HABITS_PLAN_LINKED_KEY } });
  let ids: string[] = [];
  try {
    const v = JSON.parse(row?.value ?? "[]");
    if (Array.isArray(v)) ids = v.filter((x): x is string => typeof x === "string");
  } catch {}
  const linked = habits.filter((h) => ids.includes(h.id));
  if (!linked.length) return habits;
  const names = new Set(linked.map((h) => fold(h.name)));
  const [blocks, logs] = await Promise.all([
    prisma.planBlock.findMany({ select: { title: true, date: true } }),
    prisma.planBlockLog.findMany({ select: { title: true, date: true } }),
  ]);
  const days = new Map<string, Set<string>>();
  for (const b of [...blocks, ...logs]) {
    const k = fold(b.title);
    if (!names.has(k)) continue;
    const set = days.get(k) ?? new Set<string>();
    set.add(fromDbDate(b.date));
    days.set(k, set);
  }
  return habits.map((h) => (ids.includes(h.id) ? { ...h, planDays: [...(days.get(fold(h.name)) ?? [])].sort() } : h));
}

export async function getHabitsWithLogs(opts: { archived?: boolean } = {}) {
  await ensureCategories();
  const rows = await queryHabits(opts.archived ? { archivedAt: { not: null } } : { archivedAt: null });
  const habits = await withPlanDays(rows.map(toDTO));
  const logs = await logsFor(habits.map((h) => h.id));
  return { habits, logs, today: todayISO() };
}

export async function getHabit(id: string) {
  const rows = await queryHabits({ id });
  if (rows.length === 0) return null;
  const [habit] = await withPlanDays([toDTO(rows[0])]);
  const logs = (await logsFor([id]))[id];
  return { habit, logs, today: todayISO() };
}
