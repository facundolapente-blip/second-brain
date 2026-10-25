import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { fromDbDate, formatShort } from "./dates";
import { moneyCents } from "./format";
import { toCents } from "./finance-logic";
import { deletePhotoFiles } from "./photos";
import { noteHeading } from "./notes-logic";

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
  | "step"
  | "minorGoal"
  | "budgetLine"
  | "objective"
  | "photo"
  | "note";

export type Module = "gastos" | "habitos" | "journal" | "plan" | "notas";

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
  step: "plan",
  minorGoal: "plan",
  budgetLine: "gastos",
  objective: "plan",
  photo: "journal",
  note: "notas",
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
  keyResult: "Objetivo chico",
  step: "Tarea de un objetivo",
  minorGoal: "Otro objetivo",
  budgetLine: "Gasto fijo",
  objective: "Objetivo",
  photo: "Foto",
  note: "Nota",
};

// ─── Actividad ──────────────────────────────────────────────────────────────

/**
 * Registra algo en la actividad. Suelto, si falla no pasa nada; con `db` de una
 * transacción va adentro (sin `.catch`: un error en una transacción la deja inservible).
 */
export async function logActivity(
  action: string,
  kind: TrashKind | "import" | "checkin",
  entityId: string | null,
  label: string,
  db?: Prisma.TransactionClient,
) {
  const mod: Module | "datos" = kind === "import" ? "datos" : kind === "checkin" ? "habitos" : MODULE[kind];
  const data = { action, kind, entityId, label: label.slice(0, 200), module: mod };
  if (db) await db.activity.create({ data });
  else await prisma.activity.create({ data }).catch(() => {});
}

// ─── Fotos ──────────────────────────────────────────────────────────────────

/** Cliente de la base: el de siempre o el de una transacción. */
type Db = Prisma.TransactionClient;

type Snap = { row: Record<string, unknown>; [k: string]: unknown };
type Snapshot = { label: string; data: Snap; module?: Module };

const kindName: Record<string, string> = { expense: "Gasto", income: "Ingreso", transfer: "Transferencia" };

