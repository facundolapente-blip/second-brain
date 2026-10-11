"use client";

// Las acciones de habit-actions.ts envueltas para funcionar sin conexión (ver offline/queue.ts).
import { saveHabit as _saveHabit, startNewTrack as _startNewTrack, mergeLastTrack as _mergeLastTrack, archiveHabit as _archiveHabit, deleteHabit as _deleteHabit, reorderHabits as _reorderHabits, saveCategory as _saveCategory, deleteCategory as _deleteCategory } from "../habit-actions";
import { queueable } from "./queue";
export { setHabitLog } from "../habit-actions";
export type { ActionResult } from "../habit-actions";

export const saveHabit = queueable("habit.saveHabit", _saveHabit, { once: true });
export const startNewTrack = queueable("habit.startNewTrack", _startNewTrack, { once: true });
export const mergeLastTrack = queueable("habit.mergeLastTrack", _mergeLastTrack, { once: true });
export const archiveHabit = queueable("habit.archiveHabit", _archiveHabit);
export const deleteHabit = queueable("habit.deleteHabit", _deleteHabit);
export const reorderHabits = queueable("habit.reorderHabits", _reorderHabits, { key: () => "orden" });
export const saveCategory = queueable("habit.saveCategory", _saveCategory, { once: true });
export const deleteCategory = queueable("habit.deleteCategory", _deleteCategory);
