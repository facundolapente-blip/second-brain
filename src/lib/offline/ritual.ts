"use client";

// La acción de ritual-actions.ts envuelta para funcionar sin conexión (ver offline/queue.ts).
import { saveRitual as _saveRitual } from "../ritual-actions";
import { queueable } from "./queue";

// Sin señal, el último cambio de los mismos campos del mismo día reemplaza a los anteriores
// (la misión que se escribe de a poco queda una sola).
export const saveRitual = queueable("ritual.saveRitual", _saveRitual, {
  key: (day, patch) => `${day}:${Object.keys((patch ?? {}) as object).sort().join(",")}`,
});
