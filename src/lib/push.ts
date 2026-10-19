import "server-only";
import webpush from "web-push";
import { prisma } from "./prisma";
import type { PushPayload } from "./reminder-logic";

/**
 * Envío de avisos (Web Push estándar con VAPID, sin servicios de terceros: cada
 * navegador trae su servicio de push). Claves en VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY /
 * VAPID_SUBJECT (la pública también como NEXT_PUBLIC_VAPID_PUBLIC_KEY).
 */

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null;
}

export function pushConfigured(): boolean {
  return Boolean(vapidPublicKey() && process.env.VAPID_PRIVATE_KEY);
}

let ready = false;
function setup() {
  if (ready) return;
  const pub = vapidPublicKey();
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) throw new Error("Faltan las claves de avisos (VAPID) en el servidor.");
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:facundo.lapente@gmail.com", pub, priv);
  ready = true;
}

export type PushResult = { sent: number; removed: number; failed: number; errors: string[] };

/**
 * Manda el aviso a todos los aparatos (o a uno, por `endpoint`). Los que el servicio
 * da por muertos (404/410: se desinstaló la app, se borraron los datos o venció) se borran.
 */
export async function sendPush(payload: PushPayload, opts: { endpoint?: string } = {}): Promise<PushResult> {
  setup();
  const subs = await prisma.pushSubscription.findMany({ where: opts.endpoint ? { endpoint: opts.endpoint } : undefined });
  const result: PushResult = { sent: 0, removed: 0, failed: 0, errors: [] };
  const body = JSON.stringify(payload);
  // De a uno: en la compu la base admite una sola conexión, y son pocos aparatos.
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
        // Si el celular está apagado, el aviso espera hasta 4 horas; después ya no sirve.
        TTL: 4 * 3600,
        urgency: "normal",
        // Uno nuevo del mismo tipo reemplaza al que todavía no llegó.
        topic: payload.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || undefined,
      });
      result.sent++;
      await prisma.pushSubscription.update({ where: { id: s.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        result.removed++;
      } else {
        result.failed++;
        result.errors.push(status ? `HTTP ${status}` : e instanceof Error ? e.message : String(e));
      }
    }
  }
  return result;
}
