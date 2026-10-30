import { describe, expect, it } from "vitest";
import {
  moveTaskColumn,
  parseTaskColumnOrder,
  applyTaskView,
  daysLeft,
  daysLeftLabel,
  durationMinutes,
  isFreeBlock,
  isTime,
  normalizeLink,
  normalizeTime,
  parseTaskColumns,
  parseTaskLinks,
  placeAt,
  progressPct,
  repeatLabel,
  sortBlocks,
  timeRange,
  topSortKey,
  weekDays,
  monthGrid,
  monthCellBlocks,
  isMonthKey,
  type TaskDTO,
  shiftEnd,
} from "@/lib/plan-logic";

describe("horas", () => {
  it("normalizeTime: horas escritas a mano", () => {
    expect(normalizeTime("930")).toBe("09:30");
    expect(normalizeTime("21")).toBe("21:00");
    expect(normalizeTime("9")).toBe("09:00");
    expect(normalizeTime("2130")).toBe("21:30");
    expect(normalizeTime("11.45")).toBe("11:45");
    expect(normalizeTime("9:5")).toBe("09:05");
    expect(normalizeTime("21 30")).toBe("21:30");
    expect(normalizeTime("21,30")).toBe("21:30");
    expect(normalizeTime("  08:15 ")).toBe("08:15");
    expect(normalizeTime("0")).toBe("00:00");
  });

  it("normalizeTime: vacío da '' y lo que no es hora, null", () => {
    expect(normalizeTime("")).toBe("");
    expect(normalizeTime("   ")).toBe("");
    expect(normalizeTime("25")).toBeNull();
    expect(normalizeTime("12:60")).toBeNull();
    expect(normalizeTime("2460")).toBeNull();
    expect(normalizeTime("12345")).toBeNull();
    expect(normalizeTime("abc")).toBeNull();
    expect(normalizeTime("9h")).toBeNull();
  });

  it("isTime exige HH:MM", () => {
    expect(isTime("09:30")).toBe(true);
    expect(isTime("23:59")).toBe(true);
    expect(isTime("9:30")).toBe(false);
    expect(isTime("24:00")).toBe(false);
    expect(isTime(930)).toBe(false);
  });

  it("rango y duración", () => {
    expect(timeRange({ startTime: "09:00", endTime: "12:00" })).toBe("9:00 a 12:00");
    expect(timeRange({ startTime: "22:00", endTime: null })).toBe("22:00");
    expect(timeRange({ startTime: null, endTime: null })).toBeNull();
    expect(durationMinutes({ startTime: "09:15", endTime: "11:00" })).toBe(105);
    expect(durationMinutes({ startTime: "11:00", endTime: "09:00" })).toBe(0);
    expect(durationMinutes({ startTime: "11:00", endTime: null })).toBe(0);
  });

  it("weekDays: lunes a domingo de la semana", () => {
    expect(weekDays("2026-10-21")).toEqual(["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"]);
    expect(weekDays("2026-10-25")[0]).toBe("2026-10-19");
  });
});

type B = { id: string; title: string; startTime: string | null; sortKey?: number | null };
const blk = (id: string, startTime: string | null, sortKey: number | null = null): B => ({ id, title: id, startTime, sortKey });

