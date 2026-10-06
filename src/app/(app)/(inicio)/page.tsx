import { getDashboard } from "@/lib/dashboard";
import { InicioView } from "./inicio-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Inicio" };

/** Inicio: el día de hoy y la semana con los cuatro módulos juntos. */
export default async function Inicio() {
  const d = await getDashboard();
  return (
    <div data-module="inicio" className="min-h-dvh">
      <InicioView d={d} />
    </div>
  );
}
