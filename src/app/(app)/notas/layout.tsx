import { Suspense } from "react";
import { NotasNav } from "./notas-nav";

export default function NotasLayout({ children }: LayoutProps<"/notas">) {
  return (
    <div data-module="notas" className="min-h-dvh pb-[calc(84px+env(safe-area-inset-bottom))] lg:pb-12">
      {children}
      {/* La barra lee ?seccion= para marcar la pestaña: va en Suspense. */}
      <Suspense fallback={null}>
        <NotasNav />
      </Suspense>
    </div>
  );
}
