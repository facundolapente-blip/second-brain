import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { fromDbDate, formatShort } from "./dates";
import { moneyCents } from "./format";
import { toCents } from "./finance-logic";
import { deletePhotoFiles } from "./photos";

/**
 * Papelera de toda la app. Antes de borrar algo se guarda su foto completa
 * (con lo que cuelga de él: las marcas de un hábito, a qué movimientos estaba
 * asignada una categoría…) y se puede restaurar tal cual, con el mismo id.
 * También deja el registro de actividad (qué se creó, editó, borró).
 */

export type TrashKind =
  | "transaction"
  | "account"
  | "category"
  | "template"
  | "schedule"
  | "project"
  | "debt"
  | "goal"
  | "habit"
  | "habitCategory"
  | "journal"
  | "block"
  | "task"
  | "keyResult"
  | "objective"
  | "photo";

export type Module = "gastos" | "habitos" | "journal" | "plan";

const MODULE: Record<TrashKind, Module> = {
  transaction: "gastos",
  account: "gastos",
  category: "gastos",
  template: "gastos",
  schedule: "gastos",
  project: "gastos",
  debt: "gastos",
  goal: "gastos",
  habit: "habitos",
  habitCategory: "habitos",
  journal: "journal",
  block: "plan",
  task: "plan",
  keyResult: "plan",
  objective: "plan",
  photo: "journal",
};

export const KIND_LABEL: Record<TrashKind, string> = {
  transaction: "Movimiento",
  account: "Cuenta",
  category: "Categoría de gastos",
  template: "Plantilla",
  schedule: "Recurrente",
  project: "Presupuesto puntual",
  debt: "Deuda",
  goal: "Meta de ahorro",
  habit: "Hábito",
  habitCategory: "Categoría de hábitos",
  journal: "Entrada del journal",
  block: "Bloque del plan",
  task: "Tarea",
  keyResult: "Resultado clave",
  objective: "Objetivo",
  photo: "Foto",
};

// ─── Actividad ──────────────────────────────────────────────────────────────

export async function logActivity(action: string, kind: TrashKind | "import" | "checkin", entityId: string | null, label: string) {
  const mod: Module | "datos" = kind === "import" ? "datos" : kind === "checkin" ? "habitos" : MODULE[kind];
  await prisma.activity.create({ data: { action, kind, entityId, label: label.slice(0, 200), module: mod } }).catch(() => {});
}

// ─── Fotos ──────────────────────────────────────────────────────────────────

type Snap = { row: Record<string, unknown>; [k: string]: unknown };
type Snapshot = { label: string; data: Snap; module?: Module };

const kindName: Record<string, string> = { expense: "Gasto", income: "Ingreso", transfer: "Transferencia" };

