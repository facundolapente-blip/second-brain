import { describe, expect, it } from "vitest";
import { eventPatch, eventTimes, localParts, pruneKnown, samePatch, skipEvent, syncStep, type GEvent } from "../src/lib/gcal-logic.ts";

describe("eventos de Google a bloques", () => {
  it("pasa los instantes a hora de Montevideo", () => {
    expect(localParts("2026-10-30T18:30:00Z")).toEqual({ date: "2026-10-30", time: "15:30" });
    expect(localParts("2026-10-31T01:00:00Z")).toEqual({ date: "2026-10-30", time: "22:00" });
    expect(localParts("2026-10-30T15:30:00-03:00")).toEqual({ date: "2026-10-30", time: "15:30" });
  });
  it("con hora: inicio y fin; sin fin si termina otro día", () => {
    expect(eventTimes({ id: "a", start: { dateTime: "2026-10-30T15:00:00-03:00" }, end: { dateTime: "2026-10-30T16:30:00-03:00" } })).toEqual({
      date: "2026-10-30",
      startTime: "15:00",
      endTime: "16:30",
    });
    expect(eventTimes({ id: "a", start: { dateTime: "2026-10-30T23:00:00-03:00" }, end: { dateTime: "2026-10-31T01:00:00-03:00" } })).toEqual({
      date: "2026-10-30",
      startTime: "23:00",
      endTime: null,
    });
  });
  it("todo el día: bloque sin hora en el primer día", () => {
    expect(eventTimes({ id: "a", start: { date: "2026-11-02" }, end: { date: "2026-11-05" } })).toEqual({ date: "2026-11-02", startTime: null, endTime: null });
  });
  it("saltea cancelados y el lugar de trabajo", () => {
    expect(skipEvent({ id: "a", status: "cancelled", start: { date: "2026-11-02" } })).toBe(true);
    expect(skipEvent({ id: "a", eventType: "workingLocation", start: { date: "2026-11-02" } })).toBe(true);
    expect(skipEvent({ id: "a", status: "confirmed", start: { date: "2026-11-02" } })).toBe(false);
  });
});

describe("qué hacer con cada evento", () => {
  const ev: GEvent = { id: "a", updated: "2026-10-30T12:00:00.000Z", start: { date: "2026-11-02" } };
  it("crea lo nuevo; lo ya traído y borrado en la app no vuelve", () => {
    expect(syncStep(ev, undefined, false)).toBe("create");
    expect(syncStep(ev, undefined, true)).toBe("skip");
  });
  it("actualiza solo si Google lo cambió después", () => {
    expect(syncStep(ev, { externalUpdated: "2026-10-30T11:00:00.000Z" }, true)).toBe("update");
    expect(syncStep(ev, { externalUpdated: "2026-10-30T12:00:00.000Z" }, true)).toBe("skip");
    expect(syncStep(ev, { externalUpdated: "2026-10-30T13:00:00.000Z" }, true)).toBe("skip");
  });
  it("olvida lo de hace más de 60 días", () => {
    expect(pruneKnown({ a: "2026-08-01", b: "2026-10-01" }, "2026-10-30")).toEqual({ b: "2026-10-01" });
  });
});

describe("cambio del bloque a Google", () => {
  it("con hora de fin", () => {
    const ev: GEvent = { id: "a", start: { dateTime: "2026-10-30T15:00:00-03:00" }, end: { dateTime: "2026-10-30T16:00:00-03:00" } };
    expect(eventPatch({ date: "2026-11-02", startTime: "10:00", endTime: "12:30" }, ev)).toEqual({
      start: { dateTime: "2026-11-02T10:00:00", timeZone: "America/Montevideo" },
      end: { dateTime: "2026-11-02T12:30:00", timeZone: "America/Montevideo" },
    });
  });
  it("sin fin: conserva la duración que tenía (o 1 h)", () => {
    const ev: GEvent = { id: "a", start: { dateTime: "2026-10-30T15:00:00-03:00" }, end: { dateTime: "2026-10-30T17:00:00-03:00" } };
    expect(eventPatch({ date: "2026-10-31", startTime: "23:00", endTime: null }, ev).end.dateTime).toBe("2026-11-01T01:00:00");
    expect(eventPatch({ date: "2026-10-31", startTime: "09:00", endTime: null }, { id: "b", start: { date: "2026-10-31" }, end: { date: "2026-11-01" } }).end.dateTime).toBe(
      "2026-10-31T10:00:00",
    );
  });
  it("todo el día: conserva cuántos días dura", () => {
    const ev: GEvent = { id: "a", start: { date: "2026-11-02" }, end: { date: "2026-11-05" } };
    expect(eventPatch({ date: "2026-11-09", startTime: null, endTime: null }, ev)).toEqual({ start: { date: "2026-11-09" }, end: { date: "2026-11-12" } });
  });
  it("no manda nada si ya está igual", () => {
    const ev: GEvent = { id: "a", start: { dateTime: "2026-10-30T15:00:00-03:00" }, end: { dateTime: "2026-10-30T16:00:00-03:00" } };
    expect(samePatch(ev, eventPatch({ date: "2026-10-30", startTime: "15:00", endTime: "16:00" }, ev))).toBe(true);
    expect(samePatch(ev, eventPatch({ date: "2026-10-30", startTime: "15:30", endTime: "16:00" }, ev))).toBe(false);
  });
});
