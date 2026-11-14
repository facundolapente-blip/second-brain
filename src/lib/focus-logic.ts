/**
 * Reglas puras del temporizador de enfoque (pomodoro): tiempos, textos y totales.
 * Sin React ni base: las usan la pantalla, la píldora del Shell, el servidor y las pruebas.
 */
import { addDays, dayOfInstant, TZ } from "./dates";

export type FocusMode = "focus" | "short" | "long";

export const FOCUS_MODES: { value: FocusMode; label: string }[] = [
  { value: "focus", label: "Enfoque" },
  { value: "short", label: "Descanso corto" },
  { value: "long", label: "Descanso largo" },
];

export const MODE_LABEL: Record<FocusMode, string> = { focus: "Enfoque", short: "Descanso corto", long: "Descanso largo" };

/** Minutos de cada parte y cada cuántas sesiones va el descanso largo (`AppSetting "enfoque"`). */
export type FocusSettings = { focus: number; short: number; long: number; every: number };

export const FOCUS_SETTINGS_KEY = "enfoque";
export const DEFAULT_FOCUS_SETTINGS: FocusSettings = { focus: 25, short: 5, long: 15, every: 4 };

/** Topes de cada campo (minutos; `every` en sesiones). */
export const FOCUS_LIMITS: Record<keyof FocusSettings, [number, number]> = {
  focus: [1, 180],
  short: [1, 60],
  long: [1, 90],
  every: [2, 12],
};

const clampInt = (v: unknown, [min, max]: [number, number], fallback: number) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
};

/** Normaliza lo guardado o lo que llega de un formulario (lo que falta o no sirve, el valor de fábrica). */
export function normalizeFocusSettings(raw: unknown): FocusSettings {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    focus: clampInt(o.focus, FOCUS_LIMITS.focus, DEFAULT_FOCUS_SETTINGS.focus),
    short: clampInt(o.short, FOCUS_LIMITS.short, DEFAULT_FOCUS_SETTINGS.short),
    long: clampInt(o.long, FOCUS_LIMITS.long, DEFAULT_FOCUS_SETTINGS.long),
    every: clampInt(o.every, FOCUS_LIMITS.every, DEFAULT_FOCUS_SETTINGS.every),
  };
}

export function parseFocusSettings(value: string | null | undefined): FocusSettings {
  if (!value) return { ...DEFAULT_FOCUS_SETTINGS };
  try {
    return normalizeFocusSettings(JSON.parse(value));
  } catch {
    return { ...DEFAULT_FOCUS_SETTINGS };
  }
}

/** Lo que dura cada parte, en milisegundos. */
export function modeMs(mode: FocusMode, s: FocusSettings): number {
  return (mode === "focus" ? s.focus : mode === "short" ? s.short : s.long) * 60_000;
}

/**
 * Después de terminar la sesión número `done` del día (contando esta), ¿descanso corto o largo?
 * Cada `every` sesiones toca el largo.
 */
export function breakAfter(done: number, every: number): FocusMode {
  return done > 0 && done % Math.max(1, every) === 0 ? "long" : "short";
}

/** "sesión 2 de 4": en qué vuelta del ciclo va la próxima sesión, contando las ya hechas. */
export function cyclePosition(done: number, every: number): number {
  return (Math.max(0, done) % Math.max(1, every)) + 1;
}

/** "25:00", "04:09"; con una hora o más, "1:05:00". Redondea hacia arriba (como un reloj que cuenta para atrás). */
export function clockText(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** "45 min", "1 h", "1 h 15 min", "0 min". */
export function minutesText(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

/** Corto para encima de las barras: "45m", "1h", "1h 15m". */
export function minutesShort(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

/** "1 sesión", "3 sesiones". */
export const sessionsText = (n: number) => `${n} ${n === 1 ? "sesión" : "sesiones"}`;

/** Minutos enfocados de lo que corrió (sin las pausas): al minuto más cercano. */
export function focusedMinutes(ms: number): number {
  return Math.max(0, Math.round(ms / 60_000));
}

/** Para "Terminar" antes de tiempo: se anota solo con al menos un minuto. */
export const MIN_SAVE_MS = 60_000;

const hourFmt = new Intl.DateTimeFormat("es-UY", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** "15:20" en Montevideo. */
export function hourText(d: Date | string | number): string {
  return hourFmt.format(new Date(d));
}

/** "15:20 a 15:45". */
export function rangeText(start: Date | string | number, end: Date | string | number): string {
  return `${hourText(start)} a ${hourText(end)}`;
}

/** El día (Montevideo) en que empezó una sesión. */
export function sessionDay(startedAt: Date | string | number): string {
  return dayOfInstant(new Date(startedAt));
}

export type SessionLike = { day: string; minutes: number };

/** Minutos y cantidad de sesiones. */
export function totalsOf(sessions: SessionLike[]): { minutes: number; count: number } {
  return { minutes: sessions.reduce((a, s) => a + s.minutes, 0), count: sessions.length };
}

/** Minutos de cada día de la semana que empieza en `monday` (lunes a domingo). */
export function weekMinutes(sessions: SessionLike[], monday: string): number[] {
  const out = [0, 0, 0, 0, 0, 0, 0];
  for (const s of sessions) {
    for (let i = 0; i < 7; i++) if (s.day === addDays(monday, i)) out[i] += s.minutes;
  }
  return out;
}

/** Las sesiones agrupadas por día, el más reciente primero (dentro del día, la más nueva arriba). */
export function groupByDay<T extends SessionLike & { startedAt: string }>(sessions: T[]): { day: string; minutes: number; sessions: T[] }[] {
  const map = new Map<string, T[]>();
  for (const s of sessions) {
    const list = map.get(s.day);
    if (list) list.push(s);
    else map.set(s.day, [s]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([day, list]) => {
      const sorted = [...list].sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0));
      return { day, minutes: sorted.reduce((a, s) => a + s.minutes, 0), sessions: sorted };
    });
}

/** Limpia la nota de "¿Qué hiciste?" (vacía = null). */
export function cleanNote(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim().slice(0, 2000) : "";
  return s ? s : null;
}
