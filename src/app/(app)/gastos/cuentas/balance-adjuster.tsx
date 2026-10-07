"use client";

import { useSafeTransition } from "@/components/safe-action";
import { useState } from "react";
import { Scales } from "@phosphor-icons/react";
import { adjustBalance } from "@/lib/finance-actions";
import { todayISO } from "@/lib/dates";
import { currencySymbol, moneyCents } from "@/lib/format";
import { Button, Field, Input } from "@/components/ui";

/**
 * Cuadrar el saldo con el real (el del banco o la otra app): crea un "Ajuste de
 * saldo" por la diferencia. Con una fecha vieja sirve para arreglar meses
 * pasados (por ejemplo, con el saldo de un resumen del banco).
 */
export function BalanceAdjuster({
  accountId,
  currency,
  balanceCents,
  onDone,
}: {
  accountId: string;
  currency: string;
  balanceCents: number;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [real, setReal] = useState("");
  const [date, setDate] = useState(todayISO());
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useSafeTransition();

  if (!open) {
    return (
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <Scales size={16} aria-hidden /> Ajustar saldo
      </Button>
    );
  }
  return (
    <div className="grid gap-3 rounded-2xl border border-line bg-surface-2 p-4">
      <div className="grid gap-1">
        <p className="text-[14px] font-medium">Ajustar saldo</p>
        <p className="text-[12.5px] leading-relaxed text-muted">
          Hoy la app dice {moneyCents(balanceCents, currency)}. Poné el saldo real de ese día y se crea un ajuste por la
          diferencia (no cuenta como gasto ni ingreso). Con una fecha vieja arreglás meses pasados.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Saldo real (${currencySymbol(currency)})`}>
          <Input inputMode="decimal" autoFocus value={real} onChange={(e) => setReal(e.target.value)} placeholder="0" />
        </Field>
        <Field label="Día">
          <Input type="date" value={date} max={todayISO()} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </Field>
      </div>
      {error && <p className="text-[13px] text-danger">{error}</p>}
      <div className="flex gap-2">
        <Button
          type="button"
          disabled={pending || !real.trim()}
          className="flex-1"
          onClick={() =>
            start(async () => {
              const r = await adjustBalance(accountId, real, date);
              if (r.ok) {
                setOpen(false);
                onDone();
              } else setError(r.error);
            })
          }
        >
          {pending ? "Ajustando…" : "Ajustar"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
