import { todayISO } from "@/lib/dates";
import { getWheels } from "@/lib/wheels";
import { RuedaView } from "./rueda-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Rueda de la vida" };

/** Rueda de la vida (Herramientas): la última rueda contra otra y todas las anteriores. */
export default async function RuedaPage() {
  const wheels = await getWheels();
  return (
    <div data-module="inicio" className="min-h-dvh">
      <RuedaView wheels={wheels} today={todayISO()} />
    </div>
  );
}
