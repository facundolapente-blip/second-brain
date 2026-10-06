import { isISODate, todayISO } from "@/lib/dates";
import { getLinkableHabits, getPlanCategories, getTasks, getWeek } from "@/lib/plan";
import { WeekView } from "./week-view";
import { TasksBoard } from "./tareas/tasks-view";

export const metadata = { title: "Plan semanal" };

export default async function PlanPage({ searchParams }: PageProps<"/plan">) {
  const { semana } = await searchParams;
  const day = isISODate(semana) ? semana : todayISO();
  const [{ monday, blocks, today }, categories, habits, tasks] = await Promise.all([
    getWeek(day),
    getPlanCategories(),
    getLinkableHabits(),
    getTasks(),
  ]);
  return (
    <WeekView
      key={monday}
      monday={monday}
      today={today}
      blocks={blocks}
      categories={categories}
      habits={habits}
      tasks={tasks.map((t) => ({ id: t.id, title: t.title, status: t.status }))}
      top={<TasksBoard tasks={tasks} categories={categories} habits={habits} today={todayISO()} />}
    />
  );
}
