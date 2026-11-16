import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "./prisma";
import { toDbDate } from "./dates";

/**
 * Escribir en el Journal tilda el hábito de journaling de ese día (pedido de Facu,
 * 2026-11-15). El hábito es el que tiene "journal" en el nombre ("Journaling"), sin archivar.
 *
 * - Un día con una entrada escrita (título o texto que no sea solo espacios) → hecho.
 * - Si ese día deja de tener algo escrito (se borró la entrada o se pasó a otro día, como
 *   cuando escribe después de medianoche y la corre a ayer) → se saca la marca, pero
 *   **solo la que puso el journal** (`source = "journal"`): un hecho marcado a mano, un
 *   fallado o un salteado no se tocan, y la nota del día queda.
 * - Un hecho ya marcado (a mano o desde HabitNow) se deja como está.
 *
 * La importación de HabitNow no pisa las marcas `journal` (igual que las `app`).
 */
export const JOURNAL_HABIT_SOURCE = "journal";

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

async function journalHabits() {
  const habits = await prisma.habit.findMany({ where: { archivedAt: null }, select: { id: true, name: true, target: true } });
  return habits.filter((h) => fold(h.name).includes("journal"));
}

async function writtenOn(day: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*)::bigint AS n FROM "JournalEntry" e
    WHERE e.date = ${toDbDate(day)}::date AND (e.title ~ '[^[:space:]]' OR e.body ~ '[^[:space:]]')`;
  return Number(rows[0]?.n ?? 0) > 0;
}

/** Pone o saca la marca del hábito de journaling en cada día que cambió. */
export async function syncJournalHabit(...days: (string | null | undefined)[]) {
  const unique = [...new Set(days.filter((d): d is string => !!d))];
  if (!unique.length) return;
  const habits = await journalHabits();
  if (!habits.length) return;
  let changed = false;
  for (const day of unique) {
    const written = await writtenOn(day);
    const date = toDbDate(day);
    for (const h of habits) {
      const key = { habitId: h.id, date };
      const log = await prisma.habitLog.findUnique({ where: { habitId_date: key } });
      if (written) {
        if (log?.status === "done") continue;
        // Un fallado o salteado puesto a mano también pasa a hecho: escribió.
        const value = Math.max(1, h.target);
        await prisma.habitLog.upsert({
          where: { habitId_date: key },
          create: { ...key, status: "done", value, source: JOURNAL_HABIT_SOURCE },
          update: { status: "done", value, source: JOURNAL_HABIT_SOURCE },
        });
        changed = true;
      } else if (log?.status === "done" && log.source === JOURNAL_HABIT_SOURCE) {
        if (log.note) await prisma.habitLog.update({ where: { habitId_date: key }, data: { status: "none", value: 0, source: "app" } });
        else await prisma.habitLog.delete({ where: { habitId_date: key } });
        changed = true;
      }
    }
  }
  if (changed) {
    revalidatePath("/habitos", "layout");
    revalidatePath("/");
  }
}
