"use client";

import { useSyncExternalStore } from "react";
import { notifyError, notifyInfo } from "@/components/undo-toast";
import { runOnce } from "../once-actions";

/**
 * Modo sin conexión de toda la app. Cada server action que se llama desde una
 * pantalla pasa por `queueable` (ver `offline/*.ts`): si no hay señal, o el
 * pedido se corta, la llamada se guarda en este aparato (localStorage) y se manda
 * sola cuando vuelve la conexión, en el mismo orden (`flushActions`, desde el
 * Shell). Mientras tanto la pantalla sigue (devuelve `QUEUED`, que pasa como
 * "guardado") y las vistas que lo necesitan leen lo pendiente (`usePendingActions`).
 * Hábitos tiene su cola propia (`lib/offline-queue.ts`), que muestra las marcas.
 */
export type QueuedOp = {
  id: string;
  name: string;
  args: unknown[];
  key?: string;
  at: number;
  tries?: number;
  /** Id de una acción que no aguanta repetirse (`once`): el servidor no la hace dos veces. */
  opId?: string;
};

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

/**
 * Hubo una versión nueva de la app mientras esta pantalla seguía abierta: el
 * servidor ya no conoce la acción vieja. No es culpa de lo pendiente: se
 * recarga la página (una vez por minuto, como mucho) y se vuelve a intentar.
 */
export function isStaleDeploy(e: unknown): boolean {
  const n = e instanceof Error ? e.name : "";
  const m = e instanceof Error ? e.message : String(e ?? "");
  return n === "UnrecognizedActionError" || /server action.*(not found|was not found)|failed to find server action/i.test(m);
}
export function reloadForNewVersion() {
  try {
    const last = Number(sessionStorage.getItem("sb_recarga_version") ?? 0);
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem("sb_recarga_version", String(Date.now()));
  } catch {
    return;
  }
  location.reload();
}

/** La sesión venció: lo pendiente espera a que se vuelva a entrar (no se descarta). */
export function isSessionExpired(e: unknown): boolean {
  return /sesi[oó]n vencida/i.test(e instanceof Error ? e.message : String(e ?? ""));
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
function enqueue(name: string, args: unknown[], key?: string, opId?: string) {
  let ops = read();
  // Con clave, lo nuevo reemplaza a lo pendiente igual (ej. el autoguardado de una entrada).
  if (key) ops = ops.filter((o) => o.key !== key);
  write([...ops, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name, args: args.map(serialize), key, at: Date.now(), opId }]);
  if (Date.now() - lastNotice > 20_000) {
    lastNotice = Date.now();
    notifyInfo("Sin señal: quedó guardado en este aparato. Se sube solo cuando vuelva la conexión.");
  }
  return QUEUED;
}

function newOpId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Envuelve una server action para que funcione sin señal. `key` agrupa llamadas
 * que se pisan (queda solo la última pendiente). `once` es para las que no
 * aguantan repetirse (crear, duplicar, mover de semana, sumar): si el pedido se
 * corta después de que el servidor la hizo, la cola la reintenta y no se hace
 * dos veces (`runOnce` guarda un recibo con el id de la llamada).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function queueable<F extends (...args: any[]) => Promise<any>>(name: string, fn: F, opts?: { key?: (...args: Parameters<F>) => string; once?: boolean }): F {
  registry.set(name, fn);
  return (async (...args: Parameters<F>) => {
    const key = opts?.key ? `${name}:${opts.key(...args)}` : undefined;
    const opId = opts?.once ? newOpId() : undefined;
    if (typeof navigator !== "undefined" && !navigator.onLine) return enqueue(name, args, key, opId);
    if (key) {
      // Lo nuevo gana: si quedaba pendiente uno con la misma clave, ya no se sube
      // (si no, al volver la señal la cola mandaría el valor viejo después de este).
      if (read().some((o) => o.key === key)) write(read().filter((o) => o.key !== key));
      // Y si la cola justo lo está mandando, se espera a que termine para llegar después.
      if (inFlight && inFlight.key === key) await inFlight.done;
    }
    try {
      return opId ? await runOnce(opId, name, args) : await fn(...args);
    } catch (e) {
      if (isNetworkError(e)) return enqueue(name, args, key, opId);
      // Versión nueva publicada con la pantalla abierta: se guarda y se recarga.
      if (isStaleDeploy(e)) {
        enqueue(name, args, key, opId);
        reloadForNewVersion();
        return QUEUED;
      }
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
/** Lo que la cola está mandando en este momento (para que una llamada nueva con la misma clave llegue después). */
let inFlight: { key?: string; done: Promise<unknown> } | null = null;

/**
 * Manda lo pendiente en orden. Si se corta la señal, para y queda para después;
 * si el servidor rechaza algo (ya no existe), también para (lo de atrás no se
 * adelanta) y se reintenta en la próxima vuelta; al tercer rechazo se descarta y
 * sigue con lo demás. Devuelve cuántas se mandaron.
 */
export async function flushActions(): Promise<number> {
  if (flushing || typeof navigator === "undefined" || !navigator.onLine) return 0;
  const ops = read();
  if (!ops.length) return 0;
  flushing = true;
  let sent = 0;
  try {
    for (const op of ops) {
      // Una llamada nueva con la misma clave pudo sacarla mientras se subía lo anterior.
      if (!read().some((o) => o.id === op.id)) continue;
      const fn = registry.get(op.name);
      let drop = false;
      try {
        const args = op.args.map(deserialize);
        const run = op.opId ? runOnce(op.opId, op.name, args) : fn ? fn(...args) : Promise.resolve();
        inFlight = { key: op.key, done: run.catch(() => undefined) };
        let result: unknown;
        try {
          result = await run;
        } finally {
          inFlight = null;
        }
        // La primera vez que se mandó todavía corre en el servidor (`runOnce`): queda para la próxima vuelta.
        if (result && typeof result === "object" && "running" in result && result.running === true) break;
        drop = true;
        if (fn || op.opId) sent++;
      } catch (e) {
        if (isNetworkError(e)) break;
        // Ni una versión nueva ni la sesión vencida son culpa de lo pendiente: se espera.
        if (isStaleDeploy(e)) {
          reloadForNewVersion();
          break;
        }
        if (isSessionExpired(e)) {
          notifyError(`Entrá de nuevo para subir ${ops.length === 1 ? "el cambio pendiente" : `los ${ops.length} cambios pendientes`}.`);
          break;
        }
        if ((op.tries ?? 0) >= 2) {
          drop = true;
          notifyError("Un cambio pendiente no se pudo subir (el servidor lo rechazó) y se descartó.");
        } else {
          write(read().map((o) => (o.id === op.id ? { ...o, tries: (o.tries ?? 0) + 1 } : o)));
          // Se reintenta en la próxima vuelta; lo de atrás espera para no llegar antes.
          break;
        }
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
