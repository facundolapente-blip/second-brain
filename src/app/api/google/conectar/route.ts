import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getUsuario } from "@/lib/session";
import { GCAL_SCOPE, gcalClient } from "@/lib/gcal";

export const dynamic = "force-dynamic";

/**
 * "Conectar Google Calendar" (Datos): lleva a la pantalla de permiso de Google.
 * Facu entra y acepta ahí; Google vuelve a `/api/google/callback` con un código.
 * `state` al azar en una cookie: la vuelta solo se acepta si coincide.
 */
export async function GET(req: Request) {
  if (!(await getUsuario())) return new Response("No autorizado", { status: 401 });
  const client = gcalClient();
  const origin = new URL(req.url).origin;
  if (!client) return NextResponse.redirect(`${origin}/datos?google=sin-cliente`);
  const state = randomBytes(16).toString("hex");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: client.id,
    redirect_uri: `${origin}/api/google/callback`,
    response_type: "code",
    scope: GCAL_SCOPE,
    // Sin esto Google no da el permiso para seguir conectado (refresh token).
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  }).toString();
  const res = NextResponse.redirect(url.toString());
  res.cookies.set("sb_google_state", state, { httpOnly: true, secure: origin.startsWith("https"), sameSite: "lax", path: "/api/google", maxAge: 600 });
  return res;
}
