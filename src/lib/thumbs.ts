/**
 * Copia propia de la foto de un link cuando la del sitio vence (Instagram, Facebook y
 * TikTok firman sus direcciones y a las semanas dejan de andar). Va al almacén privado
 * (Vercel Blob, `miniaturas/`) y se muestra por `/api/miniatura/<nombre>`, con sesión.
 * No es una foto de la nota (no aparece en su tira de fotos). Sin `server-only` ni alias:
 * también lo usa `scripts/notas-miniaturas.ts`.
 */
import { get, put } from "@vercel/blob";
import { isExpiringImage } from "./link-meta.ts";

export const THUMB_ROUTE = "/api/miniatura/";
const MAX_BYTES = 3 * 1024 * 1024;
const NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;
const prefix = () => (process.env.VERCEL_ENV === "production" ? "miniaturas/" : "dev/miniaturas/");

/** Baja la imagen (solo de los sitios cuyas fotos vencen) y devuelve la dirección propia, o null. */
export async function storeThumbnail(imageUrl: string): Promise<string | null> {
  if (!process.env.BLOB_READ_WRITE_TOKEN || !isExpiringImage(imageUrl)) return null;
  try {
    const r = await fetch(imageUrl, { signal: AbortSignal.timeout(5000), cache: "no-store" });
    const type = (r.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const ext = type === "image/jpeg" ? "jpg" : type === "image/png" ? "png" : type === "image/webp" ? "webp" : null;
    if (!r.ok || !ext) return null;
    const buf = await r.arrayBuffer();
    if (!buf.byteLength || buf.byteLength > MAX_BYTES) return null;
    const name = `${crypto.randomUUID()}.${ext}`;
    await put(`${prefix()}${name}`, new Blob([buf], { type }), { access: "private", contentType: type, addRandomSuffix: false });
    return `${THUMB_ROUTE}${name}`;
  } catch {
    return null;
  }
}

/** La miniatura guardada (solo nombres que armó `storeThumbnail`). */
export async function openThumbnail(name: string) {
  if (!NAME.test(name) || !process.env.BLOB_READ_WRITE_TOKEN) return null;
  const r = await get(`${prefix()}${name}`, { access: "private" }).catch(() => null);
  return r?.statusCode === 200 ? r : null;
}
