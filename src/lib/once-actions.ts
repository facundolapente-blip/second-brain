"use server";

import { Prisma } from "@prisma/client";
import { unstable_rethrow } from "next/navigation";
import { prisma } from "./prisma";
import { exigirSesion } from "./session";
import * as plan from "./plan-actions";
import * as finance from "./finance-actions";
import * as habit from "./habit-actions";

/**
 * Acciones que no aguantan repetirse (crear, duplicar, pasar de semana, sumar):
 * la pantalla manda un id generado en el aparato y acá se anota antes de hacerla.
 * Si la misma llamada vuelve a llegar (la respuesta se cortó y la cola sin
 * conexión la reintenta), se devuelve el resultado guardado en vez de repetirla.
 * Ver `queueable(..., { once: true })` en `offline/queue.ts`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MODULES: Record<string, Record<string, (...args: any[]) => Promise<unknown>>> = { plan, finance, habit };

const DONE_WITHOUT_RESULT = { ok: true, repeated: true };

export async function runOnce(opId: string, name: string, args: unknown[]): Promise<unknown> {
  await exigirSesion();
  if (typeof opId !== "string" || !/^[\w-]{8,64}$/.test(opId)) throw new Error("Acción inválida");
  const [mod, fnName] = String(name).split(".");
  const fn = MODULES[mod]?.[fnName];
  if (typeof fn !== "function") throw new Error("Acción desconocida");
  if (!Array.isArray(args)) throw new Error("Acción inválida");

  // Se anota primero: si ya estaba, es una repetición (o la primera todavía corre).
  try {
    await prisma.actionReceipt.create({ data: { id: opId, name: `${mod}.${fnName}` } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const prev = await prisma.actionReceipt.findUnique({ where: { id: opId } });
      return (prev?.result as unknown) ?? DONE_WITHOUT_RESULT;
    }
    throw e;
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
