"use client";

// Las acciones de checkin-actions.ts envueltas para funcionar sin conexión (ver offline/queue.ts).
import { saveCheckin as _saveCheckin } from "../checkin-actions";
import { queueable } from "./queue";
export { importHealth } from "../checkin-actions";
export type { HealthImportResult } from "../checkin-actions";

// Sin señal, el último cambio de los mismos campos del mismo día reemplaza a los anteriores.
export const saveCheckin = queueable("checkin.saveCheckin", _saveCheckin, {
  key: (date, patch) => `${date}:${Object.keys((patch ?? {}) as object).sort().join(",")}`,
});
