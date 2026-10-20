/**
 * Salud (servidor y cliente, sin base): períodos, promedios y comparaciones de lo
 * que mide el reloj (pasos, sueño, estrés, pulso, distancia, calorías, peso).
 */
import { formatSleep } from "./checkin-logic";
import { monthBounds, shiftMonth } from "./dates";

export type HealthDay = {
  date: string;
  steps: number | null;
  /** Minutos dormidos la noche que termina ese día. */
  sleepMin: number | null;
  /** Estrés promedio del reloj (Huawei, 1 a 99). */
  stress: number | null;
  hrMin: number | null;
  hrMax: number | null;
  distanceM: number | null;
  activeKcal: number | null;
  weightG: number | null;
};

export type HealthKey = Exclude<keyof HealthDay, "date">;

export const HEALTH_KEYS: HealthKey[] = ["steps", "sleepMin", "stress", "hrMin", "hrMax", "distanceM", "activeKcal", "weightG"];

/**
 * Lo que se completa recién cuando termina el día: hoy se dibuja (más claro) pero
 * no entra en los promedios. El sueño (la noche ya terminó) y el peso sí entran.
 */
export const PARTIAL_TODAY: ReadonlySet<HealthKey> = new Set(["steps", "stress", "hrMin", "hrMax", "distanceM", "activeKcal"]);

export function emptyHealthDay(date: string): HealthDay {
  return { date, steps: null, sleepMin: null, stress: null, hrMin: null, hrMax: null, distanceM: null, activeKcal: null, weightG: null };
}

export type HealthPeriod = {
  kind: "month" | "year";
  /** YYYY-MM o YYYY. */
  key: string;
  prevKey: string;
  from: string;
  /** Último día que se mira (hoy, si el período está en curso). */
  to: string;
  prevFrom: string;
  /** En el período en curso, el anterior hasta el mismo día. */
  prevTo: string;
  isCurrent: boolean;
};

/** El mes o el año pedido en la dirección (`?mes=YYYY-MM` / `?anio=YYYY`, no futuros); si no, el mes en curso. */
export function periodFromParams(sp: { mes?: string | string[]; anio?: string | string[] }, today: string): { kind: "month" | "year"; key: string } {
  const { mes, anio } = sp;
  if (typeof anio === "string" && /^\d{4}$/.test(anio) && anio <= today.slice(0, 4) && anio >= "2000") return { kind: "year", key: anio };
  const current = today.slice(0, 7);
  const month = typeof mes === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) && mes <= current && mes >= "2000-01" ? mes : current;
  return { kind: "month", key: month };
}

/** Límites del período y del anterior (mismas reglas que el Resumen). */
export function healthPeriod(kind: "month" | "year", key: string, today: string): HealthPeriod {
  if (kind === "year") {
    const prevKey = String(Number(key) - 1);
    const isCurrent = key === today.slice(0, 4);
    const end = `${key}-12-31`;
    // 29 de febrero contra un año sin él: se toma el 28.
    const sameDay = today.slice(5) === "02-29" ? `${prevKey}-02-28` : `${prevKey}-${today.slice(5)}`;
    return {
      kind,
      key,
      prevKey,
      from: `${key}-01-01`,
      to: end < today ? end : today,
      prevFrom: `${prevKey}-01-01`,
      prevTo: isCurrent ? sameDay : `${prevKey}-12-31`,
      isCurrent,
    };
  }
  const isCurrent = key === today.slice(0, 7);
  const { from, to: end } = monthBounds(key);
  const prevKey = shiftMonth(key, -1);
  const prev = monthBounds(prevKey);
  const sameDay = `${prevKey}-${today.slice(8)}`;
  return {
    kind,
    key,
    prevKey,
    from,
    to: end < today ? end : today,
    prevFrom: prev.from,
    prevTo: isCurrent && sameDay < prev.to ? sameDay : prev.to,
    isCurrent,
  };
}

/** Los valores que cuentan para el promedio (sin días vacíos ni el día de hoy si todavía no terminó). */
function valuesOf(days: HealthDay[], key: HealthKey, today: string): number[] {
  const out: number[] = [];
  for (const d of days) {
    const v = d[key];
    if (v === null || (d.date >= today && PARTIAL_TODAY.has(key))) continue;
    out.push(v);
  }
  return out;
}

