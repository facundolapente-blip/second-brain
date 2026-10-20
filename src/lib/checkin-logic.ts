/**
 * Check-in diario (servidor y cliente): escalas, validación y formato.
 * Ánimo usa la misma escala que el journal (MOODS en journal-logic).
 */

export type CheckinDTO = {
  date: string;
  mood: number | null;
  energy: number | null;
  stress: number | null;
  /** Minutos dormidos la noche anterior. */
  sleepMin: number | null;
  /** Peso en gramos. */
  weightG: number | null;
  note: string | null;
};

export type CheckinPatch = Partial<Omit<CheckinDTO, "date">>;

export const ENERGY_LABELS = ["Sin pilas", "Baja", "Normal", "Buena", "A full"];
export const STRESS_LABELS = ["Nada", "Poco", "Algo", "Bastante", "Mucho"];

export function emptyCheckin(date: string): CheckinDTO {
  return { date, mood: null, energy: null, stress: null, sleepMin: null, weightG: null, note: null };
}

const scale = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5 ? v : null);

/** Deja solo campos válidos; un campo presente con valor inválido queda en null. */
export function cleanPatch(raw: unknown): CheckinPatch {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: CheckinPatch = {};
  for (const k of ["mood", "energy", "stress"] as const) if (k in r) out[k] = scale(r[k]);
  if ("sleepMin" in r) {
    const v = r.sleepMin;
    out.sleepMin = typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 24 * 60 ? Math.round(v) : null;
  }
  if ("weightG" in r) {
    const v = r.weightG;
    out.weightG = typeof v === "number" && Number.isFinite(v) && v >= 20_000 && v <= 400_000 ? Math.round(v) : null;
  }
  if ("note" in r) out.note = typeof r.note === "string" ? r.note.trim().slice(0, 500) || null : null;
  return out;
}

/** "7 h 30" / "8 h". */
export function formatSleep(min: number | null): string {
  if (min === null) return "–";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

/** "82,4 kg". */
export function formatWeight(g: number | null): string {
  if (g === null) return "–";
  return `${(g / 1000).toLocaleString("es-UY", { maximumFractionDigits: 1 })} kg`;
}

/** Acepta "82,4", "82.4" u "82" (kg) y devuelve gramos. */
export function parseWeight(raw: string): number | null {
  const n = Number(raw.trim().replace(",", "."));
  if (!raw.trim() || !Number.isFinite(n) || n < 20 || n > 400) return null;
  return Math.round(n * 1000);
}

/**
 * Filtro (Prisma) de un check-in cargado por Facu: ánimo, energía, estrés o nota. Las filas
 * que solo tienen lo que mandó el reloj (pasos, sueño, peso, estrés del reloj) no cuentan.
 */
export const FILLED_CHECKIN = {
  OR: [{ mood: { not: null } }, { energy: { not: null } }, { stress: { not: null } }, { note: { not: null } }],
};
