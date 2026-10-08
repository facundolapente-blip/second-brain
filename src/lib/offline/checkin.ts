"use client";

// Las acciones de checkin-actions.ts envueltas para funcionar sin conexión (ver offline/queue.ts).
import { saveCheckin as _saveCheckin } from "../checkin-actions";
import { queueable } from "./queue";
export { importHealth } from "../checkin-actions";
export type { HealthImportResult } from "../checkin-actions";

export const saveCheckin = queueable("checkin.saveCheckin", _saveCheckin);
