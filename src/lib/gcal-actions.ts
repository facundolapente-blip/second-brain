"use server";

import { revalidatePath } from "next/cache";
import { exigirSesion } from "./session";
import { logActivity } from "./trash";
import { forgetGcal, gcalReady, syncGoogleCalendar } from "./gcal";

export type GcalResult = { ok: true; message: string } | { ok: false; error: string };

function refrescar() {
  revalidatePath("/datos");
  revalidatePath("/plan", "layout");
  revalidatePath("/");
}

/** "Sincronizar ahora" en Datos: trae los eventos de Google Calendar al Plan. */
export async function syncGcalNow(): Promise<GcalResult> {
  await exigirSesion();
  if (!(await gcalReady())) return { ok: false, error: "Primero conectá Google Calendar." };
  const r = await syncGoogleCalendar({ force: true });
  refrescar();
  if (!r) return { ok: false, error: "No se pudo sincronizar (el motivo queda arriba)." };
  const parts = [r.created && `${r.created} ${r.created === 1 ? "evento nuevo" : "eventos nuevos"}`, r.updated && `${r.updated} ${r.updated === 1 ? "cambiado" : "cambiados"}`].filter(Boolean);
  return { ok: true, message: parts.length ? `Listo: ${parts.join(" y ")}.` : "Listo: no había nada nuevo." };
}

/** Desconectar: se olvida el permiso. Los bloques que ya vinieron de Google quedan en el Plan. */
export async function disconnectGcal(): Promise<GcalResult> {
  await exigirSesion();
  await forgetGcal();
  await logActivity("updated", "import", null, "Google Calendar: desconectado");
  refrescar();
  return { ok: true, message: "Google Calendar desconectado." };
}
