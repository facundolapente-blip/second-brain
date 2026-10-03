import { MenuButton, ModuleCode } from "./shell";

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
    <header className="sticky top-0 z-20 border-b border-rule bg-bg pt-[env(safe-area-inset-top)]">
      <div className={`mx-auto px-4 lg:px-8 ${wide ? "max-w-6xl" : "max-w-3xl"}`}>
        <div className="flex h-14 items-center gap-1.5 lg:h-[72px]">
          <MenuButton />
          <ModuleCode />
          <h1 className="display min-w-0 truncate text-[24px] uppercase lg:text-[34px]">{title}</h1>
          <div className="ml-auto flex shrink-0 items-center gap-0.5">{actions}</div>
        </div>
        {tabs}
      </div>
    </header>
  );
}
