import { getUsuario } from "@/lib/session";
import { openThumbnail } from "@/lib/thumbs";

export const dynamic = "force-dynamic";

/** La copia propia de la foto de un link de Instagram o TikTok (ver lib/thumbs.ts), con sesión. */
export async function GET(_req: Request, ctx: RouteContext<"/api/miniatura/[name]">) {
  if (!(await getUsuario())) return new Response("No autorizado", { status: 401 });
  const { name } = await ctx.params;
  const r = await openThumbnail(name);
  if (!r) return new Response("No existe esa imagen", { status: 404 });
  return new Response(r.stream, {
    headers: {
      "Content-Type": r.blob.contentType,
      // No cambia nunca (cada copia tiene su nombre), pero como las fotos: poco rato en el aparato.
      "Cache-Control": "private, max-age=3600",
    },
  });
}
