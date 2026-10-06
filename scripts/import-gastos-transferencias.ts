/**
 * Importa transferencias entre cuentas desde un archivo de texto (el CSV de la
 * app no las trae; se transcriben de su sección "Transferencias").
 *
 *   node --env-file=.env scripts/import-gastos-transferencias.ts [data/transferencias.csv]
 *
 * Formato: una por línea, `fecha;monto;desde;hacia;nota` (fecha AAAA-MM-DD,
 * monto en la moneda de la cuenta de origen). Las líneas con # se ignoran.
 * Entre cuentas de distinta moneda agregá un sexto campo con lo que llegó:
 * `2026-01-05;100;Dolares;Itau;;4200`.
 *
 * Se puede correr cada vez que se agregan líneas: no duplica (id estable por
 * contenido y orden de aparición) y al final recalibra los saldos iniciales.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { calibrarSaldos } from "../src/lib/importers/gastos-saldos.ts";

const SOURCE = "import:gastos-transferencias";
const file = process.argv[2] ?? "data/transferencias.csv";

type Row = { date: string; cents: number; from: string; to: string; note: string | null; toCents: number | null };

const rows: Row[] = [];
for (const [i, raw] of readFileSync(file, "utf8").split(/\r?\n/).entries()) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  const [date, amount, from, to, note, toAmount] = line.split(";").map((s) => s?.trim());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) throw new Error(`Línea ${i + 1}: fecha inválida`);
  const cents = Math.round(Number(amount) * 100);
  if (!(cents > 0)) throw new Error(`Línea ${i + 1}: monto inválido`);
  if (!from || !to || from === to) throw new Error(`Línea ${i + 1}: cuentas inválidas`);
  rows.push({
    date,
    cents,
    from,
    to,
    note: note || null,
    toCents: toAmount ? Math.round(Number(toAmount) * 100) : null,
  });
}

const prisma = new PrismaClient();
const accounts = new Map((await prisma.account.findMany()).map((a) => [a.name, a]));

const seen = new Map<string, number>();
let created = 0;
for (const r of rows) {
  const from = accounts.get(r.from);
  const to = accounts.get(r.to);
  if (!from || !to) throw new Error(`No existe la cuenta "${!from ? r.from : r.to}". Importá primero el CSV.`);
  if (from.currency !== to.currency && r.toCents === null) {
    throw new Error(`${r.date} ${r.from} a ${r.to}: monedas distintas, falta el monto que llegó (sexto campo).`);
  }
  const base = [r.date, r.cents, r.from, r.to].join("|");
  const n = (seen.get(base) ?? 0) + 1;
  seen.set(base, n);
  const externalId = createHash("sha1").update(`${base}#${n}`).digest("hex").slice(0, 20);
  const res = await prisma.transaction.createMany({
    data: [
      {
        kind: "transfer",
        date: new Date(`${r.date}T00:00:00.000Z`),
        amount: (r.cents / 100).toFixed(2),
        accountId: from.id,
        toAccountId: to.id,
        toAmount: ((r.toCents ?? r.cents) / 100).toFixed(2),
        note: r.note,
        source: SOURCE,
        externalId,
      },
    ],
    skipDuplicates: true,
  });
  created += res.count;
}

await calibrarSaldos(prisma);
const initial = (await prisma.account.findMany({ orderBy: { order: "asc" } }))
  .map((a) => `${a.name} ${Number(a.initialBalance).toLocaleString("es-UY")}`)
  .join(", ");
console.log(`Transferencias: ${rows.length} en el archivo (${created} nuevas). Saldos iniciales: ${initial}.`);
await prisma.$disconnect();
