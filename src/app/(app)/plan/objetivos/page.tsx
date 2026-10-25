import { cookies } from "next/headers";
import { todayISO } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { getKrLinkOptions, getObjectives, getQuarterActions } from "@/lib/plan";
import { OBJECTIVES_VIEW_COOKIE, objectivesTab, QUARTERS, quarterOf, REVIEW_DISMISSED_KEY, type Quarter } from "@/lib/plan-logic";
import { ObjectivesView } from "./objectives-view";

export const metadata = { title: "Objetivos · Plan" };

export default async function ObjetivosPage({ searchParams }: PageProps<"/plan/objetivos">) {
  const { anio, t } = await searchParams;
  const today = todayISO();
  const currentYear = Number(today.slice(0, 4));
  const year = typeof anio === "string" && /^\d{4}$/.test(anio) ? Number(anio) : currentYear;
  // El trimestre que se mira: el elegido (?t=Q3), si no el de hoy (o el último de un año que pasó, el primero de uno que viene).
  const picked = QUARTERS.find((q) => q === t);
  const quarter: Quarter = picked ?? (year === currentYear ? quarterOf(today) : year < currentYear ? "Q4" : "Q1");
  const [{ objectives, loose, years }, links, jar, dismissed, { actions, unlinked }] = await Promise.all([
    getObjectives(year),
    getKrLinkOptions(),
    cookies(),
    prisma.appSetting.findUnique({ where: { key: REVIEW_DISMISSED_KEY } }),
    getQuarterActions(year, quarter),
  ]);
  return (
    <ObjectivesView
      key={`${year}-${quarter}`}
      objectives={objectives}
      loose={loose}
      links={links}
      today={today}
      year={year}
      years={years}
      // Año (el mapa), trimestre o semana: la última elegida queda recordada.
      initialTab={objectivesTab(jar.get(OBJECTIVES_VIEW_COOKIE)?.value)}
      quarter={quarter}
      actions={actions}
      unlinked={unlinked}
      reviewDismissed={dismissed?.value ?? null}
    />
  );
}
