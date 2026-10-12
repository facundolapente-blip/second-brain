/**
 * Temas de la app: Claro (cada módulo con su color) y Oscuro (carbón con un
 * resplandor del color del módulo). Se guardan en una cookie para que el
 * servidor pinte la página ya con el tema elegido, sin parpadeos.
 */
export const THEMES = [
  { id: "claro", label: "Claro" },
  { id: "oscuro", label: "Oscuro" },
] as const;

export type Theme = (typeof THEMES)[number]["id"];

export const THEME_COOKIE = "sb_tema";

/** Lee la cookie; los nombres viejos (noche, modulo, arena, auto) se traducen. */
export function themeFromCookie(v: string | undefined): Theme {
  return v === "oscuro" || v === "noche" ? "oscuro" : "claro";
}

/** Color de la barra del navegador / de estado para cada tema (el fondo de Inicio). */
export const THEME_COLOR: Record<Theme, string> = { claro: "#eef2ec", oscuro: "#141413" };
