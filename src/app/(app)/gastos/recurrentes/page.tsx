import { getAccounts, getCategories, getFixedSuggestions, getSchedules } from "@/lib/finance";
import { todayISO } from "@/lib/dates";
import { SchedulesView } from "./schedules-view";

export const metadata = { title: "Recurrentes · Gastos" };

export default async function RecurrentesPage() {
  const [accounts, categories, schedules, suggestions] = await Promise.all([
    getAccounts(),
    getCategories(),
    getSchedules(),
    getFixedSuggestions(),
  ]);
  return <SchedulesView accounts={accounts} categories={categories} schedules={schedules} suggestions={suggestions} today={todayISO()} />;
}
