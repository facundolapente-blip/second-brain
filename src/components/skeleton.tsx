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
    <header className="sticky top-0 z-20 bg-[color-mix(in_oklab,var(--bg)_70%,transparent)] pt-[env(safe-area-inset-top)] backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto max-w-3xl px-4 lg:px-8">
        <div className="flex h-16 items-center gap-2 lg:h-20">
          <span className="size-10 lg:hidden" />
          <h1 className="display truncate text-[26px] font-semibold lg:text-[30px]">{title}</h1>
        </div>
        <div className="hidden pb-3 lg:flex">
          <Bone className="h-10 rounded-full" style={{ width: tabs * 104 }} />
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
