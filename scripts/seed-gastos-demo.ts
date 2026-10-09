/**
 * Carga cuentas y movimientos de ejemplo de Gastos en la base LOCAL, con las
 * cuentas reales de Facu (Itau, Santander, Dolares...) y montos inventados,
 * para ver la interfaz con datos.
 * Uso: node --env-file=.env scripts/seed-gastos-demo.ts
 * Se niega a correr si DATABASE_URL no apunta a localhost. Si ya hay
 * movimientos, no agrega nada: solo ajusta los saldos iniciales para que los
 * saldos de hoy coincidan con los de las capturas.
 */
import { nuevoPrisma } from "../src/lib/prisma-conexion.ts";

const url = process.env.DATABASE_URL ?? "";
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error("Solo contra la base local (DATABASE_URL en localhost).");

const prisma = nuevoPrisma();

const today = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "America/Montevideo" }) + "T00:00:00Z");
const day = (n: number) => new Date(today.getTime() - n * 86_400_000);

let seed = 11;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
const between = (a: number, b: number) => Math.round(a + rand() * (b - a));

/** Saldos que se ven en las capturas de la app de Facu (aproximados). */
const TARGET: Record<string, number> = {
  Itau: 0,
  "Banque Heritage": 0,
  Dolares: 0,
  Efectivo: 0,
  "Inversiones prex": 0,
  "Mercado Pago": 0,
  Santander: 0,
};

/** Ajusta el saldo inicial de cada cuenta para que el saldo de hoy dé el de TARGET. */
async function calibrate() {
  const accounts = await prisma.account.findMany({ where: { name: { in: Object.keys(TARGET) } } });
  for (const a of accounts) {
    const [out, inc, tin] = await Promise.all([
      prisma.transaction.aggregate({ where: { accountId: a.id, kind: { in: ["expense", "transfer"] } }, _sum: { amount: true } }),
      prisma.transaction.aggregate({ where: { accountId: a.id, kind: "income" }, _sum: { amount: true } }),
      prisma.transaction.aggregate({ where: { toAccountId: a.id, kind: "transfer" }, _sum: { toAmount: true } }),
    ]);
    const net = Number(inc._sum.amount ?? 0) + Number(tin._sum.toAmount ?? 0) - Number(out._sum.amount ?? 0);
    await prisma.account.update({ where: { id: a.id }, data: { initialBalance: (TARGET[a.name] - net).toFixed(2) } });
  }
}

if ((await prisma.transaction.count()) > 0) {
  await calibrate();
  console.log("Ya hay movimientos: solo ajusté los saldos iniciales.");
  await prisma.$disconnect();
  process.exit(0);
}

// Categorías de fábrica (las mismas que crea la app la primera vez).
const CATS = [
  { name: "Supermercado", kind: "expense", icon: "ShoppingCart", color: "green" },
  { name: "Restaurante", kind: "expense", icon: "ForkKnife", color: "orange" },
  { name: "Entretenimiento", kind: "expense", icon: "Confetti", color: "purple" },
  { name: "Casa", kind: "expense", icon: "House", color: "blue" },
  { name: "Salud y belleza", kind: "expense", icon: "Heartbeat", color: "red" },
  { name: "Transporte", kind: "expense", icon: "Bus", color: "yellow" },
  { name: "Suscripciones", kind: "expense", icon: "Repeat", color: "teal" },
  { name: "Ropa", kind: "expense", icon: "TShirt", color: "pink" },
  { name: "Otros", kind: "expense", icon: "Tag", color: "stone" },
  { name: "Sueldo", kind: "income", icon: "Briefcase", color: "green" },
  { name: "Otros ingresos", kind: "income", icon: "HandCoins", color: "teal" },
];
for (const [i, c] of CATS.entries()) {
  await prisma.category.upsert({ where: { name_kind: { name: c.name, kind: c.kind } }, create: { ...c, order: i }, update: {} });
}
const cat = Object.fromEntries((await prisma.category.findMany()).map((c) => [c.name, c.id]));

const ACCOUNTS = [
  { name: "Itau", type: "bank", currency: "UYU", initialBalance: "18000", color: "orange", icon: "Bank" },
  { name: "Santander", type: "bank", currency: "UYU", initialBalance: "9000", color: "red", icon: "Bank" },
  { name: "Dolares", type: "savings", currency: "USD", initialBalance: "3200", color: "green", icon: "PiggyBank" },
  { name: "Efectivo", type: "cash", currency: "UYU", initialBalance: "2500", color: "stone", icon: "Money" },
  { name: "Inversiones prex", type: "investment", currency: "UYU", initialBalance: "30000", color: "purple", icon: "ChartLineUp" },
  { name: "Mercado Pago", type: "bank", currency: "UYU", initialBalance: "0", color: "blue", icon: "Wallet" },
  { name: "Banque Heritage", type: "bank", currency: "UYU", initialBalance: "0", color: "teal", icon: "Bank" },
];
for (const [i, a] of ACCOUNTS.entries()) {
  if (!(await prisma.account.findFirst({ where: { name: a.name } }))) await prisma.account.create({ data: { ...a, order: i } });
}
const acc = Object.fromEntries((await prisma.account.findMany()).map((a) => [a.name, a.id]));

