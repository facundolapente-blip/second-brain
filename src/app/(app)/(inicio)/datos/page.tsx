import { prisma } from "@/lib/prisma";
import { fromDbDate } from "@/lib/dates";
import { backupsEnabled, getBackupStatus, listBackups, type BackupInfo } from "@/lib/backup";
import { DataView } from "./data-view";
import { getWatchStatus } from "@/lib/watch";
import { Backups } from "./backups";

export const dynamic = "force-dynamic";
export const metadata = { title: "Datos" };

export default async function DatosPage() {
  const [habits, logs, lastLog, entries, lastEntry, txs, lastTx, checkins, blocks, stepDays, lastSteps] = await Promise.all([
    prisma.habit.count(),
    prisma.habitLog.count(),
    prisma.habitLog.findFirst({ orderBy: { date: "desc" }, select: { date: true } }),
    prisma.journalEntry.count({ where: { body: { not: "" } } }),
    prisma.journalEntry.findFirst({ where: { body: { not: "" } }, orderBy: { date: "desc" }, select: { date: true } }),
    prisma.transaction.count(),
    prisma.transaction.findFirst({ orderBy: { date: "desc" }, select: { date: true } }),
    prisma.dailyCheckin.count(),
    prisma.planBlock.count(),
    prisma.dailyCheckin.count({ where: { steps: { not: null } } }),
    prisma.dailyCheckin.findFirst({ where: { steps: { not: null } }, orderBy: { date: "desc" }, select: { date: true } }),
  ]);
  const d = (x: { date: Date } | null) => (x ? fromDbDate(x.date) : null);
  const enabled = backupsEnabled();
  let backups: BackupInfo[] = [];
  try {
    backups = await listBackups();
  } catch {
    // si el almacén no responde, la pantalla igual se ve
  }
  const [status, watch] = await Promise.all([getBackupStatus(), getWatchStatus()]);
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
          stepDays,
          lastSteps: d(lastSteps),
        }}
        watch={watch}
        backups={<Backups enabled={enabled} backups={backups} status={status} />}
      />
    </div>
  );
}
