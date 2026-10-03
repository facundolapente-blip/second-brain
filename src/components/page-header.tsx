import { MenuButton } from "./shell";

/**
 * Barra superior de cada pantalla, estilo título grande de iOS: menú (celular),
 * título, acciones y pestañas opcionales. Esmerilada al quedar pegada arriba.
 */
export function PageHeader({
  title,
  actions,
  tabs,
  wide,
}: {
  title: string;
  actions?: React.ReactNode;
  tabs?: React.ReactNode;
  /** Pantallas anchas (la semana del Plan) usan más ancho en escritorio. */
  wide?: boolean;
}) {
  return (
    <header className="frost-bg sticky top-0 z-20 pt-[env(safe-area-inset-top)]">
      <div className={`mx-auto px-4 lg:px-8 ${wide ? "max-w-6xl" : "max-w-3xl"}`}>
        <div className="flex h-16 items-center gap-3 lg:h-20">
          <MenuButton />
          <h1 className="truncate text-[28px] leading-none font-black tracking-[-0.02em] lg:text-[32px]">{title}</h1>
          <div className="ml-auto flex items-center gap-1">{actions}</div>
        </div>
        {tabs}
      </div>
    </header>
  );
}
