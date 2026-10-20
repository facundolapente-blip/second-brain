import { notFound } from "next/navigation";
import { getAccounts, getCategories, getHistory, getTemplates } from "@/lib/finance";
import { CategoryDetail } from "./category-detail";

export const metadata = { title: "Categoría · Gastos" };

export default async function CategoriaPage({ params, searchParams }: PageProps<"/gastos/categorias/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const limit = Math.min(3000, Math.max(200, Number(typeof sp.n === "string" ? sp.n : "") || 200));
  const [accounts, categories, templates, history] = await Promise.all([
    getAccounts(),
    getCategories(),
    getTemplates(),
    getHistory({ categoryId: id, limit }),
  ]);
  const category = categories.find((c) => c.id === id);
  if (!category || category.adjustment) notFound();
  return <CategoryDetail category={category} accounts={accounts} categories={categories} templates={templates} {...history} limit={limit} />;
}
