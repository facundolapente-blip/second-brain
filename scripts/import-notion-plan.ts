/**
 * Importa el "Plan Semanal" de Notion (export Markdown & CSV en .zip).
 *
 *   node --env-file=.env scripts/import-notion-plan.ts <export.zip>
 *
 * Usa los CSV "_all" (todas las filas, no solo la vista):
 *   - Daily Planning      → bloques de la semana (PlanBlock)
 *   - Para hacer OQ2      → tareas (PlanTask)
 *   - Resultados Clave    → objetivos y resultados clave
 * Se puede correr varias veces: reconoce lo ya importado por id de Notion o por
 * nombre (y día, en los bloques), así un cambio de fecha u hora no duplica. No
 * reabre lo terminado en la app, no destilda bloques, no revive lo que está en la
 * papelera ni borra lo que solo está en la app. Con --simular muestra qué haría.
 * Además vincula los bloques con el hábito del mismo nombre (Gym) y con la
 * tarea del mismo nombre (Servicio de IA).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import { PrismaClient } from "@prisma/client";

const SOURCE = "notion";
const file = process.argv[2];
if (!file) throw new Error("Uso: node --env-file=.env scripts/import-notion-plan.ts <export.zip> [--simular]");

let files = unzipSync(readFileSync(file));
// A veces Notion manda un .zip adentro del .zip.
for (const [n, d] of Object.entries(files)) if (n.endsWith(".zip")) files = { ...files, ...unzipSync(d) };
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

const DRY = process.argv.includes("--simular");
const prisma = new PrismaClient();
const report: string[] = [];
const say = (s: string) => report.push(s);
const low = (s: string) => s.trim().toLowerCase();
const isoOf = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

const blocksCsv = csvByPrefix("Daily Planning");
const tasksCsv = csvByPrefix("Para hacer");
const krCsv = csvByPrefix("Resultados Clave");

// Lo que está en la papelera de la app no se revive (por id de Notion o por nombre y fecha).
const trashed = await prisma.trashItem.findMany({ where: { kind: { in: ["task", "block", "keyResult"] } }, select: { kind: true, data: true } });
const inTrash = new Set<string>();
for (const t of trashed) {
  const row = (t.data as { row?: { externalId?: string | null; title?: string; date?: string | null; deadline?: string | null } } | null)?.row;
  if (!row) continue;
  if (row.externalId) inTrash.add(`${t.kind}:${row.externalId}`);
  if (row.title) inTrash.add(`${t.kind}:${low(row.title)}|${(row.date ?? row.deadline ?? "").slice(0, 10)}`);
}

// Categorías
const catNames = new Set([...blocksCsv.map((r) => r.Category), ...tasksCsv.map((r) => r.Categoria)].filter(Boolean));
const catId = new Map<string, string>();
let order = await prisma.planCategory.count();
for (const name of catNames) {
  const found = await prisma.planCategory.findUnique({ where: { name } });
  if (found) catId.set(name, found.id);
  else if (DRY) say(`+ categoría nueva: ${name}`);
  else catId.set(name, (await prisma.planCategory.create({ data: { name, color: COLORS[name] ?? "stone", order: order++ } })).id);
}

/** Qué cambia entre lo que hay y lo que trae Notion (para el reporte). */
function diff(before: Record<string, unknown>, after: Record<string, unknown>) {
  const norm = (v: unknown) => (v instanceof Date ? isoOf(v) : Array.isArray(v) ? v.join(",") : v === undefined ? null : v);
  return Object.keys(after).filter((k) => String(norm(before[k])) !== String(norm(after[k])));
}

