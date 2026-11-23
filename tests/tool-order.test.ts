import { describe, expect, it } from "vitest";
import { normalizeToolOrder } from "@/lib/tool-order";

describe("orden de las Herramientas", () => {
  const all = ["/valores", "/semana", "/analisis", "/datos"];
  it("sin nada guardado, el de siempre", () => {
    expect(normalizeToolOrder(null, all)).toEqual(all);
    expect(normalizeToolOrder("no es json", all)).toEqual(all);
  });
  it("respeta lo guardado; las que no existen se ignoran y las nuevas van al final", () => {
    expect(normalizeToolOrder(JSON.stringify(["/datos", "/vieja", "/valores", "/datos"]), all)).toEqual(["/datos", "/valores", "/semana", "/analisis"]);
  });
});
