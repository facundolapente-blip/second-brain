import { Target } from "@phosphor-icons/react/dist/ssr";
import { Bone, LoadingRegion } from "@/components/skeleton";
import { CardSkeleton, PlanHeaderSkeleton } from "../header-skeleton";

/**
 * Objetivos mientras carga, con la forma de la pantalla: encabezado de verdad
 * (título, pestañas y "Nuevo resultado"), los años y la tarjeta del año con su
 * cabecera teñida (el selector de vista en la banda) y el mapa (grilla en la compu,
 * un trimestre por fila en el celular).
 */
export default function Loading() {
  return (
    <>
      <PlanHeaderSkeleton title="Objetivos" active={1} action="w-[9.6rem]" narrow noMenu />
      <LoadingRegion label="Cargando los objetivos" className="mx-auto max-w-3xl px-4 pb-8 lg:max-w-[96rem] lg:px-10">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-3 pb-1">
          <div className="flex items-center gap-1.5">
            <Bone className="h-9 w-16 rounded-full" />
            <Bone className="h-9 w-36 rounded-full" />
          </div>
        </div>
        <CardSkeleton
          icon={Target}
          title="Objetivos"
          meta="w-56 max-sm:w-40"
          pill="w-[6.4rem]"
          bar
          className="mt-4"
          bodyClassName="lg:p-0!"
          extra={
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Bone className="h-10 w-56 rounded-full" />
              <Bone className="h-4 w-72 max-lg:hidden" />
            </div>
          }
        >
          <div className="hidden lg:block">
            <div className="h-10 border-b border-line bg-surface-2" />
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="grid grid-cols-[minmax(15rem,1.15fr)_repeat(4,minmax(0,1fr))] border-b border-line last:border-b-0">
                <div className="grid gap-2 py-4 pr-4 pl-5">
                  <Bone className="h-3 w-20" />
                  <Bone className="h-4 w-44" />
                  <Bone className="h-1.5 w-full rounded-full" />
                </div>
                {Array.from({ length: 4 }, (_, j) => (
                  <div key={j} className="grid content-start gap-2 border-l border-line px-4 py-4">
                    {(i + j) % 2 === 0 && <Bone className="h-4 w-3/4" />}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="grid gap-1 lg:hidden">
            <Bone className="h-10 w-full rounded-full" />
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="grid gap-2.5 border-b border-line py-3.5 last:border-b-0">
                <Bone className="h-3 w-20" />
                <Bone className="h-4 w-2/3" />
                <div className="border-t border-line pt-2.5">
                  <Bone className="h-4 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </CardSkeleton>
      </LoadingRegion>
    </>
  );
}
