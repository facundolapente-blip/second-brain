import { describe, expect, it } from "vitest";
import {
  advance,
  becameReady,
  goalKindOf,
  habitNeverTwice,
  ladderWeeks,
  neverTwiceStats,
  parseLadder,
  snoozeWeek,
  spanWeeks,
  stepBack,
  stepConfig,
  stepProgress,
  stepRuleText,
  suggestSteps,
  type Ladder,
} from "@/lib/habit-ladder";
import { addDays } from "@/lib/dates";
import type { LogMap } from "@/lib/habit-logic";

const plain = { frequency: "daily", target: 1, unit: null, isQuit: false };

describe("sugerencias de escalones", () => {
  it("cantidad con horas: 15, 30, 45 min y 1 hora, 2 semanas cada uno", () => {
    const goal = "Dejar el celular 1 hora antes de dormir";
    expect(goalKindOf(goal, plain)).toBe("amount");
    const s = suggestSteps(goal, plain);
    expect(s.map((x) => x.title)).toEqual([
      "Dejar el celular 15 min antes de dormir",
      "Dejar el celular 30 min antes de dormir",
      "Dejar el celular 45 min antes de dormir",
      goal,
    ]);
    expect(s.every((x) => x.weeks === 2 && !x.perWeek && !x.target)).toBe(true);
  });
  it("páginas, con meta numérica si el hábito es de cantidad", () => {
    const s = suggestSteps("Leer 20 páginas", { frequency: "daily", target: 20, unit: "páginas", isQuit: false });
    expect(s.map((x) => x.title)).toEqual(["Leer 5 páginas", "Leer 10 páginas", "Leer 15 páginas", "Leer 20 páginas"]);
    expect(s.map((x) => x.target)).toEqual([5, 10, 15, 20]);
  });
  it("veces por semana: 1, 2, 3 y 4 días por semana", () => {
    const goal = "Gym 4 veces por semana";
    expect(goalKindOf(goal, plain)).toBe("frequency");
    const s = suggestSteps(goal, plain);
    expect(s.map((x) => x.title)).toEqual(["Gym 1 vez por semana", "Gym 2 veces por semana", "Gym 3 veces por semana", goal]);
    expect(s.map((x) => x.perWeek)).toEqual([1, 2, 3, 4]);
  });
  it("dejar algo: 2, 4 y todos los días sin hacerlo", () => {
    expect(goalKindOf("No fumar", plain)).toBe("quit");
    expect(goalKindOf("Fumar menos", { ...plain, isQuit: true })).toBe("quit");
    const s = suggestSteps("No fumar", plain);
    expect(s.map((x) => x.perWeek)).toEqual([2, 4, 7]);
    expect(s[2].title).toBe("No fumar");
  });
  it("sin números: versión mínima, media y la meta", () => {
    expect(goalKindOf("Meditar", plain)).toBe("plain");
    const s = suggestSteps("Meditar", plain);
    expect(s[0].title.startsWith("Versión mínima:")).toBe(true);
    expect(s[s.length - 1].title).toBe("Meditar");
  });
  it("siempre de 3 a 5 escalones y el último es la meta", () => {
    for (const g of ["Correr 5 km", "Meditar 10 min", "Leer 2 páginas", "Agua 7 veces por semana", "Estirar"]) {
      const s = suggestSteps(g, plain);
      expect(s.length).toBeGreaterThanOrEqual(3);
      expect(s.length).toBeLessThanOrEqual(5);
      expect(s[s.length - 1].title).toBe(g);
    }
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
  it("lee lo guardado, con para qué y cuándo", () => {
    expect(parseLadder(JSON.stringify(base))).toEqual({ ...base, snoozeUntil: null, why: null, cue: null });
    expect(parseLadder({ ...base, why: " Dormir mejor ", cue: "Después de cenar" })).toMatchObject({ why: "Dormir mejor", cue: "Después de cenar" });
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

describe("aviso de escalones", () => {
  it("uno o varios", async () => {
    const { ladderMessage } = await import("@/lib/reminder-logic");
    expect(ladderMessage([])).toBeNull();
    expect(ladderMessage([{ name: "Gym", weeks: 2, next: "Gym 3 veces", rule: "3 días por semana" }])).toMatchObject({
      title: "Gym: ¿subís de escalón?",
      body: "Cumpliste 2 semanas seguidas. El próximo: Gym 3 veces (3 días por semana).",
    });
    expect(ladderMessage([{ name: "Gym", weeks: 2, next: "a", rule: "b" }, { name: "Leer", weeks: 2, next: "a", rule: "b" }])?.body).toBe("Gym y Leer");
  });
});
