"use client";

// La acción de values-actions.ts envuelta para funcionar sin conexión (ver offline/queue.ts).
import { saveValues as _saveValues } from "../values-actions";
import { queueable } from "./queue";

// Sin señal, el último texto reemplaza a los anteriores (como el autoguardado del journal).
export const saveValues = queueable("values.saveValues", _saveValues, { key: () => "valores" });
