import { describe, expect, it } from "vitest";
import {
  averageOf,
  healthHighlights,
  changeOf,
  emptyHealthDay,
  hasAnyData,
  healthPeriod,
  kmText,
  monthlyAverages,
  niceCeil,
  periodFromParams,
  sleepText,
  stressLevel,
  summarizeHealth,
  type HealthDay,
} from "../src/lib/health-logic";

const day = (date: string, v: Partial<HealthDay> = {}): HealthDay => ({ ...emptyHealthDay(date), ...v });

describe("periodFromParams y healthPeriod", () => {
  it("toma el mes o el año de la dirección, sin futuros", () => {
    expect(periodFromParams({}, "2026-10-20")).toEqual({ kind: "month", key: "2026-10" });
    expect(periodFromParams({ mes: "2026-09" }, "2026-10-20")).toEqual({ kind: "month", key: "2026-09" });
    expect(periodFromParams({ mes: "2026-11" }, "2026-10-20")).toEqual({ kind: "month", key: "2026-10" });
    expect(periodFromParams({ mes: "2026-13" }, "2026-10-20")).toEqual({ kind: "month", key: "2026-10" });
    expect(periodFromParams({ anio: "2025" }, "2026-10-20")).toEqual({ kind: "year", key: "2025" });
    expect(periodFromParams({ anio: "2027" }, "2026-10-20")).toEqual({ kind: "month", key: "2026-10" });
  });
  it("el mes en curso se compara con el anterior hasta el mismo día", () => {
    expect(healthPeriod("month", "2026-10", "2026-10-20")).toMatchObject({
      from: "2026-10-01",
      to: "2026-10-20",
      prevKey: "2026-09",
      prevFrom: "2026-09-01",
      prevTo: "2026-09-20",
      isCurrent: true,
    });
    // 31 contra un mes de 30 días: hasta el último.
    expect(healthPeriod("month", "2026-10", "2026-10-31").prevTo).toBe("2026-09-30");
    expect(healthPeriod("month", "2026-08", "2026-10-20")).toMatchObject({ to: "2026-08-31", prevTo: "2026-07-31", isCurrent: false });
  });
  it("el año en curso, contra el anterior hasta el mismo día", () => {
    expect(healthPeriod("year", "2026", "2026-10-20")).toMatchObject({ from: "2026-01-01", to: "2026-10-20", prevKey: "2025", prevTo: "2025-10-20" });
    expect(healthPeriod("year", "2028", "2028-02-29").prevTo).toBe("2027-02-28");
    expect(healthPeriod("year", "2025", "2026-10-20")).toMatchObject({ to: "2025-12-31", prevTo: "2024-12-31", isCurrent: false });
  });
});

describe("promedios", () => {
  const days = [
    day("2026-10-18", { steps: 8000, sleepMin: 420, stress: 30 }),
    day("2026-10-19", { steps: 12000, sleepMin: 480 }),
    day("2026-10-20", { steps: 900, sleepMin: 450, weightG: 78400 }),
  ];
  it("los días sin dato son huecos y hoy no entra en lo que se acumula durante el día", () => {
    expect(averageOf(days, "steps", "2026-10-20")).toBe(10000);
    // El sueño de hoy ya terminó: entra.
    expect(averageOf(days, "sleepMin", "2026-10-20")).toBe(450);
    expect(averageOf(days, "stress", "2026-10-20")).toBe(30);
    expect(averageOf(days, "hrMin", "2026-10-20")).toBeNull();
  });
  it("resume contra el período anterior; el peso es el último", () => {
    const before = [day("2026-09-10", { steps: 5000, weightG: 79000 }), day("2026-09-12", { weightG: 79200 })];
    const s = summarizeHealth(days, before, "2026-10-20");
    expect(s.steps).toEqual({ avg: 10000, days: 2, prevAvg: 5000 });
    expect(s.weight.last).toEqual({ date: "2026-10-20", value: 78400 });
    expect(s.weight.prevLast).toEqual({ date: "2026-09-12", value: 79200 });
    expect(changeOf(s.steps.avg, s.steps.prevAvg, "pct")).toBe(100);
  });
  it("promedia por mes para la vista del año", () => {
    const m = monthlyAverages([day("2026-09-01", { steps: 1000 }), day("2026-09-02", { steps: 3000 }), day("2026-10-01", { weightG: 80000 }), day("2026-10-02", { weightG: 79000 })], "2026-10-20");
    expect(m.map((x) => [x.month, x.steps, x.weightG])).toEqual([
      ["2026-09", 2000, null],
      ["2026-10", null, 79000],
    ]);
  });
  it("sabe si hay algún dato", () => {
    expect(hasAnyData([day("2026-10-01")])).toBe(false);
    expect(hasAnyData([day("2026-10-01", { hrMax: 140 })])).toBe(true);
  });
});

describe("cambios y formato", () => {
  it("cambio en % o en la unidad", () => {
    expect(changeOf(108, 100, "pct")).toBe(8);
    expect(changeOf(5, 0, "pct")).toBeNull();
    expect(changeOf(null, 10, "pct")).toBeNull();
    expect(changeOf(41.4, 38, "diff")).toBe(3);
    expect(changeOf(78.4, 79.2, "diff", 1)).toBe(-0.8);
  });
  it("nivel de estrés de Huawei", () => {
    expect(stressLevel(12).label).toBe("Bajo");
    expect(stressLevel(29.4).label).toBe("Bajo");
    expect(stressLevel(30).label).toBe("Normal");
    expect(stressLevel(59).label).toBe("Normal");
    expect(stressLevel(60).label).toBe("Medio");
    expect(stressLevel(85).label).toBe("Alto");
  });
  it("sueño, distancia y topes del eje", () => {
    expect(sleepText(463)).toBe("7 h 45 min");
    expect(sleepText(481)).toBe("8 h");
    expect(sleepText(null)).toBe("–");
    expect(kmText(6240)).toBe("6,2 km");
    expect(niceCeil(13500)).toBe(20000);
    expect(niceCeil(3800)).toBe(4000);
    expect(niceCeil(480)).toBe(500);
  });
});

describe("healthHighlights", () => {
  const day = (date: string, v: Partial<HealthDay>): HealthDay => ({ ...emptyHealthDay(date), ...v });
  const days = [
    day("2026-09-01", { steps: 9000, sleepMin: 480, stress: 20, distanceM: 6000 }),
    day("2026-09-02", { steps: 4000, sleepMin: 360, stress: 15, distanceM: 2500 }),
    day("2026-09-03", { steps: 12000, sleepMin: 500, stress: 30, distanceM: 9000 }),
    day("2026-09-04", { steps: 20000, stress: 10 }),
  ];
  it("cuenta los días que llegaron a la meta y encuentra los récords", () => {
    const h = healthHighlights(days, "2026-09-30");
    expect(h.stepsGoal).toEqual({ hit: 3, of: 4 });
    expect(h.sleepGoal).toEqual({ hit: 2, of: 3 });
    expect(h.bestSteps).toEqual({ date: "2026-09-04", value: 20000 });
    expect(h.longestSleep).toEqual({ date: "2026-09-03", value: 500 });
    expect(h.calmest).toEqual({ date: "2026-09-04", value: 10 });
    expect(h.farthest).toEqual({ date: "2026-09-03", value: 9000 });
  });
  it("hoy no cuenta en lo que se acumula durante el día", () => {
    const h = healthHighlights(days, "2026-09-04");
    expect(h.stepsGoal).toEqual({ hit: 2, of: 3 });
    expect(h.bestSteps?.date).toBe("2026-09-03");
  });
});
