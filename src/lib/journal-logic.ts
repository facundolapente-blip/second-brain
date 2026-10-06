/**
 * Reglas puras del journal (sirven en servidor y cliente): ánimos, extractos,
 * conteo de palabras y racha de días escribiendo.
 */
import { addDays } from "./dates";

export type Mood = 1 | 2 | 3 | 4 | 5;

/** Ánimo del 1 al 5: etiqueta, nombre del ícono Phosphor y color de la paleta. */
export const MOODS: { value: Mood; label: string; icon: string; color: string }[] = [
  { value: 1, label: "Muy mal", icon: "SmileySad", color: "red" },
  { value: 2, label: "Mal", icon: "SmileyNervous", color: "orange" },
  { value: 3, label: "Normal", icon: "SmileyMeh", color: "yellow" },
  { value: 4, label: "Bien", icon: "Smiley", color: "green" },
  { value: 5, label: "Muy bien", icon: "SmileyWink", color: "teal" },
];

export function isMood(v: unknown): v is Mood {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5;
}

export function moodInfo(mood: number | null | undefined) {
  return MOODS.find((m) => m.value === mood) ?? null;
}

/** Cookie con el día en que se cerró la tarjeta de recuerdo. */
export const MEMORY_COOKIE = "jr_recuerdo";

export const BODY_MAX = 100_000;
export const TITLE_MAX = 160;
export const TAG_MAX = 32;
export const TAGS_MAX = 20;

/** Etiqueta normalizada: sin # adelante, minúsculas, espacios simples. */
export function normalizeTag(raw: string): string {
  return raw
    .replace(/^#+/, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .slice(0, TAG_MAX);
}

export function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const t of raw) {
    if (typeof t !== "string") continue;
    const n = normalizeTag(t);
    if (n && !out.includes(n)) out.push(n);
    if (out.length >= TAGS_MAX) break;
  }
  return out;
}

export function wordCount(text: string): number {
  const m = text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu);
  return m ? m.length : 0;
}

/** Primeras líneas del texto en una sola línea, cortado en una palabra. */
export function excerpt(body: string, max = 280): string {
  const flat = body.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return `${cut.slice(0, sp > max * 0.6 ? sp : max)}…`;
}

/** Una entrada cuenta como vacía si no tiene nada escrito ni elegido. */
/**
 * Sin título, texto ni etiquetas. El ánimo solo no cuenta: vive también en el
 * check-in del día (ánimo unificado), así que no se pierde al descartarla.
 */
export function isEmptyEntry(e: { title: string | null; body: string; tags: string[] }) {
  return !e.title?.trim() && !e.body.trim() && e.tags.length === 0;
}

/**
 * Racha actual: días seguidos con al menos una entrada, terminando hoy. Si hoy
 * todavía no escribiste, la racha de ayer sigue viva.
 */
export function currentStreak(days: Set<string>, today: string): number {
  let d = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export function bestStreak(sortedDays: string[]): number {
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sortedDays) {
    run = prev !== null && addDays(prev, 1) === d ? run + 1 : 1;
    if (run > best) best = run;
    prev = d;
  }
  return best;
}

/** "Buen día", "Buenas tardes" o "Buenas noches" según la hora en Montevideo. */
export function greeting(hour: number): string {
  if (hour >= 5 && hour < 12) return "Buen día";
  if (hour >= 12 && hour < 20) return "Buenas tardes";
  return "Buenas noches";
}
