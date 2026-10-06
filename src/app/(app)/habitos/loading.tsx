import { Bone, HeaderSkeleton, LoadingRegion } from "@/components/skeleton";

/** Hoy mientras carga: tira de días y filas de hábitos; en la computadora, el panel del día al costado. */
export default function Loading() {
  return (
    <>
      <HeaderSkeleton title="Hábitos" wide />
      <LoadingRegion
        label="Cargando hábitos"
        className="mx-auto max-w-3xl lg:grid lg:max-w-6xl lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-8 lg:px-10 lg:pt-6"
      >
        <div className="lg:rounded-2xl lg:border lg:border-[var(--card-ring)] lg:bg-surface lg:shadow-[var(--card-shadow)]">
          <div className="flex gap-1 overflow-hidden border-b border-line px-3 pt-1 pb-3 lg:px-5 lg:pt-4">
            {Array.from({ length: 12 }, (_, i) => (
              <Bone key={i} className="h-[68px] w-[50px] shrink-0 rounded-[6px]" />
            ))}
          </div>
          <div className="divide-y divide-line px-4 lg:px-6">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex items-center gap-4 py-4">
                <Bone className="size-[42px] shrink-0 rounded-[8px]" />
                <div className="grid flex-1 gap-2">
                  <Bone className={`h-4 ${i % 2 ? "w-28" : "w-40"}`} />
                  <Bone className="h-3.5 w-32" />
                </div>
                <Bone className="size-11 shrink-0 rounded-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="hidden gap-4 lg:grid">
          <Bone className="h-[190px] rounded-2xl" />
          <Bone className="h-[230px] rounded-2xl" />
          <Bone className="h-[220px] rounded-2xl" />
        </div>
      </LoadingRegion>
    </>
  );
}
