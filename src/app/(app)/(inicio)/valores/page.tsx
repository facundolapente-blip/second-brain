import { prisma } from "@/lib/prisma";
import { VALUES_KEY } from "@/lib/values";
import { ValuesView } from "./values-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Valores" };

export default async function ValoresPage() {
  const row = await prisma.appSetting.findUnique({ where: { key: VALUES_KEY } });
  return (
    <div data-module="inicio" className="min-h-dvh">
      <ValuesView initial={row?.value ?? ""} />
    </div>
  );
}
