import { isISODate } from "./dates.ts";

/**
 * Rueda de la vida (2026-11-14, pedido de Facu: la hacía en Notion cada ~9 meses).
 * Lógica pura: áreas, puntajes (0 a 10, con un decimal: Notion tenía 8,8), promedios,
 * cambios contra otra rueda, puntos de la telaraña y cuándo toca la próxima.
 */

/** Las 8 áreas de su Notion, en el orden de la telaraña (Salud arriba, en el sentido del reloj). */
export const WHEEL_AREAS = [
  { key: "Salud", short: "Salud" },
  { key: "Finanzas", short: "Finanzas" },
  { key: "Amor", short: "Amor" },
  { key: "Entorno físico", short: "Entorno" },
  { key: "Desarrollo profesional", short: "D. profesional" },
  { key: "Desarrollo personal", short: "D. personal" },
  { key: "Ocio", short: "Ocio" },
  { key: "Relaciones", short: "Relaciones" },
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
