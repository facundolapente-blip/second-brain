import { todayISO } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { getKrLinkOptions, getObjectives } from "@/lib/plan";
import { REVIEW_DISMISSED_KEY } from "@/lib/plan-logic";
import { ObjectivesView } from "./objectives-view";

export const metadata = { title: "Objetivos · Plan" };

export default async function ObjetivosPage({ searchParams }: PageProps<"/plan/objetivos">) {
  const { anio } = await searchParams;
  const today = todayISO();
  const year = typeof anio === "string" && /^\d{4}$/.test(anio) ? Number(anio) : Number(today.slice(0, 4));
  const [{ objectives, loose, years }, links, dismissed] = await Promise.all([
    getObjectives(year),
    getKrLinkOptions(),
    prisma.appSetting.findUnique({ where: { key: REVIEW_DISMISSED_KEY } }),
  ]);
  return (
    <ObjectivesView
      key={year}
      objectives={objectives}
      loose={loose}
      links={links}
      today={today}
      year={year}
      years={years}
      reviewDismissed={dismissed?.value ?? null}
    />
  );
}
