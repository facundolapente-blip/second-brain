import { Bone } from "@/components/skeleton";

/** Tarjeta de entrada en carga, con la misma forma que EntryCard. */
export function EntryCardSkeleton() {
  return (
    <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-3.5 rounded-card card py-4 pr-4 pl-3">
      <div className="grid justify-items-center gap-1.5">
        <Bone className="h-6 w-8" />
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
