import { describe, expect, it } from "vitest";
import { cleanApiKey, parseWellness, pruneSynced, watchPatch } from "../src/lib/watch-logic";

const empty = { sleep: {}, weight: {} };

describe("parseWellness (datos diarios de intervals.icu)", () => {
  it("toma pasos, sueño en minutos y peso en gramos", () => {
    const days = parseWellness(
      [
        { id: "2026-10-19", steps: 8432, sleepSecs: 26100, weight: 78.4 },
        { id: "2026-10-18", steps: 12000.4, sleepSecs: null, weight: null },
      ],
      "2026-10-20",
    );
    expect(days).toEqual([
      { date: "2026-10-18", steps: 12000, sleepMin: null, weightG: null },
      { date: "2026-10-19", steps: 8432, sleepMin: 435, weightG: 78400 },
    ]);
  });
  it("descarta lo que no tiene sentido, días futuros y registros vacíos", () => {
    const days = parseWellness(
      [
        { id: "2026-10-21", steps: 5000 },
        { id: "2026-10-19", steps: 0, sleepSecs: 600, weight: 5 },
        { id: "roto", steps: 100 },
        null,
      ],
      "2026-10-20",
    );
    expect(days).toEqual([]);
    expect(parseWellness({ error: "x" }, "2026-10-20")).toEqual([]);
  });
});

describe("watchPatch (qué se guarda en el check-in)", () => {
  const day = { date: "2026-10-19", steps: 9000, sleepMin: 420, weightG: 78000 };
  it("en un día vacío pone todo", () => {
    expect(watchPatch(day, undefined, empty)).toEqual({ steps: 9000, sleepMin: 420, weightG: 78000 });
  });
  it("los pasos se pisan; el sueño y el peso cargados a mano no", () => {
    expect(watchPatch(day, { steps: 4000, sleepMin: 480, weightG: 77000 }, empty)).toEqual({ steps: 9000 });
  });
  it("si el valor lo había puesto el reloj, se actualiza", () => {
    const synced = { sleep: { "2026-10-19": 400 }, weight: { "2026-10-19": 77500 } };
    expect(watchPatch(day, { steps: 9000, sleepMin: 400, weightG: 77500 }, synced)).toEqual({ sleepMin: 420, weightG: 78000 });
  });
  it("sin cambios, nada", () => {
    expect(watchPatch(day, { steps: 9000, sleepMin: 420, weightG: 78000 }, empty)).toEqual({});
  });
});

describe("clave y registro", () => {
  it("acepta una clave de letras y números, sin espacios alrededor", () => {
    expect(cleanApiKey("  4f2kq8z1x0abcdefghij  ")).toBe("4f2kq8z1x0abcdefghij");
    expect(cleanApiKey("con espacios en medio 123")).toBeNull();
    expect(cleanApiKey("corta")).toBeNull();
  });
  it("el registro de lo sincronizado guarda solo los días recientes", () => {
    expect(pruneSynced({ "2025-01-01": 400, "2026-10-01": 420 }, "2026-01-01")).toEqual({ "2026-10-01": 420 });
  });
});
