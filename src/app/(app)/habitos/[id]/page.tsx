import { notFound } from "next/navigation";
import { getCategories, getHabit } from "@/lib/habits";
import { packLogs } from "@/lib/habit-logic";
import { HabitDetail, type DetailTab } from "./habit-detail";

const TABS: DetailTab[] = ["calendario", "estadisticas", "editar"];

export async function generateMetadata({ params }: PageProps<"/habitos/[id]">) {
  const data = await getHabit((await params).id);
  return { title: data ? `${data.habit.name} · Hábitos` : "Hábitos" };
}

export default async function HabitPage({ params, searchParams }: PageProps<"/habitos/[id]">) {
  const { id } = await params;
  const { tab } = await searchParams;
  const [data, categories] = await Promise.all([getHabit(id), getCategories()]);
  if (!data) notFound();
  const initialTab = TABS.includes(tab as DetailTab) ? (tab as DetailTab) : "calendario";
  return (
    <HabitDetail
      key={id}
      habit={data.habit}
      logs={packLogs(data.logs)}
      today={data.today}
      categories={categories}
      initialTab={initialTab}
    />
  );
}
