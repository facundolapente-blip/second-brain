import { Bone, HeaderSkeleton, LoadingRegion } from "@/components/skeleton";
import { EntryCardSkeleton } from "../skeletons";

export default function Loading() {
  return (
    <>
      <HeaderSkeleton title="Calendario" wide />
      <LoadingRegion
        label="Cargando calendario"
        className="mx-auto grid max-w-3xl gap-6 px-4 pt-3 lg:max-w-6xl lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-10 lg:px-10 lg:pt-8"
      >
        <div className="grid content-start gap-4 lg:rounded-2xl lg:border lg:border-[var(--card-ring)] lg:bg-surface lg:p-7 lg:shadow-[var(--card-shadow)]">
          <div className="grid justify-items-center gap-1.5 py-1">
            <Bone className="h-5 w-36" />
            <Bone className="h-3.5 w-48" />
          </div>
          <div className="grid grid-cols-7 justify-items-center gap-y-1 lg:gap-y-2">
            {Array.from({ length: 35 }, (_, i) => (
              <Bone key={i} className="size-11 rounded-full lg:size-14" />
            ))}
          </div>
        </div>
        <div className="grid content-start gap-3">
          <Bone className="h-5 w-52" />
          <EntryCardSkeleton />
        </div>
      </LoadingRegion>
    </>
  );
}
