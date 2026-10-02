import { getCategories } from "@/lib/finance";
import { CategoriesView } from "./categories-view";

export const metadata = { title: "Categorías · Gastos" };

export default async function CategoriasPage() {
  return <CategoriesView categories={await getCategories()} />;
}
