import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import {
  assignCategoryColors,
  categoryColorKey,
  NOTE_CATEGORY_COLORS_KEY,
  NOTE_SECTIONS,
  NO_CATEGORY,
  isNoteSection,
  parseCategoryColors,
  safeJson,
  type CategoryColor,
  type NoteDTO,
} from "./notes-logic";
import { toPhotoDTO } from "./photos";

/**
 * Consultas de Notas. La búsqueda ignora tildes y mayúsculas (como el Journal:
 * se filtra en el servidor con `fold`). Las fijadas van siempre arriba.
 */

export function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const SELECT = {
  id: true,
  section: true,
  title: true,
  body: true,
  url: true,
  urlKind: true,
  thumbnail: true,
  price: true,
  category: true,
  tags: true,
  pinned: true,
  sortKey: true,
  done: true,
  source: true,
  createdAt: true,
  attachments: { select: { id: true, width: true, height: true }, orderBy: { createdAt: "asc" } },
} satisfies Prisma.NoteSelect;

type Row = Prisma.NoteGetPayload<{ select: typeof SELECT }>;

/** Fijadas arriba; después el lugar de cada una (arranca en su fecha y cambia al arrastrarla). */
const ORDER: Prisma.NoteOrderByWithRelationInput[] = [{ pinned: "desc" }, { sortKey: "desc" }, { id: "desc" }];

function toDTO(r: Row): NoteDTO {
  const { attachments, createdAt, ...rest } = r;
  return { ...rest, createdAt: createdAt.toISOString(), photos: attachments.map(toPhotoDTO) };
}

export type NoteFilters = {
  section?: string | null;
  q?: string | null;
  tag?: string | null;
  /** Una categoría, o `NO_CATEGORY` para las que no tienen. */
  category?: string | null;
  /** false = solo lo que falta ver (filtro "Ver después" de Videos). */
  done?: boolean | null;
  limit?: number;
  /** Id de la última nota de la página anterior. */
  cursor?: string | null;
};

export async function getNotes({ section, q, tag, category, done, limit = 60, cursor }: NoteFilters = {}) {
  const and: Prisma.NoteWhereInput[] = [];
  if (section && isNoteSection(section)) and.push({ section });
  if (tag) and.push({ tags: { has: tag } });
  if (category) and.push({ category: category === NO_CATEGORY ? null : category });
  if (typeof done === "boolean") and.push({ done });
  const where: Prisma.NoteWhereInput = and.length ? { AND: and } : {};
  const take = Math.min(500, Math.max(1, limit));

  const needle = q ? fold(q.trim()) : "";
  if (needle) {
    // Sin tildes ni mayúsculas: Postgres no lo hace solo, así que se filtra acá
    // (es una sola persona: unas miles de notas como mucho).
    const rows = await prisma.note.findMany({ where, select: SELECT, orderBy: ORDER });
    const hits = rows.filter((r) =>
      [r.title ?? "", r.body, r.url ?? "", r.price ?? "", r.category ?? "", ...r.tags].some((s) => fold(s).includes(needle)),
    );
    const start = cursor ? hits.findIndex((r) => r.id === cursor) + 1 : 0;
    const page = hits.slice(start, start + take);
    return { notes: page.map(toDTO), nextCursor: start + take < hits.length ? page.at(-1)?.id ?? null : null, total: hits.length };
  }

  const rows = await prisma.note.findMany({
    where,
    select: SELECT,
    orderBy: ORDER,
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const page = rows.slice(0, take);
  return { notes: page.map(toDTO), nextCursor: rows.length > take ? page.at(-1)?.id ?? null : null, total: null };
}

/** Cuántas notas hay en cada sección (y en total), y videos sin ver. */
export async function getNoteCounts() {
  const [groups, laterVideos] = await Promise.all([
    prisma.note.groupBy({ by: ["section"], _count: { _all: true } }),
    prisma.note.count({ where: { section: "videos", done: false } }),
  ]);
  const bySection: Record<string, number> = Object.fromEntries(NOTE_SECTIONS.map((s) => [s.id, 0]));
  let all = 0;
  for (const g of groups) {
    all += g._count._all;
    // Una sección que ya no existe se cuenta en Links (ahí se muestra).
    const id = isNoteSection(g.section) ? g.section : "links";
    bySection[id] = (bySection[id] ?? 0) + g._count._all;
  }
  return { all, bySection, laterVideos };
}

/**
 * Categorías propias por sección, con cuántas notas tiene cada una (de la más usada a la
 * menos) y cuántas no tienen categoría. Las usan los filtros y la hoja.
 */
export async function getNoteCategories(): Promise<{ section: string; name: string; count: number; color: CategoryColor }[]> {
  const [rows, saved] = await Promise.all([
    prisma.note.groupBy({ by: ["section", "category"], where: { category: { not: null } }, _count: { _all: true } }),
    getCategoryColors(),
  ]);
  const cats = rows.map((r) => ({ section: isNoteSection(r.section) ? r.section : "links", name: r.category!, count: r._count._all }));
  const colors = assignCategoryColors(cats, saved);
  return cats
    .map((c) => ({ ...c, color: colors[categoryColorKey(c.section, c.name)] }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "es"));
}

/** Colores guardados de las categorías (las que no tienen se reparten al leer). */
export async function getCategoryColors(): Promise<Record<string, CategoryColor>> {
  const row = await prisma.appSetting.findUnique({ where: { key: NOTE_CATEGORY_COLORS_KEY } });
  return parseCategoryColors(safeJson(row?.value));
}

/** Cuántas notas de una sección no tienen categoría. */
export async function countUncategorized(section: string): Promise<number> {
  return prisma.note.count({ where: { section, category: null } });
}

/** Etiquetas usadas, de la más usada a la menos (para sugerir en la hoja). */
export async function getNoteTags(limit = 30): Promise<string[]> {
  const rows = await prisma.note.findMany({ where: { tags: { isEmpty: false } }, select: { tags: true }, take: 2000, orderBy: { createdAt: "desc" } });
  const count = new Map<string, number>();
  for (const r of rows) for (const t of r.tags) count.set(t, (count.get(t) ?? 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([t]) => t);
}

/** Para Inicio: las últimas 3 y los videos sin ver. */
export async function getNotesSummary() {
  const [latest, laterVideos] = await Promise.all([
    prisma.note.findMany({ select: SELECT, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 3 }),
    prisma.note.count({ where: { section: "videos", done: false } }),
  ]);
  return { latest: latest.map(toDTO), laterVideos };
}

export { fetchLinkMeta } from "./link-meta";
