"use client";

import Link from "next/link";
import { useRef } from "react";
import { CaretDown, Check, Checks, GearSix } from "@phosphor-icons/react";
import { balanceByCurrency, type AccountDTO, type Selection } from "@/lib/finance-logic";
import { cx, Sheet, type SheetHandle } from "@/components/ui";
import { AccountAvatar, Balance, TotalsInline } from "./shared";

/** Nombre corto de lo que se está mirando. */
export function selectionLabel(accounts: AccountDTO[], sel: Selection): string {
  if (sel === null) return "Todas las cuentas";
  if (sel.length === 1) return accounts.find((a) => a.id === sel[0])?.name ?? "1 cuenta";
  return `${sel.length} cuentas`;
}

/**
 * Botón con las cuentas elegidas y su saldo; abre la lista para elegir una,
 * varias o todas (como el selector de la app de Facu, con diseño propio).
 */
export function AccountSwitcher({
  accounts,
  selection,
  onChange,
}: {
  accounts: AccountDTO[];
  selection: Selection;
  onChange: (s: Selection) => void;
}) {
  const sheet = useRef<SheetHandle>(null);
  const visible = accounts.filter((a) => !a.archived);
  const balance = balanceByCurrency(selection ? accounts : visible, selection);
  const chosen = selection ? accounts.filter((a) => selection.includes(a.id)) : visible;

  function toggle(id: string) {
    const current = selection ?? visible.map((a) => a.id);
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    if (next.length === 0) return; // siempre queda al menos una
    const all = visible.every((a) => next.includes(a.id));
    onChange(all ? null : next);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => sheet.current?.open()}
        aria-haspopup="dialog"
        className="grid w-full gap-1.5 rounded-card card px-3.5 py-3 text-left transition-colors hover:border-line-strong hover:bg-surface-2"
      >
        <span className="flex items-center gap-2 text-[13px] text-muted">
          <span className="flex shrink-0 -space-x-1.5" aria-hidden>
            {chosen.slice(0, 3).map((a) => (
              <span key={a.id} className="rounded-[8px] ring-2 ring-surface">
                <AccountAvatar account={a} size={20} />
              </span>
            ))}
          </span>
          <span className="truncate font-semibold text-fg">{selectionLabel(accounts, selection)}</span>
          <span className="ml-auto inline-flex shrink-0 items-center gap-1">
            Cambiar <CaretDown size={13} weight="bold" aria-hidden />
          </span>
        </span>
        <span className="grid gap-0.5">
          <span className="text-[12px] text-muted">Saldo actual</span>
          <TotalsInline totals={balance} align="start" balance className="text-[18px] font-extrabold tracking-tight" />
        </span>
      </button>

      <Sheet ref={sheet} title="Cuentas">
        <ul className="-mx-2 grid gap-0.5">
          {visible.map((a) => {
            const on = selection === null || selection.includes(a.id);
            return (
              <li key={a.id} className="flex items-center gap-1">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggle(a.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-[12px] px-2 py-2 text-left transition-colors hover:bg-surface-2"
                >
                  <span
                    className={cx(
                      "inline-flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                      on ? "border-accent bg-accent text-on-accent" : "border-line-strong",
                    )}
                  >
                    {on && <Check size={13} weight="bold" />}
                  </span>
                  <AccountAvatar account={a} size={34} />
                  <span className="grid min-w-0 flex-1">
                    <span className={cx("truncate text-[15px]", on && "font-semibold")}>{a.name}</span>
                    <span className="text-[12px] text-muted">{a.currency}</span>
                  </span>
                  <Balance cents={a.balanceCents} currency={a.currency} className="text-[14px] font-semibold" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onChange(visible.length === 1 ? null : [a.id]);
                    sheet.current?.close();
                  }}
                  className="h-11 shrink-0 rounded-md px-2.5 text-[13px] text-muted transition-colors hover:bg-surface-2 hover:text-fg"
                >
                  Solo esta
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3">
          <button
            type="button"
            onClick={() => onChange(null)}
            disabled={selection === null}
            className="inline-flex h-11 items-center gap-2 rounded-md px-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-surface-2 disabled:opacity-40"
          >
            <Checks size={18} weight="bold" /> Seleccionar todas
          </button>
          <Link
            href="/gastos/cuentas"
            className="inline-flex h-11 items-center gap-2 rounded-md px-2 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <GearSix size={18} /> Administrar
          </Link>
        </div>
      </Sheet>
    </>
  );
}
