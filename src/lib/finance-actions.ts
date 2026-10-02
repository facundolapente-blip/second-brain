"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "./prisma";
import { exigirSesion } from "./session";
import { isISODate, todayISO, toDbDate } from "./dates";
import { isPaletteKey } from "./palette";
import { ACCOUNT_TYPES, CURRENCIES } from "./format";
import { ACCOUNT_TYPE_ICON, centsToDecimalString, parseAmount, TX_KINDS, type TxKind } from "./finance-logic";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

function refrescar() {
  revalidatePath("/gastos", "layout");
}

function texto(fd: FormData, key: string, max = 200): string {
  return String(fd.get(key) ?? "").trim().slice(0, max);
}

// ─── Movimientos ────────────────────────────────────────────────────────────

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
      if (!cat || cat.kind !== kind) categoryId = null;
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
    if (!cat || cat.kind !== tx.kind) throw new Error("Esa categoría no corresponde a este movimiento.");
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
