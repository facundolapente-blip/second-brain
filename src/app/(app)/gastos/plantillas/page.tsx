import { getAccounts, getCategories, getTemplates } from "@/lib/finance";
import { TemplatesView } from "./templates-view";

export const metadata = { title: "Plantillas · Gastos" };

export default async function PlantillasPage() {
  const [accounts, categories, templates] = await Promise.all([getAccounts(), getCategories(), getTemplates()]);
  return <TemplatesView accounts={accounts} categories={categories} templates={templates} />;
}
