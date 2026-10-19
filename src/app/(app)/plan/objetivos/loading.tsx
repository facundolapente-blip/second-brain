import { Bone, LoadingRegion } from "@/components/skeleton";
import { PlanHeaderSkeleton } from "../header-skeleton";

/**
 * Objetivos mientras carga, con la forma de la pantalla: encabezado de verdad
 * (título, pestañas, "Objetivo" y "Nuevo resultado"), los años, el selector de
 * vista y el mapa del año (grilla en la compu, tarjetas de un trimestre en el celular).
 */
export default function Loading() {
  return (
    <>
      <PlanHeaderSkeleton title="Objetivos" active={1} extra="w-[6.6rem]" action="w-[9.6rem]" narrow />
      <LoadingRegion label="Cargando los objetivos" className="mx-auto max-w-3xl px-4 pb-8 lg:max-w-[96rem] lg:px-10">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-3 pb-1">
          <div className="flex items-center gap-1.5">
            <Bone className="h-9 w-16 rounded-full" />
            <Bone className="h-9 w-36 rounded-full" />
          </div>
          <Bone className="h-10 w-56 rounded-full" />
        </div>
        <div className="pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
            <Bone className="h-8 w-52" />
            <Bone className="h-4 w-72 max-sm:w-56" />
          </div>
          <div className="hidden overflow-hidden rounded-2xl border border-line bg-surface lg:block">
            <div className="h-10 border-b border-line bg-surface-2" />
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="grid grid-cols-[minmax(15rem,1.15fr)_repeat(4,minmax(0,1fr))] border-b border-line last:border-b-0">
                <div className="grid gap-2 px-4 py-4">
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
          <div className="grid gap-3 lg:hidden">
            <Bone className="h-10 w-full rounded-full" />
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="grid gap-2.5 rounded-2xl border border-line bg-surface px-4 py-3.5">
                <Bone className="h-3 w-20" />
                <Bone className="h-4 w-2/3" />
                <div className="border-t border-line pt-2.5">
                  <Bone className="h-4 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </LoadingRegion>
    </>
  );
}
