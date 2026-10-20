import { getGastosReview } from "@/lib/gastos-review";
import { ReviewView } from "./review-view";

export const metadata = { title: "Revisar movimientos · Gastos" };

export default async function RevisarPage() {
  const { data, categories, undo } = await getGastosReview();
  // Sin key: lo elegido en las filas que quedan no se pierde al aplicar una.
  return <ReviewView data={data} categories={categories} undo={undo} />;
}
