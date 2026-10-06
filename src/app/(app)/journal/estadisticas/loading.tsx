import { Bone, HeaderSkeleton, LoadingRegion } from "@/components/skeleton";

export default function Loading() {
  return (
    <>
      <HeaderSkeleton title="Estadísticas" wide />
      <LoadingRegion label="Cargando estadísticas" className="mx-auto grid max-w-3xl gap-10 px-4 pt-4 lg:max-w-6xl lg:grid-cols-12 lg:gap-5 lg:px-10 lg:pt-8">
        <div className="grid gap-6 lg:col-span-12 lg:grid-cols-2 lg:items-end lg:gap-10">
          <div className="grid gap-2">
            <Bone className="h-3.5 w-28" />
            <Bone className="h-12 w-40" />
            <Bone className="h-4 w-64" />
          </div>
          <Bone className="h-[104px] rounded-[8px]" />
        </div>
        <div className="grid content-start gap-3 lg:col-span-7 lg:rounded-2xl lg:border lg:border-[var(--card-ring)] lg:bg-surface lg:p-7 lg:shadow-[var(--card-shadow)]">
          <Bone className="h-5 w-28" />
          <div className="grid grid-cols-[2.5rem_repeat(12,minmax(0,1fr))] gap-1">
            {Array.from({ length: 5 * 13 }, (_, i) =>
              i % 13 === 0 ? <Bone key={i} className="h-3 w-8 self-center" /> : <Bone key={i} className="aspect-square rounded-[4px]" />,
            )}
          </div>
        </div>
        <Bone className="hidden h-[380px] rounded-2xl lg:col-span-5 lg:block" />
      </LoadingRegion>
    </>
  );
}