/** Junta la foto y una etiqueta legible. Null si ya no existe. */
async function snapshot(kind: TrashKind, id: string, db: Db): Promise<Snapshot | null> {
  switch (kind) {
    case "transaction": {
      const t = await db.transaction.findUnique({ where: { id }, include: { account: true, attachments: true } });
      if (!t) return null;
      const { account, attachments, ...row } = t;
      return {
        label: `${kindName[t.kind] ?? "Movimiento"} ${moneyCents(toCents(t.amount), account.currency)}${t.title ? ` · ${t.title}` : ""} (${account.name}, ${formatShort(fromDbDate(t.date))})`,
        data: { row, attachments },
      };
    }
    case "account": {
      const a = await db.account.findUnique({ where: { id } });
      return a ? { label: `${a.name} (${a.currency})`, data: { row: a } } : null;
    }
    case "category": {
      const c = await db.category.findUnique({ where: { id }, include: { budget: true } });
      if (!c) return null;
      const { budget, ...row } = c;
      const [txIds, tplIds, schIds] = await Promise.all([
        db.transaction.findMany({ where: { categoryId: id }, select: { id: true } }),
        db.txTemplate.findMany({ where: { categoryId: id }, select: { id: true } }),
        db.scheduledTransaction.findMany({ where: { categoryId: id }, select: { id: true } }),
      ]);
      return {
        label: `${c.name} (${txIds.length} movimientos)`,
        data: { row, budget, txIds: txIds.map((x) => x.id), tplIds: tplIds.map((x) => x.id), schIds: schIds.map((x) => x.id) },
      };
    }
    case "template": {
      const t = await db.txTemplate.findUnique({ where: { id } });
      return t ? { label: t.name, data: { row: t } } : null;
    }
    case "schedule": {
      const s = await db.scheduledTransaction.findUnique({ where: { id }, include: { account: true } });
      if (!s) return null;
      const { account, ...row } = s;
      const txIds = await db.transaction.findMany({ where: { scheduleId: id }, select: { id: true } });
      return {
        label: `${s.title ?? "Recurrente"} · ${moneyCents(toCents(s.amount), account.currency)}`,
        data: { row, txIds: txIds.map((x) => x.id) },
      };
    }
    case "project": {
      const p = await db.budgetProject.findUnique({ where: { id } });
      if (!p) return null;
      const txIds = await db.transaction.findMany({ where: { projectId: id }, select: { id: true } });
      return { label: `${p.name} · ${moneyCents(toCents(p.amount), p.currency)}`, data: { row: p, txIds: txIds.map((x) => x.id) } };
    }
    case "debt": {
      const d = await db.debt.findUnique({ where: { id } });
      return d
        ? { label: `${d.person}: ${d.direction === "i_owe" ? "le debés" : "te debe"} ${moneyCents(toCents(d.amount), d.currency)}`, data: { row: d } }
        : null;
    }
    case "goal": {
      const g = await db.savingsGoal.findUnique({ where: { id } });
      return g ? { label: `${g.name} · ${moneyCents(toCents(g.target), g.currency)}`, data: { row: g } } : null;
    }
    case "habit": {
      const h = await db.habit.findUnique({ where: { id }, include: { tracks: true, logs: true } });
      if (!h) return null;
      const { tracks, logs, ...row } = h;
      return { label: `${h.name} (${logs.length} marcas)`, data: { row, tracks, logs } };
    }
    case "habitCategory": {
      const c = await db.habitCategory.findUnique({ where: { id } });
      if (!c) return null;
      const habitIds = await db.habit.findMany({ where: { categoryId: id }, select: { id: true } });
      return { label: c.name, data: { row: c, habitIds: habitIds.map((x) => x.id) } };
    }
    case "journal": {
      const e = await db.journalEntry.findUnique({ where: { id }, include: { attachments: true } });
      if (!e) return null;
      const { attachments, ...row } = e;
      const start = (e.title || e.body.trim().split(/\s+/).slice(0, 8).join(" ")) || (attachments.length ? "fotos" : "sin texto");
      return {
        label: `${formatShort(fromDbDate(e.date))}: ${start}${!e.title && e.body.length > 50 ? "…" : ""}`,
        data: { row, attachments },
      };
    }
    case "photo": {
      const a = await db.attachment.findUnique({
        where: { id },
        include: {
          journalEntry: { select: { date: true, title: true } },
          transaction: { select: { title: true, date: true } },
          note: { select: { title: true, body: true, url: true } },
        },
      });
      if (!a) return null;
      const { journalEntry, transaction, note, ...row } = a;
      if (note) return { label: `Foto de una nota (${noteHeading(note)})`, data: { row }, module: "notas" };
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
      const b = await db.planBlock.findUnique({ where: { id } });
      return b ? { label: `${b.title} (${formatShort(fromDbDate(b.date))}${b.startTime ? ` ${b.startTime}` : ""})`, data: { row: b } } : null;
    }
    case "task": {
      const t = await db.planTask.findUnique({ where: { id }, include: { subtasks: true } });
      if (!t) return null;
      const { subtasks, ...row } = t;
      const blockIds = await db.planBlock.findMany({ where: { taskId: id }, select: { id: true } });
      return { label: t.title, data: { row, subtasks, blockIds: blockIds.map((x) => x.id) } };
    }
    case "keyResult": {
      const k = await db.planKeyResult.findUnique({ where: { id } });
      if (!k) return null;
      // Lo que sale de él (objetivos más chicos, en orden: cada padre antes que sus hijos) y todas sus tareas.
      const below = await subtreeOf(db, id);
      const krIds = [id, ...below.map((x) => x.id)];
      const steps = await db.planStep.findMany({ where: { keyResultId: { in: krIds } } });
      const blockIds = await db.planBlock.findMany({ where: { keyResultId: { in: krIds } }, select: { id: true, keyResultId: true } });
      const extra = below.length ? ` y ${below.length} más chicos` : "";
      return { label: `${k.title}${extra}`, data: { row: k, below, steps, blockLinks: blockIds } };
    }
    case "step": {
      const st = await db.planStep.findUnique({ where: { id } });
      return st ? { label: st.title, data: { row: st } } : null;
    }
    case "minorGoal": {
      const g = await db.planMinorGoal.findUnique({ where: { id } });
      return g ? { label: g.title, data: { row: g } } : null;
    }
    case "budgetLine": {
      const l = await db.budgetLine.findUnique({ where: { id } });
      return l ? { label: l.name, data: { row: l } } : null;
    }
    case "note": {
      const n = await db.note.findUnique({ where: { id }, include: { attachments: true } });
      if (!n) return null;
      const { attachments, ...row } = n;
      return { label: noteHeading(n), data: { row, attachments } };
    }
    case "objective": {
      const o = await db.planObjective.findUnique({ where: { id }, include: { keyResults: true } });
      if (!o) return null;
      const { keyResults, ...row } = o;
      const krIds = keyResults.map((k) => k.id);
      const blockLinks = await db.planBlock.findMany({ where: { keyResultId: { in: krIds } }, select: { id: true, keyResultId: true } });
      const steps = await db.planStep.findMany({ where: { keyResultId: { in: krIds } } });
      // Padres antes que hijos, así se pueden volver a crear en orden.
      const ordered = parentsFirst(keyResults);
      return { label: `${o.title} (${o.year}, ${keyResults.length} objetivos chicos)`, data: { row, keyResults: ordered, blockLinks, steps } };
    }
  }
}

