import { describe, expect, it } from "vitest";
import { dayAtEnd, looksLikeExpense, looksLikePrice, parseBlock, parseCheckin, parseCommand, parseJournal, parseTask, sleepOf } from "@/lib/bot/parse";

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

  it("ayer solo en el primer renglón y el texto abajo va a ayer", () => {
    expect(parseJournal("ayer\n\nHoy me sentí más tranquilo", TODAY)).toEqual({ date: "2026-10-18", text: "Hoy me sentí más tranquilo" });
    expect(parseJournal("Ayer \r\ntexto", TODAY)).toEqual({ date: "2026-10-18", text: "texto" });
    expect(parseJournal("ayer. cena", TODAY)).toEqual({ date: "2026-10-18", text: "cena" });
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

describe("día y hora en cualquier lugar (pedido de Facu)", () => {
  // TODAY = lunes 19/10/2026
  it("bloque con el día y la hora adelante", () => {
    expect(parseBlock("Domingo 17hs Estadio", TODAY)).toEqual({ title: "Estadio", date: "2026-10-25", startTime: "17:00", endTime: null });
    expect(parseBlock("mañana 18 gym", TODAY)).toEqual({ title: "Gym", date: "2026-10-20", startTime: "18:00", endTime: null });
    expect(parseBlock("jueves 18:30-20:30 ORT", TODAY)).toEqual({ title: "ORT", date: "2026-10-22", startTime: "18:30", endTime: "20:30" });
  });
  it("lo de siempre sigue igual", () => {
    expect(parseBlock("gym mañana 18", TODAY)).toEqual({ title: "Gym", date: "2026-10-20", startTime: "18:00", endTime: null });
    expect(parseBlock("capítulo 3", TODAY)).toEqual({ title: "Capítulo 3", date: TODAY, startTime: null, endTime: null });
  });
  it("un número suelto en el medio sin día no es una hora", () => {
    expect(parseBlock("gym 3 series", TODAY)).toEqual({ title: "Gym 3 series", date: TODAY, startTime: null, endTime: null });
  });
  it("tarea con el día adelante", () => {
    expect(parseTask("viernes llamar al banco", TODAY)).toEqual({ title: "Llamar al banco", deadline: "2026-10-23" });
  });
});

describe("mensajes sin comando (Notas)", () => {
  it("precio suelto después de un link de tienda", () => {
    for (const t of ["260 con envio", "250 con envío", "95 usd c/u", "$ 1.200", "u$s 40", "1500"]) expect(looksLikePrice(t), t).toBe(true);
    for (const t of ["350 almuerzo", "3 perfumes", "Curso nico gallusi", "260 con envio\notra cosa"]) expect(looksLikePrice(t), t).toBe(false);
  });
  it("gasto sin GG: un renglón que empieza con el monto y tiene palabras", () => {
    for (const t of ["350 almuerzo itau", "+750 disco prex", "usd 20 nafta", "$ 300 taxi"]) expect(looksLikeExpense(t), t).toBe(true);
    for (const t of ["+49 9286 9555-0", "3 perfumes\n3 libros", "https://youtu.be/abc", "Sauverox", "1500"]) expect(looksLikeExpense(t), t).toBe(false);
  });
});

describe("check-in por WhatsApp (CC)", () => {
  it("CC, checkin, check-in y animo son el check-in", () => {
    expect(parseCommand("CC animo 4").cmd).toBe("checkin");
    expect(parseCommand("checkin 4 3 2").cmd).toBe("checkin");
    expect(parseCommand("check-in 4").cmd).toBe("checkin");
    expect(parseCommand("Ánimo 4").cmd).toBe("checkin");
  });

  it("todo junto, con tildes y la nota al final tal cual", () => {
    expect(parseCheckin("Ánimo 4 energía 3 estrés 2 sueño 7:30 peso 82,4 nota Dormí Poco", TODAY)).toEqual({
      date: TODAY,
      fields: { mood: 4, energy: 3, stress: 2, sleepMin: 450, weightG: 82400 },
      note: "Dormí Poco",
    });
  });

  it("4 3 2 es ánimo, energía y estrés; ayer adelante va a ayer", () => {
    expect(parseCheckin("4 3 2", TODAY)).toEqual({ date: TODAY, fields: { mood: 4, energy: 3, stress: 2 }, note: null });
    expect(parseCheckin("ayer animo bien", TODAY)).toEqual({ date: "2026-10-18", fields: { mood: 4 }, note: null });
  });

  it("palabras de las escalas y separadores", () => {
    expect(parseCheckin("animo: muy bien, energia a full, estres nada", TODAY)).toMatchObject({ fields: { mood: 5, energy: 5, stress: 1 } });
    expect(parseCheckin("animo 4/5", TODAY)).toMatchObject({ fields: { mood: 4 } });
  });

  it("el sueño en varias formas", () => {
    expect(sleepOf("7:30")).toBe(450);
    expect(sleepOf("7h30")).toBe(450);
    expect(sleepOf("7 h 30")).toBe(450);
    expect(sleepOf("7.30")).toBe(450);
    expect(sleepOf("7,5")).toBe(450);
    expect(sleepOf("8")).toBe(480);
    expect(sleepOf("8 horas")).toBe(480);
    expect(sleepOf("450 min")).toBe(450);
    expect(sleepOf("7:75")).toBeNull();
    expect(sleepOf("20")).toBeNull();
  });

  it("peso con kg y valores fuera de rango", () => {
    expect(parseCheckin("peso 82.4kg", TODAY)).toMatchObject({ fields: { weightG: 82400 } });
    expect(parseCheckin("animo 7", TODAY)).toHaveProperty("error");
    expect(parseCheckin("peso 900", TODAY)).toHaveProperty("error");
    expect(parseCheckin("hola que tal", TODAY)).toHaveProperty("error");
  });

  it("sin nada (o solo ayer) muestra cómo va", () => {
    expect(parseCheckin("", TODAY)).toEqual({ show: TODAY });
    expect(parseCheckin("ayer", TODAY)).toEqual({ show: "2026-10-18" });
  });

  it("solo la nota", () => {
    expect(parseCheckin("nota me dolió la cabeza", TODAY)).toEqual({ date: TODAY, fields: {}, note: "me dolió la cabeza" });
  });
});

import { isSkipMessage } from "@/lib/bot/parse";

describe("isSkipMessage (NO adelante)", () => {
  it("NO en mayúsculas al principio: no se anota", () => {
    for (const t of ["NO", "NO esto es solo para mí", "NO: probando", "NO, nada", "  NO\nalgo"]) expect(isSkipMessage(t)).toBe(true);
  });
  it("un no normal o una palabra que empieza con NO sigue yendo a Notas", () => {
    for (const t of ["no sé si comprar esto", "No me olvido", "NOTA importante", "NOVEDAD", "nota algo", "", null]) expect(isSkipMessage(t)).toBe(false);
  });
});
