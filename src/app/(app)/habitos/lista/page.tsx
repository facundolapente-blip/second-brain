import { getCategories, getHabitsWithLogs } from "@/lib/habits";
import { HabitsList } from "../habits-list";

export const metadata = { title: "Hábitos" };

export default async function ListaPage() {
  const [{ habits, logs, today }, categories] = await Promise.all([getHabitsWithLogs(), getCategories()]);
  return <HabitsList habits={habits} logs={logs} categories={categories} today={today} />;
}
