/**
 * Notas: lo que Facu antes se mandaba a sí mismo por WhatsApp. Lógica pura
 * (servidor, cliente, bot y tests): secciones, links, clasificación y etiquetas.
 *
 * Las secciones están solo acá (`NOTE_SECTIONS`). En la base la sección es un
 * texto, así que sumar, renombrar o reordenar secciones no necesita migración;
 * una nota con una sección que ya no existe se muestra en "Links" (`sectionOf`).
 */
import type { Icon } from "@phosphor-icons/react";
// De a un ícono (el índice completo carga ~1500 y los tests tardaban 30 s); la versión
// "ssr" sirve igual en el servidor (bot) y en la pantalla.
import { Database } from "@phosphor-icons/react/dist/ssr/Database";
import { GraduationCap } from "@phosphor-icons/react/dist/ssr/GraduationCap";
import { Lightbulb } from "@phosphor-icons/react/dist/ssr/Lightbulb";
import { LinkSimple } from "@phosphor-icons/react/dist/ssr/LinkSimple";
import { MusicNotes } from "@phosphor-icons/react/dist/ssr/MusicNotes";
import { Paperclip } from "@phosphor-icons/react/dist/ssr/Paperclip";
import { PlayCircle } from "@phosphor-icons/react/dist/ssr/PlayCircle";
import { ShoppingCart } from "@phosphor-icons/react/dist/ssr/ShoppingCart";
import type { PaletteKey } from "./palette";

export type NoteSection = {
  id: string;
  /** Nombre en la interfaz (píldoras, hoja, menú). */
  name: string;
  /** Más corto, para la barra de abajo y el menú "Mover a…" si hace falta. */
  short?: string;
  icon: Icon;
  /** Color de la paleta (`palette.ts`): ícono lleno con `chip-solid`. */
  color: PaletteKey;
  /** Qué va a aparecer ahí (estado vacío). */
  empty: string;
};

const SECTIONS = [
  { id: "videos", name: "Videos", icon: PlayCircle, color: "red", empty: "Los videos de YouTube, los reels de Instagram y los TikTok que guardes para ver después." },
  { id: "compras", name: "Para comprar", short: "Compras", icon: ShoppingCart, color: "orange", empty: "Links de tiendas (Mercado Libre, Amazon, Thomann…) con su precio, para no perderles el rastro." },
  { id: "ideas", name: "Ideas", icon: Lightbulb, color: "yellow", empty: "Ideas sueltas y textos: de música, de negocios, personales. Usá etiquetas para agruparlas." },
  { id: "cursos", name: "Cursos y recursos", short: "Cursos", icon: GraduationCap, color: "blue", empty: "Cursos, seminarios, Skool, Wistia, Drive y documentos de recursos." },
  { id: "musica", name: "Música", icon: MusicNotes, color: "purple", empty: "Temas y artistas de Beatport, Bandcamp, SoundCloud o Spotify, y plugins." },
  { id: "datos", name: "Datos y plantillas", short: "Datos", icon: Database, color: "teal", empty: "Direcciones, cuentas para transferir, textos de plantilla, listas y medidas." },
  { id: "archivos", name: "Archivos", icon: Paperclip, color: "brown", empty: "Fotos y documentos. Creá una nota y agregale las fotos desde la hoja." },
  { id: "links", name: "Links", icon: LinkSimple, color: "green", empty: "Todo link que no entre en otra sección." },
] as const satisfies readonly NoteSection[];

export type NoteSectionId = (typeof SECTIONS)[number]["id"];

/** Las secciones de Notas, en el orden en que se muestran. */
export const NOTE_SECTIONS: readonly (NoteSection & { id: NoteSectionId })[] = SECTIONS;

/** Adonde va lo que no tiene sección conocida. */
export const FALLBACK_SECTION: NoteSectionId = "links";

export function isNoteSection(v: unknown): v is NoteSectionId {
  return typeof v === "string" && NOTE_SECTIONS.some((s) => s.id === v);
}

export function sectionOf(id: string | null | undefined): NoteSection & { id: NoteSectionId } {
  return NOTE_SECTIONS.find((s) => s.id === id) ?? NOTE_SECTIONS.find((s) => s.id === FALLBACK_SECTION)!;
}

