import { dec1 } from "./format";
/**
 * Cruces entre módulos a partir de las filas diarias (DayMetrics). Todo puro:
 * promedios de dos grupos de días y correlaciones de Pearson, con mínimos de
 * muestra para no sacar conclusiones de tres días.
 */
import type { DayMetrics, HabitRef } from "./daily-metrics";
import { weekday } from "./dates";

export type Insight = {
  id: string;
  /** Módulo que da el color. */
  module: "habitos" | "journal" | "gastos" | "plan" | "inicio";
  text: string;
  detail: string;
  /** Para ordenar: tamaño del efecto (0 a 1+). */
  weight: number;
};

const MIN_GROUP = 5;

function mean(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

const pesos = (cents: number) =>
  `$ ${Math.round(cents / 100).toLocaleString("es-UY")}`;

/** Compara un valor entre dos grupos de días; null si alguno es muy chico. */
function split<T>(days: T[], inA: (d: T) => boolean | null, value: (d: T) => number | null) {
  const a: number[] = [];
  const b: number[] = [];
  for (const d of days) {
    const g = inA(d);
    const v = value(d);
    if (g === null || v === null) continue;
    (g ? a : b).push(v);
  }
  if (a.length < MIN_GROUP || b.length < MIN_GROUP) return null;
  return { a: mean(a), b: mean(b), na: a.length, nb: b.length };
}

export function buildInsights(days: DayMetrics[], habits: HabitRef[]): Insight[] {
  const out: Insight[] = [];
  const past = days.filter((d) => d.habitsDue > 0 || d.spentCents > 0 || d.wrote || d.mood !== null);

  for (const h of habits) {
    // Lo que todavía se puede hacer (un semanal con la semana en curso) no es un "no".
    const done = (d: DayMetrics) => (h.id in d.habit && !d.habitOpen.includes(h.id) ? d.habit[h.id] : null);
    // Gasto los días que se hizo contra los que no.
    const s = split(past, done, (d) => d.spentCents);
    if (s && s.b > 0) {
      const diff = (s.a - s.b) / s.b;
      if (Math.abs(diff) >= 0.15) {
        out.push({
          id: `gasto-${h.id}`,
          module: "gastos",
          text:
            diff < 0
              ? `Los días que hacés ${h.name} gastás ${Math.round(-diff * 100)}% menos`
              : `Los días que hacés ${h.name} gastás ${Math.round(diff * 100)}% más`,
          detail: `${pesos(s.a)} contra ${pesos(s.b)} por día · ${s.na} y ${s.nb} días`,
          weight: Math.min(1, Math.abs(diff)),
        });
      }
    }
    // Ánimo los días que se hizo contra los que no.
    const m = split(past, done, (d) => d.mood);
    if (m && Math.abs(m.a - m.b) >= 0.3) {
      out.push({
        id: `animo-${h.id}`,
        module: "habitos",
        text:
          m.a > m.b
            ? `Con ${h.name} hecho, tu ánimo es mejor (${dec1(m.a)} contra ${dec1(m.b)})`
            : `Los días con ${h.name} hecho tu ánimo es más bajo (${dec1(m.a)} contra ${dec1(m.b)})`,
        detail: `Escala de 1 a 5 · ${m.na} y ${m.nb} días`,
        weight: Math.min(1, Math.abs(m.a - m.b) / 2) + 0.2,
      });
    }
  }

  // Sueño: 7 horas o más contra menos.
  const sleepMood = split(past, (d) => (d.sleepMin === null ? null : d.sleepMin >= 420), (d) => d.mood);
  if (sleepMood && Math.abs(sleepMood.a - sleepMood.b) >= 0.25) {
    out.push({
      id: "sueno-animo",
      module: "inicio",
      text: `Durmiendo 7 h o más tu ánimo promedio es ${dec1(sleepMood.a)}; con menos, ${dec1(sleepMood.b)}`,
      detail: `${sleepMood.na} y ${sleepMood.nb} días con sueño y ánimo cargados`,
      weight: Math.abs(sleepMood.a - sleepMood.b) / 2 + 0.3,
    });
  }
  const sleepHabits = split(
    past,
    (d) => (d.sleepMin === null || d.habitsDue === 0 ? null : d.sleepMin >= 420),
    (d) => (d.habitsDue ? d.habitsDone / d.habitsDue : null),
  );
  if (sleepHabits && Math.abs(sleepHabits.a - sleepHabits.b) >= 0.08) {
    out.push({
      id: "sueno-habitos",
      module: "habitos",
      text: `Con 7 h de sueño o más cumplís el ${Math.round(sleepHabits.a * 100)}% de los hábitos; con menos, el ${Math.round(sleepHabits.b * 100)}%`,
      detail: `${sleepHabits.na} y ${sleepHabits.nb} días`,
      weight: Math.abs(sleepHabits.a - sleepHabits.b) + 0.2,
    });
  }

  // Pasos: 8.000 o más contra menos.
  const stepsMood = split(past, (d) => (d.steps === null ? null : d.steps >= 8000), (d) => d.mood);
  if (stepsMood && Math.abs(stepsMood.a - stepsMood.b) >= 0.25) {
    out.push({
      id: "pasos-animo",
      module: "inicio",
      text: `Los días con 8.000 pasos o más tu ánimo promedio es ${dec1(stepsMood.a)}; con menos, ${dec1(stepsMood.b)}`,
      detail: `${stepsMood.na} y ${stepsMood.nb} días con pasos y ánimo`,
      weight: Math.abs(stepsMood.a - stepsMood.b) / 2 + 0.3,
    });
  }
  const stepsSleep = split(past, (d) => (d.steps === null || d.sleepMin === null ? null : d.steps >= 8000), (d) => d.sleepMin);
  if (stepsSleep && Math.abs(stepsSleep.a - stepsSleep.b) >= 20) {
    out.push({
      id: "pasos-sueno",
      module: "inicio",
      text: `Los días que caminás 8.000 pasos o más dormís ${Math.round(stepsSleep.a)} min; los otros, ${Math.round(stepsSleep.b)} min`,
      detail: `${stepsSleep.na} y ${stepsSleep.nb} días`,
      weight: Math.abs(stepsSleep.a - stepsSleep.b) / 120 + 0.2,
    });
  }

  // Escribir en el journal y los hábitos del día.
  const wroteHabits = split(
    past,
    (d) => (d.habitsDue === 0 ? null : d.wrote),
    (d) => (d.habitsDue ? d.habitsDone / d.habitsDue : null),
  );
  if (wroteHabits && Math.abs(wroteHabits.a - wroteHabits.b) >= 0.08) {
    out.push({
      id: "journal-habitos",
      module: "journal",
      text: `Los días que escribís cumplís el ${Math.round(wroteHabits.a * 100)}% de los hábitos; los que no, el ${Math.round(wroteHabits.b * 100)}%`,
      detail: `${wroteHabits.na} días escritos y ${wroteHabits.nb} sin escribir`,
      weight: Math.abs(wroteHabits.a - wroteHabits.b) + 0.1,
    });
  }

  // Días de muchos hábitos y el gasto.
  const goodDays = split(
    past,
    (d) => (d.habitsDue === 0 ? null : d.habitsDone / d.habitsDue >= 0.8),
    (d) => d.spentCents,
  );
  if (goodDays && goodDays.b > 0) {
    const diff = (goodDays.a - goodDays.b) / goodDays.b;
    if (Math.abs(diff) >= 0.15) {
      out.push({
        id: "dias-buenos-gasto",
        module: "gastos",
        text:
          diff < 0
            ? `En los días que cumplís 80% o más de los hábitos gastás ${Math.round(-diff * 100)}% menos`
            : `En los días que cumplís 80% o más de los hábitos gastás ${Math.round(diff * 100)}% más`,
        detail: `${pesos(goodDays.a)} contra ${pesos(goodDays.b)} por día`,
        weight: Math.min(1, Math.abs(diff)) + 0.1,
      });
    }
  }

  return out.sort((a, b) => b.weight - a.weight);
}

// ─── Por día de la semana ───────────────────────────────────────────────────

export const WEEKDAYS_MON = [1, 2, 3, 4, 5, 6, 0];
export const WEEKDAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export function byWeekday(days: DayMetrics[]) {
  return WEEKDAYS_MON.map((wd) => {
    const ds = days.filter((d) => weekday(d.date) === wd);
    const due = ds.reduce((n, d) => n + d.habitsDue, 0);
    const done = ds.reduce((n, d) => n + d.habitsDone, 0);
    const moods = ds.map((d) => d.mood).filter((m): m is number => m !== null);
    return {
      weekday: wd,
      habitPct: due ? Math.round((done / due) * 100) : null,
      spentAvg: ds.length ? Math.round(mean(ds.map((d) => d.spentCents))) : 0,
      wrotePct: ds.length ? Math.round((ds.filter((d) => d.wrote).length / ds.length) * 100) : 0,
      mood: moods.length >= 3 ? mean(moods) : null,
    };
  });
}

// ─── Correlaciones ──────────────────────────────────────────────────────────

export const METRICS = [
  { id: "habits", label: "Hábitos %", short: "Háb. %", get: (d: DayMetrics) => (d.habitsDue ? d.habitsDone / d.habitsDue : null) },
  { id: "mood", label: "Ánimo", short: "Ánimo", get: (d: DayMetrics) => d.mood },
  { id: "energy", label: "Energía", short: "Energ.", get: (d: DayMetrics) => d.energy },
  { id: "stress", label: "Estrés", short: "Estrés", get: (d: DayMetrics) => d.stress },
  { id: "sleep", label: "Sueño", short: "Sueño", get: (d: DayMetrics) => d.sleepMin },
  { id: "steps", label: "Pasos", short: "Pasos", get: (d: DayMetrics) => d.steps },
  { id: "stressWatch", label: "Estrés (reloj)", short: "Est. reloj", get: (d: DayMetrics) => d.stressWatch },
  { id: "spent", label: "Gasto", short: "Gasto", get: (d: DayMetrics) => d.spentCents },
  { id: "words", label: "Palabras", short: "Palab.", get: (d: DayMetrics) => d.words },
  { id: "plan", label: "Plan %", short: "Plan %", get: (d: DayMetrics) => (d.blocksTotal ? d.blocksDone / d.blocksTotal : null) },
] as const;

export type Corr = { r: number | null; n: number };

function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}

