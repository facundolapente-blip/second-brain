import { getReviewHistory } from "@/lib/gastos-review";
import { HistoryList } from "./history-list";

export const metadata = { title: "Lo que aplicaste · Revisar movimientos" };

export default async function RevisionHistorialPage() {
  return <HistoryList items={await getReviewHistory()} />;
}
