import { getCategories } from "@/lib/habits";
import { CategoriesView } from "./categories-view";

export const metadata = { title: "Categorías · Hábitos" };

export default async function CategoriasPage() {
  return <CategoriesView categories={await getCategories()} />;
}
