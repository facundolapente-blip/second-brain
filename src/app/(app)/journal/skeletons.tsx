import { Bone } from "@/components/skeleton";

/** Tarjeta de entrada en carga, con la misma forma que EntryCard. */
export function EntryCardSkeleton() {
  return (
    <div className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-4 border-b border-line py-5">
      <div className="grid justify-items-center gap-1.5">
        <Bone className="h-9 w-10" />
        <Bone className="h-3 w-6" />
      </div>
      <div className="grid gap-2 pt-1">
        <Bone className="h-3.5 w-full" />
        <Bone className="h-3.5 w-[92%]" />
        <Bone className="h-3.5 w-3/5" />
      </div>
    </div>
  );
}
