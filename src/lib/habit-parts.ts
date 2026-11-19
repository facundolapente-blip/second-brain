/**
 * Hábitos por partes (pedido de Facu, 2026-11-19): un hábito se mide con una lista de
 * partes ("Celular": sin celular la primera hora, sin celular antes de dormir, apagarlo),
 * cada una de la Mañana o de la Noche. El día se cierra a la noche como cualquier hábito.
 *
 *  - Todas las partes hechas = el día está **hecho**; algunas = **a medias**; ninguna =
 *    sin marcar. Las reglas de un día a medias (racha, puntaje, avance) están en
 *    habit-logic.ts (`isPartsPartial`).
 *  - Cada día guarda qué partes se hicieron y **cuántas había** (`HabitLog.parts` =
 *    `{ done, of }`): sumar o sacar una parte más adelante no cambia los días anteriores
 *    (solo se recalcula el de hoy, si ya estaba marcado).
 *  - Una parte puede **construirse de a poco** (opcional): una escalera de números con
 *    unidad (15 → 30 → 45 → 60 min). Se reusa la escalera por semanas de habit-ladder.ts:
 *    una semana cumplida para una parte = esa parte hecha los días que pide el hábito esa
 *    semana. La app nunca sube sola: pregunta.
 *
 * Lógica pura (sin base ni React): la usan el servidor, las pantallas y las pruebas.
 */
import { addDays } from "./dates.ts";
import { isScheduled, type DayLog, type HabitRule, type LogMap } from "./habit-logic.ts";
import { LADDER_MAX_STEPS, LADDER_WEEKS_MAX, parseLadder, stepProgress, type Ladder, type LadderStep, type ProgressOpts, type StepProgress } from "./habit-ladder.ts";

export type PartMoment = "morning" | "night";

/** La escalera de una parte: los pasos llevan el número (`target`) y la unidad va aparte. */
export type PartLadder = Ladder & { unit: string };

/** since = día en que se sumó la parte (sus cifras cuentan desde ahí). */
export type HabitPart = { id: string; name: string; moment: PartMoment; since: string; ladder: PartLadder | null };

/** Lo que se guarda en `HabitLog.parts`. */
export type PartsDay = { done: string[]; of: number };

export const PARTS_MAX = 8;
export const PART_NAME_MAX = 120;
export const PART_UNIT_MAX = 20;
export const PART_UNITS = ["min", "páginas", "veces"];
export const MOMENT_LABEL: Record<PartMoment, string> = { morning: "Mañana", night: "Noche" };
export const MOMENTS: PartMoment[] = ["morning", "night"];

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Un id corto para una parte nueva (se genera en el aparato o en el servidor). */
export function newPartId(): string {
  return `p${Math.random().toString(36).slice(2, 9)}`;
}

/** La escalera de una parte guardada, controlada (null si no es usable). */
export function parsePartLadder(raw: unknown): PartLadder | null {
  const l = parseLadder(raw);
  if (!l || !l.steps.every((s) => typeof s.target === "number")) return null;
  const r = raw as Record<string, unknown>;
  const unit = typeof r.unit === "string" ? r.unit.trim().slice(0, PART_UNIT_MAX) : "";
  return { ...l, unit };
}

/** Lo guardado en `Habit.parts`, controlado. null si no hay partes (hábito común). */
export function parseParts(raw: unknown): HabitPart[] | null {
  let v = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(v)) return null;
  const seen = new Set<string>();
  const out: HabitPart[] = [];
  for (const x of v) {
    if (!x || typeof x !== "object") continue;
    const r = x as Record<string, unknown>;
    const id = typeof r.id === "string" && /^[\w-]{1,40}$/.test(r.id) ? r.id : null;
    const name = typeof r.name === "string" ? r.name.trim().slice(0, PART_NAME_MAX) : "";
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name,
      moment: r.moment === "night" ? "night" : "morning",
      since: isDate(r.since) ? r.since : "2000-01-01",
      ladder: r.ladder ? parsePartLadder(r.ladder) : null,
    });
    if (out.length >= PARTS_MAX) break;
  }
  return out.length ? orderParts(out) : null;
}

/** En el orden del día: primero las de la mañana (cada momento conserva su orden). */
export function orderParts<T extends { moment: PartMoment }>(parts: T[]): T[] {
  return [...parts.filter((p) => p.moment === "morning"), ...parts.filter((p) => p.moment === "night")];
}

/** Lo guardado en `HabitLog.parts`, controlado. */
export function parsePartsDay(raw: unknown): PartsDay | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const done = Array.isArray(r.done) ? r.done.filter((x): x is string => typeof x === "string") : [];
  const of = typeof r.of === "number" && Number.isFinite(r.of) ? Math.max(0, Math.round(r.of)) : 0;
  return of > 0 ? { done, of } : null;
}

/**
 * La marca de un día según las partes hechas (la misma regla en el servidor y en lo
 * optimista): todas = hecho; algunas = `none` con `value` = cuántas ("a medias");
 * ninguna = sin marca (`status` null; si hay nota queda `none` con 0).
 */
