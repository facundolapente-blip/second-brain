"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "./prisma";
import { exigirSesion } from "./session";
import { VALUES_KEY } from "./values";

/** Guarda el texto de Valores (autoguardado de la pantalla). */
export async function saveValues(text: string) {
  await exigirSesion();
  const value = String(text ?? "").slice(0, 50_000);
  await prisma.appSetting.upsert({ where: { key: VALUES_KEY }, create: { key: VALUES_KEY, value }, update: { value } });
  revalidatePath("/");
  revalidatePath("/valores");
  return { ok: true as const };
}