/** Promedio por día con dato (los días sin dato son huecos, no ceros); null sin datos. */
export function averageOf(days: HealthDay[], key: HealthKey, today: string): number | null {
  const v = valuesOf(days, key, today);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/** El último valor del período (para el peso). */
export function lastOf(days: HealthDay[], key: HealthKey): { date: string; value: number } | null {
  for (let i = days.length - 1; i >= 0; i--) {
    const v = days[i][key];
    if (v !== null) return { date: days[i].date, value: v };
  }
  return null;
}

export type MetricSummary = { avg: number | null; days: number; prevAvg: number | null };

export type HealthSummary = Record<Exclude<HealthKey, "weightG">, MetricSummary> & {
  weight: { last: { date: string; value: number } | null; prevLast: { date: string; value: number } | null };
};

/** Promedio de cada medida en el período y en el anterior; el peso, el último de cada uno. */
export function summarizeHealth(now: HealthDay[], before: HealthDay[], today: string): HealthSummary {
  const m = (key: Exclude<HealthKey, "weightG">): MetricSummary => ({
    avg: averageOf(now, key, today),
    days: valuesOf(now, key, today).length,
    prevAvg: averageOf(before, key, today),
  });
  return {
    steps: m("steps"),
    sleepMin: m("sleepMin"),
    stress: m("stress"),
    hrMin: m("hrMin"),
    hrMax: m("hrMax"),
    distanceM: m("distanceM"),
    activeKcal: m("activeKcal"),
    weight: { last: lastOf(now, "weightG"), prevLast: lastOf(before, "weightG") },
  };
}

/**
 * Cambio contra el período anterior: "pct" en % entero (null si antes era 0) o
 * "diff" en la unidad de la medida, redondeado a `digits` decimales.
 */
export function changeOf(now: number | null, before: number | null, mode: "pct" | "diff", digits = 0): number | null {
  if (now === null || before === null) return null;
  const f = 10 ** digits;
  if (mode === "diff") return Math.round((now - before) * f) / f;
  if (before === 0) return null;
  return Math.round(((now - before) / before) * 100);
}

export type MonthHealth = { month: string } & Record<HealthKey, number | null>;

/** Promedio de cada medida por mes (la vista del año); el peso, el último del mes. */
export function monthlyAverages(days: HealthDay[], today: string): MonthHealth[] {
  const byMonth = new Map<string, HealthDay[]>();
  for (const d of days) {
    const k = d.date.slice(0, 7);
    const list = byMonth.get(k);
    if (list) list.push(d);
    else byMonth.set(k, [d]);
  }
  return [...byMonth].map(([month, ds]) => ({
    month,
    steps: averageOf(ds, "steps", today),
    sleepMin: averageOf(ds, "sleepMin", today),
    stress: averageOf(ds, "stress", today),
    hrMin: averageOf(ds, "hrMin", today),
    hrMax: averageOf(ds, "hrMax", today),
    distanceM: averageOf(ds, "distanceM", today),
    activeKcal: averageOf(ds, "activeKcal", today),
    weightG: lastOf(ds, "weightG")?.value ?? null,
  }));
}

export function hasAnyData(days: HealthDay[]): boolean {
  return days.some((d) => HEALTH_KEYS.some((k) => d[k] !== null));
}

/** Nivel de estrés como lo muestra Huawei: <30 Bajo, 30–59 Normal, 60–79 Medio, ≥80 Alto. */
export const STRESS_LEVELS = [
  { label: "Bajo", min: 1, tone: "green" },
  { label: "Normal", min: 30, tone: "blue" },
  { label: "Medio", min: 60, tone: "orange" },
  { label: "Alto", min: 80, tone: "red" },
] as const;

export function stressLevel(score: number): (typeof STRESS_LEVELS)[number] {
  const r = Math.round(score);
  return [...STRESS_LEVELS].reverse().find((l) => r >= l.min) ?? STRESS_LEVELS[0];
}

/** Sueño promedio: "7 h 45 min" (redondeado a 5 minutos), "8 h". */
export function sleepText(min: number | null): string {
  if (min === null) return "–";
  const r = Math.round(min / 5) * 5;
  return r % 60 ? `${formatSleep(r)} min` : formatSleep(r);
}

/** "6,2 km" (metros a kilómetros, un decimal). */
export function kmText(m: number | null): string {
  if (m === null) return "–";
  return `${(Math.round(m / 100) / 10).toLocaleString("es-UY", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
}

/** Tope "redondo" para el eje de un gráfico de barras: 1, 2, 4, 5 o 10 por la potencia de 10. */
export function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  for (const s of [1, 2, 4, 5, 10]) if (s * mag >= v) return s * mag;
  return 10 * mag;
}

/** Metas de referencia de la pantalla Salud. */
export const STEPS_GOAL = 8000;
export const SLEEP_GOAL_MIN = 7 * 60;

export type HealthHighlights = {
  /** Días con 8.000 pasos o más, de los días con pasos (sin hoy, que no terminó). */
  stepsGoal: { hit: number; of: number };
  /** Noches de 7 h o más, de las noches con dato. */
  sleepGoal: { hit: number; of: number };
  bestSteps: { date: string; value: number } | null;
  longestSleep: { date: string; value: number } | null;
  calmest: { date: string; value: number } | null;
  farthest: { date: string; value: number } | null;
};

/** Lo destacado de un período: cuántos días llegaron a la meta y los récords (sin el día de hoy en lo que se acumula). */
export function healthHighlights(days: HealthDay[], today: string): HealthHighlights {
  const pick = (key: HealthKey, better: (a: number, b: number) => boolean) => {
    let best: { date: string; value: number } | null = null;
    for (const d of days) {
      const v = d[key];
      if (v === null || (d.date >= today && PARTIAL_TODAY.has(key))) continue;
      if (!best || better(v, best.value)) best = { date: d.date, value: v };
    }
    return best;
  };
  const steps = valuesOf(days, "steps", today);
  const sleep = valuesOf(days, "sleepMin", today);
  return {
    stepsGoal: { hit: steps.filter((v) => v >= STEPS_GOAL).length, of: steps.length },
    sleepGoal: { hit: sleep.filter((v) => v >= SLEEP_GOAL_MIN).length, of: sleep.length },
    bestSteps: pick("steps", (a, b) => a > b),
    longestSleep: pick("sleepMin", (a, b) => a > b),
    calmest: pick("stress", (a, b) => a < b),
    farthest: pick("distanceM", (a, b) => a > b),
  };
}
