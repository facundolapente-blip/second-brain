import { Bone, HeaderSkeleton, LoadingRegion } from "@/components/skeleton";
import { EntryCardSkeleton } from "./skeletons";

/** Lista del journal mientras carga: saludo, recuerdo y tarjetas con columna de fecha. */
export default function Loading() {
  return (
    <>
      <HeaderSkeleton title="Journal" />
      <LoadingRegion label="Cargando entradas" className="mx-auto grid max-w-3xl gap-6 px-4 pt-4 lg:px-8 lg:pt-6">
        <div className="grid gap-2.5">
          <Bone className="h-8 w-60" />
          <Bone className="h-4 w-44" />
        </div>
        <Bone className="h-44 rounded-[18px]" />
        <Bone className="h-5 w-12" />
        {Array.from({ length: 4 }, (_, i) => (
          <EntryCardSkeleton key={i} />
        ))}
      </LoadingRegion>
    </>
  );
}
