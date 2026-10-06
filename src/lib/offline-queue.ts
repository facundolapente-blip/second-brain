"use client";

import { setHabitLog } from "./habit-actions";
import type { LogStatus } from "./habit-logic";

/**
 * Cola de marcas hechas sin señal (solo en este dispositivo). Al volver la
 * conexión se mandan en orden. Las vistas ya las muestran (son optimistas).
 */
type Op = {
  type: "habit";
  habitId: string;
  date: string;
  status: LogStatus | null;
  value: number;
  note?: string | null;
  /** Intentos fallidos con señal (a los 3 se descarta). */
  tries?: number;
};

/** Falló por no tener señal (fetch cortado), no porque el servidor la rechazó. */
export function isNetworkError(e: unknown) {
  return e instanceof TypeError || (typeof navigator !== "undefined" && !navigator.onLine);
}

const KEY = "sb_cola_offline";

function read(): Op[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Op[];
  } catch {
    return [];
  }
}

function write(ops: Op[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ops));
  } catch {
    // sin almacenamiento disponible: se pierde la cola, no hay más que hacer
  }
}

export function enqueue(op: Op) {
  write([...read(), op]);
}

export function pendingCount() {
  return read().length;
}

export function pendingOps(): Op[] {
  return typeof window === "undefined" ? [] : read();
}

let flushing = false;

/** Manda lo pendiente; lo que falle queda para la próxima. Devuelve cuántas se mandaron. */
export async function flushQueue(): Promise<number> {
  if (flushing || !navigator.onLine) return 0;
  flushing = true;
  let sent = 0;
  try {
    const ops = read();
    const rest: Op[] = [];
    for (const op of ops) {
      try {
        await setHabitLog(op.habitId, op.date, op.status, op.value, op.note);
        sent++;
      } catch (e) {
        // Sin señal: queda. Rechazada por el servidor (ej. el hábito ya no existe):
        // se reintenta un par de veces y después se descarta.
        if (isNetworkError(e)) rest.push(op);
        else if ((op.tries ?? 0) < 2) rest.push({ ...op, tries: (op.tries ?? 0) + 1 });
      }
    }
    write(rest);
  } finally {
    flushing = false;
  }
  return sent;
}
