/**
 * Piezas de carga (sirven en loading.tsx, que es de servidor). Imitan la forma
 * real de cada pantalla para que no haya salto cuando llegan los datos.
 */

export function Bone({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <span aria-hidden className={`skeleton block ${className}`} style={style} />;
}

/** Cabecera de pantalla con título y, en escritorio, la línea de pestañas. */
export function HeaderSkeleton({ title, tabs = 3, wide }: { title: string; tabs?: number; wide?: boolean }) {
  return (
    <header className="sticky top-0 z-20 bg-bg/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className={`mx-auto px-4 lg:px-10 ${wide ? "max-w-6xl" : "max-w-3xl"}`}>
        <div className="flex min-h-16 items-center gap-2 lg:min-h-24 lg:items-end lg:pb-4">
          <span className="size-9 lg:hidden" />
          <h1 className="display pb-0.5 text-[28px] lg:text-[40px]">{title}</h1>
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

/**
 * Tarjeta con cabecera teñida mientras carga (la forma de `TintedCard`): banda del color
 * del módulo con el ícono real y el título (o un hueso), y el cuerpo con lo que se pase.
 */
export function CardSkeleton({
  icon: Ico,
  title,
  meta = "w-32",
  pill,
  bar,
  extra,
  className = "",
  bodyClassName = "",
  children,
}: {
  icon: React.ComponentType<{ size?: number; weight?: "fill" }>;
  /** Texto del título, o el ancho del hueso (`"w-24"`) si el título depende de los datos. */
  title: string;
  meta?: string | null;
  pill?: string;
  bar?: boolean;
  extra?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children?: React.ReactNode;
}) {
  const boneTitle = /^w-/.test(title);
  return (
    <section aria-hidden className={`tcard ${className}`}>
      <header className="tcard-head">
        <span className="tcard-ico">
          <Ico size={18} weight="fill" />
        </span>
        <span className="grid min-w-0 gap-1.5">
          {boneTitle ? <Bone className={`h-4 ${title}`} /> : <span className="tcard-title truncate">{title}</span>}
          {meta && <Bone className={`h-3 ${meta}`} />}
        </span>
        {pill ? <Bone className={`h-8 rounded-full ${pill}`} /> : <span />}
        {bar && <span className="tcard-bar" />}
        {extra && <div className="col-span-3 mt-2.5 min-w-0">{extra}</div>}
      </header>
      <div className={`tcard-body ${bodyClassName}`}>{children}</div>
    </section>
  );
}

/** Tarjeta de cifra mientras carga (la forma de `StatTile`). */
export function StatSkeleton({ icon: Ico, label, className = "" }: { icon: React.ComponentType<{ size?: number; weight?: "fill" }>; label: string; className?: string }) {
  return (
    <div aria-hidden className={`tcard tstat ${className}`}>
      <header className="tcard-head">
        <span className="tcard-ico">
          <Ico size={15} weight="fill" />
        </span>
        <span className="tcard-title truncate">{label}</span>
        <span />
      </header>
      <div className="tcard-body">
        <Bone className="h-8 w-16" />
        <Bone className="h-3 w-24" />
      </div>
    </div>
  );
}
