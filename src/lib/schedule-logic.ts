/**
 * Movimientos recurrentes (servidor y cliente): cuándo toca cada uno.
 * Las fechas se calculan desde el inicio, así un "todos los 31" cae el 30 en
 * abril y vuelve al 31 en mayo.
 */
import { addDays } from "./dates";

export type ScheduleFrequency = "once" | "daily" | "weekly" | "monthly" | "yearly";

export const FREQUENCIES: { value: ScheduleFrequency; label: string }[] = [
  { value: "monthly", label: "Mensual" },
  { value: "weekly", label: "Semanal" },
  { value: "yearly", label: "Anual" },
  { value: "daily", label: "Diario" },
  { value: "once", label: "Una vez" },
];

export function isFrequency(v: unknown): v is ScheduleFrequency {
  return FREQUENCIES.some((f) => f.value === v);
}

export type ScheduleDTO = {
  id: string;
  kind: "expense" | "income" | "transfer";
  title: string | null;
  amountCents: number;
  accountId: string;
  categoryId: string | null;
  toAccountId: string | null;
  toAmountCents: number | null;
  note: string | null;
  frequency: ScheduleFrequency;
  interval: number;
  startDate: string;
  nextDate: string | null;
  endDate: string | null;
  active: boolean;
  /** Cuántos movimientos generó. */
  generated: number;
};

function addMonths(start: string, months: number): string {
  const [y, m, d] = start.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

/** La vez número `n` (0 = la primera, que es el inicio). Null si no hay. */
export function occurrence(start: string, freq: ScheduleFrequency, interval: number, n: number): string | null {
  const k = Math.max(1, interval);
  switch (freq) {
    case "once":
      return n === 0 ? start : null;
    case "daily":
      return addDays(start, n * k);
    case "weekly":
      return addDays(start, n * k * 7);
    case "monthly":
      return addMonths(start, n * k);
    case "yearly":
      return addMonths(start, n * k * 12);
  }
}

/** Primera vez que toca en `from` o después (y no después de `end`). */
export function nextOnOrAfter(
  s: { startDate: string; frequency: ScheduleFrequency; interval: number; endDate: string | null },
  from: string,
): string | null {
  for (let n = 0; n < 20_000; n++) {
    const d = occurrence(s.startDate, s.frequency, s.interval, n);
    if (d === null) return null;
    if (s.endDate && d > s.endDate) return null;
    if (d >= from) return d;
  }
  return null;
}

/** Las veces que toca entre dos días inclusive. */
export function occurrencesBetween(
  s: { startDate: string; frequency: ScheduleFrequency; interval: number; endDate: string | null },
  from: string,
  to: string,
): string[] {
  const out: string[] = [];
  let d = nextOnOrAfter(s, from);
  while (d && d <= to && out.length < 1000) {
    out.push(d);
    d = nextOnOrAfter(s, addDays(d, 1));
  }
  return out;
}

/** "Todos los meses", "Cada 2 semanas", "Una vez". */
export function frequencyLabel(freq: ScheduleFrequency, interval: number): string {
  if (freq === "once") return "Una vez";
  const one = { daily: "Todos los días", weekly: "Todas las semanas", monthly: "Todos los meses", yearly: "Todos los años" }[freq];
  if (interval <= 1) return one;
  const unit = { daily: "días", weekly: "semanas", monthly: "meses", yearly: "años" }[freq];
  return `Cada ${interval} ${unit}`;
}
