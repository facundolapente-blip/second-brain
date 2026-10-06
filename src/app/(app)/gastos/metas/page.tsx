import { getAccounts, getGoals } from "@/lib/finance";
import { todayISO } from "@/lib/dates";
import { GoalsView } from "./goals-view";

export const metadata = { title: "Metas · Gastos" };

export default async function MetasPage() {
  const [goals, accounts] = await Promise.all([getGoals(), getAccounts()]);
  return <GoalsView goals={goals} accounts={accounts.filter((a) => !a.archived)} today={todayISO()} />;
}
