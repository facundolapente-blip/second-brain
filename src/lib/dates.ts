/**
 * Fechas como "días" (YYYY-MM-DD), no como instantes.
 *
 * El servidor de Vercel corre en UTC: "hoy" se calcula en la zona de Facu. En la
 * base los días van en columnas `@db.Date`, que Prisma lee como medianoche UTC,
 * así que todo el cálculo de días se hace en UTC y nunca con la hora local.
 */
export const TZ = "America/Montevideo";

const isoFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function todayISO(): string {
  return isoFmt.format(new Date());
}

/** El día (en Montevideo) de un instante guardado con hora. */
export function dayOfInstant(d: Date): string {
  return isoFmt.format(d);
}

/**
 * Día real YYYY-MM-DD. Hace ida y vuelta: `Date.parse("2026-02-30")` es válido en V8
 * (lo corre al 2 de marzo), y con eso `/plan?desde=2026-02-30` rompía la pantalla.
 */
export function isISODate(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00.000Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function toDbDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export function fromDbDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  const d = toDbDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return fromDbDate(d);
}

/** 0 = domingo ... 6 = sábado */
export function weekday(iso: string): number {
  return toDbDate(iso).getUTCDay();
}

/** Primer día de la semana del día dado; `weekStart` 1 = lunes (por defecto), 0 = domingo. */
export function startOfWeek(iso: string, weekStart = 1): string {
  return addDays(iso, -((weekday(iso) - weekStart + 7) % 7));
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function monthBounds(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export function diffDays(a: string, b: string): number {
  return Math.round((toDbDate(a).getTime() - toDbDate(b).getTime()) / 86_400_000);
}

function fmt(iso: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("es-UY", { timeZone: "UTC", ...opts }).format(toDbDate(iso));
}

/** "jueves 2 de octubre"; de otro año, "jueves 9 de octubre de 2025". */
export function formatLong(iso: string, today = todayISO()): string {
  return fmt(iso, { weekday: "long", day: "numeric", month: "long", ...(iso.slice(0, 4) !== today.slice(0, 4) ? { year: "numeric" } : {}) });
}

/** "2 oct" */
export function formatShort(iso: string): string {
  return fmt(iso, { day: "numeric", month: "short" }).replace(".", "");
}

/** "octubre 2026" */
export function formatMonth(month: string): string {
  return fmt(`${month}-01`, { month: "long", year: "numeric" }).replace(" de ", " ");
}

/** "L", "M", "X"... */
export function weekdayInitial(iso: string): string {
  return ["D", "L", "M", "X", "J", "V", "S"][weekday(iso)];
}

/** "Hoy", "Ayer" o la fecha larga. */
export function formatRelative(iso: string, today = todayISO()): string {
  const d = diffDays(today, iso);
  if (d === 0) return "Hoy";
  if (d === 1) return "Ayer";
  return formatLong(iso, today);
}
