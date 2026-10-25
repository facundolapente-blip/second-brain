import { describe, expect, it } from "vitest";
import { childrenOf, descendantsOf, nextStep, nodePct, rootsOf, splitPast, stepCount, treeOrder, treePct, whenLabel } from "@/lib/objective-tree";
import type { KeyResultDTO, ObjectiveDTO, StepDTO } from "@/lib/plan-logic";

let n = 0;
const step = (over: Partial<StepDTO> = {}): StepDTO => ({ id: `s${++n}`, keyResultId: "k", title: `t${n}`, done: false, order: n, blockId: null, date: null, startTime: null, ...over });
const kr = (id: string, over: Partial<KeyResultDTO> = {}): KeyResultDTO => ({
  id,
  objectiveId: "o",
  title: id,
  kind: "activity",
  status: "todo",
  quarters: [],
  deadline: null,
  progress: null,
  goal: null,
  link: null,
  auto: null,
  parentId: null,
  steps: [],
  ...over,
});
const objective = (keyResults: KeyResultDTO[], over: Partial<ObjectiveDTO> = {}): ObjectiveDTO => ({
  id: "o",
  title: "Vivir de la música",
  year: 2026,
  role: null,
  area: null,
  priority: 0,
  deadline: null,
  status: "doing",
  progress: null,
  goal: null,
  focus: [],
  keyResults,
  ...over,
});

describe("árbol de objetivos", () => {
  // Vivir de la música → Terminar 4 temas (2 de 4 tareas) y Mezcla (0 de 2, con un más chico: Máster, 1 de 1).
  const temas = kr("temas", { steps: [step({ done: true }), step({ done: true }), step(), step()] });
  const mezcla = kr("mezcla", { steps: [step(), step()] });
  const master = kr("master", { parentId: "mezcla", steps: [step({ done: true })] });
  const all = [temas, mezcla, master];

  it("raíces, hijos y todo lo que sale de uno", () => {
    expect(rootsOf(all).map((k) => k.id)).toEqual(["temas", "mezcla"]);
    expect(childrenOf(all, "mezcla").map((k) => k.id)).toEqual(["master"]);
    expect(descendantsOf(all, "mezcla").map((k) => k.id)).toEqual(["master"]);
    expect(treeOrder(all).map((k) => k.id)).toEqual(["temas", "mezcla", "master"]);
  });

  it("un objetivo chico cuyo padre ya no está cuelga del objetivo grande", () => {
    expect(rootsOf([kr("x", { parentId: "borrado" })]).map((k) => k.id)).toEqual(["x"]);
  });

  it("el avance sube solo: tareas → objetivo chico → objetivo grande", () => {
    expect(nodePct(all, temas)).toBe(50);
    // Mezcla: dos tareas sin hacer (0, 0) y Máster al 100 % → 1/3.
    expect(nodePct(all, mezcla)).toBe(33);
    expect(treePct(objective(all))).toBe(42);
  });

  it("2/4 cuenta también las tareas de los más chicos", () => {
    expect(stepCount(all, temas)).toEqual({ done: 2, total: 4 });
    expect(stepCount(all, mezcla)).toEqual({ done: 1, total: 3 });
  });

  it("sin tareas ni hijos vale lo de siempre (meta a mano o completado)", () => {
    expect(nodePct([kr("a", { progress: 3, goal: 10 })], kr("a", { progress: 3, goal: 10 }))).toBe(30);
    expect(nodePct([kr("a", { status: "done" })], kr("a", { status: "done" }))).toBe(100);
    expect(nodePct([kr("a")], kr("a"))).toBeNull();
  });

  it("sin objetivos chicos, el objetivo grande usa su meta propia; terminado es 100", () => {
    expect(treePct(objective([], { progress: 1, goal: 4 }))).toBe(25);
    expect(treePct(objective(all, { status: "done" }))).toBe(100);
  });

  it("un ciclo no cuelga la cuenta", () => {
    const a = kr("a", { parentId: "b", steps: [step({ done: true })] });
    const b = kr("b", { parentId: "a" });
    expect(() => nodePct([a, b], a)).not.toThrow();
    expect(descendantsOf([a, b], "a").map((k) => k.id)).toEqual(["b"]);
  });

  it("la próxima tarea: la agendada más cercana desde hoy; si no, la primera sin día; si no, la vencida más reciente", () => {
    const T = "2026-10-25";
    const x = kr("x", { steps: [step({ title: "vieja", date: "2026-10-04" }), step({ title: "sin día" }), step({ title: "jueves", date: "2026-10-29" }), step({ title: "lunes", date: "2026-10-26", startTime: "18:00" })] });
    expect(nextStep(objective([x]), T)?.title).toBe("lunes");
    const y = kr("y", { steps: [step({ title: "hecha", done: true }), step({ title: "vieja", date: "2026-10-04" }), step({ title: "primera" })] });
    expect(nextStep(objective([y]), T)).toMatchObject({ title: "primera", goal: "y" });
    const z = kr("z", { steps: [step({ title: "4 oct", date: "2026-10-04" }), step({ title: "20 oct", date: "2026-10-20" })] });
    expect(nextStep(objective([z]), T)?.title).toBe("20 oct");
    expect(nextStep(objective([kr("w", { steps: [step({ done: true })] })]), T)).toBeNull();
  });

  it("los de trimestres que ya pasaron van aparte", () => {
    const list = [kr("q1", { quarters: ["Q1"] }), kr("q3q4", { quarters: ["Q3", "Q4"] }), kr("libre"), kr("q2", { quarters: ["Q2", "Q3"] })];
    const r = splitPast(list, 2026, "2026-10-25");
    expect(r.now.map((k) => k.id)).toEqual(["q3q4", "libre"]);
    expect(r.past.map((k) => k.id)).toEqual(["q1", "q2"]);
    expect(splitPast(list, 2025, "2026-10-25").now).toEqual([]);
    expect(splitPast(list, 2027, "2026-10-25").past).toEqual([]);
  });

  it("el día de una tarea agendada", () => {
    expect(whenLabel("2026-10-25", null, "2026-10-25")).toBe("hoy");
    expect(whenLabel("2026-10-26", "18:00", "2026-10-25")).toBe("mañana · 18:00");
    expect(whenLabel("2026-10-29", null, "2026-10-25")).toBe("jue 29");
    expect(whenLabel("2026-10-04", "11:00", "2026-10-25")).toBe("4 oct · 11:00");
  });
});
