"use client";

// Sincronizar con Google Calendar necesita el servidor (y a Google): pasa tal cual, sin cola.
export { disconnectGcal, syncGcalNow } from "../gcal-actions";
export type { GcalResult } from "../gcal-actions";
