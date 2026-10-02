import { Bone, HeaderSkeleton, LoadingRegion } from "@/components/skeleton";

export default function Loading() {
  return (
    <>
      <HeaderSkeleton title="Cuentas" tabs={6} />
      <LoadingRegion label="Cargando cuentas" className="mx-auto max-w-3xl px-4 lg:px-8">
        <div className="grid grid-cols-2 gap-2 pt-2 pb-5 lg:pt-6">
          <Bone className="h-[94px] rounded-[12px]" />
          <Bone className="h-[94px] rounded-[12px]" />
        </div>
        <div className="grid gap-0.5 border-t border-line pt-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center gap-3.5 px-2 py-3">
              <Bone className="size-10 rounded-[10px]" />
              <div className="grid flex-1 gap-1.5">
                <Bone className="h-3.5 w-28" />
                <Bone className="h-3 w-20" />
              </div>
              <Bone className="h-3.5 w-20" />
            </div>
          ))}
        </div>
      </LoadingRegion>
    </>
  );
}
