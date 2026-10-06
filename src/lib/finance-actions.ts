"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "./prisma";
import { exigirSesion } from "./session";
import { addDays, fromDbDate, isISODate, todayISO, toDbDate } from "./dates";
import { isFrequency, nextOnOrAfter } from "./schedule-logic";
import { ensureAdjustmentCategories } from "./importers/adjustments";
import { calibrarSaldos } from "./importers/gastos-saldos";
import { isPaletteKey } from "./palette";
import { ACCOUNT_TYPES, CURRENCIES } from "./format";
import { ACCOUNT_TYPE_ICON, centsToDecimalString, parseAmount, TX_KINDS, type TxKind } from "./finance-logic";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

function refrescar() {
  revalidatePath("/gastos", "layout");
  revalidatePath("/");
}

function texto(fd: FormData, key: string, max = 200): string {
  return String(fd.get(key) ?? "").trim().slice(0, max);
}

// ─── Movimientos ────────────────────────────────────────────────────────────

async function validProject(id: string): Promise<string | null> {
  if (!id) return null;
  const p = await prisma.budgetProject.findUnique({ where: { id }, select: { id: true } });
  return p?.id ?? null;
}

/** Crea o edita un gasto, ingreso o transferencia. Opcionalmente lo guarda como plantilla. */
export async function saveTransaction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await exigirSesion();
  const id = texto(fd, "id", 40) || null;
  const kind = texto(fd, "kind") as TxKind;
  if (!TX_KINDS.includes(kind)) return { ok: false, error: "Tipo de movimiento inválido." };

  const amount = parseAmount(texto(fd, "amount", 30));
  if (amount === null) return { ok: false, error: "Escribí un monto mayor a cero." };

  const dateRaw = texto(fd, "date", 10);
  const date = isISODate(dateRaw) ? dateRaw : todayISO();
  const accountId = texto(fd, "accountId", 40);
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) return { ok: false, error: "Elegí una cuenta." };

  const previous = id ? await prisma.transaction.findUnique({ where: { id } }) : null;
  if (id && !previous) return { ok: false, error: "Ese movimiento ya no existe." };
  // Una cuenta archivada no recibe movimientos nuevos (sí se pueden editar los viejos).
  if (account.archivedAt && previous?.accountId !== account.id) {
    return { ok: false, error: `"${account.name}" está archivada.` };
  }

  let categoryId: string | null = null;
  let toAccountId: string | null = null;
  let toAmount: number | null = null;

  if (kind === "transfer") {
    toAccountId = texto(fd, "toAccountId", 40) || null;
    const to = toAccountId ? await prisma.account.findUnique({ where: { id: toAccountId } }) : null;
    if (!to) return { ok: false, error: "Elegí la cuenta de destino." };
    if (to.id === account.id) return { ok: false, error: "La cuenta de origen y la de destino son la misma." };
    if (to.archivedAt && previous?.toAccountId !== to.id) return { ok: false, error: `"${to.name}" está archivada.` };
    if (to.currency === account.currency) {
      toAmount = amount;
    } else {
      toAmount = parseAmount(texto(fd, "toAmount", 30));
      if (toAmount === null) return { ok: false, error: `Escribí cuánto llega a "${to.name}" (en ${to.currency}).` };
    }
  } else {
    categoryId = texto(fd, "categoryId", 40) || null;
    if (categoryId) {
      const cat = await prisma.category.findUnique({ where: { id: categoryId } });
      // Un ingreso puede llevar una categoría de gasto: es un reintegro.
      const refund = kind === "income" && cat?.kind === "expense" && !cat.isAdjustment;
      if (!cat || (cat.kind !== kind && !refund)) categoryId = null;
    }
  }

  const data = {
    kind,
    date: toDbDate(date),
    title: texto(fd, "title", 120) || null,
    amount: centsToDecimalString(amount),
    accountId: account.id,
    categoryId,
    toAccountId,
    toAmount: toAmount === null ? null : centsToDecimalString(toAmount),
    note: texto(fd, "note", 2000) || null,
    projectId: kind === "transfer" ? null : await validProject(texto(fd, "projectId", 40)),
  };

  const saved = id
    ? await prisma.transaction.update({ where: { id }, data })
    : await prisma.transaction.create({ data });

  if (fd.get("saveTemplate") === "on") {
    const last = await prisma.txTemplate.aggregate({ _max: { order: true } });
    const cat = categoryId ? await prisma.category.findUnique({ where: { id: categoryId } }) : null;
    await prisma.txTemplate.create({
      data: {
        name: data.title || cat?.name || (kind === "transfer" ? "Transferencia" : "Plantilla"),
        kind,
        title: data.title,
        amount: data.amount,
        accountId: data.accountId,
        categoryId,
        toAccountId,
        toAmount: data.toAmount,
        note: data.note,
        order: (last._max.order ?? 0) + 1,
      },
    });
  }

  refrescar();
  return { ok: true, id: saved.id };
}

