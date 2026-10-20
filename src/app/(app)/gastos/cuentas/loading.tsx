import { Bone, HeaderSkeleton, LoadingRegion } from "@/components/skeleton";

/** Cuentas mientras cargan: totales por moneda y la lista (en la computadora, tarjetas de a tres). */
export default function Loading() {
  return (
    <>
      <HeaderSkeleton title="Cuentas" tabs={6} wide />
      <LoadingRegion label="Cargando cuentas" className="mx-auto max-w-3xl px-4 lg:max-w-6xl lg:px-10">
        <div className="grid grid-cols-2 gap-2 pt-2 pb-5 lg:gap-4 lg:pt-6">
          <Bone className="h-[94px] rounded-[20px] lg:h-[118px] lg:rounded-[20px]" />
          <Bone className="h-[94px] rounded-[20px] lg:h-[118px] lg:rounded-[20px]" />
        </div>
        <div className="grid gap-0.5 border-t border-line pt-2 lg:hidden">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center gap-3.5 px-2 py-3">
              <Bone className="size-10 rounded-[6px]" />
              <div className="grid flex-1 gap-1.5">
                <Bone className="h-3.5 w-28" />
                <Bone className="h-3 w-20" />
              </div>
              <Bone className="h-3.5 w-20" />
            </div>
          ))}
        </div>
        <div className="hidden grid-cols-3 gap-4 lg:grid">
          {Array.from({ length: 6 }, (_, i) => (
            <Bone key={i} className="h-[154px] rounded-[20px]" />
          ))}
        </div>
      </LoadingRegion>
    </>
  );
}
