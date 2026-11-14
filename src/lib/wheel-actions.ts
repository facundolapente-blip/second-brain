"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "./prisma";
import { exigirSesion } from "./session";
import { isISODate, todayISO, toDbDate } from "./dates";
import { logActivity, trashAndDelete } from "./trash";
import { parseScores, WHEEL_AREAS } from "./life-wheel";

/** Acciones de la Rueda de la vida (`/rueda`). */

function refrescar() {
  revalidatePath("/rueda");
  revalidatePath("/");
}

export type WheelInput = { date: string; scores: Record<string, unknown>; note?: string | null };

/** Crea (sin `id`) o cambia una rueda. Solo se guardan las áreas conocidas, de 0 a 10. */
export async function saveWheel(id: string | null, input: WheelInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await exigirSesion();
  if (!input || typeof input !== "object") return { ok: false, error: "Datos inválidos." };
  if (!isISODate(input.date) || input.date > todayISO()) return { ok: false, error: "Elegí una fecha (hoy o antes)." };
  const all = parseScores(input.scores);
  const scores = Object.fromEntries(WHEEL_AREAS.filter((a) => all[a.key] !== undefined).map((a) => [a.key, all[a.key]]));
  if (!Object.keys(scores).length) return { ok: false, error: "Poné el puntaje de al menos un área." };
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 4000) || null : null;
  const data = { date: toDbDate(input.date), scores, note };
  if (id) {
    const r = await prisma.lifeWheel.updateMany({ where: { id }, data });
    if (!r.count) return { ok: false, error: "Esa rueda ya no existe." };
    await logActivity("edited", "lifeWheel", id, `Rueda del ${input.date}`);
    refrescar();
    return { ok: true, id };
  }
  const created = await prisma.lifeWheel.create({ data, select: { id: true } });
  await logActivity("created", "lifeWheel", created.id, `Rueda del ${input.date}`);
  refrescar();
  return { ok: true, id: created.id };
}

/** A la papelera (se deshace desde el aviso de abajo o Historial). */
export async function deleteWheel(id: string): Promise<{ ok: true }> {
  await exigirSesion();
  if (typeof id !== "string" || !id) throw new Error("Rueda inválida");
  await trashAndDelete("lifeWheel", id);
  refrescar();
  return { ok: true };
}
