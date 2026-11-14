import { Bone, HeaderSkeleton, LoadingRegion } from "@/components/skeleton";

export default function Loading() {
  return (
    <div data-module="inicio" className="min-h-dvh">
      <HeaderSkeleton title="Rueda de la vida" tabs={0} wide />
      <LoadingRegion label="Cargando la rueda" className="mx-auto grid max-w-6xl gap-4 px-4 pt-2 lg:grid-cols-12 lg:gap-5 lg:px-10 lg:pt-4">
        <Bone className="h-[34rem] rounded-[20px] lg:col-span-12" />
        <Bone className="h-56 rounded-[20px] lg:col-span-12" />
      </LoadingRegion>
    </div>
  );
}
