import { prisma } from "@/lib/prisma";
import { pushConfigured, vapidPublicKey } from "@/lib/push";
import { getReminderPrefs, previewReminders } from "@/lib/reminders";
import { deviceLabel } from "@/lib/reminder-logic";
import { RemindersView, type Device } from "./reminders-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Avisos" };

export default async function AvisosPage() {
  const prefs = await getReminderPrefs();
  const preview = await previewReminders();
  let devices: Device[] = [];
  let tableReady = true;
  try {
    const rows = await prisma.pushSubscription.findMany({ orderBy: { createdAt: "asc" } });
    devices = rows.map((r) => ({
      id: r.id,
      endpoint: r.endpoint,
      label: deviceLabel(r.userAgent),
      createdAt: r.createdAt.toISOString(),
      lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
    }));
  } catch {
    // La tabla todavía no existe (falta aplicar la migración de avisos): la pantalla igual se ve.
    tableReady = false;
  }
  return (
    <div data-module="inicio" className="min-h-dvh">
      <RemindersView
        prefs={prefs}
        preview={preview}
        devices={devices}
        tableReady={tableReady}
        publicKey={pushConfigured() ? vapidPublicKey() : null}
      />
    </div>
  );
}
