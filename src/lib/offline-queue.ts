"use client";

import { setHabitLog } from "./habit-actions";
import type { LogStatus } from "./habit-logic";

/**
 * Cola de marcas hechas sin señal (solo en este dispositivo). Al volver la
 * conexión se mandan en orden. Las vistas ya las muestran (son optimistas).
 */
type Op = {
  /** Para sacar de la cola solo lo que se mandó (se asigna al encolar). */
  id?: string;
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
  write([...read(), { ...op, id: op.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }]);
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
    // Las viejas (sin id) reciben uno para poder sacarlas sin tocar lo que se encole mientras tanto.
    const ops = read().map((o, i) => (o.id ? o : { ...o, id: `viejo-${i}-${o.habitId}-${o.date}` }));
    write([...ops, ...read().slice(ops.length)]);
    const done = new Set<string>();
    const retried = new Map<string, number>();
    for (const op of ops) {
      try {
        await setHabitLog(op.habitId, op.date, op.status, op.value, op.note);
        sent++;
        done.add(op.id!);
      } catch (e) {
        // Sin señal: queda. Rechazada por el servidor (ej. el hábito ya no existe):
        // se reintenta un par de veces y después se descarta.
        if (isNetworkError(e)) break;
        if ((op.tries ?? 0) < 2) retried.set(op.id!, (op.tries ?? 0) + 1);
        else done.add(op.id!);
      }
    }
    // Se sacan solo las que se mandaron (o se descartaron): lo encolado durante la subida queda.
    write(read().filter((o) => !o.id || !done.has(o.id)).map((o) => (o.id && retried.has(o.id) ? { ...o, tries: retried.get(o.id) } : o)));
  } finally {
    flushing = false;
  }
  return sent;
}
