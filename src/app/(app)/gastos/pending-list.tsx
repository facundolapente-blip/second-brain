"use client";

import { CloudArrowUp } from "@phosphor-icons/react";
import { parseAmount } from "@/lib/finance-logic";
import { moneyCents } from "@/lib/format";
import { queuedField, usePendingActions, type QueuedOp } from "@/lib/offline/queue";

/** Cómo se lee una acción de Gastos pendiente ("Gasto $ 350 · Almuerzo"). */
function describe(op: QueuedOp): string | null {
  const a = op.args;
  switch (op.name) {
    case "finance.quickAdd":
      return `Carga rápida: ${String(a[0])}`;
    case "finance.saveTransaction": {
      const kind = queuedField(a[1] ?? a[0], "kind");
      const amount = parseAmount(queuedField(a[1] ?? a[0], "amount") ?? "");
      const title = queuedField(a[1] ?? a[0], "title");
      const id = queuedField(a[1] ?? a[0], "id");
      const what = kind === "income" ? "Ingreso" : kind === "transfer" ? "Transferencia" : "Gasto";
      return `${id ? "Cambios en " : ""}${what}${amount ? ` ${moneyCents(amount, "UYU").replace("$", "")}` : ""}${title ? ` · ${title}` : ""}`;
    }
    case "finance.deleteTransaction":
      return "Un movimiento borrado";
    case "finance.duplicateTransaction":
      return "Un movimiento duplicado";
    case "finance.renameTransaction":
      return `Título cambiado a "${String(a[1])}"`;
    default:
      return op.name.startsWith("finance.") ? "Otro cambio en Gastos" : null;
  }
}

/** Arriba de Movimientos: lo cargado sin conexión que todavía no subió. */
export function PendingFinance() {
  const ops = usePendingActions();
  const rows = ops.map((o) => ({ id: o.id, text: describe(o) })).filter((r) => r.text);
  if (!rows.length) return null;
  return (
    <section aria-label="Sin subir todavía" className="grid gap-1.5 rounded-2xl border border-dashed border-line-strong px-4 py-3">
      <p className="flex items-center gap-2 text-[13px] font-medium text-muted">
        <CloudArrowUp size={16} aria-hidden /> Sin subir todavía ({rows.length}): se suben solos cuando vuelva la señal
      </p>
      <ul className="grid gap-1">
        {rows.map((r) => (
          <li key={r.id} className="truncate text-[14px]">
            {r.text}
          </li>
        ))}
      </ul>
    </section>
  );
}
