import { MenuButton } from "./shell";

/** Barra superior de cada pantalla: menú (celular), título, acciones y pestañas opcionales. */
export function PageHeader({
  title,
  actions,
  tabs,
}: {
  title: string;
  actions?: React.ReactNode;
  tabs?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 bg-bg/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="mx-auto max-w-3xl px-4 lg:px-8">
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
