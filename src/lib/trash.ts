import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { fromDbDate, formatShort } from "./dates";
import { moneyCents } from "./format";
import { toCents } from "./finance-logic";

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
  | "keyResult";

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
};

// ─── Actividad ──────────────────────────────────────────────────────────────

export async function logActivity(action: string, kind: TrashKind | "import" | "checkin", entityId: string | null, label: string) {
  const mod: Module | "datos" = kind === "import" ? "datos" : kind === "checkin" ? "habitos" : MODULE[kind];
  await prisma.activity.create({ data: { action, kind, entityId, label: label.slice(0, 200), module: mod } }).catch(() => {});
}

// ─── Fotos ──────────────────────────────────────────────────────────────────

type Snap = { row: Record<string, unknown>; [k: string]: unknown };

const kindName: Record<string, string> = { expense: "Gasto", income: "Ingreso", transfer: "Transferencia" };

/** Junta la foto y una etiqueta legible. Null si ya no existe. */
async function snapshot(kind: TrashKind, id: string): Promise<{ label: string; data: Snap } | null> {
  switch (kind) {
    case "transaction": {
      const t = await prisma.transaction.findUnique({ where: { id }, include: { account: true } });
      if (!t) return null;
      const { account, ...row } = t;
      return {
        label: `${kindName[t.kind] ?? "Movimiento"} ${moneyCents(toCents(t.amount), account.currency)}${t.title ? ` · ${t.title}` : ""} (${account.name}, ${formatShort(fromDbDate(t.date))})`,
        data: { row },
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
      const e = await prisma.journalEntry.findUnique({ where: { id } });
      if (!e) return null;
      const start = (e.title || e.body.trim().split(/\s+/).slice(0, 8).join(" ")) || "sin texto";
      return { label: `${formatShort(fromDbDate(e.date))}: ${start}${!e.title && e.body.length > 50 ? "…" : ""}`, data: { row: e } };
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
  };
  await del[kind]();
}

/** Manda algo a la papelera (foto + registro) y lo borra. */
export async function trashAndDelete(kind: TrashKind, id: string): Promise<boolean> {
  const snap = await snapshot(kind, id);
  if (!snap) return false;
  await prisma.trashItem.create({
    data: { kind, entityId: id, label: snap.label, module: MODULE[kind], data: snap.data as unknown as Prisma.InputJsonValue },
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
      return null;
    case "block":
      await prisma.planBlock.create({
        data: {
          ...row,
          categoryId: await orNull(exists.planCategory, row.categoryId),
          taskId: await orNull(exists.task, row.taskId),
          habitId: await orNull(exists.habit, row.habitId),
        },
      });
      return null;
    case "task":
      await prisma.planTask.create({ data: { ...row, categoryId: await orNull(exists.planCategory, row.categoryId) } });
      const subtasks = (data.subtasks as never[]) ?? [];
      if (subtasks.length) await prisma.planSubtask.createMany({ data: subtasks });
      await prisma.planBlock.updateMany({ where: { id: { in: ids(data.blockIds) } }, data: { taskId: row.id } });
      return null;
    case "keyResult":
      await prisma.planKeyResult.create({ data: { ...row, objectiveId: await orNull(exists.objective, row.objectiveId) } });
      return null;
  }
}

/** Lo que lleva más de 30 días en la papelera se borra para siempre. */
export async function purgeOldTrash() {
  await prisma.trashItem.deleteMany({ where: { deletedAt: { lt: new Date(Date.now() - 30 * 86_400_000) } } });
}