// ─── Tareas ─────────────────────────────────────────────────────────────────
const STATUS: Record<string, string> = { Programadas: "backlog", "Sin empezar": "todo", "En curso": "doing", Terminado: "done" };
const allTasks = await prisma.planTask.findMany();
// Las nuevas entran arriba de todo (como las creadas en la app).
let minOrder = (await prisma.planTask.aggregate({ _min: { order: true } }))._min.order ?? 0;
const usedTasks = new Set<string>();
let tasksNew = 0;
let tasksChanged = 0;
for (const r of tasksCsv) {
  const deadline = notionDate(r.Deadline)?.date ?? null;
  const status = STATUS[r.Estado] ?? "todo";
  const externalId = stableId("task", r.Nombre, deadline, r.Categoria);
  // Misma tarea: por id de Notion, o por nombre (si en Notion le cambiaste la fecha,
  // o la creaste también en la app). Entre las del mismo nombre, primero la que
  // está igual de terminada o no.
  const sameName = allTasks.filter((t) => !usedTasks.has(t.id) && low(t.title) === low(r.Nombre));
  const existing =
    allTasks.find((t) => t.source === SOURCE && t.externalId === externalId && !usedTasks.has(t.id)) ??
    sameName.find((t) => (t.status === "done") === (status === "done")) ??
    sameName[0];
  if (!existing && (inTrash.has(`task:${externalId}`) || inTrash.has(`task:${low(r.Nombre)}|${deadline ?? ""}`))) {
    say(`· tarea en la papelera, no se revive: ${r.Nombre}`);
    continue;
  }
  const data = {
    title: r.Nombre,
    categoryId: catId.get(r.Categoria) ?? null,
    // Lo que terminaste en la app no se reabre.
    status: existing?.status === "done" && status !== "done" ? "done" : status,
    priority: fires(r.Prioridad),
    deadline: deadline ? toDb(deadline) : null,
    progress: num(r["Progreso Actual"]),
    goal: num(r.Meta),
    scheduled: r.Agendada === "Yes",
  };
  if (existing) {
    usedTasks.add(existing.id);
    const changes = diff(existing, data);
    if (!changes.length) continue;
    tasksChanged++;
    say(`~ tarea: ${r.Nombre} (${changes.join(", ")})`);
    if (!DRY) {
      await prisma.planTask.update({
        where: { id: existing.id },
        data: {
          ...data,
          completedAt: data.status === "done" && existing.status !== "done" ? new Date() : undefined,
          // Desde ahora se reconoce por el id de Notion (si no lo tiene otra).
          ...(existing.source === null || existing.externalId !== externalId
            ? allTasks.some((t) => t.source === SOURCE && t.externalId === externalId && t.id !== existing.id)
              ? {}
              : { source: SOURCE, externalId }
            : {}),
        },
      });
    }
  } else {
    tasksNew++;
    say(`+ tarea: ${r.Nombre}${deadline ? ` (deadline ${deadline})` : ""}`);
    if (!DRY) {
      const created = await prisma.planTask.create({
        data: { ...data, order: --minOrder, source: SOURCE, externalId, completedAt: status === "done" ? new Date() : null },
      });
      allTasks.push(created);
      usedTasks.add(created.id);
    }
  }
}

// ─── Bloques (vinculados a tareas por nombre; los hábitos no se tocan) ──────
const taskByName = new Map((await prisma.planTask.findMany({ select: { id: true, title: true } })).map((t) => [low(t.title), t.id]));
const parsed = blocksCsv.map((r) => ({ r, d: notionDate(r["Due date"]) }));
const dates = parsed.map((p) => p.d?.date).filter((x): x is string => !!x).sort();
const allBlocks = dates.length
  ? await prisma.planBlock.findMany({ where: { date: { gte: toDb(dates[0]), lte: toDb(dates.at(-1)!) } } })
  : [];
const usedBlocks = new Set<string>();
let blocksNew = 0;
let blocksChanged = 0;
let skipped = 0;
for (const { r, d } of parsed) {
  if (!d) {
    skipped++;
    continue;
  }
  const externalId = stableId("block", r.Name, d.date, d.start);
  // Mismo bloque: por id de Notion, o mismo nombre el mismo día (si cambiaste la
  // hora en Notion, o lo copiaste a esta semana desde la app).
  const existing =
    allBlocks.find((b) => b.source === SOURCE && b.externalId === externalId && !usedBlocks.has(b.id)) ??
    allBlocks.find((b) => !usedBlocks.has(b.id) && isoOf(b.date) === d.date && low(b.title) === low(r.Name) && b.startTime === d.start) ??
    allBlocks.find((b) => !usedBlocks.has(b.id) && isoOf(b.date) === d.date && low(b.title) === low(r.Name));
  if (!existing && (inTrash.has(`block:${externalId}`) || inTrash.has(`block:${low(r.Name)}|${d.date}`))) {
    say(`· bloque en la papelera, no se revive: ${r.Name} (${d.date})`);
    continue;
  }
  const data = {
    title: r.Name,
    categoryId: catId.get(r.Category) ?? existing?.categoryId ?? null,
    date: toDb(d.date),
    startTime: d.start,
    endTime: d.end,
    priority: fires(r.Priority),
    // Lo tildado en la app queda tildado.
    done: r.Done === "Yes" || !!existing?.done,
    place: r.Lugar || existing?.place || null,
    taskId: existing?.taskId ?? taskByName.get(low(r.Name)) ?? null,
  };
  if (existing) {
    usedBlocks.add(existing.id);
    const changes = diff(existing, data);
    if (!changes.length) continue;
    blocksChanged++;
    say(`~ bloque: ${r.Name} ${d.date}${d.start ? ` ${d.start}` : ""} (${changes.join(", ")})`);
    if (!DRY) await prisma.planBlock.update({ where: { id: existing.id }, data });
  } else {
    blocksNew++;
    say(`+ bloque: ${r.Name} ${d.date}${d.start ? ` ${d.start}${d.end ? `-${d.end}` : ""}` : ""}${data.done ? " (hecho)" : ""}`);
    if (!DRY) {
      const created = await prisma.planBlock.create({ data: { ...data, source: SOURCE, externalId } });
      allBlocks.push(created);
      usedBlocks.add(created.id);
    }
  }
}
const appOnly = allBlocks.filter((b) => !usedBlocks.has(b.id) && b.title.trim() && !/^libre$/i.test(b.title.trim()));
if (appOnly.length) say(`· en la app y no en Notion (se dejan): ${appOnly.map((b) => `${b.title} ${isoOf(b.date)}`).join(", ")}`);

