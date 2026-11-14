import { describe, expect, it } from "vitest";
import {
  breakAfter,
  cleanNote,
  clockText,
  cyclePosition,
  DEFAULT_FOCUS_SETTINGS,
  focusedMinutes,
  groupByDay,
  hourText,
  minutesShort,
  minutesText,
  modeMs,
  normalizeFocusSettings,
  parseFocusSettings,
  rangeText,
  sessionDay,
  sessionsText,
  totalsOf,
  weekMinutes,
} from "../src/lib/focus-logic";

describe("tiempos de enfoque", () => {
  it("normaliza lo guardado y usa los de fábrica para lo que falta", () => {
    expect(parseFocusSettings(null)).toEqual(DEFAULT_FOCUS_SETTINGS);
    expect(parseFocusSettings("no es json")).toEqual(DEFAULT_FOCUS_SETTINGS);
    expect(parseFocusSettings(JSON.stringify({ focus: 50, short: "10" }))).toEqual({ focus: 50, short: 10, long: 15, every: 4 });
    expect(normalizeFocusSettings({ focus: 0, short: 999, long: -3, every: 1 })).toEqual({ focus: 1, short: 60, long: 1, every: 2 });
    expect(normalizeFocusSettings({ focus: "", short: "abc", long: 20.6, every: "6" })).toEqual({ focus: 25, short: 5, long: 21, every: 6 });
  });

  it("cada parte dura lo suyo", () => {
    expect(modeMs("focus", DEFAULT_FOCUS_SETTINGS)).toBe(25 * 60_000);
    expect(modeMs("short", DEFAULT_FOCUS_SETTINGS)).toBe(5 * 60_000);
    expect(modeMs("long", DEFAULT_FOCUS_SETTINGS)).toBe(15 * 60_000);
  });

  it("el descanso largo toca cada N sesiones", () => {
    expect([1, 2, 3, 4, 5, 8].map((n) => breakAfter(n, 4))).toEqual(["short", "short", "short", "long", "short", "long"]);
    expect(breakAfter(0, 4)).toBe("short");
    expect([0, 1, 3, 4, 5].map((n) => cyclePosition(n, 4))).toEqual([1, 2, 4, 1, 2]);
  });
});

describe("textos", () => {
  it("reloj mm:ss que cuenta para atrás", () => {
    expect(clockText(25 * 60_000)).toBe("25:00");
    expect(clockText(249_001)).toBe("04:10");
    expect(clockText(0)).toBe("00:00");
    expect(clockText(-5)).toBe("00:00");
    expect(clockText(65 * 60_000)).toBe("1:05:00");
  });

  it("minutos legibles", () => {
    expect(minutesText(0)).toBe("0 min");
    expect(minutesText(45)).toBe("45 min");
    expect(minutesText(60)).toBe("1 h");
    expect(minutesText(75)).toBe("1 h 15 min");
    expect(minutesShort(45)).toBe("45m");
    expect(minutesShort(120)).toBe("2h");
    expect(minutesShort(135)).toBe("2h 15m");
    expect(sessionsText(1)).toBe("1 sesión");
    expect(sessionsText(3)).toBe("3 sesiones");
    expect(focusedMinutes(24.6 * 60_000)).toBe(25);
  });

  it("horas en 24 h de Montevideo y el día de la sesión", () => {
    // 18:20 UTC = 15:20 en Montevideo (UTC-3).
    expect(hourText("2026-11-14T18:20:00.000Z")).toBe("15:20");
    expect(rangeText("2026-11-14T18:20:00.000Z", "2026-11-14T18:45:00.000Z")).toBe("15:20 a 15:45");
    expect(hourText("2026-11-15T01:05:00.000Z")).toBe("22:05");
    // Pasada la medianoche UTC sigue siendo el día anterior en Montevideo.
    expect(sessionDay("2026-11-15T01:05:00.000Z")).toBe("2026-11-14");
  });

  it("la nota vacía no se guarda", () => {
    expect(cleanNote("  ")).toBeNull();
    expect(cleanNote(undefined)).toBeNull();
    expect(cleanNote(" Servicio de IA ")).toBe("Servicio de IA");
  });
});

describe("totales", () => {
  const s = (day: string, minutes: number, startedAt = `${day}T12:00:00.000Z`) => ({ day, minutes, startedAt });
  const list = [s("2026-11-09", 25), s("2026-11-09", 50, "2026-11-09T15:00:00.000Z"), s("2026-11-12", 25), s("2026-11-15", 10), s("2026-11-08", 99)];

  it("minutos por día de la semana (lunes a domingo)", () => {
    expect(weekMinutes(list, "2026-11-09")).toEqual([75, 0, 0, 25, 0, 0, 10]);
    expect(totalsOf(list)).toEqual({ minutes: 209, count: 5 });
  });

  it("agrupa por día, lo más nuevo arriba", () => {
    const g = groupByDay(list);
    expect(g.map((x) => x.day)).toEqual(["2026-11-15", "2026-11-12", "2026-11-09", "2026-11-08"]);
    expect(g[2].minutes).toBe(75);
    expect(g[2].sessions.map((x) => x.minutes)).toEqual([50, 25]);
  });
});
