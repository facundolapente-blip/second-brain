/*
 * Service worker de Second Brain.
 * - Archivos de la app (/_next/static, íconos): primero la copia guardada (no cambian).
 * - Páginas y datos de la app: primero la red; si no hay señal, la última copia.
 * Nunca guarda nada de /api ni de /login.
 */
const VERSION = "sb-v2";
/** Cuántas pantallas guardadas como máximo (las más viejas se van). */
const MAX_PAGES = 80;
const STATIC = `static-${VERSION}`;
/** Fotos que llegan por "Compartir" hasta que /compartir las sube (sin versión: la lee la página). */
const SHARE = "compartido";
const PAGES = `pages-${VERSION}`;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (!k.endsWith(VERSION) && k !== SHARE) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

const OFFLINE_HTML = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sin conexión</title>
<style>body{font-family:system-ui,sans-serif;background:#f4f5f2;color:#1b1e1a;display:grid;place-items:center;min-height:100dvh;margin:0;padding:24px;text-align:center}h1{font-size:24px;margin:0 0 8px}p{color:#5d625a;max-width:32ch;line-height:1.5}button{margin-top:16px;height:44px;padding:0 20px;border-radius:999px;border:0;background:#1d4d57;color:#fff;font-size:15px}</style></head>
<body><div><h1>Sin conexión</h1><p>Esta pantalla todavía no la abriste con señal. Las que ya visitaste se pueden ver sin conexión.</p><button onclick="location.reload()">Reintentar</button></div></body></html>`;

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // "Compartir" desde otra app (share_target del manifiesto).
  if (req.method === "POST" && url.pathname === "/compartir") {
    event.respondWith(receiveShare(req));
    return;
  }
  if (req.method !== "GET") return;
  if (url.pathname.startsWith("/api") || url.pathname.startsWith("/login")) return;

  if (url.pathname.startsWith("/_next/static/") || /^\/(icon|apple-icon)/.test(url.pathname)) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  const isPage = req.mode === "navigate";
  const isData = req.headers.get("RSC") === "1" || url.searchParams.has("_rsc");
  if (!isPage && !isData) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(PAGES);
      try {
        const res = await fetch(req);
        // Solo se guardan respuestas buenas que no terminaron en el login.
        if (res.ok && !res.redirected) {
          event.waitUntil(cache.put(req, res.clone()).then(() => trim(cache)));
        }
        return res;
      } catch {
        const hit = await cache.match(req, { ignoreSearch: isData ? false : true });
        if (hit) return hit;
        if (isPage) {
          const home = await cache.match("/");
          if (home) return home;
          return new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } });
        }
        return Response.error();
      }
    })(),
  );
});

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_PAGES; i++) await cache.delete(keys[i]);
}

/** Guarda las fotos compartidas y abre /compartir con el texto en la URL. */
async function receiveShare(req) {
  const fd = await req.formData();
  const params = new URLSearchParams();
  for (const k of ["title", "text", "url"]) {
    const v = fd.get(k);
    if (typeof v === "string" && v.trim()) params.set(k, v.slice(0, 5000));
  }
  const files = fd
    .getAll("fotos")
    .filter((f) => f && typeof f === "object" && f.size > 0)
    .slice(0, 10);
  if (files.length) {
    const id = String(Date.now());
    const cache = await caches.open(SHARE);
    await Promise.all(
      files.map((f, i) => cache.put(`/compartido/${id}/${i}`, new Response(f, { headers: { "Content-Type": f.type || "image/jpeg" } }))),
    );
    params.set("fotos", `${id}:${files.length}`);
  }
  return Response.redirect(new URL(`/compartir?${params}`, self.location.origin).href, 303);
}
