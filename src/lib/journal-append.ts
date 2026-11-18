import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "./prisma";
import { logActivity } from "./trash";
import { toDbDate } from "./dates";
import { QUARTER_REVIEW_TAG, REVIEW_TAG } from "./review-logic";
import { BODY_MAX } from "./journal-logic";
import { syncJournalHabit } from "./journal-habit-link";

/**
 * Suma un texto al final de la entrada de un día (la primera, sin contar las
 * reflexiones de semana y trimestre), como un párrafo nuevo; si ese día no hay
 * entrada, la crea sin ánimo (el de la entrada es el de la noche). Sin sesión: la llaman
 * `shareToJournal` (que la exige) y el bot de WhatsApp (que valida firma y número).
 */
export async function appendToJournal(day: string, text: string, via: string): Promise<{ id: string; created: boolean; words: number }> {
  const clean = String(text ?? "").trim().slice(0, 5000);
  const existing = await prisma.journalEntry.findFirst({
    where: { date: toDbDate(day), NOT: { tags: { hasSome: [REVIEW_TAG, QUARTER_REVIEW_TAG] } } },
    orderBy: { createdAt: "asc" },
  });
  let id: string;
  let body: string;
  let created = false;
  if (existing) {
    body = existing.body;
    if (clean) {
      body = (existing.body.trim() ? `${existing.body.trimEnd()}\n\n${clean}` : clean).slice(0, BODY_MAX);
      await prisma.journalEntry.update({ where: { id: existing.id }, data: { body } });
    }
    id = existing.id;
  } else {
    const entry = await prisma.journalEntry.create({ data: { date: toDbDate(day), body: clean } });
    await logActivity("created", "journal", entry.id, `Entrada del ${day} (${via})`);
    id = entry.id;
    body = clean;
    created = true;
  }
  revalidatePath("/journal", "layout");
  revalidatePath("/");
  // Lo que llega por WhatsApp o "Compartir" también tilda el hábito de journaling de ese día.
  await syncJournalHabit(day);
  return { id, created, words: body.split(/\s+/).filter(Boolean).length };
}
