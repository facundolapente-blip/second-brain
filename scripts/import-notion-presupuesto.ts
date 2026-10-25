/**
 * Trae la página "Presupuesto" de Notion a Gastos → Presupuestos → Gastos fijos (2026-10-25).
 *
 *   node --env-file=.env scripts/import-notion-presupuesto.ts <carpeta del export> [--simular]
 *
 * Una sola tabla, con la etiqueta de quién paga (list "mine" / "paid"):
 * - "Presupuesto del mes" → Lo pago yo (Gastos fijos / Gastos variables / Mio).
 * - "Me pagan" → Me lo pagan (Dolares o Pesos, Sacaria → "Lo sacaría", Texto → nota).
 * - El plan "Si vivo solo" venía como imagen en la página: sus rubros están transcriptos abajo.
 * Se puede volver a correr: reconoce cada renglón por lista + nombre y lo actualiza.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { nuevoPrisma } from "../src/lib/prisma-conexion.ts";
import { parseNotionMoney } from "../src/lib/budget-lines.ts";

const dir = process.argv[2];
if (!dir || dir.startsWith("--")) throw new Error("Uso: node --env-file=.env scripts/import-notion-presupuesto.ts <carpeta del export> [--simular]");
const DRY = process.argv.includes("--simular");

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

const files = readdirSync(dir);
const read = (prefix: string) => {
  const f = files.find((x) => x.startsWith(prefix) && x.endsWith(".csv"));
  if (!f) throw new Error(`No encontré "${prefix}….csv" en ${dir}`);
  return parseCsv(readFileSync(join(dir, f), "utf8").replace(/^﻿/, ""));
};

type Line = { list: string; name: string; cents: number | null; currency: string; category: string | null; variable: boolean; wouldCut: boolean; note: string | null; order: number };
const lines: Line[] = [];

for (const r of read("Presupuesto del mes")) {
  const name = (r["Gastos"] ?? "").trim();
  if (!name) continue;
  const variable = !!r["Gastos variables"];
  const m = parseNotionMoney(r["Gastos fijos"] || r["Gastos variables"] || r["Mio"] || "");
  lines.push({ list: "mine", name, cents: m?.cents ?? null, currency: m?.currency ?? "UYU", category: r["Category"] || null, variable, wouldCut: false, note: r["Comment"] || null, order: lines.length + 1 });
}
for (const r of read("Me pagan")) {
  const name = (r["Name"] ?? "").trim();
  if (!name) continue;
  const m = parseNotionMoney(r["Dolares"] || r["Pesos"] || "");
  lines.push({
    list: "paid",
    name,
    cents: m?.cents ?? null,
    currency: m?.currency ?? (r["Dolares"] ? "USD" : "UYU"),
    category: r["Category"] || null,
    variable: false,
    wouldCut: /^(yes|s[ií])$/i.test(r["Sacaria"] ?? ""),
    note: r["Texto"] || null,
    order: lines.length + 1,
  });
}
// Plan "Si vivo solo" (la imagen de la página), en pesos por mes.
const SOLO: [string, number, string | null][] = [
  ["Alquiler + gastos comunes", 31000, "Tope"],
  ["Garantía / seguro", 2500, null],
  ["UTE + OSE + internet + gas", 5850, null],
  ["Celular", 750, null],
  ["Supermercado", 14000, null],
  ["Limpieza e higiene", 2000, null],
  ["Gimnasio", 4900, null],
  ["Nafta", 2400, null],
  ["Salud", 5000, null],
  ["Ocio", 16000, null],
  ["Imprevistos", 4200, "5% del resto"],
];
SOLO.forEach(([name, pesos, note], i) => lines.push({ list: "solo", name, cents: pesos * 100, currency: "UYU", category: null, variable: false, wouldCut: false, note, order: i + 1 }));


const prisma = nuevoPrisma();
const key = (l: Line) => `notion-presupuesto|${l.list}|${l.name.toLowerCase().replace(/\s+/g, " ")}`;
let made = 0;
let changed = 0;
for (const l of lines) {
  const externalId = key(l);
  const found = await prisma.budgetLine.findUnique({ where: { externalId } });
  const money = l.cents === null ? "sin monto" : `${l.currency} ${(l.cents / 100).toLocaleString("es-UY")}`;
  console.log(`${found ? "actualiza" : "crea"}  [${l.list}] ${l.name} · ${money}${l.category ? ` · ${l.category}` : ""}${l.variable ? " · variable" : ""}${l.wouldCut ? " · lo sacaría" : ""}${l.note ? ` · ${l.note}` : ""}`);
  if (found) changed++;
  else made++;
  if (DRY) continue;
  const data = {
    list: l.list,
    name: l.name,
    amount: l.cents === null ? null : (l.cents / 100).toFixed(2),
    currency: l.currency,
    category: l.category,
    variable: l.variable,
    wouldCut: l.wouldCut,
    note: l.note,
    order: l.order,
  };
  if (found) await prisma.budgetLine.update({ where: { id: found.id }, data });
  else await prisma.budgetLine.create({ data: { ...data, source: "notion", externalId } });
}
console.log(`\n${DRY ? "SIMULACIÓN (no se escribió nada)" : "Listo"}: ${made} nuevos, ${changed} actualizados.`);
await prisma.$disconnect();
