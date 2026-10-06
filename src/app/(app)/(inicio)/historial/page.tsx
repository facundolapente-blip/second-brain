import { prisma } from "@/lib/prisma";
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
        activity={activity.map((a) => ({ id: a.id, action: a.action, kind: a.kind, label: a.label, module: a.module, at: a.at.toISOString() }))}
        hasMore={activityCount > limit}
        limit={limit}
      />
    </div>
  );
}