/** Junta la foto y una etiqueta legible. Null si ya no existe. */
async function snapshot(kind: TrashKind, id: string): Promise<Snapshot | null> {
  switch (kind) {
    case "transaction": {
      const t = await prisma.transaction.findUnique({ where: { id }, include: { account: true, attachments: true } });
      if (!t) return null;
      const { account, attachments, ...row } = t;
      return {
        label: `${kindName[t.kind] ?? "Movimiento"} ${moneyCents(toCents(t.amount), account.currency)}${t.title ? ` · ${t.title}` : ""} (${account.name}, ${formatShort(fromDbDate(t.date))})`,
        data: { row, attachments },
      };
    }
    case "account": {
      const a = await prisma.account.findUnique({ where: { id } });
      return a ? { label: `${a.name} (${a.currency})`, data: { row: a } } : null;
    }
    case "category": {
      const c = await prisma.category.findUnique({ where: { id }, include: { budget: true } });
      if (!c) return null;
      const { budget, ...row } = c;
      const [txIds, tplIds, schIds] = await Promise.all([
        prisma.transaction.findMany({ where: { categoryId: id }, select: { id: true } }),
        prisma.txTemplate.findMany({ where: { categoryId: id }, select: { id: true } }),
        prisma.scheduledTransaction.findMany({ where: { categoryId: id }, select: { id: true } }),
      ]);
      return {
        label: `${c.name} (${txIds.length} movimientos)`,
        data: { row, budget, txIds: txIds.map((x) => x.id), tplIds: tplIds.map((x) => x.id), schIds: schIds.map((x) => x.id) },
      };
    }
    case "template": {
      const t = await prisma.txTemplate.findUnique({ where: { id } });
      return t ? { label: t.name, data: { row: t } } : null;
    }
    case "schedule": {
      const s = await prisma.scheduledTransaction.findUnique({ where: { id }, include: { account: true } });
      if (!s) return null;
      const { account, ...row } = s;
      const txIds = await prisma.transaction.findMany({ where: { scheduleId: id }, select: { id: true } });
      return {
        label: `${s.title ?? "Recurrente"} · ${moneyCents(toCents(s.amount), account.currency)}`,
        data: { row, txIds: txIds.map((x) => x.id) },
      };
    }
    case "project": {
      const p = await prisma.budgetProject.findUnique({ where: { id } });
      if (!p) return null;
      const txIds = await prisma.transaction.findMany({ where: { projectId: id }, select: { id: true } });
      return { label: `${p.name} · ${moneyCents(toCents(p.amount), p.currency)}`, data: { row: p, txIds: txIds.map((x) => x.id) } };
    }
    case "debt": {
      const d = await prisma.debt.findUnique({ where: { id } });
      return d
        ? { label: `${d.person}: ${d.direction === "i_owe" ? "le debés" : "te debe"} ${moneyCents(toCents(d.amount), d.currency)}`, data: { row: d } }
        : null;
    }
    case "goal": {
      const g = await prisma.savingsGoal.findUnique({ where: { id } });
      return g ? { label: `${g.name} · ${moneyCents(toCents(g.target), g.currency)}`, data: { row: g } } : null;
    }
    case "habit": {
      const h = await prisma.habit.findUnique({ where: { id }, include: { tracks: true, logs: true } });
      if (!h) return null;
      const { tracks, logs, ...row } = h;
      const blockIds = await prisma.planBlock.findMany({ where: { habitId: id }, select: { id: true } });
      return { label: `${h.name} (${logs.length} marcas)`, data: { row, tracks, logs, blockIds: blockIds.map((x) => x.id) } };
    }
    case "habitCategory": {
      const c = await prisma.habitCategory.findUnique({ where: { id } });
      if (!c) return null;
      const habitIds = await prisma.habit.findMany({ where: { categoryId: id }, select: { id: true } });
      return { label: c.name, data: { row: c, habitIds: habitIds.map((x) => x.id) } };
    }
    case "journal": {
      const e = await prisma.journalEntry.findUnique({ where: { id }, include: { attachments: true } });
      if (!e) return null;
      const { attachments, ...row } = e;
      const start = (e.title || e.body.trim().split(/\s+/).slice(0, 8).join(" ")) || (attachments.length ? "fotos" : "sin texto");
      return {
        label: `${formatShort(fromDbDate(e.date))}: ${start}${!e.title && e.body.length > 50 ? "…" : ""}`,
        data: { row, attachments },
      };
    }
    case "photo": {
      const a = await prisma.attachment.findUnique({
        where: { id },
        include: { journalEntry: { select: { date: true, title: true } }, transaction: { select: { title: true, date: true } } },
      });
      if (!a) return null;
      const { journalEntry, transaction, ...row } = a;
      if (journalEntry) {
        return { label: `Foto del journal (${formatShort(fromDbDate(journalEntry.date))}${journalEntry.title ? ` · ${journalEntry.title}` : ""})`, data: { row }, module: "journal" };
      }
      return {
        label: `Comprobante${transaction?.title ? ` de ${transaction.title}` : ""}${transaction ? ` (${formatShort(fromDbDate(transaction.date))})` : ""}`,
        data: { row },
        module: "gastos",
      };
    }
    case "block": {
      const b = await prisma.planBlock.findUnique({ where: { id } });
      return b ? { label: `${b.title} (${formatShort(fromDbDate(b.date))}${b.startTime ? ` ${b.startTime}` : ""})`, data: { row: b } } : null;
    }
    case "task": {
      const t = await prisma.planTask.findUnique({ where: { id }, include: { subtasks: true } });
      if (!t) return null;
      const { subtasks, ...row } = t;
      const blockIds = await prisma.planBlock.findMany({ where: { taskId: id }, select: { id: true } });
      return { label: t.title, data: { row, subtasks, blockIds: blockIds.map((x) => x.id) } };
    }
    case "keyResult": {
      const k = await prisma.planKeyResult.findUnique({ where: { id } });
      return k ? { label: k.title, data: { row: k } } : null;
    }
    case "objective": {
      const o = await prisma.planObjective.findUnique({ where: { id }, include: { keyResults: true } });
      if (!o) return null;
      const { keyResults, ...row } = o;
      return { label: `${o.title} (${o.year}, ${keyResults.length} resultados clave)`, data: { row, keyResults } };
    }
  }
}

