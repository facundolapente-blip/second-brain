import { isISODate, todayISO } from "@/lib/dates";
import { SlideOnChange } from "@/components/motion-wrap";
import { getWeeklyReview } from "@/lib/review";
import { ReviewView } from "./review-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Revisión semanal" };

export default async function SemanaPage({ searchParams }: PageProps<"/semana">) {
  const { semana } = await searchParams;
  const r = await getWeeklyReview(isISODate(semana) ? semana : todayISO());
  return (
    <div data-module="inicio" className="min-h-dvh">
      <SlideOnChange k={r.monday}>
        <ReviewView r={r} />
      </SlideOnChange>
    </div>
  );
}
