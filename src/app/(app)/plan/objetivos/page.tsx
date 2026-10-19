import { cookies } from "next/headers";
import { todayISO } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { getKrLinkOptions, getObjectives } from "@/lib/plan";
import { OBJECTIVES_VIEW_COOKIE, REVIEW_DISMISSED_KEY } from "@/lib/plan-logic";
import { ObjectivesView } from "./objectives-view";

export const metadata = { title: "Objetivos · Plan" };

export default async function ObjetivosPage({ searchParams }: PageProps<"/plan/objetivos">) {
  const { anio } = await searchParams;
  const today = todayISO();
  const year = typeof anio === "string" && /^\d{4}$/.test(anio) ? Number(anio) : Number(today.slice(0, 4));
  const [{ objectives, loose, years }, links, jar, dismissed] = await Promise.all([
    getObjectives(year),
    getKrLinkOptions(),
    cookies(),
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
      // El mapa del año es la vista de siempre; "Por rol" queda recordada si se elige.
      initialLayout={jar.get(OBJECTIVES_VIEW_COOKIE)?.value === "rol" ? "rol" : "mapa"}
      reviewDismissed={dismissed?.value ?? null}
    />
  );
}
