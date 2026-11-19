import { describe, expect, it } from "vitest";
import {
  advance,
  becameReady,
  daysShort,
  habitNeverTwice,
  ladderPlan,
  ladderWeeks,
  neverTwiceStats,
  parseLadder,
  planSteps,
  planTarget,
  parseReplan,
  replanLadder,
  replanSteps,
  snoozeWeek,
  spanWeeks,
  stepBack,
  stepConfig,
  stepLabels,
  stepLong,
  stepProgress,
  stepRuleText,
  stepShort,
  type Ladder,
} from "@/lib/habit-ladder";
import { addDays } from "@/lib/dates";
import type { LogMap } from "@/lib/habit-logic";

const plain = { frequency: "daily", target: 1, unit: null, isQuit: false };

describe("el plan de días por semana", () => {
  it("un paso por cada número de días, de 1 a 7", () => {
    const s = planSteps(1, 7, 2);
    expect(s.map((x) => x.perWeek)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(s[0]).toEqual({ title: "1 día por semana", perWeek: 1, weeks: 2 });
    expect(s[2].title).toBe("3 días por semana");
    expect(s[6].title).toBe("Todos los días");
  });
  it("respeta los límites", () => {
    expect(planSteps(3, 2, 20).map((x) => [x.perWeek, x.weeks])).toEqual([[3, 8]]);
    expect(planSteps(0, 9, 0)).toHaveLength(7);
  });
  it("hasta dónde se propone llegar: lo del hábito, al menos 2", () => {
    expect(planTarget({ frequency: "daily" })).toBe(7);
    expect(planTarget({ frequency: "weekly", timesPerWeek: 4 })).toBe(4);
    expect(planTarget({ frequency: "weekly", timesPerWeek: 1 })).toBe(2);
    expect(planTarget({ frequency: "weekdays", weekdays: [1, 3, 5] })).toBe(3);
  });
  it("lee el plan de una escalera", () => {
    const l = { steps: planSteps(2, 5, 3), current: 1 };
    expect(ladderPlan(l)).toEqual({ from: 2, to: 5, weeks: 3 });
    expect(stepLabels(l)).toEqual([2, 3, 4, 5]);
    expect(stepShort(l, 1)).toBe("3 días");
    expect(stepLong(l, 1)).toBe("3 días por semana");
  });
  it("textos cortos", () => {
    expect(daysShort(1)).toBe("1 día");
    expect(daysShort(4)).toBe("4 días");
    expect(daysShort(7)).toBe("todos los días");
    expect(stepShort({ steps: planSteps(6, 7, 2), current: 0 }, 1)).toBe("todos los días");
  });
  it("las escaleras viejas de cantidad o de texto no tienen plan: van numeradas y con su título", () => {
    const text = { steps: [{ title: "Versión mínima", weeks: 2 }, { title: "Meditar", weeks: 2 }], current: 0 };
    expect(ladderPlan(text)).toBeNull();
    expect(stepLabels(text)).toEqual([1, 2]);
    expect(stepShort(text, 1)).toBe("Meditar");
    expect(stepLong(text, 1)).toBe("Meditar");
    expect(ladderPlan({ steps: [{ title: "Leer 5", perWeek: 3, target: 5, weeks: 2 }], current: 0 })).toBeNull();
    expect(ladderPlan({ steps: [{ title: "a", perWeek: 4, weeks: 2 }, { title: "b", perWeek: 2, weeks: 2 }], current: 0 })).toBeNull();
  });
  it("cambiar el plan no toca lo ya subido ni el paso actual", () => {
    const l: Ladder = { goal: "x", steps: planSteps(1, 7, 2), current: 2, stepStart: "2026-11-02" };
    const s = replanSteps(l, 5, 3);
    expect(s.map((x) => x.perWeek)).toEqual([1, 2, 3, 4, 5]);
    expect(s.map((x) => x.weeks)).toEqual([2, 2, 3, 3, 3]);
    expect(s[l.current].perWeek).toBe(3);
    // Nunca por debajo del paso en el que está.
    expect(replanSteps(l, 1, 2).map((x) => x.perWeek)).toEqual([1, 2, 3]);
  });
  it("con saltos (2, 4, 7) el paso actual sigue en su lugar", () => {
    const steps = [2, 4, 7].map((n) => ({ title: String(n), perWeek: n, weeks: 2 }));
    const s = replanSteps({ goal: "x", steps, current: 1, stepStart: "2026-11-02" }, 6, 2);
    expect(s.map((x) => x.perWeek)).toEqual([2, 4, 5, 6]);
  });
  it("parseReplan: el plan que manda Editar hábito", () => {
    const steps = [1, 2, 3, 4].map((n) => ({ title: String(n), perWeek: n, weeks: 2 }));
    const l: Ladder = { goal: "x", steps, current: 2, stepStart: "2026-11-02" };
    expect(parseReplan("", l)).toEqual({ ok: true, plan: null });
    // El formato viejo ({ to, weeks }): desde y el paso quedan como están.
    expect(parseReplan(JSON.stringify({ to: 6, weeks: 3 }), l)).toEqual({ ok: true, plan: { from: 1, current: 3, to: 6, weeks: 3 } });
    expect(parseReplan(JSON.stringify({ to: 3, weeks: 1 }), l)).toEqual({ ok: true, plan: { from: 1, current: 3, to: 3, weeks: 1 } });
    // El nuevo, con desde y el paso en el que está.
    expect(parseReplan(JSON.stringify({ from: 2, current: 2, to: 5, weeks: 2 }), l)).toEqual({ ok: true, plan: { from: 2, current: 2, to: 5, weeks: 2 } });
    expect(parseReplan(JSON.stringify({ from: 4, current: 4, to: 4, weeks: 2 }), l).ok).toBe(true);
    expect(parseReplan(JSON.stringify({ from: 3, current: 2, to: 5, weeks: 2 }), l).ok).toBe(false);
    expect(parseReplan(JSON.stringify({ from: 0, current: 2, to: 5, weeks: 2 }), l).ok).toBe(false);
    expect(parseReplan(JSON.stringify({ from: 1, current: 6, to: 5, weeks: 2 }), l).ok).toBe(false);
    expect(parseReplan(JSON.stringify({ from: 1, current: 2.5, to: 5, weeks: 2 }), l).ok).toBe(false);
    // Nunca menos que el paso actual, ni más de 7 días o de las semanas máximas.
    expect(parseReplan(JSON.stringify({ to: 2, weeks: 2 }), l).ok).toBe(false);
    expect(parseReplan(JSON.stringify({ to: 8, weeks: 2 }), l).ok).toBe(false);
    expect(parseReplan(JSON.stringify({ to: 5, weeks: 0 }), l).ok).toBe(false);
    expect(parseReplan(JSON.stringify({ to: 5, weeks: 9 }), l).ok).toBe(false);
    expect(parseReplan(JSON.stringify({ to: 5.5, weeks: 2 }), l).ok).toBe(false);
    expect(parseReplan("{roto", l).ok).toBe(false);
    // Las escaleras viejas (sin plan) no se replanifican.
    const old: Ladder = { goal: "x", steps: [{ title: "a", target: 2, weeks: 1 }, { title: "b", target: 4, weeks: 1 }], current: 0, stepStart: "2026-11-02" };
    expect(parseReplan(JSON.stringify({ to: 5, weeks: 2 }), old).ok).toBe(false);
  });
  it("replanLadder: mismo desde y mismo paso es replanSteps (la cuenta sigue)", () => {
    const l: Ladder = { goal: "x", steps: planSteps(1, 7, 2), current: 2, stepStart: "2026-11-02", snoozeUntil: "2026-11-20", history: [{ step: 0, from: "2026-10-01", to: "2026-10-14" }] };
    const r = replanLadder(l, { from: 1, current: 3, to: 5, weeks: 3 }, "2026-11-19");
    expect(r.steps.map((s) => s.perWeek)).toEqual([1, 2, 3, 4, 5]);
    expect(r.current).toBe(2);
    expect(r.stepStart).toBe("2026-11-02");
    expect(r.snoozeUntil).toBe("2026-11-20");
    expect(r.history).toEqual(l.history);
  });
  it("replanLadder: otro paso arranca hoy y el de antes queda en la historia", () => {
    const history = [
      { step: 0, from: "2026-10-01", to: "2026-10-14" },
      { step: 1, from: "2026-10-15", to: "2026-11-01" },
    ];
    const l: Ladder = { goal: "x", steps: planSteps(1, 7, 2), current: 2, stepStart: "2026-11-02", snoozeUntil: "2026-11-20", history };
    const up = replanLadder(l, { from: 1, current: 5, to: 7, weeks: 2 }, "2026-11-19");
    expect(up.current).toBe(4);
    expect(up.steps[up.current].perWeek).toBe(5);
    expect(up.stepStart).toBe("2026-11-19");
    expect(up.snoozeUntil).toBeNull();
    expect(up.history).toEqual([...history, { step: 2, from: "2026-11-02", to: "2026-11-18" }]);
    // Empezar en 2: el tramo de 1 día se va y los demás pasan a su paso nuevo (por días).
    const from2 = replanLadder(l, { from: 2, current: 3, to: 6, weeks: 1 }, "2026-11-19");
    expect(from2.steps.map((s) => s.perWeek)).toEqual([2, 3, 4, 5, 6]);
    expect(from2.current).toBe(1);
    expect(from2.stepStart).toBe("2026-11-02");
    expect(from2.history).toEqual([{ step: 0, from: "2026-10-15", to: "2026-11-01" }]);
    // Bajar a 1 empezando en 1 el mismo día que arrancó el paso: no deja un tramo vacío.
    const same = replanLadder({ ...l, stepStart: "2026-11-19" }, { from: 1, current: 1, to: 7, weeks: 2 }, "2026-11-19");
    expect(same.current).toBe(0);
    expect(same.history).toEqual(history);
  });
  it("textos por semana", () => {
    expect(stepRuleText({ title: "x", perWeek: 3, weeks: 2 }, plain, false)).toBe("3 días por semana · 2 semanas seguidas para subir");
    expect(stepRuleText({ title: "x", weeks: 1 }, plain, false)).toBe("Todos los días · 1 semana para subir");
    expect(stepRuleText({ title: "x", perWeek: 1, weeks: 2 }, plain, true)).toBe("1 día por semana · la meta");
  });
});

describe("el escalón cambia el hábito", () => {
  const h = { frequency: "daily", timesPerWeek: 1, target: 1, unit: null, weekdays: [] };
  it("días por semana: pasa a N veces por semana; 7 = todos los días", () => {
    expect(stepConfig({ title: "x", perWeek: 3, weeks: 2 }, h)).toEqual({ frequency: "weekly", timesPerWeek: 3, weekdays: [] });
    expect(stepConfig({ title: "x", perWeek: 7, weeks: 2 }, h)).toBeNull();
    expect(stepConfig({ title: "x", perWeek: 7, weeks: 2 }, { ...h, frequency: "weekly", timesPerWeek: 4 })).toEqual({ frequency: "daily", weekdays: [] });
    expect(stepConfig({ title: "x", perWeek: 4, weeks: 2 }, { ...h, frequency: "weekly", timesPerWeek: 4 })).toBeNull();
  });
  it("meta numérica solo en hábitos de cantidad; sin días queda la frecuencia", () => {
    expect(stepConfig({ title: "x", target: 10, weeks: 2 }, { ...h, target: 20, unit: "páginas" })).toEqual({ target: 10 });
    expect(stepConfig({ title: "x", target: 10, weeks: 2 }, h)).toBeNull();
  });
});

// Escalones de 3 días por semana, 2 semanas seguidas para subir. 2026-11-02 es lunes.
const base: Ladder = {
  goal: "Gym 4 veces por semana",
  steps: [
    { title: "Gym 2 veces", perWeek: 2, weeks: 2 },
    { title: "Gym 3 veces", perWeek: 3, weeks: 2 },
    { title: "Gym 4 veces por semana", perWeek: 4, weeks: 2 },
  ],
  current: 0,
  stepStart: "2026-11-02",
};
const opts = { frequency: "weekly", timesPerWeek: 2, weekStart: 1 };
const doneOn = (...days: string[]) => {
  const set = new Set(days);
  return (d: string) => set.has(d);
};

describe("progreso del escalón, por semanas", () => {
  it("dos semanas seguidas cumplidas: se puede subir", () => {
    const p = stepProgress(base, doneOn("2026-11-03", "2026-11-05", "2026-11-10", "2026-11-12"), "2026-11-17", opts);
    expect(p.perWeek).toBe(2);
    expect(p.weeks.map((w) => w.met)).toEqual([true, true, null]);
    expect(p.streak).toBe(2);
    expect(p.ready).toBe(true);
    expect(p.weeksLeft).toBe(0);
    expect(p.thisWeek.days).toHaveLength(7);
    expect(p.thisWeek.days[0].date).toBe("2026-11-16");
    expect(p.thisWeek.days[2].future).toBe(true);
  });
  it("la semana en curso cuenta cuando ya se cumplió; una semana mala corta", () => {
    const p = stepProgress(base, doneOn("2026-11-03", "2026-11-05", "2026-11-16", "2026-11-17"), "2026-11-17", opts);
    expect(p.weeks.map((w) => w.met)).toEqual([true, false, true]);
    expect(p.streak).toBe(1);
    expect(p.ready).toBe(false);
    expect(p.weeksLeft).toBe(1);
    expect(p.thisWeek).toMatchObject({ done: 2, need: 2 });
  });
  it("si el escalón arrancó a mitad de semana, esa semana pide menos", () => {
    const p = stepProgress({ ...base, current: 1, stepStart: "2026-11-06" }, doneOn("2026-11-07", "2026-11-09", "2026-11-10", "2026-11-11"), "2026-11-17", opts);
    expect(p.weeks[0]).toMatchObject({ start: "2026-11-02", need: 2, done: 1, met: false });
    expect(p.weeks[1]).toMatchObject({ need: 3, done: 3, met: true });
  });
  it("pospuesto una semana no ofrece subir", () => {
    const l = snoozeWeek(base, "2026-11-15");
    expect(l.snoozeUntil).toBe("2026-11-22");
    expect(stepProgress(l, () => true, "2026-11-20", opts).ready).toBe(false);
    expect(stepProgress(l, () => true, "2026-11-23", opts).ready).toBe(true);
  });
  it("cuesta: las dos últimas semanas terminadas no se cumplieron", () => {
    expect(stepProgress(base, () => false, "2026-11-17", opts).struggling).toBe(true);
    expect(stepProgress(base, () => false, "2026-11-12", opts).struggling).toBe(false);
  });
  it("en la meta no hay que subir", () => {
    const p = stepProgress({ ...base, current: 2 }, () => true, "2026-11-30", opts);
    expect(p.atGoal).toBe(true);
    expect(p.ready).toBe(false);
  });
  it("aviso: solo el día que pasa a estar listo", () => {
    const done = doneOn("2026-11-03", "2026-11-05", "2026-11-10", "2026-11-12");
    expect(becameReady(base, done, "2026-11-12", opts)).toBe(true);
    expect(becameReady(base, done, "2026-11-13", opts)).toBe(false);
    expect(becameReady(base, done, "2026-11-11", opts)).toBe(false);
  });
  it("semana a semana con el escalón de cada una", () => {
    const l = advance(base, "2026-11-16");
    const w = ladderWeeks(l, doneOn("2026-11-03", "2026-11-05", "2026-11-10", "2026-11-12", "2026-11-16"), "2026-11-17", opts);
    expect(w.map((x) => [x.start, x.step, x.need, x.done])).toEqual([
      ["2026-11-02", 0, 2, 2],
      ["2026-11-09", 0, 2, 2],
      ["2026-11-16", 1, 3, 1],
    ]);
    expect(spanWeeks("2026-11-02", "2026-11-15")).toBe(2);
  });
});

describe("subir y bajar", () => {
  it("sube guardando el tramo y no pasa de la meta", () => {
    const a = advance({ ...base, snoozeUntil: "2026-11-20" }, "2026-11-15");
    expect(a.current).toBe(1);
    expect(a.stepStart).toBe("2026-11-15");
    expect(a.snoozeUntil).toBeNull();
    expect(a.history).toEqual([{ step: 0, from: "2026-11-02", to: "2026-11-14" }]);
    const b = advance(advance(a, "2026-11-20"), "2026-11-25");
    expect(b.current).toBe(2);
    expect(b.history).toHaveLength(2);
  });
  it("baja sin pasar del primero", () => {
    expect(stepBack(base, "2026-11-15")).toBe(base);
    expect(stepBack({ ...base, current: 2 }, "2026-11-15").current).toBe(1);
  });
  it("lee lo guardado", () => {
    expect(parseLadder(JSON.stringify(base))).toEqual({ ...base, snoozeUntil: null });
    expect(parseLadder({ ...base, current: 9 })?.current).toBe(2);
    expect(parseLadder({ ...base, steps: [] })).toBeNull();
    expect(parseLadder({ ...base, steps: [{ title: "x", perWeek: 9, weeks: 20 }] })?.steps[0]).toEqual({ title: "x", perWeek: 7, weeks: 8 });
    expect(parseLadder(null)).toBeNull();
  });
  it("pasa los escalones viejos (N de M días) a semanas", () => {
    const old = parseLadder({
      ...base,
      steps: [
        { title: "Algunos días", need: 4, window: 14 },
        { title: "Leer 5", need: 7, window: 10, target: 5 },
        { title: "Meta", need: 10, window: 14 },
      ],
    });
    expect(old?.steps).toEqual([
      { title: "Algunos días", perWeek: 2, weeks: 2 },
      { title: "Leer 5", target: 5, weeks: 1 },
      { title: "Meta", perWeek: 5, weeks: 2 },
    ]);
  });
});

describe("nunca dos seguidos", () => {
  const map = (m: Record<string, "done" | "failed" | "open" | null>) => (d: string) => m[d] ?? null;
  it("ayer falló: hoy importa; recuperaciones", () => {
    const st = map({
      "2026-11-01": "done",
      "2026-11-02": "failed",
      "2026-11-03": "done",
      "2026-11-04": "failed",
      "2026-11-05": "open",
    });
    const r = neverTwiceStats(st, "2026-11-01", "2026-11-05");
    expect(r.failedYesterday).toBe(true);
    expect(r.failedTwice).toBe(false);
    expect(r.recoveries).toBe(1);
    expect(r.daysWithoutTwo).toBe(5);
  });
  it("dos seguidos reinician los días sin dos", () => {
    const st = map({
      "2026-11-01": "failed",
      "2026-11-02": "failed",
      "2026-11-03": "done",
      "2026-11-04": "done",
      "2026-11-05": "done",
    });
    const r = neverTwiceStats(st, "2026-11-01", "2026-11-05");
    expect(r.failedYesterday).toBe(false);
    expect(r.daysWithoutTwo).toBe(3);
    expect(r.recoveries).toBe(1);
  });
  it("ayer y anteayer fallaron", () => {
    const st = map({ "2026-11-03": "failed", "2026-11-04": "failed", "2026-11-05": "open" });
    const r = neverTwiceStats(st, "2026-11-01", "2026-11-05");
    expect(r.failedTwice).toBe(true);
    expect(r.failedYesterday).toBe(true);
  });
  it("hecho hoy después de fallar ya cuenta como recuperación", () => {
    const r = neverTwiceStats(map({ "2026-11-04": "failed", "2026-11-05": "done" }), "2026-11-04", "2026-11-05");
    expect(r.failedYesterday).toBe(false);
    expect(r.recoveries).toBe(1);
  });
  it("con días que no tocan en el medio, siguen siendo seguidos", () => {
    const r = neverTwiceStats(map({ "2026-11-02": "failed", "2026-11-04": "failed", "2026-11-06": "open" }), "2026-11-01", "2026-11-06");
    expect(r.failedTwice).toBe(true);
  });
  it("con las marcas de un hábito diario", () => {
    const h = { id: "h", frequency: "daily" as const, weekdays: [], timesPerWeek: 1, weekStart: 1, target: 1, startDate: "2026-11-01" };
    const logs: LogMap = {};
    for (let d = "2026-11-01"; d <= "2026-11-10"; d = addDays(d, 1)) logs[d] = { s: "done", v: 1 };
    logs["2026-11-05"] = { s: "failed", v: 0 };
    delete logs["2026-11-09"]; // pasado sin marcar: falló
    delete logs["2026-11-10"];
    const r = habitNeverTwice(h, logs, "2026-11-10");
    expect(r.recoveries).toBe(1);
    expect(r.failedYesterday).toBe(true);
    expect(r.daysWithoutTwo).toBe(10);
  });
});

describe("aviso de hábitos sin marcar", () => {
  it("los de nunca dos seguidos que fallaron ayer van primero", async () => {
    const { habitsMessage } = await import("@/lib/reminder-logic");
    const m = habitsMessage(["Leer", "Meditar", "Gym"], 1, 4, ["Gym"]);
    expect(m?.body).toBe("Hoy importa: Gym · también Leer y Meditar · llevás 1 de 4");
    expect(habitsMessage(["Leer"], 0, 1)?.body).toBe("Leer · llevás 0 de 1");
  });
});

describe("aviso de subir de paso", () => {
  it("uno o varios", async () => {
    const { ladderMessage } = await import("@/lib/reminder-logic");
    expect(ladderMessage([])).toBeNull();
    expect(ladderMessage([{ name: "Gym", weeks: 2, next: "4 días por semana" }])).toMatchObject({
      title: "Gym: ¿subís un paso?",
      body: "Cumpliste 2 semanas seguidas. ¿Pasás a 4 días por semana?",
    });
    expect(ladderMessage([{ name: "Gym", weeks: 1, next: "todos los días" }])?.body).toBe("Cumpliste 1 semana. ¿Pasás a todos los días?");
    expect(ladderMessage([{ name: "Gym", weeks: 2, next: "a" }, { name: "Leer", weeks: 2, next: "a" }])?.body).toBe("Gym y Leer");
  });
});
