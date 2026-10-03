/**
 * Importa el "Plan Semanal" de Notion (export Markdown & CSV en .zip).
 *
 *   node --env-file=.env scripts/import-notion-plan.ts <export.zip>
 *
 * Usa los CSV "_all" (todas las filas, no solo la vista):
 *   - Daily Planning      → bloques de la semana (PlanBlock)
 *   - Para hacer OQ2      → tareas (PlanTask)
 *   - Resultados Clave    → objetivos y resultados clave
 * Se puede correr varias veces: ids estables por contenido, no duplica.
 * Además vincula los bloques con el hábito del mismo nombre (Gym) y con la
 * tarea del mismo nombre (Servicio de IA).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import { PrismaClient } from "@prisma/client";

const SOURCE = "notion";
const file = process.argv[2];
if (!file) throw new Error("Uso: node --env-file=.env scripts/import-notion-plan.ts <export.zip>");

const files = unzipSync(readFileSync(file));
function csvByPrefix(prefix: string): Record<string, string>[] {
  const name = Object.keys(files).find((n) => n.split("/").pop()!.startsWith(prefix) && n.endsWith("_all.csv"));
  if (!name) return [];
  return parseCsv(strFromU8(files[name]).replace(/^﻿/, ""));
}

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

/** "28 de septiembre de 2026 9:00 (GMT-3) → 12:00" → fecha y horas. */
function notionDate(s: string): { date: string; start: string | null; end: string | null } | null {
  const m = s.match(/(\d{1,2}) de ([a-záéíóú]+) de (\d{4})(?:\s+(\d{1,2}):(\d{2}))?/i);
  if (!m) return null;
  const month = MONTHS.indexOf(m[2].toLowerCase()) + 1;
  if (month === 0) return null;
  const date = `${m[3]}-${String(month).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const hh = (h: string, mm: string) => `${h.padStart(2, "0")}:${mm}`;
  const start = m[4] ? hh(m[4], m[5]) : null;
  const e = s.match(/→\s*(?:.*?(\d{1,2}):(\d{2}))/);
  const end = start && e ? hh(e[1], e[2]) : null;
  return { date, start, end };
}

const fires = (s: string) => (s.match(/🔥/g) ?? []).length;
const num = (s: string) => (s === "" || isNaN(Number(s)) ? null : Number(s));
const toDb = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const seen = new Map<string, number>();
const stableId = (...parts: (string | null)[]) => {
  const base = parts.join("|");
  const n = (seen.get(base) ?? 0) + 1;
  seen.set(base, n);
  return createHash("sha1").update(`${base}#${n}`).digest("hex").slice(0, 20);
};

const COLORS: Record<string, string> = {
  Trabajo: "pink", ORT: "red", Personal: "yellow", Deporte: "green", DJ: "blue",
  Producción: "purple", "Nuevos Ingresos": "teal", Casa: "orange",
};

const prisma = new PrismaClient();

const blocksCsv = csvByPrefix("Daily Planning");
const tasksCsv = csvByPrefix("Para hacer");
const krCsv = csvByPrefix("Resultados Clave");

// Categorías
const catNames = new Set([...blocksCsv.map((r) => r.Category), ...tasksCsv.map((r) => r.Categoria)].filter(Boolean));
const catId = new Map<string, string>();
let order = await prisma.planCategory.count();
for (const name of catNames) {
  const c = await prisma.planCategory.upsert({
    where: { name },
    create: { name, color: COLORS[name] ?? "stone", order: order++ },
    update: {},
  });
  catId.set(name, c.id);
}

// Tareas
const STATUS: Record<string, string> = { Programadas: "backlog", "Sin empezar": "todo", "En curso": "doing", Terminado: "done" };
let tasksNew = 0;
for (const r of tasksCsv) {
  const deadline = notionDate(r.Deadline)?.date ?? null;
  const status = STATUS[r.Estado] ?? "todo";
  const externalId = stableId("task", r.Nombre, deadline, r.Categoria);
  const exists = await prisma.planTask.findUnique({ where: { source_externalId: { source: SOURCE, externalId } } });
  const data = {
    title: r.Nombre,
    categoryId: catId.get(r.Categoria) ?? null,
    status,
    priority: fires(r.Prioridad),
    deadline: deadline ? toDb(deadline) : null,
    progress: num(r["Progreso Actual"]),
    goal: num(r.Meta),
    scheduled: r.Agendada === "Yes",
  };
  await prisma.planTask.upsert({
    where: { source_externalId: { source: SOURCE, externalId } },
    create: { ...data, source: SOURCE, externalId, completedAt: status === "done" ? new Date() : null },
    update: data,
  });
  if (!exists) tasksNew++;
}

