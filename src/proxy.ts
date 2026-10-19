import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { auth } from "@/lib/auth";
import { mailSinLogin } from "@/lib/dev-login";

/**
 * La puerta de toda la app: valida la sesión de verdad (contra la base) antes de
 * dejar pasar una página o una API. No alcanza con el layout de (app): la página
 * se dibuja en paralelo con el layout y sus datos salían en la respuesta aunque
 * el layout redirigiera al login (pasaba con una cookie inventada). Las server
 * actions igual vuelven a validar con `exigirSesion()`.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname === "/login" || pathname.startsWith("/api/auth")) return NextResponse.next();
  // Los cron de Vercel no tienen sesión: la ruta valida CRON_SECRET.
  if (pathname.startsWith("/api/cron/")) return NextResponse.next();
  // El webhook de WhatsApp tampoco: la ruta valida la firma de Meta y el número de Facu.
  if (pathname === "/api/whatsapp") return NextResponse.next();
  if (mailSinLogin()) return NextResponse.next();

  // Sin cookie ni se consulta la base; con cookie, se comprueba que la sesión exista y no haya vencido.
  if (getSessionCookie(request, { cookiePrefix: "sb" })) {
    const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
    if (session?.user) return NextResponse.next();
  }

  if (pathname.startsWith("/api")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const login = new URL("/login", request.url);
  // Solo una ruta de esta app ("//otro.com" sería una redirección abierta al volver del login).
  if (pathname !== "/" && /^\/(?!\/|\\)/.test(pathname)) login.searchParams.set("volver", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon|apple-icon|manifest.webmanifest|sw.js).*)"],
};
