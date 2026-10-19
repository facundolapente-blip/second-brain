import { describe, expect, it } from "vitest";
import {
  avgPct,
  effectiveKr,
  isFinishedKr,
  krPct,
  krQuarters,
  nextQuarter,
  objectivePct,
  previousQuarter,
  quarterOf,
  quarterRange,
  quarterReviewQuestions,
  quarterReviewTemplate,
  reviewQuarter,
  type KeyResultDTO,
  type ObjectiveDTO,
  boardTasks,
} from "@/lib/plan-logic";
import type { TaskDTO } from "@/lib/plan-logic";

const TODAY = "2026-10-19";

let n = 0;
const kr = (over: Partial<KeyResultDTO> = {}): KeyResultDTO => ({
  id: `kr${++n}`,
  objectiveId: null,
  title: `kr${n}`,
  kind: "activity",
  status: "todo",
  quarters: [],
  deadline: null,
  progress: null,
  goal: null,
  link: null,
  auto: null,
  ...over,
});

const objective = (over: Partial<ObjectiveDTO> = {}): ObjectiveDTO => ({
  id: `o${++n}`,
  title: `o${n}`,
  year: 2026,
  role: null,
  area: null,
  priority: 0,
  deadline: null,
  status: "todo",
  progress: null,
  goal: null,
  keyResults: [],
  ...over,
});

describe("trimestres", () => {
  it("quarterOf: el trimestre de un día", () => {
    expect(quarterOf(TODAY)).toBe("Q4");
    expect(quarterOf("2026-01-01")).toBe("Q1");
    expect(quarterOf("2026-03-31")).toBe("Q1");
    expect(quarterOf("2026-04-01")).toBe("Q2");
    expect(quarterOf("2026-06-30")).toBe("Q2");
    expect(quarterOf("2026-07-01")).toBe("Q3");
    expect(quarterOf("2026-09-30")).toBe("Q3");
    expect(quarterOf("2026-10-01")).toBe("Q4");
    expect(quarterOf("2026-12-31")).toBe("Q4");
  });

  it("quarterRange: primer y último día de cada trimestre", () => {
    expect(quarterRange(2026, "Q1")).toEqual({ from: "2026-01-01", to: "2026-03-31" });
    expect(quarterRange(2026, "Q2")).toEqual({ from: "2026-04-01", to: "2026-06-30" });
    expect(quarterRange(2026, "Q3")).toEqual({ from: "2026-07-01", to: "2026-09-30" });
    expect(quarterRange(2026, "Q4")).toEqual({ from: "2026-10-01", to: "2026-12-31" });
  });

  it("nextQuarter: el Q4 pasa al Q1 del año siguiente", () => {
    expect(nextQuarter(2026, "Q1")).toEqual({ year: 2026, quarter: "Q2" });
    expect(nextQuarter(2026, "Q3")).toEqual({ year: 2026, quarter: "Q4" });
    expect(nextQuarter(2026, "Q4")).toEqual({ year: 2027, quarter: "Q1" });
  });

  it("previousQuarter: el anterior al de hoy (del Q1 vuelve al Q4 del año pasado)", () => {
    expect(previousQuarter(TODAY)).toEqual({ year: 2026, quarter: "Q3" });
    expect(previousQuarter("2026-05-15")).toEqual({ year: 2026, quarter: "Q1" });
    expect(previousQuarter("2026-01-05")).toEqual({ year: 2025, quarter: "Q4" });
  });
});

describe("krQuarters", () => {
  it("usa los trimestres marcados (y descarta lo que no es trimestre)", () => {
    expect(krQuarters({ quarters: ["Q1", "Q3"], deadline: "2026-12-01" })).toEqual(["Q1", "Q3"]);
    expect(krQuarters({ quarters: ["Q2", "otro"], deadline: null })).toEqual(["Q2"]);
  });

  it("sin marcados: el del deadline menos un día (Notion pone el 1° del trimestre siguiente)", () => {
    expect(krQuarters({ quarters: [], deadline: "2026-07-01" })).toEqual(["Q2"]);
    expect(krQuarters({ quarters: [], deadline: "2026-10-01" })).toEqual(["Q3"]);
    expect(krQuarters({ quarters: [], deadline: "2026-07-02" })).toEqual(["Q3"]);
    // El 1° de enero es del Q4 del año anterior.
    expect(krQuarters({ quarters: [], deadline: "2027-01-01" })).toEqual(["Q4"]);
  });

  it("sin marcados ni deadline: ninguno", () => {
    expect(krQuarters({ quarters: [], deadline: null })).toEqual([]);
    expect(krQuarters({ quarters: ["nada"], deadline: null })).toEqual([]);
  });
});

