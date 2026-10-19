import { describe, expect, it } from "vitest";
import {
  blockFromForm,
  deadlineShortcuts,
  hoursScrollTarget,
  isBlockNow,
  isClientId,
  minutesNow,
  monthGrid,
  newClientId,
  taskFromForm,
  type BlockDTO,
  type TaskDTO,
} from "@/lib/plan-logic";

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const block = (p: Partial<BlockDTO>): BlockDTO => ({
  id: "b1",
  title: "Gym",
  categoryId: null,
  date: "2026-10-19",
  startTime: null,
  endTime: null,
  sortKey: null,
  priority: 0,
  done: false,
  place: null,
  notes: null,
  taskId: null,
  ...p,
});

describe("ids del aparato", () => {
  it("tienen forma de cuid y se reconocen", () => {
    const a = newClientId();
    expect(a).toMatch(/^c[a-z0-9]{24}$/);
    expect(isClientId(a)).toBe(true);
    expect(newClientId()).not.toBe(a);
    expect(isClientId("pendiente-123")).toBe(false);
    expect(isClientId("c123")).toBe(false);
    expect(isClientId(undefined)).toBe(false);
  });
});

describe("blockFromForm: lo que se ve al guardar la hoja", () => {
  it("bloque nuevo sin hora va arriba de su día", () => {
    const day = [block({ id: "x", sortKey: 30 }), block({ id: "y", startTime: "09:00", date: "2026-10-19" }), block({ id: "z", date: "2026-10-20", sortKey: -500 })];
    const b = blockFromForm(fd({ title: " Leer ", date: "2026-10-19", startTime: "", endTime: "", priority: "2" }), null, day, "nuevo")!;
    expect(b.id).toBe("nuevo");
    expect(b.title).toBe("Leer");
    expect(b.startTime).toBeNull();
    expect(b.sortKey).toBe(-10); // min(0, 30, 540) - 10, sin mirar otros días
    expect(b.priority).toBe(2);
  });
  it("normaliza horas escritas a mano y descarta un fin anterior al inicio", () => {
    const b = blockFromForm(fd({ title: "Clase", date: "2026-10-19", startTime: "930", endTime: "8" }), null, [], "n")!;
    expect(b.startTime).toBe("09:30");
    expect(b.endTime).toBeNull();
    const c = blockFromForm(fd({ title: "Clase", date: "2026-10-19", startTime: "21", endTime: "2230" }), null, [], "n")!;
    expect(c.endTime).toBe("22:30");
    expect(c.sortKey).toBeNull();
  });
  it("sin nombre, sin día o con una hora que no es hora: null", () => {
    expect(blockFromForm(fd({ title: "", date: "2026-10-19" }), null, [], "n")).toBeNull();
    expect(blockFromForm(fd({ title: "A", date: "2026-02-30" }), null, [], "n")).toBeNull();
    expect(blockFromForm(fd({ title: "A", date: "2026-10-19", startTime: "9pm" }), null, [], "n")).toBeNull();
  });
  it("editar: pasar a una semana posterior destilda; otro día de la misma semana conserva", () => {
    const base = block({ done: true, sortKey: 12 });
    expect(blockFromForm(fd({ title: "Gym", date: "2026-10-26" }), base, [], "b1")!.done).toBe(false);
    const same = blockFromForm(fd({ title: "Gym", date: "2026-10-21" }), base, [], "b1")!;
    expect(same.done).toBe(true);
    expect(same.sortKey).toBe(12);
  });
});