type Tx = {
  kind: string;
  date: Date;
  title: string | null;
  amount: string;
  accountId: string;
  categoryId?: string | null;
  toAccountId?: string;
  toAmount?: string;
};
const txs: Tx[] = [];

const GASTOS: [string, string, number, number][] = [
  ["Supermercado", "Bajon", 150, 400],
  ["Supermercado", "Coca", 70, 120],
  ["Supermercado", "Disco", 800, 2400],
  ["Restaurante", "Dominos", 300, 450],
  ["Restaurante", "Almuerzo", 400, 800],
  ["Restaurante", "Desayuno", 100, 250],
  ["Entretenimiento", "Splitwise", 500, 1800],
  ["Entretenimiento", "Vino", 250, 450],
  ["Casa", "Estante", 200, 900],
  ["Casa", "Cinta y trincheta", 200, 400],
  ["Salud y belleza", "Farmacia", 300, 900],
  ["Transporte", "Uber", 180, 420],
  ["Transporte", "STM", 50, 100],
];

for (let d = 0; d < 150; d++) {
  const n = rand() < 0.35 ? 0 : between(1, 3);
  for (let k = 0; k < n; k++) {
    const [c, title, lo, hi] = pick(GASTOS);
    txs.push({
      kind: "expense",
      date: day(d),
      title,
      amount: String(between(lo, hi)),
      accountId: pick([acc.Itau, acc.Itau, acc.Santander, acc.Efectivo, acc["Mercado Pago"]]),
      categoryId: rand() < 0.08 ? null : cat[c],
    });
  }
}

// Fijos mensuales, sueldo y transferencias (también UYU -> USD).
for (let m = 0; m < 5; m++) {
  const base = today.getUTCDate() + m * 30;
  txs.push({ kind: "income", date: day(base - 1), title: "Sueldo", amount: "62000", accountId: acc.Itau, categoryId: cat.Sueldo });
  txs.push({ kind: "expense", date: day(base - 3), title: "Alquiler", amount: "24000", accountId: acc.Itau, categoryId: cat.Casa });
  txs.push({ kind: "expense", date: day(base - 5), title: "Netflix", amount: "390", accountId: acc.Santander, categoryId: cat.Suscripciones });
  txs.push({ kind: "expense", date: day(base - 10), title: "Psiquiatra", amount: "4000", accountId: acc.Santander, categoryId: cat["Salud y belleza"] });
  txs.push({ kind: "transfer", date: day(base - 6), title: null, amount: "5000", accountId: acc["Inversiones prex"], toAccountId: acc.Itau, toAmount: "5000" });
  txs.push({ kind: "transfer", date: day(base - 8), title: null, amount: "3000", accountId: acc.Itau, toAccountId: acc.Efectivo, toAmount: "3000" });
  txs.push({ kind: "transfer", date: day(base - 12), title: "Compra de dólares", amount: "8040", accountId: acc.Itau, toAccountId: acc.Dolares, toAmount: "200" });
  if (rand() < 0.6) txs.push({ kind: "income", date: day(base - 15), title: null, amount: String(between(150, 2600)), accountId: acc.Itau, categoryId: null });
  txs.push({ kind: "income", date: day(base - 20), title: "Intereses", amount: String(between(300, 600)), accountId: acc["Inversiones prex"], categoryId: cat["Otros ingresos"] });
}
txs.push({ kind: "expense", date: day(9), title: "Pasaje", amount: "180", accountId: acc.Dolares, categoryId: cat.Transporte });

await prisma.transaction.createMany({ data: txs.filter((t) => t.date <= today) });
await prisma.txTemplate.createMany({
  data: [
    { name: "Alquiler", kind: "expense", title: "Alquiler", amount: "24000", accountId: acc.Itau, categoryId: cat.Casa, order: 1 },
    { name: "Café", kind: "expense", title: "Café", amount: "120", accountId: acc.Efectivo, categoryId: cat.Restaurante, order: 2 },
    { name: "Comprar dólares", kind: "transfer", title: "Compra de dólares", accountId: acc.Itau, toAccountId: acc.Dolares, order: 3 },
  ],
});

await calibrate();
console.log(`Listo: ${txs.length} movimientos de ejemplo.`);
await prisma.$disconnect();
