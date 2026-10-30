import { NextResponse, type NextRequest } from "next/server";
import { getUsuario } from "@/lib/session";
import { exchangeGcalCode, saveGcalToken, syncGoogleCalendar } from "@/lib/gcal";
import { logActivity } from "@/lib/trash";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Vuelta de la pantalla de permiso de Google: guarda el permiso y trae los eventos por primera vez. */
export async function GET(req: NextRequest) {
  if (!(await getUsuario())) return new Response("No autorizado", { status: 401 });
  const url = new URL(req.url);
  const back = (r: string) => {
    const res = NextResponse.redirect(`${url.origin}/datos?google=${r}`);
    res.cookies.delete({ name: "sb_google_state", path: "/api/google" });
    return res;
  };
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (url.searchParams.get("error")) return back("cancelado");
  if (!state || state !== req.cookies.get("sb_google_state")?.value || !code) return back("error");
  try {
    const refresh = await exchangeGcalCode(code, `${url.origin}/api/google/callback`);
    await saveGcalToken(refresh);
    await logActivity("imported", "import", null, "Google Calendar: conectado");
    await syncGoogleCalendar({ force: true });
    return back("ok");
  } catch {
    return back("error");
  }
}