async function remove(kind: TrashKind, id: string, db: Db) {
  const del: Record<TrashKind, () => Promise<unknown>> = {
    transaction: () => db.transaction.deleteMany({ where: { id } }),
    account: () => db.account.deleteMany({ where: { id } }),
    category: () => db.category.deleteMany({ where: { id } }),
    template: () => db.txTemplate.deleteMany({ where: { id } }),
    schedule: () => db.scheduledTransaction.deleteMany({ where: { id } }),
    project: () => db.budgetProject.deleteMany({ where: { id } }),
    debt: () => db.debt.deleteMany({ where: { id } }),
    goal: () => db.savingsGoal.deleteMany({ where: { id } }),
    habit: () => db.habit.deleteMany({ where: { id } }),
    habitCategory: () => db.habitCategory.deleteMany({ where: { id } }),
    journal: () => db.journalEntry.deleteMany({ where: { id } }),
    block: () => db.planBlock.deleteMany({ where: { id } }),
    task: () => db.planTask.deleteMany({ where: { id } }),
    keyResult: async () => {
      // Se va con todo lo que sale de él (sus tareas se borran en cascada).
      const below = await subtreeOf(db, id);
      await db.planKeyResult.deleteMany({ where: { id: { in: [...below.map((x) => x.id).reverse(), id] } } });
    },
    step: () => db.planStep.deleteMany({ where: { id } }),
    minorGoal: () => db.planMinorGoal.deleteMany({ where: { id } }),
    budgetLine: () => db.budgetLine.deleteMany({ where: { id } }),
    photo: () => db.attachment.deleteMany({ where: { id } }),
    note: () => db.note.deleteMany({ where: { id } }),
    objective: async () => {
      await db.planKeyResult.deleteMany({ where: { objectiveId: id } });
      await db.planObjective.deleteMany({ where: { id } });
    },
  };
  await del[kind]();
}

/**
 * Manda algo a la papelera (foto + registro) y lo borra, todo en una transacción:
 * no puede quedar borrado sin su foto en la papelera, ni en la papelera sin borrar.
 * (Los archivos de fotos siguen en el almacén hasta que se vacía la papelera.)
 */
export async function trashAndDelete(kind: TrashKind, id: string): Promise<boolean> {
  return prisma.$transaction(
    async (tx) => {
      const snap = await snapshot(kind, id, tx);
      if (!snap) return false;
      await tx.trashItem.create({
        data: { kind, entityId: id, label: snap.label, module: snap.module ?? MODULE[kind], data: snap.data as unknown as Prisma.InputJsonValue },
      });
      await remove(kind, id, tx);
      await logActivity("deleted", kind, id, snap.label, tx);
      return true;
    },
    { maxWait: 10_000, timeout: 60_000 },
  );
}

// ─── Restaurar ──────────────────────────────────────────────────────────────

const existsIn = (db: Db) => ({
  account: async (id: unknown) => typeof id === "string" && !!(await db.account.findUnique({ where: { id }, select: { id: true } })),
  category: async (id: unknown) => typeof id === "string" && !!(await db.category.findUnique({ where: { id }, select: { id: true } })),
  project: async (id: unknown) => typeof id === "string" && !!(await db.budgetProject.findUnique({ where: { id }, select: { id: true } })),
  schedule: async (id: unknown) =>
    typeof id === "string" && !!(await db.scheduledTransaction.findUnique({ where: { id }, select: { id: true } })),
  habitCategory: async (id: unknown) => typeof id === "string" && !!(await db.habitCategory.findUnique({ where: { id }, select: { id: true } })),
  planCategory: async (id: unknown) => typeof id === "string" && !!(await db.planCategory.findUnique({ where: { id }, select: { id: true } })),
  task: async (id: unknown) => typeof id === "string" && !!(await db.planTask.findUnique({ where: { id }, select: { id: true } })),
  habit: async (id: unknown) => typeof id === "string" && !!(await db.habit.findUnique({ where: { id }, select: { id: true } })),
  objective: async (id: unknown) => typeof id === "string" && !!(await db.planObjective.findUnique({ where: { id }, select: { id: true } })),
  keyResult: async (id: unknown) => typeof id === "string" && !!(await db.planKeyResult.findUnique({ where: { id }, select: { id: true } })),
  block: async (id: unknown) => typeof id === "string" && !!(await db.planBlock.findUnique({ where: { id }, select: { id: true } })),
});

