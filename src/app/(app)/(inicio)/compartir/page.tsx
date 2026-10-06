import { prisma } from "@/lib/prisma";
import { fromDbDate, formatShort } from "@/lib/dates";
import { moneyCents } from "@/lib/format";
import { toCents } from "@/lib/finance-logic";
import { ShareView } from "./share-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Compartir" };

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v.slice(0, 5000) : "");

/** Lo que llega desde "Compartir" de otra app: se elige si va al journal o a Gastos. */
export default async function CompartirPage({ searchParams }: PageProps<"/compartir">) {
  const sp = await searchParams;
  const recent = await prisma.transaction.findMany({
    where: { kind: { in: ["expense", "income"] } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 12,
    select: { id: true, title: true, amount: true, date: true, kind: true, account: { select: { currency: true, name: true } } },
  });
  return (
    <div data-module="inicio" className="min-h-dvh">
      <ShareView
        title={one(sp.title)}
        text={one(sp.text)}
        url={one(sp.url)}
        photos={one(sp.fotos)}
        recent={recent.map((t) => ({
          id: t.id,
          label: t.title ?? "Sin título",
          sub: `${formatShort(fromDbDate(t.date))} · ${t.account.name}`,
          amount: `${t.kind === "income" ? "+" : "−"}${moneyCents(toCents(t.amount), t.account.currency)}`,
        }))}
      />
    </div>
  );
}
