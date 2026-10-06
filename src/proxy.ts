import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { mailSinLogin } from "@/lib/dev-login";

/**
 * Primer filtro: solo mira si hay cookie de sesión, sin tocar la base. NO es la
 * seguridad de verdad (una cookie se puede inventar): esa está en el layout de
 * (app) y en cada server action. Esto es para ir derecho al login.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname === "/login" || pathname.startsWith("/api/auth")) return NextResponse.next();
  // Los cron de Vercel no tienen sesión: la ruta valida CRON_SECRET.
  if (pathname.startsWith("/api/cron/")) return NextResponse.next();
  if (mailSinLogin()) return NextResponse.next();

  if (getSessionCookie(request, { cookiePrefix: "sb" })) return NextResponse.next();

  if (pathname.startsWith("/api")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("volver", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon|apple-icon|manifest.webmanifest|sw.js).*)"],
};
