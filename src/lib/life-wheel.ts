import { isISODate } from "./dates.ts";

/**
 * Rueda de la vida (2026-11-14, pedido de Facu: la hacía en Notion cada ~9 meses).
 * Lógica pura: áreas, puntajes (0 a 10, con un decimal: Notion tenía 8,8), promedios,
 * cambios contra otra rueda, puntos de la telaraña y cuándo toca la próxima.
 */

/**
 * Las 8 áreas de su Notion, en el orden de la telaraña (Salud arriba, en el sentido del reloj).
 * `color` es de la paleta de la app (`--p-{color}-chip`, con versión clara y oscura).
 */
export const WHEEL_AREAS = [
  { key: "Salud", short: "Salud", color: "green" },
  { key: "Finanzas", short: "Finanzas", color: "teal" },
  { key: "Amor", short: "Amor", color: "pink" },
  { key: "Entorno físico", short: "Entorno", color: "yellow" },
  { key: "Desarrollo profesional", short: "D. profesional", color: "blue" },
  { key: "Desarrollo personal", short: "D. personal", color: "purple" },
  { key: "Ocio", short: "Ocio", color: "orange" },
  { key: "Relaciones", short: "Relaciones", color: "red" },
] as const;

export type WheelScores = Record<string, number>;

/** Cada cuántos meses la hace (la app avisa en Inicio cuando se cumple). */
export const WHEEL_EVERY_MONTHS = 9;

/** 0 a 10, redondeado a un decimal; lo que no es número, fuera. */
export function normalizeScore(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 10) return null;
  return Math.round(n * 10) / 10;
}

export function parseScores(raw: unknown): WheelScores {
  const out: WheelScores = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = normalizeScore(v);
    if (n !== null && k.trim()) out[k.trim()] = n;
  }
  return out;
}

/** Promedio de las áreas con puntaje (null sin ninguna). */
export function wheelAverage(s: WheelScores): number | null {
  const vals = Object.values(s);
  return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
}

/** Cambio de un área contra otra rueda (null si a alguna le falta). */
export function scoreDelta(cur: WheelScores, prev: WheelScores | null | undefined, area: string): number | null {
  if (!prev || cur[area] === undefined || prev[area] === undefined) return null;
  return Math.round((cur[area] - prev[area]) * 10) / 10;
}

/** "8,5", "7", "−2,5", "+0,5": coma decimal y el signo menos de verdad. */
export function formatScore(n: number): string {
  return String(Math.round(n * 10) / 10).replace(".", ",");
}
export function formatDelta(n: number): string {
  if (n === 0) return "=";
  return `${n > 0 ? "+" : "−"}${formatScore(Math.abs(n))}`;
}

/** Puntos de la telaraña ("x,y x,y …") para un SVG con centro (cx, cy) y radio `r` = 10. */
export function radarPoints(s: WheelScores, cx: number, cy: number, r: number): string {
  const n = WHEEL_AREAS.length;
  return WHEEL_AREAS.map((a, i) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const d = ((s[a.key] ?? 0) / 10) * r;
    return `${round1(cx + Math.cos(ang) * d)},${round1(cy + Math.sin(ang) * d)}`;
  }).join(" ");
}