/** Matriz de correlaciones entre métricas; cada celda con cuántos días la sostienen. */
export function correlations(days: DayMetrics[]): Corr[][] {
  return METRICS.map((a) =>
    METRICS.map((b) => {
      const xs: number[] = [];
      const ys: number[] = [];
      for (const d of days) {
        const x = a.get(d);
        const y = b.get(d);
        if (x === null || y === null) continue;
        xs.push(x);
        ys.push(y);
      }
      return { r: xs.length >= 8 ? pearson(xs, ys) : null, n: xs.length };
    }),
  );
}

// ─── Semanas ────────────────────────────────────────────────────────────────

export function weeklySeries(days: DayMetrics[]) {
  const weeks = new Map<string, DayMetrics[]>();
  for (const d of days) {
    // Lunes de esa semana.
    const wd = weekday(d.date);
    const back = (wd + 6) % 7;
    const dt = new Date(`${d.date}T00:00:00Z`);
    dt.setUTCDate(dt.getUTCDate() - back);
    const k = dt.toISOString().slice(0, 10);
    weeks.set(k, [...(weeks.get(k) ?? []), d]);
  }
  return [...weeks].map(([monday, ds]) => {
    const due = ds.reduce((n, d) => n + d.habitsDue, 0);
    const done = ds.reduce((n, d) => n + d.habitsDone, 0);
    const moods = ds.map((d) => d.mood).filter((m): m is number => m !== null);
    return {
      monday,
      /** Días del período en esa semana: la primera y la última pueden venir cortadas. */
      days: ds.length,
      habitPct: due ? Math.round((done / due) * 100) : null,
      spentCents: ds.reduce((n, d) => n + d.spentCents, 0),
      wrote: ds.filter((d) => d.wrote).length,
      mood: moods.length ? mean(moods) : null,
    };
  });
}
