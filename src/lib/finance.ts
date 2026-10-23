import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { summarizeCard, type CardMove, type CardSummary } from "./card-logic";
import { addDays, dayOfInstant, fromDbDate, monthBounds, shiftMonth, todayISO, toDbDate } from "./dates";
import { buildClassifier, findFixedExpenses, type FixedSuggestion, normTitle } from "./smart-logic";
import {
  isFrequency,
  nextOnOrAfter,
  occurrencesBetween,
  type ScheduleDTO,
  type ScheduleFrequency,
} from "./schedule-logic";
import { convertCents, rolloverCarry, type CategoryBudgetDTO, type ForeignSpend, type ProjectDTO } from "./budget-logic";
import { ensureAdjustmentCategories } from "./importers/adjustments";
import { getRates, toUyu } from "./fx";
import {
  netPassThrough,
  passCategory,
  PASS_CATEGORY_ID,
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
  attachments: { select: { id: true, width: true, height: true }, orderBy: { createdAt: "asc" } },
  installmentGroup: true,
  installmentNo: true,
  installmentCount: true,
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
    photos: t.attachments,
    installment:
      t.installmentGroup && t.installmentNo && t.installmentCount
        ? { group: t.installmentGroup, no: t.installmentNo, count: t.installmentCount }
        : null,
  };
}

// Con desempate por id: los importados comparten la hora de creación y, sin esto, el orden
// dentro de un día cambiaba después de cada guardado.
const newestFirst = [{ date: "desc" }, { createdAt: "desc" }, { id: "desc" }] satisfies Prisma.TransactionOrderByWithRelationInput[];

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
      business: a.isBusiness,
      closingDay: a.closingDay,
      dueDay: a.dueDay,
      limitCents: a.creditLimit === null ? null : toCents(a.creditLimit),
    };
  });
}

/** Tarjetas de crédito: el último resumen, el que está en curso y las cuotas que faltan. */
export async function getCardSummaries(accounts?: AccountDTO[]): Promise<CardSummary[]> {
  const cards = (accounts ?? (await getAccounts())).filter((a) => a.type === "card" && !a.archived);
  if (!cards.length) return [];
  const ids = cards.map((c) => c.id);
  const txs = await prisma.transaction.findMany({
    where: { OR: [{ accountId: { in: ids } }, { toAccountId: { in: ids } }] },
    select: {
      date: true,
      kind: true,
      amount: true,
      toAmount: true,
      accountId: true,
      toAccountId: true,
      installmentGroup: true,
      category: { select: { isAdjustment: true } },
    },
    orderBy: { date: "asc" },
  });
  const today = todayISO();
  return cards.map((c) => {
    const moves: CardMove[] = [];
    for (const t of txs) {
      // Los ajustes de saldo corrigen la deuda pero no son compras del resumen.
      const adjustment = !!t.category?.isAdjustment;
      const date = fromDbDate(t.date);
      if (t.accountId === c.id) {
        const cents = toCents(t.amount);
        moves.push({ date, chargeCents: t.kind === "income" ? -cents : cents, paymentCents: 0, installment: !!t.installmentGroup, adjustment });
      } else if (t.toAccountId === c.id && t.toAmount !== null) {
        moves.push({ date, chargeCents: 0, paymentCents: toCents(t.toAmount), installment: false });
      }
    }
    return summarizeCard(c, moves, today);
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
    business: c.isBusiness,
    pass: c.isPassThrough,
  }));
}

/** Movimientos de un mes ("YYYY-MM"), del más nuevo al más viejo. */
export async function getMonthTransactions(month: string): Promise<TxDTO[]> {
  const { from, to } = monthBounds(month);
  return getRangeTransactions(from, to);
}

/** Movimientos entre dos días (inclusive), del más nuevo al más viejo. */
export async function getRangeTransactions(from: string, to: string): Promise<TxDTO[]> {
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
    select: {
      id: true,
      title: true,
      date: true,
      kind: true,
      accountId: true,
      categoryId: true,
      amount: true,
      category: { select: { kind: true, isBusiness: true, isPassThrough: true } },
    },
  });
  // Un ingreso con categoría de gasto es un reintegro: resta de ese gasto.
  return rows.map((r) => {
    const refund = r.kind === "income" && r.category?.kind === "expense";
    return {
      id: r.id,
      title: r.title?.trim() || null,
      date: fromDbDate(r.date),
      kind: refund || r.kind !== "income" ? "expense" : "income",
      accountId: r.accountId,
      categoryId: r.categoryId,
      cents: refund ? -toCents(r.amount) : toCents(r.amount),
      ...(r.category?.isBusiness ? { business: true } : {}),
      ...(r.category?.isPassThrough ? { pass: true } : {}),
    };
  });
}

