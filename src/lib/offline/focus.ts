"use client";

// Las acciones de focus-actions.ts envueltas para funcionar sin conexión (ver offline/queue.ts).
import {
  saveFocusSession as _saveFocusSession,
  updateFocusNote as _updateFocusNote,
  saveFocusSettings as _saveFocusSettings,
  saveFocusPush as _saveFocusPush,
} from "../focus-actions";
import { queueable } from "./queue";
// El aviso del final va tal cual: sin señal, para cuando vuelva ya no sirve.
export { deleteFocusSession, sendFocusPush } from "../focus-actions";
export type { FocusSessionInput } from "../focus-actions";

/** Anotar una sesión terminada: no se repite si la cola la reintenta. */
export const saveFocusSession = queueable("focus.saveFocusSession", _saveFocusSession, { once: true });
/** "¿Qué hiciste?": sin señal queda la última de cada sesión. */
export const updateFocusNote = queueable("focus.updateFocusNote", _updateFocusNote, { key: (id) => id });
/** Los tiempos: queda el último. */
export const saveFocusSettings = queueable("focus.saveFocusSettings", _saveFocusSettings, { key: () => "tiempos" });
/** Avisar al celular y al reloj: queda el último. */
export const saveFocusPush = queueable("focus.saveFocusPush", _saveFocusPush, { key: () => "aviso" });
