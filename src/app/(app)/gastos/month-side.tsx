"use client";

import { Bank, ChartPieSlice, Check } from "@phosphor-icons/react";
import { TintedCard } from "@/components/tinted-card";
import { moneyWhole } from "@/lib/format";
import { tone } from "@/lib/palette";
import {
  balanceByCurrency,
  txFlowEntries,
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
  const hasWork = visible.some((a) => a.business);
  // El total es el personal; las cuentas de trabajo van aparte, abajo.
  const total = balanceByCurrency(visible.filter((a) => !a.business), null);
  const cur = sortedCurrencies(total);
  const list = [...visible.filter((a) => !a.business), ...visible.filter((a) => a.business)];

  return (
    <TintedCard
      icon={Bank}
      title="Saldos"
      meta={visible.length === 1 ? "1 cuenta" : `${visible.length} cuentas`}
      action={
        selection !== null ? (
          <button type="button" onClick={() => onChange(null)} className="tcard-pill press">
            Ver todas
          </button>
        ) : undefined
      }
      bodyClassName="gap-2! pt-3! pb-2!"
    >
      <p className="text-[12.5px] text-muted">
        {hasWork ? "Total personal" : "Total"}{" "}
        {cur.map((c, i) => (
          <span key={c}>
            {i > 0 && " y "}
            <Balance cents={total[c]} currency={c} className="font-mono text-fg" />
          </span>
        ))}
      </p>
      <ul className="border-t border-line">
        {list.map((a, i) => {
          // Con "Personales" (sin elegir), las personales se ven seleccionadas, igual que las de
          // trabajo cuando se elige "Trabajo".
          const on = selection === null ? !a.business : isSelected(selection, a.id);
          const only = selection !== null && on && selection.length === 1;
          return (
            <li key={a.id} className="border-b border-line last:border-b-0">
              {a.business && !list[i - 1]?.business && <p className="kicker pt-3 pb-1">Trabajo</p>}
              <button
                type="button"
                onClick={() => onChange(only ? null : [a.id])}
                aria-pressed={on}
                title={only ? "Volver a las personales" : `Ver solo ${a.name}`}
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
    </TintedCard>
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
  personal = false,
}: {
  txs: TxDTO[];
  lk: Lookups;
  month: string;
  personal?: boolean;
}) {
  const byCur: Record<string, Map<string | null, number>> = {};
  for (const f of txFlowEntries(txs, lk.category, lk.currencyOf, personal)) {
    if (f.kind !== "expense") continue;
    const m = (byCur[f.currency] ??= new Map());
    m.set(f.categoryId, (m.get(f.categoryId) ?? 0) + f.cents);
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
    <TintedCard
      icon={ChartPieSlice}
      title="Gasto por categoría"
      meta={cur ? `${moneyWhole(total, cur)} en total` : "Sin gastos"}
      action={{ href: `/gastos/informes?mes=${month}`, label: "Informes" }}
      bodyClassName="gap-3!"
    >
      {rows.length === 0 ? (
        <p className="py-2 text-[14px] text-muted">Sin gastos este mes en las cuentas elegidas.</p>
      ) : (
        <ul className="grid gap-2.5">
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
                    {moneyWhole(r.cents, cur)}
                    <span className="ml-2 inline-block w-8 text-right text-muted">{Math.round((r.cents / total) * 100)}%</span>
                  </span>
                </div>
                <span className="block h-1.5">
                  <span
                    className="bar-anim block h-full rounded-r-[3px] bg-[var(--fin-out)]"
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
                  {moneyWhole(rest, cur)}
                  <span className="ml-2 inline-block w-8 text-right">{Math.round((rest / total) * 100)}%</span>
                </span>
              </div>
              <span className="block h-1.5">
                <span
                  className="bar-anim block h-full rounded-r-[3px] bg-[color-mix(in_oklab,var(--fin-out)_45%,var(--surface))]"
                  style={{ width: `${Math.max(1.5, (rest / max) * 100)}%` }}
                />
              </span>
            </li>
          )}
        </ul>
      )}
      {curs.length > 1 && (
        <p className="text-[12.5px] text-muted">
          Solo {cur}. También hubo gastos en {curs.slice(1).join(", ")}.
        </p>
      )}
    </TintedCard>
  );
}