describe("orden de los bloques", () => {
  it("sortBlocks: por hora o lugar guardado; empatados, primero el sin hora", () => {
    const out = sortBlocks([blk("B", "10:00"), blk("A", null), blk("C", "08:00"), blk("D", null, 600)]);
    expect(out.map((b) => b.id)).toEqual(["A", "C", "D", "B"]);
  });

  it("sortBlocks: mismo lugar, por nombre", () => {
    expect(sortBlocks([blk("Zeta", null), blk("Ábaco", null), blk("Mate", null)]).map((b) => b.id)).toEqual(["Ábaco", "Mate", "Zeta"]);
  });

  it("placeAt: entre dos vecinos con lugar, al medio", () => {
    const list = [blk("X", "09:00"), blk("Y", "11:00")];
    expect(placeAt(list, 1)).toEqual({ key: 600, others: [] });
    expect(placeAt(list, 0)).toEqual({ key: 530, others: [] });
    expect(placeAt(list, 2)).toEqual({ key: 670, others: [] });
    expect(placeAt([], 0)).toEqual({ key: 0, others: [] });
  });

  it("placeAt: vecinos que empatan renumeran el tramo", () => {
    // Dos sin lugar guardado (valen -1): no hay medio, se renumeran los tres.
    expect(placeAt([blk("P", null), blk("Q", null)], 1)).toEqual({
      key: 10,
      others: [
        ["P", 0],
        ["Q", 20],
      ],
    });
    // Un sin hora soltado justo a la hora del siguiente: el tramo va entre las 8 y las 10.
    expect(placeAt([blk("H1", "08:00"), blk("P", null, 600), blk("H2", "10:00")], 2)).toEqual({
      key: 560,
      others: [["P", 520]],
    });
  });

  it("placeAt: el resultado queda en el lugar pedido al ordenar", () => {
    const list = [blk("H1", "08:00"), blk("P", null, 600), blk("H2", "10:00")];
    const { key, others } = placeAt(list, 2);
    const patched = list.map((b) => {
      const o = others.find(([id]) => id === b.id);
      return o ? { ...b, sortKey: o[1] } : b;
    });
    const sorted = sortBlocks([...patched, blk("NUEVO", null, key)]);
    expect(sorted.map((b) => b.id)).toEqual(["H1", "P", "NUEVO", "H2"]);
  });

  it("topSortKey: los nuevos sin hora nacen arriba", () => {
    expect(topSortKey([])).toBe(0);
    expect(topSortKey([blk("a", "09:00")])).toBe(-10);
    expect(topSortKey([blk("a", "08:00"), blk("b", null, -5)])).toBe(-15);
    const day = [blk("a", "08:00"), blk("b", null, -5), blk("c", null)];
    expect(sortBlocks([...day, blk("nuevo", null, topSortKey(day))])[0].id).toBe("nuevo");
  });

  it("isFreeBlock", () => {
    expect(isFreeBlock({ title: " Libre " })).toBe(true);
    expect(isFreeBlock({ title: "LIBRE" })).toBe(true);
    expect(isFreeBlock({ title: "Libre de tarde" })).toBe(false);
  });
});

describe("vistas de tareas (applyTaskView)", () => {
  let n = 0;
  const task = (over: Partial<TaskDTO>): TaskDTO => ({
    id: `t${++n}`,
    title: `t${n}`,
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
    order: n,
    doneAt: null,
    ...over,
  });
  const tasks = [
    task({ id: "urgente", priority: 4, deadline: "2026-10-30" }),
    task({ id: "alta", priority: 3, status: "doing" }),
    task({ id: "media", priority: 2, deadline: "2026-10-20" }),
    task({ id: "baja", priority: 1 }),
    task({ id: "sin", priority: 0, deadline: "2026-10-25" }),
    task({ id: "programada", priority: 4, status: "backlog", deadline: "2026-10-21" }),
    task({ id: "vieja", status: "done", doneAt: "2026-10-01T10:00:00Z", deadline: "2026-10-01" }),
    task({ id: "reciente", status: "done", doneAt: "2026-10-18T10:00:00Z" }),
  ];
  const ids = (v: Parameters<typeof applyTaskView>[1]) => applyTaskView(tasks, v).map((t) => t.id);

  it("Con deadline: todas las abiertas con fecha, la que vence antes primero", () => {
    expect(ids("deadline")).toEqual(["media", "sin", "urgente"]);
  });

  it("Prioridades: 3 y 4 abiertas", () => {
    expect(ids("priority")).toEqual(["urgente", "alta"]);
  });

  it("Más chill: 1, 2 o sin prioridad", () => {
    expect(ids("chill")).toEqual(["media", "sin", "baja"]);
  });

  it("Programadas y Terminadas (la más reciente primero)", () => {
    expect(ids("backlog")).toEqual(["programada"]);
    expect(ids("done")).toEqual(["reciente", "vieja"]);
  });

  it("entre todas las vistas abiertas no se pierde ninguna tarea abierta", () => {
    const open = tasks.filter((t) => t.status === "todo" || t.status === "doing").map((t) => t.id);
    const covered = new Set([...ids("priority"), ...ids("chill")]);
    expect(open.every((id) => covered.has(id))).toBe(true);
  });

  it("orden manual solo en las vistas que se pueden ordenar", () => {
    const reordered = tasks.map((t) => (t.id === "sin" ? { ...t, order: -1 } : t));
    expect(applyTaskView(reordered, "chill", true)[0].id).toBe("sin");
    expect(applyTaskView(reordered, "deadline", true).map((t) => t.id)).toEqual(["media", "sin", "urgente"]);
  });
});