// ─── Links ──────────────────────────────────────────────────────────────────

/** Puntuación que suele quedar pegada al final de un link escrito en un texto. */
const TRAILING = /[.,;:!?¡¿'"»”’)\]}>]+$/;

/**
 * Primer link del texto (con http/https, o que empieza con "www."), ya
 * normalizado. Saca la puntuación pegada al final ("mirá esto: https://x.com/a.")
 * pero conserva un paréntesis que abre adentro del link (Wikipedia).
 */
export function detectUrl(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(/(?:https?:\/\/|www\.)[^\s<>"'`]+/i);
  if (!m) return null;
  let raw = m[0];
  while (TRAILING.test(raw)) {
    const last = raw.at(-1)!;
    // "(algo)" dentro del link: el ")" es del link si hay un "(" sin cerrar.
    if (last === ")" && (raw.match(/\(/g)?.length ?? 0) > (raw.slice(0, -1).match(/\)/g)?.length ?? 0)) break;
    raw = raw.slice(0, -1);
  }
  return normalizeNoteUrl(raw);
}

/**
 * Link válido para guardar: agrega https:// si falta, solo http/https, con un
 * dominio de verdad. Null si no sirve. (Igual que `normalizeLink` del Plan.)
 */
export function normalizeNoteUrl(raw: string | null | undefined): string | null {
  const t = String(raw ?? "").trim();
  if (!t || t.length > 2000) return null;
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(t) || /^(javascript|data|vbscript|mailto|file|blob|about|tel|sms):/i.test(t);
  try {
    const u = new URL(hasScheme ? t : `https://${t}`);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname.includes(".") && u.hostname !== "localhost") return null;
    return u.toString();
  } catch {
    return null;
  }
}

function parse(url: string | null | undefined): URL | null {
  if (!url) return null;
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/** Dominio sin "www." ni "m." ("youtube.com"). */
export function noteDomain(url: string | null | undefined): string {
  const u = parse(url);
  return u ? u.hostname.replace(/^(www|m|mobile)\./, "") : "";
}

/** ¿El dominio es `base` o un subdominio suyo? */
function hostIs(host: string, base: string) {
  return host === base || host.endsWith(`.${base}`);
}

export type UrlKind = "youtube" | "instagram" | "tiktok" | "spotify" | "soundcloud" | "bandcamp" | "beatport" | "x" | "drive" | "web";

/** Qué tipo de link es (para el ícono y la clasificación). */
export function urlKindOf(url: string | null | undefined): UrlKind | null {
  const u = parse(url);
  if (!u) return null;
  const h = u.hostname.toLowerCase();
  if (hostIs(h, "youtube.com") || hostIs(h, "youtu.be") || hostIs(h, "youtube-nocookie.com")) return "youtube";
  if (hostIs(h, "instagram.com") || h === "instagr.am") return "instagram";
  if (hostIs(h, "tiktok.com")) return "tiktok";
  if (hostIs(h, "spotify.com") || h === "spotify.link") return "spotify";
  if (hostIs(h, "soundcloud.com") || h === "on.soundcloud.com") return "soundcloud";
  if (hostIs(h, "bandcamp.com")) return "bandcamp";
  if (hostIs(h, "beatport.com")) return "beatport";
  if (hostIs(h, "x.com") || hostIs(h, "twitter.com") || h === "t.co") return "x";
  if (h === "drive.google.com" || h === "docs.google.com") return "drive";
  return "web";
}

/** Id de 11 caracteres de un video de YouTube (watch, youtu.be, shorts, embed, live), o null. */
export function youtubeId(url: string | null | undefined): string | null {
  const u = parse(url);
  if (!u || urlKindOf(url) !== "youtube") return null;
  const ok = (s: string | null | undefined) => (s && /^[\w-]{11}$/.test(s) ? s : null);
  if (hostIs(u.hostname, "youtu.be")) return ok(u.pathname.split("/")[1]);
  const v = ok(u.searchParams.get("v"));
  if (v) return v;
  const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/);
  return m ? m[1] : null;
}

/** Miniatura de un video de YouTube (sin pedir nada a YouTube). */
export function youtubeThumb(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

/** Video para ver: YouTube, reel de Instagram (también /tv) o TikTok. */
export function isVideoUrl(url: string | null | undefined): boolean {
  const kind = urlKindOf(url);
  const u = parse(url);
  if (!u || !kind) return false;
  if (kind === "youtube") return true;
  if (kind === "tiktok") return true;
  if (kind === "instagram") return /^\/(?:[\w.]+\/)?(?:reels?|tv)\//i.test(u.pathname);
  return false;
}

// ─── Clasificación ──────────────────────────────────────────────────────────
// El bot de WhatsApp usa exactamente `classifyNote`. Para ajustarla alcanza con
// tocar estas listas (o el orden de las reglas en `classifyNote`).

/** Música: dominios, y cualquier dominio o camino con "plugin". */
export const MUSIC_HOSTS = ["beatport.com", "bandcamp.com", "soundcloud.com", "open.spotify.com", "spotify.link", "splice.com", "plugin-alliance.com", "native-instruments.com"];
/** Cursos y recursos: dominios, y texto con estas palabras (si hay link). */
export const COURSE_HOSTS = ["wisboo.com", "skool.com", "wistia.com", "wistia.net", "hotmart.com", "pay.hotmart.com", "udemy.com", "domestika.org", "coursera.org"];
export const COURSE_WORDS = /\b(curso|cursos|seminario|seminarios|masterclass|clase grabada|workshop|taller)\b/i;
/** Para comprar: tiendas (por dominio, sin importar el país) y caminos de producto. */
export const SHOP_HOSTS = ["amazon.", "mercadolibre.", "mercadolivre.", "thomann.", "thomannmusic.", "aliexpress.", "ebay.", "reverb.com", "temu.com", "shein.com"];
export const SHOP_PATHS = /\/(?:products?|producto|productos|p|tienda|item|articulo|dp|catalogo)\/|\/marketplace\/item\//i;

function anyHost(host: string, list: string[]) {
  return list.some((b) => (b.endsWith(".") ? host.includes(b) && (host.startsWith(b) || host.includes(`.${b}`)) : hostIs(host, b)));
}

/** Texto largo: más de 280 caracteres, o de 3 renglones o más, o con un párrafo aparte. */
export const LONG_TEXT_CHARS = 280;
export function isLongText(text: string): boolean {
  const t = text.trim();
  if (t.length > LONG_TEXT_CHARS) return true;
  if (/\n\s*\n/.test(t)) return true;
  return t.split(/\r?\n/).filter((l) => l.trim()).length >= 3;
}

/**
 * En qué sección va una nota nueva, según el link (el que venga o el primero del
 * texto) y el texto:
 *  - videos: YouTube (también shorts y youtu.be), reels de Instagram, TikTok;
 *  - musica: Beatport, Bandcamp, SoundCloud, Spotify, o "plugin" en el dominio o el camino;
 *  - cursos: Skool, Wistia, Hotmart…, o "curso"/"seminario" en el texto (con link o sin);
 *  - compras: Amazon, Mercado Libre, Marketplace de Facebook, Thomann, tiendas
 *    Shopify y caminos /products/, /producto/, /product/, /p/, /tienda/;
 *  - links: cualquier otro link;
 *  - sin link: cursos si nombra un curso o seminario ("Curso nico gallusi"); si no, ideas
 *    (si es largo, además lleva la etiqueta "personal": `suggestNoteTags`).
 */
export function classifyNote({ text, url }: { text?: string | null; url?: string | null }): NoteSectionId {
  const body = text ?? "";
  const link = normalizeNoteUrl(url) ?? detectUrl(body);
  // Sin link: datos sueltos (un mail, un teléfono, "Nombre: … Dirección: … RUT") van a Datos;
  // un recordatorio de un curso ("Curso nico gallusi") a Cursos, salvo un texto largo.
  if (!link) {
    if (looksLikeData(body)) return "datos";
    return COURSE_WORDS.test(body) && !isLongText(body) ? "cursos" : "ideas";
  }
  const u = parse(link)!;
  const host = u.hostname.toLowerCase();
  const path = u.pathname.toLowerCase();
  // El texto sin el link (así "curso" en el link no cuenta dos veces).
  const words = body.replace(/(?:https?:\/\/|www\.)\S+/gi, " ");

  if (isVideoUrl(link)) return "videos";
  if (anyHost(host, MUSIC_HOSTS) || host.includes("plugin") || path.includes("plugin")) return "musica";
  if (anyHost(host, COURSE_HOSTS) || COURSE_WORDS.test(words)) return "cursos";
  if (
    anyHost(host, SHOP_HOSTS) ||
    host.endsWith(".myshopify.com") ||
    (hostIs(host, "facebook.com") && path.startsWith("/marketplace")) ||
    // Los caminos de producto solo en sitios comunes (instagram.com/p/ es una publicación).
    (urlKindOf(link) === "web" && SHOP_PATHS.test(path))
  ) {
    return "compras";
  }
  return "links";
}

/**
 * Un precio suelto ("260 con envío", "95 usd c/u", "$ 1.200", "u$s 40"): el bot y el
 * importador lo suman a la última nota de Para comprar si llegó hace poco.
 */
export function looksLikePrice(text: string): boolean {
  const t = text.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (!t || t.length > 50 || /\n/.test(t)) return false;
  return /^(?:(?:u\$s|us\$|usd|\$|uyu)\s*)?\d[\d.,]*\s*(?:k\b)?\s*(?:usd|u\$s|us\$|dolares|pesos|uyu|\$)?(?:\s+(?:con envio|envio incluido|sin envio|c\/u|cada uno|cada una|el par|los dos|las dos|mas envio|\+ ?envio)\b.*)?$/.test(t);
}

/**
 * Datos para tener a mano: solo un mail, solo un teléfono, o renglones con rótulos de datos
 * ("Nombre:", "Dirección:", "RUT", "Cuenta:", "Sucursal", "CI").
 */
export function looksLikeData(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(t)) return true;
  if (/^\+?[\d\s().-]{7,}$/.test(t) && (t.match(/\d/g) ?? []).length >= 7) return true;
  return /(^|\n)\s*(nombre|direcci[oó]n|rut|n[uú]mero de rut|nunero de rut|cuenta|sucursal|c\.?i\.?|c[eé]dula|tel[eé]fono|celular|mail|email)\s*[:.]/i.test(t);
}

/** Etiquetas que se sugieren solas: un texto largo sin link es "personal". */
export function suggestNoteTags({ text, url }: { text?: string | null; url?: string | null }): string[] {
  const body = text ?? "";
  if (normalizeNoteUrl(url) || detectUrl(body)) return [];
  return isLongText(body) ? ["personal"] : [];
}

/** Etiquetas que se ofrecen en la hoja (sub-temas de Ideas). */
export const SUGGESTED_TAGS = ["música", "negocios", "personal"];

// ─── Etiquetas ──────────────────────────────────────────────────────────────

export const NOTE_TAG_MAX = 40;
export const NOTE_TAGS_MAX = 12;

/** "#Música, negocios" → ["música", "negocios"]. Acepta un texto (comas o espacios con #) o una lista. */
export function normalizeTags(raw: unknown): string[] {
  const parts: string[] = Array.isArray(raw)
    ? raw.filter((x): x is string => typeof x === "string")
    : typeof raw === "string"
      ? raw.includes(",")
        ? raw.split(",")
        : raw.includes("#")
          ? raw.split(/\s*#/)
          : [raw]
      : [];
  const out: string[] = [];
  for (const p of parts) {
    const t = p.replace(/^#+/, "").trim().replace(/\s+/g, " ").toLowerCase().slice(0, NOTE_TAG_MAX);
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= NOTE_TAGS_MAX) break;
  }
  return out;
}

// ─── Claves y contraseñas ───────────────────────────────────────────────────

/**
 * ¿Parece una credencial? El bot no guarda estos mensajes. Detecta:
 *  - claves de API conocidas (sk-…, ghp_…, xoxb-…, AKIA…, AIza…);
 *  - tokens tipo JWT (eyJ….….…) y "algo_token: valor" (mcp_token, access_token);
 *  - "contraseña"/"password"/"clave"/"pin"/"usuario y clave" seguido de un valor;
 *  - una tira larga de letras y números (32+) que no es un link;
 *  - el mensaje entero es una sola palabra con letras y números que parece contraseña.
 */
export function looksLikeSecret(text: string | null | undefined): boolean {
  const t = String(text ?? "").trim();
  if (!t) return false;
  const noUrls = t.replace(/(?:https?:\/\/|www\.)\S+/gi, " ");

  if (/\b(?:sk|pk|rk)[-_](?:live|test|proj|ant)?[-_]?[A-Za-z0-9_-]{16,}/.test(noUrls)) return true;
  if (/\b(?:ghp|gho|ghs|github_pat|glpat|xox[abpr])[-_][A-Za-z0-9_-]{10,}/.test(noUrls)) return true;
  if (/\bAKIA[0-9A-Z]{16}\b/.test(noUrls) || /\bAIza[0-9A-Za-z_-]{30,}/.test(noUrls)) return true;
  if (/\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/.test(noUrls)) return true;
  if (/\b\w*(?:token|secret|api[_-]?key|apikey)\w*\s*[:=]\s*\S{6,}/i.test(noUrls)) return true;
  if (/\b\w+_token\b\s+\S{12,}/i.test(noUrls)) return true;

  const kw = "(?:contraseñas?|contrasenas?|password|passwd|pass|pwd|clave|pin|c[oó]digo de acceso)";
  // "contraseña: X", "password = X", "clave es X", "pass - X".
  if (new RegExp(`${kw}\\s*(?:[:=]|\\bes\\b|-)\\s*\\S{3,}`, "i").test(noUrls)) return true;
  // "contraseña X1234" (el valor tiene algún número o símbolo).
  if (new RegExp(`${kw}\\s+(?=\\S*[\\d!@#$%^&*_+=?])\\S{4,}`, "i").test(noUrls)) return true;

  // Tira larga de letras y números (con algún número) que no es un link.
  for (const w of noUrls.split(/\s+/)) {
    if (w.length >= 32 && /^[A-Za-z0-9_\-+/=.]+$/.test(w) && /\d/.test(w) && /[A-Za-z]/.test(w)) return true;
  }

  // Una sola palabra con letras y números: "Facu1234!", "mezcla2024".
  if (!/\s/.test(t) && t === noUrls.trim() && t.length >= 8 && t.length <= 64) {
    const letters = (t.match(/[A-Za-zÀ-ÿ]/g) ?? []).length;
    const digits = (t.match(/\d/g) ?? []).length;
    const unit = /^\$?\d+(?:[.,]\d+)?(?:usd|uyu|us\$|kg|g|cm|mm|m|km|gb|mb|tb|hs?|min|x\d+)$/i.test(t);
    const date = /^\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}$/.test(t);
    const phone = /^\+?\d[\d-]{6,}$/.test(t);
    if (letters >= 2 && digits >= 1 && !unit && !date && !phone && !/[.@]/.test(t.replace(/[!.]$/, ""))) return true;
  }
  return false;
}

// ─── Formulario ─────────────────────────────────────────────────────────────

export type NoteDTO = {
  id: string;
  section: string;
  title: string | null;
  body: string;
  url: string | null;
  urlKind: string | null;
  thumbnail: string | null;
  price: string | null;
  tags: string[];
  pinned: boolean;
  done: boolean;
  source: string | null;
  /** ISO del momento en que se creó. */
  createdAt: string;
  photos: { id: string; width: number | null; height: number | null }[];
};

export const NOTE_TITLE_MAX = 200;
export const NOTE_BODY_MAX = 20000;
export const NOTE_PRICE_MAX = 80;

type FormLike = { get(name: string): FormDataEntryValue | null };
const field = (fd: FormLike, k: string, max: number) => String(fd.get(k) ?? "").trim().slice(0, max);

export type NoteInput = {
  section: NoteSectionId;
  title: string | null;
  body: string;
  url: string | null;
  urlKind: UrlKind | null;
  price: string | null;
  tags: string[];
};

/**
 * Lee la hoja de una nota (lo usan la acción y la pantalla, para mostrar el
 * cambio al instante). El link: el del campo, o si está vacío, el primero del
 * texto. Si la sección no viene, la decide `classifyNote`. Error legible si no hay nada.
 */
export function noteFromForm(fd: FormLike): { ok: true; note: NoteInput } | { ok: false; error: string } {
  const title = field(fd, "title", NOTE_TITLE_MAX) || null;
  // El texto conserva los saltos de línea (solo se recorta al principio y al final).
  const body = String(fd.get("body") ?? "").replace(/\s+$/, "").replace(/^\s*\n/, "").slice(0, NOTE_BODY_MAX);
  const rawUrl = field(fd, "url", 2000);
  const url = rawUrl ? normalizeNoteUrl(rawUrl) : detectUrl(body);
  if (rawUrl && !url) return { ok: false, error: "Ese link no parece válido (tiene que ser http o https)." };
  const photos = field(fd, "hasPhotos", 5) === "1";
  if (!title && !body.trim() && !url && !photos) return { ok: false, error: "Escribí algo o pegá un link." };
  const raw = field(fd, "section", 40);
  const section = isNoteSection(raw) ? raw : classifyNote({ text: body, url });
  return {
    ok: true,
    note: {
      section,
      title,
      body,
      url,
      urlKind: urlKindOf(url),
      price: field(fd, "price", NOTE_PRICE_MAX) || null,
      tags: normalizeTags(String(fd.get("tags") ?? "")),
    },
  };
}

/** Lo que se muestra como título: el título, o el comienzo del texto, o el dominio. */
export function noteHeading(n: Pick<NoteDTO, "title" | "body" | "url">): string {
  if (n.title) return n.title;
  const first = n.body.replace(/(?:https?:\/\/|www\.)\S+/gi, "").trim().split(/\r?\n/)[0]?.trim() ?? "";
  if (first) return first.length > 90 ? `${first.slice(0, 87)}…` : first;
  return n.url ? (titleFromUrl(n.url) ?? noteDomain(n.url)) : "Nota";
}

/**
 * Un nombre legible sacado de la dirección cuando el link no tiene título:
 * ".../products/canguro-cultura-regular?variant=1" → "Canguro cultura regular",
 * ".../thon_mixer_case_fuer_xone92.htm" → "Thon mixer case fuer xone92". Null si el
 * último tramo no dice nada (un número, un id largo, "index").
 */
export function titleFromUrl(url: string): string | null {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return null;
  }
  const segs = path.split("/").map((x) => decodeURIComponent(x).trim()).filter(Boolean);
  for (let i = segs.length - 1; i >= 0; i--) {
    const seg = segs[i].replace(/\.(html?|php|aspx?)$/i, "");
    if (/^(index|edit|view|p|product|products|producto|item|dp|tienda|catalogo|es|en|release|tickets?)$/i.test(seg)) continue;
    // Ids sueltos: números, hashes o tiras largas sin separadores.
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(seg) || /^[\d_-]+$/.test(seg) || (/^[a-z0-9]{16,}$/i.test(seg) && !/[-_]/.test(seg))) continue;
    const words = seg.replace(/[-_+]+/g, " ").replace(/\s+/g, " ").trim();
    if (words.length < 3 || !/[a-záéíóúñ]{3,}/i.test(words)) continue;
    const t = words.charAt(0).toUpperCase() + words.slice(1);
    return t.length > 90 ? `${t.slice(0, 87)}…` : t;
  }
  return null;
}

/** El texto sin el link que ya se muestra aparte (si el link es lo único, queda vacío). */
export function bodyWithoutUrl(body: string, url: string | null): string {
  if (!url) return body;
  const variants = [url, url.replace(/\/$/, "")];
  let out = body;
  for (const v of variants) out = out.split(v).join("");
  return out.replace(/^\s+|\s+$/g, "");
}

/** "Hoy", "Ayer", "hace 3 días", "12 sept", "3 mar 2025" a partir del día de la nota. */
export function relativeDay(day: string, today: string): string {
  const a = Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10));
  const b = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  const d = Math.round((b - a) / 86_400_000);
  if (d <= 0) return "Hoy";
  if (d === 1) return "Ayer";
  if (d < 7) return `hace ${d} días`;
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  return new Intl.DateTimeFormat("es-UY", { timeZone: "UTC", day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) })
    .format(new Date(a))
    .replace(".", "")
    .replace(" de ", " ");
}
