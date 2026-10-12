"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "./prisma";
import { exigirSesion } from "./session";
import { addDays, fromDbDate, isISODate, shiftMonth, todayISO, toDbDate } from "./dates";
import { isFrequency, nextOnOrAfter } from "./schedule-logic";
import { ensureAdjustmentCategories } from "./importers/adjustments";
import { calibrarSaldos } from "./importers/gastos-saldos";
import { FIXED_IGNORED, getClassifier, REPORT_RATE } from "./finance";
import { logActivity, trashAndDelete } from "./trash";
import { parseQuick } from "./smart-logic";
import { dayIn, installmentDate, splitInstallments } from "./card-logic";
import { isPaletteKey } from "./palette";
import { ACCOUNT_TYPES, CURRENCIES, moneyCents } from "./format";
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

  // Compra en cuotas con tarjeta: una por mes, cada una en su resumen.
  const count = Number(texto(fd, "installments", 2));
  if (!id && kind === "expense" && account.type === "card" && Number.isInteger(count) && count >= 2 && count <= 24) {
    const group = crypto.randomUUID();
    const parts = splitInstallments(amount, count);
    const rows = parts.map((cents, i) => ({
      ...data,
      date: toDbDate(installmentDate(date, i)),
      amount: centsToDecimalString(cents),
      installmentGroup: group,
      installmentNo: i + 1,
      installmentCount: count,
    }));
    const first = await prisma.transaction.create({ data: rows[0] });
    if (rows.length > 1) await prisma.transaction.createMany({ data: rows.slice(1) });
    await logActivity(
      "created",
      "transaction",
      first.id,
      `Compra en ${count} cuotas ${centsToDecimalString(amount)} ${account.currency}${data.title ? ` · ${data.title}` : ""} (${account.name})`,
    );
    refrescar();
    return { ok: true, id: first.id };
  }

  const saved = id
    ? await prisma.transaction.update({ where: { id }, data })
    : await prisma.transaction.create({ data });
  await logActivity(
    id ? "updated" : "created",
    "transaction",
    saved.id,
    `${kind === "income" ? "Ingreso" : kind === "expense" ? "Gasto" : "Transferencia"} ${centsToDecimalString(amount)} ${account.currency}${data.title ? ` · ${data.title}` : ""} (${account.name})`,
  );

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

