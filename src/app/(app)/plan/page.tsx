import { cookies } from "next/headers";
import { isISODate, todayISO } from "@/lib/dates";
import { getPlanCategories, getTasks, getWeek } from "@/lib/plan";
import { prisma } from "@/lib/prisma";
import { WeekView } from "./week-view";
import { HOURS_TODO_FOLD_COOKIE, parseTaskColumns, PLAN_VIEW_COOKIE, TASKS_FOLD_COOKIE } from "@/lib/plan-logic";
import { TasksBoard } from "./tareas/tasks-view";

export const metadata = { title: "Plan semanal" };

export default async function PlanPage({ searchParams }: PageProps<"/plan">) {
  const { semana } = await searchParams;
  const day = isISODate(semana) ? semana : todayISO();
  const [{ monday, blocks, today }, categories, tasks, manual, jar, columns] = await Promise.all([
    getWeek(day),
    getPlanCategories(),
    getTasks(),
    prisma.appSetting.findUnique({ where: { key: "tareas_orden_manual" } }),
    cookies(),
    prisma.appSetting.findUnique({ where: { key: "tareas_columnas" } }),
  ]);
  return (
    <WeekView
      key={monday}
      monday={monday}
      today={today}
      blocks={blocks}
      categories={categories}
      tasks={tasks.map((t) => ({ id: t.id, title: t.title, status: t.status }))}
      todoFolded={jar.get(HOURS_TODO_FOLD_COOKIE)?.value === "1"}
      initialView={jar.get(PLAN_VIEW_COOKIE)?.value === "horas" ? "horas" : "lista"}
      top={<TasksBoard key="tareas" tasks={tasks} categories={categories} today={todayISO()} manualOrder={!!manual} folded={jar.get(TASKS_FOLD_COOKIE)?.value === "1"} columns={parseTaskColumns(columns?.value)} />}
    />
  );
}
