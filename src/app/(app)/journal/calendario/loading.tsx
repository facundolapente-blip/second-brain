import { Bone, HeaderSkeleton, LoadingRegion } from "@/components/skeleton";
import { EntryCardSkeleton } from "../skeletons";

export default function Loading() {
  return (
    <>
      <HeaderSkeleton title="Calendario" />
      <LoadingRegion
        label="Cargando calendario"
        className="mx-auto grid max-w-3xl gap-6 px-4 pt-3 lg:grid-cols-2 lg:gap-10 lg:px-8 lg:pt-6"
      >
        <div className="grid content-start gap-4">
          <div className="grid justify-items-center gap-1.5 py-1">
            <Bone className="h-5 w-36" />
            <Bone className="h-3.5 w-48" />
          </div>
          <div className="grid grid-cols-7 justify-items-center gap-y-1">
            {Array.from({ length: 35 }, (_, i) => (
              <Bone key={i} className="size-11 rounded-full" />
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
