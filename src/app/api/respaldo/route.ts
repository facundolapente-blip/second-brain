import { getUsuario } from "@/lib/session";
import { openBackup } from "@/lib/backup";

export const dynamic = "force-dynamic";

/** Descarga un respaldo guardado: /api/respaldo?archivo=respaldos/second-brain-….json.gz */
export async function GET(req: Request) {
  if (!(await getUsuario())) return new Response("No autorizado", { status: 401 });
  const pathname = new URL(req.url).searchParams.get("archivo") ?? "";
  const r = await openBackup(pathname);
  if (!r) return new Response("No existe ese respaldo", { status: 404 });
  return new Response(r.stream, {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="${pathname.split("/").pop()}"`,
      "Cache-Control": "no-store",
    },
  });
}
