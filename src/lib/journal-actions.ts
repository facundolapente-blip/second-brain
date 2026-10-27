"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { exigirSesion } from "./session";
import { logActivity, trashAndDelete } from "./trash";
import { addDays, fromDbDate, isISODate, startOfWeek, toDbDate, todayISO } from "./dates";
import { QUARTER_REVIEW_TAG, REVIEW_TAG, REVIEW_TEMPLATE } from "./review-logic";
import { BODY_MAX, isEmptyEntry, isMood, normalizeTags, TITLE_MAX } from "./journal-logic";
import { appendToJournal } from "./journal-append";

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
    // La reflexión semanal no es "la entrada del día": "Escribir hoy" no la abre.
    const existing = await prisma.journalEntry.findFirst({
      where: { date: toDbDate(day), NOT: { tags: { hasSome: [REVIEW_TAG, QUARTER_REVIEW_TAG] } } },
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
      if (prevDate !== input.date) {
        // Cambió de día: el ánimo se va con la entrada (uno solo por día).
        await moveCheckinMood(id, prevDate, input.date, prev.mood, mood);
      } else if (prev.mood !== mood) {
        await syncCheckinMood(input.date, prev.mood, mood);
      }
    }
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
    if (prev !== null) await clearCheckinMood(d, prev);
  } else {
    await prisma.dailyCheckin.upsert({ where: { date: d }, create: { date: d, mood }, update: { mood } });
  }
  revalidatePath("/");
}

/** Saca el ánimo del check-in de ese día si era ese; si el check-in queda sin ningún dato, sobra. */
async function clearCheckinMood(d: Date, mood: number) {
  await prisma.dailyCheckin.updateMany({ where: { date: d, mood }, data: { mood: null } });
  // Si el check-in quedó sin ningún dato, sobra (si no, contaría como check-in cargado).
  await prisma.dailyCheckin.deleteMany({
    where: { date: d, mood: null, energy: null, stress: null, sleepMin: null, weightG: null, steps: null, stressScore: null, hrMin: null, hrMax: null, distanceM: null, activeKcal: null, note: null },
  });
}

/**
 * La entrada pasó de `from` a `to`: el día viejo pierde el ánimo del check-in
 * solo si era el de esta entrada y no queda otra entrada ese día con el mismo;
 * el día nuevo lo toma si su check-in no tenía ánimo.
 */
async function moveCheckinMood(id: string, from: string, to: string, prevMood: number | null, mood: number | null) {
  const today = todayISO();
  if (prevMood !== null && from <= today) {
    const other = await prisma.journalEntry.findFirst({
      where: { date: toDbDate(from), mood: prevMood, id: { not: id } },
      select: { id: true },
    });
    if (!other) await clearCheckinMood(toDbDate(from), prevMood);
  }
  if (mood !== null && to <= today) {
    const d = toDbDate(to);
    const checkin = await prisma.dailyCheckin.findUnique({ where: { date: d }, select: { mood: true } });
    if (!checkin) await prisma.dailyCheckin.create({ data: { date: d, mood } });
    else if (checkin.mood === null) await prisma.dailyCheckin.update({ where: { date: d }, data: { mood } });
  }
  revalidatePath("/");
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

/** Marca o desmarca una entrada como favorita (la estrella; pedido de Facu, 2026-10-27). */
export async function setEntryStarred(id: string, starred: boolean): Promise<{ ok: true }> {
  await exigirSesion();
  if (!validId(id)) throw new Error("Entrada inválida");
  await prisma.journalEntry.updateMany({ where: { id }, data: { starred: !!starred } });
  refrescar();
  return { ok: true };
}

/**
 * Manda la entrada a la papelera. No redirige: el editor avisa "Entrada borrada ·
 * Deshacer" recién cuando terminó (si no, un Deshacer rápido restauraba otra cosa) y vuelve solo.
 */
export async function deleteEntry(id: string): Promise<{ ok: true }> {
  await exigirSesion();
  if (!validId(id)) throw new Error("Entrada inválida");
  await trashAndDelete("journal", id);
  refrescar();
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
