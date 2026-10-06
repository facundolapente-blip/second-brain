"use client";

import Link from "next/link";
import { ArrowRight, Check } from "@phosphor-icons/react";
import { moneyCents } from "@/lib/format";
import { tone } from "@/lib/palette";
import {
  balanceByCurrency,
  flowOf,
  isSelected,
  sortedCurrencies,
  type AccountDTO,
  type Selection,
  type TxDTO,
} from "@/lib/finance-logic";
import { cx } from "@/components/ui";
import { AccountAvatar, Balance, type Lookups } from "./shared";

/**
 * Saldos de cada cuenta (panel lateral de la computadora). Tocar una cuenta la
 * deja como la única elegida; "Todas" vuelve a mirar todo.
 */
export function SideBalances({
  accounts,
  selection,
  onChange,
}: {
  accounts: AccountDTO[];
  selection: Selection;
  onChange: (s: Selection) => void;
}) {
  const visible = accounts.filter((a) => !a.archived);
  const total = balanceByCurrency(visible, null);
  const cur = sortedCurrencies(total);

  return (
    <section aria-label="Saldos" className="rounded-2xl border border-line bg-surface px-5 pt-4 pb-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Saldos</h2>
        {selection !== null && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="inline-flex min-h-9 items-center text-[13px] font-medium text-accent-fg hover:underline"
          >
            Ver todas
          </button>
        )}
      </div>
      <p className="pt-0.5 pb-2 text-[12.5px] text-muted">
        Total{" "}
        {cur.map((c, i) => (
          <span key={c}>
            {i > 0 && " y "}
            <Balance cents={total[c]} currency={c} className="font-mono text-fg" />
          </span>
        ))}
      </p>
      <ul className="border-t border-line">
        {visible.map((a) => {
          const on = selection !== null && isSelected(selection, a.id);
          return (
            <li key={a.id} className="border-b border-line last:border-b-0">
              <button
                type="button"
                onClick={() => onChange(on && selection?.length === 1 ? null : [a.id])}
                aria-pressed={on}
                title={on ? "Ver todas las cuentas" : `Ver solo ${a.name}`}
                className={cx(
                  "-mx-2 flex min-h-12 w-[calc(100%+1rem)] items-center gap-3 rounded-[6px] px-2 text-left transition-colors hover:bg-surface-2",
                  on && "bg-accent-soft hover:bg-accent-soft",
                )}
              >
                <AccountAvatar account={a} size={26} />
                <span className={cx("min-w-0 flex-1 truncate text-[14px]", on && "font-medium")}>{a.name}</span>
                {on && <Check size={14} weight="bold" className="text-accent-fg" aria-hidden />}
                <Balance cents={a.balanceCents} currency={a.currency} className="font-mono text-[13px]" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Gasto del mes por categoría, en la moneda principal: barras horizontales de
 * una sola serie (magnitud), ordenadas de mayor a menor, con el monto escrito
 * al final de cada una. Las chicas se juntan en "Otras".
 */
export function CategorySpend({
  txs,
  lk,
  month,
}: {
  txs: TxDTO[];
  lk: Lookups;
  month: string;
}) {
  const byCur: Record<string, Map<string | null, number>> = {};
  for (const t of txs) {
    const f = flowOf(t, lk.category);
    if (!f || f.kind !== "expense") continue;
    const c = lk.currencyOf(t.accountId);
    const m = (byCur[c] ??= new Map());
    m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + f.cents);
  }
  const curs = Object.keys(byCur).sort((a, b) => (a === "UYU" ? -1 : b === "UYU" ? 1 : a.localeCompare(b)));
  const cur = curs[0];
  const rows = cur
    ? [...byCur[cur].entries()].map(([id, cents]) => ({ id, cents })).sort((a, b) => b.cents - a.cents)
    : [];
  const total = rows.reduce((s, r) => s + r.cents, 0);
  const TOP = 6;
  const shown = rows.slice(0, TOP);
  const rest = rows.slice(TOP).reduce((s, r) => s + r.cents, 0);
  const max = Math.max(1, ...shown.map((r) => r.cents), rest);

  return (
    <section aria-label="Gasto por categoría" className="rounded-2xl border border-line bg-surface px-5 pt-4 pb-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Gasto por categoría</h2>
        {cur && <span className="font-mono text-[12px] text-muted tabular">{moneyCents(total, cur)}</span>}
      </div>
      {rows.length === 0 ? (
        <p className="py-4 text-[14px] text-muted">Sin gastos este mes en las cuentas elegidas.</p>
      ) : (
        <ul className="mt-3 grid gap-2.5">
          {shown.map((r) => {
            const cat = lk.category(r.id);
            return (
              <li key={r.id ?? "none"} className="grid gap-1">
                <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden
                      style={cat ? tone(cat.color) : undefined}
                      className={cx("size-2 shrink-0 rounded-full", cat ? "bg-tone-solid" : "bg-line-strong")}
                    />
                    <span className="truncate">{cat?.name ?? "Sin clasificar"}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[12.5px] tabular">
                    {moneyCents(r.cents, cur)}
                    <span className="ml-2 inline-block w-8 text-right text-muted">{Math.round((r.cents / total) * 100)}%</span>
                  </span>
                </div>
                <span className="block h-1.5">
                  <span
                    className="block h-full rounded-r-[3px] bg-[var(--fin-out)]"
                    style={{ width: `${Math.max(1.5, (r.cents / max) * 100)}%` }}
                  />
                </span>
              </li>
            );
          })}
          {rest > 0 && (
            <li className="grid gap-1">
              <div className="flex items-baseline justify-between gap-3 text-[13.5px] text-muted">
                <span>Otras ({rows.length - TOP})</span>
                <span className="font-mono text-[12.5px] tabular">
                  {moneyCents(rest, cur)}
                  <span className="ml-2 inline-block w-8 text-right">{Math.round((rest / total) * 100)}%</span>
                </span>
              </div>
              <span className="block h-1.5">
                <span
                  className="block h-full rounded-r-[3px] bg-[color-mix(in_oklab,var(--fin-out)_45%,var(--surface))]"
                  style={{ width: `${Math.max(1.5, (rest / max) * 100)}%` }}
                />
              </span>
            </li>
          )}
        </ul>
      )}
      {curs.length > 1 && (
        <p className="mt-3 text-[12.5px] text-muted">
          Solo {cur}. También hubo gastos en {curs.slice(1).join(", ")}.
        </p>
      )}
      <Link
        href={`/gastos/informes?mes=${month}`}
        className="mt-2 inline-flex min-h-11 items-center gap-1 text-[13px] font-medium text-accent-fg hover:underline"
      >
        Ver informes <ArrowRight size={13} aria-hidden />
      </Link>
    </section>
  );
}
