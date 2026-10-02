"use client";

import Link from "next/link";
import { useMemo } from "react";
import { CaretLeft, CaretRight, Plus } from "@phosphor-icons/react";
import { formatMonth, shiftMonth } from "@/lib/dates";
import { moneyCents, moneySigned } from "@/lib/format";
import { tone } from "@/lib/palette";
import { FinanceIcon, TransferIcon, UncategorizedIcon } from "@/lib/finance-icons";
import {
  effects,
  isSelected,
  sortedCurrencies,
  type AccountDTO,
  type CategoryDTO,
  type CurrencyTotals,
  type Selection,
  type TxDTO,
} from "@/lib/finance-logic";
import { cx } from "@/components/ui";

// ─── Búsquedas ──────────────────────────────────────────────────────────────

export function useLookups(accounts: AccountDTO[], categories: CategoryDTO[]) {
  return useMemo(() => {
    const acc = new Map(accounts.map((a) => [a.id, a]));
    const cat = new Map(categories.map((c) => [c.id, c]));
    return {
      account: (id: string | null) => (id ? acc.get(id) : undefined),
      category: (id: string | null) => (id ? cat.get(id) : undefined),
      currencyOf: (id: string) => acc.get(id)?.currency ?? "UYU",
    };
  }, [accounts, categories]);
}

export type Lookups = ReturnType<typeof useLookups>;

// ─── Avatares ───────────────────────────────────────────────────────────────

/** Círculo con el ícono de la categoría (o de transferencia / sin clasificar). */
export function CategoryAvatar({
  category,
  transfer,
  size = 40,
}: {
  category?: CategoryDTO;
  transfer?: boolean;
  size?: number;
}) {
  const icon = Math.round(size * 0.5);
  if (transfer) {
    return (
      <span
        style={{ width: size, height: size }}
        className="inline-flex shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted"
      >
        <TransferIcon size={icon} weight="bold" />
      </span>
    );
  }
  if (!category) {
    return (
      <span
        style={{ width: size, height: size }}
        className="inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-line-strong text-faint"
      >
        <UncategorizedIcon size={icon} weight="bold" />
      </span>
    );
  }
  return (
    <span
      style={{ ...tone(category.color), width: size, height: size }}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-tone text-tone-fg"
    >
      <FinanceIcon name={category.icon} size={icon} weight="fill" />
    </span>
  );
}

/** Cuadrado redondeado con el ícono del tipo de cuenta, en el color de la cuenta. */
export function AccountAvatar({ account, size = 36 }: { account: Pick<AccountDTO, "icon" | "color">; size?: number }) {
  return (
    <span
      style={{ ...tone(account.color), width: size, height: size }}
      className="inline-flex shrink-0 items-center justify-center rounded-[10px] bg-tone-solid text-white"
    >
      <FinanceIcon name={account.icon} size={Math.round(size * 0.52)} weight="fill" />
    </span>
  );
}

// ─── Montos ─────────────────────────────────────────────────────────────────

/** Monto con signo: ingreso en verde, gasto en tinta normal, cero apagado. */
export function Amount({
  cents,
  currency,
  className,
  hero,
}: {
  cents: number;
  currency: string;
  className?: string;
  /** Número grande suelto: cifras proporcionales, no tabulares. */
  hero?: boolean;
}) {
  return (
    <span
      className={cx(
        "whitespace-nowrap",
        !hero && "tabular",
        cents > 0 ? "fin-income" : cents === 0 && "text-muted",
        className,
      )}
    >
      {moneySigned(cents, currency)}
    </span>
  );
}

/** Totales por moneda en línea ("+ $ 1.250  − US$ 20"). */
export function TotalsInline({
  totals,
  className,
  align = "end",
}: {
  totals: CurrencyTotals;
  className?: string;
  align?: "start" | "end";
}) {
  const cur = sortedCurrencies(totals);
  if (cur.length === 0) return <span className={cx("tabular text-muted", className)}>{moneySigned(0)}</span>;
  return (
    <span className={cx("inline-flex flex-wrap gap-x-3", align === "end" ? "justify-end" : "justify-start", className)}>
      {cur.map((c) => (
        <Amount key={c} cents={totals[c]} currency={c} />
      ))}
    </span>
  );
}

