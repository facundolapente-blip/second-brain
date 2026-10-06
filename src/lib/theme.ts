/**
 * Temas de la app. Se guardan en una cookie para que el servidor pinte la
 * página ya con el tema elegido (sin un parpadeo del tema por defecto).
 *  - auto:   Arena de día y Noche cuando el sistema está en modo oscuro
 *  - arena:  fondo arena cálido, menú de tinta, tarjetas crema
 *  - modulo: cada módulo con su color (Hábitos verde, Journal lavanda, ...)
 *  - noche:  oscuro, carbón con un resplandor del acento
 */
export const THEMES = [
  { id: "auto", label: "Auto" },
  { id: "arena", label: "Arena" },
  { id: "modulo", label: "Color" },
  { id: "noche", label: "Noche" },
] as const;

export type Theme = (typeof THEMES)[number]["id"];

export const THEME_COOKIE = "sb_tema";

export function isTheme(v: unknown): v is Theme {
  return typeof v === "string" && THEMES.some((t) => t.id === v);
}
