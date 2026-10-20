/**
 * Título y foto de la página de un link (para las notas). Sin `server-only` ni alias `@/`
 * y con imports `.ts`, así lo usan la app y `scripts/notas-miniaturas.ts`.
 */
import { youtubeId, youtubeThumb } from "./notes-logic.ts";

/** Sin tildes ni mayúsculas. */
function fold(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * La primera imagen usable de la lista: dirección absoluta y https (una http se pide por
 * https, si no el navegador la bloquea en una página segura). El logo de la tienda no
 * cuenta (no muestra el producto). Sin ninguna, null.
 */
export function pickImage(candidates: (string | null | undefined)[], base: string): string | null {
  for (const c of candidates) {
    if (!c?.trim()) continue;
    try {
      const abs = new URL(decodeEntities(c.trim()), base);
      if (abs.protocol === "http:") abs.protocol = "https:";
      if (/logo|favicon/i.test(abs.pathname)) continue;
      // Las de Instagram y Facebook son direcciones firmadas que vencen a las semanas.
      if (EXPIRING_HOSTS.test(abs.hostname)) continue;
      if (abs.protocol === "https:" && abs.href.length <= 1000) return abs.href;
    } catch {
      // Dirección rara: probar la siguiente.
    }
  }
  return null;
}

const EXPIRING_HOSTS = /(^|\.)(fbcdn\.net|cdninstagram\.com)$/i;

/**
 * Que la imagen se pueda mostrar desde la app: responde, es una imagen y el sitio no la
 * reserva para sí (`Cross-Origin-Resource-Policy: same-origin`, como la de claude.ai: el
 * navegador la bloquea y deja un error en la consola). Si el sitio no contesta HEAD, se acepta.
 */
export async function imageOk(url: string, timeoutMs = 2500): Promise<boolean> {
  try {
    const r = await fetch(url, { method: "HEAD", redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
    if (r.status === 405 || r.status === 501) return true;
    if (!r.ok) return false;
    if (/^same-(origin|site)$/i.test(r.headers.get("cross-origin-resource-policy")?.trim() ?? "")) return false;
    const type = r.headers.get("content-type") ?? "";
    return !type || /^image\//i.test(type) || /octet-stream/i.test(type);
  } catch {
    return true;
  }
}

/** "image" de los datos estructurados de un producto (JSON-LD), si la página los trae arriba. */
function jsonLdImage(html: string): string | null {
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    const found = m[1].match(/"image"\s*:\s*(?:\[\s*)?(?:\{[^}]*?"url"\s*:\s*)?"([^"]+)"/);
    if (found) return found[1].replace(/\\\//g, "/");
  }
  return null;
}

/**
 * Saca el nombre del sitio del final de un título: "Viandas congeladas - Mosca de Mori" en
 * moscademori.com.uy → "Viandas congeladas"; "Buzo Over - VCP - Tienda Online" en vcp.com.uy
 * → "Buzo Over". Solo corta si el tramo nombra al dominio (y queda algo antes).
 */
export function stripSiteSuffix(title: string, host: string): string {
  const parts = fold(host)
    .replace(/^www\./, "")
    .split(".")
    .filter((p) => p.length >= 3 && !["com", "net", "org", "shop", "store", "tienda"].includes(p));
  if (!parts.length) return title;
  const segs = title.split(/\s+[|\-–—·•:]\s+/);
  for (let i = 1; i < segs.length; i++) {
    const seg = fold(segs[i]).replace(/[^a-z0-9]/g, "");
    // El tramo tiene que ser casi todo el nombre del sitio ("T-SHIRT YOYAKU X TECHNICS" no lo es).
    const named = parts.some((p) => (seg.includes(p) && p.length >= seg.length * 0.4) || (p.includes(seg) && seg.length >= p.length * 0.4));
    if (seg.length >= 3 && named) {
      // Corta desde el primer tramo que nombra al sitio (lo que sigue también es del sitio).
      let cut = 0;
      for (let k = 0; k < i; k++) cut += segs[k].length;
      const head = title.slice(0, title.indexOf(segs[i], cut)).replace(/[\s|\-–—·•:]+$/, "");
      return head.length >= 3 ? head : title;
    }
  }
  return title;
}

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

/** Los nombres de HTML que aparecen en títulos de páginas ("dise&ntilde;o", "&ndash;"). */
const NAMED: Record<string, string> = {
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  middot: "·",
  bull: "•",
  hellip: "…",
  laquo: "«",
  raquo: "»",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  prime: "′",
  Prime: "″",
  copy: "©",
  reg: "®",
  trade: "™",
  deg: "°",
  euro: "€",
  iexcl: "¡",
  iquest: "¿",
  ordf: "ª",
  ordm: "º",
  times: "×",
};
const ACCENTS: Record<string, string> = { acute: "\u0301", grave: "\u0300", uml: "\u0308", tilde: "\u0303", circ: "\u0302", cedil: "\u0327" };

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z])(acute|grave|uml|tilde|circ|cedil);/gi, (_, l, a) => (l + ACCENTS[a]).normalize("NFC"))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED[name] ?? m)
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
export async function fetchLinkMeta(url: string, timeoutMs = TIMEOUT_MS): Promise<{ title: string | null; thumbnail: string | null }> {
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
      const r = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`, { signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
      const thumb = youtubeThumb(yt);
      if (!r.ok) return { title: null, thumbnail: thumb };
      const j = (await r.json()) as { title?: string };
      return { title: clean(j.title), thumbnail: thumb };
    }
    const started = Date.now();
    const get = () =>
      fetch(u, {
        signal: AbortSignal.timeout(Math.max(500, timeoutMs - (Date.now() - started))),
        redirect: "follow",
        cache: "no-store",
        headers: { "user-agent": "Mozilla/5.0 (compatible; SecondBrain/1.0)", accept: "text/html,application/xhtml+xml", "accept-language": "es-UY,es;q=0.9,en;q=0.6" },
      });
    let r = await get();
    // "Demasiados pedidos" (Thomann, por ejemplo): una pausa corta y otra vez, si queda tiempo.
    if (r.status === 429 && timeoutMs - (Date.now() - started) > 2000) {
      r.body?.cancel().catch(() => {});
      await new Promise((ok) => setTimeout(ok, Math.min(1500, timeoutMs / 3)));
      r = await get();
    }
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
    if (title) title = stripSiteSuffix(title, u.hostname);
    const thumbnail = pickImage(
      [
        meta("og:image:secure_url"),
        meta("og:image"),
        meta("og:image:url"),
        meta("twitter:image"),
        meta("twitter:image:src"),
        html.match(/<link[^>]+rel=["']image_src["'][^>]*href=["']([^"']+)["']/i)?.[1],
        jsonLdImage(html),
      ],
      r.url || u.href,
    );
    return { title, thumbnail: thumbnail && (await imageOk(thumbnail)) ? thumbnail : null };
  } catch {
    return yt ? { title: null, thumbnail: youtubeThumb(yt) } : none;
  }
}
