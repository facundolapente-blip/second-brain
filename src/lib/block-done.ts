import "server-only";
import { prisma } from "./prisma";
import { syncLinkedHabit } from "./plan-habit-link";

/**
 * Tilda o destilda un bloque del Plan con todo lo que lo sigue: la tarea de un objetivo
 * agendada en él, el hábito atado (Gym) y la tarea prioritaria del día si es ese bloque
 * (pedido de Facu, 2026-11-23: "La hice" y el bloque van juntos). Sin sesión: la llaman
 * `setBlockDone` y `saveRitual`, que ya la validaron. `fromRitual`: no vuelve a tocar el ritual.
 */
export async function markBlockDone(id: string, done: boolean, opts: { fromRitual?: boolean } = {}) {
  await prisma.planBlock.updateMany({ where: { id }, data: { done } });
  await prisma.planStep.updateMany({ where: { blockId: id }, data: { done, doneAt: done ? new Date() : null } });
  await syncLinkedHabit(id, done);
  if (!opts.fromRitual) {
    // Solo "La hice" sin tocar: si ya estaba hecha, queda con su hora.
    await prisma.dailyRitual.updateMany({
      where: done ? { frogBlockId: id, frogDoneAt: null } : { frogBlockId: id },
      data: { frogDoneAt: done ? new Date() : null },
    });
  }
}
