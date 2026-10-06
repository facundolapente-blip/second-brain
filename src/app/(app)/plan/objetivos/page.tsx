import { todayISO } from "@/lib/dates";
import { getKrLinkOptions, getObjectives } from "@/lib/plan";
import { ObjectivesView } from "./objectives-view";

export const metadata = { title: "Objetivos · Plan" };

export default async function ObjetivosPage() {
  const [{ objectives, loose }, links] = await Promise.all([getObjectives(), getKrLinkOptions()]);
  return <ObjectivesView objectives={objectives} loose={loose} links={links} today={todayISO()} />;
}
