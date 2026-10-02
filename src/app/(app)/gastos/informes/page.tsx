import { shiftMonth, todayISO } from "@/lib/dates";
import { getAccounts, getCategories, getFlowRows, parseMonth } from "@/lib/finance";
import { ReportsView } from "./reports-view";

export const metadata = { title: "Informes · Gastos" };

/** Cuántos meses muestra la evolución. */
const SPAN = 6;

export default async function InformesPage({ searchParams }: PageProps<"/gastos/informes">) {
  const { mes } = await searchParams;
  const month = parseMonth(mes);
  const months = Array.from({ length: SPAN }, (_, i) => shiftMonth(month, i - SPAN + 1));
  const [accounts, categories, rows] = await Promise.all([
    getAccounts(),
    getCategories(),
    getFlowRows(months[0], month),
  ]);
  return (
    <ReportsView
      month={month}
      months={months}
      today={todayISO()}
      accounts={accounts}
      categories={categories}
      rows={rows}
    />
  );
}
