import { notFound } from "next/navigation";
import { getAccounts, getCategories, getProject } from "@/lib/finance";
import { ProjectView } from "./project-view";

export const metadata = { title: "Presupuesto · Gastos" };

export default async function ProyectoPage({ params }: PageProps<"/gastos/presupuestos/[id]">) {
  const { id } = await params;
  const [data, accounts, categories] = await Promise.all([getProject(id), getAccounts(), getCategories()]);
  if (!data) notFound();
  return <ProjectView {...data} accounts={accounts} categories={categories} />;
}
