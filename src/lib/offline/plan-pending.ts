"use client";

import { addDays, startOfWeek } from "../dates";
import type { BlockDTO, SortKeyPatch } from "../plan-logic";
import { queuedField, type QueuedOp } from "./queue";

const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/**
 * Id con el que se ve un bloque creado sin señal: el de la llamada (`opId`), que
 * el servidor sabe traducir al id de verdad cuando llega algo hecho sobre ese
 * bloque (tildarlo, moverlo) antes de que se suba (`blockId` en plan-actions).
 */
const pendingId = (op: QueuedOp) => `pendiente-${op.opId ?? op.id}`;

/** El FormData guardado entre los argumentos (las acciones de formulario reciben antes el estado). */
const formArg = (args: unknown[]) => args.find((x) => !!x && typeof x === "object" && "__fd" in x);

/**
 * Los bloques como van a quedar cuando se suba lo hecho sin conexión: se aplican
 * en orden las acciones pendientes del Plan sobre lo que mandó el servidor, con
 * las mismas reglas que el servidor (mover a otra hora conserva la duración y a
 * una semana posterior llega sin tildar).
 */
export function applyPendingBlocks(blocks: BlockDTO[], ops: QueuedOp[]): BlockDTO[] {
  const plan = ops.filter((o) => o.name.startsWith("plan."));
  if (!plan.length) return blocks;
  let list = blocks.map((b) => ({ ...b }));
  const patch = (id: unknown, p: Partial<BlockDTO>) => {
    list = list.map((b) => (b.id === id ? { ...b, ...p } : b));
  };
  const sortKeys = (others: unknown) => {
    if (!Array.isArray(others)) return;
    for (const [id, key] of others as SortKeyPatch[]) patch(id, { sortKey: key });
  };
  // Cambiar de semana hacia adelante destilda (como `changeWeek` en el servidor).
  const doneAfter = (b: BlockDTO, date: string) => (startOfWeek(date) > startOfWeek(b.date) ? false : b.done);
  for (const op of plan) {
    const a = op.args;
    switch (op.name) {
      case "plan.setBlockDone":
        patch(a[0], { done: !!a[1] });
        break;
      case "plan.renameBlock":
        patch(a[0], { title: String(a[1]) });
        break;
      case "plan.rescheduleBlock": {
        const b = list.find((x) => x.id === a[0]);
        if (b) patch(b.id, { date: String(a[1]), startTime: (a[2] as string) || null, endTime: a[2] ? (a[3] as string) || null : null, done: doneAfter(b, String(a[1])) });
        break;
      }
      case "plan.moveBlock": {
        const b = list.find((x) => x.id === a[0]);
        if (!b) break;
        const date = String(a[1]);
        const p: Partial<BlockDTO> = { date, done: doneAfter(b, date) };
        if (a[2] !== undefined && a[2] !== null && typeof a[2] === "string") {
          p.startTime = a[2];
          if (b.startTime && b.endTime) {
            const e = Math.min(23 * 60 + 59, mins(a[2]) + mins(b.endTime) - mins(b.startTime));
            p.endTime = e > mins(a[2]) ? hhmm(e) : null;
          }
        } else if (a[2] === null || a[2] === "") {
          p.startTime = null;
          p.endTime = null;
        }
        const untimed = !("startTime" in p ? p.startTime : b.startTime);
        if (typeof a[3] === "number" && untimed) p.sortKey = a[3];
        patch(b.id, p);
        if (untimed) sortKeys(a[4]);
        break;
      }
      case "plan.passToNextWeek": {
        const b = list.find((x) => x.id === a[0]);
        if (b) patch(b.id, { date: addDays(b.date, 7), done: false });
        break;
      }
      case "plan.deleteBlock":
        list = list.filter((b) => b.id !== a[0]);
        break;
      case "plan.duplicateBlock": {
        const b = list.find((x) => x.id === a[0]);
        if (b) list.push({ ...b, id: pendingId(op), done: false, sortKey: b.startTime ? null : (b.sortKey ?? -1) + 0.01 });
        break;
      }
      case "plan.scheduleTask": {
        const t = op.args;
        // Sin los datos de la tarea a mano: se ve con su nombre al subir; mientras, "Tarea agendada".
        list.push({
          id: pendingId(op),
          title: "Tarea agendada (sin subir)",
          categoryId: null,
          date: String(t[1]),
          startTime: (t[2] as string) || null,
          endTime: null,
          sortKey: typeof t[3] === "number" ? t[3] : null,
          priority: 0,
          done: false,
          place: null,
          notes: null,
          taskId: String(t[0]),
        });
        if (!t[2]) sortKeys(t[4]);
        break;
      }
      case "plan.saveBlock": {
        const fd = formArg(a);
        const id = queuedField(fd, "id");
        const start = queuedField(fd, "startTime") || null;
        const p: Partial<BlockDTO> = {
          title: queuedField(fd, "title") ?? "",
          date: queuedField(fd, "date") ?? "",
          startTime: start,
          endTime: start ? queuedField(fd, "endTime") || null : null,
          categoryId: queuedField(fd, "categoryId") || null,
          priority: Number(queuedField(fd, "priority") ?? 0) || 0,
          place: queuedField(fd, "place") || null,
          notes: queuedField(fd, "notes") || null,
          taskId: queuedField(fd, "taskId") || null,
        };
        if (id) {
          const b = list.find((x) => x.id === id);
          if (b) patch(id, { ...p, done: p.date && p.date !== b.date ? doneAfter(b, p.date) : b.done });
        } else if (p.title && p.date) list.push({ id: pendingId(op), done: false, sortKey: null, ...p } as BlockDTO);
        break;
      }
    }
  }
  return list;
}
