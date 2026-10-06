"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "./prisma";
import { exigirSesion } from "./session";
import { logActivity, trashAndDelete } from "./trash";
import { photosEnabled, storePhoto, type PhotoDTO, type PhotoOwner } from "./photos";

export type PhotoResult = { ok: true; photo: PhotoDTO } | { ok: false; error: string };

const validId = (v: unknown): v is string => typeof v === "string" && /^[a-z0-9]{10,40}$/i.test(v);

/** Sube una foto (ya achicada en el navegador) a una entrada o a un movimiento. */
export async function uploadPhoto(fd: FormData): Promise<PhotoResult> {
  await exigirSesion();
  if (!photosEnabled()) return { ok: false, error: "Las fotos no están disponibles en esta versión." };
  const file = fd.get("foto");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "No llegó la foto." };
  const entry = fd.get("journalEntryId");
  const tx = fd.get("transactionId");
  let owner: PhotoOwner;
  if (validId(entry) && (await prisma.journalEntry.findUnique({ where: { id: entry }, select: { id: true } }))) {
    owner = { journalEntryId: entry };
  } else if (validId(tx) && (await prisma.transaction.findUnique({ where: { id: tx }, select: { id: true } }))) {
    owner = { transactionId: tx };
  } else {
    return { ok: false, error: "Eso ya no existe." };
  }
  const num = (k: string) => {
    const n = Number(fd.get(k));
    return Number.isInteger(n) && n > 0 && n < 20000 ? n : undefined;
  };
  try {
    const photo = await storePhoto(file, owner, { width: num("width"), height: num("height") });
    if ("journalEntryId" in owner) await logActivity("updated", "journal", owner.journalEntryId, "Foto agregada a una entrada");
    else await logActivity("updated", "transaction", owner.transactionId, "Comprobante agregado a un movimiento");
    revalidatePath("journalEntryId" in owner ? "/journal" : "/gastos", "layout");
    return { ok: true, photo };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo subir la foto." };
  }
}

/** Saca una foto (va a la papelera; el archivo se borra al vaciarla). */
export async function deletePhoto(id: string) {
  await exigirSesion();
  if (!validId(id)) return;
  const a = await prisma.attachment.findUnique({ where: { id }, select: { journalEntryId: true } });
  if (!a) return;
  await trashAndDelete("photo", id);
  revalidatePath(a.journalEntryId ? "/journal" : "/gastos", "layout");
}
