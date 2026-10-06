/**
 * Importador de My Diary: export en .docx ("MyDiary_all_*.docx"), en PDF o en
 * texto sacado del PDF. Lo usan el script y la pantalla Datos.
 *
 * Formato (un renglón por línea):
 *   2026/10/01        fecha
 *   (vacío)
 *   Título            vacío si la entrada no tiene
 *   texto...          el cuerpo, con sus líneas en blanco
 *   Powered by MyDiary
 *   ---------------------------------------------   separador
 * Las entradas van de la más nueva a la más vieja. No trae ánimo, etiquetas,
 * hora ni fotos. Cada entrada se identifica por su día y su orden dentro del
 * día contando desde la más vieja (source "mydiary"), así reimportar no duplica.
 */
import type { PrismaClient } from "@prisma/client";
import { strFromU8, unzipSync } from "fflate";

const SOURCE = "mydiary";
const SEPARATOR = "-".repeat(45);
const FOOTER = "Powered by MyDiary";

export type DiaryEntry = { date: string; title: string | null; body: string };

// ─── Lectura ────────────────────────────────────────────────────────────────

/** Texto de cada párrafo <w:p> del .docx. */
export function linesFromDocx(buf: Uint8Array): string[] {
  const xml = unzipSync(buf)["word/document.xml"];
  if (!xml) throw new Error("No parece un .docx de My Diary (falta word/document.xml).");
  const decode = (s: string) =>
    s
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
      .replace(/&amp;/g, "&");
  const out: string[] = [];
  for (const p of strFromU8(xml).match(/<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g) ?? []) {
    let text = "";
    for (const m of p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>/g)) {
      if (m[1] !== undefined) text += decode(m[1]);
      else text += m[0] === "<w:tab/>" ? "\t" : "\n";
    }
    out.push(text);
  }
  return out;
}

/**
 * Texto ya sacado del PDF (pypdf): el PDF corta los renglones por ancho, así
 * que se pega un renglón al siguiente si la primera palabra de ese no habría
 * entrado en el margen.
 */
export function linesFromText(text: string): string[] {
  const raw = text.split(/\r?\n/).map((l) => l.trimEnd());
  const width = Math.max(...raw.map((l) => l.length));
  const out: string[] = [];
  let joining = false;
  for (const [i, l] of raw.entries()) {
    if (joining) out[out.length - 1] += ` ${l}`;
    else out.push(l);
    const next = raw[i + 1]?.trim() ?? "";
    const nextWord = next.split(/\s+/)[0] ?? "";
    joining = l.length > 0 && next.length > 0 && l.length + 1 + nextWord.length > width - 3;
  }
  return out;
}

type PdfItem = { str: string; transform: number[]; width: number };

/**
 * PDF leído por posición: cada renglón con su altura y su borde derecho. Los
 * huecos verticales grandes son renglones vacíos (separan fecha, título y
 * cuerpo) y un renglón que llega al margen derecho sigue en el próximo.
 */
