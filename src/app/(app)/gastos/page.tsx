import { todayISO } from "@/lib/dates";
import {
  countUncategorized,
  getAccounts,
  getCategories,
  getRangeTransactions,
  getTemplates,
} from "@/lib/finance";
import { periodFromParams } from "@/lib/finance-logic";
import { MovementsView } from "./movements-view";

export const metadata = { title: "Movimientos · Gastos" };

export default async function GastosPage({ searchParams }: PageProps<"/gastos">) {
  const today = todayISO();
  const period = periodFromParams(await searchParams, today);
  const [accounts, categories, templates, txs, uncategorized] = await Promise.all([
    getAccounts(),
    getCategories(),
    getTemplates(),
    getRangeTransactions(period.from, period.to),
    countUncategorized(),
  ]);
  return (
    <MovementsView
      period={period}
      today={today}
      accounts={accounts}
      categories={categories}
      templates={templates}
      txs={txs}
      uncategorized={uncategorized}
    />
  );
}
