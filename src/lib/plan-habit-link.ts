import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "./prisma";
import { HABITS_PLAN_LINKED_KEY } from "./habit-logic";

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

/**
 * Hábitos atados al Plan (hoy solo Gym, `habitos_ligados_plan`): tildar su bloque
 * marca el hábito como hecho ese día y destildarlo saca esa marca (pedido de Facu,
 * 2026-10-23). Una marca de fallado o salteado no se toca al destildar, y la nota
 * del día queda.
 */
export async function syncLinkedHabit(blockId: string, done: boolean) {
  const row = await prisma.appSetting.findUnique({ where: { key: HABITS_PLAN_LINKED_KEY } });
  let ids: string[] = [];
  try {
    const v = JSON.parse(row?.value ?? "[]");
    if (Array.isArray(v)) ids = v.filter((x): x is string => typeof x === "string");
  } catch {}
  if (!ids.length) return;
  const block = await prisma.planBlock.findUnique({ where: { id: blockId }, select: { title: true, date: true } });
  if (!block) return;
  const habits = await prisma.habit.findMany({
    where: { id: { in: ids }, archivedAt: null },
    select: { id: true, name: true, target: true },
  });
  const matched = habits.filter((h) => fold(h.name) === fold(block.title));
  if (!matched.length) return;
  for (const h of matched) {
    const key = { habitId: h.id, date: block.date };
    const log = await prisma.habitLog.findUnique({ where: { habitId_date: key } });
    if (done) {
      const value = Math.max(1, h.target);
      await prisma.habitLog.upsert({
        where: { habitId_date: key },
        create: { ...key, status: "done", value, source: "app" },
        update: { status: "done", value, source: "app" },
      });
    } else if (log?.status === "done") {
      if (log.note) await prisma.habitLog.update({ where: { habitId_date: key }, data: { status: "none", value: 0, source: "app" } });
      else await prisma.habitLog.delete({ where: { habitId_date: key } });
    }
  }
  revalidatePath("/habitos", "layout");
}
