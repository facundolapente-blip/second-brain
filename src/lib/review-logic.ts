/** Revisión semanal (servidor y cliente). */
import { startOfWeek } from "./dates";

/** Etiqueta de las entradas del journal que son la reflexión de la semana. */
export const REVIEW_TAG = "revision-semanal";
/** La reflexión del trimestre (Objetivos → Revisión del Qn). */
export const QUARTER_REVIEW_TAG = "revision-trimestral";

/** Preguntas con las que arranca la reflexión. */
export const REVIEW_TEMPLATE = [
  "¿Qué salió bien esta semana?",
  "",
  "",
  "¿Qué no salió como quería?",
  "",
  "",
  "¿Qué aprendí?",
  "",
  "",
  "¿Qué cambio la semana que viene?",
  "",
].join("\n");

/**
 * Agrupa días seguidos para las tiras chicas de las cifras (Revisión, Resumen): hasta 10
 * días, de a uno; hasta 62, por semana (de lunes); más, por mes. Respeta el orden.
 */
export function bucketDays<T extends { date: string }>(days: T[]): { key: string; days: T[] }[] {
  const keyOf =
    days.length <= 10 ? (d: string) => d : days.length <= 62 ? (d: string) => startOfWeek(d, 1) : (d: string) => d.slice(0, 7);
  const out: { key: string; days: T[] }[] = [];
  for (const d of days) {
    const k = keyOf(d.date);
    const last = out.at(-1);
    if (last && last.key === k) last.days.push(d);
    else out.push({ key: k, days: [d] });
  }
  return out;
}