// ─── Fila de movimiento ─────────────────────────────────────────────────────

/** Lo que un movimiento mueve en las cuentas elegidas, por moneda. */
function visibleEffects(tx: TxDTO, sel: Selection, lk: Lookups): { currency: string; cents: number }[] {
  return effects(tx)
    .filter((e) => isSelected(sel, e.accountId))
    .map((e) => ({ currency: lk.currencyOf(e.accountId), cents: e.cents }));
}

export function transferLabel(tx: TxDTO, lk: Lookups): string {
  return `${lk.account(tx.accountId)?.name ?? "?"} a ${lk.account(tx.toAccountId)?.name ?? "?"}`;
}

export function TxRow({
  tx,
  lk,
  selection,
  showAccount,
  onClick,
}: {
  tx: TxDTO;
  lk: Lookups;
  selection: Selection;
  showAccount: boolean;
  onClick?: () => void;
}) {
  const isTransfer = tx.kind === "transfer";
  const category = lk.category(tx.categoryId);
  const account = lk.account(tx.accountId);

  let title: React.ReactNode = tx.title;
  let subtitle: string;
  if (isTransfer) {
    title = tx.title ?? transferLabel(tx, lk);
    subtitle = tx.title ? `Transferencia, ${transferLabel(tx, lk)}` : "Transferencia";
  } else {
    subtitle = category?.name ?? "Sin clasificar";
    if (showAccount && account) subtitle += ` · ${account.name}`;
  }

  const fx = visibleEffects(tx, selection, lk);
  // Transferencia entre dos cuentas elegidas de la misma moneda: no cambia el total.
  const internal = isTransfer && fx.length === 2 && fx[0].currency === fx[1].currency;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3.5 rounded-[12px] px-2 py-2.5 text-left transition-colors hover:bg-surface-2 active:bg-surface-2"
    >
      <CategoryAvatar category={category} transfer={isTransfer} />
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className={cx("truncate text-[15px]", title ? "font-medium" : "text-faint")}>{title || "Sin título"}</span>
        <span className={cx("truncate text-[13px]", !isTransfer && !category ? "text-faint" : "text-muted")}>
          {subtitle}
        </span>
      </span>
      <span className="grid shrink-0 justify-items-end gap-0.5 text-[15px]">
        {internal ? (
          <span className="tabular text-muted">{moneyCents(tx.amountCents, fx[0].currency)}</span>
        ) : (
          fx.map((e, i) => <Amount key={i} cents={e.cents} currency={e.currency} className={i > 0 ? "text-[13px]" : ""} />)
        )}
      </span>
    </button>
  );
}

// ─── Navegación por mes ─────────────────────────────────────────────────────

export function MonthNav({ month, basePath, current }: { month: string; basePath: string; current: string }) {
  const href = (m: string) => (m === current ? basePath : `${basePath}?mes=${m}`);
  const label = formatMonth(month);
  return (
    <div className="flex items-center gap-1">
      <Link
        href={href(shiftMonth(month, -1))}
        aria-label="Mes anterior"
        className="inline-flex size-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-fg"
      >
        <CaretLeft size={18} weight="bold" />
      </Link>
      <span className="min-w-[9.5rem] text-center text-[15px] font-semibold first-letter:uppercase">{label}</span>
      <Link
        href={href(shiftMonth(month, 1))}
        aria-label="Mes siguiente"
        className="inline-flex size-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-fg"
      >
        <CaretRight size={18} weight="bold" />
      </Link>
    </div>
  );
}

// ─── Botón flotante ─────────────────────────────────────────────────────────

export function Fab({ onClick, label = "Nuevo movimiento" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="fixed right-5 bottom-[calc(92px+env(safe-area-inset-bottom))] z-20 inline-flex size-14 items-center justify-center rounded-[18px] bg-accent text-white shadow-[0_6px_20px_-6px_rgba(42,127,163,0.55)] transition-transform active:scale-95 lg:hidden"
    >
      <Plus size={26} weight="bold" />
    </button>
  );
}

export function EmptyBlock({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mt-6 grid justify-items-start gap-3 rounded-[12px] border border-dashed border-line-strong p-8">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {children}
    </div>
  );
}
