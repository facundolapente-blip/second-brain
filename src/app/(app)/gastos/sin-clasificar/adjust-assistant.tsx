"use client";

import { useSafeTransition } from "@/components/safe-action";
import { useState } from "react";
import { ArrowsLeftRight, Scales } from "@phosphor-icons/react";
import { convertToTransfer, markAsAdjustment } from "@/lib/offline/finance";
import { formatShort } from "@/lib/dates";
import type { AccountDTO, TxDTO } from "@/lib/finance-logic";
import { Button, cx, inputClass } from "@/components/ui";
import { Amount, type Lookups } from "../shared";

/**
 * Movimientos sin título ni categoría: casi siempre son ajustes de saldo o
 * transferencias que la otra app no exportaba. Como ingresos inflan los
 * números; acá se marcan como ajuste (no cuentan) o se convierten en transferencia.
 */
export function AdjustAssistant({
  txs,
  accounts,
  lk,
  onDone,
}: {
  txs: TxDTO[];
  accounts: AccountDTO[];
  lk: Lookups;
  onDone: (ids: string[]) => void;
}) {
  const [pending, start] = useSafeTransition();
  const [transferFor, setTransferFor] = useState<string | null>(null);
  const [other, setOther] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (txs.length === 0) return null;

  function adjust(ids: string[]) {
    start(async () => {
      onDone(ids);
      await markAsAdjustment(ids);
    });
  }

  return (
    <section className="mb-6 grid gap-3 rounded-[20px] border border-line bg-surface p-4 lg:p-5" aria-label="Ajustes o transferencias">
      <div className="grid gap-1">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          <Scales size={17} aria-hidden /> ¿Ajustes o transferencias?
        </h2>
        <p className="text-[13.5px] leading-relaxed text-muted">
          Estos {txs.length} movimientos no tienen título ni categoría. Casi siempre son ajustes de saldo o plata que
          pasaste entre tus cuentas, y hoy cuentan como ingresos o gastos de verdad. Marcalos como ajuste (siguen moviendo el
          saldo, pero no cuentan en los números) o decí de qué cuenta vino la plata.
        </p>
      </div>
      <ul className="grid divide-y divide-line border-y border-line">
        {txs.map((t) => {
          const acc = lk.account(t.accountId);
          const same = accounts.filter((a) => a.id !== t.accountId && a.currency === acc?.currency && !a.archived);
          return (
            <li key={t.id} className="grid gap-2 py-2.5">
              <div className="flex items-center gap-3">
                <span className="grid min-w-0 flex-1">
                  <span className="text-[14px]">
                    {t.kind === "income" ? "Entró a" : "Salió de"} <strong className="font-medium">{acc?.name ?? "?"}</strong>
                  </span>
                  <span className="text-[12px] text-muted">{formatShort(t.date)}</span>
                </span>
                <Amount
                  cents={t.kind === "income" ? t.amountCents : -t.amountCents}
                  currency={acc?.currency ?? "UYU"}
                  className="font-mono text-[14px] font-medium"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" disabled={pending} onClick={() => adjust([t.id])}>
                  <Scales size={14} aria-hidden /> Ajuste de saldo
                </Button>
                {same.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => {
                      setTransferFor(transferFor === t.id ? null : t.id);
                      setOther(same[0].id);
                      setError(null);
                    }}
                  >
                    <ArrowsLeftRight size={14} aria-hidden /> Transferencia
                  </Button>
                )}
              </div>
              {transferFor === t.id && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-2 p-2.5">
                  <span className="text-[13px] text-muted">{t.kind === "income" ? "Vino desde" : "Fue hacia"}</span>
                  <select value={other} onChange={(e) => setOther(e.target.value)} className={cx(inputClass, "h-10 w-auto min-w-36 flex-1")}>
                    {same.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const r = await convertToTransfer(t.id, other);
                        if (r.ok) {
                          onDone([t.id]);
                          setTransferFor(null);
                        } else setError(r.error);
                      })
                    }
                  >
                    Convertir
                  </Button>
                  {error && <p className="w-full text-[12.5px] text-danger">{error}</p>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {txs.length > 1 && (
        <Button variant="outline" disabled={pending} onClick={() => adjust(txs.map((t) => t.id))}>
          Marcar los {txs.length} como ajuste
        </Button>
      )}
    </section>
  );
}
