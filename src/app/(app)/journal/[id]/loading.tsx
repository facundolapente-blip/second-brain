import { Bone, LoadingRegion } from "@/components/skeleton";

/** Editor mientras carga: cabecera con fecha, caras del ánimo y renglones del texto. */
export default function Loading() {
  return (
    <>
      <header className="sticky top-0 z-20 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-16 max-w-[42rem] items-center gap-3 px-4 lg:h-20">
          <Bone className="size-6 rounded-md" />
          <Bone className="h-4 w-40" />
        </div>
      </header>
      <LoadingRegion label="Abriendo la entrada" className="mx-auto grid max-w-[42rem] gap-6 px-5 pt-2 lg:px-8 lg:pt-8">
        <div className="flex gap-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Bone key={i} className="size-11 rounded-full" />
          ))}
        </div>
        <Bone className="h-8 w-2/3" />
        <div className="grid gap-4">
          {["w-full", "w-[96%]", "w-full", "w-[88%]", "w-full", "w-1/2"].map((w, i) => (
            <Bone key={i} className={`h-4 ${w}`} />
          ))}
        </div>
      </LoadingRegion>
    </>
  );
}
