import { getAccounts, getCategories, getDebts } from "@/lib/finance";
import { DebtsView } from "./debts-view";

export const metadata = { title: "Deudas · Gastos" };

export default async function DeudasPage() {
  const [debts, accounts, categories] = await Promise.all([getDebts(), getAccounts(), getCategories()]);
  return (
    <DebtsView
      debts={debts}
      accounts={accounts.filter((a) => !a.archived)}
      categories={categories.filter((c) => !c.adjustment)}
    />
  );
}
