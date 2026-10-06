import { Bone, HeaderSkeleton, LoadingRegion } from "@/components/skeleton";

/** Informes mientras cargan, con la grilla de tarjetas de la computadora. */
export default function Loading() {
  return (
    <>
      <HeaderSkeleton title="Informes" tabs={6} wide />
      <LoadingRegion
        label="Cargando informes"
        className="mx-auto grid max-w-3xl gap-9 px-4 pt-3 lg:max-w-6xl lg:grid-cols-12 lg:gap-5 lg:px-10 lg:pt-6"
      >
        <div className="grid gap-3 lg:col-span-12 lg:grid-cols-[1fr_minmax(0,340px)] lg:items-center">
          <Bone className="h-6 w-40" />
          <Bone className="h-[92px] rounded-[8px]" />
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4 lg:col-span-12">
          {["h-10", "h-7", "h-7", "h-7"].map((h, i) => (
            <div key={i} className="grid gap-2">
              <Bone className="h-3.5 w-20" />
              <Bone className={`${h} w-28`} />
            </div>
          ))}
        </div>
        <div className="grid gap-3 lg:col-span-7">
          <Bone className="h-5 w-32" />
          <Bone className="h-[180px] rounded-[8px]" />
        </div>
        <div className="grid content-start gap-3.5 lg:col-span-5">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="grid grid-cols-[32px_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5">
              <Bone className="row-span-2 size-8 rounded-full" />
              <Bone className="h-3.5 w-32" />
              <Bone className="h-2" style={{ width: `${90 - i * 20}%` }} />
            </div>
          ))}
        </div>
      </LoadingRegion>
    </>
  );
}
