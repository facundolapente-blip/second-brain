/**
 * Busca la foto (y el título, si falta) de las notas con link que no tienen miniatura:
 * la imagen de la página (og:image, twitter:image o la del producto). Sirve para lo
 * importado del chat de WhatsApp, que entró sin fotos.
 *
 *   node --env-file=.env scripts/notas-miniaturas.ts [--simular]
 *
 * No pisa nada: solo completa lo que está vacío. Se puede volver a correr (las que no
 * tienen foto en su página se vuelven a probar).
 */
import { nuevoPrisma } from "../src/lib/prisma-conexion.ts";
import { fetchLinkMeta } from "../src/lib/link-meta.ts";
import { youtubeId, youtubeThumb } from "../src/lib/notes-logic.ts";

const DRY = process.argv.includes("--simular");
const PARALLEL = 5;

const prisma = nuevoPrisma();
const notes = await prisma.note.findMany({
  where: { url: { not: null }, thumbnail: null },
  select: { id: true, url: true, title: true, section: true },
  orderBy: { createdAt: "desc" },
});
console.log(`${notes.length} notas con link y sin foto${DRY ? " (--simular: no se escribe nada)" : ""}\n`);

let found = 0;
let titles = 0;
type Row = (typeof notes)[number];
const missed: Row[] = [];

async function one(n: Row, timeoutMs: number, last: boolean) {
  const yt = youtubeId(n.url!);
  const meta = yt ? { title: null, thumbnail: youtubeThumb(yt) } : await fetchLinkMeta(n.url!, timeoutMs);
  const data: { thumbnail?: string; title?: string } = {};
  if (meta.thumbnail) data.thumbnail = meta.thumbnail;
  // Títulos solo fuera de Videos (los de Instagram y TikTok son "Reel de …").
  if (!n.title && meta.title && n.section !== "videos") data.title = meta.title;
  if (!data.thumbnail && !last) {
    missed.push(n);
    return;
  }
  if (data.thumbnail) found++;
  if (data.title) titles++;
  console.log(`${data.thumbnail ? "foto" : "  — "} ${n.section.padEnd(8)} ${(data.title ?? n.title ?? n.url!).slice(0, 70)}`);
  if (!DRY && Object.keys(data).length) await prisma.note.update({ where: { id: n.id }, data });
}

// Primero de a 5; lo que no salió, de a uno y con más paciencia (hay tiendas que no
// contestan varios pedidos juntos).
let i = 0;
await Promise.all(
  Array.from({ length: PARALLEL }, async () => {
    while (i < notes.length) await one(notes[i++], 8000, false);
  }),
);
if (missed.length) console.log(`\nSegunda pasada, de a uno: ${missed.length}\n`);
for (const n of missed) {
  await one(n, 15000, true);
  await new Promise((ok) => setTimeout(ok, 2500));
}

console.log(`\nCon foto: ${found} de ${notes.length} · títulos nuevos: ${titles}`);
await prisma.$disconnect();
