"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "./prisma";
import { exigirSesion } from "./session";
import { logActivity, purgeTrash, restoreSnapshot, type TrashKind } from "./trash";

export type TrashResult = { ok: true } | { ok: false; error: string };

/** Saca algo de la papelera y lo vuelve a poner donde estaba. */
export async function restoreItem(id: string): Promise<TrashResult> {
  await exigirSesion();
  const item = await prisma.trashItem.findUnique({ where: { id } });
  if (!item) return { ok: false, error: "Ya no está en la papelera." };
  try {
    // Todo o nada: si algo falla a mitad de camino (un hábito con sus marcas, una
    // categoría con sus movimientos), no queda restaurado a medias y sigue en la papelera.
    const err = await prisma.$transaction(
      async (tx) => {
        const err = await restoreSnapshot(item.kind as TrashKind, item.data as never, tx);
        if (err) return err;
        await tx.trashItem.delete({ where: { id } });
        await logActivity("restored", item.kind as TrashKind, item.entityId, item.label, tx);
        return null;
      },
      { maxWait: 10_000, timeout: 60_000 },
    );
    if (err) return { ok: false, error: err };
  } catch (e) {
    // Lo más común: ya existe algo con ese id o con ese nombre.
    console.error(e);
    return { ok: false, error: "No se pudo restaurar (puede que ya exista algo igual)." };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Deshace el último borrado (el aviso de abajo): restaura lo que entró a la
 * papelera en el último minuto, junto con lo que se borró en la misma tanda
 * (las cuotas de una compra son varias filas).
 */
export async function undoLastDelete(): Promise<TrashResult> {
  await exigirSesion();
  const recent = await prisma.trashItem.findMany({
    where: { deletedAt: { gte: new Date(Date.now() - 60_000) } },
    orderBy: { deletedAt: "desc" },
    take: 30,
  });
  if (!recent.length) return { ok: false, error: "Ya no se puede deshacer: está en la papelera." };
  const newest = recent[0].deletedAt.getTime();
  const batch = recent.filter((t) => newest - t.deletedAt.getTime() < 5_000 && t.module === recent[0].module).reverse();
  for (const t of batch) {
    const r = await restoreItem(t.id);
    if (!r.ok) return r;
  }
  return { ok: true };
}

/** Borra para siempre un elemento de la papelera. */
export async function purgeItem(id: string) {
  await exigirSesion();
  const item = await prisma.trashItem.findUnique({ where: { id } });
  if (!item) return;
  await purgeTrash({ id });
  await logActivity("purged", item.kind as TrashKind, item.entityId, item.label);
  revalidatePath("/historial");
}

/** Vacía toda la papelera. */
export async function emptyTrash() {
  await exigirSesion();
  const n = await purgeTrash({});
  if (n) await prisma.activity.create({ data: { action: "purged", kind: "trash", label: `Papelera vaciada (${n})`, module: "datos" } });
  revalidatePath("/historial");
}
