"use server";

import { Prisma } from "@prisma/client";
import { unstable_rethrow } from "next/navigation";
import { prisma } from "./prisma";
import { exigirSesion } from "./session";
import * as plan from "./plan-actions";
import * as finance from "./finance-actions";
import * as habit from "./habit-actions";
import * as notes from "./notes-actions";

/**
 * Acciones que no aguantan repetirse (crear, duplicar, pasar de semana, sumar):
 * la pantalla manda un id generado en el aparato y acá se anota antes de hacerla.
 * Si la misma llamada vuelve a llegar (la respuesta se cortó y la cola sin
 * conexión la reintenta), se devuelve el resultado guardado en vez de repetirla.
 * Ver `queueable(..., { once: true })` en `offline/queue.ts`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MODULES: Record<string, Record<string, (...args: any[]) => Promise<unknown>>> = { plan, finance, habit, notes };

const DONE_WITHOUT_RESULT = { ok: true, repeated: true };
/**
 * La primera llamada con ese id todavía corre (el reintento llegó antes de que
 * terminara). Tiene forma de "guardado pendiente" (`QUEUED`): la cola no lo
 * descarta, lo vuelve a mandar en la próxima vuelta (`flushActions`).
 */
const STILL_RUNNING = { ok: true, queued: true, running: true };
/** Más que esto corriendo es que la función se cortó a la mitad: se da por hecha. */
const MAX_RUN_MS = 5 * 60_000;

type ReceiptState = { kind: "gone" } | { kind: "running" } | { kind: "done"; result: unknown };

async function receiptState(opId: string): Promise<ReceiptState> {
  const prev = await prisma.actionReceipt.findUnique({ where: { id: opId } });
  if (!prev) return { kind: "gone" };
  if (prev.result !== null) return { kind: "done", result: prev.result };
  // null en JSON = terminó sin devolver nada; NULL de la base = todavía corre.
  const running = await prisma.actionReceipt.count({ where: { id: opId, result: { equals: Prisma.DbNull } } });
  if (running && Date.now() - prev.createdAt.getTime() < MAX_RUN_MS) return { kind: "running" };
  return { kind: "done", result: DONE_WITHOUT_RESULT };
}

export async function runOnce(opId: string, name: string, args: unknown[]): Promise<unknown> {
  await exigirSesion();
  if (typeof opId !== "string" || !/^[\w-]{8,64}$/.test(opId)) throw new Error("Acción inválida");
  const [mod, fnName] = String(name).split(".");
  const fn = MODULES[mod]?.[fnName];
  if (typeof fn !== "function") throw new Error("Acción desconocida");
  if (!Array.isArray(args)) throw new Error("Acción inválida");

  // Se anota primero: si ya estaba, es una repetición (o la primera todavía corre).
  for (let attempt = 0; ; attempt++) {
    try {
      await prisma.actionReceipt.create({ data: { id: opId, name: `${mod}.${fnName}` } });
      break;
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    }
    // Repetida: se espera un poco a que la primera termine y se devuelve lo que dio.
    let state = await receiptState(opId);
    for (let i = 0; state.kind === "running" && i < 8; i++) {
      await new Promise((r) => setTimeout(r, 400));
      state = await receiptState(opId);
    }
    if (state.kind === "done") return state.result ?? DONE_WITHOUT_RESULT;
    if (state.kind === "running") return STILL_RUNNING;
    // La primera falló y borró su recibo: esta la hace (una vez más, como mucho).
    if (attempt >= 1) return STILL_RUNNING;
  }

  try {
    const result = await fn(...args);
    await prisma.actionReceipt.update({
      where: { id: opId },
      data: { result: result === undefined ? Prisma.JsonNull : (JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue) },
    });
    // De paso, los recibos viejos se van (no hace falta un cron).
    if (Math.random() < 0.05) {
      await prisma.actionReceipt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 14 * 86_400_000) } } });
    }
    return result;
  } catch (e) {
    // No se hizo (o redirigió): se borra el recibo para que un reintento sí la haga.
    await prisma.actionReceipt.delete({ where: { id: opId } }).catch(() => {});
    unstable_rethrow(e);
    throw e;
  }
}
