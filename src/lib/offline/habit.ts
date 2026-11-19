"use client";

// Las acciones de habit-actions.ts envueltas para funcionar sin conexión (ver offline/queue.ts).
import { saveHabit as _saveHabit, startNewTrack as _startNewTrack, mergeLastTrack as _mergeLastTrack, archiveHabit as _archiveHabit, deleteHabit as _deleteHabit, reorderHabits as _reorderHabits, saveCategory as _saveCategory, deleteCategory as _deleteCategory, startLadder as _startLadder, advanceLadder as _advanceLadder, stayLadder as _stayLadder, stepBackLadder as _stepBackLadder, saveLadderSteps as _saveLadderSteps, endLadder as _endLadder, setNeverTwice as _setNeverTwice, advancePart as _advancePart, stayPart as _stayPart } from "../habit-actions";
import { queueable } from "./queue";
export { setHabitLog } from "../habit-actions";
export type { ActionResult, LadderResult } from "../habit-actions";

export const saveHabit = queueable("habit.saveHabit", _saveHabit, { once: true });
export const startNewTrack = queueable("habit.startNewTrack", _startNewTrack, { once: true });
export const mergeLastTrack = queueable("habit.mergeLastTrack", _mergeLastTrack, { once: true });
export const archiveHabit = queueable("habit.archiveHabit", _archiveHabit);
export const deleteHabit = queueable("habit.deleteHabit", _deleteHabit);
export const reorderHabits = queueable("habit.reorderHabits", _reorderHabits, { key: () => "orden" });
export const saveCategory = queueable("habit.saveCategory", _saveCategory, { once: true });
export const deleteCategory = queueable("habit.deleteCategory", _deleteCategory);

// Hábitos en construcción. Empezar, subir y bajar no aguantan repetirse (`once`: un
// "subir" reintentado subiría dos escalones); lo demás pisa lo pendiente del mismo hábito.
export const startLadder = queueable("habit.startLadder", _startLadder, { once: true });
export const advanceLadder = queueable("habit.advanceLadder", _advanceLadder, { once: true });
export const stepBackLadder = queueable("habit.stepBackLadder", _stepBackLadder, { once: true });
export const stayLadder = queueable("habit.stayLadder", _stayLadder, { key: (id) => `escalera-${id}` });
export const saveLadderSteps = queueable("habit.saveLadderSteps", _saveLadderSteps, { key: (id) => `escalones-${id}` });
export const endLadder = queueable("habit.endLadder", _endLadder, { key: (id) => `escalera-${id}` });
export const setNeverTwice = queueable("habit.setNeverTwice", _setNeverTwice, { key: (id) => `nunca-dos-${id}` });

// Hábitos por partes: subir la escalera de una parte no aguanta repetirse; "Todavía no" pisa lo pendiente.
export const advancePart = queueable("habit.advancePart", _advancePart, { once: true });
export const stayPart = queueable("habit.stayPart", _stayPart, { key: (id, part) => `parte-${id}-${part}` });
