"use client";

// Las acciones de journal-actions.ts envueltas para funcionar sin conexión (ver offline/queue.ts).
import { saveEntry as _saveEntry, discardIfEmpty as _discardIfEmpty, setEntryStarred as _setEntryStarred, duplicateEntry as _duplicateEntry, moveEntryDate as _moveEntryDate } from "../journal-actions";
import { isNetworkError, queueable } from "./queue";
export { writeOnDay, shareToJournal, deleteEntry, writeWeeklyReview } from "../journal-actions";
export type { EntryInput, SaveResult } from "../journal-actions";

export const saveEntry = queueable("journal.saveEntry", _saveEntry, { key: (id) => id });
/** La estrella: sin señal queda la última de cada entrada. */
export const setEntryStarred = queueable("journal.setEntryStarred", _setEntryStarred, { key: (id) => id });
/** Sin señal no hace nada (devuelve null). */
export const discardIfEmpty: typeof _discardIfEmpty = (async (...args: Parameters<typeof _discardIfEmpty>) => {
  try {
    return await _discardIfEmpty(...args);
  } catch (e) {
    if (isNetworkError(e)) return null;
    throw e;
  }
}) as typeof _discardIfEmpty;
/** Copia de una entrada: no se repite si la cola la reintenta. */
export const duplicateEntry = queueable("journal.duplicateEntry", _duplicateEntry, { once: true });
/** Cambiar de día: sin señal queda el último de cada entrada. */
export const moveEntryDate = queueable("journal.moveEntryDate", _moveEntryDate, { key: (id) => id });
