import { pushConfigured } from "@/lib/push";
import { runReminders } from "@/lib/reminders";
import { syncWatch } from "@/lib/watch";
import { syncGoogleCalendar } from "@/lib/gcal";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Avisos al celular (crons de Vercel, ver vercel.json: uno por día para cada hora de
 * 6 a 23 de Montevideo, porque el plan gratis no deja crons de más de una vez por día).
 * Manda los avisos cuya hora llegó y que hoy no salieron (`runReminders`).
 * Vercel manda `Authorization: Bearer <CRON_SECRET>`; sin eso no se hace nada.
 * `?simular=1` devuelve qué mandaría ahora, sin mandar ni anotar nada (`&hora=21`: como si fueran las 21).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("No autorizado", { status: 401 });
  }
  const params = new URL(req.url).searchParams;
  const dryRun = params.get("simular") === "1";
  const hora = Number(params.get("hora") ?? NaN);
  // De paso, cada hora: pasos, sueño y peso del reloj de los últimos 3 días (si está conectado).
  const watch = dryRun ? null : await syncWatch({ days: 3 }).catch(() => null);
  // Y los eventos de Google Calendar (si está configurado).
  const calendar = dryRun ? null : await syncGoogleCalendar({ force: true }).catch(() => null);
  if (!dryRun && !pushConfigured()) return Response.json({ ok: false, error: "Faltan las claves VAPID" }, { status: 500 });
  try {
    const run = await runReminders({ dryRun, hour: Number.isInteger(hora) && hora >= 0 && hora <= 23 ? hora : undefined });
    return Response.json({ ok: true, ...run, reloj: watch, calendario: calendar });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
