import { Bone, HeaderSkeleton, LoadingRegion } from "@/components/skeleton";

export default function Loading() {
  return (
    <div data-module="inicio" className="min-h-dvh">
      <HeaderSkeleton title="Salud" tabs={0} wide />
      <LoadingRegion label="Cargando salud" className="mx-auto grid max-w-6xl gap-4 px-4 pt-2 lg:grid-cols-2 lg:gap-5 lg:px-10 lg:pt-4">
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 lg:col-span-2 lg:grid-cols-4 lg:gap-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Bone key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Bone className="h-72 rounded-[20px]" />
        <Bone className="h-72 rounded-[20px]" />
      </LoadingRegion>
    </div>
  );
}
