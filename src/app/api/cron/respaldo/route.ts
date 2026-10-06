import { backupsEnabled, saveBackup } from "@/lib/backup";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Respaldo automático de los lunes (cron de Vercel, ver vercel.json). Vercel manda
 * `Authorization: Bearer <CRON_SECRET>`; sin eso no se hace nada.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("No autorizado", { status: 401 });
  }
  if (!backupsEnabled()) return Response.json({ ok: false, error: "Falta el almacén de respaldos" }, { status: 500 });
  try {
    const b = await saveBackup(true);
    return Response.json({ ok: true, pathname: b.pathname, size: b.size });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
