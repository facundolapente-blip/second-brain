import { describe, expect, it } from "vitest";
import {
  bestStreak,
  currentStreak,
  dayProgress,
  dayState,
  habitDayMark,
  habitScore,
  packLogs,
  periodSummary,
  unpackLogs,
  type HabitRule,
  type LogMap,
} from "@/lib/habit-logic";
import {
  doneParts,
  newPartLadder,
  orderParts,
  parseParts,
  partNumbers,
  partPlanError,
  partProgress,
  partsMark,
  partsStats,
  partStepLine,
  replanPart,
  type HabitPart,
} from "@/lib/habit-parts";
import { addDays } from "@/lib/dates";

const rule = (p: Partial<HabitRule> = {}): HabitRule & { id: string } => ({
  id: "h",
  frequency: "daily",
  weekdays: [],
  timesPerWeek: 1,
  target: 1,
  startDate: "2026-11-01",
  weekStart: 1,
  ...p,
});

const PARTS: HabitPart[] = [
  { id: "a", name: "Sin celular a la mañana", moment: "morning", since: "2026-11-01", ladder: null },
  { id: "b", name: "Sin celular antes de dormir", moment: "night", since: "2026-11-01", ladder: null },
  { id: "c", name: "Apagarlo", moment: "night", since: "2026-11-01", ladder: null },
];

/** Una marca de un día con esas partes hechas (como la guarda el servidor). */
function day(ids: string[], of = 3) {
  const m = partsMark(PARTS.slice(0, of).map((p) => p.id), ids);
  if (!m.status) return undefined;
  return { s: m.status, v: m.value, p: { d: m.parts!.done, t: m.parts!.of } } as const;
}

describe("la marca de un día por partes", () => {
  it("todas = hecho, algunas = a medias, ninguna = sin marca", () => {
    expect(partsMark(["a", "b", "c"], ["a", "b", "c"])).toEqual({ status: "done", value: 3, parts: { done: ["a", "b", "c"], of: 3 } });
    expect(partsMark(["a", "b", "c"], ["c", "a"])).toEqual({ status: "none", value: 2, parts: { done: ["a", "c"], of: 3 } });
    expect(partsMark(["a", "b", "c"], [])).toEqual({ status: null, value: 0, parts: null });
    // Ids que ya no existen no cuentan.
    expect(partsMark(["a", "b"], ["a", "zz"]).value).toBe(1);
  });
  it("se ve a medias, distinto de hecho, fallado y sin marcar", () => {
    const h = rule();
    const logs: LogMap = { "2026-11-10": day(["a", "b"])!, "2026-11-11": day(["a", "b", "c"])! };
    expect(dayState(h, logs, "2026-11-10", "2026-11-15")).toBe("partial");
    expect(dayState(h, logs, "2026-11-11", "2026-11-15")).toBe("done");
    expect(dayState(h, logs, "2026-11-12", "2026-11-15")).toBe("unmarked");
  });
  it("las partes hechas de un día", () => {
    expect(doneParts(day(["b"]), PARTS)).toEqual(["b"]);
    expect(doneParts({ s: "done", v: 1 }, PARTS)).toEqual(["a", "b", "c"]);
    expect(doneParts({ s: "skipped", v: 1 }, PARTS)).toEqual([]);
  });
});

describe("racha y puntaje con días a medias", () => {
  const h = rule({ startDate: "2026-11-10" });
  // 10 hecho, 11 a medias, 12 hecho, 13 hecho; hoy 14 sin marcar.
  const logs: LogMap = {
    "2026-11-10": day(["a", "b", "c"])!,
    "2026-11-11": day(["a", "b"])!,
    "2026-11-12": day(["a", "b", "c"])!,
    "2026-11-13": day(["a", "b", "c"])!,
  };
  it("a medias no corta la racha, pero tampoco la suma", () => {
    expect(currentStreak(h, logs, "2026-11-14")).toBe(3);
    expect(bestStreak(h, logs, "2026-11-14")).toBe(3);
  });
  it("el puntaje cuenta la parte hecha (2 de 3 = 0,67)", () => {
    // (1 + 0,667 + 1 + 1) / 4 = 91,7 %
    expect(habitScore(h, logs, "2026-11-14")).toBe(92);
  });
  it("a medias no es logrado ni incompleto", () => {
    expect(periodSummary(h, logs, "2026-11-14")).toEqual({ achieved: 3, missed: 0 });
  });
  it("en el avance del día no está hecho; hoy sigue abierto y un día pasado cuenta como no hecho", () => {
    const withToday = { ...logs, "2026-11-14": day(["a"])! };
    expect(dayProgress([h], { h: withToday }, "2026-11-14", "2026-11-14")).toEqual({ done: 0, total: 1 });
    expect(habitDayMark(h, withToday, "2026-11-14", "2026-11-14")).toBe("open");
    expect(habitDayMark(h, withToday, "2026-11-11", "2026-11-14")).toBe("missed");
    expect(habitDayMark(h, withToday, "2026-11-12", "2026-11-14")).toBe("done");
  });
  it("un hábito común con un día a medias de cantidad sigue igual (corta la racha y no suma)", () => {
    const q = rule({ startDate: "2026-11-10", target: 8 });
    const ql: LogMap = { "2026-11-12": { s: "done", v: 8 }, "2026-11-13": { s: "done", v: 3 } };
    expect(currentStreak(q, ql, "2026-11-14")).toBe(0);
    expect(habitScore(q, ql, "2026-11-14")).toBe(25);
  });
  it("semanales: los días a medias suman su parte al puntaje", () => {
    const w = rule({ frequency: "weekly", timesPerWeek: 2, startDate: "2026-11-02" });
    // Semana del 2: un hecho y un a medias (2/3) → (1 + 0,67) / 2 = 0,83. Semana del 9: dos hechos.
    const wl: LogMap = {
      "2026-11-03": day(["a", "b", "c"])!,
      "2026-11-05": day(["a", "b"])!,
      "2026-11-10": day(["a", "b", "c"])!,
      "2026-11-11": day(["a", "b", "c"])!,
    };
    expect(habitScore(w, wl, "2026-11-16")).toBe(92);
  });
});

