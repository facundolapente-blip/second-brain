/**
 * Completa los objetivos con la base "Objetivos <año>" de Notion (export CSV).
 *
 *   node --env-file=.env scripts/import-notion-objetivos.ts "<Objetivos 2026 ....csv>" [--anio=2026] [--resultados="<Resultados Clave ....csv>"] [--simular]
 *
 * Por cada fila: rol, categoría, prioridad (🔥), deadline, estado y la meta propia
 * ("Meta" / "Progreso Actual"). Reconoce el objetivo por nombre (sin el número del
 * principio, sin mayúsculas ni espacios de más); si no existe en la app, lo crea.
 * No toca el progreso que ya se cargó en la app.
 *
 * Con --resultados también trae los resultados clave de ese export (para un año que ya
 * pasó, como 2025: import-notion-plan.ts solo trabaja con el año en curso). Cada uno va a
 * su objetivo por nombre, en el mismo año, con trimestres, deadline, estado y progreso.
 * Volver a correrlo no duplica: los reconoce por un id armado con objetivo, nombre y deadline.
 */
import { readFileSync } from "node:fs";
import { nuevoPrisma } from "../src/lib/prisma-conexion.ts";

const file = process.argv[2];
if (!file || file.startsWith("--")) throw new Error('Uso: node --env-file=.env scripts/import-notion-objetivos.ts "<Objetivos.csv>" [--anio=2026] [--resultados=<Resultados.csv>] [--simular]');
const DRY = process.argv.includes("--simular");
const yearArg = process.argv.find((a) => a.startsWith("--anio="));
const krFile = process.argv.find((a) => a.startsWith("--resultados="))?.slice(13);
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
const STATUS: Record<string, string> = { "sin empezar": "todo", "en curso": "doing", haciendo: "doing", completado: "done", terminado: "done", listo: "done", hecho: "done", finalizado: "closed" };
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

// ─── Resultados clave ───────────────────────────────────────────────────────
if (krFile) {
  const krRows = parseCsv(readFileSync(krFile, "utf8").replace(/^﻿/, ""));
  const objectives = await prisma.planObjective.findMany({ where: { year } });
  const krs = await prisma.planKeyResult.findMany({ where: { year, source: "notion-objetivos" } });
  const objCol = Object.keys(krRows[0] ?? {}).find((k) => k.startsWith("Objetivos")) ?? "Objetivos";
  const names = new Set(krRows.map((r) => key(r["Nombre"] ?? "")));
  let made = 0;
  let changed = 0;
  for (const r of krRows) {
    const raw = (r["Nombre"] ?? "").trim().replace(/\s+/g, " ");
    // Notion numera las copias de un trimestre a otro ("Hacer Cardio 1 x S 2"): sin el número, el trimestre ya las distingue.
    const base = raw.replace(/\s+[2-9]$/, "");
    const title = base !== raw && names.has(key(base)) ? base : raw;
    if (!title) continue;
    const objTitle = (r[objCol] ?? "").replace(/\s*\(https?:\/\/[^)]*\)\s*$/, "").trim();
    const objective = objTitle ? objectives.find((o) => key(o.title) === key(objTitle)) : undefined;
    if (objTitle && !objective && !DRY) console.log(`  ! no encontré el objetivo "${objTitle}" de ${title}: queda suelto`);
    const deadline = notionDay(r["Deadline"] ?? "");
    const externalId = `${year}|${key(objTitle)}|${key(title)}|${deadline ?? ""}`;
    const data = {
      title,
      objectiveId: objective?.id ?? null,
      kind: /h[aá]bito/i.test(r["Selección"] ?? "") ? "habit" : "activity",
      status: STATUS[(r["Estado"] ?? "").toLowerCase()] ?? "todo",
      quarters: (r["Trimestre"] ?? "").split(",").map((q) => q.trim()).filter((q) => /^Q[1-4]$/.test(q)),
      deadline: deadline ? new Date(`${deadline}T00:00:00.000Z`) : null,
      progress: num(r["Progreso Actual"] ?? ""),
      goal: num(r["Meta"] ?? ""),
    };
    const found = krs.find((k) => k.externalId === externalId);
    console.log(`${found ? "actualiza" : "crea"} resultado clave  ${title}  ·  ${objTitle || "suelto"} · ${data.quarters.join(", ") || "sin trimestre"} · ${data.status}`);
    if (found) changed++;
    else made++;
    if (DRY) continue;
    if (found) await prisma.planKeyResult.update({ where: { id: found.id }, data });
    else await prisma.planKeyResult.create({ data: { ...data, year, source: "notion-objetivos", externalId } });
  }
  console.log(`\nResultados clave: ${made} nuevos, ${changed} actualizados (de ${krRows.length}).`);
}

if (DRY) console.log("\n(--simular: no se escribió nada)");
await prisma.$disconnect();
