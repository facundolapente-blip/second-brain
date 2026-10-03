import { MenuButton } from "./shell";

/** Barra superior de cada pantalla: menú (celular), título, acciones y pestañas opcionales. */
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
    <header className="sticky top-0 z-20 bg-bg/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className={`mx-auto px-4 lg:px-8 ${wide ? "max-w-6xl" : "max-w-3xl"}`}>
        <div className="flex h-14 items-center gap-2 lg:h-16">
          <MenuButton />
          <h1 className="text-[22px] font-semibold tracking-tight lg:text-2xl">{title}</h1>
          <div className="ml-auto flex items-center gap-0.5">{actions}</div>
        </div>
        {tabs}
      </div>
    </header>
  );
}