export async function deleteTransaction(id: string) {
  await exigirSesion();
  await prisma.transaction.deleteMany({ where: { id } });
  refrescar();
}

/** Clasifica un movimiento (desde "Sin clasificar"). null lo deja sin categoría. */
export async function setTransactionCategory(id: string, categoryId: string | null) {
  await exigirSesion();
  const tx = await prisma.transaction.findUnique({ where: { id } });
  if (!tx || tx.kind === "transfer") return;
  if (categoryId) {
    const cat = await prisma.category.findUnique({ where: { id: categoryId } });
    const refund = tx.kind === "income" && cat?.kind === "expense";
    if (!cat || (cat.kind !== tx.kind && !refund)) throw new Error("Esa categoría no corresponde a este movimiento.");
  }
  await prisma.transaction.update({ where: { id }, data: { categoryId } });
  refrescar();
}

// ─── Cuentas ────────────────────────────────────────────────────────────────

/** Saldo inicial: admite negativo (una tarjeta que arranca debiendo). */
function parseSigned(raw: string): number | null {
  const s = raw.trim();
  if (!s || s === "0") return 0;
  const neg = /^[-−]/.test(s);
  const cents = parseAmount(s.replace(/^[-−]/, ""));
  if (cents === null) return null;
  return neg ? -cents : cents;
}

export async function saveAccount(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await exigirSesion();
  const id = texto(fd, "id", 40) || null;
  const name = texto(fd, "name", 60);
  if (!name) return { ok: false, error: "Ponele un nombre." };
  const type = texto(fd, "type") in ACCOUNT_TYPES ? texto(fd, "type") : "bank";
  const currency = (CURRENCIES as readonly string[]).includes(texto(fd, "currency")) ? texto(fd, "currency") : "UYU";
  const initial = parseSigned(texto(fd, "initialBalance", 30));
  if (initial === null) return { ok: false, error: "El saldo inicial no es un número válido." };
  const color = texto(fd, "color");

  const data = {
    name,
    type,
    currency,
    initialBalance: centsToDecimalString(initial),
    icon: ACCOUNT_TYPE_ICON[type] ?? "Wallet",
    color: isPaletteKey(color) ? color : "stone",
  };

  if (id) {
    const prev = await prisma.account.findUnique({
      where: { id },
      include: { _count: { select: { transactions: true, transfersIn: true } } },
    });
    if (!prev) return { ok: false, error: "Esa cuenta ya no existe." };
    if (prev.currency !== currency && prev._count.transactions + prev._count.transfersIn > 0) {
      return { ok: false, error: "No se puede cambiar la moneda de una cuenta con movimientos." };
    }
    await prisma.account.update({ where: { id }, data });
    refrescar();
    return { ok: true, id };
  }
  const last = await prisma.account.aggregate({ _max: { order: true } });
  const created = await prisma.account.create({ data: { ...data, order: (last._max.order ?? 0) + 1 } });
  refrescar();
  return { ok: true, id: created.id };
}

export async function archiveAccount(id: string, archived: boolean) {
  await exigirSesion();
  await prisma.account.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
  refrescar();
}

/** Solo se borra una cuenta sin movimientos; si tiene, se archiva. */
export async function deleteAccount(id: string): Promise<ActionResult> {
  await exigirSesion();
  const used = await prisma.transaction.count({ where: { OR: [{ accountId: id }, { toAccountId: id }] } });
  if (used > 0) return { ok: false, error: "Tiene movimientos: archivala en vez de borrarla." };
  await prisma.account.delete({ where: { id } });
  refrescar();
  return { ok: true };
}

/** Reordena las cuentas: recibe los ids en el orden nuevo. */
export async function reorderAccounts(ids: string[]) {
  await exigirSesion();
  await prisma.$transaction(ids.map((id, i) => prisma.account.update({ where: { id }, data: { order: i } })));
  refrescar();
}

// ─── Categorías ─────────────────────────────────────────────────────────────

