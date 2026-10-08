"use client";

import { addDays } from "../dates";
import type { BlockDTO } from "../plan-logic";
import { queuedField, type QueuedOp } from "./queue";

/**
 * Los bloques como van a quedar cuando se suba lo hecho sin conexión: se aplican
 * en orden las acciones pendientes del Plan sobre lo que mandó el servidor.
 */
export function applyPendingBlocks(blocks: BlockDTO[], ops: QueuedOp[]): BlockDTO[] {
  const plan = ops.filter((o) => o.name.startsWith("plan."));
  if (!plan.length) return blocks;
  let list = blocks.map((b) => ({ ...b }));
  const patch = (id: unknown, p: Partial<BlockDTO>) => {
    list = list.map((b) => (b.id === id ? { ...b, ...p } : b));
  };
  for (const op of plan) {
    const a = op.args;
    switch (op.name) {
      case "plan.setBlockDone":
        patch(a[0], { done: !!a[1] });
        break;
      case "plan.renameBlock":
        patch(a[0], { title: String(a[1]) });
        break;
      case "plan.rescheduleBlock":
        patch(a[0], { date: String(a[1]), startTime: (a[2] as string) || null, endTime: a[2] ? (a[3] as string) || null : null });
        break;
      case "plan.moveBlock": {
        const p: Partial<BlockDTO> = { date: String(a[1]) };
        if (a[2] !== undefined) p.startTime = (a[2] as string) || null;
        if (typeof a[3] === "number") p.sortKey = a[3];
        patch(a[0], p);
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
        if (b) list.push({ ...b, id: `pendiente-${op.id}`, done: false, sortKey: b.startTime ? null : (b.sortKey ?? -1) + 0.01 });
        break;
      }
      case "plan.saveBlock": {
        const fd = a[0];
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
        if (id) patch(id, p);
        else if (p.title && p.date) list.push({ id: `pendiente-${op.id}`, done: false, sortKey: null, ...p } as BlockDTO);
        break;
      }
    }
  }
  return list;
}
