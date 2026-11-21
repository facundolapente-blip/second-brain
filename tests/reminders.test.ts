import { describe, expect, it } from "vitest";
import {
  budgetsMessage,
  customMessage,
  customPast,
  isCustomDue,
  daysText,
  DEFAULT_PREFS,
  dueHabits,
  dueKinds,
  isDue,
  normalizePrefs,
  priorityMessage,
  targetDevices,
} from "@/lib/reminder-logic";

describe("avisos: preferencias", () => {
  it("lo guardado viejo (sin días ni aparatos) sigue andando: todos los días, a todos", () => {
    const p = normalizePrefs({
      manana: { on: true, hour: 7 },
      habitos: { on: false, hour: 21 },
    });
    expect(p.manana).toEqual({
      on: true,
      hour: 7,
      days: [0, 1, 2, 3, 4, 5, 6],
      devices: null,
    });
    expect(p.habitos.on).toBe(false);
    // Los nuevos arrancan apagados; la revisión, solo los domingos.
    expect(p.journal.on).toBe(false);
    expect(p.revision.days).toEqual([0]);
    expect(p.habits).toEqual({});
  });

  it("acota días, horas y aparatos raros", () => {
    const p = normalizePrefs({
      checkin: {
        on: true,
        hour: 3,
        days: [9, 1, 1, "2", -1],
        devices: ["a", 4, ""],
      },
    });
    expect(p.checkin.hour).toBe(DEFAULT_PREFS.checkin.hour);
    expect(p.checkin.days).toEqual([1, 2]);
    expect(p.checkin.devices).toEqual(["a"]);
  });

  it("avisos por hábito: ids válidos y con sus valores", () => {
    const p = normalizePrefs({
      habits: {
        abc123: { on: true, hour: 22, days: [1, 3] },
        "mal id!": { on: true },
      },
    });
    expect(Object.keys(p.habits)).toEqual(["abc123"]);
    expect(p.habits.abc123).toMatchObject({ on: true, hour: 22, days: [1, 3] });
  });
});

describe("avisos: cuándo salen", () => {
  const p = normalizePrefs({
    manana: { on: true, hour: 8, days: [1, 2, 3, 4, 5] },
    habits: { h1: { on: true, hour: 20, days: [0] } },
  });

  it("solo los días elegidos, desde su hora y hasta 2 horas tarde", () => {
    expect(isDue(p.manana, 8, 1)).toBe(true);
    expect(isDue(p.manana, 10, 1)).toBe(true);
    expect(isDue(p.manana, 11, 1)).toBe(false);
    expect(isDue(p.manana, 8, 6)).toBe(false); // sábado
    expect(dueKinds(p, 8, 0)).not.toContain("manana");
  });

  it("los de un hábito, aparte", () => {
    expect(dueHabits(p, 20, 0)).toEqual(["h1"]);
    expect(dueHabits(p, 20, 1)).toEqual([]);
  });

  it("aparatos: los elegidos que siguen existiendo; si no queda ninguno, a todos", () => {
    const pref = { on: true, hour: 8, days: [1], devices: ["a", "b"] };
    expect(targetDevices(pref, ["b", "c"])).toEqual(["b"]);
    expect(targetDevices(pref, ["c"])).toBeNull();
    expect(targetDevices({ ...pref, devices: null }, ["c"])).toBeNull();
  });
});

describe("avisos: textos", () => {
  it("días en palabras", () => {
    expect(daysText([0, 1, 2, 3, 4, 5, 6])).toBe("Todos los días");
    expect(daysText([1, 2, 3, 4, 5])).toBe("Lunes a viernes");
    expect(daysText([0, 6])).toBe("Fines de semana");
    expect(daysText([0])).toBe("Solo los domingos");
    expect(daysText([3])).toBe("Solo los miércoles");
    expect(daysText([0, 1, 3])).toBe("L X D");
  });

  it("tarea prioritaria y presupuestos", () => {
    expect(priorityMessage(null).title).toBe("Elegí la tarea prioritaria");
    expect(priorityMessage("Story HM").body).toBe("Story HM");
    expect(budgetsMessage([])).toBeNull();
    expect(budgetsMessage([{ name: "Salidas", state: "over", text: "x" }])?.title).toBe("Te pasaste en Salidas");
    expect(budgetsMessage([{ name: "Super", state: "near", text: "x" }])?.title).toBe("Cerca del tope en Super");
  });
});

describe("avisos: recordatorios propios", () => {
  it("se guardan limpios; sin título o con id raro no quedan", () => {
    const p = normalizePrefs({
      custom: [
        { id: "a1", title: "  Llamar   a la abuela ", body: "  ", hour: 18, days: [0] },
        { id: "a2", title: "", hour: 9 },
        { id: "mal id", title: "x" },
        { id: "a1", title: "repetido" },
        { id: "a3", title: "Pagar la luz", date: "2026-12-10", hour: 10 },
      ],
    });
    expect(p.custom.map((c) => c.id)).toEqual(["a1", "a3"]);
    expect(p.custom[0]).toMatchObject({ title: "Llamar a la abuela", body: "", on: true, hour: 18, days: [0], date: null });
    expect(p.custom[1].date).toBe("2026-12-10");
  });

  it("los que se repiten salen sus días; los de un día, solo ese día", () => {
    const [rep, once] = normalizePrefs({
      custom: [
        { id: "r", title: "R", hour: 18, days: [0] },
        { id: "u", title: "U", hour: 10, date: "2026-12-10", days: [] },
      ],
    }).custom;
    expect(isCustomDue(rep, 18, 0, "2026-11-22")).toBe(true);
    expect(isCustomDue(rep, 18, 1, "2026-11-23")).toBe(false);
    expect(isCustomDue(once, 10, 4, "2026-12-10")).toBe(true);
    expect(isCustomDue(once, 10, 4, "2026-12-11")).toBe(false);
    expect(customPast(once, "2026-12-11")).toBe(true);
    expect(customMessage(once).body).toBe("Recordatorio");
  });
});
