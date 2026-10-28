import { formatMonth, formatShort, todayISO } from "@/lib/dates";
import { SlideOnChange } from "@/components/motion-wrap";
import { getHealth } from "@/lib/health";
import { periodFromParams } from "@/lib/health-logic";
import { HealthView } from "./health-view";

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: PageProps<"/salud">) {
  const p = periodFromParams(await searchParams, todayISO());
  return { title: p.kind === "year" ? `Salud ${p.key}` : p.kind === "week" ? `Salud · semana del ${formatShort(p.key)}` : `Salud · ${formatMonth(p.key)}` };
}

export default async function SaludPage({ searchParams }: PageProps<"/salud">) {
  const p = periodFromParams(await searchParams, todayISO());
  const data = await getHealth(p.kind, p.key);
  return (
    <div data-module="inicio" className="min-h-dvh">
      {/* Otro mes o año: entra desde ese lado (al cargar no se anima nada). */}
      <SlideOnChange k={data.period.key}>
        <HealthView data={data} />
      </SlideOnChange>
    </div>
  );
}