async function remove(kind: TrashKind, id: string) {
  const del: Record<TrashKind, () => Promise<unknown>> = {
    transaction: () => prisma.transaction.deleteMany({ where: { id } }),
    account: () => prisma.account.deleteMany({ where: { id } }),
    category: () => prisma.category.deleteMany({ where: { id } }),
    template: () => prisma.txTemplate.deleteMany({ where: { id } }),
    schedule: () => prisma.scheduledTransaction.deleteMany({ where: { id } }),
    project: () => prisma.budgetProject.deleteMany({ where: { id } }),
    debt: () => prisma.debt.deleteMany({ where: { id } }),
    goal: () => prisma.savingsGoal.deleteMany({ where: { id } }),
    habit: () => prisma.habit.deleteMany({ where: { id } }),
    habitCategory: () => prisma.habitCategory.deleteMany({ where: { id } }),
    journal: () => prisma.journalEntry.deleteMany({ where: { id } }),
    block: () => prisma.planBlock.deleteMany({ where: { id } }),
    task: () => prisma.planTask.deleteMany({ where: { id } }),
    keyResult: () => prisma.planKeyResult.deleteMany({ where: { id } }),
    photo: () => prisma.attachment.deleteMany({ where: { id } }),
    objective: async () => {
      await prisma.planKeyResult.deleteMany({ where: { objectiveId: id } });
      await prisma.planObjective.deleteMany({ where: { id } });
    },
  };
  await del[kind]();
}

/** Manda algo a la papelera (foto + registro) y lo borra. */
export async function trashAndDelete(kind: TrashKind, id: string): Promise<boolean> {
  const snap = await snapshot(kind, id);
  if (!snap) return false;
  await prisma.trashItem.create({
    data: { kind, entityId: id, label: snap.label, module: snap.module ?? MODULE[kind], data: snap.data as unknown as Prisma.InputJsonValue },
  });
  await remove(kind, id);
  await logActivity("deleted", kind, id, snap.label);
  return true;
}

// ─── Restaurar ──────────────────────────────────────────────────────────────

const exists = {
  account: async (id: unknown) => typeof id === "string" && !!(await prisma.account.findUnique({ where: { id }, select: { id: true } })),
  category: async (id: unknown) => typeof id === "string" && !!(await prisma.category.findUnique({ where: { id }, select: { id: true } })),
  project: async (id: unknown) => typeof id === "string" && !!(await prisma.budgetProject.findUnique({ where: { id }, select: { id: true } })),
  schedule: async (id: unknown) =>
    typeof id === "string" && !!(await prisma.scheduledTransaction.findUnique({ where: { id }, select: { id: true } })),
  habitCategory: async (id: unknown) => typeof id === "string" && !!(await prisma.habitCategory.findUnique({ where: { id }, select: { id: true } })),
  planCategory: async (id: unknown) => typeof id === "string" && !!(await prisma.planCategory.findUnique({ where: { id }, select: { id: true } })),
  task: async (id: unknown) => typeof id === "string" && !!(await prisma.planTask.findUnique({ where: { id }, select: { id: true } })),
  habit: async (id: unknown) => typeof id === "string" && !!(await prisma.habit.findUnique({ where: { id }, select: { id: true } })),
  objective: async (id: unknown) => typeof id === "string" && !!(await prisma.planObjective.findUnique({ where: { id }, select: { id: true } })),
};

