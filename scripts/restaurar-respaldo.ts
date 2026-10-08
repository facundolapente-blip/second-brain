/**
 * Restaura un respaldo completo (el .json.gz de Datos o de Vercel Blob) en la base
 * de DATABASE_URL. Sin --confirmar solo muestra qué haría (cuántas filas hay en el
 * respaldo y cuántas en la base).
 *
 *   node --env-file=.env scripts/restaurar-respaldo.ts <second-brain-….json.gz> [--confirmar]
 *
 * Con --confirmar BORRA todos los datos de la app (no el login) y carga los del
 * respaldo, todo en una transacción: si algo falla, la base queda como estaba.
 * Contra producción, con la conexión directa:
 *   set -a; . ./.env.production.local; set +a; DATABASE_URL="$DIRECT_URL" node scripts/restaurar-respaldo.ts <archivo> --confirmar
 */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { Prisma, PrismaClient } from "@prisma/client";

const file = process.argv.slice(2).find((a) => !a.startsWith("--"));
const confirm = process.argv.includes("--confirmar");
if (!file) {
  console.error("Uso: node --env-file=.env scripts/restaurar-respaldo.ts <archivo.json.gz> [--confirmar]");
  process.exit(1);
}

const SKIP = new Set(["AuthUser", "AuthSession", "AuthAccount", "AuthVerification", "AuthRateLimit"]);
const raw = readFileSync(file);
const json = JSON.parse((file.endsWith(".gz") ? gunzipSync(raw) : raw).toString("utf8")) as {
  app?: string;
  version?: number;
  exportado?: string;
  tablas?: Record<string, Record<string, unknown>[]>;
};
if (json.app !== "second-brain" || !json.tablas) {
  console.error("Ese archivo no es un respaldo de Second Brain.");
  process.exit(1);
}
const tablas = json.tablas;

// Orden de carga: primero las tablas a las que otras apuntan (claves foráneas).
const models = Prisma.dmmf.datamodel.models.filter((m) => !SKIP.has(m.name));
const deps = new Map(
  models.map((m) => [
    m.name,
    new Set(m.fields.filter((f) => f.relationFromFields?.length && f.type !== m.name).map((f) => f.type)),
  ]),
);
const order: string[] = [];
const visit = (name: string, path: Set<string>) => {
  if (order.includes(name) || path.has(name)) return;
  path.add(name);
  for (const d of deps.get(name) ?? []) visit(d, path);
  path.delete(name);
  order.push(name);
};
for (const m of models) visit(m.name, new Set());

// Relaciones a la misma tabla: se cargan en null y se completan después.
const selfFks = new Map(
  models.map((m) => [m.name, m.fields.filter((f) => f.relationFromFields?.length && f.type === m.name).flatMap((f) => f.relationFromFields ?? [])]),
);
const jsonFields = new Map(models.map((m) => [m.name, m.fields.filter((f) => f.type === "Json").map((f) => f.name)]));
const delegate = (p: PrismaClient | Prisma.TransactionClient, name: string) =>
  (p as unknown as Record<string, { count: () => Promise<number>; deleteMany: () => Promise<unknown>; createMany: (a: { data: unknown[] }) => Promise<unknown>; update: (a: unknown) => Promise<unknown> }>)[
    name[0].toLowerCase() + name.slice(1)
  ];

const prisma = new PrismaClient();
console.log(`Respaldo del ${json.exportado ?? "?"} (versión ${json.version ?? "?"})\n`);
console.log("Tabla".padEnd(24), "Respaldo".padStart(9), "Base hoy".padStart(9));
for (const name of order) {
  const n = tablas[name]?.length ?? 0;
  const now = await delegate(prisma, name).count();
  if (n || now) console.log(name.padEnd(24), String(n).padStart(9), String(now).padStart(9));
}
const missing = Object.keys(tablas).filter((t) => !order.includes(t));
if (missing.length) console.log(`\nEn el respaldo pero no en el esquema actual (se ignoran): ${missing.join(", ")}`);

if (!confirm) {
  console.log("\nNo se cambió nada. Para restaurar de verdad, agregá --confirmar (borra los datos actuales de la app).");
  await prisma.$disconnect();
  process.exit(0);
}

const fix = (name: string, row: Record<string, unknown>) => {
  const out = { ...row };
  for (const f of jsonFields.get(name) ?? []) if (out[f] === null) out[f] = Prisma.DbNull;
  return out;
};

await prisma.$transaction(
  async (tx) => {
    for (const name of [...order].reverse()) await delegate(tx, name).deleteMany();
    for (const name of order) {
      const rows = (tablas[name] ?? []).map((r) => fix(name, r));
      if (!rows.length) continue;
      const self = selfFks.get(name) ?? [];
      const first = self.length ? rows.map((r) => ({ ...r, ...Object.fromEntries(self.map((f) => [f, null])) })) : rows;
      for (let i = 0; i < first.length; i += 500) await delegate(tx, name).createMany({ data: first.slice(i, i + 500) });
      for (const r of self.length ? rows : []) {
        const set = Object.fromEntries(self.filter((f) => r[f] != null).map((f) => [f, r[f]]));
        if (Object.keys(set).length) await delegate(tx, name).update({ where: { id: r.id }, data: set });
      }
      console.log(`  ${name}: ${rows.length}`);
    }
  },
  { timeout: 10 * 60_000, maxWait: 60_000 },
);
console.log("\nListo: la base quedó como en el respaldo.");
await prisma.$disconnect();