describe("marcas compactas con partes", () => {
  it("van y vuelven igual", () => {
    const logs: LogMap = {
      "2026-11-10": day(["a", "b"])!,
      "2026-11-11": { ...day(["a", "b", "c"])!, n: "bien" },
      "2026-11-12": { s: "failed", v: 1 },
    };
    expect(unpackLogs(packLogs(logs))).toEqual(logs);
  });
  it("un día con nota y sin partes sigue siendo solo nota", () => {
    const logs: LogMap = { "2026-11-10": { s: "none", v: 0, n: "x" } };
    expect(unpackLogs(packLogs(logs))).toEqual(logs);
  });
});

describe("las partes guardadas", () => {
  it("se leen en el orden del día (primero la mañana) y descartan lo roto", () => {
    const parts = parseParts([
      { id: "n", name: "Apagarlo", moment: "night", since: "2026-11-01" },
      { id: "m", name: "Tender la cama", moment: "morning", since: "2026-11-01" },
      { id: "x", name: "  " },
      { id: "n", name: "Repetida" },
    ]);
    expect(parts?.map((p) => p.id)).toEqual(["m", "n"]);
    expect(parseParts([])).toBeNull();
    expect(parseParts(null)).toBeNull();
    expect(orderParts(PARTS).map((p) => p.id)).toEqual(["a", "b", "c"]);
  });
});

describe("la escalera de una parte", () => {
  it("números de a cuánto sube", () => {
    expect(partNumbers(15, 60, 15)).toEqual([15, 30, 45, 60]);
    expect(partNumbers(10, 25, 10)).toEqual([10, 20, 25]);
    expect(partPlanError({ from: 15, to: 60, by: 15, unit: "min", weeks: 2 })).toBeNull();
    expect(partPlanError({ from: 60, to: 15, by: 15, unit: "min", weeks: 2 })).not.toBeNull();
    expect(partPlanError({ from: 1, to: 100, by: 1, unit: "páginas", weeks: 2 })).toMatch(/Como mucho/);
  });
  it("cumplir 2 semanas seguidas la deja lista para subir (la app pregunta)", () => {
    const ladder = newPartLadder({ from: 15, to: 60, by: 15, unit: "min", weeks: 2 }, "2026-11-02");
    const part: HabitPart = { ...PARTS[1], ladder };
    const h = rule({ startDate: "2026-11-02" });
    const logs: LogMap = {};
    for (let i = 0; i < 14; i++) logs[addDays("2026-11-02", i)] = day(["b"])!;
    expect(partProgress(part, h, logs, "2026-11-15")?.ready).toBe(true);
    // Una semana sola no alcanza.
    expect(partProgress(part, h, logs, "2026-11-08")?.ready).toBe(false);
    // Si falta un día de la parte esa semana, no se cumplió.
    const missing = { ...logs };
    delete missing["2026-11-11"];
    expect(partProgress(part, h, missing, "2026-11-15")?.ready).toBe(false);
    expect(partStepLine(ladder)).toBe("Paso 1 de 4 · 15 min");
  });
  it("cambiar el plan conserva el paso y desde cuándo si el número sigue", () => {
    const l = { ...newPartLadder({ from: 15, to: 60, by: 15, unit: "min", weeks: 2 }, "2026-11-02"), current: 1, stepStart: "2026-11-09" };
    const sameNumbers = replanPart(l, { from: 15, to: 60, by: 15, unit: "min", weeks: 3 }, "2026-11-19");
    expect(sameNumbers.current).toBe(1);
    expect(sameNumbers.stepStart).toBe("2026-11-09");
    expect(sameNumbers.steps[0].weeks).toBe(3);
    const longer = replanPart(l, { from: 10, to: 90, by: 10, unit: "min", weeks: 2 }, "2026-11-19");
    expect(longer.steps[longer.current].target).toBe(30);
    expect(longer.stepStart).toBe("2026-11-09");
  });
});

describe("cifras por parte", () => {
  it("días completos, a medias y sin ninguna, y la que más cuesta", () => {
    const h = { ...rule({ startDate: "2026-10-01" }), parts: PARTS };
    const logs: LogMap = {};
    for (let i = 0; i < 10; i++) logs[addDays("2026-11-05", i)] = day(i % 2 ? ["a", "b", "c"] : ["a", "b"])!;
    const st = partsStats(h, logs, "2026-11-14", 10);
    expect(st).toMatchObject({ days: 10, complete: 5, partial: 5, none: 0 });
    expect(st.parts.map((p) => p.done)).toEqual([10, 10, 5]);
    expect(st.hardest).toBe("c");
  });
});
