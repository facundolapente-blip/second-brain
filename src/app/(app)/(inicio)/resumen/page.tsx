import { formatMonth, todayISO } from "@/lib/dates";
import { SlideOnChange } from "@/components/motion-wrap";
import { getMonthlySummary, getYearSummary } from "@/lib/monthly";
import { SummaryView } from "./summary-view";

export const dynamic = "force-dynamic";

/** El mes pedido (YYYY-MM, no futuro) o el actual. */
function monthOf(mes: string | string[] | undefined) {
  const current = todayISO().slice(0, 7);
  return typeof mes === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) && mes <= current ? mes : current;
}

/** El año pedido (no futuro), o null si no se pidió uno. */
function yearOf(anio: string | string[] | undefined) {
  return typeof anio === "string" && /^\d{4}$/.test(anio) && anio <= todayISO().slice(0, 4) && anio >= "2000" ? anio : null;
}

export async function generateMetadata({ searchParams }: PageProps<"/resumen">) {
  const sp = await searchParams;
  const y = yearOf(sp.anio);
  // El título es el nombre del PDF al guardarlo.
  return { title: y ? `Tu año ${y}` : `Resumen de ${formatMonth(monthOf(sp.mes))}` };
}

export default async function ResumenPage({ searchParams }: PageProps<"/resumen">) {
  const sp = await searchParams;
  const y = yearOf(sp.anio);
  const s = y ? await getYearSummary(y) : await getMonthlySummary(monthOf(sp.mes));
  return (
    <div data-module="inicio" className="min-h-dvh">
      {/* Otro mes o año: entra desde ese lado (pasar de mes a año, con el mismo deslizamiento). */}
      <SlideOnChange k={`${s.period.key}`}>
        <SummaryView s={s} />
      </SlideOnChange>
    </div>
  );
}
