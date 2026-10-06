import { Bone, HeaderSkeleton, LoadingRegion } from "@/components/skeleton";
import { EntryCardSkeleton } from "./skeletons";

/**
 * Lista del journal mientras carga: saludo, recuerdo y tarjetas con columna de
 * fecha; en la computadora, el panel de la derecha con el recuerdo y el resumen.
 */
export default function Loading() {
  return (
    <>
      <HeaderSkeleton title="Journal" wide />
      <LoadingRegion
        label="Cargando entradas"
        className="mx-auto max-w-3xl px-4 pt-4 lg:grid lg:max-w-6xl lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-10 lg:px-10 lg:pt-8"
      >
        <div className="grid gap-6">
          <div className="grid gap-2.5">
            <Bone className="h-3.5 w-36" />
            <Bone className="h-9 w-64" />
          </div>
          <Bone className="h-44 rounded-[8px] lg:hidden" />
          <Bone className="h-8 w-20" />
          <div>
            {Array.from({ length: 4 }, (_, i) => (
              <EntryCardSkeleton key={i} />
            ))}
          </div>
        </div>
        <div className="hidden gap-5 lg:grid">
          <Bone className="h-56 rounded-2xl" />
          <div className="grid grid-cols-3 gap-3">
            <Bone className="h-[104px] rounded-2xl" />
            <Bone className="h-[104px] rounded-2xl" />
            <Bone className="h-[104px] rounded-2xl" />
          </div>
          <Bone className="h-64 rounded-2xl" />
        </div>
      </LoadingRegion>
    </>
  );
}
