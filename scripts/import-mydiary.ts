/**
 * Importa el export de My Diary al Journal. La lógica está en
 * src/lib/importers/mydiary.ts (la misma que usa la pantalla Datos de la app).
 *
 *   node --env-file=.env scripts/import-mydiary.ts <archivo.docx|.pdf|.txt> [--drop-demo] [--dry]
 *
 * El .docx es el más fiel: reimportarlo actualiza título y texto. Desde PDF (o
 * su texto) solo se agregan las entradas que no estaban. --dry muestra lo que
 * leyó sin tocar la base. --drop-demo borra antes las entradas de ejemplo.
 */
import { readFileSync } from "node:fs";
import { nuevoPrisma } from "../src/lib/prisma-conexion.ts";
import { importMyDiary, linesFromDocx, linesFromPdf, linesFromText, parseEntries } from "../src/lib/importers/mydiary.ts";

const [file] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!file) throw new Error("Uso: node --env-file=.env scripts/import-mydiary.ts <archivo.docx|.pdf|.txt> [--drop-demo] [--dry]");
const ext = file.toLowerCase().split(".").pop();
const buf = new Uint8Array(readFileSync(file));
const lines =
  ext === "pdf" ? await linesFromPdf(buf) : ext === "txt" ? linesFromText(new TextDecoder().decode(buf)) : linesFromDocx(buf);
const entries = parseEntries(lines);

if (process.argv.includes("--dry")) {
  for (const e of entries) console.log(`── ${e.date} · ${e.title ?? "(sin título)"}\n${e.body}\n`);
} else {
  const prisma = nuevoPrisma();
  if (process.argv.includes("--drop-demo")) {
    const { count } = await prisma.journalEntry.deleteMany({ where: { source: "demo" } });
    console.log(`Borradas ${count} entradas de ejemplo.`);
  }
  console.log(await importMyDiary(prisma, entries, { updateExisting: ext === "docx" }));
  await prisma.$disconnect();
}
