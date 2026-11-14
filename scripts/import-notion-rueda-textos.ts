/**
 * Lo que Facu escribió en cada rueda de Notion (una página por fecha, "1. Salud." …) →
 * `LifeWheel.note` de la rueda de esa fecha (2026-11-14).
 *
 *   node --env-file=.env scripts/import-notion-rueda-textos.ts data/rueda-notion-textos.json [--simular]
 *
 * El JSON es `{ "AAAA-MM-DD": "texto" }` (las páginas se leyeron de su Notion; el export no
 * las traía). Pisa la nota de la rueda importada de Notion (`externalId = notion:<fecha>`).
 */
import { readFileSync } from "node:fs";
import { nuevoPrisma } from "../src/lib/prisma-conexion.ts";

const file = process.argv[2];
if (!file || file.startsWith("--")) throw new Error("Uso: node --env-file=.env scripts/import-notion-rueda-textos.ts <textos.json> [--simular]");
const DRY = process.argv.includes("--simular");
const texts = JSON.parse(readFileSync(file, "utf8")) as Record<string, string>;

const prisma = nuevoPrisma();
let done = 0;
for (const [date, text] of Object.entries(texts).sort()) {
  // La página puede tener otra fecha que la columna de puntajes (21/06/2025 contra 29/06/2025):
  // si no hay una rueda ese día, la más cercana dentro de 15 días.
  const day = new Date(`${date}T00:00:00Z`).getTime();
  const near = await prisma.lifeWheel.findMany({
    where: { date: { gte: new Date(day - 15 * 864e5), lte: new Date(day + 15 * 864e5) } },
    select: { id: true, date: true },
  });
  const w = near.sort((a, b) => Math.abs(a.date.getTime() - day) - Math.abs(b.date.getTime() - day))[0];
  const other = w && w.date.getTime() !== day ? ` · va a la rueda del ${w.date.toISOString().slice(0, 10)}` : "";
  console.log(`${date}: ${text.length} caracteres${w ? other : " · no hay rueda cerca de esa fecha, la salteo"}`);
  if (!w || DRY) continue;
  await prisma.lifeWheel.update({ where: { id: w.id }, data: { note: text.trim() } });
  done++;
}
console.log(DRY ? "(simulación: no se guardó nada)" : `Listo: ${done} ruedas con su texto.`);
await prisma.$disconnect();
