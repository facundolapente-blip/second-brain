"use client";

// Las acciones de finance-actions.ts envueltas para funcionar sin conexión (ver offline/queue.ts).
import { saveTransaction as _saveTransaction, renameTransaction as _renameTransaction, duplicateTransaction as _duplicateTransaction, deleteTransaction as _deleteTransaction, deleteInstallments as _deleteInstallments, setTransactionCategory as _setTransactionCategory, saveAccount as _saveAccount, archiveAccount as _archiveAccount, deleteAccount as _deleteAccount, reorderAccounts as _reorderAccounts, saveCategory as _saveCategory, deleteCategory as _deleteCategory, renameTemplate as _renameTemplate, deleteTemplate as _deleteTemplate, saveSchedule as _saveSchedule, setScheduleActive as _setScheduleActive, deleteSchedule as _deleteSchedule, saveCategoryBudget as _saveCategoryBudget, saveProject as _saveProject, archiveProject as _archiveProject, deleteProject as _deleteProject, setTransactionsProject as _setTransactionsProject, markAsAdjustment as _markAsAdjustment, convertToTransfer as _convertToTransfer, adjustBalance as _adjustBalance, suggestCategory as _suggestCategory, applySuggestions as _applySuggestions, quickAdd as _quickAdd, quickAddContext as _quickAddContext, saveDebt as _saveDebt, settleDebt as _settleDebt, reopenDebt as _reopenDebt, deleteDebt as _deleteDebt, saveGoal as _saveGoal, addToGoal as _addToGoal, archiveGoal as _archiveGoal, deleteGoal as _deleteGoal, acceptFixed as _acceptFixed, ignoreFixed as _ignoreFixed, saveReportRate as _saveReportRate, saveReserveGoal as _saveReserveGoal } from "../finance-actions";
import { isNetworkError, queueable } from "./queue";
export type { ActionResult } from "../finance-actions";

export const saveTransaction = queueable("finance.saveTransaction", _saveTransaction, { once: true });
export const renameTransaction = queueable("finance.renameTransaction", _renameTransaction, { key: (id) => id });
export const duplicateTransaction = queueable("finance.duplicateTransaction", _duplicateTransaction, { once: true });
export const deleteTransaction = queueable("finance.deleteTransaction", _deleteTransaction);
export const deleteInstallments = queueable("finance.deleteInstallments", _deleteInstallments);
export const setTransactionCategory = queueable("finance.setTransactionCategory", _setTransactionCategory);
export const saveAccount = queueable("finance.saveAccount", _saveAccount, { once: true });
export const archiveAccount = queueable("finance.archiveAccount", _archiveAccount);
export const deleteAccount = queueable("finance.deleteAccount", _deleteAccount);
export const reorderAccounts = queueable("finance.reorderAccounts", _reorderAccounts);
export const saveCategory = queueable("finance.saveCategory", _saveCategory, { once: true });
export const deleteCategory = queueable("finance.deleteCategory", _deleteCategory);
export const renameTemplate = queueable("finance.renameTemplate", _renameTemplate);
export const deleteTemplate = queueable("finance.deleteTemplate", _deleteTemplate);
export const saveSchedule = queueable("finance.saveSchedule", _saveSchedule, { once: true });
export const setScheduleActive = queueable("finance.setScheduleActive", _setScheduleActive);
export const deleteSchedule = queueable("finance.deleteSchedule", _deleteSchedule);
export const saveCategoryBudget = queueable("finance.saveCategoryBudget", _saveCategoryBudget);
export const saveProject = queueable("finance.saveProject", _saveProject, { once: true });
export const archiveProject = queueable("finance.archiveProject", _archiveProject);
export const deleteProject = queueable("finance.deleteProject", _deleteProject);
export const setTransactionsProject = queueable("finance.setTransactionsProject", _setTransactionsProject);
export const markAsAdjustment = queueable("finance.markAsAdjustment", _markAsAdjustment);
export const convertToTransfer = queueable("finance.convertToTransfer", _convertToTransfer, { once: true });
export const adjustBalance = queueable("finance.adjustBalance", _adjustBalance, { once: true });
/** Sin señal no hace nada (devuelve null). */
export const suggestCategory: typeof _suggestCategory = (async (...args: Parameters<typeof _suggestCategory>) => {
  try {
    return await _suggestCategory(...args);
  } catch (e) {
    if (isNetworkError(e)) return null;
    throw e;
  }
}) as typeof _suggestCategory;
export const applySuggestions = queueable("finance.applySuggestions", _applySuggestions);
export const quickAdd = queueable("finance.quickAdd", _quickAdd, { once: true });
/** Para la vista previa de la carga rápida; sin señal devuelve null (se ve sin categoría). */
export const quickAddContext = async (): Promise<Awaited<ReturnType<typeof _quickAddContext>> | null> => {
  try {
    return await _quickAddContext();
  } catch (e) {
    if (isNetworkError(e)) return null;
    throw e;
  }
};
export const saveDebt = queueable("finance.saveDebt", _saveDebt, { once: true });
export const settleDebt = queueable("finance.settleDebt", _settleDebt, { once: true });
export const reopenDebt = queueable("finance.reopenDebt", _reopenDebt);
export const deleteDebt = queueable("finance.deleteDebt", _deleteDebt);
export const saveGoal = queueable("finance.saveGoal", _saveGoal, { once: true });
export const addToGoal = queueable("finance.addToGoal", _addToGoal, { once: true });
export const archiveGoal = queueable("finance.archiveGoal", _archiveGoal);
export const deleteGoal = queueable("finance.deleteGoal", _deleteGoal);
export const acceptFixed = queueable("finance.acceptFixed", _acceptFixed, { once: true });
export const ignoreFixed = queueable("finance.ignoreFixed", _ignoreFixed);
export const saveReportRate = queueable("finance.saveReportRate", _saveReportRate, { key: () => "informes" });
export const saveReserveGoal = queueable("finance.saveReserveGoal", _saveReserveGoal, { key: () => "reserva" });
