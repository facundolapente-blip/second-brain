import { todayISO } from "@/lib/dates";
import { getObjectives } from "@/lib/plan";
import { ObjectivesView } from "./objectives-view";

export const metadata = { title: "Objetivos · Plan" };

export default async function ObjetivosPage() {
  const { objectives, loose } = await getObjectives();
  return <ObjectivesView objectives={objectives} loose={loose} today={todayISO()} />;
}
