"use client";

// Acciones del menú lateral (shell-actions.ts) envueltas para funcionar sin conexión (ver offline/queue.ts).
import { saveToolOrder as _saveToolOrder } from "../shell-actions";
import { queueable } from "./queue";

/** El orden de las Herramientas: queda el último. */
export const saveToolOrder = queueable("shell.saveToolOrder", _saveToolOrder, { key: () => "herramientas" });
