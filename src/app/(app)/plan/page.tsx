import { isISODate, todayISO } from "@/lib/dates";
import { getLinkableHabits, getPlanCategories, getTasks, getWeek } from "@/lib/plan";
import { WeekView } from "./week-view";

export const metadata = { title: "Semana · Plan" };

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
    />
  );
}
