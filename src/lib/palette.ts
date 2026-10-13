/**
 * Colores para hábitos, cuentas y categorías: pasteles apagados que solo marcan
 * identidad. Cada uno resuelve a variables CSS definidas en globals.css, así el
 * modo oscuro tiene su propia versión sin lógica en los componentes.
 */
export const PALETTE = ["stone", "red", "orange", "brown", "yellow", "green", "teal", "blue", "purple", "pink"] as const;
export type PaletteKey = (typeof PALETTE)[number];

export function isPaletteKey(v: unknown): v is PaletteKey {
  return typeof v === "string" && (PALETTE as readonly string[]).includes(v);
}

/** Estilo inline con las variables del color: fondo suave + tinta. */
export function tone(key: string): React.CSSProperties {
  const k = isPaletteKey(key) ? key : "stone";
  return {
    "--tone-bg": `var(--p-${k}-bg)`,
    "--tone-fg": `var(--p-${k}-fg)`,
    "--tone-solid": `var(--p-${k}-solid)`,
    "--tone-chip": `var(--p-${k}-chip)`,
    "--tone-chip-fg": `var(--p-${k}-chip-fg)`,
  } as React.CSSProperties;
}
