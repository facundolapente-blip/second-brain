import { getCategories, getHabitsWithLogs } from "@/lib/habits";
import { TodayView } from "./today-view";

export const metadata = { title: "Hoy · Hábitos" };

export default async function HoyPage() {
  const [{ habits, logs, today }, categories] = await Promise.all([getHabitsWithLogs(), getCategories()]);
  return <TodayView habits={habits} logs={logs} categories={categories} today={today} />;
}
