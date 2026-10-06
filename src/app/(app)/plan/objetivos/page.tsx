import { todayISO } from "@/lib/dates";
import { getKrLinkOptions, getObjectives } from "@/lib/plan";
import { ObjectivesView } from "./objectives-view";

export const metadata = { title: "Objetivos · Plan" };

export default async function ObjetivosPage({ searchParams }: PageProps<"/plan/objetivos">) {
  const { anio } = await searchParams;
  const today = todayISO();
  const year = typeof anio === "string" && /^\d{4}$/.test(anio) ? Number(anio) : Number(today.slice(0, 4));
  const [{ objectives, loose, years }, links] = await Promise.all([getObjectives(year), getKrLinkOptions()]);
  return <ObjectivesView key={year} objectives={objectives} loose={loose} links={links} today={today} year={year} years={years} />;
}