/** Lo que sale de un objetivo chico (hijos, nietos…), cada padre antes que sus hijos. */
async function subtreeOf(db: Db, id: string) {
  const out: { id: string }[] = [];
  const seen = new Set([id]);
  let level = [id];
  while (level.length) {
    const next = await db.planKeyResult.findMany({ where: { parentId: { in: level } } });
    const fresh = next.filter((k) => !seen.has(k.id));
    for (const k of fresh) seen.add(k.id);
    out.push(...fresh);
    level = fresh.map((k) => k.id);
  }
  return out as Awaited<ReturnType<typeof db.planKeyResult.findMany>>;
}

/** Ordena para crear: cada objetivo chico después de su padre. */
function parentsFirst<T extends { id: string; parentId: string | null }>(list: T[]): T[] {
  const ids = new Set(list.map((k) => k.id));
  const out: T[] = [];
  const placed = new Set<string>();
  let rest = [...list];
  while (rest.length) {
    const ready = rest.filter((k) => !k.parentId || !ids.has(k.parentId) || placed.has(k.parentId));
    if (!ready.length) {
      out.push(...rest.map((k) => ({ ...k, parentId: null })));
      break;
    }
    for (const k of ready) placed.add(k.id);
    out.push(...ready);
    rest = rest.filter((k) => !placed.has(k.id));
  }
  return out;
}

/** Las tareas vuelven con su objetivo chico (agendadas solo si su bloque sigue y está libre). */
async function restoreSteps(data: Snap, db: Db) {
  const steps = Array.isArray(data.steps) ? (data.steps as { blockId?: string | null }[]) : [];
  for (const st of steps) {
    const blockId = st.blockId && !(await db.planStep.findFirst({ where: { blockId: st.blockId } })) && (await db.planBlock.findUnique({ where: { id: st.blockId }, select: { id: true } })) ? st.blockId : null;
    await db.planStep.create({ data: { ...(st as Record<string, unknown>), blockId } as never });
  }
}

/** Los bloques del Plan que estaban atados vuelven a atarse (si nadie los ató a otra cosa). */
async function relinkBlocks(data: Snap, db: Db) {
  const links = Array.isArray(data.blockLinks) ? (data.blockLinks as { id: string; keyResultId: string | null }[]) : [];
  for (const l of links) if (l.keyResultId) await db.planBlock.updateMany({ where: { id: l.id, keyResultId: null }, data: { keyResultId: l.keyResultId } });
}

const ids = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);
/** Si lo que apuntaba ya no existe, queda en null (en vez de fallar). */
async function orNull(check: (id: unknown) => Promise<boolean>, v: unknown) {
  return (await check(v)) ? (v as string) : null;
}

/**
 * Vuelve a crear lo borrado. Devuelve un error legible si no se puede. Con `db`
 * de una transacción (`restoreItem`) es todo o nada: no queda a medias.
 */
