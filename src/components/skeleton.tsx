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
    <header className="sticky top-0 z-20 bg-bg/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="mx-auto max-w-3xl px-4 lg:px-8">
        <div className="flex h-14 items-center gap-2 lg:h-16">
          <span className="size-8 lg:hidden" />
          <h1 className="text-[22px] font-semibold tracking-tight lg:text-2xl">{title}</h1>
        </div>
        <div className="hidden gap-5 border-b border-line pb-3 lg:flex">
          {Array.from({ length: tabs }, (_, i) => (
            <Bone key={i} className="h-4 w-20" />
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
