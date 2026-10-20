import { Note } from "@phosphor-icons/react/dist/ssr";
import { Bone, LoadingRegion } from "@/components/skeleton";

/**
 * Notas mientras carga: título, la cabecera teñida con la búsqueda y la fila de
 * secciones, y tarjetas (en el celular una columna; en la compu, la grilla de tres).
 */
export default function Loading() {
  const heights = ["h-28", "h-24", "h-36", "h-24", "h-32", "h-28"];
  return (
    <>
      <header className="sticky top-0 z-20 bg-bg/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-4 lg:px-10">
          <div className="flex min-h-16 items-center gap-2 lg:min-h-24 lg:items-end lg:pb-4">
            <span className="size-9 lg:hidden" />
            <h1 className="display pb-0.5 text-[28px] lg:text-[40px]">Notas</h1>
          </div>
        </div>
      </header>
      <LoadingRegion label="Cargando notas" className="mx-auto grid max-w-3xl gap-4 px-4 pt-1 lg:max-w-6xl lg:gap-5 lg:px-10 lg:pt-4">
        <section className="tcard">
          <header className="tcard-head">
            <span className="tcard-ico" aria-hidden>
              <Note size={18} weight="fill" />
            </span>
            <span className="grid min-w-0 gap-1.5">
              <span className="tcard-title">Todas las notas</span>
              <Bone className="h-3 w-20" />
            </span>
            <Bone className="h-8 w-[5.4rem] rounded-full sm:w-[7.6rem]" />
          </header>
          <div className="tcard-body gap-3!">
            <Bone className="h-11 rounded-full" />
            <div className="flex gap-1.5 overflow-hidden">
              {[64, 84, 100, 64, 80, 72, 70].map((w, i) => (
                <Bone key={i} className="h-9 shrink-0 rounded-full" style={{ width: w }} />
              ))}
            </div>
            <Bone className="h-8 w-[7.5rem] rounded-full" />
          </div>
        </section>
        <div className="grid gap-3 lg:grid-cols-3 lg:gap-4">
          {heights.map((h, i) => (
            <Bone key={i} className={`${h} rounded-[18px]`} />
          ))}
        </div>
      </LoadingRegion>
    </>
  );
}
