/**
 * Importa el export de My Diary (.docx, "MyDiary_all_*.docx") al Journal.
 *
 *   node --env-file=.env scripts/import-mydiary.ts <archivo.docx> [--drop-demo]
 *
 * Se puede correr varias veces: cada entrada se identifica por su día y su
 * orden dentro del día (source "mydiary"), así que reimportar actualiza título y
 * texto sin duplicar, y no toca el ánimo ni las etiquetas puestos en la app.
 * Con --drop-demo borra antes las entradas de ejemplo (source "demo").
 *
 * Formato del export (un párrafo de Word por línea):
 *   2026/10/01        fecha
 *   (vacío)
 *   Título            vacío si la entrada no tiene
 *   texto...          el cuerpo, con sus líneas en blanco
 *   Powered by MyDiary
 *   ---------------------------------------------   separador
 * Las entradas van de la más nueva a la más vieja. El export no trae ánimo,
 * etiquetas, hora ni fotos.
 */
import { readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import { PrismaClient } from "@prisma/client";

const SOURCE = "mydiary";
const SEPARATOR = "-".repeat(45);
const FOOTER = "Powered by MyDiary";

const [file] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const dropDemo = process.argv.includes("--drop-demo");
if (!file) throw new Error("Uso: node --env-file=.env scripts/import-mydiary.ts <archivo.docx> [--drop-demo]");

const files = unzipSync(readFileSync(file));
const xml = files["word/document.xml"];
if (!xml) throw new Error("No parece un .docx (falta word/document.xml).");

/** Texto de cada párrafo <w:p>, uniendo sus <w:t>. */
function paragraphs(doc: string): string[] {
  const decode = (s: string) =>
    s
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
      .replace(/&amp;/g, "&");
  const out: string[] = [];
  for (const p of doc.match(/<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g) ?? []) {
    let text = "";
    for (const m of p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>/g)) {
      if (m[1] !== undefined) text += decode(m[1]);
      else text += m[0] === "<w:tab/>" ? "\t" : "\n";
    }
    out.push(text);
  }
  return out;
}

type Parsed = { date: string; title: string | null; body: string };

const lines = paragraphs(strFromU8(xml));
const entries: Parsed[] = [];
let block: string[] = [];
const flush = () => {
  const b = [...block];
  block = [];
  while (b.length && !b[0].trim()) b.shift();
  if (b.length === 0) return;
  const m = b[0].trim().match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (!m) throw new Error(`Entrada sin fecha: "${b[0].slice(0, 40)}"`);
  const footer = b.findLastIndex((l) => l.trim() === FOOTER);
  const content = b.slice(1, footer === -1 ? undefined : footer);
  // content[0] = línea vacía, content[1] = título, desde content[2] el cuerpo.
  const title = (content[1] ?? "").trim() || null;
  const bodyLines = content.slice(2);
  while (bodyLines.length && !bodyLines.at(-1)!.trim()) bodyLines.pop();
  while (bodyLines.length && !bodyLines[0].trim()) bodyLines.shift();
  entries.push({ date: `${m[1]}-${m[2]}-${m[3]}`, title, body: bodyLines.join("\n") });
};
for (const l of lines) {
  if (l.trim() === SEPARATOR) flush();
  else block.push(l);
}
flush();

// Orden dentro de cada día, contando desde la más vieja (el export va de nueva
// a vieja): así una entrada nueva en un día ya importado no corre las otras.
const perDay = new Map<string, Parsed[]>();
for (const e of entries) perDay.set(e.date, [...(perDay.get(e.date) ?? []), e]);

const prisma = new PrismaClient();
if (dropDemo) {
  const { count } = await prisma.journalEntry.deleteMany({ where: { source: "demo" } });
  console.log(`Borradas ${count} entradas de ejemplo.`);
}

let created = 0;
let updated = 0;
for (const [date, list] of perDay) {
  const oldestFirst = [...list].reverse();
  for (const [i, e] of oldestFirst.entries()) {
    const externalId = `${date}#${i + 1}`;
    // createdAt ordena las entradas de un mismo día (la lista usa date + createdAt).
    const createdAt = new Date(`${date}T12:00:00.000Z`);
    createdAt.setUTCMinutes(i);
    const where = { source_externalId: { source: SOURCE, externalId } };
    const exists = await prisma.journalEntry.findUnique({ where, select: { id: true } });
    await prisma.journalEntry.upsert({
      where,
      create: {
        date: new Date(`${date}T00:00:00.000Z`),
        title: e.title,
        body: e.body,
        source: SOURCE,
        externalId,
        createdAt,
      },
      update: { title: e.title, body: e.body },
    });
    if (exists) updated++;
    else created++;
  }
}

const words = entries.reduce((n, e) => n + (e.body.match(/\S+/g)?.length ?? 0), 0);
console.log(
  `My Diary: ${entries.length} entradas (${created} nuevas, ${updated} actualizadas),`,
  `${entries.filter((e) => e.title).length} con título, ${words} palabras,`,
  `del ${entries.at(-1)?.date} al ${entries[0]?.date}.`,
);
await prisma.$disconnect();
