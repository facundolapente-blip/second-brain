// Chequeo visual antes de subir: recorre todas las pantallas en celular y compu,
// en tema claro y oscuro, y falla si encuentra
//   - desborde horizontal (la página más ancha que la pantalla),
//   - errores de consola o de la página,
//   - texto con poco contraste (WCAG: 4,5:1; 3:1 en texto grande).
// Usa el servidor que ya está corriendo (npm run dev en :3000, o CHEQUEO_URL).
// Si no hay servidor, avisa y no frena (salvo con CHEQUEO_ESTRICTO=1).
//
//   node scripts/chequeo-visual.mjs            todas las pantallas
//   node scripts/chequeo-visual.mjs /plan /    solo esas
//
// Lo corre el hook pre-push (.githooks/pre-push; activarlo con
// `git config core.hooksPath .githooks`). Saltearlo una vez: git push --no-verify.

import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { chromium } from "playwright-core";

const BASE = (process.env.CHEQUEO_URL || "http://localhost:3000").replace(/\/$/, "");
const VIEWPORTS = [
  { name: "360", width: 360, height: 800 },
  { name: "390", width: 390, height: 844 },
  { name: "1024", width: 1024, height: 768 },
  { name: "1440", width: 1440, height: 900 },
];
const THEMES = ["claro", "oscuro"];
const WORKERS = 3;

/** Rutas sin parámetros sacadas de src/app/**\/page.tsx (sin grupos ni api). */
function staticRoutes() {
  const root = join(process.cwd(), "src", "app");
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name === "api" || name.startsWith("_")) continue;
        walk(p);
      } else if (name === "page.tsx") {
        const segs = relative(root, dir).split(sep).filter(Boolean).filter((s) => !/^\(.*\)$/.test(s));
        if (segs.some((s) => s.startsWith("["))) continue;
        out.push("/" + segs.join("/"));
      }
    }
  };
  walk(root);
  return [...new Set(out)].filter((r) => r !== "/login" && r !== "/journal/escribir").sort();
}

async function serverUp() {
  try {
    const r = await fetch(BASE + "/login", { redirect: "manual", signal: AbortSignal.timeout(60000) });
    return r.status < 500;
  } catch {
    return false;
  }
}

