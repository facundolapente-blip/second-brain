/**
 * Importa el CSV que exporta la app de gastos de Facu.
 *
 *   node --env-file=.env scripts/import-gastos-csv.ts <archivo.csv> [--replace]
 *
 * Con --replace borra antes TODOS los movimientos, plantillas, programados y
 * categorías (pensado para sacar los datos de ejemplo). Sin --replace se puede
 * correr varias veces: cada movimiento lleva un id estable y no se duplica.
 *
 * Formato (separado por ";", primera fila de encabezados):
 *   Fecha de transacción;Tipo;Título;Monto;Apunte;Nombre de categoría;Nombre de categoría;Nombre de cuenta;Tags
 *   08-10-2021;1;Bigua;3360.00;;Salud y belleza;;Banque Heritage;
 * - Fecha DD-MM-AAAA. Tipo 0 = ingreso, 1 = gasto. Monto siempre positivo.
 * - "Apunte" es la nota. La primera categoría es la específica (Restaurante) y
 *   la segunda su grupo (Comida); acá se usa la específica, que es la que la app
 *   muestra. Sin categoría = sin clasificar.
 * - Los títulos pueden traer saltos de línea SIN comillas: un registro nuevo
 *   empieza solo en una línea que arranca con fecha.
 * - El export NO trae transferencias. Por eso, después de importar, el saldo
 *   inicial de cada cuenta se ajusta para que el saldo de hoy dé el que muestra
 *   la app (SALDOS_HOY). Pasá --sin-ajuste para no tocarlos.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const SOURCE = "import:gastos-app";

/** Saldos de hoy según la app (capturas del 2026-10-02). */
const SALDOS_HOY: Record<string, number> = {
  Itau: 0,
  "Banque Heritage": 0,
  Dolares: 0,
  Efectivo: 0,
  "Inversiones prex": 0,
  "Mercado Pago": 0,
  Santander: 0,
};

/** Cuentas conocidas: moneda, tipo, ícono y color. Las que no estén van en UYU. */
const CUENTAS: Record<string, { currency: string; type: string; icon: string; color: string }> = {
  Itau: { currency: "UYU", type: "bank", icon: "Bank", color: "orange" },
  Santander: { currency: "UYU", type: "bank", icon: "Bank", color: "red" },
  "Banque Heritage": { currency: "UYU", type: "bank", icon: "Bank", color: "teal" },
  Dolares: { currency: "USD", type: "savings", icon: "PiggyBank", color: "green" },
  Efectivo: { currency: "UYU", type: "cash", icon: "Money", color: "stone" },
  "Inversiones prex": { currency: "UYU", type: "investment", icon: "ChartLineUp", color: "purple" },
  "Mercado Pago": { currency: "UYU", type: "bank", icon: "Wallet", color: "blue" },
};

/** Ícono y color para las categorías de esa app. */
const CATEGORIAS: Record<string, { icon: string; color: string }> = {
  Restaurante: { icon: "ForkKnife", color: "orange" },
  Supermercado: { icon: "ShoppingCart", color: "green" },
  "Cada día": { icon: "Storefront", color: "green" },
  Comida: { icon: "Hamburger", color: "orange" },
  Entretenimiento: { icon: "Confetti", color: "purple" },
  Bar: { icon: "BeerStein", color: "purple" },
  Discoteca: { icon: "MusicNotes", color: "purple" },
  Viajes: { icon: "Airplane", color: "teal" },
  Vacaciones: { icon: "Airplane", color: "teal" },
  "Cine y teatro": { icon: "FilmSlate", color: "purple" },
  Casa: { icon: "House", color: "blue" },
  "Salud y belleza": { icon: "Heartbeat", color: "red" },
  Medicamentos: { icon: "Pill", color: "red" },
  Peluquería: { icon: "Scissors", color: "red" },
  Trabajo: { icon: "Briefcase", color: "yellow" },
  Salario: { icon: "Briefcase", color: "green" },
  Bono: { icon: "Coins", color: "green" },
  Otro: { icon: "Tag", color: "stone" },
  Automóvil: { icon: "Car", color: "yellow" },
  Combustible: { icon: "GasPump", color: "yellow" },
  "Lavado de automóvil": { icon: "Car", color: "yellow" },
  Electrónicos: { icon: "Laptop", color: "blue" },
  Teléfono: { icon: "DeviceMobile", color: "blue" },
  Computador: { icon: "Laptop", color: "blue" },
  Vestuario: { icon: "TShirt", color: "pink" },
  Pantalones: { icon: "TShirt", color: "pink" },
  Camisetas: { icon: "TShirt", color: "pink" },
  Camisas: { icon: "TShirt", color: "pink" },
  Zapatos: { icon: "ShoppingBag", color: "pink" },
};

const args = process.argv.slice(2);
const [file] = args.filter((a) => !a.startsWith("--"));
const replace = args.includes("--replace");
const ajustar = !args.includes("--sin-ajuste");
if (!file) throw new Error("Uso: node --env-file=.env scripts/import-gastos-csv.ts <archivo.csv> [--replace] [--sin-ajuste]");

// ─── Leer el CSV ────────────────────────────────────────────────────────────

const lines = readFileSync(file, "utf8").replace(/^﻿/, "").split(/\r?\n/);
if (!lines[0].startsWith("Fecha de transacción;Tipo;")) throw new Error("No parece el CSV de la app de gastos.");

