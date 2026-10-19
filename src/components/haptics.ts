/**
 * Pulso corto del celular para acusar recibo de un toque. Sin React: se puede
 * llamar desde cualquier manejador. No hace nada si el aparato no vibra (la
 * compu, iPhone) ni con movimiento reducido.
 *
 * - tap: un toque común (8 ms)
 * - select: cambiar una opción, deslizar de página (6 ms)
 * - threshold: cruzar un umbral mientras se arrastra (10 ms)
 * - success: algo salió bien (12 ms)
 * - error: algo falló ([20, 40, 20])
 * - complete: terminar algo grande, "Día completo" ([12, 60, 24])
 */
export type HapticKind = "tap" | "select" | "success" | "threshold" | "complete" | "error";

const PATTERNS: Record<HapticKind, number | number[]> = {
  tap: 8,
  select: 6,
  threshold: 10,
  success: 12,
  error: [20, 40, 20],
  complete: [12, 60, 24],
};

export function haptic(kind: HapticKind): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    navigator.vibrate(PATTERNS[kind]);
  } catch {
    // Algunos navegadores bloquean vibrate sin un gesto previo: no pasa nada.
  }
}