describe("textos y avance de tareas", () => {
  it("daysLeft y daysLeftLabel", () => {
    expect(daysLeft("2026-10-22", "2026-10-19")).toBe(3);
    expect(daysLeft(null, "2026-10-19")).toBeNull();
    expect(daysLeftLabel(0)).toBe("Hoy");
    expect(daysLeftLabel(1)).toBe("Mañana");
    expect(daysLeftLabel(-1)).toBe("Ayer");
    expect(daysLeftLabel(3)).toBe("En 3 días");
    expect(daysLeftLabel(-2)).toBe("Hace 2 días");
    expect(daysLeftLabel(null)).toBeNull();
  });

  it("progressPct", () => {
    expect(progressPct(1, 3)).toBe(33);
    expect(progressPct(5, 3)).toBe(100);
    expect(progressPct(null, 4)).toBe(0);
    expect(progressPct(2, 0)).toBeNull();
    expect(progressPct(2, null)).toBeNull();
  });

  it("repeatLabel", () => {
    expect(repeatLabel("weekly", 1)).toBe("Cada semana");
    expect(repeatLabel("daily", 3)).toBe("Cada 3 días");
    expect(repeatLabel("monthly", 2)).toBe("Cada 2 meses");
    expect(repeatLabel(null, 1)).toBeNull();
  });
});

describe("links de tareas", () => {
  it("normalizeLink: agrega https:// y solo acepta http/https", () => {
    expect(normalizeLink("google.com")).toBe("https://google.com/");
    expect(normalizeLink("  http://ejemplo.com.uy/a?b=1 ")).toBe("http://ejemplo.com.uy/a?b=1");
    expect(normalizeLink("javascript:alert(1)")).toBeNull();
    expect(normalizeLink("ftp://ejemplo.com")).toBeNull();
    expect(normalizeLink("mailto:a@b.com")).toBeNull();
    expect(normalizeLink("palabra")).toBeNull();
    expect(normalizeLink("")).toBeNull();
    expect(normalizeLink(`a.com/${"x".repeat(600)}`)).toBeNull();
  });

  // BUG (plan-logic.ts:34): "dominio:puerto" sin https:// se toma como si "dominio:" fuera el
  // esquema (la regex de esquema acepta puntos), así que el link se rechaza. Igual "localhost:3000".
  it("normalizeLink: un link con puerto y sin https:// se acepta", () => {
    expect(normalizeLink("ejemplo.com:8080/x")).toBe("https://ejemplo.com:8080/x");
  });

  it("parseTaskLinks: acepta objetos y textos viejos, sin repetidos", () => {
    expect(
      parseTaskLinks([
        "google.com",
        { url: "https://google.com", name: "repetido" },
        { url: "notion.so/plan", name: "  Plan  " },
        { url: "javascript:alert(1)", name: "malo" },
        null,
        42,
      ]),
    ).toEqual([
      { url: "https://google.com/", name: "" },
      { url: "https://notion.so/plan", name: "Plan" },
    ]);
    expect(parseTaskLinks("google.com")).toEqual([]);
    expect(parseTaskLinks(null)).toEqual([]);
  });

  it("parseTaskLinks: tope de 30", () => {
    const many = Array.from({ length: 50 }, (_, i) => `sitio${i}.com`);
    expect(parseTaskLinks(many)).toHaveLength(30);
  });
});

describe("anchos de columnas (parseTaskColumns)", () => {
  it("solo columnas conocidas, con tope y piso", () => {
    expect(parseTaskColumns('{"title":500.4,"date":10,"progress":"abc","foo":3,"category":2000,"deadline":"150"}')).toEqual({
      title: 500,
      date: 48,
      category: 900,
      deadline: 150,
    });
  });

  it("vacío o roto: los de por defecto", () => {
    expect(parseTaskColumns(null)).toEqual({});
    expect(parseTaskColumns(undefined)).toEqual({});
    expect(parseTaskColumns("{roto")).toEqual({});
  });
});

