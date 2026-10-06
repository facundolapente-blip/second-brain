import { Bone, HeaderSkeleton, LoadingRegion } from "@/components/skeleton";

export default function Loading() {
  return (
    <>
      <HeaderSkeleton title="Estadísticas" />
      <LoadingRegion label="Cargando estadísticas" className="mx-auto grid max-w-3xl gap-10 px-4 pt-4 lg:px-8 lg:pt-8">
        <div className="grid gap-6">
          <div className="grid gap-2">
            <Bone className="h-3.5 w-28" />
            <Bone className="h-12 w-40" />
            <Bone className="h-4 w-64" />
          </div>
          <Bone className="h-[104px] rounded-[8px]" />
        </div>
        <div className="grid gap-3">
          <Bone className="h-5 w-28" />
          <div className="grid grid-cols-[2.5rem_repeat(12,minmax(0,1fr))] gap-1">
            {Array.from({ length: 5 * 13 }, (_, i) =>
              i % 13 === 0 ? <Bone key={i} className="h-3 w-8 self-center" /> : <Bone key={i} className="aspect-square rounded-[4px]" />,
            )}
          </div>
        </div>
      </LoadingRegion>
    </>
  );
}
