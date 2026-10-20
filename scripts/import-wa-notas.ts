/**
 * Importa a Notas el chat de WhatsApp de Facu consigo mismo (export .txt "Exportar chat").
 *
 *   node --env-file=.env scripts/import-wa-notas.ts <chat.txt> [--simular]
 *
 * Cada mensaje es una nota en la sección que decide `classifyNote` (la misma regla que el bot).
 * Lo de Facu (2026-10-19): todo va a Notas, nada al Journal; las ideas con forma de tarea
 * también. Se saltean fotos, stickers y documentos (el export no trae los archivos) y lo que
 * parece una contraseña o una clave. A los links se les sacan los parámetros de rastreo y de
 * acceso (mcp_token, fbclid, utm_…). Un precio suelto justo después de un link de tienda
 * ("260 con envío") se suma a esa nota. Se puede correr de nuevo: `externalId` evita duplicados.
 */
import { readFileSync } from "node:fs";
import { nuevoPrisma } from "../src/lib/prisma-conexion.ts";
import { classifyNote, detectUrl, looksLikePrice, looksLikeSecret, normalizeNoteUrl, suggestNoteTags, urlKindOf, youtubeId, youtubeThumb, bodyWithoutUrl } from "../src/lib/notes-logic.ts";

const file = process.argv[2];
if (!file || file.startsWith("--")) throw new Error("Uso: node --env-file=.env scripts/import-wa-notas.ts <chat.txt> [--simular]");
const DRY = process.argv.includes("--simular");

type Msg = { at: Date; text: string; n: number };

/** "[2/25/26, 4:01:51 PM] Tú: …" (formato de EE. UU. del export); los renglones siguientes son del mismo mensaje. */
function parse(raw: string): Msg[] {
  const out: Msg[] = [];
  const head = /^\[(\d{1,2})\/(\d{1,2})\/(\d{2}), (\d{1,2}):(\d{2}):(\d{2})\s*([AP]M)\] [^:]+: ?(.*)$/;
  for (const line of raw.replace(/\r/g, "").split("\n")) {
    const m = line.replace(/^[‎‏]+/, "").match(head);
    if (m) {
      let h = Number(m[4]) % 12;
      if (m[7] === "PM") h += 12;
      // Hora de Montevideo (UTC−3) → UTC.
      const at = new Date(Date.UTC(2000 + Number(m[3]), Number(m[1]) - 1, Number(m[2]), h + 3, Number(m[5]), Number(m[6])));
      out.push({ at, text: m[8], n: out.length });
    } else if (out.length) out[out.length - 1].text += `\n${line}`;
  }
  return out.map((x) => ({ ...x, text: x.text.replace(/^\[Reenviado\]\s*/i, "").trim() }));
}

/** Saca de un link los parámetros que no sirven o que son tokens de acceso. */
function cleanUrl(u: string): string {
  try {
    const url = new URL(u.startsWith("http") ? u : `https://${u}`);
    for (const k of [...url.searchParams.keys()]) {
      if (/^(utm_.+|fbclid|gclid|mcp_token|igsh|si|is|srsltid|dlrf|pp|ref|referral_.+|tracking|plan-fit)$/i.test(k)) url.searchParams.delete(k);
    }
    return url.toString();
  } catch {
    return u;
  }
}

async function youtubeTitle(url: string): Promise<string | null> {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { title?: string };
    return j.title?.trim() || null;
  } catch {
    return null;
  }
}

const msgs = parse(readFileSync(file, "utf8"));
const prisma = nuevoPrisma();
const counts: Record<string, number> = {};
let skippedMedia = 0;
let skippedSecret = 0;
let prices = 0;
let created = 0;
let last: { id: string | null; section: string; at: Date; hasPrice: boolean } | null = null;

for (const m of msgs) {
  if (!m.text || /cifrados de extremo a extremo/.test(m.text)) continue;
  if (/^<(imagen|sticker|audio|video|documento|gif)[^>]*omitid[oa]>/i.test(m.text)) {
    skippedMedia++;
    continue;
  }
  // Los links, sin rastreo ni tokens; recién ahí se mira si queda algo que parece una clave.
  const rawUrl = detectUrl(m.text);
  const text = rawUrl ? m.text.split(rawUrl).join(cleanUrl(rawUrl)) : m.text;
  if (looksLikeSecret(text)) {
    skippedSecret++;
    continue;
  }
  // Precio justo después de un link de tienda.
  if (looksLikePrice(text) && last && last.section === "compras" && !last.hasPrice && m.at.getTime() - last.at.getTime() < 15 * 60 * 1000) {
    prices++;
    if (!DRY && last.id) await prisma.note.update({ where: { id: last.id }, data: { price: text.slice(0, 80) } });
    last.hasPrice = true;
    console.log(`   precio: ${text}`);
    continue;
  }
  const raw = detectUrl(text);
  const url = normalizeNoteUrl(raw);
  const section = classifyNote({ text, url });
  const tags = suggestNoteTags({ text, url });
  const yt = url ? youtubeId(url) : null;
  const title = yt && url ? await youtubeTitle(url) : null;
  const body = bodyWithoutUrl(text, raw);
  counts[section] = (counts[section] ?? 0) + 1;
  console.log(`${section.padEnd(8)} ${(title ?? body ?? url ?? "").replace(/\s+/g, " ").slice(0, 70) || url}`);
  let id: string | null = null;
  if (!DRY) {
    const externalId = `yo:${m.at.toISOString()}#${m.n}`;
    const note = await prisma.note.upsert({
      where: { source_externalId: { source: "import", externalId } },
      create: {
        section,
        title,
        body,
        url,
        urlKind: urlKindOf(url),
        thumbnail: yt ? youtubeThumb(yt) : null,
        tags,
        source: "import",
        externalId,
        createdAt: m.at,
      },
      update: {},
      select: { id: true },
    });
    id = note.id;
    created++;
  }
  last = { id, section, at: m.at, hasPrice: false };
}

console.log("\nPor sección:", JSON.stringify(counts));
console.log(`Notas: ${DRY ? Object.values(counts).reduce((a, b) => a + b, 0) : created} · precios sumados: ${prices} · salteados: ${skippedMedia} archivos sin el archivo, ${skippedSecret} contraseñas o claves`);
if (DRY) console.log("(--simular: no se escribió nada)");
await prisma.$disconnect();
