import { Bone, HeaderSkeleton, LoadingRegion } from "@/components/skeleton";

/** Categorías mientras cargan: gastos e ingresos (en la computadora, lado a lado). */
export default function Loading() {
  return (
    <>
      <HeaderSkeleton title="Categorías" tabs={6} wide />
      <LoadingRegion
        label="Cargando categorías"
        className="mx-auto grid max-w-3xl gap-3 px-4 pt-3 lg:max-w-6xl lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-10 lg:px-10 lg:pt-6"
      >
        {[10, 3].map((n, s) => (
          <div key={s} className={s ? "hidden gap-2 lg:grid lg:content-start" : "grid content-start gap-2"}>
            <Bone className="h-6 w-28" />
            <div className={`grid gap-0.5 ${s ? "" : "sm:grid-cols-2"}`}>
              {Array.from({ length: n }, (_, i) => (
                <div key={i} className="flex items-center gap-3.5 px-2 py-2.5">
                  <Bone className="size-10 rounded-full" />
                  <div className="grid flex-1 gap-1.5">
                    <Bone className="h-3.5 w-28" />
                    <Bone className="h-3 w-20" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </LoadingRegion>
    </>
  );
}