describe("shiftEnd (al cambiar el inicio se mantiene la duración)", () => {
  it("15–17 y empieza a las 13: termina a las 15", () => {
    expect(shiftEnd("15:00", "17:00", "13:00")).toBe("15:00");
    expect(shiftEnd("09:30", "10:15", "18:00")).toBe("18:45");
  });
  it("no pasa de las 23:59", () => {
    expect(shiftEnd("15:00", "17:00", "23:00")).toBe("23:59");
  });
  it("sin fin, sin inicio anterior o con el fin antes del inicio: no toca nada", () => {
    expect(shiftEnd("", "17:00", "13:00")).toBeNull();
    expect(shiftEnd("15:00", "", "13:00")).toBeNull();
    expect(shiftEnd("17:00", "15:00", "13:00")).toBeNull();
  });
});

describe("orden de las columnas de tareas", () => {
  it("lee lo guardado, sin repetidas ni desconocidas, y completa lo que falta", () => {
    expect(parseTaskColumnOrder(null)).toEqual(["date", "title", "category", "priority", "deadline", "progress", "scheduled"]);
    expect(parseTaskColumnOrder('["deadline","date","deadline","nada"]')).toEqual(["deadline", "date", "title", "category", "priority", "progress", "scheduled"]);
    expect(parseTaskColumnOrder("{roto")).toHaveLength(7);
  });
  it("mueve una columna antes o después de otra", () => {
    const o = parseTaskColumnOrder(null);
    expect(moveTaskColumn(o, "deadline", "date", false).slice(0, 3)).toEqual(["deadline", "date", "title"]);
    expect(moveTaskColumn(o, "date", "title", true).slice(0, 3)).toEqual(["title", "date", "category"]);
    expect(moveTaskColumn(o, "date", "date", true)).toBe(o);
  });
});

import { nextRepeatDate } from "../src/lib/plan-logic";

describe("nextRepeatDate", () => {
  it("semanal: una semana después del deadline", () => {
    expect(nextRepeatDate("2026-10-27", "weekly", 1, "2026-10-27")).toBe("2026-11-03");
  });
  it("vencida: se corre hasta hoy o después, contando desde la misma fecha", () => {
    expect(nextRepeatDate("2026-10-06", "weekly", 1, "2026-10-27")).toBe("2026-10-27");
    expect(nextRepeatDate("2026-10-05", "weekly", 1, "2026-10-27")).toBe("2026-11-02");
  });
  it("mensual: un 31 cae el último día y vuelve al 31", () => {
    expect(nextRepeatDate("2026-01-31", "monthly", 1, "2026-01-31")).toBe("2026-02-28");
    expect(nextRepeatDate("2026-02-28", "monthly", 1, "2026-02-28", 31)).toBe("2026-03-31");
  });
});

describe("vista Mes", () => {
  it("monthGrid: semanas enteras de lunes a domingo (la grilla de la vista Mes)", () => {
    // Noviembre 2026 empieza un domingo y termina un lunes: 6 semanas.
    const nov = monthGrid("2026-11").flat();
    expect(nov.length).toBe(42);
    expect(nov[0]).toBe("2026-10-26");
    expect(nov[6]).toBe("2026-11-01");
    expect(nov.at(-1)).toBe("2026-12-06");
    // Febrero 2027 empieza lunes y tiene 28 días: 4 semanas justas.
    const feb = monthGrid("2027-02").flat();
    expect(feb.length).toBe(28);
    expect(feb[0]).toBe("2027-02-01");
    expect(feb.at(-1)).toBe("2027-02-28");
    // Octubre 2026: jueves 1 a sábado 31, 5 semanas.
    const oct = monthGrid("2026-10").flat();
    expect(oct.length).toBe(35);
    expect(oct[0]).toBe("2026-09-28");
    expect(oct.at(-1)).toBe("2026-11-01");
  });

  it("monthCellBlocks: '+N más' solo si sobran dos o más", () => {
    expect(monthCellBlocks([1, 2, 3], 3)).toEqual({ shown: [1, 2, 3], more: 0 });
    expect(monthCellBlocks([1, 2, 3, 4], 3)).toEqual({ shown: [1, 2, 3, 4], more: 0 });
    expect(monthCellBlocks([1, 2, 3, 4, 5], 3)).toEqual({ shown: [1, 2, 3], more: 2 });
  });

  it("isMonthKey", () => {
    expect(isMonthKey("2026-11")).toBe(true);
    expect(isMonthKey("2026-13")).toBe(false);
    expect(isMonthKey("2026-1")).toBe(false);
    expect(isMonthKey(undefined)).toBe(false);
  });
});
