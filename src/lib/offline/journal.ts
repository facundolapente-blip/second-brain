"use client";

// Las acciones de journal-actions.ts envueltas para funcionar sin conexión (ver offline/queue.ts).
import { saveEntry as _saveEntry, discardIfEmpty as _discardIfEmpty, setEntryStarred as _setEntryStarred } from "../journal-actions";
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