/** Se corre dentro de la página: desbordes y contraste del tema que esté puesto. */
function inspect() {
  const W = innerWidth;
  const overflow = [];
  if (document.documentElement.scrollWidth > W + 1) {
    const scrollers = "[class*='overflow-x-auto'],[class*='overflow-auto'],[class*='overflow-x-scroll'],[class*='overflow-hidden'],[class*='overflow-clip']";
    for (const e of document.querySelectorAll("body *")) {
      const b = e.getBoundingClientRect();
      if (b.width && b.right > W + 1 && !e.parentElement?.closest(scrollers) && getComputedStyle(e).visibility !== "hidden") {
        overflow.push(`${e.tagName.toLowerCase()}.${String(e.className).trim().split(/\s+/).slice(0, 4).join(".")} (llega a ${Math.round(b.right)}px)`);
        if (overflow.length >= 3) break;
      }
    }
    overflow.unshift(`la página mide ${document.documentElement.scrollWidth}px de ancho`);
  }

  // Colores CSS (oklch, color-mix…) a sRGB con un canvas de 1 px.
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  const rgba = (c) => {
    cx.clearRect(0, 0, 1, 1);
    cx.fillStyle = "#000";
    cx.fillStyle = c;
    cx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = cx.getImageData(0, 0, 1, 1).data;
    return [r, g, b, a / 255];
  };
  const over = (top, bottom) => [0, 1, 2].map((i) => top[i] * top[3] + bottom[i] * (1 - top[3])).concat(1);
  const lum = ([r, g, b]) => {
    const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  /**
   * Fondo real detrás del texto: lo que se pinta debajo en el centro del elemento
   * (también hermanos posicionados, como la marca de un selector, y fondos de ::before/::after),
   * capas semitransparentes incluidas; null si hay imagen o degradé.
   */
  const backdrop = (el) => {
    const b = el.getBoundingClientRect();
    const x = Math.min(Math.max(b.left + b.width / 2, 0), innerWidth - 1);
    const y = Math.min(Math.max(b.top + b.height / 2, 0), innerHeight - 1);
    const inView = b.top + b.height / 2 >= 0 && b.top + b.height / 2 < innerHeight;
    const stack = inView ? document.elementsFromPoint(x, y) : [];
    const from = stack.indexOf(el);
    const chain = from >= 0 ? stack.slice(from) : [];
    // Fuera de la pantalla: los antepasados que de verdad quedan detrás del texto
    // (una etiqueta absoluta encima de una barra no toma el color de la barra).
    if (!chain.length) {
      const cy = b.top + b.height / 2;
      for (let n = el; n; n = n.parentElement) {
        const r = n.getBoundingClientRect();
        if (n === el || (x >= r.left && x <= r.right && cy >= r.top && cy <= r.bottom)) chain.push(n);
      }
    }
    const layers = [];
    for (const n of chain) {
      for (const pseudo of ["::after", "::before", null]) {
        const s = getComputedStyle(n, pseudo);
        if (pseudo && (s.content === "none" || s.content === "normal")) continue;
        if (s.backgroundImage !== "none") return null;
        const c = rgba(s.backgroundColor);
        const o = Number(s.opacity);
        if (c[3] > 0 && o > 0) layers.push([c[0], c[1], c[2], c[3] * o]);
      }
      if (layers.length && layers[layers.length - 1][3] >= 1) break;
    }
    let bg = rgba(getComputedStyle(document.body).backgroundColor);
    if (bg[3] < 1) bg = [255, 255, 255, 1];
    for (let i = layers.length - 1; i >= 0; i--) bg = over(layers[i], bg);
    return bg;
  };
  const opacityOf = (el) => {
    let o = 1;
    for (let n = el; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
    return o;
  };

  const contrast = [];
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const text = t.textContent.trim();
    const el = t.parentElement;
    if (!text || !el || seen.has(el)) continue;
    seen.add(el);
    if (el.closest("[aria-hidden='true'],[hidden],[inert],.sr-only,script,style,noscript,option,:disabled,[aria-disabled='true']")) continue;
    const s = getComputedStyle(el);
    const b = el.getBoundingClientRect();
    if (!b.width || !b.height || s.visibility === "hidden" || opacityOf(el) < 0.99) continue;
    if (b.bottom < 0 || b.top > innerHeight * 4) continue;
    const bg = backdrop(el);
    if (!bg) continue;
    const fg = over(rgba(s.color), bg);
    const [l1, l2] = [lum(fg), lum(bg)].sort((x, y) => y - x);
    const ratio = (l1 + 0.05) / (l2 + 0.05);
    const size = parseFloat(s.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700);
    const need = large ? 3 : 4.5;
    if (ratio < need - 0.05) {
      contrast.push(`"${text.slice(0, 40)}" ${ratio.toFixed(2)}:1 (pide ${need}) en ${el.tagName.toLowerCase()}.${String(el.className).trim().split(/\s+/).slice(0, 3).join(".")}`);
    }
  }
  return { overflow, contrast };
}

async function main() {
  if (!(await serverUp())) {
    const msg = `chequeo visual: no hay servidor en ${BASE} (npm run dev); no se revisó nada.`;
    if (process.env.CHEQUEO_ESTRICTO === "1") {
      console.error(msg);
      process.exit(1);
    }
    console.warn(msg);
    return;
  }

  const browser = await chromium.launch({ channel: process.env.CHEQUEO_NAVEGADOR || "chrome" }).catch(() => chromium.launch({ channel: "msedge" }));
  const context = await browser.newContext();
  await context.addCookies([{ name: "sb_tema", value: "claro", url: BASE }]);

  let routes = process.argv.slice(2);
  if (!routes.length) {
    routes = staticRoutes();
    // Una página de cada ruta con id (detalle de un hábito, una entrada del journal).
    const p = await context.newPage();
    for (const [list, re] of [
      ["/habitos/lista", /^\/habitos\/c[a-z0-9]{10,}$/],
      ["/journal", /^\/journal\/c[a-z0-9]{10,}$/],
    ]) {
      await p.goto(BASE + list, { waitUntil: "networkidle" }).catch(() => {});
      const hrefs = await p.locator("a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href"))).catch(() => []);
      const h = hrefs.find((x) => re.test(x || ""));
      if (h) routes.push(h);
    }
    await p.close();
  }

  const jobs = routes.flatMap((r) => VIEWPORTS.map((v) => ({ route: r, vp: v })));
  const problems = [];
  let done = 0;
  const worker = async () => {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message.split("\n")[0]));
    page.on("console", (m) => {
      if (m.type() === "error" && !/Download the React DevTools|\[HMR\]|Fast Refresh/.test(m.text())) errors.push(m.text().split("\n")[0].slice(0, 200));
    });
    for (let job = jobs.shift(); job; job = jobs.shift()) {
      const { route, vp } = job;
      errors.length = 0;
      await page.setViewportSize({ width: vp.width, height: vp.height });
      try {
        const res = await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 90000 });
        if (res && res.status() >= 500) errors.push(`respondió ${res.status()}`);
        await page.waitForTimeout(400);
        // Sin transiciones: al cambiar de tema los colores tienen que quedar en su valor final.
        await page.addStyleTag({ content: "*,*::before,*::after{transition:none!important;animation:none!important;pointer-events:auto!important}" });
        for (const theme of THEMES) {
          await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
          await page.waitForTimeout(80);
          const r = await page.evaluate(inspect);
          const where = `${route} · ${vp.name}px · ${theme}`;
          if (theme === THEMES[0]) for (const o of r.overflow) problems.push(`DESBORDE   ${where}: ${o}`);
          for (const c of r.contrast) problems.push(`CONTRASTE  ${where}: ${c}`);
        }
      } catch (e) {
        errors.push("no cargó: " + String(e.message).split("\n")[0]);
      }
      for (const e of new Set(errors)) problems.push(`CONSOLA    ${route} · ${vp.name}px: ${e}`);
      done++;
      process.stdout.write(`\rchequeo visual: ${done} pantallas revisadas…`);
    }
    await page.close();
  };
  await Promise.all(Array.from({ length: WORKERS }, worker));
  await browser.close();
  process.stdout.write("\n");

  const unique = [...new Set(problems)];
  if (!unique.length) {
    console.log(`chequeo visual: todo bien (${routes.length} rutas × ${VIEWPORTS.length} tamaños × ${THEMES.length} temas).`);
    return;
  }
  console.error(`chequeo visual: ${unique.length} problemas\n`);
  for (const p of unique.sort()) console.error("  " + p);
  console.error("\nArreglalos o subí igual con: git push --no-verify");
  process.exit(1);
}

main().catch((e) => {
  console.error("chequeo visual falló:", e);
  process.exit(1);
});
