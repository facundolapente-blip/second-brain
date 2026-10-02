import { todayISO } from "@/lib/dates";
import { getAccounts, getCategories, getUncategorized } from "@/lib/finance";
import { UncategorizedView } from "./uncategorized-view";

export const metadata = { title: "Sin clasificar · Gastos" };

export default async function SinClasificarPage() {
  const [accounts, categories, txs] = await Promise.all([getAccounts(), getCategories(), getUncategorized()]);
  return <UncategorizedView accounts={accounts} categories={categories} txs={txs} today={todayISO()} />;
}
