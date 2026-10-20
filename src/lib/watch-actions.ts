"use server";

import { revalidatePath } from "next/cache";
import { exigirSesion } from "./session";
import { logActivity } from "./trash";
import { cleanApiKey } from "./watch-logic";
import { connectWatchKey, disconnectWatchState, syncWatch } from "./watch";

export type WatchResult = { ok: true; message: string } | { ok: false; error: string };

function refrescar() {
  revalidatePath("/datos");
  revalidatePath("/");
  revalidatePath("/analisis");
}

const days = (n: number) => `${n} ${n === 1 ? "día" : "días"}`;

/** Conectar: prueba la clave de intervals.icu y, si anda, la guarda y trae el último año. */
export async function connectWatch(_prev: WatchResult | null, fd: FormData): Promise<WatchResult> {
  await exigirSesion();
  const key = cleanApiKey(fd.get("apiKey"));
  if (!key) return { ok: false, error: "Esa no parece una clave de intervals.icu: copiala entera, sin espacios." };
  const r = await connectWatchKey(key);
  if (!r) return { ok: false, error: "No se pudo conectar." };
  if (!r.ok) return r;
  await logActivity("imported", "import", null, `Reloj: conectado, ${days(r.days)} con datos`);
  refrescar();
  return {
    ok: true,
    message: r.days
      ? `Conectado. Llegaron ${days(r.days)} con datos del último año.`
      : "Conectado, pero todavía no llegó ningún dato: revisá que Huawei esté conectado en intervals.icu (puede tardar unos minutos).",
  };
}

/** "Sincronizar ahora": los últimos 30 días. */
export async function syncWatchNow(): Promise<WatchResult> {
  await exigirSesion();
  const r = await syncWatch({ days: 30 });
  if (!r) return { ok: false, error: "El reloj no está conectado." };
  // También con error: la tarjeta muestra el problema guardado.
  refrescar();
  if (!r.ok) return r;
  return { ok: true, message: r.changed ? `Listo: se actualizaron ${days(r.changed)}.` : "Listo: no había nada nuevo." };
}

/** Desconectar: borra la clave (lo ya guardado en los check-ins queda). */
export async function disconnectWatch(): Promise<WatchResult> {
  await exigirSesion();
  await disconnectWatchState();
  refrescar();
  return { ok: true, message: "Reloj desconectado. Lo que ya había llegado queda guardado." };
}
