import { CalendarDots, ListChecks } from "@phosphor-icons/react/dist/ssr";
import { Bone, LoadingRegion } from "@/components/skeleton";
import { CardSkeleton, PlanHeaderSkeleton } from "./header-skeleton";

/**
 * El Plan mientras carga, con la misma forma que la pantalla (para que nada salte
 * al llegar los datos): el encabezado de verdad (título, las dos pestañas, el menú
 * y "Nuevo bloque"), la tarjeta de tareas (tabla en la compu, lista en el celular)
 * y la de la semana, las dos con su cabecera teñida.
 */
export default function Loading() {
  return (
    <>
      <PlanHeaderSkeleton title="Plan semanal" active={0} action="w-[8.6rem]" />
      <LoadingRegion label="Cargando el plan" className="mx-auto max-w-6xl px-4 lg:max-w-[110rem] lg:px-10">
        {/* Tareas */}
        <CardSkeleton icon={ListChecks} title="Tareas" meta="w-36" pill="w-[4.9rem] sm:w-[10rem] lg:w-[7.4rem]" className="mt-3 lg:mt-5" bodyClassName="p-0! gap-0!">
          <div className="px-[18px] pt-3 pb-[18px] lg:px-0 lg:pb-3">
            <div className="flex gap-1.5 overflow-hidden pt-1 pb-3.5 lg:px-5">
              {["w-[7.6rem]", "w-[7rem]", "w-[6rem]", "w-[8.2rem]", "w-[7.5rem]"].map((w, i) => (
                <Bone key={i} className={`h-10 shrink-0 rounded-full ${w}`} />
              ))}
              <Bone className="ml-auto h-10 w-[8.7rem] shrink-0 rounded-full max-lg:hidden" />
            </div>
            {/* Compu: la tabla, a todo el ancho de la tarjeta */}
            <div className="hidden overflow-hidden border-y border-line-strong lg:block">
              <div className="h-[38px] border-b border-line-strong bg-surface-2" />
              <div className="h-9 border-b border-line-strong bg-surface-2 px-4 py-3">
                <Bone className="h-3 w-24" />
              </div>
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i}>
                  {/* Segundo grupo de estado, como en la tabla de verdad. */}
                  {i === 4 && (
                    <div className="h-9 border-b border-line-strong bg-surface-2 px-4 py-3">
                      <Bone className="h-3 w-24" />
                    </div>
                  )}
                  <div className="flex h-[55px] items-center gap-4 border-b border-line px-3 last:border-b-0">
                    <Bone className="h-[42px] w-11 rounded-lg" />
                    <Bone className="h-4 w-56" />
                    <Bone className="ml-auto h-4 w-20" />
                  </div>
                </div>
              ))}
            </div>
            {/* Celular: la lista con la fecha a la izquierda */}
            <div className="border-t border-line lg:hidden">
              <div className="border-b border-line px-1 py-3">
                <Bone className="h-3 w-24" />
              </div>
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="flex items-start gap-3 border-b border-line px-1 py-3">
                  <Bone className="h-[42px] w-11 rounded-lg" />
                  <span className="grid flex-1 gap-2 pt-0.5">
                    <Bone className="h-4 w-3/4" />
                    <Bone className="h-6 w-1/2 rounded-md" />
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-2 flex min-h-11 items-center px-3 lg:px-5">
              <Bone className="h-4 w-28" />
            </div>
          </div>
        </CardSkeleton>

        {/* Semana: período con flechas, Día/Semana y Lista/Por horas en la banda; la grilla abajo */}
        <CardSkeleton
          icon={CalendarDots}
          title={<Bone className="h-4 w-36" />}
          meta="w-24"
          bar
          className="mt-5 lg:mt-7"
          extra={
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <Bone className="h-10 w-[8.5rem] rounded-full" />
              <Bone className="ml-auto h-10 w-40 rounded-full" />
            </div>
          }
          pill="w-[4.75rem]"
        >
          {/* Celular: tira de días y la lista del día */}
          <div className="lg:hidden">
            <div className="mb-4 grid grid-cols-7 gap-1 border-b border-line pb-3">
              {Array.from({ length: 7 }, (_, i) => (
                <Bone key={i} className="h-16 rounded-[10px]" />
              ))}
            </div>
            <Bone className="mb-3 h-7 w-44" />
            <div className="border-t border-line">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="grid grid-cols-[60px_1fr] gap-3 border-b border-line py-3">
                  <Bone className="ml-auto h-4 w-9" />
                  <span className="grid gap-2">
                    <Bone className="h-4 w-2/3" />
                    <Bone className="h-6 w-20 rounded-md" />
                  </span>
                </div>
              ))}
            </div>
          </div>
          {/* Compu: siete columnas */}
          <div className="hidden overflow-hidden lg:block">
            <div className="grid min-w-[57.75rem] grid-cols-[repeat(7,minmax(8.25rem,1fr))] border-t border-fg/80">
              {Array.from({ length: 7 }, (_, i) => (
                <div key={i} className="grid min-h-[60dvh] content-start gap-2 border-r border-line px-2.5 last:border-r-0">
                  <div className="grid gap-1.5 border-b border-line px-1 pt-3 pb-2.5">
                    <Bone className="h-3 w-16" />
                    <Bone className="h-8 w-9" />
                  </div>
                  {i % 3 === 1 && <Bone className="h-24 rounded-xl" />}
                </div>
              ))}
            </div>
          </div>
        </CardSkeleton>
      </LoadingRegion>
    </>
  );
}
