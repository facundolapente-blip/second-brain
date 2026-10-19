import { DotsThreeVertical, List } from "@phosphor-icons/react/dist/ssr";
import { Bone } from "@/components/skeleton";

/**
 * Encabezado del Plan mientras carga: igual al de verdad (mismo ancho que la semana,
 * título, pestañas y acciones), así no se corre nada cuando llega la pantalla.
 */
export function PlanHeaderSkeleton({ title, active, action, extra, narrow }: { title: string; active: 0 | 1; action: string; extra?: string; narrow?: boolean }) {
  return (
    <div className="plan-head contents" data-w={narrow ? "96" : undefined}>
      <header className="sticky top-0 z-20 bg-bg/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-4 lg:px-10">
          <div className="flex min-h-16 items-center gap-2 lg:min-h-24 lg:items-end lg:pb-4">
            <span aria-hidden className="-ml-2.5 inline-flex size-11 items-center justify-center text-fg lg:hidden">
              <List size={22} />
            </span>
            <h1 className="display pb-0.5 text-[28px] lg:text-[40px]">{title}</h1>
            <div className="ml-auto flex items-center gap-0.5">
              {extra ? (
                <Bone className={`h-9 rounded-full ${extra}`} />
              ) : (
                <span aria-hidden className="inline-flex size-9 items-center justify-center text-muted">
                  <DotsThreeVertical size={20} weight="bold" />
                </span>
              )}
              <Bone className={`ml-1 h-9 rounded-full max-lg:hidden ${action}`} />
            </div>
          </div>
          <div className="hidden gap-6 border-b border-line lg:flex">
            {["Semana y tareas", "Objetivos"].map((t, i) => (
              <span key={t} className={`-mb-px border-b-[1.5px] pb-3 text-[14px] whitespace-nowrap ${i === active ? "border-fg font-medium text-fg" : "border-transparent text-muted"}`}>
                {t}
              </span>
            ))}
          </div>
        </div>
      </header>
    </div>
  );
}
