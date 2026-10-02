import { todayISO } from "@/lib/dates";
import {
  countUncategorized,
  getAccounts,
  getCategories,
  getMonthTransactions,
  getTemplates,
  parseMonth,
} from "@/lib/finance";
import { MovementsView } from "./movements-view";

export const metadata = { title: "Movimientos · Gastos" };

export default async function GastosPage({ searchParams }: PageProps<"/gastos">) {
  const { mes } = await searchParams;
  const month = parseMonth(mes);
  const [accounts, categories, templates, txs, uncategorized] = await Promise.all([
    getAccounts(),
    getCategories(),
    getTemplates(),
    getMonthTransactions(month),
    countUncategorized(),
  ]);
  return (
    <MovementsView
      month={month}
      today={todayISO()}
      accounts={accounts}
      categories={categories}
      templates={templates}
      txs={txs}
      uncategorized={uncategorized}
    />
  );
}