// ─── Objetivos y resultados clave ───────────────────────────────────────────
const KR: Record<string, string> = { "Sin empezar": "todo", Haciendo: "doing", Completado: "done", Finalizado: "closed" };
const objectiveCol = Object.keys(krCsv[0] ?? {}).find((k) => k.startsWith("Objetivos")) ?? "Objetivos";
// Lo de Notion es el plan del año en curso.
const YEAR = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Montevideo" }).format(new Date()).slice(0, 4));
const allKrs = await prisma.planKeyResult.findMany({ where: { year: YEAR } });
const usedKrs = new Set<string>();
let krNew = 0;
let krChanged = 0;
for (const r of krCsv) {
  const objTitle = (r[objectiveCol] ?? "").replace(/\s*\(https?:\/\/[^)]*\)\s*$/, "").trim();
  let objectiveId: string | null = null;
  if (objTitle) {
    const o = await prisma.planObjective.findUnique({ where: { title_year: { title: objTitle, year: YEAR } } });
    if (o) objectiveId = o.id;
    else if (DRY) say(`+ objetivo nuevo: ${objTitle}`);
    else objectiveId = (await prisma.planObjective.create({ data: { title: objTitle, year: YEAR, order: await prisma.planObjective.count({ where: { year: YEAR } }) } })).id;
  }
  const deadline = notionDate(r.Deadline)?.date ?? null;
  const externalId = stableId("kr", r.Nombre, objTitle);
  const existing =
    allKrs.find((k) => k.source === SOURCE && k.externalId === externalId && !usedKrs.has(k.id)) ??
    allKrs.find((k) => !usedKrs.has(k.id) && low(k.title) === low(r.Nombre));
  if (!existing && inTrash.has(`keyResult:${externalId}`)) {
    say(`· resultado clave en la papelera, no se revive: ${r.Nombre}`);
    continue;
  }
  const data = {
    title: r.Nombre,
    objectiveId: objectiveId ?? existing?.objectiveId ?? null,
    kind: r["Selección"] === "Habito" ? "habit" : "activity",
    status: KR[r.Estado] ?? "todo",
    quarters: (r.Trimestre ?? "").split(",").map((q) => q.trim()).filter((q) => /^Q[1-4]$/.test(q)),
    deadline: deadline ? toDb(deadline) : null,
    progress: num(r["Progreso Actual"]),
    goal: num(r.Meta),
  };
  if (existing) {
    usedKrs.add(existing.id);
    const changes = diff(existing, data);
    if (!changes.length) continue;
    krChanged++;
    say(`~ resultado clave: ${r.Nombre} (${changes.join(", ")})`);
    if (!DRY) await prisma.planKeyResult.update({ where: { id: existing.id }, data });
  } else {
    krNew++;
    say(`+ resultado clave: ${r.Nombre}`);
    if (!DRY) await prisma.planKeyResult.create({ data: { ...data, year: YEAR, source: SOURCE, externalId } });
  }
}

console.log(report.join("\n"));
console.log(
  `\n${DRY ? "SIMULACIÓN (no se escribió nada)" : "Listo"}: tareas ${tasksNew} nuevas y ${tasksChanged} con cambios (de ${tasksCsv.length}); ` +
    `bloques ${blocksNew} nuevos y ${blocksChanged} con cambios (de ${blocksCsv.length}${skipped ? `, ${skipped} sin fecha` : ""}); ` +
    `resultados clave ${krNew} nuevos y ${krChanged} con cambios (de ${krCsv.length}).`,
);
await prisma.$disconnect();
