"use client";

// Las acciones de wheel-actions.ts envueltas para funcionar sin conexión (ver offline/queue.ts).
import { saveWheel as _saveWheel, deleteWheel as _deleteWheel } from "../wheel-actions";
import { queueable } from "./queue";
export type { WheelInput } from "../wheel-actions";

/** Crear o cambiar una rueda: no se repite si la cola la reintenta. */
export const saveWheel = queueable("wheel.saveWheel", _saveWheel, { once: true });
/** Borrar va a la papelera; sin señal no tiene sentido guardarlo para después. */
export const deleteWheel = _deleteWheel;
