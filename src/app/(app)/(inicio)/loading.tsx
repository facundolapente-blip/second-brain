import { Bone, HeaderSkeleton, LoadingRegion } from "@/components/skeleton";

export default function Loading() {
  return (
    <div data-module="inicio" className="min-h-dvh">
      <HeaderSkeleton title="Inicio" tabs={0} />
      <LoadingRegion label="Cargando inicio" className="mx-auto grid max-w-6xl gap-4 px-4 pt-2 lg:grid-cols-12 lg:gap-5 lg:px-10 lg:pt-4">
        <Bone className="h-56 rounded-[22px] lg:col-span-12" />
        <Bone className="h-80 rounded-[20px] lg:col-span-5" />
        <Bone className="h-80 rounded-[20px] lg:col-span-7" />
        <Bone className="h-64 rounded-[20px] lg:col-span-12" />
      </LoadingRegion>
    </div>
  );
}
