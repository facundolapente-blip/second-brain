"use client";

// Las acciones de plan-actions.ts envueltas para funcionar sin conexión (ver offline/queue.ts).
import { saveBlock as _saveBlock, setBlockDone as _setBlockDone, renameBlock as _renameBlock, duplicateBlock as _duplicateBlock, deleteBlock as _deleteBlock, passToNextWeek as _passToNextWeek, passWeek as _passWeek, copyWeekToNext as _copyWeekToNext, saveTask as _saveTask, setTaskStatus as _setTaskStatus, bumpTaskProgress as _bumpTaskProgress, saveTaskColumns as _saveTaskColumns, setTaskScheduled as _setTaskScheduled, reorderTasks as _reorderTasks, renameTask as _renameTask, duplicateTask as _duplicateTask, deleteTask as _deleteTask, saveKeyResult as _saveKeyResult, deleteKeyResult as _deleteKeyResult, saveCategory as _saveCategory, rescheduleBlock as _rescheduleBlock, moveBlock as _moveBlock, addSubtask as _addSubtask, toggleSubtask as _toggleSubtask, deleteSubtask as _deleteSubtask, saveObjective as _saveObjective, deleteObjective as _deleteObjective, copyToYear as _copyToYear, scheduleTask as _scheduleTask } from "../plan-actions";
import { queueable } from "./queue";
export type { ActionResult } from "../plan-actions";

export const saveBlock = queueable("plan.saveBlock", _saveBlock, { once: true });
export const setBlockDone = queueable("plan.setBlockDone", _setBlockDone, { key: (id) => id });
export const renameBlock = queueable("plan.renameBlock", _renameBlock, { key: (id) => id });
export const duplicateBlock = queueable("plan.duplicateBlock", _duplicateBlock, { once: true });
export const deleteBlock = queueable("plan.deleteBlock", _deleteBlock);
export const passToNextWeek = queueable("plan.passToNextWeek", _passToNextWeek, { once: true });
export const passWeek = queueable("plan.passWeek", _passWeek, { once: true });
export const copyWeekToNext = queueable("plan.copyWeekToNext", _copyWeekToNext, { once: true });
export const saveTask = queueable("plan.saveTask", _saveTask, { once: true });
export const setTaskStatus = queueable("plan.setTaskStatus", _setTaskStatus, { once: true });
export const bumpTaskProgress = queueable("plan.bumpTaskProgress", _bumpTaskProgress, { once: true });
export const saveTaskColumns = queueable("plan.saveTaskColumns", _saveTaskColumns, { key: () => "columnas" });
export const setTaskScheduled = queueable("plan.setTaskScheduled", _setTaskScheduled, { key: (id) => id });
export const reorderTasks = queueable("plan.reorderTasks", _reorderTasks, { key: () => "orden" });
export const renameTask = queueable("plan.renameTask", _renameTask, { key: (id) => id });
export const duplicateTask = queueable("plan.duplicateTask", _duplicateTask, { once: true });
export const deleteTask = queueable("plan.deleteTask", _deleteTask);
export const saveKeyResult = queueable("plan.saveKeyResult", _saveKeyResult, { once: true });
export const deleteKeyResult = queueable("plan.deleteKeyResult", _deleteKeyResult);
export const saveCategory = queueable("plan.saveCategory", _saveCategory, { once: true });
export const rescheduleBlock = queueable("plan.rescheduleBlock", _rescheduleBlock, { key: (id) => id });
export const moveBlock = queueable("plan.moveBlock", _moveBlock);
export const addSubtask = queueable("plan.addSubtask", _addSubtask, { once: true });
export const toggleSubtask = queueable("plan.toggleSubtask", _toggleSubtask);
export const deleteSubtask = queueable("plan.deleteSubtask", _deleteSubtask);
export const saveObjective = queueable("plan.saveObjective", _saveObjective, { once: true });
export const deleteObjective = queueable("plan.deleteObjective", _deleteObjective);
export const copyToYear = queueable("plan.copyToYear", _copyToYear, { once: true });
export const scheduleTask = queueable("plan.scheduleTask", _scheduleTask, { once: true });
