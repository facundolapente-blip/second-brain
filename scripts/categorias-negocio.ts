/**
 * Categorías del negocio (pedido de Facu, 2026-11-19): las que usan las cuentas de trabajo.
 * Se puede correr varias veces: solo crea lo que falta. Las viejas "Negocio" pasan a
 * "Otros del negocio" (gasto) y "Venta de discos" (ingreso): solo cambia el nombre, los
 * movimientos y los saldos quedan igual.
 *
 *   node --env-file=.env scripts/categorias-negocio.ts [--simular]
 */
import { nuevoPrisma } from "../src/lib/prisma-conexion.ts";

const simular = process.argv.includes("--simular");
const prisma = nuevoPrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL);

const WANTED = [
  { kind: "expense", name: "Mercadería", icon: "VinylRecord", color: "teal" },
  { kind: "expense", name: "Publicidad", icon: "Megaphone", color: "pink" },
  { kind: "expense", name: "Web y herramientas", icon: "Globe", color: "blue" },
  { kind: "expense", name: "Comisiones", icon: "Percent", color: "orange" },
  { kind: "expense", name: "Envíos y empaque", icon: "Package", color: "brown" },
  { kind: "expense", name: "Otros del negocio", icon: "Briefcase", color: "stone" },
  { kind: "income", name: "Venta de discos", icon: "VinylRecord", color: "teal" },
  { kind: "income", name: "Otros ingresos del negocio", icon: "Briefcase", color: "stone" },
];
const RENAME: Record<string, string> = { expense: "Otros del negocio", income: "Venta de discos" };

const before = await prisma.transaction.count();
const last = await prisma.category.aggregate({ _max: { order: true } });
let order = (last._max.order ?? 0) + 1;

for (const kind of ["expense", "income"]) {
  const old = await prisma.category.findUnique({ where: { name_kind: { name: "Negocio", kind } } });
  const target = RENAME[kind];
  const exists = await prisma.category.findUnique({ where: { name_kind: { name: target, kind } } });
  if (old && !exists) {
    console.log(`Renombrar "Negocio" (${kind}) → "${target}"`);
    if (!simular) await prisma.category.update({ where: { id: old.id }, data: { name: target, isBusiness: true } });
  }
}
for (const w of WANTED) {
  const exists = await prisma.category.findUnique({ where: { name_kind: { name: w.name, kind: w.kind } } });
  if (exists) {
    if (!exists.isBusiness) console.log(`Ojo: "${w.name}" (${w.kind}) ya existe y no es del negocio; no la toco.`);
    else if (simular) console.log(`Ya está: ${w.name} (${w.kind})`);
    continue;
  }
  console.log(`Crear ${w.name} (${w.kind})`);
  if (!simular) await prisma.category.create({ data: { ...w, isBusiness: true, order: order++ } });
}
const after = await prisma.transaction.count();
console.log(simular ? "Simulado, no se cambió nada." : "Listo.", `Movimientos: ${before} → ${after}`);
await prisma.$disconnect();
