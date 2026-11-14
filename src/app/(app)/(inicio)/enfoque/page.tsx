import { getFocusLink, getFocusPage } from "@/lib/focus";
import { EnfoqueView } from "./enfoque-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Enfoque" };

type Params = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function EnfoquePage({ searchParams }: { searchParams: Params }) {
  const sp = await searchParams;
  const dias = Math.min(365, Math.max(14, Number(one(sp.dias)) || 14));
  const [data, link] = await Promise.all([getFocusPage(dias), getFocusLink({ tarea: one(sp.tarea), bloque: one(sp.bloque) })]);
  return (
    <div data-module="inicio" className="min-h-dvh">
      <EnfoqueView data={data} link={link} />
    </div>
  );
}
