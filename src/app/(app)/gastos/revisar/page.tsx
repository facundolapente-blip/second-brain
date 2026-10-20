import { getGastosReview } from "@/lib/gastos-review";
import { ReviewView } from "./review-view";

export const metadata = { title: "Revisar movimientos · Gastos" };

export default async function RevisarPage() {
  const { data, categories, undo } = await getGastosReview();
  // Con datos nuevos (después de aplicar o deshacer) las elecciones arrancan de nuevo.
  const key = [undo?.at ?? "", data.pairs.length, data.loose.length, data.trabajo.length, data.mama.length].join("|");
  return <ReviewView key={key} data={data} categories={categories} undo={undo} />;
}
