import { getCategories, getHabitsWithLogs } from "@/lib/habits";
import { packAll } from "@/lib/habit-logic";
import { TodayView } from "./today-view";

export const metadata = { title: "Hoy · Hábitos" };

export default async function HoyPage() {
  const [{ habits, logs, today }, categories] = await Promise.all([getHabitsWithLogs(), getCategories()]);
  return <TodayView habits={habits} logs={packAll(logs)} categories={categories} today={today} />;
}