export function partsMark(partIds: string[], doneIds: string[]): { status: "done" | "none" | null; value: number; parts: PartsDay | null } {
  const done = partIds.filter((id) => doneIds.includes(id));
  const of = partIds.length;
  if (!of || !done.length) return { status: null, value: 0, parts: null };
  if (done.length >= of) return { status: "done", value: done.length, parts: { done, of } };
  return { status: "none", value: done.length, parts: { done, of } };
}

/** Las partes hechas de un día (vacío si no hay o si se salteó / falló). */
export function doneParts(log: DayLog | undefined, parts: HabitPart[] | null | undefined): string[] {
  if (!log || !parts?.length) return [];
  if (log.p) return log.p.d;
  // Un hecho sin el detalle (marcado desde otro lado): todas.
  if (log.s === "done") return parts.map((p) => p.id);
  return [];
}

// ─── Escalera de una parte ─────────────────────────────────────────────────

/** "30 min", "10 páginas", "1 vez". */
export function amountText(n: number, unit: string): string {
  const u = unit.trim();
  if (!u) return String(n);
  if (n === 1 && u === "veces") return "1 vez";
  if (n === 1 && u === "páginas") return "1 página";
  return `${n} ${u}`;
}

/** "¿Pasás a 45 minutos?": la unidad escrita entera. */
export function amountLong(n: number, unit: string): string {
  if (unit.trim() === "min") return `${n} ${n === 1 ? "minuto" : "minutos"}`;
  return amountText(n, unit);
}

/** Los números de la escalera: de `from` a `to` de a `by` (el último es `to` aunque el salto quede corto). */
export function partNumbers(from: number, to: number, by: number): number[] {
  const a = Math.max(1, Math.round(from));
  const b = Math.max(a, Math.round(to));
  const s = Math.max(1, Math.round(by));
  const out: number[] = [];
  for (let n = a; n < b; n += s) out.push(n);
  out.push(b);
  return out;
}

export type PartPlan = { from: number; to: number; by: number; unit: string; weeks: number };

/** Los pasos de una escalera de números. */
export function partSteps(plan: PartPlan): LadderStep[] {
  const weeks = clamp(Math.round(plan.weeks), 1, LADDER_WEEKS_MAX);
  return partNumbers(plan.from, plan.to, plan.by).map((n) => ({ title: amountText(n, plan.unit), target: n, weeks }));
}

/** ¿El plan es válido? (null si sí; si no, el error para mostrar.) */
export function partPlanError(plan: PartPlan): string | null {
  if (!(plan.from >= 1) || !(plan.to > plan.from)) return "La meta tiene que ser más que el número con que empezás.";
  if (!(plan.by >= 1)) return "Tiene que subir de a 1 o más.";
  if (partNumbers(plan.from, plan.to, plan.by).length > LADDER_MAX_STEPS) return `Como mucho ${LADDER_MAX_STEPS} pasos: subí de a más.`;
  return null;
}

/** El plan de una escalera ya armada (para editarla). */
export function partPlanOf(l: PartLadder): PartPlan {
  const n = partLabels(l);
  return {
    from: n[0],
    to: n[n.length - 1],
    by: n.length > 1 ? n[1] - n[0] : 1,
    unit: l.unit,
    weeks: l.steps[clamp(l.current, 0, l.steps.length - 1)].weeks,
  };
}

/** Los números de cada paso. */
export function partLabels(l: Pick<Ladder, "steps">): number[] {
  return l.steps.map((s, i) => s.target ?? i + 1);
}

/** Una escalera nueva, desde el primer paso. */
export function newPartLadder(plan: PartPlan, today: string): PartLadder {
  return { goal: amountText(plan.to, plan.unit), steps: partSteps(plan), current: 0, stepStart: today, snoozeUntil: null, history: [], unit: plan.unit.trim().slice(0, PART_UNIT_MAX) };
}

/**
 * Cambia el plan de una escalera que ya anda: si los números y la unidad son los mismos,
 * solo cambian las semanas para subir (el paso y desde cuándo, igual); si cambian, queda
 * en el paso más alto que no pase de donde estaba (si es el mismo número, sigue la cuenta).
 */
export function replanPart(l: PartLadder, plan: PartPlan, today: string): PartLadder {
  const steps = partSteps(plan);
  const unit = plan.unit.trim().slice(0, PART_UNIT_MAX);
  const old = partLabels(l);
  const fresh = steps.map((s) => s.target as number);
  if (unit === l.unit && old.join() === fresh.join()) return { ...l, steps: l.steps.map((s, i) => ({ ...s, weeks: steps[i].weeks })) };
  const curValue = old[clamp(l.current, 0, old.length - 1)];
  let current = 0;
  fresh.forEach((n, i) => {
    if (n <= curValue) current = i;
  });
  const same = fresh[current] === curValue && unit === l.unit;
  return { goal: amountText(plan.to, unit), steps, current, stepStart: same ? l.stepStart : today, snoozeUntil: null, history: [], unit };
}

