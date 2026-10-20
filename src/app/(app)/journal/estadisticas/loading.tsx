import { CalendarCheck, ChartBar, Fire, TextAa, Trophy } from "@phosphor-icons/react/dist/ssr";
import { Bone, CardSkeleton, HeaderSkeleton, LoadingRegion, StatSkeleton } from "@/components/skeleton";

/** Estadísticas del journal mientras carga: la cifra grande, las cuatro cifras y las tarjetas (diseño 4). */
export default function Loading() {
  return (
    <>
      <HeaderSkeleton title="Estadísticas" wide />
      <LoadingRegion
        label="Cargando estadísticas"
        className="mx-auto grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-4 px-4 pt-3 lg:max-w-6xl lg:grid-cols-12 lg:gap-5 lg:px-10 lg:pt-8"
      >
        <section aria-hidden className="grid gap-5 pb-2 lg:col-span-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end lg:gap-10 lg:pb-3">
          <div className="grid gap-2">
            <Bone className="h-3.5 w-28" />
            <Bone className="h-12 w-40" />
            <Bone className="h-4 w-64" />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatSkeleton icon={Fire} label="Racha" />
            <StatSkeleton icon={Trophy} label="Récord" />
            <StatSkeleton icon={TextAa} label="Por entrada" />
            <StatSkeleton icon={ChartBar} label="La más larga" />
          </div>
        </section>
        <CardSkeleton icon={CalendarCheck} title="Constancia" meta="w-36" className="lg:col-span-7">
          <div className="grid grid-cols-[2.5rem_repeat(12,minmax(0,1fr))] gap-1">
            {Array.from({ length: 5 * 13 }, (_, i) =>
              i % 13 === 0 ? <Bone key={i} className="h-3 w-8 self-center" /> : <Bone key={i} className="aspect-square rounded-[4px]" />,
            )}
          </div>
        </CardSkeleton>
        <CardSkeleton icon={ChartBar} title="w-32" meta="w-28" className="lg:col-span-5">
          <div className="flex h-40 items-end gap-2">
            {[30, 55, 80, 45, 65, 90, 40].map((h, i) => (
              <Bone key={i} className="flex-1 rounded-t-[4px]" style={{ height: `${h}%` }} />
            ))}
          </div>
        </CardSkeleton>
      </LoadingRegion>
    </>
  );
}
