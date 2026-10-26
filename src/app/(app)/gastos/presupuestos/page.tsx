import { getBudgetCategoryColors, getBudgetLines, getCategories, getCategoryBudgets, getProjects, getReserve, parseMonth } from "@/lib/finance";
import { getRates } from "@/lib/fx";
import { todayISO } from "@/lib/dates";
import { BudgetsView } from "./budgets-view";

export const metadata = { title: "Presupuestos · Gastos" };

export default async function PresupuestosPage({ searchParams }: PageProps<"/gastos/presupuestos">) {
  const month = parseMonth((await searchParams).mes);
  const [categories, { budgets, unbudgeted }, projects, lines, rates, reserve] = await Promise.all([
    getCategories(),
    getCategoryBudgets(month),
    getProjects(),
    getBudgetLines(),
    getRates(),
    getReserve(),
  ]);
  const categoryColors = await getBudgetCategoryColors(lines);
  return (
    <BudgetsView
      month={month}
      today={todayISO()}
      categories={categories.filter((c) => c.kind === "expense" && !c.adjustment && !c.pass && !c.business)}
      budgets={budgets}
      unbudgeted={unbudgeted}
      projects={projects}
      lines={lines}
      categoryColors={categoryColors}
      toUyu={rates.toUyu}
      avgSpendCents={reserve.spendCents}
    />
  );
}
