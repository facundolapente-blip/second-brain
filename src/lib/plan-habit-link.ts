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
async function linkedIds(): Promise<string[]> {
  const row = await prisma.appSetting.findUnique({ where: { key: HABITS_PLAN_LINKED_KEY } });
  try {
    const v = JSON.parse(row?.value ?? "[]");
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  } catch {}
  return [];
}

/**
 * El otro sentido (pedido de Facu, 2026-10-26: "tienen que estar linkeados en ambas
 * direcciones"): marcar el hábito como hecho tilda los bloques de ese día con su mismo
 * nombre, y sacarle el hecho (destildar, fallado, salteado) los destilda. Escribe
 * directo en la base, sin pasar por `setBlockDone`, así no vuelve a tocar el hábito.
 */
export async function syncLinkedBlocks(habitId: string, date: Date, done: boolean) {
  const ids = await linkedIds();
  if (!ids.includes(habitId)) return;
  const habit = await prisma.habit.findUnique({ where: { id: habitId }, select: { name: true } });
  if (!habit) return;
  const blocks = await prisma.planBlock.findMany({ where: { date, done: !done }, select: { id: true, title: true } });
  const matched = blocks.filter((b) => fold(b.title) === fold(habit.name)).map((b) => b.id);
  if (!matched.length) return;
  await prisma.planBlock.updateMany({ where: { id: { in: matched } }, data: { done } });
  // La tarea de un objetivo agendada en ese bloque sigue al bloque, como al tildarlo.
  await prisma.planStep.updateMany({ where: { blockId: { in: matched } }, data: { done, doneAt: done ? new Date() : null } });
  revalidatePath("/plan", "layout");
}

export async function syncLinkedHabit(blockId: string, done: boolean) {
  const ids = await linkedIds();
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
