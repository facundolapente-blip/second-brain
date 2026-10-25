import { cookies } from "next/headers";
import { isISODate, todayISO } from "@/lib/dates";
import { getPlanCategories, getQuarterGoalOptions, getTasks, getWeek } from "@/lib/plan";
import { prisma } from "@/lib/prisma";
import { WeekView } from "./week-view";
import { HOURS_TODO_FOLD_COOKIE, parseTaskColumnOrder, parseTaskColumns, PLAN_STEP_COOKIE, PLAN_VIEW_COOKIE, TASKS_FOLD_COOKIE, TASK_COLUMN_ORDER_KEY, TASKS_LAYOUT_COOKIE } from "@/lib/plan-logic";
import { TasksBoard } from "./tareas/tasks-view";

export const metadata = { title: "Plan semanal" };

export default async function PlanPage({ searchParams }: PageProps<"/plan">) {
  const { semana, desde } = await searchParams;
  const day = isISODate(semana) ? semana : todayISO();
  // `desde`: siete días corridos desde ese día (las flechas de a un día).
  const [{ monday, start, blocks, today }, categories, tasks, manual, jar, columns, columnOrder, goals] = await Promise.all([
    getWeek(day, isISODate(desde) ? desde : undefined),
    getPlanCategories(),
    getTasks(),
    prisma.appSetting.findUnique({ where: { key: "tareas_orden_manual" } }),
    cookies(),
    prisma.appSetting.findUnique({ where: { key: "tareas_columnas" } }),
    prisma.appSetting.findUnique({ where: { key: TASK_COLUMN_ORDER_KEY } }),
    getQuarterGoalOptions(),
  ]);
  return (
    <WeekView
      key={start}
      monday={monday}
      start={start}
      step={jar.get(PLAN_STEP_COOKIE)?.value === "dia" ? "dia" : "semana"}
      today={today}
      blocks={blocks}
      categories={categories}
      goals={goals}
      tasks={tasks.map((t) => ({ id: t.id, title: t.title, status: t.status, categoryId: t.categoryId, priority: t.priority }))}
      todoFolded={jar.get(HOURS_TODO_FOLD_COOKIE)?.value === "1"}
      initialView={jar.get(PLAN_VIEW_COOKIE)?.value === "horas" ? "horas" : "lista"}
      top={<TasksBoard key="tareas" tasks={tasks} categories={categories} today={todayISO()} manualOrder={!!manual} folded={jar.get(TASKS_FOLD_COOKIE)?.value === "1"} columns={parseTaskColumns(columns?.value)} columnOrder={parseTaskColumnOrder(columnOrder?.value)} layout={jar.get(TASKS_LAYOUT_COOKIE)?.value === "tablero" ? "tablero" : "tabla"} />}
    />
  );
}