export async function saveCategory(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await exigirSesion();
  const id = texto(fd, "id", 40) || null;
  const name = texto(fd, "name", 40);
  if (!name) return { ok: false, error: "Ponele un nombre." };
  const kind = texto(fd, "kind") === "income" ? "income" : "expense";
  const color = texto(fd, "color");
  const data = { name, icon: texto(fd, "icon", 40) || "Tag", color: isPaletteKey(color) ? color : "stone" };
  try {
    if (id) {
      // El tipo no cambia al editar: los movimientos ya clasificados quedarían incoherentes.
      await prisma.category.update({ where: { id }, data });
    } else {
      const last = await prisma.category.aggregate({ _max: { order: true } });
      await prisma.category.create({ data: { ...data, kind, order: (last._max.order ?? 0) + 1 } });
    }
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return { ok: false, error: "Ya hay una categoría con ese nombre." };
    throw e;
  }
  refrescar();
  return { ok: true };
}

/** Borra la categoría; sus movimientos quedan sin clasificar. */
export async function deleteCategory(id: string) {
  await exigirSesion();
  await prisma.category.delete({ where: { id } });
  refrescar();
}

// ─── Plantillas ─────────────────────────────────────────────────────────────

export async function renameTemplate(id: string, name: string) {
  await exigirSesion();
  const n = name.trim().slice(0, 60);
  if (!n) return;
  await prisma.txTemplate.update({ where: { id }, data: { name: n } });
  refrescar();
}

export async function deleteTemplate(id: string) {
  await exigirSesion();
  await prisma.txTemplate.deleteMany({ where: { id } });
  refrescar();
}

// ─── Recurrentes ────────────────────────────────────────────────────────────

/**
 * Crea o edita un movimiento recurrente. Arranca desde hoy: no carga los que
 * ya pasaron (para no duplicar lo que se cargó a mano). Si hoy toca, se carga
 * hoy mismo al abrir Gastos.
 */
export async function saveSchedule(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await exigirSesion();
  const id = texto(fd, "id", 40) || null;
  const kind = texto(fd, "kind") as TxKind;
  if (!TX_KINDS.includes(kind)) return { ok: false, error: "Tipo de movimiento inválido." };
  const amount = parseAmount(texto(fd, "amount", 30));
  if (amount === null) return { ok: false, error: "Escribí un monto mayor a cero." };
  const account = await prisma.account.findUnique({ where: { id: texto(fd, "accountId", 40) } });
  if (!account) return { ok: false, error: "Elegí una cuenta." };

  const frequency = texto(fd, "frequency");
  if (!isFrequency(frequency)) return { ok: false, error: "Elegí cada cuánto se repite." };
  const interval = Math.max(1, Math.min(60, Math.round(Number(texto(fd, "interval", 3)) || 1)));
  const startRaw = texto(fd, "startDate", 10);
  if (!isISODate(startRaw)) return { ok: false, error: "Elegí la fecha de la primera vez." };
  const endRaw = texto(fd, "endDate", 10);
  const endDate = isISODate(endRaw) ? endRaw : null;
  if (endDate && endDate < startRaw) return { ok: false, error: "La fecha de fin es anterior al inicio." };

  let categoryId: string | null = null;
  let toAccountId: string | null = null;
  let toAmount: number | null = null;
  if (kind === "transfer") {
    const to = await prisma.account.findUnique({ where: { id: texto(fd, "toAccountId", 40) } });
    if (!to) return { ok: false, error: "Elegí la cuenta de destino." };
    if (to.id === account.id) return { ok: false, error: "La cuenta de origen y la de destino son la misma." };
    toAccountId = to.id;
    if (to.currency === account.currency) toAmount = amount;
    else {
      toAmount = parseAmount(texto(fd, "toAmount", 30));
      if (toAmount === null) return { ok: false, error: `Escribí cuánto llega a "${to.name}" (en ${to.currency}).` };
    }
  } else {
    categoryId = texto(fd, "categoryId", 40) || null;
    if (categoryId) {
      const cat = await prisma.category.findUnique({ where: { id: categoryId } });
      if (!cat || cat.kind !== kind) categoryId = null;
    }
  }

  // La próxima vez: desde hoy, o desde el día después del último que ya generó.
  const rule = { startDate: startRaw, frequency, interval, endDate };
  let from = todayISO();
  if (id) {
    const last = await prisma.transaction.findFirst({ where: { scheduleId: id }, orderBy: { date: "desc" }, select: { date: true } });
    if (last) {
      const after = addDays(fromDbDate(last.date), 1);
      if (after > from) from = after;
    }
  }
  const next = nextOnOrAfter(rule, from);

  const data = {
    kind,
    title: texto(fd, "title", 120) || null,
    amount: centsToDecimalString(amount),
    accountId: account.id,
    categoryId,
    toAccountId,
    toAmount: toAmount === null ? null : centsToDecimalString(toAmount),
    note: texto(fd, "note", 2000) || null,
    frequency,
    interval,
    startDate: toDbDate(startRaw),
    endDate: endDate ? toDbDate(endDate) : null,
    nextDate: next ? toDbDate(next) : null,
    autoConfirm: true,
  };
  if (id) await prisma.scheduledTransaction.update({ where: { id }, data });
  else await prisma.scheduledTransaction.create({ data });
  refrescar();
  return { ok: true };
}

