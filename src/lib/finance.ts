import "server-only";
import { cookies } from "next/headers";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { addDays, fromDbDate, monthBounds, toDbDate, todayISO } from "./dates";
import {
  isFrequency,
  nextOnOrAfter,
  occurrencesBetween,
  type ScheduleDTO,
  type ScheduleFrequency,
} from "./schedule-logic";
import type { CategoryBudgetDTO, ProjectDTO } from "./budget-logic";
import { ensureAdjustmentCategories } from "./importers/adjustments";
import { getRates, toUyu } from "./fx";
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
  projectId: true,
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
    projectId: t.projectId,
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
  if ((await prisma.category.count({ where: { isAdjustment: true } })) < 2) await ensureAdjustmentCategories(prisma);
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
    adjustment: c.isAdjustment,
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
      ...NOT_ADJUSTMENT,
    },
    select: { date: true, kind: true, accountId: true, categoryId: true, amount: true, category: { select: { kind: true } } },
  });
  // Un ingreso con categoría de gasto es un reintegro: resta de ese gasto.
  return rows.map((r) => {
    const refund = r.kind === "income" && r.category?.kind === "expense";
    return {
      date: fromDbDate(r.date),
      kind: refund || r.kind !== "income" ? "expense" : "income",
      accountId: r.accountId,
      categoryId: r.categoryId,
      cents: refund ? -toCents(r.amount) : toCents(r.amount),
    };
  });
}

/** Filtro de Prisma: deja afuera los "Ajuste de saldo" (no son gasto ni ingreso). */
export const NOT_ADJUSTMENT = {
  OR: [{ categoryId: null }, { category: { isAdjustment: false } }],
} satisfies Prisma.TransactionWhereInput;

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

// ─── Recurrentes ────────────────────────────────────────────────────────────

/**
 * Carga los movimientos recurrentes que ya tocaban (hasta hoy) y adelanta la
 * próxima fecha. Se llama al abrir Gastos o Inicio: no hace falta un cron. Cada
 * movimiento generado lleva un id estable (programa + día), así que dos
 * pedidos a la vez no lo duplican.
 */
export async function runSchedules() {
  const today = todayISO();
  const due = await prisma.scheduledTransaction.findMany({
    where: { active: true, autoConfirm: true, nextDate: { lte: toDbDate(today) } },
  });
  for (const s of due) {
    const rule = {
      startDate: fromDbDate(s.startDate),
      frequency: (isFrequency(s.frequency) ? s.frequency : "monthly") as ScheduleFrequency,
      interval: s.interval,
      endDate: s.endDate ? fromDbDate(s.endDate) : null,
    };
    const dates = occurrencesBetween(rule, fromDbDate(s.nextDate!), today);
    if (dates.length) {
      await prisma.transaction.createMany({
        data: dates.map((d) => ({
          kind: s.kind,
          date: toDbDate(d),
          title: s.title,
          amount: s.amount,
          accountId: s.accountId,
          categoryId: s.categoryId,
          toAccountId: s.toAccountId,
          toAmount: s.toAmount,
          note: s.note,
          scheduleId: s.id,
          source: "schedule",
          externalId: `${s.id}#${d}`,
        })),
        skipDuplicates: true,
      });
    }
    const next = nextOnOrAfter(rule, addDays(today, 1));
    await prisma.scheduledTransaction.update({
      where: { id: s.id },
      data: { nextDate: next ? toDbDate(next) : null },
    });
  }
}

export async function getSchedules(): Promise<ScheduleDTO[]> {
  const rows = await prisma.scheduledTransaction.findMany({
    include: { _count: { select: { transactions: true } } },
    orderBy: [{ active: "desc" }, { nextDate: "asc" }, { createdAt: "asc" }],
  });
  return rows.map((s) => ({
    id: s.id,
    kind: s.kind === "income" ? "income" : s.kind === "transfer" ? "transfer" : "expense",
    title: s.title,
    amountCents: toCents(s.amount),
    accountId: s.accountId,
    categoryId: s.categoryId,
    toAccountId: s.toAccountId,
    toAmountCents: s.toAmount === null ? null : toCents(s.toAmount),
    note: s.note,
    frequency: isFrequency(s.frequency) ? s.frequency : "monthly",
    interval: s.interval,
    startDate: fromDbDate(s.startDate),
    nextDate: s.nextDate ? fromDbDate(s.nextDate) : null,
    endDate: s.endDate ? fromDbDate(s.endDate) : null,
    active: s.active,
    generated: s._count.transactions,
  }));
}

// ─── Presupuestos ───────────────────────────────────────────────────────────

