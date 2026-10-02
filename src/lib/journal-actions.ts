"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { exigirSesion } from "./session";
import { isISODate, toDbDate, todayISO } from "./dates";
import { BODY_MAX, isEmptyEntry, isMood, normalizeTags, TITLE_MAX } from "./journal-logic";

function refrescar() {
  revalidatePath("/journal", "layout");
}

function validId(id: unknown): id is string {
  return typeof id === "string" && /^[a-z0-9]{10,40}$/i.test(id);
}

/** Borra entradas que se crearon y quedaron sin nada escrito hace más de una hora. */
async function limpiarVacias() {
  await prisma.journalEntry.deleteMany({
    where: {
      title: null,
      body: "",
      mood: null,
      tags: { isEmpty: true },
      updatedAt: { lt: new Date(Date.now() - 3_600_000) },
    },
  });
}

/**
 * Abre la entrada del día (la primera si hay varias) o crea una nueva y va al
 * editor. `nueva` fuerza otra entrada aunque ya haya una ese día.
 */
export async function writeOnDay(date?: string, nueva = false) {
  await exigirSesion();
  const day = isISODate(date) ? date : todayISO();
  if (!nueva) {
    const existing = await prisma.journalEntry.findFirst({
      where: { date: toDbDate(day) },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (existing) redirect(`/journal/${existing.id}`);
  }
  await limpiarVacias();
  const created = await prisma.journalEntry.create({ data: { date: toDbDate(day) }, select: { id: true } });
  redirect(`/journal/${created.id}`);
}

export type EntryInput = {
  date: string;
  title: string;
  body: string;
  mood: number | null;
  tags: string[];
};

export type SaveResult = { ok: true; savedAt: string } | { ok: false; error: string };

/** Autoguardado del editor: recibe la entrada completa. */
export async function saveEntry(id: string, input: EntryInput): Promise<SaveResult> {
  await exigirSesion();
  if (!validId(id)) return { ok: false, error: "Entrada inválida." };
  if (!input || typeof input !== "object") return { ok: false, error: "Datos inválidos." };
  if (!isISODate(input.date)) return { ok: false, error: "Fecha inválida." };
  if (typeof input.body !== "string" || input.body.length > BODY_MAX) {
    return { ok: false, error: "El texto es demasiado largo." };
  }
  const title = typeof input.title === "string" ? input.title.trim().slice(0, TITLE_MAX) || null : null;
  const mood = isMood(input.mood) ? input.mood : null;
  try {
    const e = await prisma.journalEntry.update({
      where: { id },
      data: { date: toDbDate(input.date), title, body: input.body, mood, tags: normalizeTags(input.tags) },
      select: { updatedAt: true },
    });
    refrescar();
    return { ok: true, savedAt: e.updatedAt.toISOString() };
  } catch (e) {
    if ((e as { code?: string }).code === "P2025") return { ok: false, error: "Esta entrada ya no existe." };
    throw e;
  }
}

/** Al salir del editor sin haber escrito nada, la entrada no queda guardada. */
export async function discardIfEmpty(id: string) {
  await exigirSesion();
  if (!validId(id)) return;
  const e = await prisma.journalEntry.findUnique({ where: { id } });
  if (e && isEmptyEntry(e)) {
    await prisma.journalEntry.delete({ where: { id } });
    refrescar();
  }
}

export async function deleteEntry(id: string) {
  await exigirSesion();
  if (!validId(id)) throw new Error("Entrada inválida");
  await prisma.journalEntry.deleteMany({ where: { id } });
  refrescar();
  redirect("/journal");
}
