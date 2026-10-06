import { prisma } from "@/lib/prisma";
import { fromDbDate } from "@/lib/dates";
import { DataView } from "./data-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Datos" };

export default async function DatosPage() {
  const [habits, logs, lastLog, entries, lastEntry, txs, lastTx, checkins, blocks] = await Promise.all([
    prisma.habit.count(),
    prisma.habitLog.count(),
    prisma.habitLog.findFirst({ orderBy: { date: "desc" }, select: { date: true } }),
    prisma.journalEntry.count({ where: { body: { not: "" } } }),
    prisma.journalEntry.findFirst({ where: { body: { not: "" } }, orderBy: { date: "desc" }, select: { date: true } }),
    prisma.transaction.count(),
    prisma.transaction.findFirst({ orderBy: { date: "desc" }, select: { date: true } }),
    prisma.dailyCheckin.count(),
    prisma.planBlock.count(),
  ]);
  const d = (x: { date: Date } | null) => (x ? fromDbDate(x.date) : null);
  return (
    <div data-module="inicio" className="min-h-dvh">
      <DataView
        stats={{
          habits,
          logs,
          lastLog: d(lastLog),
          entries,
          lastEntry: d(lastEntry),
          txs,
          lastTx: d(lastTx),
          checkins,
          blocks,
        }}
      />
    </div>
  );
}
