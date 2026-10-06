import { getCategories, getCategoryBudgets, getProjects, parseMonth } from "@/lib/finance";
import { todayISO } from "@/lib/dates";
import { BudgetsView } from "./budgets-view";

export const metadata = { title: "Presupuestos · Gastos" };

export default async function PresupuestosPage({ searchParams }: PageProps<"/gastos/presupuestos">) {
  const month = parseMonth((await searchParams).mes);
  const [categories, { budgets, unbudgeted }, projects] = await Promise.all([
    getCategories(),
    getCategoryBudgets(month),
    getProjects(),
  ]);
  return (
    <BudgetsView
      month={month}
      today={todayISO()}
      categories={categories.filter((c) => c.kind === "expense")}
      budgets={budgets}
      unbudgeted={unbudgeted}
      projects={projects}
    />
  );
}
