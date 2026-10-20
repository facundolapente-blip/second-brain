import { Bone, HeaderSkeleton, LoadingRegion } from "@/components/skeleton";
import { TxListSkeleton } from "./skeletons";

/**
 * Movimientos (y las listas que cuelgan de Gastos) mientras cargan. En la
 * computadora, los movimientos al centro y el panel de saldos y categorías al costado.
 */
export default function Loading() {
  return (
    <>
      <HeaderSkeleton title="Gastos" tabs={6} wide />
      <LoadingRegion
        label="Cargando movimientos"
        className="mx-auto max-w-3xl px-4 lg:grid lg:max-w-6xl lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-x-10 lg:px-10"
      >
        <div>
          <div className="grid gap-3 pt-3 pb-5 lg:pt-6">
            <Bone className="h-6 w-40" />
            <div className="grid gap-2">
              <Bone className="h-3.5 w-24" />
              <Bone className="h-10 w-44" />
            </div>
            <div className="grid grid-cols-2 gap-2 lg:max-w-xl">
              <Bone className="h-[68px] rounded-[20px]" />
              <Bone className="h-[68px] rounded-[20px]" />
            </div>
          </div>
          <Bone className="mb-5 h-[92px] rounded-[20px] lg:hidden" />
          <TxListSkeleton />
        </div>
        <div className="hidden gap-4 pt-6 lg:grid">
          <Bone className="h-[92px] rounded-[20px]" />
          <Bone className="h-[360px] rounded-[20px]" />
          <Bone className="h-[300px] rounded-[20px]" />
        </div>
      </LoadingRegion>
    </>
  );
}
