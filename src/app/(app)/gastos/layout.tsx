import "./gastos.css";
import { getActiveProjects, getSelection, runSchedules } from "@/lib/finance";
import { ProjectsProvider } from "./projects";
import { GastosNav } from "./gastos-nav";
import { SelectionProvider } from "./selection";

export default async function GastosLayout({ children }: LayoutProps<"/gastos">) {
  // Los recurrentes que ya tocaban se cargan antes de mostrar nada.
  const [selection, , projects] = await Promise.all([getSelection(), runSchedules(), getActiveProjects()]);
  return (
    <SelectionProvider initial={selection}>
      <ProjectsProvider projects={projects}>
      {/* Abajo deja lugar para la barra inferior y el botón flotante. */}
      <div data-module="gastos" className="min-h-dvh pb-[calc(156px+env(safe-area-inset-bottom))] lg:pb-12">
        {children}
        <GastosNav />
      </div>
      </ProjectsProvider>
    </SelectionProvider>
  );
}