const ids = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);
/** Si lo que apuntaba ya no existe, queda en null (en vez de fallar). */
async function orNull(check: (id: unknown) => Promise<boolean>, v: unknown) {
  return (await check(v)) ? (v as string) : null;
}

/** Vuelve a crear lo borrado. Devuelve un error legible si no se puede. */
export async function restoreSnapshot(kind: TrashKind, data: Snap): Promise<string | null> {
  // Prisma acepta los strings ISO y los números en texto tal como quedaron en el JSON.
  // La foto es JSON: se recrea tal cual (mismos campos e id).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = data.row as any;
  switch (kind) {
    case "transaction": {
      if (!(await exists.account(row.accountId))) return "La cuenta de ese movimiento ya no existe: restaurá primero la cuenta.";
      if (row.toAccountId && !(await exists.account(row.toAccountId))) return "La cuenta de destino ya no existe.";
      // Si su categoría o su presupuesto puntual también están en la papelera, primero esos.
      for (const [field, kindName, what] of [
        ["categoryId", "category", "la categoría"],
        ["projectId", "project", "el presupuesto puntual"],
      ] as const) {
        const ref = row[field];
        if (ref && (await prisma.trashItem.findFirst({ where: { kind: kindName, entityId: ref }, select: { id: true } }))) {
          return `Restaurá primero ${what} (también está en la papelera), así el movimiento vuelve con ella.`;
        }
      }
      await prisma.transaction.create({
        data: {
          ...row,
          categoryId: await orNull(exists.category, row.categoryId),
          projectId: await orNull(exists.project, row.projectId),
          scheduleId: await orNull(exists.schedule, row.scheduleId),
        },
      });
      await restoreAttachments(data);
      return null;
    }
    case "account":
      await prisma.account.create({ data: row });
      return null;
    case "category": {
      await prisma.category.create({ data: row });
      await prisma.transaction.updateMany({ where: { id: { in: ids(data.txIds) } }, data: { categoryId: row.id } });
      await prisma.txTemplate.updateMany({ where: { id: { in: ids(data.tplIds) } }, data: { categoryId: row.id } });
      await prisma.scheduledTransaction.updateMany({ where: { id: { in: ids(data.schIds) } }, data: { categoryId: row.id } });
      if (data.budget) await prisma.categoryBudget.create({ data: data.budget as never }).catch(() => {});
      return null;
    }
    case "template":
      await prisma.txTemplate.create({
        data: {
          ...row,
          accountId: await orNull(exists.account, row.accountId),
          toAccountId: await orNull(exists.account, row.toAccountId),
          categoryId: await orNull(exists.category, row.categoryId),
        },
      });
      return null;
    case "schedule": {
      if (!(await exists.account(row.accountId))) return "La cuenta de ese recurrente ya no existe.";
      await prisma.scheduledTransaction.create({
        data: {
          ...row,
          toAccountId: await orNull(exists.account, row.toAccountId),
          categoryId: await orNull(exists.category, row.categoryId),
        },
      });
      await prisma.transaction.updateMany({ where: { id: { in: ids(data.txIds) } }, data: { scheduleId: row.id } });
      return null;
    }
    case "project":
      await prisma.budgetProject.create({ data: row });
      await prisma.transaction.updateMany({ where: { id: { in: ids(data.txIds) } }, data: { projectId: row.id } });
      return null;
    case "debt":
      await prisma.debt.create({ data: row });
      return null;
    case "goal":
      await prisma.savingsGoal.create({ data: { ...row, accountId: await orNull(exists.account, row.accountId) } });
      return null;
    case "habit": {
      await prisma.habit.create({ data: { ...row, categoryId: await orNull(exists.habitCategory, row.categoryId) } });
      const tracks = (data.tracks as never[]) ?? [];
      if (tracks.length) await prisma.habitTrack.createMany({ data: tracks });
      const logs = (data.logs as never[]) ?? [];
      for (let i = 0; i < logs.length; i += 1000) await prisma.habitLog.createMany({ data: logs.slice(i, i + 1000), skipDuplicates: true });
      await prisma.planBlock.updateMany({ where: { id: { in: ids(data.blockIds) } }, data: { habitId: row.id } });
      return null;
    }
    case "habitCategory":
      await prisma.habitCategory.create({ data: row });
      await prisma.habit.updateMany({ where: { id: { in: ids(data.habitIds) } }, data: { categoryId: row.id } });
      return null;
    case "journal":
      await prisma.journalEntry.create({ data: row });
      await restoreAttachments(data);
      return null;
    case "photo": {
      if (row.journalEntryId && !(await prisma.journalEntry.findUnique({ where: { id: row.journalEntryId }, select: { id: true } }))) {
        return "La entrada de esa foto ya no existe: restaurá primero la entrada.";
      }
      if (row.transactionId && !(await prisma.transaction.findUnique({ where: { id: row.transactionId }, select: { id: true } }))) {
        return "El movimiento de ese comprobante ya no existe: restaurá primero el movimiento.";
      }
      await prisma.attachment.create({ data: row });
      return null;
    }
    case "block": {
      const b = await prisma.planBlock.create({
        data: {
          ...row,
          categoryId: await orNull(exists.planCategory, row.categoryId),
          taskId: await orNull(exists.task, row.taskId),
          habitId: await orNull(exists.habit, row.habitId),
        },
      });
      // Al borrarlo se le sacó la marca al hábito vinculado: vuelve con el bloque.
      if (b.done && b.habitId) {
        const h = await prisma.habit.findUnique({ where: { id: b.habitId }, select: { target: true } });
        const key = { habitId_date: { habitId: b.habitId, date: b.date } };
        await prisma.habitLog.upsert({
          where: key,
          create: { habitId: b.habitId, date: b.date, status: "done", value: h?.target ?? 1, source: "app" },
          update: { status: "done", value: h?.target ?? 1, source: "app" },
        });
      }
      return null;
    }
    case "task":
      await prisma.planTask.create({ data: { ...row, categoryId: await orNull(exists.planCategory, row.categoryId) } });
      const subtasks = (data.subtasks as never[]) ?? [];
      if (subtasks.length) await prisma.planSubtask.createMany({ data: subtasks });
      await prisma.planBlock.updateMany({ where: { id: { in: ids(data.blockIds) } }, data: { taskId: row.id } });
      return null;
    case "keyResult":
      await prisma.planKeyResult.create({ data: { ...row, objectiveId: await orNull(exists.objective, row.objectiveId) } });
      return null;
    case "objective": {
      await prisma.planObjective.create({ data: row });
      const krs = (data.keyResults as never[]) ?? [];
      if (krs.length) await prisma.planKeyResult.createMany({ data: krs, skipDuplicates: true });
      return null;
    }
  }
}

