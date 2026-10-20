import { ChartBar, ClockCounterClockwise, Notebook, PenNib, CalendarCheck } from "@phosphor-icons/react/dist/ssr";
import { Bone, CardSkeleton, HeaderSkeleton, LoadingRegion, StatSkeleton } from "@/components/skeleton";
import { EntryCardSkeleton } from "./skeletons";

/**
 * Lista del journal mientras carga, con la forma del diseño 4: saludo, el recuerdo y un año
 * en su tarjeta lavanda con las entradas; en la computadora, el recuerdo, las tres cifras y
 * las últimas semanas a la derecha.
 */
export default function Loading() {
  return (
    <>
      <HeaderSkeleton title="Journal" wide />
      <LoadingRegion
        label="Cargando entradas"
        className="mx-auto max-w-3xl px-4 pt-3 lg:grid lg:max-w-6xl lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-10 lg:px-10 lg:pt-8"
      >
        <div className="grid min-w-0 gap-5">
          <div className="grid gap-2.5">
            <Bone className="h-3.5 w-36" />
            <Bone className="h-9 w-64" />
          </div>
          <CardSkeleton icon={ClockCounterClockwise} title="w-28" meta="w-40" pill="w-9" className="lg:hidden!">
            <Bone className="h-4 w-full" />
            <Bone className="h-4 w-4/5" />
          </CardSkeleton>
          <CardSkeleton icon={Notebook} title="w-14" meta="w-24" bodyClassName="gap-0! py-1!">
            {Array.from({ length: 4 }, (_, i) => (
              <EntryCardSkeleton key={i} />
            ))}
          </CardSkeleton>
        </div>
        <div aria-hidden className="hidden content-start gap-5 lg:grid">
          <CardSkeleton icon={ClockCounterClockwise} title="w-32" meta="w-44" pill="w-9">
            <Bone className="h-4 w-full" />
            <Bone className="h-4 w-full" />
            <Bone className="h-4 w-3/5" />
          </CardSkeleton>
          <div className="grid grid-cols-3 gap-3">
            <StatSkeleton icon={PenNib} label="Entradas" />
            <StatSkeleton icon={CalendarCheck} label="Días" />
            <StatSkeleton icon={ChartBar} label="Palabras" />
          </div>
          <CardSkeleton icon={ChartBar} title="Últimas cinco semanas" meta="w-28">
            <Bone className="h-28 w-full rounded-[10px]" />
          </CardSkeleton>
        </div>
      </LoadingRegion>
    </>
  );
}
