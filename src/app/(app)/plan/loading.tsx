import { Bone, HeaderSkeleton, LoadingRegion } from "@/components/skeleton";

/** La semana mientras carga: tira de días y algunos bloques. */
export default function Loading() {
  return (
    <>
      <HeaderSkeleton title="Semana" tabs={3} />
      <LoadingRegion label="Cargando la semana" className="mx-auto max-w-6xl px-4 lg:px-8">
        <div className="flex items-center justify-between py-3">
          <Bone className="h-6 w-44" />
          <Bone className="h-6 w-24" />
        </div>
        <div className="grid grid-cols-7 gap-1.5 pb-4 lg:hidden">
          {Array.from({ length: 7 }, (_, i) => (
            <Bone key={i} className="h-14 rounded-none" />
          ))}
        </div>
        <div className="grid gap-2.5 lg:grid-cols-7">
          {Array.from({ length: 7 }, (_, i) => (
            <Bone key={i} className="h-20 rounded-none" />
          ))}
        </div>
      </LoadingRegion>
    </>
  );
}