/** Las fotos de una entrada o un movimiento vuelven con él. */
async function restoreAttachments(data: Snap) {
  const list = Array.isArray(data.attachments) ? (data.attachments as never[]) : [];
  if (list.length) await prisma.attachment.createMany({ data: list, skipDuplicates: true });
}

/** Los archivos de fotos que guarda un elemento de la papelera. */
function filesOf(kind: string, data: unknown): string[] {
  const d = (data ?? {}) as Snap;
  const files = Array.isArray(d.attachments) ? (d.attachments as { pathname?: string }[]).map((a) => a.pathname ?? "") : [];
  if (kind === "photo" && typeof d.row?.pathname === "string") files.push(d.row.pathname);
  return files.filter(Boolean);
}

/** Borra para siempre elementos de la papelera, con sus archivos de fotos. */
export async function purgeTrash(where: Prisma.TrashItemWhereInput) {
  const items = await prisma.trashItem.findMany({ where, select: { id: true, kind: true, data: true } });
  await deletePhotoFiles(items.flatMap((i) => filesOf(i.kind, i.data)));
  await prisma.trashItem.deleteMany({ where: { id: { in: items.map((i) => i.id) } } });
  return items.length;
}

/** Lo que lleva más de 30 días en la papelera se borra para siempre. */
export async function purgeOldTrash() {
  await purgeTrash({ deletedAt: { lt: new Date(Date.now() - 30 * 86_400_000) } });
}
