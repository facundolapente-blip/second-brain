import { getCategories, getHabitsWithLogs } from "@/lib/habits";
import { packAll } from "@/lib/habit-logic";
import { HabitsList } from "../habits-list";

export const metadata = { title: "Archivados · Hábitos" };

export default async function ArchivadosPage() {
  const [{ habits, logs, today }, categories] = await Promise.all([
    getHabitsWithLogs({ archived: true }),
    getCategories(),
  ]);
  return <HabitsList habits={habits} logs={packAll(logs)} categories={categories} today={today} archived />;
}
