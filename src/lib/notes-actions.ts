"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "./prisma";
import { exigirSesion } from "./session";
import { logActivity, trashAndDelete } from "./trash";
import { isClientId } from "./plan-logic";
import {
  categoryColorKey,
  isCategoryColor,
  isNoteSection,
  NOTE_CATEGORY_COLORS_KEY,
  normalizeCategory,
  normalizeStars,
  noteFromForm,
  parseCategoryColors,
  safeJson,
  noteHeading,
  youtubeId,
  youtubeThumb,
} from "./notes-logic";
import { fetchLinkMeta, getNoteCategories } from "./notes";

export type NoteResult = { ok: true; id: string } | { ok: false; error: string };

function refrescar() {
  revalidatePath("/notas", "layout");
  revalidatePath("/");
}

const validId = (v: unknown): v is string => typeof v === "string" && /^[a-z0-9]{10,40}$/i.test(v);

/**
 * Deja guardado el color de todas las categorías (también la recién puesta), así una
 * categoría nueva no le cambia el color a las demás: cada una conserva el que ya se veía.
 */
async function fixCategoryColors() {
  const cats = await getNoteCategories();
  const value = JSON.stringify(Object.fromEntries(cats.map((c) => [categoryColorKey(c.section, c.name), c.color])));
  await prisma.appSetting.upsert({ where: { key: NOTE_CATEGORY_COLORS_KEY }, create: { key: NOTE_CATEGORY_COLORS_KEY, value }, update: { value } });
}

/**
 * Crea o edita una nota desde la hoja. Si tiene link y no tiene título, el
 * servidor busca el título de la página (3 s como mucho; si no llega, queda sin
 * título). La miniatura de YouTube sale del id del video.
 */
export async function saveNote(_prev: NoteResult | null, fd: FormData): Promise<NoteResult> {
  await exigirSesion();
  const parsed = noteFromForm(fd);
  if (!parsed.ok) return parsed;
  const n = parsed.note;
  const id = String(fd.get("id") ?? "").trim().slice(0, 40) || null;

  const before = id ? await prisma.note.findUnique({ where: { id }, select: { url: true, title: true, thumbnail: true } }) : null;
  if (id && !before) return { ok: false, error: "Esa nota ya no existe." };

  // Título y miniatura del link: solo si el link es nuevo o cambió (no se pide de nuevo en cada edición).
  let title = n.title;
  let thumbnail = before && before.url === n.url ? before.thumbnail : null;
  if (n.url && (!before || before.url !== n.url)) {
    const yt = youtubeId(n.url);
    if (yt) thumbnail = youtubeThumb(yt);
    // Sin título o sin foto: se buscan en la página (la foto del producto en una tienda).
    if (!title || !thumbnail) {
      const meta = await fetchLinkMeta(n.url);
      title = title ?? meta.title;
      thumbnail = thumbnail ?? meta.thumbnail;
    }
  }
  if (!n.url) thumbnail = null;
  // La hoja manda también "Fijada" y "Visto/Hecho" (casillas); el bot no.
  const flags = fd.get("flags") === "1" ? { pinned: fd.get("pinned") === "on", done: fd.get("done") === "on" } : {};
  const data = { ...n, title, thumbnail, ...flags };

  if (id) {
    await prisma.note.update({ where: { id }, data });
    if (data.category) await fixCategoryColors();
    await logActivity("updated", "note", id, noteHeading(data));
    refrescar();
    return { ok: true, id };
  }
  const clientId = fd.get("clientId");
  const fresh = isClientId(clientId) && !(await prisma.note.findUnique({ where: { id: clientId }, select: { id: true } })) ? clientId : undefined;
  const created = await prisma.note.create({ data: { ...data, ...(fresh ? { id: fresh } : {}), source: "app" } });
  if (data.category) await fixCategoryColors();
  await logActivity("created", "note", created.id, noteHeading(data));
  refrescar();
  return { ok: true, id: created.id };
}

/** Va a la papelera (con sus fotos), se deshace desde el aviso de abajo. */
export async function deleteNote(id: string) {
  await exigirSesion();
  if (!validId(id)) return;
  await trashAndDelete("note", id);
  refrescar();
}

export async function setNotePinned(id: string, pinned: boolean) {
  await exigirSesion();
  if (!validId(id)) return;
  await prisma.note.updateMany({ where: { id }, data: { pinned: !!pinned } });
  refrescar();
}

/** Lugar de una nota en la lista (al arrastrarla entre otras dos; ver `sortKeyAfterMove`). */
export async function moveNote(id: string, sortKey: number) {
  await exigirSesion();
  if (!validId(id) || typeof sortKey !== "number" || !Number.isFinite(sortKey) || Math.abs(sortKey) > 1e15) return;
  await prisma.note.updateMany({ where: { id }, data: { sortKey } });
  refrescar();
}

/** Importancia: de 0 a 3 estrellas. */
export async function setNoteStars(id: string, stars: number) {
  await exigirSesion();
  if (!validId(id)) return;
  await prisma.note.updateMany({ where: { id }, data: { stars: normalizeStars(stars) } });
  refrescar();
}

/** "Ver después": visto o hecho. */
export async function setNoteDone(id: string, done: boolean) {
  await exigirSesion();
  if (!validId(id)) return;
  const n = await prisma.note.findUnique({ where: { id }, select: { title: true, body: true, url: true } });
  if (!n) return;
  await prisma.note.update({ where: { id }, data: { done: !!done } });
  if (done) await logActivity("done", "note", id, noteHeading(n));
  refrescar();
}

export async function moveNoteSection(id: string, section: string) {
  await exigirSesion();
  if (!validId(id) || !isNoteSection(section)) return;
  await prisma.note.updateMany({ where: { id }, data: { section } });
  refrescar();
}

/** Categoría propia de una nota (vacía = sin categoría). */
export async function setNoteCategory(id: string, category: string | null) {
  await exigirSesion();
  if (!validId(id)) return;
  const value = normalizeCategory(category);
  const n = await prisma.note.findUnique({ where: { id }, select: { title: true, body: true, url: true } });
  if (!n) return;
  await prisma.note.update({ where: { id }, data: { category: value } });
  if (value) await fixCategoryColors();
  await logActivity("updated", "note", id, `${noteHeading(n)}: ${value ? `categoría ${value}` : "sin categoría"}`);
  refrescar();
}

/** Cambia el color de una categoría (de todas sus notas: el color es de la categoría). */
export async function setNoteCategoryColor(section: string, name: string, color: string) {
  await exigirSesion();
  const category = normalizeCategory(name);
  if (!isNoteSection(section) || !category || !isCategoryColor(color)) return;
  await fixCategoryColors();
  const row = await prisma.appSetting.findUnique({ where: { key: NOTE_CATEGORY_COLORS_KEY } });
  const value = JSON.stringify({ ...parseCategoryColors(safeJson(row?.value)), [categoryColorKey(section, category)]: color });
  await prisma.appSetting.upsert({ where: { key: NOTE_CATEGORY_COLORS_KEY }, create: { key: NOTE_CATEGORY_COLORS_KEY, value }, update: { value } });
  refrescar();
}
