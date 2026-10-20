import { BookOpen, CalendarBlank } from "@phosphor-icons/react/dist/ssr";
import { Bone, CardSkeleton, HeaderSkeleton, LoadingRegion } from "@/components/skeleton";
import { EntryCardSkeleton } from "../skeletons";

/** Calendario del journal mientras carga: el mes en su tarjeta y el día elegido al lado (diseño 4). */
export default function Loading() {
  return (
    <>
      <HeaderSkeleton title="Calendario" wide />
      <LoadingRegion
        label="Cargando calendario"
        className="mx-auto grid max-w-3xl gap-4 px-4 pt-3 lg:max-w-6xl lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start lg:gap-6 lg:px-10 lg:pt-8"
      >
        <CardSkeleton icon={CalendarBlank} title="Calendario" meta="w-36" bodyClassName="gap-4! lg:px-7! lg:pb-7!">
          <div className="grid justify-items-center gap-1.5 py-1">
            <Bone className="h-5 w-36" />
            <Bone className="h-3.5 w-48" />
          </div>
          <div className="grid grid-cols-7 justify-items-center gap-y-1 lg:gap-y-2">
            {Array.from({ length: 35 }, (_, i) => (
              <Bone key={i} className="size-11 rounded-full lg:size-14" />
            ))}
          </div>
        </CardSkeleton>
        <CardSkeleton icon={BookOpen} title="w-40" meta="w-24" bodyClassName="gap-0! py-1!">
          <EntryCardSkeleton />
        </CardSkeleton>
      </LoadingRegion>
    </>
  );
}
