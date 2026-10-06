/*
 * Service worker de Second Brain.
 * - Archivos de la app (/_next/static, íconos): primero la copia guardada (no cambian).
 * - Páginas y datos de la app: primero la red; si no hay señal, la última copia.
 * Nunca guarda nada de /api ni de /login.
 */
const VERSION = "sb-v1";
const STATIC = `static-${VERSION}`;
const PAGES = `pages-${VERSION}`;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (!k.endsWith(VERSION)) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

const OFFLINE_HTML = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sin conexión</title>
<style>body{font-family:system-ui,sans-serif;background:#f4f5f2;color:#1b1e1a;display:grid;place-items:center;min-height:100dvh;margin:0;padding:24px;text-align:center}h1{font-size:24px;margin:0 0 8px}p{color:#5d625a;max-width:32ch;line-height:1.5}button{margin-top:16px;height:44px;padding:0 20px;border-radius:999px;border:0;background:#1d4d57;color:#fff;font-size:15px}</style></head>
<body><div><h1>Sin conexión</h1><p>Esta pantalla todavía no la abriste con señal. Las que ya visitaste se pueden ver sin conexión.</p><button onclick="location.reload()">Reintentar</button></div></body></html>`;

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
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
        if (res.ok && !res.redirected) cache.put(req, res.clone());
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
