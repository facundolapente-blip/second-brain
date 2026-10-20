import { describe, expect, it } from "vitest";
import { amountFromRate, exchangeRate, formatRate, parseRate, rateLabel } from "@/lib/finance-logic";

describe("tipo de cambio de una transferencia entre monedas", () => {
  it("de dólares a pesos: 100 US$ a 39,50 son $ 3.950", () => {
    expect(amountFromRate("USD", 10000, "UYU", 39.5)).toBe(395000);
    expect(exchangeRate("USD", 10000, "UYU", 395000)).toBe(39.5);
  });

  it("de pesos a dólares: siempre pesos por dólar ($ 4.100 a 41 son 100 US$)", () => {
    expect(amountFromRate("UYU", 410000, "USD", 41)).toBe(10000);
    expect(exchangeRate("UYU", 410000, "USD", 10000)).toBe(41);
  });

  it("redondea al centavo", () => {
    expect(amountFromRate("UYU", 100000, "USD", 39.37)).toBe(2540); // 25,40 US$
  });

  it("misma moneda o montos vacíos: no hay tipo de cambio", () => {
    expect(exchangeRate("UYU", 100, "UYU", 100)).toBeNull();
    expect(exchangeRate("USD", 0, "UYU", 100)).toBeNull();
    expect(amountFromRate("USD", 100, "UYU", 0)).toBeNull();
  });

  it("lee lo que se escribe y lo muestra con coma", () => {
    expect(parseRate("39,5")).toBe(39.5);
    expect(parseRate("39.50")).toBe(39.5);
    expect(parseRate(" 40 ")).toBe(40);
    expect(parseRate("4o")).toBeNull();
    expect(parseRate("0")).toBeNull();
    expect(formatRate(39.5)).toBe("39,50");
    expect(formatRate(0.025316)).toBe("0,0253");
  });

  it("el rótulo dice cuántos pesos por dólar, vaya para donde vaya la plata", () => {
    expect(rateLabel("USD", 10000, "UYU", 395000)).toBe("1 US$ = $ 39,50");
    expect(rateLabel("UYU", 410000, "USD", 10000)).toBe("1 US$ = $ 41,00");
  });
});