export async function setScheduleActive(id: string, active: boolean) {
  await exigirSesion();
  const s = await prisma.scheduledTransaction.findUnique({ where: { id } });
  if (!s) return;
  // Al reactivar no se cargan los que pasaron mientras estuvo en pausa.
  const next = active
    ? nextOnOrAfter(
        {
          startDate: fromDbDate(s.startDate),
          frequency: isFrequency(s.frequency) ? s.frequency : "monthly",
          interval: s.interval,
          endDate: s.endDate ? fromDbDate(s.endDate) : null,
        },
        todayISO(),
      )
    : null;
  await prisma.scheduledTransaction.update({
    where: { id },
    data: { active, ...(active ? { nextDate: next ? toDbDate(next) : null } : {}) },
  });
  refrescar();
}

/** Borra el recurrente; los movimientos que ya cargó se quedan. */
export async function deleteSchedule(id: string) {
  await exigirSesion();
  await prisma.scheduledTransaction.deleteMany({ where: { id } });
  refrescar();
}

// ─── Presupuestos ───────────────────────────────────────────────────────────

/** Pone (o cambia) el presupuesto mensual de una categoría de gasto. Vacío o 0 lo saca. */
export async function saveCategoryBudget(categoryId: string, raw: string): Promise<ActionResult> {
  await exigirSesion();
  const cat = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!cat || cat.kind !== "expense") return { ok: false, error: "Esa categoría no es de gastos." };
  if (!raw.trim() || raw.trim() === "0") {
    await prisma.categoryBudget.deleteMany({ where: { categoryId } });
    refrescar();
    return { ok: true };
  }
  const cents = parseAmount(raw);
  if (cents === null) return { ok: false, error: "Escribí un monto mayor a cero." };
  const amount = centsToDecimalString(cents);
  await prisma.categoryBudget.upsert({
    where: { categoryId },
    create: { categoryId, amount },
    update: { amount },
  });
  refrescar();
  return { ok: true };
}

/** Crea o edita un presupuesto puntual (viaje, vacaciones...). */
export async function saveProject(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await exigirSesion();
  const id = texto(fd, "id", 40) || null;
  const name = texto(fd, "name", 80);
  if (!name) return { ok: false, error: "Ponele un nombre (por ejemplo, Viaje a Brasil)." };
  const cents = parseAmount(texto(fd, "amount", 30));
  if (cents === null) return { ok: false, error: "Escribí cuánto querés gastar en total." };
  const currency = (CURRENCIES as readonly string[]).includes(texto(fd, "currency")) ? texto(fd, "currency") : "UYU";
  const start = texto(fd, "startDate", 10);
  const end = texto(fd, "endDate", 10);
  const startDate = isISODate(start) ? start : null;
  const endDate = isISODate(end) ? end : null;
  if (startDate && endDate && endDate < startDate) return { ok: false, error: "La fecha de fin es anterior al inicio." };
  const color = texto(fd, "color");
  const data = {
    name,
    amount: centsToDecimalString(cents),
    currency,
    startDate: startDate ? toDbDate(startDate) : null,
    endDate: endDate ? toDbDate(endDate) : null,
    icon: texto(fd, "icon", 40) || "Airplane",
    color: isPaletteKey(color) ? color : "teal",
    note: texto(fd, "note", 2000) || null,
  };
  const saved = id
    ? await prisma.budgetProject.update({ where: { id }, data })
    : await prisma.budgetProject.create({ data });
  refrescar();
  return { ok: true, id: saved.id };
}

export async function archiveProject(id: string, archived: boolean) {
  await exigirSesion();
  await prisma.budgetProject.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
  refrescar();
}

/** Borra el presupuesto puntual; sus movimientos quedan, sin asignar. */
export async function deleteProject(id: string) {
  await exigirSesion();
  await prisma.budgetProject.deleteMany({ where: { id } });
  refrescar();
}

