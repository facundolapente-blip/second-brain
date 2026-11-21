"use client";

// Avisos (push-actions.ts): sin señal no tienen sentido (suscribirse, mandar una prueba),
// así que van tal cual, sin cola (salvo crear un recordatorio desde otra pantalla).
export { savePushSubscription, removePushSubscription, saveReminderPrefs, sendTestPush } from "../push-actions";
import { addCustomReminder as _addCustomReminder } from "../push-actions";
import { queueable } from "./queue";

/** "Notificar" desde el Plan o Inicio: sin señal queda en la cola (el id evita duplicarlo). */
export const addCustomReminder = queueable("push.addCustomReminder", _addCustomReminder, {
  key: (r) => String((r as { id?: unknown })?.id ?? ""),
});
