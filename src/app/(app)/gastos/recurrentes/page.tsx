import { getAccounts, getCategories, getSchedules } from "@/lib/finance";
import { todayISO } from "@/lib/dates";
import { SchedulesView } from "./schedules-view";

export const metadata = { title: "Recurrentes · Gastos" };

export default async function RecurrentesPage() {
  const [accounts, categories, schedules] = await Promise.all([getAccounts(), getCategories(), getSchedules()]);
  return <SchedulesView accounts={accounts} categories={categories} schedules={schedules} today={todayISO()} />;
}
