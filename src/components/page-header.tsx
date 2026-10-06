import { MenuButton } from "./shell";

/**
 * Barra superior de cada pantalla, como el encabezado de una página de revista:
 * rótulo chico opcional, título grande en serif, acciones y pestañas opcionales.
 */
export function PageHeader({
  title,
  kicker,
  actions,
  tabs,
  wide,
}: {
  title: string;
  /** Rótulo en mono arriba del título (módulo, fecha). */
  kicker?: string;
  actions?: React.ReactNode;
  tabs?: React.ReactNode;
  /** Pantallas anchas (la semana del Plan) usan más ancho en escritorio. */
  wide?: boolean;
}) {
  return (
    <header className="sticky top-0 z-20 bg-bg/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className={`mx-auto px-4 lg:px-10 ${wide ? "max-w-6xl" : "max-w-3xl"}`}>
        <div className="flex min-h-16 items-center gap-2 lg:min-h-24 lg:items-end lg:pb-4">
          <MenuButton />
          <div className="grid min-w-0 gap-1">
            {kicker && <p className="kicker truncate pt-2 lg:pt-0">{kicker}</p>}
            <h1 className="display truncate pb-0.5 text-[28px] lg:text-[40px]">{title}</h1>
          </div>
          <div className="ml-auto flex items-center gap-0.5">{actions}</div>
        </div>
        {tabs}
      </div>
    </header>
  );
}
