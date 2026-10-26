import { getBudgetCategoryColors, getBudgetColumns, getBudgetLines, getCategories, getCategoryBudgets, getProjects, parseMonth } from "@/lib/finance";
import { getRates } from "@/lib/fx";
import { todayISO } from "@/lib/dates";
import { BudgetsView } from "./budgets-view";

export const metadata = { title: "Presupuestos · Gastos" };

export default async function PresupuestosPage({ searchParams }: PageProps<"/gastos/presupuestos">) {
  const month = parseMonth((await searchParams).mes);
  const [categories, { budgets, unbudgeted }, projects, lines, rates] = await Promise.all([
    getCategories(),
    getCategoryBudgets(month),
    getProjects(),
    getBudgetLines(),
    getRates(),
  ]);
  const [categoryColors, columns] = await Promise.all([getBudgetCategoryColors(lines), getBudgetColumns()]);
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
      columns={columns}
      toUyu={rates.toUyu}
    />
  );
}
