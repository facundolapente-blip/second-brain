"use server";

import { prisma } from "./prisma";
import { exigirSesion } from "./session";
import { TOOL_ORDER_KEY } from "./tool-order";

/** Guarda el orden de las Herramientas del menú lateral (direcciones, de arriba abajo). */
export async function saveToolOrder(hrefs: string[]) {
  await exigirSesion();
  const list = Array.isArray(hrefs) ? hrefs.filter((h) => typeof h === "string" && /^\/[a-z-]{1,30}$/.test(h)).slice(0, 40) : [];
  const value = JSON.stringify(list);
  await prisma.appSetting.upsert({ where: { key: TOOL_ORDER_KEY }, create: { key: TOOL_ORDER_KEY, value }, update: { value } });
  return { ok: true as const };
}
