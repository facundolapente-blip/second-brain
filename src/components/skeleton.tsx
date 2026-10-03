/**
 * Piezas de carga (sirven en loading.tsx, que es de servidor). Imitan la forma
 * real de cada pantalla para que no haya salto cuando llegan los datos.
 */

export function Bone({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <span aria-hidden className={`skeleton block ${className}`} style={style} />;
}

/** Cabecera de pantalla con título y, en escritorio, la línea de pestañas. */
export function HeaderSkeleton({ title, tabs = 3 }: { title: string; tabs?: number }) {
  return (
    <header className="sticky top-0 z-20 border-b border-rule bg-bg pt-[env(safe-area-inset-top)]">
      <div className="mx-auto max-w-3xl px-4 lg:px-8">
        <div className="flex h-14 items-center gap-2 lg:h-[72px]">
          <span className="size-9 lg:hidden" />
          <h1 className="display text-[24px] uppercase lg:text-[34px]">{title}</h1>
        </div>
        <div className="hidden h-11 items-center gap-6 lg:flex">
          {Array.from({ length: tabs }, (_, i) => (
            <Bone key={i} className="h-3 w-20" />
          ))}
        </div>
      </div>
    </header>
  );
}

/** Contenedor con el texto para lectores de pantalla. */
export function LoadingRegion({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <main aria-busy="true" className={className}>
      <span className="sr-only" role="status">
        {label}
      </span>
      {children}
    </main>
  );
}
