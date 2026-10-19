import { describe, expect, it } from "vitest";
import { dayAtEnd, parseCommand, parseJournal, parseTask } from "@/lib/bot/parse";

const TODAY = "2026-10-19";

describe("atajos del bot (GG, TT, JJ)", () => {
  it("GG es un gasto y deja el resto tal cual (el + sigue adelante)", () => {
    expect(parseCommand("GG 350 almuerzo itau")).toEqual({ cmd: "gasto", rest: "350 almuerzo itau" });
    expect(parseCommand("gg +2450 sueldo")).toEqual({ cmd: "gasto", rest: "+2450 sueldo" });
  });

  it("TT es una tarea", () => {
    expect(parseCommand("TT llamar al banco viernes")).toEqual({ cmd: "tarea", rest: "llamar al banco viernes" });
    expect(parseTask("llamar al banco viernes", TODAY)).toEqual({ title: "Llamar al banco", deadline: "2026-10-23" });
  });

  it("JJ, diario y journal van al journal", () => {
    expect(parseCommand("JJ hoy entrené").cmd).toBe("diario");
    expect(parseCommand("diario algo").cmd).toBe("diario");
    expect(parseCommand("Journal algo").cmd).toBe("diario");
  });

  it("un gasto sin atajo sigue siendo carga rápida", () => {
    expect(parseCommand("350 almuerzo")).toEqual({ cmd: null, rest: "350 almuerzo" });
  });
});

describe("parseJournal", () => {
  it("sin fecha: hoy, y no se come la palabra hoy ni ayer del texto", () => {
    expect(parseJournal("hoy entrené y me sentí bien", TODAY)).toEqual({ date: TODAY, text: "hoy entrené y me sentí bien" });
    expect(parseJournal("ayer fui al cine", TODAY)).toEqual({ date: TODAY, text: "ayer fui al cine" });
  });

  it("con ayer: o ayer, va a ayer", () => {
    expect(parseJournal("ayer: cena con amigos", TODAY)).toEqual({ date: "2026-10-18", text: "cena con amigos" });
    expect(parseJournal("Ayer, cena", TODAY)).toEqual({ date: "2026-10-18", text: "cena" });
  });

  it("respeta los saltos de línea y avisa si falta el texto", () => {
    expect(parseJournal("primero\n\nsegundo", TODAY)).toEqual({ date: TODAY, text: "primero\n\nsegundo" });
    expect(parseJournal("ayer:", TODAY)).toHaveProperty("error");
  });
});

describe("fechas del bot", () => {
  it("acepta una fecha ISO al final", () => {
    expect(dayAtEnd(["pagar", "2026-10-25"], TODAY)).toEqual({ date: "2026-10-25", used: 1 });
  });
});
