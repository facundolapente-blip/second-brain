import { cookies } from "next/headers";
import { syncGoogleSoon } from "@/lib/gcal";
import { isISODate, monthKey, startOfWeek, todayISO } from "@/lib/dates";
import { getMonth, getPlanCategories, getTasks, getWeek } from "@/lib/plan";
import { prisma } from "@/lib/prisma";
import { WeekView } from "./week-view";
import { HOURS_TODO_FOLD_COOKIE, isMonthKey, parseTaskColumnOrder, parseTaskColumns, PLAN_MONTH_COOKIE, PLAN_STEP_COOKIE, PLAN_VIEW_COOKIE, TASKS_FOLD_COOKIE, TASK_COLUMN_ORDER_KEY, TASKS_LAYOUT_COOKIE } from "@/lib/plan-logic";
import { TasksBoard } from "./tareas/tasks-view";

export const metadata = { title: "Plan semanal" };

export default async function PlanPage({ searchParams }: PageProps<"/plan">) {
  // Los eventos nuevos o cambiados de Google Calendar entran antes de armar la semana.
  await syncGoogleSoon();
  const { semana, desde, mes } = await searchParams;
  const jar = await cookies();
  const day = isISODate(semana) ? semana : todayISO();
  // Vista Mes: con ?mes=, o en /plan a secas si lo último que se miró fue el mes (cookie).
  const month = isMonthKey(mes) ? mes : !semana && !desde && jar.get(PLAN_MONTH_COOKIE)?.value === "1" ? monthKey(todayISO()) : null;
  // `desde`: siete días corridos desde ese día (las flechas de a un día).
  const [period, categories, tasks, manual, columns, columnOrder] = await Promise.all([
    month ? getMonth(month) : getWeek(day, isISODate(desde) ? desde : undefined),
    getPlanCategories(),
    getTasks(),
    prisma.appSetting.findUnique({ where: { key: "tareas_orden_manual" } }),
    prisma.appSetting.findUnique({ where: { key: "tareas_columnas" } }),
    prisma.appSetting.findUnique({ where: { key: TASK_COLUMN_ORDER_KEY } }),
  ]);
  const { blocks, today } = period;
  const isMonth = "month" in period;
  const start = isMonth ? period.days[0] : period.start;
  return (
    <WeekView
      key={isMonth ? period.month : start}
      month={isMonth ? period.month : undefined}
      monday={isMonth ? startOfWeek(start) : period.monday}
      start={start}
      step={jar.get(PLAN_STEP_COOKIE)?.value === "dia" ? "dia" : "semana"}
      today={today}
      blocks={blocks}
      categories={categories}
      tasks={tasks.map((t) => ({ id: t.id, title: t.title, status: t.status, categoryId: t.categoryId, priority: t.priority }))}
      todoFolded={jar.get(HOURS_TODO_FOLD_COOKIE)?.value === "1"}
      initialView={jar.get(PLAN_VIEW_COOKIE)?.value === "horas" ? "horas" : "lista"}
      top={<TasksBoard key="tareas" tasks={tasks} categories={categories} today={todayISO()} manualOrder={!!manual} folded={jar.get(TASKS_FOLD_COOKIE)?.value === "1"} columns={parseTaskColumns(columns?.value)} columnOrder={parseTaskColumnOrder(columnOrder?.value)} layout={jar.get(TASKS_LAYOUT_COOKIE)?.value === "tablero" ? "tablero" : "tabla"} />}
    />
  );
}
