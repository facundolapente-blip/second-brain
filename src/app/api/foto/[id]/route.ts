import { getUsuario } from "@/lib/session";
import { openPhoto } from "@/lib/photos";

export const dynamic = "force-dynamic";

/** Una foto del journal o un comprobante, solo con sesión. */
export async function GET(_req: Request, ctx: RouteContext<"/api/foto/[id]">) {
  if (!(await getUsuario())) return new Response("No autorizado", { status: 401 });
  const { id } = await ctx.params;
  const r = await openPhoto(id);
  if (!r) return new Response("No existe esa foto", { status: 404 });
  return new Response(r.stream, {
    headers: {
      "Content-Type": r.attachment.contentType,
      // El archivo nunca cambia: el navegador la guarda y no la vuelve a pedir.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
