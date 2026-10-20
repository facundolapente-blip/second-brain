import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { NOTE_SECTIONS, isNoteSection, youtubeId, youtubeThumb, type NoteDTO } from "./notes-logic";
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
  tags: true,
  pinned: true,
  done: true,
  source: true,
  createdAt: true,
  attachments: { select: { id: true, width: true, height: true }, orderBy: { createdAt: "asc" } },
} satisfies Prisma.NoteSelect;

type Row = Prisma.NoteGetPayload<{ select: typeof SELECT }>;

const ORDER: Prisma.NoteOrderByWithRelationInput[] = [{ pinned: "desc" }, { createdAt: "desc" }, { id: "desc" }];

function toDTO(r: Row): NoteDTO {
  const { attachments, createdAt, ...rest } = r;
  return { ...rest, createdAt: createdAt.toISOString(), photos: attachments.map(toPhotoDTO) };
}

export type NoteFilters = {
  section?: string | null;
  q?: string | null;
  tag?: string | null;
  /** false = solo lo que falta ver (filtro "Ver después" de Videos). */
  done?: boolean | null;
  limit?: number;
  /** Id de la última nota de la página anterior. */
  cursor?: string | null;
};

export async function getNotes({ section, q, tag, done, limit = 60, cursor }: NoteFilters = {}) {
  const and: Prisma.NoteWhereInput[] = [];
  if (section && isNoteSection(section)) and.push({ section });
  if (tag) and.push({ tags: { has: tag } });
  if (typeof done === "boolean") and.push({ done });
  const where: Prisma.NoteWhereInput = and.length ? { AND: and } : {};
  const take = Math.min(500, Math.max(1, limit));

  const needle = q ? fold(q.trim()) : "";
  if (needle) {
    // Sin tildes ni mayúsculas: Postgres no lo hace solo, así que se filtra acá
    // (es una sola persona: unas miles de notas como mucho).
    const rows = await prisma.note.findMany({ where, select: SELECT, orderBy: ORDER });
    const hits = rows.filter((r) =>
      [r.title ?? "", r.body, r.url ?? "", r.price ?? "", ...r.tags].some((s) => fold(s).includes(needle)),
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

// ─── Título y miniatura de un link ──────────────────────────────────────────

const TIMEOUT_MS = 3000;
const MAX_BYTES = 200 * 1024;

/** Un dominio que no es la compu ni la red de la casa (no se le piden cosas a la red interna). */
function publicHost(u: URL): boolean {
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return false;
  if (/^\[/.test(h)) return false; // IPv6 literal
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224) return false;
  }
  return true;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function clean(s: string | undefined | null): string | null {
  const t = decodeEntities(String(s ?? "")).replace(/\s+/g, " ").trim();
  return t ? t.slice(0, 200) : null;
}

/** Lee como mucho `MAX_BYTES` del cuerpo (una página entera puede pesar megas). */
async function readHead(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    size += value.length;
    // El título está arriba: con el </head> alcanza.
    if (new TextDecoder().decode(value).includes("</head>")) break;
  }
  reader.cancel().catch(() => {});
  const all = new Uint8Array(Math.min(size, MAX_BYTES));
  let off = 0;
  for (const c of chunks) {
    const part = c.subarray(0, Math.max(0, all.length - off));
    all.set(part, off);
    off += part.length;
  }
  return new TextDecoder().decode(all);
}

/** "Mercado Libre" en mercadolibre.com.uy, "Instagram" en instagram.com: el nombre del sitio. */
function genericTitle(title: string, host: string): boolean {
  const t = fold(title).replace(/[^a-z0-9]/g, "");
  return t.length > 0 && t.length <= 30 && fold(host).replace(/[^a-z0-9.]/g, "").split(".").some((part) => part === t);
}

/**
 * Título (y miniatura si se puede) de un link, para una nota guardada sin
 * título. YouTube por oEmbed; el resto, el og:title o el <title> de la página.
 * Tres segundos como mucho y nunca falla: sin datos, devuelve nulls.
 */
export async function fetchLinkMeta(url: string): Promise<{ title: string | null; thumbnail: string | null }> {
  const none = { title: null, thumbnail: null };
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return none;
  }
  if ((u.protocol !== "http:" && u.protocol !== "https:") || !publicHost(u)) return none;
  const yt = youtubeId(url);
  try {
    if (yt) {
      const r = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
      const thumb = youtubeThumb(yt);
      if (!r.ok) return { title: null, thumbnail: thumb };
      const j = (await r.json()) as { title?: string };
      return { title: clean(j.title), thumbnail: thumb };
    }
    const r = await fetch(u, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "follow",
      cache: "no-store",
      headers: { "user-agent": "Mozilla/5.0 (compatible; SecondBrain/1.0)", accept: "text/html,application/xhtml+xml", "accept-language": "es-UY,es;q=0.9,en;q=0.6" },
    });
    // Después de las redirecciones, también tiene que ser un sitio público.
    if (!r.ok || !publicHost(new URL(r.url || u.href)) || !/html/i.test(r.headers.get("content-type") ?? "")) {
      r.body?.cancel().catch(() => {});
      return none;
    }
    const html = await readHead(r);
    const meta = (prop: string) =>
      html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`, "i"))?.[1] ??
      html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, "i"))?.[1];
    let title = clean(meta("og:title")) ?? clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
    // Un título que es solo el nombre del sitio ("Mercado Libre") no dice nada: mejor sin título.
    if (title && genericTitle(title, u.hostname)) title = null;
    const img = meta("og:image");
    let thumbnail: string | null = null;
    if (img) {
      try {
        const abs = new URL(decodeEntities(img), r.url || u.href);
        if (abs.protocol === "https:" && abs.href.length <= 1000) thumbnail = abs.href;
      } catch {
        // Imagen con una dirección rara: sin miniatura.
      }
    }
    return { title, thumbnail };
  } catch {
    return yt ? { title: null, thumbnail: youtubeThumb(yt) } : none;
  }
}