/**
 * Filtro de Prisma: solo movimientos de cuentas personales (las de trabajo no
 * cuentan en Inicio, Presupuestos, Proyección, Análisis ni los resúmenes).
 */
export const PERSONAL = {
  account: { isBusiness: false },
  // Tampoco las categorías de trabajo (discos comprados o vendidos desde una cuenta
  // personal) ni la plata de otra persona: de esa cuenta solo la diferencia del mes,
  // que se suma aparte con `getPassFlows`. Va con NOT (no OR/AND) para combinarse con
  // `...NOT_ADJUSTMENT` y con los AND de cada consulta.
  NOT: { category: { OR: [{ isBusiness: true }, { isPassThrough: true }] } },
} satisfies Prisma.TransactionWhereInput;

/**
 * La plata de otra persona de las cuentas personales entre `from` y `to`, ya como la
 * diferencia de cada mes (`netPassThrough`), con la forma de las filas de movimientos
 * para sumarla a los gastos e ingresos (categoría `PASS_CATEGORY_ID`; `amount` en pesos
 * de la moneda de la cuenta, puede ser negativo). Lee desde el 1.° del mes de `from`:
 * la diferencia se acumula en el mes.
 */
export async function getPassFlows(from: string, to: string) {
  const [rows, cats] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        kind: { in: ["expense", "income"] },
        date: { gte: toDbDate(monthBounds(from.slice(0, 7)).from), lte: toDbDate(to) },
        account: { isBusiness: false },
        category: { isPassThrough: true },
      },
      select: { date: true, kind: true, amount: true, accountId: true, account: { select: { currency: true } } },
    }),
    prisma.category.findMany({ where: { isPassThrough: true }, select: { name: true } }),
  ]);
  const category = passCategory(cats.map((c) => ({ name: c.name, pass: true })));
  const flows = netPassThrough(
    rows.map((r) => ({
      date: fromDbDate(r.date),
      kind: r.kind === "income" ? ("income" as const) : ("expense" as const),
      cents: toCents(r.amount),
      currency: r.account.currency,
      accountId: r.accountId,
    })),
  )
    .filter((p) => p.date >= from)
    .map((p) => ({
      date: toDbDate(p.date),
      kind: p.kind,
      amount: p.cents / 100,
      accountId: p.accountId,
      categoryId: PASS_CATEGORY_ID,
      title: category.name,
      category: { kind: p.kind },
      account: { currency: p.currency },
    }));
  return { flows, category };
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
  const archived = new Set(
    (await prisma.account.findMany({ where: { archivedAt: { not: null } }, select: { id: true } })).map((a) => a.id),
  );
  for (const s of due) {
    const rule = {
      startDate: fromDbDate(s.startDate),
      frequency: (isFrequency(s.frequency) ? s.frequency : "monthly") as ScheduleFrequency,
      interval: s.interval,
      endDate: s.endDate ? fromDbDate(s.endDate) : null,
    };
    const dates = occurrencesBetween(rule, fromDbDate(s.nextDate!), today);
    // Con la cuenta archivada se saltean (la fecha sigue corriendo).
    const paused = archived.has(s.accountId) || (s.toAccountId !== null && archived.has(s.toAccountId));
    if (dates.length && !paused) {
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

/**
 * Presupuestos mensuales por categoría con lo gastado en el mes, en la moneda del
 * presupuesto: lo de otras monedas se pasa con la cotización de hoy y queda anotado
 * aparte (`foreign`, "incluye US$ 40"). Con arrastre, `amountCents` es lo disponible
 * (monto + lo que sobró de los meses anteriores desde que se activó).
 */
export async function getCategoryBudgets(month: string): Promise<{
  budgets: CategoryBudgetDTO[];
  /** Gasto del mes en pesos de las categorías sin presupuesto (null = sin clasificar). */
  unbudgeted: { categoryId: string | null; spentCents: number; foreign: ForeignSpend[] }[];
}> {
  const { from, to } = monthBounds(month);
  const [budgets, accounts, spent, rates, expenseCatRows] = await Promise.all([
    prisma.categoryBudget.findMany(),
    prisma.account.findMany({ select: { id: true, currency: true } }),
    prisma.transaction.groupBy({
      by: ["categoryId", "accountId", "kind"],
      where: { kind: { in: ["expense", "income"] }, date: { gte: toDbDate(from), lte: toDbDate(to) }, ...NOT_ADJUSTMENT, ...PERSONAL },
      _sum: { amount: true },
    }),
    getRates(),
    prisma.category.findMany({ where: { kind: "expense" }, select: { id: true } }),
  ]);
  const expenseCats = new Set(expenseCatRows.map((c) => c.id));
  const currencyOf = new Map(accounts.map((a) => [a.id, a.currency]));
  // Gasto neto por categoría y moneda (en la moneda de la cuenta); los reintegros
  // (ingresos con categoría de gasto) restan.
  const net = (rows: { categoryId: string | null; accountId: string; kind: string; cents: number }[]) => {
    const out = new Map<string | null, Map<string, number>>();
    for (const r of rows) {
      const sign = r.kind === "expense" ? 1 : r.categoryId && expenseCats.has(r.categoryId) ? -1 : 0;
      if (!sign) continue;
      const cur = currencyOf.get(r.accountId) ?? "UYU";
      const inner = out.get(r.categoryId) ?? new Map<string, number>();
      inner.set(cur, (inner.get(cur) ?? 0) + sign * r.cents);
      out.set(r.categoryId, inner);
    }
    return out;
  };
  const inCurrency = (byCur: Map<string, number> | undefined, to: string) =>
    [...(byCur ?? [])].reduce((n, [cur, cents]) => n + convertCents(cents, cur, to, rates.toUyu), 0);
  const foreignOf = (byCur: Map<string, number> | undefined, to: string): ForeignSpend[] =>
    [...(byCur ?? [])]
      .filter(([cur, cents]) => cur !== to && cents > 0)
      .map(([currency, cents]) => ({ currency, cents, equivCents: convertCents(cents, currency, to, rates.toUyu) }));

  const byCat = net(spent.map((g) => ({ ...g, cents: g._sum.amount ? toCents(g._sum.amount) : 0 })));

  // Arrastre: lo gastado mes a mes desde que se activó, hasta el mes anterior.
  const withRollover = budgets.filter((b) => b.rollover && b.rolloverSince);
  const sinceOf = (b: (typeof budgets)[number]) => (b.rolloverSince ? fromDbDate(b.rolloverSince).slice(0, 7) : null);
  const earliest = withRollover.map(sinceOf).filter((m): m is string => !!m && m < month).sort()[0];
  const perMonth = new Map<string, Map<string | null, Map<string, number>>>();
  if (earliest) {
    const past = await prisma.transaction.findMany({
      where: {
        kind: { in: ["expense", "income"] },
        categoryId: { in: withRollover.map((b) => b.categoryId) },
        date: { gte: toDbDate(monthBounds(earliest).from), lt: toDbDate(from) },
        ...NOT_ADJUSTMENT,
        ...PERSONAL,
      },
      select: { date: true, amount: true, categoryId: true, accountId: true, kind: true },
    });
    const byMonth = new Map<string, typeof past>();
    for (const t of past) {
      const m = fromDbDate(t.date).slice(0, 7);
      byMonth.set(m, [...(byMonth.get(m) ?? []), t]);
    }
    for (const [m, rows] of byMonth) perMonth.set(m, net(rows.map((t) => ({ ...t, cents: toCents(t.amount) }))));
  }

  const withBudget = new Set(budgets.map((b) => b.categoryId));
  const unbudgeted: { categoryId: string | null; spentCents: number; foreign: ForeignSpend[] }[] = [];
  for (const [cat, byCur] of byCat) {
    if (cat && withBudget.has(cat)) continue;
    const cents = inCurrency(byCur, "UYU");
    if (cents > 0) unbudgeted.push({ categoryId: cat, spentCents: cents, foreign: foreignOf(byCur, "UYU") });
  }
  return {
    budgets: budgets.map((b) => {
      const monthlyCents = toCents(b.amount);
      const carriedCents = b.rollover
        ? rolloverCarry(monthlyCents, sinceOf(b), month, (m) => Math.max(0, inCurrency(perMonth.get(m)?.get(b.categoryId), b.currency)))
        : 0;
      const byCur = byCat.get(b.categoryId);
      return {
        categoryId: b.categoryId,
        amountCents: monthlyCents + carriedCents,
        monthlyCents,
        carriedCents,
        rollover: b.rollover,
        currency: b.currency,
        spentCents: Math.max(0, inCurrency(byCur, b.currency)),
        foreign: foreignOf(byCur, b.currency),
      };
    }),
    unbudgeted: unbudgeted.sort((a, b) => b.spentCents - a.spentCents),
  };
}

type ProjectRow = Awaited<ReturnType<typeof prisma.budgetProject.findMany>>[number];

/**
 * Lo gastado en cada puntual, en la moneda del puntual: un gasto en dólares de un viaje
 * en pesos se pasa con la cotización de hoy (antes US$ 100 contaba como $ 100). Los
 * reintegros restan; los ajustes de saldo no cuentan.
 */
async function projectSpent(projects: { id: string; currency: string }[]) {
  const ids = projects.map((p) => p.id);
  const [sums, accounts, rates] = await Promise.all([
    prisma.transaction.groupBy({
      by: ["projectId", "kind", "accountId"],
      where: { projectId: { in: ids }, kind: { in: ["expense", "income"] }, ...NOT_ADJUSTMENT },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.account.findMany({ select: { id: true, currency: true } }),
    getRates(),
  ]);
  const currencyOf = new Map(accounts.map((a) => [a.id, a.currency]));
  const projectCurrency = new Map(projects.map((p) => [p.id, p.currency]));
  const spent = new Map<string, { cents: number; n: number }>();
  for (const g of sums) {
    if (!g.projectId) continue;
    const cur = spent.get(g.projectId) ?? { cents: 0, n: 0 };
    const raw = g._sum.amount ? toCents(g._sum.amount) : 0;
    const c = convertCents(raw, currencyOf.get(g.accountId) ?? "UYU", projectCurrency.get(g.projectId) ?? "UYU", rates.toUyu);
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
  const spent = await projectSpent(rows);
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
  const [spent, rates] = await Promise.all([projectSpent([row]), getRates()]);
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
  return {
    project: toProjectDTO(row, spent.get(id)),
    txs: txs.map(toTxDTO),
    candidates: candidates.map(toTxDTO),
    /** Pesos por unidad de cada moneda: para mostrar el equivalente de lo que está en otra moneda. */
    toUyu: rates.toUyu,
  };
}

// ─── Clasificación automática ───────────────────────────────────────────────

/** Clasificador armado con todo lo ya clasificado (una vez por pedido). */
export const getClassifier = cache(async () => {
  const rows = await prisma.transaction.findMany({
    where: { title: { not: null }, categoryId: { not: null }, kind: { in: ["expense", "income"] }, category: { isAdjustment: false } },
    select: { title: true, categoryId: true, kind: true },
  });
  return buildClassifier(rows.map((r) => ({ title: r.title!, categoryId: r.categoryId!, kind: r.kind })));
});

/** Sugerencias para los movimientos sin clasificar que tienen título. */
export async function getSuggestions(txs: TxDTO[]): Promise<Record<string, { categoryId: string; confidence: "alta" | "media" }>> {
  const classify = await getClassifier();
  const out: Record<string, { categoryId: string; confidence: "alta" | "media" }> = {};
  for (const t of txs) {
    if (!t.title || t.kind === "transfer") continue;
    const s = classify(t.title, t.kind);
    if (s) out[t.id] = s;
  }
  return out;
}

// ─── Deudas ─────────────────────────────────────────────────────────────────

export type DebtDTO = {
  id: string;
  person: string;
  direction: "owed_to_me" | "i_owe";
  amountCents: number;
  currency: string;
  date: string;
  note: string | null;
  settledAt: string | null;
  /** Al saldarla se cargó un movimiento (que todavía existe). */
  hasSettleTx: boolean;
};

export async function getDebts(): Promise<DebtDTO[]> {
  const rows = await prisma.debt.findMany({ orderBy: [{ settledAt: "asc" }, { date: "desc" }] });
  const txIds = rows.flatMap((d) => (d.settleTxId ? [d.settleTxId] : []));
  const alive = new Set(
    txIds.length ? (await prisma.transaction.findMany({ where: { id: { in: txIds } }, select: { id: true } })).map((t) => t.id) : [],
  );
  return rows.map((d) => ({
    id: d.id,
    person: d.person,
    direction: d.direction === "i_owe" ? "i_owe" : "owed_to_me",
    amountCents: toCents(d.amount),
    currency: d.currency,
    date: fromDbDate(d.date),
    note: d.note,
    settledAt: d.settledAt ? dayOfInstant(d.settledAt) : null,
    hasSettleTx: !!d.settleTxId && alive.has(d.settleTxId),
  }));
}

// ─── Metas de ahorro ────────────────────────────────────────────────────────

export type GoalDTO = {
  id: string;
  name: string;
  icon: string;
  color: string;
  targetCents: number;
  currency: string;
  deadline: string | null;
  accountId: string | null;
  /** Lo juntado: el saldo de la cuenta (pasado a la moneda de la meta) o lo cargado a mano. */
  savedCents: number;
  manualCents: number;
  archived: boolean;
};

export async function getGoals(): Promise<GoalDTO[]> {
  const [rows, accounts, rates] = await Promise.all([
    prisma.savingsGoal.findMany({ orderBy: [{ archivedAt: "asc" }, { createdAt: "asc" }] }),
    getAccounts(),
    getRates(),
  ]);
  const acc = new Map(accounts.map((a) => [a.id, a]));
  return rows.map((g) => {
    const a = g.accountId ? acc.get(g.accountId) : undefined;
    const fromAccount = a
      ? g.currency === a.currency
        ? a.balanceCents
        : Math.round(toUyu(a.balanceCents, a.currency, rates) / (rates.toUyu[g.currency] ?? 1))
      : null;
    return {
      id: g.id,
      name: g.name,
      icon: g.icon,
      color: g.color,
      targetCents: toCents(g.target),
      currency: g.currency,
      deadline: g.deadline ? fromDbDate(g.deadline) : null,
      accountId: g.accountId,
      savedCents: Math.max(0, fromAccount ?? toCents(g.saved)),
      manualCents: toCents(g.saved),
      archived: g.archivedAt !== null,
    };
  });
}

// ─── Patrimonio ─────────────────────────────────────────────────────────────

/**
 * Patrimonio en pesos al cierre de cada mes (los últimos `months`): saldo
 * inicial + todos los movimientos hasta ese día, con la cotización de hoy.
 * Personal y de la empresa por separado: las cuentas de trabajo (`isBusiness`)
 * van en el de la empresa; una transferencia entre una y otra sale de uno y
 * entra en el otro.
 */
export async function getNetWorthSeries(months = 12) {
  const [accounts, txs, rates] = await Promise.all([
    prisma.account.findMany({ select: { id: true, currency: true, initialBalance: true, isBusiness: true } }),
    prisma.transaction.findMany({ select: { date: true, kind: true, amount: true, toAmount: true, accountId: true, toAccountId: true } }),
    getRates(),
  ]);
  const personal = accounts.filter((a) => !a.isBusiness);
  const business = accounts.filter((a) => a.isBusiness);
  return {
    personal: netWorthOf(personal, txs, rates, months),
    business: business.length ? netWorthOf(business, txs, rates, months) : null,
  };
}

function netWorthOf(
  accounts: { id: string; currency: string; initialBalance: Prisma.Decimal }[],
  txs: { date: Date; kind: string; amount: Prisma.Decimal; toAmount: Prisma.Decimal | null; accountId: string; toAccountId: string | null }[],
  rates: Awaited<ReturnType<typeof getRates>>,
  months: number,
) {
  const today = todayISO();
  const cur = new Map(accounts.map((a) => [a.id, a.currency]));
  const ends = Array.from({ length: months }, (_, i) => {
    const m = shiftMonth(today.slice(0, 7), i - months + 1);
    const end = monthBounds(m).to;
    return { month: m, end: end > today ? today : end };
  });
  // Cambio de cada movimiento en su moneda, por fecha. Se suma por moneda y se
  // pasa a pesos el total de cada cierre (igual que Inicio), así no hay
  // diferencias de redondeo entre las dos pantallas.
  const deltas: { date: string; currency: string; cents: number }[] = [];
  // Solo lo que toca a estas cuentas (las de afuera no están en `cur`).
  for (const t of txs) {
    const d = fromDbDate(t.date);
    const amt = toCents(t.amount);
    const from = cur.get(t.accountId);
    const to = t.toAccountId ? cur.get(t.toAccountId) : undefined;
    if (t.kind === "income") {
      if (from) deltas.push({ date: d, currency: from, cents: amt });
    } else if (t.kind === "expense") {
      if (from) deltas.push({ date: d, currency: from, cents: -amt });
    } else {
      if (from) deltas.push({ date: d, currency: from, cents: -amt });
      if (to) deltas.push({ date: d, currency: to, cents: t.toAmount ? toCents(t.toAmount) : amt });
    }
  }
  deltas.sort((a, b) => a.date.localeCompare(b.date));
  const totals: Record<string, number> = {};
  for (const a of accounts) totals[a.currency] = (totals[a.currency] ?? 0) + toCents(a.initialBalance);
  let i = 0;
  return ends.map(({ month, end }) => {
    while (i < deltas.length && deltas[i].date <= end) {
      const x = deltas[i++];
      totals[x.currency] = (totals[x.currency] ?? 0) + x.cents;
    }
    return { month, cents: Object.entries(totals).reduce((n, [c, v]) => n + toUyu(v, c, rates), 0) };
  });
}

// ─── Meses de reserva ───────────────────────────────────────────────────────

export const RESERVE_GOAL_KEY = "reserva_meta";

/**
 * Cuántos meses podrías vivir sin ingresos: el saldo personal en pesos (todas las
 * cuentas personales, los dólares a la cotización de hoy) dividido por lo que se
 * gasta por mes (promedio de los últimos 3 meses completos, en pesos, sin cuentas
 * de trabajo, transferencias ni ajustes; los reintegros restan). La serie de 12
 * meses hace la misma cuenta en cada cierre (con los 3 meses que terminan ahí).
 */
export const getReserve = cache(async function getReserve() {
  const today = todayISO();
  const month = today.slice(0, 7);
  const first = shiftMonth(month, -14);
  const [series, txRows, rates, goalRow, pass] = await Promise.all([
    getNetWorthSeries(12),
    prisma.transaction.findMany({
      where: {
        kind: { in: ["expense", "income"] },
        date: { gte: toDbDate(monthBounds(first).from), lt: toDbDate(monthBounds(month).from) },
        ...PERSONAL,
        ...NOT_ADJUSTMENT,
      },
      select: { date: true, kind: true, amount: true, account: { select: { currency: true } }, category: { select: { kind: true } } },
    }),
    getRates(),
    prisma.appSetting.findUnique({ where: { key: RESERVE_GOAL_KEY } }),
    getPassFlows(monthBounds(first).from, addDays(monthBounds(month).from, -1)),
  ]);
  const rows = [...txRows, ...pass.flows];
  // Gasto por mes en pesos (un ingreso con categoría de gasto es un reintegro: resta).
  const spent: Record<string, number> = {};
  for (const r of rows) {
    const refund = r.kind === "income" && r.category?.kind === "expense";
    if (r.kind === "income" && !refund) continue;
    const m = fromDbDate(r.date).slice(0, 7);
    const c = toUyu(toCents(r.amount), r.account.currency, rates);
    spent[m] = (spent[m] ?? 0) + (refund ? -c : c);
  }
  /** Promedio de los 3 meses completos que terminan en `last` (null si no hubo gastos). */
  const avgSpend = (last: string) => {
    const ms = [0, 1, 2].map((i) => shiftMonth(last, -i));
    const total = ms.reduce((n, m) => n + Math.max(0, spent[m] ?? 0), 0);
    return total > 0 ? Math.round(total / 3) : null;
  };
  const points = series.personal.map((p) => {
    // En el mes en curso (incompleto) se usan los 3 anteriores.
    const spend = avgSpend(p.month === month ? shiftMonth(month, -1) : p.month);
    return { month: p.month, months: spend ? Math.round((p.cents / spend) * 10) / 10 : null };
  });
  const balanceCents = series.personal.at(-1)?.cents ?? 0;
  const spendCents = avgSpend(shiftMonth(month, -1));
  const goal = Number(goalRow?.value);
  return {
    balanceCents,
    spendCents,
    months: spendCents ? Math.round((balanceCents / spendCents) * 10) / 10 : null,
    /** El del cierre del mes pasado, para "sube 0,3 desde setiembre". */
    prevMonths: points.at(-2)?.months ?? null,
    goal: Number.isFinite(goal) && goal > 0 ? goal : 6,
    series: points,
  };
});

// ─── Historial ──────────────────────────────────────────────────────────────

export type HistoryFilters = {
  q?: string;
  accountId?: string;
  categoryId?: string;
  kind?: "expense" | "income" | "transfer";
  from?: string;
  to?: string;
  min?: number;
  max?: number;
  limit?: number;
};

/** Todos los movimientos, con buscador y filtros; del más nuevo al más viejo. */
export async function getHistory(f: HistoryFilters): Promise<{ txs: TxDTO[]; total: number; hasMore: boolean }> {
  const and: Prisma.TransactionWhereInput[] = [];
  if (f.accountId) and.push({ OR: [{ accountId: f.accountId }, { toAccountId: f.accountId }] });
  if (f.categoryId === "none") and.push({ categoryId: null, kind: { in: ["expense", "income"] } });
  else if (f.categoryId) and.push({ categoryId: f.categoryId });
  if (f.kind) and.push({ kind: f.kind });
  if (f.from) and.push({ date: { gte: toDbDate(f.from) } });
  if (f.to) and.push({ date: { lte: toDbDate(f.to) } });
  if (f.min) and.push({ amount: { gte: (f.min / 100).toFixed(2) } });
  if (f.max) and.push({ amount: { lte: (f.max / 100).toFixed(2) } });
  const limit = f.limit ?? 100;
  const rows = await prisma.transaction.findMany({ where: { AND: and }, orderBy: newestFirst, select: txSelect });
  // El texto se busca sin tildes ni mayúsculas, en título y nota.
  const needle = f.q ? normTitle(f.q) : "";
  const hits = needle
    ? rows.filter((r) => normTitle(`${r.title ?? ""} ${r.note ?? ""}`).includes(needle))
    : rows;
  return { txs: hits.slice(0, limit).map(toTxDTO), total: hits.length, hasMore: hits.length > limit };
}

/** Gastos que parecen fijos y todavía no son recurrentes (ni se descartaron). */
export async function getFixedSuggestions(): Promise<FixedSuggestion[]> {
  const today = todayISO();
  const from = `${shiftMonth(today.slice(0, 7), -5)}-01`;
  const [rows, schedules, ignored] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        kind: "expense",
        date: { gte: toDbDate(from), lte: toDbDate(today) },
        title: { not: null },
        installmentGroup: null,
        scheduleId: null,
        ...NOT_ADJUSTMENT,
      },
      select: { title: true, accountId: true, categoryId: true, amount: true, date: true },
    }),
    prisma.scheduledTransaction.findMany({ where: { active: true }, select: { title: true, accountId: true } }),
    prisma.appSetting.findUnique({ where: { key: FIXED_IGNORED } }),
  ]);
  const skip = new Set(schedules.filter((s) => s.title).map((s) => `${normTitle(s.title!)}|${s.accountId}`));
  try {
    for (const k of JSON.parse(ignored?.value ?? "[]") as string[]) skip.add(k);
  } catch {
    // lista rota: se ignora
  }
  return findFixedExpenses(
    rows.map((r) => ({ title: r.title!, accountId: r.accountId, categoryId: r.categoryId, cents: toCents(r.amount), date: fromDbDate(r.date) })),
    today,
    skip,
  );
}

/** AppSetting con las sugerencias de gastos fijos que se descartaron. */
export const FIXED_IGNORED = "fijos_ignorados";

/** Cotización de "Todo en pesos" en Informes (pesos por dólar), elegida a mano. */
export const REPORT_RATE = "informes_cotizacion";
export const DEFAULT_REPORT_RATE = 40.5;

/** La elegida a mano, o null si nunca se guardó una (Informes usa entonces la de hoy, como Inicio). */
export async function getReportRate(): Promise<number | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: REPORT_RATE } });
  const n = Number(row?.value);
  return Number.isFinite(n) && n > 0 ? n : null;
}
