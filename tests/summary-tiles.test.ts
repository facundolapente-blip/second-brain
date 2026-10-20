import { describe, expect, it } from "vitest";
import { bucketDays } from "../src/lib/review-logic";
import { addDays } from "../src/lib/dates";

const range = (from: string, n: number) => Array.from({ length: n }, (_, i) => ({ date: addDays(from, i) }));

describe("bucketDays (tiras chicas de Revisión y Resumen)", () => {
  it("una semana va de a un día", () => {
    const b = bucketDays(range("2026-10-13", 7));
    expect(b).toHaveLength(7);
    expect(b[0]).toEqual({ key: "2026-10-13", days: [{ date: "2026-10-13" }] });
  });
  it("un mes va por semana de lunes (la primera, cortada)", () => {
    const b = bucketDays(range("2026-10-01", 31));
    expect(b.map((x) => x.key)).toEqual(["2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"]);
    expect(b[0].days).toHaveLength(4);
    expect(b.reduce((n, x) => n + x.days.length, 0)).toBe(31);
  });
  it("un año va por mes", () => {
    const b = bucketDays(range("2026-01-01", 365));
    expect(b).toHaveLength(12);
    expect(b[1]).toMatchObject({ key: "2026-02" });
    expect(b[1].days).toHaveLength(28);
  });
  it("sin días, nada", () => {
    expect(bucketDays([])).toEqual([]);
  });
});
