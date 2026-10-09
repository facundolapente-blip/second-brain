/**
 * Importa el CSV que exporta la app de gastos de Facu. La lógica (y el formato)
 * está en src/lib/importers/gastos-csv.ts, la misma que usa la pantalla Datos.
 *
 *   node --env-file=.env scripts/import-gastos-csv.ts <archivo.csv> [--replace] [--sin-ajuste]
 *
 * --replace borra antes TODOS los movimientos, plantillas, programados y
 * categorías. Sin --replace se puede correr varias veces: no duplica.
 */
import { readFileSync } from "node:fs";
import { nuevoPrisma } from "../src/lib/prisma-conexion.ts";
import { importGastosCsv } from "../src/lib/importers/gastos-csv.ts";

const args = process.argv.slice(2);
const [file] = args.filter((a) => !a.startsWith("--"));
if (!file) throw new Error("Uso: node --env-file=.env scripts/import-gastos-csv.ts <archivo.csv> [--replace] [--sin-ajuste]");

const prisma = nuevoPrisma();
console.log(
  await importGastosCsv(prisma, readFileSync(file, "utf8"), {
    replace: args.includes("--replace"),
    ajustar: !args.includes("--sin-ajuste"),
  }),
);
await prisma.$disconnect();
