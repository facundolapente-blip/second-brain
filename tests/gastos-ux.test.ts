import { describe, expect, it } from "vitest";
import { cleanAmountInput, parseAmount } from "@/lib/finance-logic";

describe("cleanAmountInput", () => {
  it("deja pasar lo que parseAmount entiende", () => {
    expect(cleanAmountInput("1.250,50")).toBe("1.250,50");
    expect(cleanAmountInput("$ 500+20")).toBe("$ 500+20");
    expect(cleanAmountInput("20x3")).toBe("20x3");
    expect(cleanAmountInput("1500÷3")).toBe("1500÷3");
    expect(cleanAmountInput("100×2−5")).toBe("100×2−5");
  });
  it("saca letras y otros signos (el foco no puede meter texto en el monto)", () => {
    expect(cleanAmountInput("rueba")).toBe("");
    expect(cleanAmountInput("350 almuerzo")).toBe("350 ");
    expect(cleanAmountInput("5e3")).toBe("53");
    expect(cleanAmountInput("12%")).toBe("12");
  });
  it("lo que queda siempre lo puede leer parseAmount o es vacío", () => {
    for (const raw of ["abc", "12a3", "$1.000,5", "4/2", "7xx"]) {
      const c = cleanAmountInput(raw);
      expect(/^[\d.,\s$+\-−–xX×*/÷:]*$/.test(c)).toBe(true);
    }
    expect(parseAmount(cleanAmountInput("1.000 pesos"))).toBe(100000);
  });
});
