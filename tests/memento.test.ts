import { describe, expect, it } from "vitest";
import { addYears, mementoStats, parseMemento, serializeMemento } from "@/lib/memento";

describe("memento mori", () => {
  const facu = { birth: "1999-07-27", years: 75 };
  it("cuenta las semanas vividas y las que hay hasta los 75", () => {
    const s = mementoStats(facu, "2026-11-14");
    expect(s.lived).toBe(1424);
    expect(s.total).toBe(3913);
    expect(s.left).toBe(3913 - 1424);
    expect(Math.round(s.share * 100)).toBe(36);
    expect(s.age).toBe(27);
    expect(s.weekOfYear).toBe(16);
  });
  it("el día del cumpleaños ya suma el año", () => {
    expect(mementoStats(facu, "2027-07-27").age).toBe(28);
    expect(mementoStats(facu, "2027-07-26").age).toBe(27);
  });
  it("29 de febrero en un año sin él cae el 28", () => {
    expect(addYears("2000-02-29", 1)).toBe("2001-02-28");
    expect(addYears("2000-02-29", 4)).toBe("2004-02-29");
  });
  it("lee y escribe la configuración", () => {
    expect(parseMemento(serializeMemento(facu))).toEqual(facu);
    expect(parseMemento('{"nacimiento":"1999-02-30","anios":75}')).toBeNull();
    expect(parseMemento('{"nacimiento":"1999-07-27","anios":3}')).toEqual({ birth: "1999-07-27", years: 75 });
    expect(parseMemento("no")).toBeNull();
  });
});
