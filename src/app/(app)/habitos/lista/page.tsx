import { getCategories, getHabitsWithLogs } from "@/lib/habits";
import { packAll } from "@/lib/habit-logic";
import { prisma } from "@/lib/prisma";
import { HabitsList } from "../habits-list";

export const metadata = { title: "Hábitos" };

export default async function ListaPage() {
  const [{ habits, logs, today }, categories, manual] = await Promise.all([
    getHabitsWithLogs(),
    getCategories(),
    prisma.appSetting.findUnique({ where: { key: "habitos_orden_manual" } }),
  ]);
  return <HabitsList habits={habits} logs={packAll(logs)} categories={categories} today={today} manualOrder={!!manual} />;
}
