import { shiftMonth, todayISO } from "@/lib/dates";
import { getAccounts, getCategories, getFlowRows } from "@/lib/finance";
import { periodFromParams } from "@/lib/finance-logic";
import { ReportsView } from "./reports-view";

export const metadata = { title: "Informes · Gastos" };

/** Cuántos meses trae la evolución (el celular muestra los últimos 6, la computadora los 12). */
const SPAN = 12;

export default async function InformesPage({ searchParams }: PageProps<"/gastos/informes">) {
  const sp = await searchParams;
  const today = todayISO();
  // Por mes (?mes=, la de siempre) o por año (?anio=): los 12 meses de ese año y el anterior para comparar.
  const period = periodFromParams({ mes: sp.mes, anio: sp.anio }, today);
  const year = period.kind === "year" ? period.year : null;
  const month = period.kind === "month" ? period.month : year === today.slice(0, 4) ? today.slice(0, 7) : `${year}-12`;
  const months = year
    ? Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`)
    : Array.from({ length: SPAN }, (_, i) => shiftMonth(month, i - SPAN + 1));
  const fromMonth = year ? `${Number(year) - 1}-01` : months[0];
  const [accounts, categories, rows] = await Promise.all([
    getAccounts(),
    getCategories(),
    getFlowRows(fromMonth, months[months.length - 1]),
  ]);
  return (
    <ReportsView
      period={period}
      month={month}
      months={months}
      today={today}
      accounts={accounts}
      categories={categories}
      rows={rows}
    />
  );
}