/** Dónde va la punta `i` a una distancia `d` del centro (para rótulos y anillos). */
export function radarAt(i: number, cx: number, cy: number, d: number): { x: number; y: number } {
  const ang = -Math.PI / 2 + (i * 2 * Math.PI) / WHEEL_AREAS.length;
  return { x: round1(cx + Math.cos(ang) * d), y: round1(cy + Math.sin(ang) * d) };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Rueda de pétalos: a qué distancia del centro llega un puntaje. Arranca en el borde del
 * círculo del medio (`r0`, ahí va el promedio) y llega a `r` con un 10; así un 1 también se ve.
 */
export function petalRadius(score: number, r0: number, r: number): number {
  return round1(r0 + (Math.min(10, Math.max(0, score)) / 10) * (r - r0));
}

/** Ángulos de la porción `i` (centrada en su área: Salud arriba) y el punto a distancia `d` con ángulo `a`. */
const sliceAngles = (i: number, n: number) => {
  const start = -Math.PI / 2 + ((i - 0.5) * 2 * Math.PI) / n;
  return [start, start + (2 * Math.PI) / n] as const;
};
const at = (cx: number, cy: number, d: number, a: number) => `${round1(cx + Math.cos(a) * d)},${round1(cy + Math.sin(a) * d)}`;
/** Cuánto se achica el ángulo para dejar una separación `gap` del mismo ancho de punta a punta. */
const padAt = (gap: number, d: number) => (d > 0 ? Math.asin(Math.min(1, gap / 2 / d)) : 0);

/**
 * Camino SVG de la porción `i` de la rueda, entre las distancias `r0` y `r` del centro,
 * con una separación de `gap` (en unidades del SVG) contra las vecinas. "" si no tiene alto
 * o la separación se la come entera.
 */
export function wheelSlicePath(i: number, cx: number, cy: number, r0: number, r: number, gap = 0, n: number = WHEEL_AREAS.length): string {
  if (r - r0 < 0.05) return "";
  const [a0, a1] = sliceAngles(i, n);
  const po = padAt(gap, r);
  const pi = padAt(gap, r0);
  if (a1 - a0 - 2 * po <= 0) return "";
  const large = a1 - a0 - 2 * po > Math.PI ? 1 : 0;
  const outer = `M${at(cx, cy, r, a0 + po)} A${round1(r)},${round1(r)} 0 ${large} 1 ${at(cx, cy, r, a1 - po)}`;
  if (r0 <= 0 || a1 - a0 - 2 * pi <= 0) return `${outer} L${at(cx, cy, Math.max(0, r0), (a0 + a1) / 2)} Z`;
  return `${outer} L${at(cx, cy, r0, a1 - pi)} A${round1(r0)},${round1(r0)} 0 ${large} 0 ${at(cx, cy, r0, a0 + pi)} Z`;
}

/** Arco (sin cerrar) de la porción `i` a la distancia `r`: el puntaje de la rueda con la que se compara. */
export function wheelArcPath(i: number, cx: number, cy: number, r: number, gap = 0, n: number = WHEEL_AREAS.length): string {
  const [a0, a1] = sliceAngles(i, n);
  const p = padAt(gap, r);
  if (r <= 0 || a1 - a0 - 2 * p <= 0) return "";
  return `M${at(cx, cy, r, a0 + p)} A${round1(r)},${round1(r)} 0 ${a1 - a0 - 2 * p > Math.PI ? 1 : 0} 1 ${at(cx, cy, r, a1 - p)}`;
}

/** El mismo día, `n` meses después (un 31 cae en el último día del mes que no lo tiene). */
export function addMonthsIso(iso: string, n: number): string {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7)) - 1 + n;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  const last = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
  const d = Math.min(Number(iso.slice(8, 10)), last);
  return `${yy}-${String(mm + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Cuándo toca la próxima rueda (9 meses después de la última). */
export const nextWheelDate = (last: string) => addMonthsIso(last, WHEEL_EVERY_MONTHS);

/** "DD/MM/AAAA" de Notion → "AAAA-MM-DD" (null si no es fecha). */
export function notionDate(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return isISODate(iso) ? iso : null;
}

/** Los nombres de las filas del Notion de Facu ("4 EF", "5 D Profesional") → área de la app. */
export function notionArea(name: string): string | null {
  const clean = name.replace(/^\s*\d+\s*/, "").trim().toLowerCase();
  const map: Record<string, string> = {
    salud: "Salud",
    finanzas: "Finanzas",
    amor: "Amor",
    ef: "Entorno físico",
    "entorno fisico": "Entorno físico",
    "entorno físico": "Entorno físico",
    "d profesional": "Desarrollo profesional",
    "desarrollo profesional": "Desarrollo profesional",
    "d personal": "Desarrollo personal",
    "desarrollo personal": "Desarrollo personal",
    ocio: "Ocio",
    relaciones: "Relaciones",
  };
  return map[clean] ?? null;
}

const foldArea = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export type WheelNotePart = { area: string | null; blocks: { title: string | null; text: string }[] };

/**
 * Lo escrito en una rueda, separado por área. En su Notion cada área empieza con
 * "1. Salud." y adentro a veces hay rótulos cortos ("Trabajo", "Facultad", "Familia"):
 * esos quedan como subtítulo. Lo que va antes de la primera área queda con `area: null`.
 * Si no reconoce ninguna área, devuelve todo junto.
 */
export function splitWheelNote(note: string | null | undefined): WheelNotePart[] {
  if (!note?.trim()) return [];
  const known = new Map(WHEEL_AREAS.map((a) => [foldArea(a.key), a.key] as const));
  const parts: WheelNotePart[] = [{ area: null, blocks: [] }];
  let title: string | null = null;
  let buf: string[] = [];
  const flush = () => {
    const text = buf.join("\n").trim();
    if (text || title) parts[parts.length - 1].blocks.push({ title, text });
    title = null;
    buf = [];
  };
  for (const raw of note.split(/\r?\n/)) {
    const line = raw.trim();
    const head = line.match(/^\d+\s*[.)]\s*(.+?)\.?$/);
    const area = head ? known.get(foldArea(head[1])) : undefined;
    if (area) {
      flush();
      parts.push({ area, blocks: [] });
    } else if (parts.length > 1 && isSubtitle(line)) {
      flush();
      title = line;
    } else buf.push(line);
  }
  flush();
  return parts.filter((p) => p.blocks.length > 0);
}

/** "Trabajo", "Dj/Productor", "Familia": rótulo corto, sin punto final. */
const isSubtitle = (line: string) => line.length > 0 && line.length <= 32 && line.split(/\s+/).length <= 4 && /^[A-ZÁÉÍÓÚÑ]/.test(line) && !/[.,;:!?]$/.test(line);

export type WheelNoteByArea = { intro: string; byArea: Record<string, string> };

/** Lo escrito como un texto por área (con sus rótulos, "Trabajo" …) y lo general aparte. */
export function noteByArea(note: string | null | undefined): WheelNoteByArea {
  const out: WheelNoteByArea = { intro: "", byArea: {} };
  for (const p of splitWheelNote(note)) {
    const text = p.blocks.map((b) => [b.title, b.text].filter(Boolean).join("\n")).join("\n\n");
    if (p.area) out.byArea[p.area] = out.byArea[p.area] ? `${out.byArea[p.area]}\n\n${text}` : text;
    else out.intro = out.intro ? `${out.intro}\n\n${text}` : text;
  }
  return out;
}

/** Lo vuelve a juntar como en su Notion: lo general arriba y "1. Salud." … con su texto. */
export function joinWheelNote({ intro, byArea }: WheelNoteByArea): string {
  const parts: string[] = [];
  if (intro.trim()) parts.push(intro.trim());
  WHEEL_AREAS.forEach((a, i) => {
    const t = byArea[a.key]?.trim();
    if (t) parts.push(`${i + 1}. ${a.key}.\n${t}`);
  });
  return parts.join("\n\n");
}
