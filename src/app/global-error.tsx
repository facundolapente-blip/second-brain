"use client";

import { useEffect, useSyncExternalStore } from "react";
import { THEME_COOKIE, themeFromCookie } from "@/lib/theme";

/**
 * Último recurso: falló el layout raíz. Reemplaza todo el documento, así que no
 * tiene globals.css ni las fuentes: estilos propios y el tema leído de la cookie.
 */
const noop = () => () => {};
function cookieTheme() {
  const m = document.cookie.match(new RegExp(`(?:^|; )${THEME_COOKIE}=([^;]*)`));
  return themeFromCookie(m?.[1]);
}

const CSS = `
:root{--bg:#eef2ec;--text:#1b1e1a;--muted:#5d625a;--ink:#1d4d57;--on-ink:#fff;--line:#d0d3cc;color-scheme:light}
:root[data-theme="oscuro"]{--bg:#141413;--text:#ecebe6;--muted:#a9a8a1;--ink:#e9e8e2;--on-ink:#141413;--line:#3a3a37;color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:24px 16px;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:34rem;display:grid;gap:12px;justify-items:start}
.k{font:500 11px/1 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin:0}
h1{font-size:30px;line-height:1.1;margin:0;font-weight:600;letter-spacing:-.01em}
p{margin:0;font-size:15px;line-height:1.55;color:var(--muted);max-width:52ch}
.c{font:12px ui-monospace,monospace}
.b{display:flex;flex-wrap:wrap;gap:8px;padding-top:4px}
button{display:inline-flex;align-items:center;height:44px;padding:0 20px;border-radius:999px;font:500 14px system-ui,sans-serif;cursor:pointer;text-decoration:none}
button{border:0;background:var(--ink);color:var(--on-ink)}
button.o{border:1px solid var(--line);color:var(--text);background:transparent}
button:focus-visible{outline:2px solid var(--text);outline-offset:2px}
`;

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const theme = useSyncExternalStore(noop, cookieTheme, () => "claro" as const);
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="es" data-theme={theme}>
      <body>
        <title>Algo falló · Second Brain</title>
        <style>{CSS}</style>
        <main role="alert">
          <p className="k">Second Brain</p>
          <h1>No se pudo abrir la app</h1>
          <p>Puede ser la conexión o la base de datos. Lo que ya guardaste no se pierde. Probá de nuevo en un momento.</p>
          {error.digest && <p className="c">Código: {error.digest}</p>}
          <div className="b">
            <button type="button" onClick={() => retry()}>
              Reintentar
            </button>
            {/* Carga la app de cero (no navegación del cliente). */}
            <button type="button" className="o" onClick={() => window.location.assign(window.location.origin)}>
              Ir al inicio
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
