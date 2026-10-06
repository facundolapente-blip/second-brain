"use server";

import { revalidatePath } from "next/cache";
import { exigirSesion } from "./session";
import { backupsEnabled, saveBackup } from "./backup";

export type BackupResult = { ok: true; message: string } | { ok: false; error: string } | null;

/** "Hacer un respaldo ahora" desde Datos. */
export async function backupNow(): Promise<BackupResult> {
  await exigirSesion();
  if (!backupsEnabled()) return { ok: false, error: "El almacén de respaldos solo está en la versión publicada." };
  try {
    const b = await saveBackup(false);
    revalidatePath("/datos");
    return { ok: true, message: `Listo: respaldo de ${(b.size / 1024).toFixed(0)} KB guardado.` };
  } catch (e) {
    return { ok: false, error: `No se pudo guardar: ${e instanceof Error ? e.message : String(e)}` };
  }
}
