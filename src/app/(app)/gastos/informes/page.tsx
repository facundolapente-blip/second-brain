import { shiftMonth, todayISO } from "@/lib/dates";
import { getAccounts, getCategories, getFlowRows, parseMonth } from "@/lib/finance";
import { ReportsView } from "./reports-view";

export const metadata = { title: "Informes · Gastos" };

/** Cuántos meses trae la evolución (el celular muestra los últimos 6, la computadora los 12). */
const SPAN = 12;

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
