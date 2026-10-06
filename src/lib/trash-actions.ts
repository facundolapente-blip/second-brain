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
    const err = await restoreSnapshot(item.kind as TrashKind, item.data as never);
    if (err) return { ok: false, error: err };
  } catch (e) {
    // Lo más común: ya existe algo con ese id o con ese nombre.
    console.error(e);
    return { ok: false, error: "No se pudo restaurar (puede que ya exista algo igual)." };
  }
  await prisma.trashItem.delete({ where: { id } });
  await logActivity("restored", item.kind as TrashKind, item.entityId, item.label);
  revalidatePath("/", "layout");
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
