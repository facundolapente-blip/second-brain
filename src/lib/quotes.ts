/**
 * Cuándo cambia la nota de Inicio: cada 6 horas (00, 06, 12, 18 en Montevideo). Las notas
 * salen de Herramientas → Valores (`lib/values.ts`); antes eran frases de estoicos, que Facu
 * reemplazó por las suyas (2026-10-18).
 */
const TZ = "America/Montevideo";

/** Día (YYYY-MM-DD) y hora en Montevideo de un instante. */
export function montevideoNow(at: Date = new Date()): { day: string; hour: number } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  );
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}

/** Tramo de 6 horas (00, 06, 12, 18) contado desde 1970: cambia la frase. */
export function quoteSlot(day: string, hour: number): number {
  const [y, m, d] = day.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000) * 4 + Math.floor(hour / 6);
}

function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : a;
}

/** La nota de un tramo: salta por la lista con un paso coprimo (pasan todas antes de repetirse y no salen seguidas las de la misma sección). */
export function pickForSlot<T>(list: T[], slot: number): T | null {
  const n = list.length;
  if (!n) return null;
  let step = 17;
  while (gcd(step, n) !== 1) step++;
  return list[(((slot * step) % n) + n) % n];
}

/** Milisegundos hasta el próximo cambio de tramo (hora en punto múltiplo de 6, en Montevideo). */
export function msToNextSlot(at: Date = new Date()): number {
  const { hour } = montevideoNow(at);
  const next = (Math.floor(hour / 6) + 1) * 6;
  const minutes = at.getUTCMinutes();
  const seconds = at.getUTCSeconds();
  return ((next - hour) * 3600 - minutes * 60 - seconds) * 1000 - at.getUTCMilliseconds() + 500;
}
