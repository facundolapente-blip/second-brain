/**
 * Importa un backup de HabitNow (.hn). La lógica está en src/lib/importers/habitnow.ts
 * (la misma que usa la pantalla Datos de la app).
 *
 *   node --env-file=.env scripts/import-habitnow.ts <archivo.hn> [--replace | --update]
 *
 * Sin flags se niega a correr si ya hay hábitos cargados. --replace BORRA todos
 * los hábitos, marcas y categorías antes; --update suma y actualiza sin borrar.
 */
import { readFileSync } from "node:fs";
import { nuevoPrisma } from "../src/lib/prisma-conexion.ts";
import { importHabitNow } from "../src/lib/importers/habitnow.ts";

const [file] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const replace = process.argv.includes("--replace");
const update = process.argv.includes("--update");
if (!file) throw new Error("Uso: node --env-file=.env scripts/import-habitnow.ts <archivo.hn> [--replace | --update]");
if (replace && update) throw new Error("--replace y --update no van juntos.");

const prisma = nuevoPrisma();
console.log(await importHabitNow(prisma, readFileSync(file, "utf8"), replace ? "replace" : update ? "update" : "fresh"));
await prisma.$disconnect();
