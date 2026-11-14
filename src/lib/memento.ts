import { addDays, diffDays, isISODate } from "./dates";

/**
 * Memento mori (2026-11-14, pedido de Facu): cuántas semanas de vida pasaron de las que
 * tendría hasta cierta edad (él eligió 75). Lógica pura, la usan Inicio y las pruebas.
 * La configuración va en `AppSetting "memento"` como `{ nacimiento: "1999-07-27", anios: 75 }`.
 */
export const MEMENTO_KEY = "memento";
export const MEMENTO_DEFAULT_YEARS = 75;

export type MementoConfig = { birth: string; years: number };

export function parseMemento(raw: string | null | undefined): MementoConfig | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as { nacimiento?: unknown; anios?: unknown };
    const years = Number(j.anios);
    if (!isISODate(j.nacimiento)) return null;
    return { birth: j.nacimiento, years: Number.isInteger(years) && years >= 30 && years <= 120 ? years : MEMENTO_DEFAULT_YEARS };
  } catch {
    return null;
  }
}

export const serializeMemento = (c: MementoConfig) => JSON.stringify({ nacimiento: c.birth, anios: c.years });

/** El mismo día y mes, `n` años después (un 29 de febrero cae el 28 en los años sin él). */
export function addYears(iso: string, n: number): string {
  const y = Number(iso.slice(0, 4)) + n;
  const md = iso.slice(5);
  const candidate = `${y}-${md}`;
  return isISODate(candidate) ? candidate : `${y}-02-28`;
}

export type MementoStats = {
  /** Semanas enteras vividas. */
  lived: number;
  /** Semanas que hay entre el nacimiento y esa edad. */
  total: number;
  left: number;
  /** De 0 a 1. */
  share: number;
  /** Años cumplidos. */
  age: number;
  /** Semana (1 a 52/53) del año de vida en curso: desde el último cumpleaños. */
  weekOfYear: number;
};

export function mementoStats(c: MementoConfig, today: string): MementoStats {
  const lived = Math.max(0, Math.floor(diffDays(today, c.birth) / 7));
  const total = Math.floor(diffDays(addYears(c.birth, c.years), c.birth) / 7);
  let age = Number(today.slice(0, 4)) - Number(c.birth.slice(0, 4));
  if (addYears(c.birth, age) > today) age--;
  age = Math.max(0, age);
  const lastBirthday = addYears(c.birth, age);
  const weekOfYear = Math.floor(diffDays(today, lastBirthday) / 7) + 1;
  return { lived, total, left: Math.max(0, total - lived), share: total ? Math.min(1, lived / total) : 0, age, weekOfYear };
}

/** El primer día de la vida (para validar la fecha: no puede ser en el futuro). */
export const isValidBirth = (iso: string, today: string) => isISODate(iso) && iso <= today && iso >= addDays(today, -120 * 366);
