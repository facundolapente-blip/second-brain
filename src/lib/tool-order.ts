/** Orden propio de las Herramientas del menú lateral (las arrastra Facu; 2026-11-22). */
export const TOOL_ORDER_KEY = "herramientas_orden";

/**
 * Lo guardado (JSON con las direcciones) acomodado contra las herramientas que existen:
 * las que ya no están se ignoran y las nuevas van al final, en su orden de siempre.
 */
export function normalizeToolOrder(raw: unknown, all: string[]): string[] {
  let list: unknown = raw;
  if (typeof raw === "string") {
    try {
      list = JSON.parse(raw);
    } catch {
      list = null;
    }
  }
  const known = new Set(all);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const h of Array.isArray(list) ? list : []) {
    if (typeof h === "string" && known.has(h) && !seen.has(h)) {
      seen.add(h);
      out.push(h);
    }
  }
  return [...out, ...all.filter((h) => !seen.has(h))];
}