describe("avance de resultados clave", () => {
  it("effectiveKr: sin vínculo queda igual; con vínculo toma su progreso y meta", () => {
    const a = kr({ progress: 2, goal: 4 });
    expect(effectiveKr(a)).toBe(a);
    const b = kr({ progress: 1, goal: 10, auto: { progress: 7, goal: 8, label: "7 de 8" } });
    expect(effectiveKr(b)).toMatchObject({ progress: 7, goal: 8 });
    // Si el vínculo no trae meta, queda la cargada a mano.
    const c = kr({ progress: 1, goal: 10, auto: { progress: 5, goal: null, label: "5" } });
    expect(effectiveKr(c)).toMatchObject({ progress: 5, goal: 10 });
  });

  it("krPct: progreso / meta, con tope 100; sin meta null; done = 100", () => {
    expect(krPct(kr({ progress: 1, goal: 4 }))).toBe(25);
    expect(krPct(kr({ progress: 9, goal: 4 }))).toBe(100);
    expect(krPct(kr({ progress: null, goal: 4 }))).toBe(0);
    expect(krPct(kr({ progress: 3, goal: null }))).toBeNull();
    expect(krPct(kr({ status: "done" }))).toBe(100);
    expect(krPct(kr({ status: "done", progress: 1, goal: 4 }))).toBe(100);
  });

  it("krPct: usa auto si se mide solo", () => {
    expect(krPct(kr({ progress: 0, goal: 10, auto: { progress: 5, goal: 10, label: "" } }))).toBe(50);
    expect(krPct(kr({ auto: { progress: 3, goal: 4, label: "" } }))).toBe(75);
  });

  it("avgPct: promedio redondeado de los que tienen meta; ninguno = null", () => {
    expect(avgPct([kr({ progress: 1, goal: 4 }), kr({ progress: 1, goal: 2 }), kr({ goal: null })])).toBe(38);
    expect(avgPct([kr({ status: "done" }), kr({ progress: 0, goal: 5 })])).toBe(50);
    expect(avgPct([kr(), kr()])).toBeNull();
    expect(avgPct([])).toBeNull();
  });

  it("isFinishedKr: done y closed terminan; todo y doing no", () => {
    expect(isFinishedKr({ status: "done" })).toBe(true);
    expect(isFinishedKr({ status: "closed" })).toBe(true);
    expect(isFinishedKr({ status: "todo" })).toBe(false);
    expect(isFinishedKr({ status: "doing" })).toBe(false);
  });
});

describe("objectivePct", () => {
  const krs = [kr({ progress: 1, goal: 2 }), kr({ status: "done" })];

  it("con meta propia: progreso / meta (tope 100), sin mirar los resultados clave", () => {
    expect(objectivePct(objective({ progress: 1, goal: 4, keyResults: krs }))).toBe(25);
    expect(objectivePct(objective({ progress: 6, goal: 4 }))).toBe(100);
    expect(objectivePct(objective({ progress: null, goal: 4 }))).toBe(0);
  });

  it("sin meta: el promedio de sus resultados clave", () => {
    expect(objectivePct(objective({ keyResults: krs }))).toBe(75);
    expect(objectivePct(objective({ goal: 0, keyResults: krs }))).toBe(75);
    expect(objectivePct(objective({ keyResults: [] }))).toBeNull();
  });

  it("los resultados clave que se miden solos cuentan con su valor automático", () => {
    const auto = kr({ progress: 0, goal: 10, auto: { progress: 10, goal: 10, label: "" } });
    expect(objectivePct(objective({ keyResults: [auto, kr({ progress: 0, goal: 10 })] }))).toBe(50);
  });

  it("status done = 100", () => {
    expect(objectivePct(objective({ status: "done" }))).toBe(100);
    expect(objectivePct(objective({ status: "done", progress: 1, goal: 4 }))).toBe(100);
  });
});