/** Presupuestos mensuales por categoría con lo gastado en el mes (en su moneda). */
export async function getCategoryBudgets(month: string): Promise<{
  budgets: CategoryBudgetDTO[];
  /** Gasto del mes en pesos de las categorías sin presupuesto (null = sin clasificar). */
  unbudgeted: { categoryId: string | null; spentCents: number }[];
}> {
  const { from, to } = monthBounds(month);
  const [budgets, accounts, spent, rates] = await Promise.all([
    prisma.categoryBudget.findMany(),
    prisma.account.findMany({ select: { id: true, currency: true } }),
    prisma.transaction.groupBy({
      by: ["categoryId", "accountId", "kind"],
      where: { kind: { in: ["expense", "income"] }, date: { gte: toDbDate(from), lte: toDbDate(to) }, ...NOT_ADJUSTMENT },
      _sum: { amount: true },
    }),
    getRates(),
  ]);
  const expenseCats = new Set(
    (await prisma.category.findMany({ where: { kind: "expense" }, select: { id: true } })).map((c) => c.id),
  );
  const currencyOf = new Map(accounts.map((a) => [a.id, a.currency]));
  // Gasto por categoría en pesos (los dólares, con la cotización del día);
  // los reintegros (ingresos con categoría de gasto) restan.
  const byCat = new Map<string | null, number>();
  for (const g of spent) {
    const cents = g._sum.amount ? toUyu(toCents(g._sum.amount), currencyOf.get(g.accountId) ?? "UYU", rates) : 0;
    if (g.kind === "expense") byCat.set(g.categoryId, (byCat.get(g.categoryId) ?? 0) + cents);
    else if (g.categoryId && expenseCats.has(g.categoryId)) byCat.set(g.categoryId, (byCat.get(g.categoryId) ?? 0) - cents);
  }
  const withBudget = new Set(budgets.map((b) => b.categoryId));
  const unbudgeted = new Map<string | null, number>();
  for (const [cat, cents] of byCat) {
    if (cat && withBudget.has(cat)) continue;
    if (cents > 0) unbudgeted.set(cat, cents);
  }
  const fromUyu = (cents: number, cur: string) => (cur === "UYU" ? cents : Math.round(cents / (rates.toUyu[cur] ?? 1)));
  return {
    budgets: budgets.map((b) => ({
      categoryId: b.categoryId,
      amountCents: toCents(b.amount),
      currency: b.currency,
      spentCents: Math.max(0, fromUyu(byCat.get(b.categoryId) ?? 0, b.currency)),
    })),
    unbudgeted: [...unbudgeted].map(([categoryId, spentCents]) => ({ categoryId, spentCents })).sort((a, b) => b.spentCents - a.spentCents),
  };
}

type ProjectRow = Awaited<ReturnType<typeof prisma.budgetProject.findMany>>[number];

async function projectSpent(ids: string[]) {
  const sums = await prisma.transaction.groupBy({
    by: ["projectId", "kind"],
    where: { projectId: { in: ids }, kind: { in: ["expense", "income"] } },
    _sum: { amount: true },
    _count: true,
  });
  const spent = new Map<string, { cents: number; n: number }>();
  for (const g of sums) {
    if (!g.projectId) continue;
    const cur = spent.get(g.projectId) ?? { cents: 0, n: 0 };
    const c = g._sum.amount ? toCents(g._sum.amount) : 0;
    cur.cents += g.kind === "expense" ? c : -c;
    cur.n += g._count;
    spent.set(g.projectId, cur);
  }
  return spent;
}

function toProjectDTO(p: ProjectRow, s?: { cents: number; n: number }): ProjectDTO {
  return {
    id: p.id,
    name: p.name,
    icon: p.icon,
    color: p.color,
    amountCents: toCents(p.amount),
    currency: p.currency,
    startDate: p.startDate ? fromDbDate(p.startDate) : null,
    endDate: p.endDate ? fromDbDate(p.endDate) : null,
    note: p.note,
    archived: p.archivedAt !== null,
    spentCents: s?.cents ?? 0,
    txCount: s?.n ?? 0,
  };
}

/** Presupuestos puntuales (viajes, vacaciones), los activos primero. */
export async function getProjects(): Promise<ProjectDTO[]> {
  const rows = await prisma.budgetProject.findMany({ orderBy: [{ archivedAt: "asc" }, { createdAt: "desc" }] });
  const spent = await projectSpent(rows.map((r) => r.id));
  return rows.map((r) => toProjectDTO(r, spent.get(r.id))).sort((a, b) => Number(a.archived) - Number(b.archived));
}

/** Para el formulario de movimientos: todos los puntuales (los archivados solo se muestran si el gasto ya es de uno). */
export async function getProjectOptions(): Promise<{ id: string; name: string; archived: boolean }[]> {
  const rows = await prisma.budgetProject.findMany({
    select: { id: true, name: true, archivedAt: true },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, archived: r.archivedAt !== null }));
}

/**
 * Un presupuesto puntual con sus movimientos y los que se le podrían sumar:
 * gastos de sus fechas (o de los últimos 60 días si no tiene) sin asignar.
 */
export async function getProject(id: string) {
  const row = await prisma.budgetProject.findUnique({ where: { id } });
  if (!row) return null;
  const spent = await projectSpent([id]);
  const from = row.startDate ? fromDbDate(row.startDate) : addDays(todayISO(), -60);
  const to = row.endDate ? fromDbDate(row.endDate) : todayISO();
  const [txs, candidates] = await Promise.all([
    prisma.transaction.findMany({ where: { projectId: id }, orderBy: newestFirst, select: txSelect }),
    prisma.transaction.findMany({
      where: { projectId: null, kind: "expense", date: { gte: toDbDate(addDays(from, -7)), lte: toDbDate(addDays(to, 7)) } },
      orderBy: newestFirst,
      select: txSelect,
      take: 200,
    }),
  ]);
  return { project: toProjectDTO(row, spent.get(id)), txs: txs.map(toTxDTO), candidates: candidates.map(toTxDTO) };
}
