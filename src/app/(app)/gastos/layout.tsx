import "./gastos.css";
import { getSelection, runSchedules } from "@/lib/finance";
import { GastosNav } from "./gastos-nav";
import { SelectionProvider } from "./selection";

export default async function GastosLayout({ children }: LayoutProps<"/gastos">) {
  // Los recurrentes que ya tocaban se cargan antes de mostrar nada.
  const [selection] = await Promise.all([getSelection(), runSchedules()]);
  return (
    <SelectionProvider initial={selection}>
      {/* Abajo deja lugar para la barra inferior y el botón flotante. */}
      <div data-module="gastos" className="min-h-dvh pb-[calc(156px+env(safe-area-inset-bottom))] lg:pb-12">
        {children}
        <GastosNav />
      </div>
    </SelectionProvider>
  );
}
