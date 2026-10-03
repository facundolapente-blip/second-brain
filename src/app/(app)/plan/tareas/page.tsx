import { todayISO } from "@/lib/dates";
import { getLinkableHabits, getPlanCategories, getTasks } from "@/lib/plan";
import { TasksView } from "./tasks-view";

export const metadata = { title: "Tareas · Plan" };

export default async function TareasPage() {
  const [tasks, categories, habits] = await Promise.all([getTasks(), getPlanCategories(), getLinkableHabits()]);
  return <TasksView tasks={tasks} categories={categories} habits={habits} today={todayISO()} />;
}
