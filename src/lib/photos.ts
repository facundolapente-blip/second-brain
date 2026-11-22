import "server-only";
import { del, get, put } from "@vercel/blob";
import { prisma } from "./prisma";

/**
 * Fotos del journal y comprobantes de gastos, en el almacén privado de Vercel
 * Blob (el mismo de los respaldos). La compu de desarrollo guarda en `dev/` para
 * no mezclarse con las reales.
 */

export type PhotoDTO = { id: string; width: number | null; height: number | null };

const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
/** Llegan achicadas desde el navegador (~300 KB); esto es solo un tope. */
const MAX_BYTES = 4 * 1024 * 1024;

export function photosEnabled() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

const folder = () => (process.env.VERCEL_ENV === "production" ? "fotos/" : "dev/fotos/");

export type PhotoOwner = { journalEntryId: string } | { transactionId: string } | { noteId: string };

export async function storePhoto(file: File, owner: PhotoOwner, size?: { width?: number; height?: number }): Promise<PhotoDTO> {
  if (!TYPES.has(file.type)) throw new Error("Tiene que ser una imagen (JPG, PNG o WebP).");
  if (file.size > MAX_BYTES) throw new Error("La foto es demasiado pesada.");
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const id = crypto.randomUUID();
  const res = await put(`${folder()}${id}.${ext}`, file, { access: "private", contentType: file.type, addRandomSuffix: false });
  const a = await prisma.attachment.create({
    data: {
      pathname: res.pathname,
      contentType: file.type,
      size: file.size,
      width: size?.width ?? null,
      height: size?.height ?? null,
      ...owner,
    },
  });
  return { id: a.id, width: a.width, height: a.height };
}

/** Tope para un documento que llega por WhatsApp (PDF, Word, video…). */
export const FILE_MAX_BYTES = 25 * 1024 * 1024;

/**
 * Un documento cualquiera (de una nota): va dentro de la carpeta de las fotos, así la
 * papelera lo borra igual al vaciarse. Guarda el nombre original para mostrarlo y bajarlo.
 */
export async function storeFile(file: File, owner: PhotoOwner, name: string): Promise<{ id: string }> {
  if (file.size > FILE_MAX_BYTES) throw new Error("El archivo es demasiado pesado.");
  const ext = (name.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin";
  const id = crypto.randomUUID();
  const type = file.type || "application/octet-stream";
  const res = await put(`${folder()}archivos/${id}.${ext}`, file, { access: "private", contentType: type, addRandomSuffix: false });
  const a = await prisma.attachment.create({
    data: { pathname: res.pathname, contentType: type, size: file.size, name: name.slice(0, 200), ...owner },
  });
  return { id: a.id };
}

export async function openPhoto(id: string) {
  const a = await prisma.attachment.findUnique({ where: { id } });
  if (!a) return null;
  const r = await get(a.pathname, { access: "private" });
  return r?.statusCode === 200 ? { attachment: a, stream: r.stream } : null;
}

/** Borra los archivos (cuando ya no hay forma de restaurarlos). */
export async function deletePhotoFiles(pathnames: string[]) {
  const list = pathnames.filter((p) => typeof p === "string" && p.includes("fotos/"));
  if (list.length && photosEnabled()) await del(list).catch((e) => console.error("No se pudieron borrar fotos", e));
}

export const toPhotoDTO = (a: { id: string; width: number | null; height: number | null }): PhotoDTO => ({
  id: a.id,
  width: a.width,
  height: a.height,
});
