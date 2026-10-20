import { ChartBar, Fire, Medal } from "@phosphor-icons/react/dist/ssr";
import { Bone, CardSkeleton, HeaderSkeleton, LoadingRegion } from "@/components/skeleton";

/**
 * Hoy mientras carga, con la forma del diseño 4: la tarjeta verde del día (barra, datos de la
 * semana y tira de días), la lista de hábitos en su tarjeta blanca y, en la computadora,
 * "Esta semana" y "Rachas en curso" al costado.
 */
export default function Loading() {
  return (
    <>
      <HeaderSkeleton title="Hábitos" wide />
      <LoadingRegion
        label="Cargando hábitos"
        className="mx-auto grid max-w-3xl gap-3.5 px-4 pt-1 lg:max-w-6xl lg:items-start lg:gap-6 lg:px-10 lg:pt-6 xl:grid-cols-[minmax(0,1fr)_340px]"
      >
        <div className="grid min-w-0 gap-3.5 lg:gap-5">
          <CardSkeleton
            icon={Medal}
            title="w-36"
            meta="w-44"
            pill="w-12"
            bar
            bodyClassName="hidden!"
            extra={
              <div className="grid gap-3">
                <div className="flex gap-1.5 xl:hidden">
                  <Bone className="h-7 w-28 rounded-full" />
                  <Bone className="h-7 w-32 rounded-full" />
                </div>
                <div className="grid grid-cols-7 gap-1.5">
                  {Array.from({ length: 7 }, (_, i) => (
                    <Bone key={i} className="h-[62px] rounded-[12px]" />
                  ))}
                </div>
              </div>
            }
          />
          <section aria-hidden className="overflow-hidden rounded-[22px] border bg-surface">
            <div className="flex items-baseline justify-between gap-3 px-4 pt-3.5 pb-1 lg:px-6 lg:pt-4">
              <Bone className="h-3 w-20" />
              <Bone className="h-3 w-16" />
            </div>
            <div className="divide-y divide-line px-4 lg:px-6">
              {Array.from({ length: 7 }, (_, i) => (
                <div key={i} className="flex items-center gap-4 py-[11px] lg:py-4">
                  <Bone className="size-[34px] shrink-0 rounded-[8px]" />
                  <div className="grid flex-1 gap-2">
                    <Bone className={`h-4 ${i % 2 ? "w-28" : "w-40"}`} />
                    <Bone className="h-3.5 w-36" />
                  </div>
                  <Bone className="size-10 shrink-0 rounded-full" />
                </div>
              ))}
            </div>
          </section>
        </div>
        <aside aria-hidden className="hidden content-start gap-4 xl:grid">
          <CardSkeleton icon={ChartBar} title="Esta semana" meta="w-24">
            <div className="flex h-24 items-end gap-2">
              {[40, 70, 55, 90, 30, 65, 50].map((h, i) => (
                <Bone key={i} className="flex-1 rounded-t-[4px]" style={{ height: `${h}%` }} />
              ))}
            </div>
          </CardSkeleton>
          <CardSkeleton icon={Fire} title="Rachas en curso" meta={null}>
            <Bone className="h-4 w-full" />
            <Bone className="h-4 w-3/4" />
          </CardSkeleton>
        </aside>
      </LoadingRegion>
    </>
  );
}
