import { prisma } from "@/lib/prisma";
import { formatShort, todayISO } from "@/lib/dates";
import { moneyCents } from "@/lib/format";
import { purgeOldTrash } from "@/lib/trash";
import { HistoryLog } from "./history-log";

export const dynamic = "force-dynamic";
export const metadata = { title: "Historial" };

export default async function HistorialPage({ searchParams }: PageProps<"/historial">) {
  const { ver, n } = await searchParams;
  await purgeOldTrash();
  const limit = Math.min(1000, Math.max(100, Number(n) || 150));
  const [trash, activity, activityCount] = await Promise.all([
    prisma.trashItem.findMany({
      orderBy: { deletedAt: "desc" },
      select: { id: true, kind: true, label: true, module: true, deletedAt: true },
    }),
    prisma.activity.findMany({ orderBy: { at: "desc" }, take: limit }),
    prisma.activity.count(),
  ]);
  return (
    <div data-module="inicio" className="min-h-dvh">
      <HistoryLog
        tab={ver === "actividad" ? "actividad" : "papelera"}
        trash={trash.map((t) => ({ ...t, deletedAt: t.deletedAt.toISOString() }))}
        activity={activity.map((a) => ({ id: a.id, action: a.action, kind: a.kind, label: readableLabel(a.label), module: a.module, at: a.at.toISOString() }))}
        hasMore={activityCount > limit}
        limit={limit}
      />
    </div>
  );
}

/**
 * Los textos del historial guardan montos y fechas en crudo ("Gasto 123.00 UYU",
 * "Entrada del 2026-10-09"): se muestran como en el resto de la app ("$ 123",
 * "9 oct"). Vale también para lo que ya estaba guardado.
 */
function readableLabel(label: string): string {
  const today = todayISO();
  return label
    .replace(/(-?\d+(?:\.\d{1,2})?) (UYU|USD|ARS|EUR|BRL)/g, (_, n: string, cur: string) => {
      const cents = Math.round(Number(n) * 100);
      return `${cents < 0 ? "−" : ""}${moneyCents(cents, cur)}`;
    })
    .replace(/(\d{4}-\d{2}-\d{2})/g, (_, iso: string) => formatShort(iso) + (iso.slice(0, 4) !== today.slice(0, 4) ? ` ${iso.slice(0, 4)}` : ""));
}