const records: string[] = [];
for (const l of lines.slice(1)) {
  if (/^\d{2}-\d{2}-\d{4};/.test(l)) records.push(l);
  else if (records.length && l.length) records[records.length - 1] += "\n" + l;
}

type Row = { date: string; kind: "income" | "expense"; title: string | null; cents: number; note: string | null; category: string | null; account: string };

const rows: Row[] = records.map((r) => {
  const f = r.split(";");
  if (f.length !== 9) throw new Error(`Fila con ${f.length} columnas: ${r.slice(0, 60)}`);
  const [dd, mm, yyyy] = f[0].split("-");
  const cents = Math.round(Number(f[3]) * 100);
  if (!Number.isFinite(cents) || cents < 0) throw new Error(`Monto raro: ${f[3]}`);
  const clean = (s: string) => s.replace(/\s+/g, " ").trim() || null;
  return {
    date: `${yyyy}-${mm}-${dd}`,
    kind: f[1] === "0" ? "income" : "expense",
    title: clean(f[2]),
    cents,
    note: f[4].trim() || null,
    category: clean(f[5]),
    account: f[7].trim(),
  };
});

// ─── Cargar ─────────────────────────────────────────────────────────────────

const prisma = new PrismaClient();

if (replace) {
  await prisma.$transaction([
    prisma.transaction.deleteMany(),
    prisma.txTemplate.deleteMany(),
    prisma.scheduledTransaction.deleteMany(),
    prisma.category.deleteMany(),
  ]);
}

// Cuentas: se reusan por nombre (conservan color e ícono si ya existían).
const accountId = new Map<string, string>();
let accOrder = 0;
for (const name of Object.keys({ ...CUENTAS, ...Object.fromEntries(rows.map((r) => [r.account, 1])) })) {
  const existing = await prisma.account.findFirst({ where: { name } });
  const meta = CUENTAS[name] ?? { currency: "UYU", type: "bank", icon: "Wallet", color: "stone" };
  const acc = existing ?? (await prisma.account.create({ data: { name, ...meta, order: accOrder } }));
  accOrder++;
  accountId.set(name, acc.id);
}

// Categorías: una por nombre y tipo (la app usa "Casa" tanto para gastos como ingresos).
const categoryId = new Map<string, string>();
const catKeys = [...new Set(rows.filter((r) => r.category).map((r) => `${r.kind}|${r.category}`))];
for (const [i, key] of catKeys.entries()) {
  const [kind, name] = key.split("|");
  const meta = CATEGORIAS[name] ?? { icon: "Tag", color: "stone" };
  const c = await prisma.category.upsert({
    where: { name_kind: { name, kind } },
    create: { name, kind, ...meta, order: i },
    update: {},
  });
  categoryId.set(key, c.id);
}

// Id estable: contenido del movimiento + cuántas veces apareció antes uno idéntico.
const seen = new Map<string, number>();
const data = rows.map((r) => {
  const base = [r.date, r.kind, r.title ?? "", r.cents, r.account, r.category ?? "", r.note ?? ""].join("|");
  const n = (seen.get(base) ?? 0) + 1;
  seen.set(base, n);
  return {
    kind: r.kind,
    date: new Date(`${r.date}T00:00:00.000Z`),
    title: r.title,
    amount: (r.cents / 100).toFixed(2),
    accountId: accountId.get(r.account)!,
    categoryId: r.category ? (categoryId.get(`${r.kind}|${r.category}`) ?? null) : null,
    note: r.note,
    source: SOURCE,
    externalId: createHash("sha1").update(`${base}#${n}`).digest("hex").slice(0, 20),
  };
});
let created = 0;
for (let i = 0; i < data.length; i += 500) {
  created += (await prisma.transaction.createMany({ data: data.slice(i, i + 500), skipDuplicates: true })).count;
}

// Saldos: el export no trae transferencias, así que se calibra el saldo inicial.
if (ajustar) {
  for (const [name, target] of Object.entries(SALDOS_HOY)) {
    const id = accountId.get(name);
    if (!id) continue;
    const txs = await prisma.transaction.findMany({
      where: { OR: [{ accountId: id }, { toAccountId: id }] },
      select: { kind: true, amount: true, toAmount: true, accountId: true },
    });
    let net = 0;
    for (const t of txs) {
      const amt = Math.round(Number(t.amount) * 100);
      if (t.kind === "income") net += amt;
      else if (t.kind === "expense") net -= amt;
      else if (t.accountId === id) net -= amt;
      else net += Math.round(Number(t.toAmount ?? t.amount) * 100);
    }
    await prisma.account.update({
      where: { id },
      data: { initialBalance: ((Math.round(target * 100) - net) / 100).toFixed(2) },
    });
  }
}

const porCuenta = Object.entries(Object.groupBy(rows, (r) => r.account)).map(([k, v]) => `${k} ${v!.length}`);
console.log(
  `Gastos: ${rows.length} movimientos (${created} nuevos), ${rows.filter((r) => r.kind === "income").length} ingresos,`,
  `${rows.filter((r) => !r.category).length} sin clasificar, ${catKeys.length} categorías,`,
  `del ${rows[0]?.date} al ${rows.at(-1)?.date}. Por cuenta: ${porCuenta.join(", ")}.`,
  ajustar ? "Saldos iniciales ajustados a los de la app." : "",
);
await prisma.$disconnect();