describe("taskFromForm", () => {
  const base: TaskDTO = {
    id: "t1",
    title: "Viejo",
    categoryId: null,
    status: "todo",
    priority: 2,
    deadline: null,
    progress: null,
    goal: null,
    scheduled: false,
    notes: null,
    links: [],
    blockCount: 1,
    subtasks: [{ id: "s1", title: "Paso", done: true }],
    repeat: null,
    repeatEvery: 1,
    order: 3,
    doneAt: null,
  };
  it("edita y conserva lo que la hoja no toca", () => {
    const t = taskFromForm(fd({ title: "Nuevo", status: "done", priority: "4", deadline: "2026-11-02", scheduled: "on", links: '[{"url":"https://a.com","name":""}]', repeat: "weekly", repeatEvery: "2" }), base, "t1", new Date("2026-10-19T12:00:00Z"))!;
    expect(t.title).toBe("Nuevo");
    expect(t.status).toBe("done");
    expect(t.doneAt).toBe("2026-10-19T12:00:00.000Z");
    expect(t.priority).toBe(4);
    expect(t.deadline).toBe("2026-11-02");
    expect(t.scheduled).toBe(true);
    expect(t.links).toEqual([{ url: "https://a.com/", name: "" }]);
    expect(t.repeat).toBe("weekly");
    expect(t.repeatEvery).toBe(2);
    expect(t.subtasks).toBe(base.subtasks);
    expect(t.progress).toBe(1);
    expect(t.goal).toBe(1);
    expect(t.order).toBe(3);
  });
  it("nueva: pasos escritos, prioridad por defecto, sin nombre null", () => {
    const t = taskFromForm(fd({ title: "Video", subtasks: "Guion\n\n Grabar \nEditar", status: "rara" }), null, "c1")!;
    expect(t.subtasks.map((s) => s.title)).toEqual(["Guion", "Grabar", "Editar"]);
    expect(t.goal).toBe(3);
    expect(t.progress).toBe(0);
    expect(t.status).toBe("todo");
    expect(t.priority).toBe(1);
    expect(taskFromForm(fd({ title: "  " }), null, "c1")).toBeNull();
  });
});

describe("ahora", () => {
  it("minutesNow en Montevideo (UTC-3)", () => {
    expect(minutesNow(new Date("2026-10-19T12:34:00Z"))).toBe(9 * 60 + 34);
    expect(minutesNow(new Date("2026-10-20T02:59:00Z"))).toBe(23 * 60 + 59);
  });
  it("isBlockNow: hoy, entre inicio y fin; sin fin, una hora", () => {
    const b = block({ startTime: "09:00", endTime: "10:30" });
    expect(isBlockNow(b, "2026-10-19", 9 * 60)).toBe(true);
    expect(isBlockNow(b, "2026-10-19", 10 * 60 + 29)).toBe(true);
    expect(isBlockNow(b, "2026-10-19", 10 * 60 + 30)).toBe(false);
    expect(isBlockNow(b, "2026-10-20", 9 * 60 + 10)).toBe(false);
    expect(isBlockNow(block({ startTime: "21:00" }), "2026-10-19", 21 * 60 + 59)).toBe(true);
    expect(isBlockNow(block({}), "2026-10-19", 600)).toBe(false);
  });
  it("hoursScrollTarget: una hora antes de ahora, o el primer bloque si es antes", () => {
    expect(hoursScrollTarget(14 * 60 + 20, null, 6)).toBe(13);
    expect(hoursScrollTarget(14 * 60 + 20, 9 * 60 + 30, 6)).toBe(9);
    expect(hoursScrollTarget(6 * 60 + 10, null, 6)).toBe(6);
    expect(hoursScrollTarget(3 * 60, null, 5)).toBe(5);
  });
});

describe("selector de fecha", () => {
  it("atajos", () => {
    const s = deadlineShortcuts("2026-10-21", "2026-10-30");
    expect(s.map((x) => [x.label, x.date])).toEqual([
      ["Hoy", "2026-10-21"],
      ["Mañana", "2026-10-22"],
      ["Próximo lunes", "2026-10-26"],
      ["+1 semana", "2026-11-06"],
    ]);
    // Un lunes: el próximo lunes es el de la semana que viene; sin fecha, +1 semana desde hoy.
    const l = deadlineShortcuts("2026-10-19", null);
    expect(l[2].date).toBe("2026-10-26");
    expect(l[3].date).toBe("2026-10-26");
    // Vencida: +1 semana desde hoy.
    expect(deadlineShortcuts("2026-10-19", "2026-10-11")[3].date).toBe("2026-10-26");
  });
  it("monthGrid: semanas completas de lunes a domingo", () => {
    const oct = monthGrid("2026-10");
    expect(oct[0][0]).toBe("2026-09-28");
    expect(oct.at(-1)!.at(-1)).toBe("2026-11-01");
    expect(oct.every((w) => w.length === 7)).toBe(true);
    expect(oct.flat()).toContain("2026-10-31");
    const feb = monthGrid("2027-02"); // empieza lunes
    expect(feb[0][0]).toBe("2027-02-01");
    expect(feb.length).toBe(4);
  });
});
