"use client";

// La acción de memento-actions.ts envuelta para funcionar sin conexión (ver offline/queue.ts).
import { saveMemento as _saveMemento } from "../memento-actions";
import { queueable } from "./queue";

// Sin señal, la última configuración reemplaza a las anteriores.
export const saveMemento = queueable("memento.saveMemento", _saveMemento, { key: () => "memento" });