describe("reviewQuarter", () => {
  it("últimos 10 días de un trimestre: ese trimestre", () => {
    expect(reviewQuarter("2026-09-21")).toEqual({ year: 2026, quarter: "Q3" });
    expect(reviewQuarter("2026-09-30")).toEqual({ year: 2026, quarter: "Q3" });
    expect(reviewQuarter("2026-03-31")).toEqual({ year: 2026, quarter: "Q1" });
    expect(reviewQuarter("2026-12-31")).toEqual({ year: 2026, quarter: "Q4" });
  });

  it("el 11.° día antes del fin (2026-09-20) todavía no", () => {
    expect(reviewQuarter("2026-09-20")).toBeNull();
  });

  it("2026-09-19 todavía no", () => {
    expect(reviewQuarter("2026-09-19")).toBeNull();
  });

  it("primeros 30 días del siguiente: el que terminó", () => {
    expect(reviewQuarter("2026-10-01")).toEqual({ year: 2026, quarter: "Q3" });
    expect(reviewQuarter(TODAY)).toEqual({ year: 2026, quarter: "Q3" });
    expect(reviewQuarter("2026-10-30")).toEqual({ year: 2026, quarter: "Q3" });
    expect(reviewQuarter("2026-10-31")).toBeNull();
  });

  it("en enero revisa el Q4 del año anterior", () => {
    expect(reviewQuarter("2026-01-05")).toEqual({ year: 2025, quarter: "Q4" });
    expect(reviewQuarter("2026-01-30")).toEqual({ year: 2025, quarter: "Q4" });
    expect(reviewQuarter("2026-01-31")).toBeNull();
  });

  it("a mitad de trimestre: null", () => {
    expect(reviewQuarter("2026-05-15")).toBeNull();
    expect(reviewQuarter("2026-08-10")).toBeNull();
  });
});

describe("revisión del trimestre: preguntas y plantilla", () => {
  it("la segunda pregunta cambia con cuántos quedaron sin terminar", () => {
    expect(quarterReviewQuestions(0, "Q4")[1]).toBe("¿Qué hizo que esta vez saliera todo?");
    expect(quarterReviewQuestions(1, "Q4")[1]).toBe("¿Qué frenó el que quedó sin terminar?");
    expect(quarterReviewQuestions(3, "Q4")[1]).toBe("¿Qué frenó los 3 que quedaron sin terminar?");
  });

  it("tres preguntas; la última nombra el trimestre siguiente", () => {
    const qs = quarterReviewQuestions(2, "Q1");
    expect(qs).toHaveLength(3);
    expect(qs[0]).toBe("¿Qué te ayudó a terminar lo que terminaste?");
    expect(qs[2]).toBe("¿Qué vas a hacer distinto en el Q1?");
  });

  it("plantilla: cada pregunta con dos renglones vacíos, sin vacíos al final", () => {
    const qs = quarterReviewQuestions(1, "Q4");
    expect(quarterReviewTemplate(1, "Q4")).toBe(`${qs[0]}\n\n\n${qs[1]}\n\n\n${qs[2]}`);
    expect(quarterReviewTemplate(1, "Q4").endsWith("?")).toBe(true);
  });
});

describe("boardTasks (tablero de tareas)", () => {
  const task = (over: Partial<TaskDTO>): TaskDTO => ({
    id: Math.random().toString(36).slice(2),
    title: "t",
    categoryId: null,
    status: "todo",
    priority: 0,
    deadline: null,
    progress: null,
    goal: null,
    scheduled: false,
    notes: null,
    links: [],
    blockCount: 0,
    subtasks: [],
    repeat: null,
    repeatEvery: 1,
    order: 0,
    doneAt: null,
    ...over,
  });
  const conFecha = task({ deadline: "2026-10-25", status: "doing" });
  const programada = task({ deadline: "2026-11-01", status: "backlog", priority: 4 });
  const sinFecha = task({ priority: 1 });
  const hechaReciente = task({ status: "done", deadline: "2026-10-10", doneAt: "2026-10-05T12:00:00.000Z" });
  const hechaVieja = task({ status: "done", deadline: "2026-09-01", doneAt: "2026-10-04T12:00:00.000Z" });
  const all = [conFecha, programada, sinFecha, hechaReciente, hechaVieja];

  it("Con deadline: todas las que tienen fecha, de cualquier estado (terminadas de los últimos 14 días, el día 14 adentro)", () => {
    expect(boardTasks(all, "deadline", TODAY)).toEqual([conFecha, programada, hechaReciente]);
  });

  it("Prioridades y Más chill no miran el estado", () => {
    expect(boardTasks(all, "priority", TODAY)).toEqual([programada]);
    expect(boardTasks(all, "chill", TODAY)).toEqual([conFecha, sinFecha, hechaReciente]);
  });

  it("Terminadas: todas las terminadas, sin tope de días", () => {
    expect(boardTasks(all, "done", TODAY)).toEqual([hechaReciente, hechaVieja]);
  });
});
