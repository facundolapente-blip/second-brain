"use client";

import { useState } from "react";
import { CaretDown, CloudArrowUp } from "@phosphor-icons/react";
import { parseAmount, type TxDTO, type TxKind } from "@/lib/finance-logic";
import { moneyCents } from "@/lib/format";
import { queuedField, usePendingActions, type QueuedOp } from "@/lib/offline/queue";
import { cx } from "@/components/ui";

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

/**
 * Los movimientos nuevos cargados sin señal, como filas para la lista (se ven en su
 * día con "En el aparato, sin subir"). Se arman con lo que quedó en la cola.
 */
export function useQueuedTxs(): TxDTO[] {
  const ops = usePendingActions();
  const out: TxDTO[] = [];
  for (const op of ops) {
    if (op.name !== "finance.saveTransaction") continue;
    const fd = op.args[1] ?? op.args[0];
    const f = (n: string) => queuedField(fd, n);
    if (f("id")) continue; // un cambio a uno que ya existe: aparece al subir
    const amount = parseAmount(f("amount") ?? "");
    const kind = f("kind") as TxKind | null;
    const accountId = f("accountId");
    const date = f("date");
    if (!amount || !kind || !accountId || !date) continue;
    const transfer = kind === "transfer";
    out.push({
      id: `cola-${op.id}`,
      kind,
      date,
      title: f("title")?.trim() || null,
      amountCents: amount,
      accountId,
      categoryId: transfer ? null : f("categoryId") || null,
      toAccountId: transfer ? f("toAccountId") || null : null,
      toAmountCents: transfer ? (parseAmount(f("toAmount") ?? "") ?? amount) : null,
      note: f("note")?.trim() || null,
      projectId: transfer ? null : f("projectId") || null,
      photos: [],
      installment: null,
    });
  }
  return out;
}

/**
 * Lo cargado sin conexión que todavía no subió: una píldora que flota (arriba a
 * la derecha en el celular, abajo en la compu) y no corre la pantalla. Tocarla
 * despliega la lista.
 */
export function PendingFinance() {
  const ops = usePendingActions();
  const [open, setOpen] = useState(false);
  const rows = ops.map((o) => ({ id: o.id, text: describe(o) })).filter((r) => r.text);
  if (!rows.length) return null;
  return (
    <section
      aria-label="Sin subir todavía"
      className="reveal fixed top-[calc(4.5rem+env(safe-area-inset-top))] right-4 z-20 grid max-w-[min(22rem,calc(100vw-2rem))] justify-items-end gap-1.5 print:hidden lg:top-auto lg:right-8 lg:bottom-6"
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="lift inline-flex h-9 items-center gap-1.5 rounded-full border border-line-strong bg-raised px-3 text-[12.5px] font-medium text-fg"
      >
        <CloudArrowUp size={15} aria-hidden />
        {rows.length === 1 ? "1 sin subir" : `${rows.length} sin subir`}
        <CaretDown size={11} weight="bold" aria-hidden className={cx("transition-transform duration-[var(--dur-quick)]", open && "rotate-180")} />
      </button>
      {open && (
        <div className="reveal grid gap-1.5 rounded-2xl border border-line bg-raised px-4 py-3 shadow-[var(--card-shadow)]">
          <p className="text-[12.5px] text-muted">Se suben solos cuando vuelva la señal.</p>
          <ul className="grid gap-1">
            {rows.map((r) => (
              <li key={r.id} className="truncate text-[13.5px]">
                {r.text}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
