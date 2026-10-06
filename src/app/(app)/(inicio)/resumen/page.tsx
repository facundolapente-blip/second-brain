import { formatMonth, todayISO } from "@/lib/dates";
import { getMonthlySummary } from "@/lib/monthly";
import { SummaryView } from "./summary-view";

export const dynamic = "force-dynamic";

/** El mes pedido (YYYY-MM, no futuro) o el actual. */
function monthOf(mes: string | string[] | undefined) {
  const current = todayISO().slice(0, 7);
  return typeof mes === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) && mes <= current ? mes : current;
}

export async function generateMetadata({ searchParams }: PageProps<"/resumen">) {
  const m = monthOf((await searchParams).mes);
  // El título es el nombre del PDF al guardarlo.
  return { title: `Resumen de ${formatMonth(m)}` };
}

export default async function ResumenPage({ searchParams }: PageProps<"/resumen">) {
  const s = await getMonthlySummary(monthOf((await searchParams).mes));
  return (
    <div data-module="inicio" className="min-h-dvh">
      <SummaryView key={s.month} s={s} />
    </div>
  );
}
