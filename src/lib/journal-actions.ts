"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { exigirSesion } from "./session";
import { logActivity, trashAndDelete } from "./trash";
import { addDays, fromDbDate, isISODate, startOfWeek, toDbDate, todayISO } from "./dates";
import { QUARTER_REVIEW_TAG, REVIEW_TAG, REVIEW_TEMPLATE } from "./review-logic";
import { BODY_MAX, isDiscardableEntry, isMood, normalizeTags, TITLE_MAX } from "./journal-logic";
import { appendToJournal } from "./journal-append";
import { syncJournalHabit } from "./journal-habit-link";

function refrescar() {
  revalidatePath("/journal", "layout");
}

function validId(id: unknown): id is string {
  return typeof id === "string" && /^[a-z0-9]{10,40}$/i.test(id);
}

/**
 * Borra entradas que se crearon y quedaron sin nada hace más de una hora. Las que tienen
 * ánimo se quedan: ese ánimo (el de la noche) no está guardado en ningún otro lado.
 */
async function limpiarVacias() {
  await prisma.journalEntry.deleteMany({
    where: { title: null, body: "", mood: null, tags: { isEmpty: true }, attachments: { none: {} }, updatedAt: { lt: new Date(Date.now() - 3_600_000) } },
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
    // La reflexión semanal no es "la entrada del día": "Escribir hoy" no la abre.
    const existing = await prisma.journalEntry.findFirst({
      where: { date: toDbDate(day), NOT: { tags: { hasSome: [REVIEW_TAG, QUARTER_REVIEW_TAG] } } },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (existing) redirect(`/journal/${existing.id}`);
  }
  await limpiarVacias();
  // Arranca sin ánimo: el de la entrada es el de la noche, aparte del check-in de la mañana.
  const created = await prisma.journalEntry.create({ data: { date: toDbDate(day) }, select: { id: true } });
  await logActivity("created", "journal", created.id, `Entrada del ${day}`);
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
  // Un texto de puros espacios es una entrada vacía: se guarda "" para que el
  // criterio de la base (`NOT_EMPTY`, `limpiarVacias`) la vea vacía. El texto normal no se recorta.
  const body = input.body.trim() ? input.body : "";
  const mood = isMood(input.mood) ? input.mood : null;
  try {
    const prev = await prisma.journalEntry.findUnique({ where: { id }, select: { mood: true, date: true } });
    const e = await prisma.journalEntry.update({
      where: { id },
      data: { date: toDbDate(input.date), title, body, mood, tags: normalizeTags(input.tags) },
      select: { updatedAt: true },
    });
    if (prev) {
      const prevDate = fromDbDate(prev.date);
      // Inicio muestra el ánimo de la noche: se entera si cambió o si la entrada cambió de día.
      if (prevDate !== input.date || prev.mood !== mood) revalidatePath("/");
      // Escribir tilda el hábito de journaling de ese día (y si cambió de día, lo saca del otro).
      after(() => syncJournalHabit(input.date, prevDate));
    }
    refrescar();
    return { ok: true, savedAt: e.updatedAt.toISOString() };
  } catch (e) {
    if ((e as { code?: string }).code === "P2025") return { ok: false, error: "Esta entrada ya no existe." };
    throw e;
  }
}

/**
 * Lo compartido desde otra app va a la entrada de hoy (al final del texto) o a
 * una nueva si hoy todavía no hay. Devuelve la entrada para subirle fotos.
 */
export async function shareToJournal(text: string): Promise<{ id: string }> {
  await exigirSesion();
  const { id } = await appendToJournal(todayISO(), text, "compartido");
  return { id };
}

/** Al salir del editor sin haber escrito ni elegido nada, la entrada no queda guardada. */
export async function discardIfEmpty(id: string) {
  await exigirSesion();
  if (!validId(id)) return;
  const e = await prisma.journalEntry.findUnique({ where: { id }, include: { _count: { select: { attachments: true } } } });
  if (e && isDiscardableEntry(e) && e._count.attachments === 0) {
    await prisma.journalEntry.delete({ where: { id } });
    refrescar();
  }
}

/** Marca o desmarca una entrada como favorita (la estrella; pedido de Facu, 2026-10-27). */
export async function setEntryStarred(id: string, starred: boolean): Promise<{ ok: true }> {
  await exigirSesion();
  if (!validId(id)) throw new Error("Entrada inválida");
  await prisma.journalEntry.updateMany({ where: { id }, data: { starred: !!starred } });
  refrescar();
  return { ok: true };
}

/**
 * Copia de una entrada (clic derecho → Duplicar): mismo día, texto, ánimo y etiquetas;
 * sin fotos ni estrella. El título lleva "(copia)" para distinguirla.
 */
export async function duplicateEntry(id: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await exigirSesion();
  if (!validId(id)) return { ok: false, error: "Entrada inválida." };
  const e = await prisma.journalEntry.findUnique({ where: { id } });
  if (!e) return { ok: false, error: "Esta entrada ya no existe." };
  const copy = await prisma.journalEntry.create({
    data: {
      date: e.date,
      title: e.title ? `${e.title} (copia)`.slice(0, TITLE_MAX) : null,
      body: e.body,
      mood: e.mood,
      tags: e.tags,
    },
    select: { id: true },
  });
  await logActivity("created", "journal", copy.id, `Copia de la entrada del ${fromDbDate(e.date)}`);
  refrescar();
  return { ok: true, id: copy.id };
}

/** Cambia el día de una entrada (clic derecho → Cambiar de día). El ánimo se va con ella, como en el editor. */
export async function moveEntryDate(id: string, date: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await exigirSesion();
  if (!validId(id)) return { ok: false, error: "Entrada inválida." };
  if (!isISODate(date)) return { ok: false, error: "Fecha inválida." };
  const prev = await prisma.journalEntry.findUnique({ where: { id }, select: { date: true } });
  if (!prev) return { ok: false, error: "Esta entrada ya no existe." };
  const from = fromDbDate(prev.date);
  if (from === date) return { ok: true };
  await prisma.journalEntry.update({ where: { id }, data: { date: toDbDate(date) } });
  await syncJournalHabit(date, from);
  refrescar();
  revalidatePath("/");
  return { ok: true };
}

/**
 * Manda la entrada a la papelera. No redirige: el editor avisa "Entrada borrada ·
 * Deshacer" recién cuando terminó (si no, un Deshacer rápido restauraba otra cosa) y vuelve solo.
 */
export async function deleteEntry(id: string): Promise<{ ok: true }> {
  await exigirSesion();
  if (!validId(id)) throw new Error("Entrada inválida");
  const was = await prisma.journalEntry.findUnique({ where: { id }, select: { date: true } });
  await trashAndDelete("journal", id);
  if (was) await syncJournalHabit(fromDbDate(was.date));
  refrescar();
  revalidatePath("/");
  return { ok: true };
}

/**
 * Abre la reflexión de la semana (la entrada con la etiqueta de revisión del
 * domingo) o la crea con las preguntas de siempre.
 */
export async function writeWeeklyReview(monday: string) {
  await exigirSesion();
  if (!isISODate(monday)) throw new Error("Fecha inválida");
  const sunday = addDays(startOfWeek(monday), 6);
  const existing = await prisma.journalEntry.findFirst({
    // Solo de lunes a domingo (la del lunes siguiente es de esa otra semana).
    where: { tags: { has: REVIEW_TAG }, date: { gte: toDbDate(startOfWeek(monday)), lte: toDbDate(sunday) } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (existing) redirect(`/journal/${existing.id}`);
  // Si la semana todavía no terminó, la reflexión queda en hoy.
  const day = sunday > todayISO() ? todayISO() : sunday;
  const created = await prisma.journalEntry.create({
    data: { date: toDbDate(day), title: "Revisión de la semana", body: REVIEW_TEMPLATE, tags: [REVIEW_TAG] },
    select: { id: true },
  });
  refrescar();
  revalidatePath("/semana");
  redirect(`/journal/${created.id}`);
}
