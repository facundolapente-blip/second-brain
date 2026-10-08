"use client";

import { useSyncExternalStore } from "react";
import { notifyInfo } from "@/components/undo-toast";

/**
 * Modo sin conexión de toda la app. Cada server action que se llama desde una
 * pantalla pasa por `queueable` (ver `offline/*.ts`): si no hay señal, o el
 * pedido se corta, la llamada se guarda en este aparato (localStorage) y se manda
 * sola cuando vuelve la conexión, en el mismo orden (`flushActions`, desde el
 * Shell). Mientras tanto la pantalla sigue (devuelve `QUEUED`, que pasa como
 * "guardado") y las vistas que lo necesitan leen lo pendiente (`usePendingActions`).
 * Hábitos tiene su cola propia (`lib/offline-queue.ts`), que muestra las marcas.
 */
export type QueuedOp = { id: string; name: string; args: unknown[]; key?: string; at: number; tries?: number };

export const QUEUED = { ok: true as const, queued: true as const };

const KEY = "sb_cola_acciones";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const registry = new Map<string, (...args: any[]) => Promise<unknown>>();
const listeners = new Set<() => void>();
let cache: QueuedOp[] | null = null;

function read(): QueuedOp[] {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY) ?? "[]") as QueuedOp[];
  } catch {
    cache = [];
  }
  return cache;
}

function write(ops: QueuedOp[]) {
  cache = ops;
  try {
    localStorage.setItem(KEY, JSON.stringify(ops));
  } catch {
    // Sin almacenamiento (modo privado lleno): queda solo en memoria hasta cerrar.
  }
  for (const l of listeners) l();
}

/** Falló por la conexión (no porque el servidor lo rechazó). */
export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  if (e instanceof TypeError) return true;
  const m = e instanceof Error ? e.message : String(e ?? "");
  return /failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(m);
}

// FormData no se puede guardar como JSON: va como lista de pares (sin archivos).
type SerialFD = { __fd: [string, string][] };
function serialize(v: unknown): unknown {
  if (typeof FormData !== "undefined" && v instanceof FormData) {
    const pairs: [string, string][] = [];
    v.forEach((val, k) => {
      if (typeof val === "string") pairs.push([k, val]);
    });
    return { __fd: pairs } satisfies SerialFD;
  }
  return v;
}
function deserialize(v: unknown): unknown {
  if (v && typeof v === "object" && "__fd" in v) {
    const fd = new FormData();
    for (const [k, val] of (v as SerialFD).__fd) fd.append(k, val);
    return fd;
  }
  return v;
}

/** Lee un campo de un argumento FormData guardado en la cola. */
export function queuedField(arg: unknown, name: string): string | null {
  if (arg && typeof arg === "object" && "__fd" in arg) {
    const hit = (arg as SerialFD).__fd.find(([k]) => k === name);
    return hit ? hit[1] : null;
  }
  return null;
}

let lastNotice = 0;
function enqueue(name: string, args: unknown[], key?: string) {
  let ops = read();
  // Con clave, lo nuevo reemplaza a lo pendiente igual (ej. el autoguardado de una entrada).
  if (key) ops = ops.filter((o) => o.key !== key);
  write([...ops, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name, args: args.map(serialize), key, at: Date.now() }]);
  if (Date.now() - lastNotice > 20_000) {
    lastNotice = Date.now();
    notifyInfo("Sin señal: quedó guardado en este aparato. Se sube solo cuando vuelva la conexión.");
  }
  return QUEUED;
}

/**
 * Envuelve una server action para que funcione sin señal. `key` agrupa llamadas
 * que se pisan (queda solo la última pendiente).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function queueable<F extends (...args: any[]) => Promise<any>>(name: string, fn: F, opts?: { key?: (...args: Parameters<F>) => string }): F {
  registry.set(name, fn);
  return (async (...args: Parameters<F>) => {
    const key = opts?.key ? `${name}:${opts.key(...args)}` : undefined;
    if (typeof navigator !== "undefined" && !navigator.onLine) return enqueue(name, args, key);
    try {
      return await fn(...args);
    } catch (e) {
      if (isNetworkError(e)) return enqueue(name, args, key);
      throw e;
    }
  }) as F;
}

export function pendingActions(): QueuedOp[] {
  return typeof window === "undefined" ? [] : read();
}

export function subscribePending(fn: () => void) {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      fn();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

let flushing = false;

/**
 * Manda lo pendiente en orden. Si se corta la señal, para y queda para después;
 * si el servidor rechaza algo (ya no existe), se reintenta dos veces y se descarta.
 * Devuelve cuántas se mandaron.
 */
export async function flushActions(): Promise<number> {
  if (flushing || typeof navigator === "undefined" || !navigator.onLine) return 0;
  const ops = read();
  if (!ops.length) return 0;
  flushing = true;
  let sent = 0;
  try {
    for (const op of ops) {
      const fn = registry.get(op.name);
      let drop = false;
      try {
        if (fn) await fn(...op.args.map(deserialize));
        drop = true;
        if (fn) sent++;
      } catch (e) {
        if (isNetworkError(e)) break;
        if ((op.tries ?? 0) >= 2) drop = true;
        else write(read().map((o) => (o.id === op.id ? { ...o, tries: (o.tries ?? 0) + 1 } : o)));
      }
      if (drop) write(read().filter((o) => o.id !== op.id));
    }
  } finally {
    flushing = false;
  }
  return sent;
}

const EMPTY: QueuedOp[] = [];
/** Lo pendiente de subir, para que las pantallas lo muestren (se actualiza solo). */
export function usePendingActions(): QueuedOp[] {
  return useSyncExternalStore(subscribePending, () => read(), () => EMPTY);
}
