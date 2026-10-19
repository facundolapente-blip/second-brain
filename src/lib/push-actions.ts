"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "./prisma";
import { exigirSesion } from "./session";
import { pushConfigured, sendPush } from "./push";
import { REMINDERS_KEY } from "./reminders";
import { normalizePrefs, type ReminderPrefs } from "./reminder-logic";

/** Pantalla de Avisos (Herramientas). Sin señal no tienen sentido: van tal cual (`offline/push.ts`). */

const B64URL = /^[A-Za-z0-9_-]{8,200}={0,2}$/;

type SubscriptionInput = { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } | null };

/** Guarda (o renueva) la suscripción de este aparato: lo que da `PushSubscription.toJSON()`. */
export async function savePushSubscription(input: SubscriptionInput, userAgent?: string) {
  await exigirSesion();
  const endpoint = typeof input?.endpoint === "string" ? input.endpoint : "";
  const p256dh = typeof input?.keys?.p256dh === "string" ? input.keys.p256dh : "";
  const auth = typeof input?.keys?.auth === "string" ? input.keys.auth : "";
  let ok = false;
  try {
    ok = new URL(endpoint).protocol === "https:" && endpoint.length <= 2000;
  } catch {
    ok = false;
  }
  if (!ok || !B64URL.test(p256dh) || !B64URL.test(auth)) throw new Error("Suscripción inválida");
  const ua = typeof userAgent === "string" ? userAgent.slice(0, 300) : null;
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { endpoint, p256dh, auth, userAgent: ua },
    update: { p256dh, auth, userAgent: ua },
  });
  revalidatePath("/avisos");
  return { ok: true as const };
}

/** Saca un aparato (por id, desde la lista; o por endpoint, al desactivar en este). */
export async function removePushSubscription(where: { id?: string; endpoint?: string }) {
  await exigirSesion();
  if (typeof where?.id === "string") await prisma.pushSubscription.deleteMany({ where: { id: where.id } });
  else if (typeof where?.endpoint === "string") await prisma.pushSubscription.deleteMany({ where: { endpoint: where.endpoint } });
  revalidatePath("/avisos");
  return { ok: true as const };
}

/** Qué avisos van y a qué hora. */
export async function saveReminderPrefs(prefs: ReminderPrefs) {
  await exigirSesion();
  const value = JSON.stringify(normalizePrefs(prefs));
  await prisma.appSetting.upsert({ where: { key: REMINDERS_KEY }, create: { key: REMINDERS_KEY, value }, update: { value } });
  revalidatePath("/avisos");
  return { ok: true as const };
}

/** Un aviso de prueba a este aparato (o a todos, sin endpoint). */
export async function sendTestPush(endpoint?: string): Promise<{ ok: boolean; message: string }> {
  await exigirSesion();
  if (!pushConfigured()) return { ok: false, message: "Faltan las claves de avisos (VAPID) en el servidor." };
  const r = await sendPush(
    { title: "Aviso de prueba", body: "Si ves esto, los avisos andan en este aparato.", url: "/avisos", tag: "aviso-prueba" },
    { endpoint: typeof endpoint === "string" ? endpoint : undefined },
  );
  revalidatePath("/avisos");
  if (r.sent) return { ok: true, message: "Mandado. Tendría que llegar en unos segundos." };
  if (r.removed) return { ok: false, message: "El servicio de avisos dio este aparato por vencido. Volvé a activarlos." };
  if (r.failed) return { ok: false, message: `No se pudo mandar (${r.errors[0] ?? "error"}).` };
  return { ok: false, message: "Este aparato no está en la lista. Volvé a activar los avisos." };
}
