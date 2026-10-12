"use client";

import { setHabitLog } from "./habit-actions";
import type { LogStatus } from "./habit-logic";
import { notifyError } from "@/components/undo-toast";
import { isNetworkError as isNetErr, isSessionExpired, isStaleDeploy, reloadForNewVersion } from "./offline/queue";

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

/** Falló por no tener señal (fetch cortado), no porque el servidor la rechazó (la misma regla que la cola general). */
export function isNetworkError(e: unknown) {
  return isNetErr(e);
}

const KEY = "sb_cola_offline";

function read(): Op[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Op[];
  } catch {
    return [];
  }
}

/** Aviso de que la cola cambió (se encoló, se subió o se descartó algo). */
const EVENT = "sb-cola-habitos";
export type QueueChange = { sent: Op[] };

function write(ops: Op[], sent: Op[] = []) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ops));
  } catch {
    // sin almacenamiento disponible: se pierde la cola, no hay más que hacer
  }
  window.dispatchEvent(new CustomEvent<QueueChange>(EVENT, { detail: { sent } }));
}

/**
 * Escucha los cambios de la cola (también cuando la sube el Shell): las pantallas
 * releen lo pendiente para no seguir mostrando una marca vieja encima de una nueva.
 * `sent` trae lo que acaba de llegar al servidor.
 */
export function subscribeQueue(fn: (change: QueueChange) => void) {
  const on = (e: Event) => fn((e as CustomEvent<QueueChange>).detail ?? { sent: [] });
  window.addEventListener(EVENT, on);
  return () => window.removeEventListener(EVENT, on);
}

const sameDay = (a: Op, b: { habitId: string; date: string }) => a.habitId === b.habitId && a.date === b.date;

/**
 * Saca las pendientes de ese hábito y día (una marca nueva las reemplaza) y
 * devuelve la última nota que traían, para no perderla si la nueva no toca la nota.
 */
export function dropPending(habitId: string, date: string): string | null | undefined {
  const ops = read();
  const old = ops.filter((o) => sameDay(o, { habitId, date }));
  if (old.length === 0) return undefined;
  write(ops.filter((o) => !sameDay(o, { habitId, date })));
  return old.findLast((o) => o.note !== undefined)?.note;
}

/** Encola una marca; reemplaza a las pendientes del mismo hábito y día (gana la última). */
export function enqueue(op: Op) {
  const ops = read();
  const old = ops.filter((o) => sameDay(o, op));
  const note = op.note === undefined ? old.findLast((o) => o.note !== undefined)?.note : op.note;
  write([
    ...ops.filter((o) => !sameDay(o, op)),
    { ...op, ...(note !== undefined && { note }), id: op.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` },
  ]);
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
    const sentOps: Op[] = [];
    const retried = new Map<string, number>();
    let dropped = 0;
    for (const [i, op] of ops.entries()) {
      // Si hay una más nueva del mismo hábito y día, gana esa: la vieja no se manda
      // (si no, una rechazada que se reintenta pisaría a la nueva).
      if (ops.slice(i + 1).some((o) => sameDay(o, op))) {
        done.add(op.id!);
        continue;
      }
      // Lo que está en la cola ahora (otra marca pudo reemplazarla mientras subía).
      if (!read().some((o) => o.id === op.id)) continue;
      try {
        await setHabitLog(op.habitId, op.date, op.status, op.value, op.note);
        sent++;
        done.add(op.id!);
        sentOps.push(op);
      } catch (e) {
        // Sin señal: queda. Como en la cola general, ni una versión nueva publicada
        // ni la sesión vencida son culpa de la marca: se espera (sin contar intentos).
        if (isNetworkError(e)) break;
        if (isStaleDeploy(e)) {
          reloadForNewVersion();
          break;
        }
        if (isSessionExpired(e)) {
          const n = read().length;
          notifyError(`Entrá de nuevo para subir ${n === 1 ? "la marca de hábito pendiente" : `las ${n} marcas de hábitos pendientes`}.`);
          break;
        }
        // Rechazada por el servidor (ej. el hábito ya no existe): se reintenta un par
        // de veces y después se descarta, con aviso.
        if ((op.tries ?? 0) < 2) retried.set(op.id!, (op.tries ?? 0) + 1);
        else {
          done.add(op.id!);
          dropped++;
        }
      }
    }
    // Se sacan solo las que se mandaron (o se descartaron): lo encolado durante la subida queda.
    write(
      read()
        .filter((o) => !o.id || !done.has(o.id))
        .map((o) => (o.id && retried.has(o.id) ? { ...o, tries: retried.get(o.id) } : o)),
      sentOps,
    );
    if (dropped > 0) {
      notifyError(
        dropped === 1
          ? "Una marca de hábito hecha sin señal no se pudo subir (el servidor la rechazó) y se descartó."
          : `${dropped} marcas de hábitos hechas sin señal no se pudieron subir (el servidor las rechazó) y se descartaron.`,
      );
    }
  } finally {
    flushing = false;
  }
  return sent;
}
