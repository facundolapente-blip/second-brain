import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addDays,
  dayOfInstant,
  diffDays,
  formatLong,
  formatRelative,
  isISODate,
  monthBounds,
  shiftMonth,
  startOfWeek,
  todayISO,
  weekday,
} from "@/lib/dates";
import { bestStreak, currentStreak, excerpt, greeting, isEmptyEntry, isMood, normalizeTag, normalizeTags, wordCount } from "@/lib/journal-logic";
import { parseValueNotes } from "@/lib/values";
import { montevideoNow, msToNextSlot, pickForSlot, quoteSlot } from "@/lib/quotes";
import { cleanPatch, formatSleep, formatWeight, parseWeight } from "@/lib/checkin-logic";

afterEach(() => {
  vi.useRealTimers();
});

describe("dates", () => {
  it("isISODate exige un día que exista", () => {
    expect(isISODate("2026-10-19")).toBe(true);
    expect(isISODate("2028-02-29")).toBe(true);
    expect(isISODate("2026-02-29")).toBe(false);
    expect(isISODate("2026-02-30")).toBe(false);
    expect(isISODate("2026-13-01")).toBe(false);
    expect(isISODate("2026-2-1")).toBe(false);
    expect(isISODate("2026-10-19T00:00")).toBe(false);
    expect(isISODate(20261019)).toBe(false);
    expect(isISODate(null)).toBe(false);
  });

  it("semanas: lunes por defecto, o domingo", () => {
    expect(startOfWeek("2026-10-21")).toBe("2026-10-19");
    expect(startOfWeek("2026-10-25")).toBe("2026-10-19"); // domingo: cierra la semana del lunes
    expect(startOfWeek("2026-10-19")).toBe("2026-10-19");
    expect(startOfWeek("2026-10-21", 0)).toBe("2026-10-18");
    expect(startOfWeek("2026-10-18", 0)).toBe("2026-10-18");
    expect(startOfWeek("2027-01-01")).toBe("2026-12-28");
    expect(weekday("2026-10-19")).toBe(1);
  });

  it("sumar días, meses y diferencias", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
    expect(addDays("2026-10-19", 0)).toBe("2026-10-19");
    expect(monthBounds("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(monthBounds("2028-02").to).toBe("2028-02-29");
    expect(monthBounds("2026-12").to).toBe("2026-12-31");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-10", -12)).toBe("2025-10");
    expect(diffDays("2026-10-19", "2026-10-01")).toBe(18);
    expect(diffDays("2026-01-01", "2026-12-31")).toBe(-364);
  });

  it("hoy es el día de Montevideo, no el de UTC", () => {
    vi.useFakeTimers();
    // 02:30 UTC del 20 = 23:30 del 19 en Montevideo.
    vi.setSystemTime(new Date("2026-10-20T02:30:00Z"));
    expect(todayISO()).toBe("2026-10-19");
    vi.setSystemTime(new Date("2026-10-20T03:00:00Z"));
    expect(todayISO()).toBe("2026-10-20");
    expect(dayOfInstant(new Date("2026-01-01T02:59:59Z"))).toBe("2025-12-31");
  });

  it("fechas largas llevan el año solo si no es el actual", () => {
    expect(formatLong("2026-10-09", "2026-10-19")).not.toContain("2026");
    expect(formatLong("2025-10-09", "2026-10-19")).toContain("2025");
    expect(formatLong("2025-10-09", "2026-10-19")).toContain("octubre");
    expect(formatRelative("2026-10-19", "2026-10-19")).toBe("Hoy");
    expect(formatRelative("2026-10-18", "2026-10-19")).toBe("Ayer");
  });
});

describe("journal", () => {
  it("isEmptyEntry: sin título, texto ni etiquetas (el ánimo solo no cuenta)", () => {
    expect(isEmptyEntry({ title: null, body: "", tags: [] })).toBe(true);
    expect(isEmptyEntry({ title: "  ", body: " \n\t ", tags: [] })).toBe(true);
    expect(isEmptyEntry({ title: "Título", body: "", tags: [] })).toBe(false);
    expect(isEmptyEntry({ title: null, body: "hola", tags: [] })).toBe(false);
    expect(isEmptyEntry({ title: null, body: "", tags: ["viaje"] })).toBe(false);
  });

  it("etiquetas: sin #, minúsculas, espacios simples, sin repetidas", () => {
    expect(normalizeTag("#Viaje  Largo ")).toBe("viaje largo");
    expect(normalizeTag("##Gym")).toBe("gym");
    expect(normalizeTag("x".repeat(50))).toHaveLength(32);
    expect(normalizeTags(["#A", "a", "B", 3, "  ", "#"])).toEqual(["a", "b"]);
    expect(normalizeTags("a")).toEqual([]);
    expect(normalizeTags(Array.from({ length: 30 }, (_, i) => `t${i}`))).toHaveLength(20);
  });

  it("ánimo, palabras y extracto", () => {
    expect(isMood(3)).toBe(true);
    expect(isMood(0)).toBe(false);
    expect(isMood(2.5)).toBe(false);
    expect(wordCount("Hola, ¿cómo estás? it's well-known 2026")).toBe(6);
    expect(wordCount("   ")).toBe(0);
    expect(excerpt("corto")).toBe("corto");
    const long = excerpt("palabra ".repeat(100), 50);
    expect(long.endsWith("…")).toBe(true);
    expect(long.length).toBeLessThanOrEqual(51);
  });

  it("racha: si hoy no escribiste, la de ayer sigue viva", () => {
    const days = new Set(["2026-10-17", "2026-10-18", "2026-10-19"]);
    expect(currentStreak(days, "2026-10-19")).toBe(3);
    expect(currentStreak(days, "2026-10-20")).toBe(3);
    expect(currentStreak(days, "2026-10-21")).toBe(0);
    expect(bestStreak(["2026-10-01", "2026-10-02", "2026-10-04", "2026-10-05", "2026-10-06"])).toBe(3);
    expect(bestStreak([])).toBe(0);
  });

  it("saludo", () => {
    expect(greeting(5)).toBe("Buen día");
    expect(greeting(11)).toBe("Buen día");
    expect(greeting(12)).toBe("Buenas tardes");
    expect(greeting(20)).toBe("Buenas noches");
    expect(greeting(4)).toBe("Buenas noches");
  });
});

describe("valores (parseValueNotes)", () => {
  const raw = [
    "Antes de cualquier título",
    "",
    "# Principios",
    "- Ser honesto",
    "• Cuidar el cuerpo",
    "1. Leer todos los días",
    "2) Llamar a la familia",
    "",
    "Un párrafo que sigue",
    "en otra línea.",
    "",
    "## Referencia: medidor emocional",
    "- Alegría",
    "- Tristeza",
    "Un párrafo de referencia.",
    "",
    "# **Salud**",
    "**Dormir** 8 horas",
  ].join("\r\n");

  it("listas, párrafos y títulos que agrupan; Referencia no sale", () => {
    expect(parseValueNotes(raw)).toEqual([
      { text: "Antes de cualquier título", section: null },
      { text: "Ser honesto", section: "Principios" },
      { text: "Cuidar el cuerpo", section: "Principios" },
      { text: "Leer todos los días", section: "Principios" },
      { text: "Llamar a la familia", section: "Principios" },
      { text: "Un párrafo que sigue en otra línea.", section: "Principios" },
      { text: "Dormir 8 horas", section: "Salud" },
    ]);
  });

  it("vacío", () => {
    expect(parseValueNotes(null)).toEqual([]);
    expect(parseValueNotes("")).toEqual([]);
    expect(parseValueNotes("# Solo un título")).toEqual([]);
  });

  it("después de una Referencia, un título nuevo vuelve a rotar", () => {
    expect(parseValueNotes("# referencias\n- a\n# Otra\n- b")).toEqual([{ text: "b", section: "Otra" }]);
  });
});

describe("nota de Inicio cada 6 horas (quotes)", () => {
  it("quoteSlot: 4 tramos por día", () => {
    expect(quoteSlot("1970-01-01", 0)).toBe(0);
    expect(quoteSlot("1970-01-01", 5)).toBe(0);
    expect(quoteSlot("1970-01-01", 6)).toBe(1);
    expect(quoteSlot("1970-01-01", 23)).toBe(3);
    expect(quoteSlot("1970-01-02", 0)).toBe(4);
    expect(quoteSlot("2026-10-19", 12) - quoteSlot("2026-10-18", 12)).toBe(4);
  });

  it("pickForSlot recorre todas antes de repetir y no repite seguidas", () => {
    for (let n = 1; n <= 40; n++) {
      const list = Array.from({ length: n }, (_, i) => i);
      const start = 81234;
      const seen = new Set(Array.from({ length: n }, (_, k) => pickForSlot(list, start + k)));
      expect(seen.size).toBe(n);
      if (n > 1) expect(pickForSlot(list, start)).not.toBe(pickForSlot(list, start + 1));
    }
    expect(pickForSlot([], 3)).toBeNull();
    expect(pickForSlot(["a", "b", "c"], -7)).not.toBeNull();
  });

  it("montevideoNow", () => {
    expect(montevideoNow(new Date("2026-10-20T02:00:00Z"))).toEqual({ day: "2026-10-19", hour: 23 });
    expect(montevideoNow(new Date("2026-10-20T03:00:00Z"))).toEqual({ day: "2026-10-20", hour: 0 });
  });

  it("msToNextSlot: hasta la próxima hora múltiplo de 6 en Montevideo (+ medio segundo)", () => {
    expect(msToNextSlot(new Date("2026-10-19T14:00:00Z"))).toBe(3_600_000 + 500); // 11:00 → 12:00
    expect(msToNextSlot(new Date("2026-10-19T15:00:00Z"))).toBe(6 * 3_600_000 + 500); // 12:00 → 18:00
    expect(msToNextSlot(new Date("2026-10-19T20:59:59.500Z"))).toBe(1000); // 17:59:59,5 → 18:00
    expect(msToNextSlot(new Date("2026-10-20T02:30:00Z"))).toBe(30 * 60_000 + 500); // 23:30 → 00:00
  });
});

describe("check-in", () => {
  it("cleanPatch deja solo campos válidos; inválido presente = null", () => {
    expect(cleanPatch({ mood: 3, energy: 6, stress: "2", sleepMin: 450.4, weightG: 82400, note: "  hola  ", otro: 1 })).toEqual({
      mood: 3,
      energy: null,
      stress: null,
      sleepMin: 450,
      weightG: 82400,
      note: "hola",
    });
    expect(cleanPatch({ sleepMin: 24 * 60 + 1, weightG: 10_000, note: "   " })).toEqual({ sleepMin: null, weightG: null, note: null });
    expect(cleanPatch({ mood: null })).toEqual({ mood: null });
    expect(cleanPatch({ note: "x".repeat(600) }).note).toHaveLength(500);
    expect(cleanPatch(null)).toEqual({});
    expect(cleanPatch("texto")).toEqual({});
    expect(cleanPatch({})).toEqual({});
  });

  it("formatos de sueño y peso", () => {
    expect(formatSleep(450)).toBe("7 h 30");
    expect(formatSleep(480)).toBe("8 h");
    expect(formatSleep(425)).toBe("7 h 05");
    expect(formatSleep(null)).toBe("–");
    expect(formatWeight(82400)).toBe("82,4 kg");
    expect(formatWeight(null)).toBe("–");
  });

  it("parseWeight: kg con coma o punto a gramos", () => {
    expect(parseWeight("82,4")).toBe(82400);
    expect(parseWeight("82.4")).toBe(82400);
    expect(parseWeight(" 82 ")).toBe(82000);
    expect(parseWeight("")).toBeNull();
    expect(parseWeight("abc")).toBeNull();
    expect(parseWeight("10")).toBeNull();
    expect(parseWeight("500")).toBeNull();
  });
});
