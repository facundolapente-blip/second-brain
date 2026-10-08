import { prisma } from "@/lib/prisma";
import { buildBackup, markDownloaded } from "@/lib/backup";
import { getUsuario } from "@/lib/session";
import { fromDbDate, todayISO } from "@/lib/dates";

export const dynamic = "force-dynamic";

/**
 * Descarga de los datos propios:
 *   ?formato=json     todo (el mismo respaldo completo que el automático), comprimido:
 *                     sin comprimir pasa el límite de 4,5 MB de respuesta de Vercel
 *   ?formato=gastos   movimientos en CSV (se abre en Excel o Sheets)
 *   ?formato=journal  el journal en Markdown
 */
export async function GET(req: Request) {
  if (!(await getUsuario())) return new Response("No autorizado", { status: 401 });
  const formato = new URL(req.url).searchParams.get("formato") ?? "json";
  const stamp = todayISO();

  if (formato === "gastos") {
    const txs = await prisma.transaction.findMany({
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      include: { account: { select: { name: true, currency: true } }, toAccount: { select: { name: true } }, category: { select: { name: true } } },
    });
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const tipo = { expense: "Gasto", income: "Ingreso", transfer: "Transferencia" } as Record<string, string>;
    const rows = [
      ["Fecha", "Tipo", "Título", "Monto", "Moneda", "Cuenta", "Categoría", "Cuenta destino", "Monto destino", "Nota"],
      ...txs.map((t) => [
        fromDbDate(t.date),
        tipo[t.kind] ?? t.kind,
        t.title,
        String(t.amount).replace(".", ","),
        t.account.currency,
        t.account.name,
        t.category?.name ?? (t.kind === "transfer" ? "" : "Sin clasificar"),
        t.toAccount?.name ?? "",
        t.toAmount === null ? "" : String(t.toAmount).replace(".", ","),
        t.note,
      ]),
    ];
    // BOM para que Excel lea bien los acentos.
    const csv = "﻿" + rows.map((r) => r.map(esc).join(";")).join("\r\n");
    return download(csv, `gastos-${stamp}.csv`, "text/csv; charset=utf-8");
  }

  if (formato === "journal") {
    const entries = await prisma.journalEntry.findMany({ orderBy: [{ date: "asc" }, { createdAt: "asc" }] });
    const md = entries
      .filter((e) => e.body.trim() || e.title)
      .map((e) => {
        const meta = [e.mood ? `ánimo ${e.mood}/5` : "", e.tags.length ? e.tags.map((t) => `#${t}`).join(" ") : ""].filter(Boolean).join(" · ");
        return `## ${fromDbDate(e.date)}${e.title ? ` · ${e.title}` : ""}\n${meta ? `_${meta}_\n` : ""}\n${e.body.trim()}\n`;
      })
      .join("\n");
    return download(`# Journal\n\n${md}`, `journal-${stamp}.md`, "text/markdown; charset=utf-8");
  }

  const body = new Uint8Array(await buildBackup());
  await markDownloaded();
  return download(body, `second-brain-${stamp}.json.gz`, "application/gzip");
}

function download(body: string | Uint8Array<ArrayBuffer>, name: string, type: string) {
  return new Response(body, {
    headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
}
