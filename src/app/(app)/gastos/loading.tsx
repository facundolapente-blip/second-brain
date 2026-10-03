import { Bone, HeaderSkeleton, LoadingRegion } from "@/components/skeleton";
import { TxListSkeleton } from "./skeletons";

/** Movimientos (y las listas que cuelgan de Gastos) mientras cargan. */
export default function Loading() {
  return (
    <>
      <HeaderSkeleton title="Gastos" tabs={6} />
      <LoadingRegion label="Cargando movimientos" className="mx-auto max-w-3xl px-4 lg:px-8">
        <div className="grid gap-5 pt-3 pb-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)] lg:items-end lg:gap-10 lg:pt-6">
          <div className="grid gap-3">
            <Bone className="h-6 w-40" />
            <div className="grid gap-2">
              <Bone className="h-3.5 w-24" />
              <Bone className="h-10 w-44" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Bone className="h-[68px] rounded-none" />
              <Bone className="h-[68px] rounded-none" />
            </div>
          </div>
          <Bone className="h-[92px] rounded-none" />
        </div>
        <TxListSkeleton />
      </LoadingRegion>
    </>
  );
}
