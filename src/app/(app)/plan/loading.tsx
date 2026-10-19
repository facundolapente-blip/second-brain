import { CaretLeft, CaretRight } from "@phosphor-icons/react/dist/ssr";
import { Bone, LoadingRegion } from "@/components/skeleton";
import { PlanHeaderSkeleton } from "./header-skeleton";

/**
 * El Plan mientras carga, con la misma forma que la pantalla (para que nada salte
 * al llegar los datos): el encabezado de verdad (título, las dos pestañas, el menú
 * y "Nuevo bloque"), las tareas (tabla en la compu, lista en el celular) y la semana.
 */
export default function Loading() {
  return (
    <>
      <PlanHeaderSkeleton title="Plan semanal" active={0} action="w-[8.6rem]" />
      <LoadingRegion label="Cargando el plan" className="mx-auto max-w-6xl px-4 lg:max-w-[110rem] lg:px-10">
        {/* Tareas */}
        <section className="pt-3 lg:pt-5">
          <div className="flex min-h-11 items-center gap-2">
            <h2 className="display text-[22px] text-muted lg:text-[26px]">Tareas</h2>
            <Bone className="h-3.5 w-32" />
            <Bone className="ml-auto h-9 w-[7.4rem] rounded-full max-sm:size-10" />
          </div>
          <div className="flex gap-1.5 py-3">
            {["w-[7.6rem]", "w-[7rem]", "w-[6rem]", "w-[8.2rem]", "w-[7.5rem]"].map((w, i) => (
              <Bone key={i} className={`h-10 shrink-0 rounded-full ${w}`} />
            ))}
            <Bone className="ml-auto h-10 w-[8.7rem] shrink-0 rounded-full max-lg:hidden" />
          </div>
          {/* Compu: la tabla (mismo ancho que la de verdad con los anchos de fábrica) */}
          <div className="hidden overflow-hidden rounded-xl border border-line-strong bg-surface lg:block min-[90rem]:max-w-[69.5rem]">
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
                <div className="flex h-[55px] items-center gap-4 border-b border-line px-3">
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
          <div className="mt-2 flex min-h-11 items-center px-3">
            <Bone className="h-4 w-28" />
          </div>
        </section>

        {/* Semana: flechas, Día/Semana y la grilla */}
        <div className="flex items-center gap-x-4 py-3 lg:pt-5">
          <div className="flex items-center gap-1">
            <span aria-hidden className="inline-flex size-11 items-center justify-center text-fg">
              <CaretLeft size={18} />
            </span>
            <Bone className="h-6 w-40" />
            <span aria-hidden className="inline-flex size-11 items-center justify-center text-fg">
              <CaretRight size={18} />
            </span>
          </div>
          <Bone className="h-10 w-[8.5rem] rounded-full" />
        </div>
        {/* Celular: tira de días y la lista del día */}
        <div className="lg:hidden">
          <div className="mb-5 grid grid-cols-7 gap-1 border-y border-line py-2">
            {Array.from({ length: 7 }, (_, i) => (
              <Bone key={i} className="h-16 rounded-[6px]" />
            ))}
          </div>
          <div className="mb-3 flex justify-end">
            <Bone className="h-9 w-40 rounded-full" />
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
        <div className="hidden lg:block">
          <div className="mb-3 flex justify-end">
            <Bone className="h-9 w-40 rounded-full" />
          </div>
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
      </LoadingRegion>
    </>
  );
}
