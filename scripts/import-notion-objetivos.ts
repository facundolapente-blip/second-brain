/**
 * Completa los objetivos con la base "Objetivos <año>" de Notion (export CSV).
 *
 *   node --env-file=.env scripts/import-notion-objetivos.ts "<Objetivos 2026 ....csv>" [--anio=2026] [--simular]
 *
 * Por cada fila: rol, categoría, prioridad (🔥), deadline, estado y la meta propia
 * ("Meta" / "Progreso Actual"). Reconoce el objetivo por nombre (sin el número del
 * principio, sin mayúsculas ni espacios de más); si no existe en la app, lo crea.
 * No toca los resultados clave (esos los trae import-notion-plan.ts) ni el progreso
 * que ya se cargó en la app.
 */
import { readFileSync } from "node:fs";
import { nuevoPrisma } from "../src/lib/prisma-conexion.ts";

const file = process.argv[2];
if (!file || file.startsWith("--")) throw new Error('Uso: node --env-file=.env scripts/import-notion-objetivos.ts "<Objetivos.csv>" [--anio=2026] [--simular]');
const DRY = process.argv.includes("--simular");
const yearArg = process.argv.find((a) => a.startsWith("--anio="));
const year = yearArg ? Number(yearArg.slice(7)) : Number(file.match(/Objetivos (\d{4})/)?.[1] ?? new Date().getFullYear());

/** CSV con comillas (los títulos pueden tener comas o saltos de línea). */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const [head, ...body] = rows.filter((r) => r.some((x) => x.trim()));
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
function notionDay(s: string): string | null {
  const m = s.match(/(\d{1,2}) de ([a-záéíóú]+) de (\d{4})/i);
  const month = m ? MONTHS.indexOf(m[2].toLowerCase()) + 1 : 0;
  return m && month ? `${m[3]}-${String(month).padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}
const STATUS: Record<string, string> = { "sin empezar": "todo", "en curso": "doing", haciendo: "doing", completado: "done", terminado: "done", finalizado: "closed" };
const num = (s: string) => (s === "" || isNaN(Number(s)) ? null : Number(s));
const key = (s: string) => s.trim().replace(/^\d+\s+/, "").replace(/\s+/g, " ").toLowerCase();
/** "Dj/Productor" → "DJ / Productor"; el resto con la primera en mayúscula. */
const roleName = (s: string) =>
  s
    .split("/")
    .map((p) => p.trim())
    .map((p) => (/^dj$/i.test(p) ? "DJ" : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" / ");

const rows = parseCsv(readFileSync(file, "utf8").replace(/^﻿/, ""));
const prisma = nuevoPrisma();
const existing = await prisma.planObjective.findMany({ where: { year } });
let order = existing.length;
for (const r of rows) {
  const title = (r["Objetivo"] ?? "").trim().replace(/\s+/g, " ");
  if (!title) continue;
  const deadline = notionDay(r["Deadline"] ?? "");
  const goal = num(r["Meta"] ?? "");
  const data = {
    role: r["Rol"] ? roleName(r["Rol"]) : null,
    area: r["Categoria"] || null,
    priority: Math.min(4, (r["Prioridad"]?.match(/🔥/g) ?? []).length),
    deadline: deadline ? new Date(`${deadline}T00:00:00.000Z`) : null,
    status: STATUS[(r["Estado"] ?? "").toLowerCase()] ?? "doing",
    goal,
  };
  const found = existing.find((o) => key(o.title) === key(title));
  // El progreso de Notion solo entra si en la app todavía no hay.
  const progress = goal !== null && (found?.progress ?? null) === null ? (num(r["Progreso Actual"] ?? "") ?? 0) : undefined;
  console.log(`${found ? "actualiza" : "crea"}  ${title}  ·  ${data.role ?? "-"} · ${data.area ?? "-"} · prioridad ${data.priority} · ${data.status}${goal !== null ? ` · meta ${goal}` : ""}`);
  if (DRY) continue;
  if (found) await prisma.planObjective.update({ where: { id: found.id }, data: { ...data, ...(progress !== undefined ? { progress } : {}) } });
  else await prisma.planObjective.create({ data: { ...data, progress: progress ?? null, title, year, order: order++ } });
}
if (DRY) console.log("\n(--simular: no se escribió nada)");
await prisma.$disconnect();
