import { Bone } from "@/components/skeleton";

/** Fila de movimiento en carga: avatar redondo, dos renglones y el monto a la derecha. */
export function TxRowSkeleton({ wide }: { wide?: boolean }) {
  return (
    <div className="flex min-h-[60px] items-center gap-3.5 px-2 py-2.5">
      <Bone className="size-10 shrink-0 rounded-full" />
      <div className="grid flex-1 gap-1.5">
        <Bone className={`h-3.5 ${wide ? "w-40" : "w-28"}`} />
        <Bone className="h-3 w-24" />
      </div>
      <Bone className="h-3.5 w-16" />
    </div>
  );
}

/** Varios días con sus movimientos. */
export function TxListSkeleton({ days = 3 }: { days?: number }) {
  return (
    <div className="grid gap-3 border-t border-line pt-3">
      {Array.from({ length: days }, (_, d) => (
        <div key={d} className="grid gap-1">
          <div className="flex justify-between px-2 py-1.5">
            <Bone className="h-3.5 w-16" />
            <Bone className="h-3.5 w-20" />
          </div>
          {Array.from({ length: d === 0 ? 4 : 3 }, (_, i) => (
            <TxRowSkeleton key={i} wide={i % 2 === 0} />
          ))}
        </div>
      ))}
    </div>
  );
}