/** Asigna (o saca) movimientos de un presupuesto puntual. */
export async function setTransactionsProject(ids: string[], projectId: string | null) {
  await exigirSesion();
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500) return;
  if (projectId && !(await prisma.budgetProject.findUnique({ where: { id: projectId }, select: { id: true } }))) return;
  await prisma.transaction.updateMany({ where: { id: { in: ids.map(String) } }, data: { projectId } });
  refrescar();
}

// ─── Ajustes de saldo y transferencias ──────────────────────────────────────

/** Marca movimientos como "Ajuste de saldo": siguen moviendo el saldo pero no cuentan como gasto ni ingreso. */
export async function markAsAdjustment(ids: string[]) {
  await exigirSesion();
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500) return;
  const adj = await ensureAdjustmentCategories(prisma);
  const txs = await prisma.transaction.findMany({ where: { id: { in: ids.map(String) } }, select: { id: true, kind: true } });
  for (const kind of ["income", "expense"] as const) {
    const these = txs.filter((t) => t.kind === kind).map((t) => t.id);
    if (these.length) await prisma.transaction.updateMany({ where: { id: { in: these } }, data: { categoryId: adj[kind] } });
  }
  refrescar();
}

/**
 * Convierte un ingreso o gasto suelto en una transferencia con otra cuenta de
 * la misma moneda (un ingreso "llegó desde" la otra; un gasto "fue hacia").
 * Después se recalibran los saldos para que el 2 de octubre siga cerrando.
 */
export async function convertToTransfer(id: string, otherAccountId: string): Promise<ActionResult> {
  await exigirSesion();
  const tx = await prisma.transaction.findUnique({ where: { id }, include: { account: true } });
  if (!tx || tx.kind === "transfer") return { ok: false, error: "Ese movimiento ya no existe." };
  const other = await prisma.account.findUnique({ where: { id: otherAccountId } });
  if (!other || other.id === tx.accountId) return { ok: false, error: "Elegí otra cuenta." };
  if (other.currency !== tx.account.currency) return { ok: false, error: "Tiene que ser una cuenta de la misma moneda." };
  const [from, to] = tx.kind === "income" ? [other.id, tx.accountId] : [tx.accountId, other.id];
  await prisma.transaction.update({
    where: { id },
    data: { kind: "transfer", accountId: from, toAccountId: to, toAmount: tx.amount, categoryId: null, projectId: null },
  });
  await calibrarSaldos(prisma);
  refrescar();
  return { ok: true };
}

/**
 * Cuadra el saldo de una cuenta: con el saldo real de un día (hoy u otro), crea
 * un "Ajuste de saldo" por la diferencia. No cuenta como gasto ni ingreso.
 */
export async function adjustBalance(accountId: string, realRaw: string, date: string): Promise<ActionResult> {
  await exigirSesion();
  const acc = await prisma.account.findUnique({ where: { id: accountId } });
  if (!acc) return { ok: false, error: "Esa cuenta ya no existe." };
  const s = realRaw.trim();
  const neg = /^[-−]/.test(s);
  const abs = s.replace(/^[-−]/, "") === "0" ? 0 : parseAmount(s.replace(/^[-−]/, ""));
  if (abs === null) return { ok: false, error: "Escribí el saldo real (puede ser 0)." };
  const real = neg ? -abs : abs;
  const day = isISODate(date) && date <= todayISO() ? date : todayISO();
  const txs = await prisma.transaction.findMany({
    where: { OR: [{ accountId }, { toAccountId: accountId }], date: { lte: toDbDate(day) } },
    select: { kind: true, amount: true, toAmount: true, accountId: true },
  });
  let balance = Math.round(Number(acc.initialBalance) * 100);
  for (const t of txs) {
    const amt = Math.round(Number(t.amount) * 100);
    if (t.kind === "income") balance += amt;
    else if (t.kind === "expense") balance -= amt;
    else if (t.accountId === accountId) balance -= amt;
    else balance += Math.round(Number(t.toAmount ?? t.amount) * 100);
  }
  const diff = real - balance;
  if (diff === 0) return { ok: true };
  const adj = await ensureAdjustmentCategories(prisma);
  await prisma.transaction.create({
    data: {
      kind: diff > 0 ? "income" : "expense",
      date: toDbDate(day),
      title: "Ajuste de saldo",
      amount: centsToDecimalString(Math.abs(diff)),
      accountId,
      categoryId: adj[diff > 0 ? "income" : "expense"],
      note: `Saldo real ese día: ${centsToDecimalString(real)}`,
    },
  });
  refrescar();
  return { ok: true };
}
