"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "./prisma";
import { exigirSesion } from "./session";
import { todayISO } from "./dates";
import { isValidBirth, MEMENTO_KEY, serializeMemento } from "./memento";

/** Fecha de nacimiento y hasta qué edad cuenta el Memento mori de Inicio. */
export async function saveMemento(birth: string, years: number): Promise<{ ok: true } | { ok: false; error: string }> {
  await exigirSesion();
  if (!isValidBirth(birth, todayISO())) return { ok: false, error: "Fecha de nacimiento inválida." };
  const y = Math.round(Number(years));
  if (!(y >= 30 && y <= 120)) return { ok: false, error: "La edad tiene que estar entre 30 y 120." };
  const value = serializeMemento({ birth, years: y });
  await prisma.appSetting.upsert({ where: { key: MEMENTO_KEY }, create: { key: MEMENTO_KEY, value }, update: { value } });
  revalidatePath("/");
  return { ok: true };
}