/**
 * "Estás en" de una parte en "Editar hábito": la pone en el paso con ese número (después
 * de `replanPart`). Si es otro paso, como al subir o bajar: el tramo de ahora queda en la
 * historia hasta ayer y el paso nuevo arranca hoy. Un número que no está, o el mismo
 * paso, no cambia nada.
 */
export function pickPartStep(l: PartLadder, value: number | null | undefined, today: string): PartLadder {
  if (typeof value !== "number") return l;
  const i = partLabels(l).indexOf(value);
  if (i < 0 || i === l.current) return l;
  const history = [...(l.history ?? [])];
  if (today > l.stepStart) history.push({ step: l.current, from: l.stepStart, to: addDays(today, -1) });
  return { ...l, current: i, stepStart: today, snoozeUntil: null, history };
}

/** El número del paso en el que quedaría con otro plan: el más alto que no pase de `at` (como `replanPart`). */
export function partStepAt(labels: number[], at: number): number {
  let out = labels[0];
  for (const n of labels) if (n <= at) out = n;
  return out;
}

/** ¿Esa parte se hizo ese día? */
export function partDoneFn(partId: string, logs: LogMap): (d: string) => boolean {
  return (d) => {
    const l = logs[d];
    if (!l || l.s === "skipped" || l.s === "failed") return false;
    return l.p ? l.p.d.includes(partId) : l.s === "done";
  };
}

const optsOf = (h: Pick<HabitRule, "weekStart" | "frequency" | "weekdays" | "timesPerWeek">): ProgressOpts => ({
  weekStart: h.weekStart,
  frequency: h.frequency,
  weekdays: h.weekdays,
  timesPerWeek: h.timesPerWeek,
});

/** Cómo va la escalera de una parte (semanas cumplidas, si ya puede subir…). */
export function partProgress(part: HabitPart, h: Pick<HabitRule, "weekStart" | "frequency" | "weekdays" | "timesPerWeek">, logs: LogMap, today: string): StepProgress | null {
  if (!part.ladder) return null;
  return stepProgress(part.ladder, partDoneFn(part.id, logs), today, optsOf(h));
}

/** "Semana 1 de 2 para pasar a 45 min" (o "en la meta"). */
export function partWeekLine(l: PartLadder, p: StepProgress): string {
  if (p.atGoal) return "Es la meta";
  const curMet = p.weeks.at(-1)?.met === true;
  const n = Math.max(1, Math.min(p.weeksNeeded, curMet ? p.streak : p.streak + 1));
  const next = partLabels(l)[p.step + 1];
  return `Semana ${n} de ${p.weeksNeeded} para pasar a ${amountText(next, l.unit)}`;
}

/** "Paso 2 de 4 · 30 min". */
export function partStepLine(l: PartLadder): string {
  const cur = clamp(l.current, 0, l.steps.length - 1);
  return `Paso ${cur + 1} de ${l.steps.length} · ${amountText(partLabels(l)[cur], l.unit)}`;
}

// ─── Cifras por parte ──────────────────────────────────────────────────────

export type PartsStats = {
  days: number;
  complete: number;
  partial: number;
  none: number;
  parts: { id: string; done: number; days: number; pct: number }[];
  /** La que más cuesta (la de menor %, si hay al menos dos y se nota la diferencia). */
  hardest: string | null;
};

/**
 * Los últimos `window` días (hasta hoy) en los que tocaba: completos, a medias y sin
 * ninguna, y cada parte con los días que se hizo (desde que existe). Los salteados no
 * cuentan; hoy entra solo si ya tiene algo marcado.
 */
export function partsStats(h: HabitRule & { parts: HabitPart[] | null }, logs: LogMap, today: string, window = 30): PartsStats {
  const parts = h.parts ?? [];
  const out: PartsStats = { days: 0, complete: 0, partial: 0, none: 0, parts: parts.map((p) => ({ id: p.id, done: 0, days: 0, pct: 0 })), hardest: null };
  const from = addDays(today, -(window - 1));
  for (let d = from; d <= today; d = addDays(d, 1)) {
    if (!isScheduled(h, d)) continue;
    const log = logs[d];
    if (log?.s === "skipped") continue;
    if (d === today && !(log && (log.s === "done" || log.p))) continue;
    out.days++;
    const done = doneParts(log, parts);
    if (log?.s === "done") out.complete++;
    else if (done.length) out.partial++;
    else out.none++;
    parts.forEach((p, i) => {
      if (d < p.since) return;
      out.parts[i].days++;
      if (done.includes(p.id)) out.parts[i].done++;
    });
  }
  for (const p of out.parts) p.pct = p.days ? p.done / p.days : 0;
  const counted = out.parts.filter((p) => p.days >= 3);
  if (counted.length >= 2) {
    const sorted = [...counted].sort((a, b) => a.pct - b.pct);
    if (sorted[1].pct - sorted[0].pct >= 0.1) out.hardest = sorted[0].id;
  }
  return out;
}
