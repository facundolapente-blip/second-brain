import "server-only";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { logActivity } from "../trash";
import { fetchLinkMeta } from "../notes";
import { storeThumbnail } from "../thumbs";
import { photosEnabled, storePhoto } from "../photos";
import {
  bodyWithoutUrl,
  classifyNote,
  detectUrl,
  normalizeNoteUrl,
  NOTE_BODY_MAX,
  NOTE_PRICE_MAX,
  sectionOf,
  suggestNoteTags,
  urlKindOf,
  youtubeId,
  youtubeThumb,
  type NoteSectionId,
} from "../notes-logic";

/**
 * Lo que el bot de WhatsApp guarda en Notas (todo lo que no es un comando ni un gasto).
 * La sección la decide `classifyNote`, igual que la hoja de la app.
 */

/** Cuánto después de un link de tienda un precio suelto se le suma a esa nota. */
const PRICE_WINDOW_MS = 15 * 60 * 1000;

function refresh() {
  revalidatePath("/notas", "layout");
  revalidatePath("/");
}

/** La misma nota de WhatsApp no se guarda dos veces (Meta a veces reintenta). */
async function createOnce(data: Prisma.NoteCreateInput): Promise<{ id: string } | null> {
  try {
    return await prisma.note.create({ data, select: { id: true } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return null;
    throw e;
  }
}

/** Texto o link → nota en su sección, con título y miniatura del link si se pueden sacar. */
export async function saveTextNote(text: string, msgId: string | null): Promise<string> {
  const raw = detectUrl(text);
  const url = normalizeNoteUrl(raw);
  const section: NoteSectionId = classifyNote({ text, url });
  const tags = suggestNoteTags({ text, url });
  let title: string | null = null;
  let thumbnail: string | null = null;
  if (url) {
    const meta = await fetchLinkMeta(url, undefined, { keep: storeThumbnail }).catch(() => ({ title: null, thumbnail: null }));
    title = meta.title;
    const yt = youtubeId(url);
    thumbnail = meta.thumbnail ?? (yt ? youtubeThumb(yt) : null);
  }
  const body = bodyWithoutUrl(text, raw).slice(0, NOTE_BODY_MAX);
  const created = await createOnce({
    section,
    title,
    body,
    url,
    urlKind: urlKindOf(url),
    thumbnail,
    tags,
    source: "whatsapp",
    externalId: msgId,
  });
  if (!created) return "Eso ya estaba guardado.";
  await logActivity("created", "note", created.id, `${title ?? (body.slice(0, 60) || url || "Nota")} (WhatsApp)`);
  refresh();
  const name = sectionOf(section).name;
  return `Guardado en Notas · ${name}${title ? `: ${title}` : ""}`;
}

/**
 * "260 con envío" justo después de un link de tienda: es el precio de esa nota, no un
 * gasto. Devuelve la respuesta, o null si no había una nota de compras reciente sin precio.
 */
export async function attachPriceToLastShop(price: string): Promise<string | null> {
  const last = await prisma.note.findFirst({
    where: { source: "whatsapp", section: "compras", price: null, createdAt: { gte: new Date(Date.now() - PRICE_WINDOW_MS) } },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, url: true },
  });
  if (!last) return null;
  const value = price.trim().slice(0, NOTE_PRICE_MAX);
  await prisma.note.update({ where: { id: last.id }, data: { price: value } });
  refresh();
  return `Precio sumado a ${last.title ?? "la última compra"}: ${value}`;
}

export type IncomingMedia = {
  kind: "image" | "document" | "video" | "audio";
  caption: string | null;
  filename: string | null;
  /** La imagen ya bajada de WhatsApp (solo imágenes; lo demás queda anotado). */
  file: File | null;
};

/** Foto → nota en Archivos con la foto; documento, video o audio → nota con el nombre. */
export async function saveMediaNote(m: IncomingMedia, msgId: string | null): Promise<string> {
  const what = { image: "Foto", document: "Documento", video: "Video", audio: "Audio" }[m.kind];
  const caption = (m.caption ?? "").trim();
  const parts = [caption, m.kind !== "image" ? `${what}${m.filename ? `: ${m.filename}` : ""} (el archivo queda en WhatsApp)` : ""].filter(Boolean);
  const created = await createOnce({
    section: "archivos",
    title: m.filename ?? (caption ? null : what),
    body: parts.join("\n\n").slice(0, NOTE_BODY_MAX),
    tags: [],
    source: "whatsapp",
    externalId: msgId,
  });
  if (!created) return "Eso ya estaba guardado.";
  let stored = false;
  if (m.file && photosEnabled()) {
    try {
      await storePhoto(m.file, { noteId: created.id });
      stored = true;
    } catch (e) {
      console.error("[whatsapp] no se pudo guardar la foto:", e instanceof Error ? e.message : e);
    }
  }
  await logActivity("created", "note", created.id, `${what} (WhatsApp)`);
  refresh();
  if (m.kind === "image") return stored ? "Foto guardada en Notas · Archivos" : "Guardé la nota en Archivos, pero la foto no se pudo subir.";
  return `Guardado en Notas · Archivos (${what.toLowerCase()}; el archivo en sí queda en WhatsApp)`;
}
