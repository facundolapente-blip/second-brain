/**
 * Reloj (Huawei Watch Fit 3) por intervals.icu: lectura pura de los datos diarios y qué se
 * guarda en el check-in. Sin `server-only` para poder probarlo.
 *
 * Camino de los datos: reloj → app Huawei Health → intervals.icu (conexión oficial con
 * Huawei, gratis) → esta app, con la clave personal de intervals.icu.
 */

export type WatchDay = { date: string; steps: number | null; sleepMin: number | null; weightG: number | null };

/** Lo que ya se guardó desde el reloj, para saber si un valor lo puso el reloj o Facu. */
export type WatchSynced = { sleep: Record<string, number>; weight: Record<string, number> };

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Pasos, sueño y peso de los registros de `GET /athlete/0/wellness` (valores fuera de rango se descartan). */
export function parseWellness(rows: unknown, today: string): WatchDay[] {
  if (!Array.isArray(rows)) return [];
  const out: WatchDay[] = [];
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const date = typeof o.id === "string" ? o.id.slice(0, 10) : "";
    if (!ISO_DAY.test(date) || date > today) continue;
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    const steps = num(o.steps);
    const sleepSecs = num(o.sleepSecs);
    const weight = num(o.weight);
    const day: WatchDay = {
      date,
      steps: steps !== null && steps > 0 && steps < 200_000 ? Math.round(steps) : null,
      sleepMin: sleepSecs !== null && sleepSecs >= 30 * 60 && sleepSecs <= 16 * 3600 ? Math.round(sleepSecs / 60) : null,
      weightG: weight !== null && weight >= 20 && weight <= 300 ? Math.round(weight * 1000) : null,
    };
    if (day.steps !== null || day.sleepMin !== null || day.weightG !== null) out.push(day);
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Qué cambiar en el check-in de un día. Los pasos los manda siempre el reloj (se pisan:
 * durante el día van subiendo). El sueño y el peso solo se ponen si el día no tenía, o si
 * lo que tenía lo había puesto el reloj (así un dato corregido en Huawei se actualiza, pero
 * lo que Facu cargó a mano en el check-in no se toca).
 */
export function watchPatch(
  day: WatchDay,
  current: { steps: number | null; sleepMin: number | null; weightG: number | null } | undefined,
  synced: WatchSynced,
): { steps?: number; sleepMin?: number; weightG?: number } {
  const patch: { steps?: number; sleepMin?: number; weightG?: number } = {};
  if (day.steps !== null && day.steps !== (current?.steps ?? null)) patch.steps = day.steps;
  const mine = (field: "sleepMin" | "weightG", map: Record<string, number>) => {
    const now = current?.[field] ?? null;
    return now === null || now === map[day.date];
  };
  if (day.sleepMin !== null && day.sleepMin !== (current?.sleepMin ?? null) && mine("sleepMin", synced.sleep)) patch.sleepMin = day.sleepMin;
  if (day.weightG !== null && day.weightG !== (current?.weightG ?? null) && mine("weightG", synced.weight)) patch.weightG = day.weightG;
  return patch;
}

/** Deja en el registro solo los días desde `from` (no crece para siempre). */
export function pruneSynced(map: Record<string, number>, from: string): Record<string, number> {
  return Object.fromEntries(Object.entries(map).filter(([d]) => d >= from));
}

/** Una clave de intervals.icu: letras y números, sin espacios (se pega desde Configuración → Desarrollador). */
export function cleanApiKey(raw: unknown): string | null {
  const k = String(raw ?? "").trim();
  return /^[A-Za-z0-9_-]{16,80}$/.test(k) ? k : null;
}
