import { getCategories, getHabitsWithLogs } from "@/lib/habits";
import { packAll } from "@/lib/habit-logic";
import { prisma } from "@/lib/prisma";
import { TodayView } from "./today-view";

export const metadata = { title: "Hoy · Hábitos" };

export default async function HoyPage() {
  const [{ habits, logs, today }, categories, manual] = await Promise.all([
    getHabitsWithLogs(),
    getCategories(),
    prisma.appSetting.findUnique({ where: { key: "habitos_orden_manual" } }),
  ]);
  return <TodayView habits={habits} logs={packAll(logs)} categories={categories} today={today} manualOrder={!!manual} />;
}