// Bloques, vinculados a hábitos y tareas por nombre
const habits = await prisma.habit.findMany({ where: { archivedAt: null }, select: { id: true, name: true } });
const habitByName = new Map(habits.map((h) => [h.name.toLowerCase(), h.id]));
const tasks = await prisma.planTask.findMany({ select: { id: true, title: true } });
const taskByName = new Map(tasks.map((t) => [t.title.toLowerCase(), t.id]));
let blocksNew = 0;
let skipped = 0;
for (const r of blocksCsv) {
  const d = notionDate(r["Due date"]);
  if (!d) {
    skipped++;
    continue;
  }
  const externalId = stableId("block", r.Name, d.date, d.start);
  const exists = await prisma.planBlock.findUnique({ where: { source_externalId: { source: SOURCE, externalId } } });
  const data = {
    title: r.Name,
    categoryId: catId.get(r.Category) ?? null,
    date: toDb(d.date),
    startTime: d.start,
    endTime: d.end,
    priority: fires(r.Priority),
    done: r.Done === "Yes",
    place: r.Lugar || null,
    habitId: habitByName.get(r.Name.toLowerCase()) ?? null,
    taskId: taskByName.get(r.Name.toLowerCase()) ?? null,
  };
  await prisma.planBlock.upsert({
    where: { source_externalId: { source: SOURCE, externalId } },
    create: { ...data, source: SOURCE, externalId },
    update: data,
  });
  if (!exists) blocksNew++;
}

// Objetivos y resultados clave
const KR: Record<string, string> = { "Sin empezar": "todo", Haciendo: "doing", Completado: "done", Finalizado: "closed" };
const objectiveCol = Object.keys(krCsv[0] ?? {}).find((k) => k.startsWith("Objetivos")) ?? "Objetivos";
let krNew = 0;
for (const r of krCsv) {
  const objTitle = (r[objectiveCol] ?? "").replace(/\s*\(https?:\/\/[^)]*\)\s*$/, "").trim();
  let objectiveId: string | null = null;
  if (objTitle) {
    const o = await prisma.planObjective.upsert({
      where: { title: objTitle },
      create: { title: objTitle, order: await prisma.planObjective.count() },
      update: {},
    });
    objectiveId = o.id;
  }
  const deadline = notionDate(r.Deadline)?.date ?? null;
  const externalId = stableId("kr", r.Nombre, objTitle);
  const exists = await prisma.planKeyResult.findUnique({ where: { source_externalId: { source: SOURCE, externalId } } });
  const data = {
    title: r.Nombre,
    objectiveId,
    kind: r["Selección"] === "Habito" ? "habit" : "activity",
    status: KR[r.Estado] ?? "todo",
    quarters: (r.Trimestre ?? "").split(",").map((q) => q.trim()).filter((q) => /^Q[1-4]$/.test(q)),
    deadline: deadline ? toDb(deadline) : null,
    progress: num(r["Progreso Actual"]),
    goal: num(r.Meta),
  };
  await prisma.planKeyResult.upsert({
    where: { source_externalId: { source: SOURCE, externalId } },
    create: { ...data, source: SOURCE, externalId },
    update: data,
  });
  if (!exists) krNew++;
}

const linked = await prisma.planBlock.count({ where: { source: SOURCE, habitId: { not: null } } });
console.log(
  `Notion: ${tasksCsv.length} tareas (${tasksNew} nuevas), ${blocksCsv.length} bloques (${blocksNew} nuevos${skipped ? `, ${skipped} sin fecha` : ""}, ${linked} vinculados a un hábito),`,
  `${krCsv.length} resultados clave (${krNew} nuevos) en ${await prisma.planObjective.count()} objetivos, ${catNames.size} categorías.`,
);
await prisma.$disconnect();
