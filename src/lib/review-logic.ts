/** Revisión semanal (servidor y cliente). */

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
