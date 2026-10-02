import "server-only";
import { cookies } from "next/headers";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { fromDbDate, monthBounds, toDbDate, todayISO } from "./dates";
import {
  SELECTION_COOKIE,
  toCents,
  type AccountDTO,
  type CategoryDTO,
  type FlowRow,
  type Selection,
  type TemplateDTO,
  type TxDTO,
  type TxKind,
} from "./finance-logic";

/** Categorías con las que arranca la app: las que Facu usaba más algunas comunes. */
const DEFAULT_CATEGORIES: { name: string; kind: "expense" | "income"; icon: string; color: string }[] = [
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

export async function ensureCategories() {
  if ((await prisma.category.count()) > 0) return;
  await prisma.category.createMany({
    data: DEFAULT_CATEGORIES.map((c, i) => ({ ...c, order: i })),
    skipDuplicates: true,
  });
}

const txSelect = {
  id: true,
  kind: true,
  date: true,
  title: true,
  amount: true,
  accountId: true,
  categoryId: true,
  toAccountId: true,
  toAmount: true,
  note: true,
} satisfies Prisma.TransactionSelect;

type TxRow = Prisma.TransactionGetPayload<{ select: typeof txSelect }>;

function toTxDTO(t: TxRow): TxDTO {
  return {
    id: t.id,
    kind: t.kind as TxKind,
    date: fromDbDate(t.date),
    title: t.title,
    amountCents: toCents(t.amount),
    accountId: t.accountId,
    categoryId: t.categoryId,
    toAccountId: t.toAccountId,
    toAmountCents: t.toAmount === null ? null : toCents(t.toAmount),
    note: t.note,
  };
}

const newestFirst = [{ date: "desc" }, { createdAt: "desc" }] satisfies Prisma.TransactionOrderByWithRelationInput[];

/** Todas las cuentas (también archivadas) con su saldo actual. */
export async function getAccounts(): Promise<AccountDTO[]> {
  const [accounts, byKind, transfersIn] = await Promise.all([
    prisma.account.findMany({ orderBy: [{ order: "asc" }, { createdAt: "asc" }] }),
    prisma.transaction.groupBy({ by: ["accountId", "kind"], _sum: { amount: true }, _count: true }),
    prisma.transaction.groupBy({
      by: ["toAccountId"],
      where: { kind: "transfer", toAccountId: { not: null } },
      _sum: { toAmount: true },
      _count: true,
    }),
  ]);

  const balance = new Map<string, number>();
  const count = new Map<string, number>();
  const bump = (m: Map<string, number>, id: string, n: number) => m.set(id, (m.get(id) ?? 0) + n);
  for (const g of byKind) {
    const cents = g._sum.amount ? toCents(g._sum.amount) : 0;
    bump(balance, g.accountId, g.kind === "income" ? cents : -cents);
    bump(count, g.accountId, g._count);
  }
  for (const g of transfersIn) {
    if (!g.toAccountId) continue;
    bump(balance, g.toAccountId, g._sum.toAmount ? toCents(g._sum.toAmount) : 0);
    bump(count, g.toAccountId, g._count);
  }

  return accounts.map((a) => {
    const initialCents = toCents(a.initialBalance);
    return {
      id: a.id,
      name: a.name,
      type: a.type,
      currency: a.currency,
      icon: a.icon,
      color: a.color,
      initialCents,
      balanceCents: initialCents + (balance.get(a.id) ?? 0),
      order: a.order,
      archived: a.archivedAt !== null,
      txCount: count.get(a.id) ?? 0,
    };
  });
}

/** Categorías activas (crea las de fábrica la primera vez), con cuántos movimientos tienen. */
export async function getCategories(): Promise<CategoryDTO[]> {
  await ensureCategories();
  const cats = await prisma.category.findMany({
    where: { archivedAt: null },
    orderBy: [{ order: "asc" }, { name: "asc" }],
    include: { _count: { select: { transactions: true } } },
  });
  return cats.map((c) => ({
    id: c.id,
    name: c.name,
    kind: c.kind === "income" ? "income" : "expense",
    icon: c.icon,
    color: c.color,
    order: c.order,
    txCount: c._count.transactions,
  }));
}

/** Movimientos de un mes ("YYYY-MM"), del más nuevo al más viejo. */
export async function getMonthTransactions(month: string): Promise<TxDTO[]> {
  const { from, to } = monthBounds(month);
  const rows = await prisma.transaction.findMany({
    where: { date: { gte: toDbDate(from), lte: toDbDate(to) } },
    orderBy: newestFirst,
    select: txSelect,
  });
  return rows.map(toTxDTO);
}

/** Gastos e ingresos sin categoría ("Sin clasificar"), de todos los meses. */
export async function getUncategorized(): Promise<TxDTO[]> {
  const rows = await prisma.transaction.findMany({
    where: { categoryId: null, kind: { in: ["expense", "income"] } },
    orderBy: newestFirst,
    select: txSelect,
  });
  return rows.map(toTxDTO);
}

export async function countUncategorized(): Promise<number> {
  return prisma.transaction.count({ where: { categoryId: null, kind: { in: ["expense", "income"] } } });
}

export async function getTemplates(): Promise<TemplateDTO[]> {
  const rows = await prisma.txTemplate.findMany({ orderBy: [{ order: "asc" }, { createdAt: "asc" }] });
  return rows.map((t) => ({
    id: t.id,
    name: t.name,
    kind: t.kind as TxKind,
    title: t.title,
    amountCents: t.amount === null ? null : toCents(t.amount),
    accountId: t.accountId,
    categoryId: t.categoryId,
    toAccountId: t.toAccountId,
    toAmountCents: t.toAmount === null ? null : toCents(t.toAmount),
    note: t.note,
  }));
}

/**
 * Gastos e ingresos (sin transferencias) entre dos meses inclusive, en forma
 * de filas planas: la base de los informes y del futuro análisis.
 */
export async function getFlowRows(fromMonth: string, toMonth: string): Promise<FlowRow[]> {
  const rows = await prisma.transaction.findMany({
    where: {
      kind: { in: ["expense", "income"] },
      date: { gte: toDbDate(monthBounds(fromMonth).from), lte: toDbDate(monthBounds(toMonth).to) },
    },
    select: { date: true, kind: true, accountId: true, categoryId: true, amount: true },
  });
  return rows.map((r) => ({
    date: fromDbDate(r.date),
    kind: r.kind === "income" ? "income" : "expense",
    accountId: r.accountId,
    categoryId: r.categoryId,
    cents: toCents(r.amount),
  }));
}

/** Cuentas elegidas en el selector, leídas de la cookie. */
export async function getSelection(): Promise<Selection> {
  const raw = (await cookies()).get(SELECTION_COOKIE)?.value;
  if (!raw) return null;
  const ids = decodeURIComponent(raw).split(",").filter(Boolean);
  return ids.length ? ids : null;
}

/** "YYYY-MM" válido o el mes actual. */
export function parseMonth(raw: unknown): string {
  if (typeof raw === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) return raw;
  return todayISO().slice(0, 7);
}
