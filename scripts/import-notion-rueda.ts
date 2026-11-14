/**
 * Trae la Rueda de la vida de Notion a la app (2026-11-14).
 *
 *   node --env-file=.env scripts/import-notion-rueda.ts <"Sin título …_all.csv"> [--simular]
 *
 * El CSV tiene una fila por área ("1 Salud", "4 EF", "5 D Profesional"…) y una columna por
 * rueda con la fecha ("08/06/2026"); los puntajes con coma decimal ("8,5"). Cada columna es
 * una rueda (`source = "notion"`, `externalId = notion:<fecha>`): se puede volver a correr,
 * actualiza las que ya están.
 */
import { readFileSync } from "node:fs";
import { nuevoPrisma } from "../src/lib/prisma-conexion.ts";
import { normalizeScore, notionArea, notionDate } from "../src/lib/life-wheel.ts";

const file = process.argv[2];
if (!file || file.startsWith("--")) throw new Error('Uso: node --env-file=.env scripts/import-notion-rueda.ts <"…_all.csv"> [--simular]');
const DRY = process.argv.includes("--simular");

/** Un renglón de CSV con comillas ("8,5"). */
function cells(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === "," && !q) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

const lines = readFileSync(file, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
const head = cells(lines[0]);
const dates = head.slice(1).map((h) => notionDate(h));
const wheels = new Map<string, Record<string, number>>();
for (const d of dates) if (d) wheels.set(d, {});
for (const line of lines.slice(1)) {
  const row = cells(line);
  const area = notionArea(row[0]);
  if (!area) {
    console.warn(`Área que no reconozco, la salteo: ${row[0]}`);
    continue;
  }
  row.slice(1).forEach((v, i) => {
    const d = dates[i];
    const n = normalizeScore(v);
    if (d && n !== null) wheels.get(d)![area] = n;
  });
}

const prisma = nuevoPrisma();
let created = 0;
let updated = 0;
for (const [date, scores] of [...wheels].sort(([a], [b]) => a.localeCompare(b))) {
  const externalId = `notion:${date}`;
  const avg = Object.values(scores).reduce((a, b) => a + b, 0) / Object.keys(scores).length;
  console.log(`${date}: ${Object.keys(scores).length} áreas · promedio ${avg.toFixed(1)}`);
  if (DRY) continue;
  const had = await prisma.lifeWheel.findUnique({ where: { externalId } });
  await prisma.lifeWheel.upsert({
    where: { externalId },
    create: { date: new Date(`${date}T00:00:00Z`), scores, source: "notion", externalId },
    update: { date: new Date(`${date}T00:00:00Z`), scores },
  });
  if (had) updated++;
  else created++;
}
console.log(DRY ? "(simulación: no se guardó nada)" : `Listo: ${created} nuevas, ${updated} actualizadas.`);
await prisma.$disconnect();