export async function linesFromPdf(buf: Uint8Array): Promise<string[]> {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(buf);
  type Line = { y: number; left: number; right: number; text: string };
  const pages: Line[][] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const rows = new Map<number, { x: number; right: number; str: string }[]>();
    for (const it of content.items as PdfItem[]) {
      if (typeof it.str !== "string" || it.str === "") continue;
      const y = Math.round(it.transform[5]);
      const x = it.transform[4];
      rows.set(y, [...(rows.get(y) ?? []), { x, right: x + it.width, str: it.str }]);
    }
    pages.push(
      [...rows]
        .sort((a, b) => b[0] - a[0])
        .map(([y, items]) => {
          items.sort((a, b) => a.x - b.x);
          // Si entre dos piezas hay aire y ninguna trae el espacio, va uno.
          let text = "";
          for (const [k, it] of items.entries()) {
            const prev = items[k - 1];
            if (prev && it.x - prev.right > 1 && !/\s$/.test(text) && !/^\s/.test(it.str)) text += " ";
            text += it.str;
          }
          return {
            y,
            left: items[0].x,
            right: Math.max(...items.map((i) => i.right)),
            text: text.replace(/\s+/g, " ").trim(),
          };
        }),
    );
  }

  // Interlineado normal: el salto más común entre renglones seguidos.
  const gaps = new Map<number, number>();
  for (const ls of pages) for (let i = 1; i < ls.length; i++) {
    const g = ls[i - 1].y - ls[i].y;
    if (g > 0) gaps.set(g, (gaps.get(g) ?? 0) + 1);
  }
  const step = [...gaps].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 14;
  const all = pages.flat();
  const maxRight = Math.max(...all.map((l) => l.right));

  const out: string[] = [];
  let joining = false;
  for (const ls of pages) {
    for (let i = 0; i < ls.length; i++) {
      const l = ls[i];
      if (i > 0 && !joining) {
        const blanks = Math.round((ls[i - 1].y - l.y) / step) - 1;
        for (let k = 0; k < blanks; k++) out.push("");
      }
      if (joining) out[out.length - 1] += ` ${l.text}`;
      else out.push(l.text);
      const next = ls[i + 1];
      if (!next || next.y < l.y - step * 1.5 || l.text === FOOTER || /^\d{4}\/\d{2}\/\d{2}$/.test(l.text) || l.text === SEPARATOR) {
        joining = false;
        continue;
      }
      // ¿La primera palabra del próximo renglón entraba en este?
      const charW = (l.right - l.left) / Math.max(1, l.text.length) || 5;
      const nextWord = next.text.split(" ")[0] ?? "";
      joining = l.right + charW * (nextWord.length + 1) > maxRight - charW;
    }
    joining = false;
  }
  return out;
}

// ─── Entradas ───────────────────────────────────────────────────────────────

export function parseEntries(lines: string[]): DiaryEntry[] {
  const entries: DiaryEntry[] = [];
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
  return entries;
}

/**
 * Carga las entradas. Con `updateExisting` (el .docx, que es fiel) reimportar
 * actualiza título y texto; desde PDF solo se agregan las que no estaban.
 * Nunca toca el ánimo ni las etiquetas puestos en la app.
 */
export async function importMyDiary(
  prisma: PrismaClient,
  entries: DiaryEntry[],
  { updateExisting }: { updateExisting: boolean },
): Promise<string> {
  if (entries.length === 0) throw new Error("No encontré entradas en el archivo.");
  const perDay = new Map<string, DiaryEntry[]>();
  for (const e of entries) perDay.set(e.date, [...(perDay.get(e.date) ?? []), e]);

  let created = 0;
  let updated = 0;
  let kept = 0;
  for (const [date, list] of perDay) {
    // El export va de nueva a vieja: el orden del día cuenta desde la más vieja.
    for (const [i, e] of [...list].reverse().entries()) {
      const externalId = `${date}#${i + 1}`;
      const createdAt = new Date(`${date}T12:00:00.000Z`);
      createdAt.setUTCMinutes(i);
      const where = { source_externalId: { source: SOURCE, externalId } };
      const exists = await prisma.journalEntry.findUnique({ where, select: { id: true } });
      if (exists && !updateExisting) {
        kept++;
        continue;
      }
      await prisma.journalEntry.upsert({
        where,
        create: { date: new Date(`${date}T00:00:00.000Z`), title: e.title, body: e.body, source: SOURCE, externalId, createdAt },
        update: { title: e.title, body: e.body },
      });
      if (exists) updated++;
      else created++;
    }
  }
  const dates = entries.map((e) => e.date).sort();
  return [
    `My Diary: ${entries.length} entradas del ${dates[0]} al ${dates.at(-1)}.`,
    `${created} nuevas`,
    updateExisting ? `${updated} actualizadas.` : `${kept} ya estaban.`,
  ].join(" ");
}
