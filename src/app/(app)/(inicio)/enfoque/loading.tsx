import { ClockCounterClockwise, Timer } from "@phosphor-icons/react/dist/ssr";
import { Bone, CardSkeleton, HeaderSkeleton, LoadingRegion } from "@/components/skeleton";

export default function Loading() {
  return (
    <div data-module="inicio" className="min-h-dvh">
      <HeaderSkeleton title="Enfoque" tabs={0} wide />
      <LoadingRegion label="Cargando enfoque" className="mx-auto grid max-w-6xl grid-cols-1 gap-4 px-4 pt-2 xl:grid-cols-12 lg:gap-5 lg:px-10 lg:pt-4">
        <CardSkeleton icon={Timer} title="Enfoque" pill="w-24" className="xl:col-span-5" bodyClassName="justify-items-center gap-5! py-6!">
          <Bone className="h-9 w-full max-w-sm rounded-full" />
          <Bone className="size-[min(68vw,248px)] rounded-full" />
          <Bone className="h-10 w-48 rounded-full" />
          <Bone className="h-12 w-64 rounded-full" />
        </CardSkeleton>
        <CardSkeleton icon={ClockCounterClockwise} title="Historial" className="xl:col-span-7" bodyClassName="gap-4!">
          <Bone className="h-32 w-full rounded-xl" />
          {Array.from({ length: 4 }, (_, i) => (
            <Bone key={i} className="h-12 w-full rounded-xl" />
          ))}
        </CardSkeleton>
      </LoadingRegion>
    </div>
  );
}
