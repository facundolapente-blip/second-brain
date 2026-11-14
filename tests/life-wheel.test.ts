import { describe, expect, it } from "vitest";
import { addMonthsIso, joinWheelNote, noteByArea, splitWheelNote, formatDelta, formatScore, nextWheelDate, normalizeScore, notionArea, notionDate, parseScores, radarPoints, scoreDelta, wheelAverage } from "@/lib/life-wheel";

describe("rueda de la vida", () => {
  const jun26 = { Salud: 7, Finanzas: 6, Amor: 7, "Entorno físico": 9, "Desarrollo profesional": 8, "Desarrollo personal": 8.5, Ocio: 8, Relaciones: 8 };
  const jun25 = { Salud: 9.5, Finanzas: 7.5, Amor: 7, "Entorno físico": 9, "Desarrollo profesional": 8.8, "Desarrollo personal": 8, Ocio: 6, Relaciones: 7 };
  it("promedio y cambios como en su Notion", () => {
    expect(wheelAverage(jun26)).toBe(7.7);
    expect(wheelAverage(jun25)).toBe(7.9);
    expect(scoreDelta(jun26, jun25, "Salud")).toBe(-2.5);
    expect(scoreDelta(jun26, jun25, "Ocio")).toBe(2);
    expect(scoreDelta(jun26, jun25, "Desarrollo profesional")).toBe(-0.8);
    expect(scoreDelta(jun26, null, "Ocio")).toBeNull();
    expect(wheelAverage({})).toBeNull();
  });
  it("muestra los números con coma y signo", () => {
    expect(formatScore(8.5)).toBe("8,5");
    expect(formatScore(7)).toBe("7");
    expect(formatDelta(-2.5)).toBe("−2,5");
    expect(formatDelta(0.5)).toBe("+0,5");
    expect(formatDelta(0)).toBe("=");
  });
  it("normaliza puntajes", () => {
    expect(normalizeScore("8,5")).toBe(8.5);
    expect(normalizeScore(8.83)).toBe(8.8);
    expect(normalizeScore(11)).toBeNull();
    expect(normalizeScore("x")).toBeNull();
    expect(parseScores({ Salud: "7", Ocio: 12, "": 3 })).toEqual({ Salud: 7 });
  });
  it("cada 9 meses", () => {
    expect(nextWheelDate("2026-06-08")).toBe("2027-03-08");
    expect(addMonthsIso("2026-05-31", 9)).toBe("2027-02-28");
    expect(addMonthsIso("2026-11-15", -12)).toBe("2025-11-15");
  });
  it("telaraña: Salud arriba", () => {
    const pts = radarPoints({ Salud: 10 }, 100, 100, 80).split(" ");
    expect(pts[0]).toBe("100,20");
    expect(pts[2]).toBe("100,100");
  });
  it("lee el export de Notion", () => {
    expect(notionDate("08/06/2026")).toBe("2026-06-08");
    expect(notionDate("31/02/2026")).toBeNull();
    expect(notionArea("4 EF")).toBe("Entorno físico");
    expect(notionArea("5 D Profesional")).toBe("Desarrollo profesional");
    expect(notionArea("8 Relaciones")).toBe("Relaciones");
    expect(notionArea("9 Otra")).toBeNull();
  });
});

describe("lo escrito en una rueda", () => {
  it("separa por área y deja los rótulos como subtítulo", () => {
    const note = "Intro suelta.\n1. Salud.\nBien en general.\n\n4. Entorno físico.\nMe gusta mi cuarto.\n5. Desarrollo profesional.\nTrabajo\nEstoy sin empleo.\n\nDj/Productor\nSaqué un EP.";
    const parts = splitWheelNote(note);
    expect(parts.map((p) => p.area)).toEqual([null, "Salud", "Entorno físico", "Desarrollo profesional"]);
    expect(parts[3].blocks).toEqual([
      { title: "Trabajo", text: "Estoy sin empleo." },
      { title: "Dj/Productor", text: "Saqué un EP." },
    ]);
    expect(parts[1].blocks).toEqual([{ title: null, text: "Bien en general." }]);
  });
  it("sin áreas, todo junto", () => {
    expect(splitWheelNote("Una nota corta")).toEqual([{ area: null, blocks: [{ title: null, text: "Una nota corta" }] }]);
    expect(splitWheelNote("")).toEqual([]);
  });
});

describe("texto por área", () => {
  it("separa y vuelve a juntar sin perder nada", () => {
    const note = "Algo general.\n\n1. Salud.\nBien.\n\n5. Desarrollo profesional.\nTrabajo\nSin empleo.\n\nFacultad\nPoca motivación.";
    const by = noteByArea(note);
    expect(by.intro).toBe("Algo general.");
    expect(by.byArea["Desarrollo profesional"]).toBe("Trabajo\nSin empleo.\n\nFacultad\nPoca motivación.");
    expect(joinWheelNote(by)).toBe(note);
    expect(noteByArea(joinWheelNote(by))).toEqual(by);
  });
  it("sin nada escrito", () => {
    expect(joinWheelNote({ intro: " ", byArea: { Salud: "" } })).toBe("");
  });
});
