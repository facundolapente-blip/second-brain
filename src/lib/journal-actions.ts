"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { exigirSesion } from "./session";
import { logActivity, trashAndDelete } from "./trash";
import { addDays, isISODate, startOfWeek, toDbDate, todayISO } from "./dates";
import { REVIEW_TAG, REVIEW_TEMPLATE } from "./review-logic";
import { BODY_MAX, isEmptyEntry, isMood, normalizeTags, TITLE_MAX } from "./journal-logic";

function refrescar() {
  revalidatePath("/journal", "layout");
}

function validId(id: unknown): id is string {
  return typeof id === "string" && /^[a-z0-9]{10,40}$/i.test(id);
}

/**
 * Borra entradas que se crearon y quedaron sin nada escrito hace más de una hora.
 * Las que solo tienen ánimo se borran si ese ánimo ya está en el check-in del día.
 */
async function limpiarVacias() {
  const empty = await prisma.journalEntry.findMany({
    where: { title: null, body: "", tags: { isEmpty: true }, attachments: { none: {} }, updatedAt: { lt: new Date(Date.now() - 3_600_000) } },
    select: { id: true, date: true, mood: true },
  });
  if (!empty.length) return;
  const withMood = empty.filter((e) => e.mood !== null);
  const checkins = withMood.length
    ? await prisma.dailyCheckin.findMany({ where: { date: { in: withMood.map((e) => e.date) } }, select: { date: true, mood: true } })
    : [];
  const moodOf = new Map(checkins.map((c) => [+c.date, c.mood]));
  const ids = empty.filter((e) => e.mood === null || moodOf.get(+e.date) === e.mood).map((e) => e.id);
  if (ids.length) await prisma.journalEntry.deleteMany({ where: { id: { in: ids } } });
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
  // Si ese día ya hay ánimo en el check-in, la entrada arranca con ese.
  const checkin = await prisma.dailyCheckin.findUnique({ where: { date: toDbDate(day) }, select: { mood: true } });
  const created = await prisma.journalEntry.create({
    data: { date: toDbDate(day), mood: isMood(checkin?.mood) ? checkin.mood : null },
    select: { id: true },
  });
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
  const mood = isMood(input.mood) ? input.mood : null;
  try {
    const prev = await prisma.journalEntry.findUnique({ where: { id }, select: { mood: true } });
    const e = await prisma.journalEntry.update({
      where: { id },
      data: { date: toDbDate(input.date), title, body: input.body, mood, tags: normalizeTags(input.tags) },
      select: { updatedAt: true },
    });
    if (prev && prev.mood !== mood) await syncCheckinMood(input.date, prev.mood, mood);
    refrescar();
    return { ok: true, savedAt: e.updatedAt.toISOString() };
  } catch (e) {
    if ((e as { code?: string }).code === "P2025") return { ok: false, error: "Esta entrada ya no existe." };
    throw e;
  }
}

/**
 * El ánimo elegido en el journal pasa al check-in de ese día (uno solo por día).
 * Si se saca, se borra del check-in solo si era el mismo.
 */
async function syncCheckinMood(date: string, prev: number | null, mood: number | null) {
  if (date > todayISO()) return;
  const d = toDbDate(date);
  if (mood === null) {
    if (prev !== null) {
      await prisma.dailyCheckin.updateMany({ where: { date: d, mood: prev }, data: { mood: null } });
      // Si el check-in quedó sin ningún dato, sobra (si no, contaría como check-in cargado).
      await prisma.dailyCheckin.deleteMany({
        where: { date: d, mood: null, energy: null, stress: null, sleepMin: null, weightG: null, steps: null, note: null },
      });
    }
  } else {
    await prisma.dailyCheckin.upsert({ where: { date: d }, create: { date: d, mood }, update: { mood } });
  }
  revalidatePath("/");
}

/**
 * Lo compartido desde otra app va a la entrada de hoy (al final del texto) o a
 * una nueva si hoy todavía no hay. Devuelve la entrada para subirle fotos.
 */
export async function shareToJournal(text: string): Promise<{ id: string }> {
  await exigirSesion();
  const day = todayISO();
  const clean = String(text ?? "").trim().slice(0, 5000);
  const existing = await prisma.journalEntry.findFirst({ where: { date: toDbDate(day) }, orderBy: { createdAt: "asc" } });
  if (existing) {
    if (clean) {
      const body = existing.body.trim() ? `${existing.body.trimEnd()}

${clean}` : clean;
      await prisma.journalEntry.update({ where: { id: existing.id }, data: { body: body.slice(0, BODY_MAX) } });
    }
    refrescar();
    return { id: existing.id };
  }
  const checkin = await prisma.dailyCheckin.findUnique({ where: { date: toDbDate(day) }, select: { mood: true } });
  const created = await prisma.journalEntry.create({
    data: { date: toDbDate(day), body: clean, mood: isMood(checkin?.mood) ? checkin.mood : null },
  });
  await logActivity("created", "journal", created.id, `Entrada del ${day} (compartido)`);
  refrescar();
  return { id: created.id };
}

/** Al salir del editor sin haber escrito nada, la entrada no queda guardada. */
export async function discardIfEmpty(id: string) {
  await exigirSesion();
  if (!validId(id)) return;
  const e = await prisma.journalEntry.findUnique({ where: { id }, include: { _count: { select: { attachments: true } } } });
  if (e && isEmptyEntry(e) && e._count.attachments === 0) {
    await prisma.journalEntry.delete({ where: { id } });
    refrescar();
  }
}

export async function deleteEntry(id: string) {
  await exigirSesion();
  if (!validId(id)) throw new Error("Entrada inválida");
  await trashAndDelete("journal", id);
  refrescar();
  redirect("/journal");
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
    where: { tags: { has: REVIEW_TAG }, date: { gte: toDbDate(startOfWeek(monday)), lte: toDbDate(addDays(sunday, 1)) } },
    select: { id: true },
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