/** Cambiar el título desde el menú de clic derecho. */
export async function renameTransaction(id: string, title: string) {
  await exigirSesion();
  const t = String(title ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
  await prisma.transaction.updateMany({ where: { id: String(id) }, data: { title: t || null } });
  refrescar();
}

/** Duplicar un movimiento (mismo día, cuenta, monto y categoría; sin fotos ni cuotas). */
export async function duplicateTransaction(id: string) {
  await exigirSesion();
  const t = await prisma.transaction.findUnique({ where: { id: String(id) } });
  if (!t) return;
  const copy = await prisma.transaction.create({
    data: {
      kind: t.kind,
      date: t.date,
      title: t.title,
      amount: t.amount,
      accountId: t.accountId,
      categoryId: t.categoryId,
      toAccountId: t.toAccountId,
      toAmount: t.toAmount,
      note: t.note,
      projectId: t.projectId,
    },
  });
  await logActivity("created", "transaction", copy.id, `${t.title || "Movimiento"} (copia)`);
  refrescar();
}

export async function deleteTransaction(id: string) {
  await exigirSesion();
  await trashAndDelete("transaction", id);
  refrescar();
}

/** Borra todas las cuotas de una compra (cada una va a la papelera). */
export async function deleteInstallments(group: string) {
  await exigirSesion();
  if (typeof group !== "string" || !/^[0-9a-f-]{36}$/.test(group)) return;
  const rows = await prisma.transaction.findMany({ where: { installmentGroup: group }, select: { id: true } });
  for (const r of rows) await trashAndDelete("transaction", r.id);
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

  const day = (k: string) => {
    const n = Number(texto(fd, k, 2));
    return type === "card" && Number.isInteger(n) && n >= 1 && n <= 31 ? n : null;
  };
  const limit = type === "card" ? parseAmount(texto(fd, "creditLimit", 30)) : null;
  const data = {
    name,
    type,
    currency,
    initialBalance: centsToDecimalString(initial),
    icon: ACCOUNT_TYPE_ICON[type] ?? "Wallet",
    color: isPaletteKey(color) ? color : "stone",
    closingDay: day("closingDay"),
    dueDay: day("dueDay"),
    creditLimit: limit === null ? null : centsToDecimalString(limit),
    isBusiness: fd.get("business") === "on",
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
    await logActivity("updated", "account", id, name);
    refrescar();
    return { ok: true, id };
  }
  const last = await prisma.account.aggregate({ _max: { order: true } });
  const created = await prisma.account.create({ data: { ...data, order: (last._max.order ?? 0) + 1 } });
  await logActivity("created", "account", created.id, name);
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
  await trashAndDelete("account", id);
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
  await trashAndDelete("category", id);
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
  await trashAndDelete("template", id);
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
  const savedSch = id
    ? await prisma.scheduledTransaction.update({ where: { id }, data })
    : await prisma.scheduledTransaction.create({ data });
  await logActivity(id ? "updated" : "created", "schedule", savedSch.id, `${data.title ?? "Recurrente"} · ${data.amount} ${account.currency}`);
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
  await trashAndDelete("schedule", id);
  refrescar();
}

// ─── Presupuestos ───────────────────────────────────────────────────────────

/**
 * Pone (o cambia) el presupuesto mensual de una categoría de gasto. Vacío o 0 lo saca.
 * `rollover`: pasar lo que sobra al mes siguiente (se cuenta desde el mes en que se activa;
 * apagarlo borra el arrastre). Sin el parámetro, el arrastre queda como estaba.
 */
export async function saveCategoryBudget(categoryId: string, raw: string, rollover?: boolean): Promise<ActionResult> {
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
  const prev = await prisma.categoryBudget.findUnique({ where: { categoryId }, select: { rollover: true, rolloverSince: true } });
  const roll =
    rollover === undefined
      ? {}
      : rollover
        ? { rollover: true, rolloverSince: prev?.rollover && prev.rolloverSince ? prev.rolloverSince : toDbDate(`${todayISO().slice(0, 7)}-01`) }
        : { rollover: false, rolloverSince: null };
  await prisma.categoryBudget.upsert({
    where: { categoryId },
    create: { categoryId, amount, ...roll },
    update: { amount, ...roll },
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
  await logActivity(id ? "updated" : "created", "project", saved.id, `${name} · ${data.amount} ${currency}`);
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
  await trashAndDelete("project", id);
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
  await logActivity("updated", "transaction", id, `Convertido en transferencia: ${tx.amount} ${tx.account.currency} con ${other.name}`);
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
  await logActivity("updated", "account", accountId, `${acc.name}: saldo ajustado a ${centsToDecimalString(real)} (${day})`);
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

// ─── Clasificación y carga rápida ───────────────────────────────────────────

/** Categoría sugerida para un título (aprende de lo que ya clasificaste). */
export async function suggestCategory(title: string, kind: string): Promise<string | null> {
  await exigirSesion();
  if (!title.trim() || (kind !== "expense" && kind !== "income")) return null;
  const classify = await getClassifier();
  return classify(title.slice(0, 120), kind)?.categoryId ?? null;
}

/** Aplica de una vez varias sugerencias de "Sin clasificar". */
export async function applySuggestions(pairs: { id: string; categoryId: string }[]) {
  await exigirSesion();
  if (!Array.isArray(pairs) || pairs.length > 1000) return;
  // Todo de una vez: antes eran dos consultas por movimiento (hasta ~2.000) y podía pasar
  // el tiempo de una función de Vercel. Ahora una lectura y un updateMany por categoría.
  const [cats, txs] = await Promise.all([
    prisma.category.findMany({ where: { isAdjustment: false }, select: { id: true, kind: true, name: true } }),
    prisma.transaction.findMany({
      where: { id: { in: pairs.map((p) => String(p?.id)) }, categoryId: null },
      select: { id: true, kind: true },
    }),
  ]);
  const catById = new Map(cats.map((c) => [c.id, c]));
  const kindOf = new Map(txs.map((t) => [t.id, t.kind]));
  const byCat = new Map<string, string[]>();
  for (const p of pairs) {
    const id = String(p?.id);
    const cat = catById.get(String(p?.categoryId));
    // Solo los que siguen sin clasificar y con una categoría de su tipo.
    if (!cat || kindOf.get(id) !== cat.kind) continue;
    byCat.set(cat.id, [...(byCat.get(cat.id) ?? []), id]);
  }
  if (!byCat.size) return;
  await prisma.$transaction(
    [...byCat].map(([categoryId, ids]) =>
      prisma.transaction.updateMany({ where: { id: { in: ids }, categoryId: null }, data: { categoryId } }),
    ),
  );
  for (const [categoryId, ids] of byCat) {
    await logActivity(
      "updated",
      "transaction",
      null,
      `${ids.length === 1 ? "1 movimiento clasificado" : `${ids.length} movimientos clasificados`} como ${catById.get(categoryId)!.name} (sugerencias)`,
    );
  }
  refrescar();
}

/** Lo que necesita la vista previa de la carga rápida: categorías y la última cuenta usada por moneda. */
export async function quickAddContext(): Promise<{
  categories: { id: string; name: string; kind: "expense" | "income" }[];
  lastAccount: Record<string, string>;
}> {
  await exigirSesion();
  const [cats, recent] = await Promise.all([
    prisma.category.findMany({
      where: { archivedAt: null, isAdjustment: false },
      orderBy: [{ order: "asc" }, { name: "asc" }],
      select: { id: true, name: true, kind: true },
    }),
    prisma.transaction.findMany({
      where: { account: { archivedAt: null } },
      orderBy: { createdAt: "desc" },
      distinct: ["accountId"],
      take: 40,
      select: { accountId: true, account: { select: { currency: true } } },
    }),
  ]);
  const lastAccount: Record<string, string> = {};
  for (const t of recent) lastAccount[t.account.currency] ??= t.accountId;
  return {
    categories: cats.map((c) => ({ id: c.id, name: c.name, kind: c.kind === "income" ? "income" : "expense" })),
    lastAccount,
  };
}

/**
 * Carga rápida escribiendo: "350 almuerzo itau", "+2450 disco santander ayer".
 * Sin cuenta en el texto usa la del último movimiento cargado de esa moneda.
 * `picked`: cuenta o categoría elegidas a mano en la vista previa (categoryId null =
 * sin clasificar); lo que no se elige se detecta como siempre.
 */
export async function quickAdd(
  text: string,
  picked?: { accountId?: string | null; categoryId?: string | null },
): Promise<ActionResult & { summary?: string }> {
  await exigirSesion();
  const accounts = await prisma.account.findMany({ where: { archivedAt: null }, select: { id: true, name: true, currency: true } });
  const p = parseQuick(String(text ?? "").slice(0, 200), accounts);
  if (!p) return { ok: false, error: "Poné al menos un monto, por ejemplo: 350 almuerzo itau" };
  const pickedAccount = picked?.accountId ? accounts.find((a) => a.id === String(picked.accountId)) : undefined;
  if (picked?.accountId && !pickedAccount) return { ok: false, error: "Esa cuenta ya no está (¿la archivaste?)." };
  let accountId = pickedAccount?.id ?? p.accountId;
  if (!accountId) {
    const last = await prisma.transaction.findFirst({
      where: { account: { archivedAt: null, ...(p.currency ? { currency: p.currency } : {}) } },
      orderBy: { createdAt: "desc" },
      select: { accountId: true },
    });
    accountId = last?.accountId ?? accounts.find((a) => a.currency === (p.currency ?? "UYU"))?.id ?? accounts[0]?.id ?? null;
  }
  if (!accountId) return { ok: false, error: "Creá una cuenta primero." };
  const acc = accounts.find((a) => a.id === accountId)!;
  let categoryId: string | null = null;
  if (picked && picked.categoryId !== undefined) {
    if (picked.categoryId) {
      const cat = await prisma.category.findUnique({ where: { id: String(picked.categoryId) } });
      // Un ingreso con categoría de gasto es un reintegro; los ajustes no se eligen acá.
      const ok = !!cat && !cat.isAdjustment && (cat.kind === p.kind || (p.kind === "income" && cat.kind === "expense"));
      if (!ok) return { ok: false, error: "Esa categoría no va con este movimiento." };
      categoryId = cat.id;
    }
  } else {
    const classify = await getClassifier();
    categoryId = p.title ? (classify(p.title, p.kind)?.categoryId ?? null) : null;
  }
  const date = addDays(todayISO(), -p.daysAgo);
  const tx = await prisma.transaction.create({
    data: {
      kind: p.kind,
      date: toDbDate(date),
      title: p.title || null,
      amount: centsToDecimalString(p.amountCents),
      accountId,
      categoryId,
    },
    include: { category: { select: { name: true } } },
  });
  refrescar();
  await logActivity("created", "transaction", tx.id, `${p.kind === "income" ? "Ingreso" : "Gasto"} ${centsToDecimalString(p.amountCents)} ${acc.currency}${p.title ? ` · ${p.title}` : ""} (carga rápida)`);
  const what = `${p.kind === "income" ? "Ingreso" : "Gasto"} de ${moneyCents(p.amountCents, acc.currency)} en ${acc.name}`;
  const when = p.daysAgo ? (p.daysAgo === 1 ? " · ayer" : " · anteayer") : "";
  return { ok: true, id: tx.id, summary: `${what} · ${tx.category ? tx.category.name : "sin clasificar"}${when}` };
}

// ─── Deudas ─────────────────────────────────────────────────────────────────

export async function saveDebt(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await exigirSesion();
  const id = texto(fd, "id", 40) || null;
  const person = texto(fd, "person", 60);
  if (!person) return { ok: false, error: "¿Quién?" };
  const cents = parseAmount(texto(fd, "amount", 30));
  if (cents === null) return { ok: false, error: "Escribí un monto mayor a cero." };
  const dateRaw = texto(fd, "date", 10);
  const data = {
    person,
    direction: texto(fd, "direction") === "i_owe" ? "i_owe" : "owed_to_me",
    amount: centsToDecimalString(cents),
    currency: (CURRENCIES as readonly string[]).includes(texto(fd, "currency")) ? texto(fd, "currency") : "UYU",
    date: toDbDate(isISODate(dateRaw) ? dateRaw : todayISO()),
    note: texto(fd, "note", 500) || null,
  };
  const saved = id ? await prisma.debt.update({ where: { id }, data }) : await prisma.debt.create({ data });
  await logActivity(id ? "updated" : "created", "debt", saved.id, `${person}: ${data.direction === "i_owe" ? "le debés" : "te debe"} ${data.amount} ${data.currency}`);
  refrescar();
  return { ok: true };
}

/**
 * Salda una deuda. Si se elige cuenta, carga el movimiento: lo que te
 * devuelven entra como ingreso (o reintegro de la categoría elegida) y lo que
 * pagás sale como gasto.
 */
export async function settleDebt(id: string, accountId: string | null, categoryId: string | null): Promise<ActionResult> {
  await exigirSesion();
  const d = await prisma.debt.findUnique({ where: { id } });
  if (!d) return { ok: false, error: "Esa deuda ya no existe." };
  let settleTxId: string | null = null;
  if (accountId) {
    const acc = await prisma.account.findUnique({ where: { id: accountId } });
    if (!acc) return { ok: false, error: "Elegí una cuenta." };
    if (acc.currency !== d.currency) return { ok: false, error: `La cuenta tiene que ser en ${d.currency}, como la deuda.` };
    const kind = d.direction === "owed_to_me" ? "income" : "expense";
    const cat = categoryId ? await prisma.category.findUnique({ where: { id: categoryId } }) : null;
    const okCat = !!cat && !cat.isAdjustment && (cat.kind === kind || (kind === "income" && cat.kind === "expense"));
    const tx = await prisma.transaction.create({
      data: {
        kind,
        date: toDbDate(todayISO()),
        title: d.direction === "owed_to_me" ? `${d.person} me devolvió` : `Le pagué a ${d.person}`,
        amount: d.amount,
        accountId: acc.id,
        categoryId: okCat ? cat.id : null,
        note: d.note,
      },
    });
    settleTxId = tx.id;
  }
  await prisma.debt.update({ where: { id }, data: { settledAt: new Date(), settleTxId } });
  await logActivity("done", "debt", id, `Saldada: ${d.person}`);
  refrescar();
  return { ok: true };
}

/**
 * Vuelve a abrir una deuda saldada. El movimiento que se cargó al saldarla va a la
 * papelera (se puede deshacer): si no, al saldarla de nuevo quedaba el ingreso duplicado.
 */
export async function reopenDebt(id: string) {
  await exigirSesion();
  const d = await prisma.debt.findUnique({ where: { id }, select: { settleTxId: true } });
  if (!d) return;
  if (d.settleTxId) await trashAndDelete("transaction", d.settleTxId);
  await prisma.debt.update({ where: { id }, data: { settledAt: null, settleTxId: null } });
  refrescar();
}

export async function deleteDebt(id: string) {
  await exigirSesion();
  await trashAndDelete("debt", id);
  refrescar();
}

// ─── Metas de ahorro ────────────────────────────────────────────────────────

export async function saveGoal(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await exigirSesion();
  const id = texto(fd, "id", 40) || null;
  const name = texto(fd, "name", 80);
  if (!name) return { ok: false, error: "Ponele un nombre (por ejemplo, Viaje a Europa)." };
  const cents = parseAmount(texto(fd, "target", 30));
  if (cents === null) return { ok: false, error: "¿Cuánto querés juntar?" };
  const deadline = texto(fd, "deadline", 10);
  const accountId = texto(fd, "accountId", 40) || null;
  if (accountId && !(await prisma.account.findUnique({ where: { id: accountId }, select: { id: true } }))) {
    return { ok: false, error: "Esa cuenta ya no existe." };
  }
  const color = texto(fd, "color");
  const data = {
    name,
    target: centsToDecimalString(cents),
    currency: (CURRENCIES as readonly string[]).includes(texto(fd, "currency")) ? texto(fd, "currency") : "UYU",
    deadline: isISODate(deadline) ? toDbDate(deadline) : null,
    accountId,
    icon: texto(fd, "icon", 40) || "PiggyBank",
    color: isPaletteKey(color) ? color : "green",
  };
  const saved = id ? await prisma.savingsGoal.update({ where: { id }, data }) : await prisma.savingsGoal.create({ data });
  await logActivity(id ? "updated" : "created", "goal", saved.id, `${name} · ${data.target} ${data.currency}`);
  refrescar();
  return { ok: true };
}

/** Suma (o resta, con negativo) a lo juntado a mano de una meta. */
export async function addToGoal(id: string, raw: string): Promise<ActionResult> {
  await exigirSesion();
  const s = raw.trim();
  const neg = /^[-−]/.test(s);
  const cents = parseAmount(s.replace(/^[-−]/, ""));
  if (cents === null) return { ok: false, error: "Escribí un monto." };
  const g = await prisma.savingsGoal.findUnique({ where: { id } });
  if (!g) return { ok: false, error: "Esa meta ya no existe." };
  const next = Math.max(0, Math.round(Number(g.saved) * 100) + (neg ? -cents : cents));
  await prisma.savingsGoal.update({ where: { id }, data: { saved: centsToDecimalString(next) } });
  refrescar();
  return { ok: true };
}

export async function archiveGoal(id: string, archived: boolean) {
  await exigirSesion();
  await prisma.savingsGoal.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
  refrescar();
}

export async function deleteGoal(id: string) {
  await exigirSesion();
  await trashAndDelete("goal", id);
  refrescar();
}

// ─── Gastos fijos sugeridos ─────────────────────────────────────────────────

/** Pasa un gasto fijo detectado a recurrente mensual, desde la próxima vez que toca. */
export async function acceptFixed(input: { key: string; title: string; accountId: string; categoryId: string | null; amountCents: number; day: number; lastDate: string }) {
  await exigirSesion();
  const account = await prisma.account.findUnique({ where: { id: String(input.accountId) } });
  if (!account) return { ok: false as const, error: "La cuenta ya no existe." };
  const cents = Math.round(Number(input.amountCents));
  if (!Number.isInteger(cents) || cents <= 0) return { ok: false as const, error: "Monto inválido." };
  const day = Math.min(31, Math.max(1, Math.round(Number(input.day)) || 1));
  const today = todayISO();
  // Si este mes ya se pagó, arranca el que viene; si no, este mes (o el que viene si el día ya pasó).
  const thisMonth = today.slice(0, 7);
  const paidThisMonth = isISODate(input.lastDate) && input.lastDate.slice(0, 7) === thisMonth;
  let start = dayIn(thisMonth, day);
  if (paidThisMonth || start < today) start = dayIn(shiftMonth(thisMonth, 1), day);
  const cat = input.categoryId ? await prisma.category.findUnique({ where: { id: input.categoryId }, select: { id: true, kind: true } }) : null;
  const created = await prisma.scheduledTransaction.create({
    data: {
      kind: "expense",
      title: String(input.title).slice(0, 120),
      amount: centsToDecimalString(cents),
      accountId: account.id,
      categoryId: cat?.kind === "expense" ? cat.id : null,
      frequency: "monthly",
      interval: 1,
      startDate: toDbDate(start),
      nextDate: toDbDate(start),
    },
  });
  await logActivity("created", "schedule", created.id, `${created.title} (detectado como fijo)`);
  revalidatePath("/gastos", "layout");
  return { ok: true as const };
}

/** La cotización de "Todo en pesos" en Informes (pesos por dólar). */
export async function saveReportRate(rate: number): Promise<ActionResult> {
  await exigirSesion();
  const n = Math.round(Number(rate) * 10000) / 10000;
  if (!Number.isFinite(n) || n <= 0 || n > 100000) return { ok: false, error: "Escribí una cotización válida." };
  const value = String(n);
  await prisma.appSetting.upsert({ where: { key: REPORT_RATE }, create: { key: REPORT_RATE, value }, update: { value } });
  revalidatePath("/gastos/informes");
  return { ok: true };
}

/** "No es fijo": la sugerencia no vuelve a aparecer. */
export async function ignoreFixed(key: string) {
  await exigirSesion();
  const k = String(key).slice(0, 200);
  const row = await prisma.appSetting.findUnique({ where: { key: FIXED_IGNORED } });
  let list: string[] = [];
  try {
    list = JSON.parse(row?.value ?? "[]");
  } catch {
    list = [];
  }
  if (!list.includes(k)) list.push(k);
  const value = JSON.stringify(list.slice(-300));
  await prisma.appSetting.upsert({ where: { key: FIXED_IGNORED }, create: { key: FIXED_IGNORED, value }, update: { value } });
  revalidatePath("/gastos/recurrentes");
}