export async function restoreSnapshot(kind: TrashKind, data: Snap, db: Db = prisma): Promise<string | null> {
  const exists = existsIn(db);
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
        if (ref && (await db.trashItem.findFirst({ where: { kind: kindName, entityId: ref }, select: { id: true } }))) {
          return `Restaurá primero ${what} (también está en la papelera), así el movimiento vuelve con ella.`;
        }
      }
      await db.transaction.create({
        data: {
          ...row,
          categoryId: await orNull(exists.category, row.categoryId),
          projectId: await orNull(exists.project, row.projectId),
          scheduleId: await orNull(exists.schedule, row.scheduleId),
        },
      });
      await restoreAttachments(data, db);
      return null;
    }
    case "account":
      await db.account.create({ data: row });
      return null;
    case "category": {
      await db.category.create({ data: row });
      await db.transaction.updateMany({ where: { id: { in: ids(data.txIds) } }, data: { categoryId: row.id } });
      await db.txTemplate.updateMany({ where: { id: { in: ids(data.tplIds) } }, data: { categoryId: row.id } });
      await db.scheduledTransaction.updateMany({ where: { id: { in: ids(data.schIds) } }, data: { categoryId: row.id } });
      // Sin `.catch`: dentro de una transacción un error la deja inservible; si ya hay uno, no se pisa.
      if (data.budget) await db.categoryBudget.createMany({ data: [data.budget as never], skipDuplicates: true });
      return null;
    }
    case "template":
      await db.txTemplate.create({
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
      await db.scheduledTransaction.create({
        data: {
          ...row,
          toAccountId: await orNull(exists.account, row.toAccountId),
          categoryId: await orNull(exists.category, row.categoryId),
        },
      });
      await db.transaction.updateMany({ where: { id: { in: ids(data.txIds) } }, data: { scheduleId: row.id } });
      return null;
    }
    case "project":
      await db.budgetProject.create({ data: row });
      await db.transaction.updateMany({ where: { id: { in: ids(data.txIds) } }, data: { projectId: row.id } });
      return null;
    case "debt":
      await db.debt.create({ data: row });
      return null;
    case "goal":
      await db.savingsGoal.create({ data: { ...row, accountId: await orNull(exists.account, row.accountId) } });
      return null;
    case "habit": {
      await db.habit.create({ data: { ...row, categoryId: await orNull(exists.habitCategory, row.categoryId) } });
      const tracks = (data.tracks as never[]) ?? [];
      if (tracks.length) await db.habitTrack.createMany({ data: tracks });
      const logs = (data.logs as never[]) ?? [];
      for (let i = 0; i < logs.length; i += 1000) await db.habitLog.createMany({ data: logs.slice(i, i + 1000), skipDuplicates: true });
      return null;
    }
    case "habitCategory":
      await db.habitCategory.create({ data: row });
      await db.habit.updateMany({ where: { id: { in: ids(data.habitIds) } }, data: { categoryId: row.id } });
      return null;
    case "journal":
      await db.journalEntry.create({ data: row });
      await restoreAttachments(data, db);
      return null;
    case "photo": {
      if (row.journalEntryId && !(await db.journalEntry.findUnique({ where: { id: row.journalEntryId }, select: { id: true } }))) {
        return "La entrada de esa foto ya no existe: restaurá primero la entrada.";
      }
      if (row.transactionId && !(await db.transaction.findUnique({ where: { id: row.transactionId }, select: { id: true } }))) {
        return "El movimiento de ese comprobante ya no existe: restaurá primero el movimiento.";
      }
      if (row.noteId && !(await db.note.findUnique({ where: { id: row.noteId }, select: { id: true } }))) {
        return "La nota de esa foto ya no existe: restaurá primero la nota.";
      }
      await db.attachment.create({ data: row });
      return null;
    }
    case "block": {
      await db.planBlock.create({
        data: {
          ...row,
          categoryId: await orNull(exists.planCategory, row.categoryId),
          taskId: await orNull(exists.task, row.taskId),
          keyResultId: await orNull(exists.keyResult, row.keyResultId),
          // Los bloques ya no se vinculan con hábitos.
          habitId: null,
        },
      });
      return null;
    }
    case "task":
      await db.planTask.create({ data: { ...row, categoryId: await orNull(exists.planCategory, row.categoryId) } });
      const subtasks = (data.subtasks as never[]) ?? [];
      if (subtasks.length) await db.planSubtask.createMany({ data: subtasks });
      await db.planBlock.updateMany({ where: { id: { in: ids(data.blockIds) } }, data: { taskId: row.id } });
      return null;
    case "keyResult": {
      await db.planKeyResult.create({
        data: { ...row, objectiveId: await orNull(exists.objective, row.objectiveId), parentId: await orNull(exists.keyResult, row.parentId) },
      });
      const below = Array.isArray(data.below) ? (data.below as never[]) : [];
      for (const b of below) await db.planKeyResult.create({ data: b });
      await restoreSteps(data, db);
      await relinkBlocks(data, db);
      return null;
    }
    case "step": {
      if (!(await exists.keyResult(row.keyResultId))) return "El objetivo de esa tarea ya no existe: restauralo primero.";
      const blockId = row.blockId && !(await db.planStep.findFirst({ where: { blockId: row.blockId } })) ? await orNull(exists.block, row.blockId) : null;
      await db.planStep.create({ data: { ...row, blockId } });
      return null;
    }
    case "minorGoal":
      await db.planMinorGoal.create({ data: row });
      return null;
    case "budgetLine":
      await db.budgetLine.create({ data: row });
      return null;
    case "note":
      await db.note.create({ data: row });
      await restoreAttachments(data, db);
      return null;
    case "objective": {
      await db.planObjective.create({ data: row });
      const krs = (data.keyResults as never[]) ?? [];
      for (const k of krs) await db.planKeyResult.create({ data: k });
      await restoreSteps(data, db);
      await relinkBlocks(data, db);
      return null;
    }
  }
}

/** Las fotos de una entrada o un movimiento vuelven con él. */
async function restoreAttachments(data: Snap, db: Db) {
  const list = Array.isArray(data.attachments) ? (data.attachments as never[]) : [];
  if (list.length) await db.attachment.createMany({ data: list, skipDuplicates: true });
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
