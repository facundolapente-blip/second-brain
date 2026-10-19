import { describe, expect, it } from "vitest";
import { unitLabel } from "../src/lib/habit-logic";

describe("unitLabel: la unidad de un hábito de cantidad en singular con 1", () => {
  it("con 1 va en singular", () => {
    expect(unitLabel(1, "Frutas")).toBe("Fruta");
    expect(unitLabel(1, "vasos")).toBe("vaso");
    expect(unitLabel(1, "páginas")).toBe("página");
    expect(unitLabel(1, "litros")).toBe("litro");
    expect(unitLabel(1, "flexiones")).toBe("flexión");
    expect(unitLabel(1, "veces")).toBe("vez");
    expect(unitLabel(1, "flores")).toBe("flor");
    expect(unitLabel(1, "papeles")).toBe("papel");
    expect(unitLabel(1, "clases")).toBe("clase");
    expect(unitLabel(1, "kms")).toBe("km");
  });
  it("con otro número queda como se escribió", () => {
    expect(unitLabel(0, "Frutas")).toBe("Frutas");
    expect(unitLabel(3, "vasos")).toBe("vasos");
    expect(unitLabel(2000, "ml")).toBe("ml");
  });
  it("las que no terminan en s, sin unidad o muy cortas, igual", () => {
    expect(unitLabel(1, "ml")).toBe("ml");
    expect(unitLabel(1, "km")).toBe("km");
    expect(unitLabel(1, null)).toBe("");
    expect(unitLabel(1, undefined)).toBe("");
    expect(unitLabel(1, "  pasos ")).toBe("paso");
  });
});
