"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight, CaretLeft, CaretRight, Camera, CloudArrowUp } from "@phosphor-icons/react";
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
import { useSlide } from "@/components/motion";
import { usePeriodStep, useStepEvents } from "./period-step";

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
        aria-hidden
        style={{ width: size, height: size }}
        className="inline-flex shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-fg"
      >
        <TransferIcon size={icon} weight="bold" />
      </span>
    );
  }
  if (!category) {
    return (
      <span
        aria-hidden
        style={{ width: size, height: size }}
        className="inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-line-strong text-muted"
      >
        <UncategorizedIcon size={icon} weight="bold" />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      style={{ ...tone(category.color), width: size, height: size }}
      className="chip-solid inline-flex shrink-0 items-center justify-center rounded-full"
    >
      <FinanceIcon name={category.icon} size={icon} weight="fill" />
    </span>
  );
}

/** Cuadrado redondeado con el ícono del tipo de cuenta, lleno del color de la cuenta (como los de Hábitos). */
export function AccountAvatar({ account, size = 36 }: { account: Pick<AccountDTO, "icon" | "color">; size?: number }) {
  return (
    <span
      aria-hidden
      style={{ ...tone(account.color), width: size, height: size }}
      className="chip-solid inline-flex shrink-0 items-center justify-center rounded-[6px]"
    >
      <FinanceIcon name={account.icon} size={Math.round(size * 0.52)} weight="fill" />
    </span>
  );
}

// ─── Montos ─────────────────────────────────────────────────────────────────

/**
 * Monto de un movimiento con signo explícito: el "+" y el "−" ya distinguen
 * ingreso de gasto; el verde del ingreso es un refuerzo, no la única señal.
 */
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

/**
 * Saldo de una cuenta: lo que hay, no un movimiento. Va en tinta y sin "+";
 * solo el negativo lleva signo y color de alerta.
 */
export function Balance({
  cents,
  currency,
  className,
  hero,
}: {
  cents: number;
  currency: string;
  className?: string;
  hero?: boolean;
}) {
  return (
    <span className={cx("whitespace-nowrap", !hero && "tabular", cents < 0 && "text-danger", className)}>
      {cents < 0 ? moneySigned(cents, currency) : moneyCents(cents, currency)}
    </span>
  );
}

/** Totales por moneda en línea ("+ $ 1.250  − US$ 20"). Con `balance`, como saldos. */
export function TotalsInline({
  totals,
  className,
  align = "end",
  balance,
  whole,
}: {
  totals: CurrencyTotals;
  className?: string;
  align?: "start" | "end";
  balance?: boolean;
  /** Total de un período: los pesos van redondeados (sin centavos sueltos). */
  whole?: boolean;
}) {
  const shown = whole ? Object.fromEntries(Object.entries(totals).map(([c, v]) => [c, c === "UYU" ? Math.round(v / 100) * 100 : v])) : totals;
  const cur = sortedCurrencies(shown);
  if (cur.length === 0) return <span className={cx("tabular text-muted", className)}>{moneyCents(0)}</span>;
  return (
    <span className={cx("inline-flex flex-wrap gap-x-3", align === "end" ? "justify-end" : "justify-start", className)}>
      {cur.map((c) =>
        balance ? <Balance key={c} cents={shown[c]} currency={c} /> : <Amount key={c} cents={shown[c]} currency={c} />,
      )}
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

/** "Itau → Dolares" con flecha de ícono (el lector de pantalla oye "a"). */
function Route({ from, to }: { from: string; to: string }) {
  return (
    <span className="inline-flex max-w-full min-w-0 items-center gap-1">
      <span className="truncate">{from}</span>
      <ArrowRight size={11} weight="bold" className="shrink-0" aria-label="a" />
      <span className="truncate">{to}</span>
    </span>
  );
}

export function TxRow({
  tx,
  lk,
  selection,
  showAccount,
  onClick,
  onMenu,
  status,
  gestures,
}: {
  tx: TxDTO;
  lk: Lookups;
  selection: Selection;
  showAccount: boolean;
  onClick?: () => void;
  /** Clic derecho (duplicar, cambiar título...). */
  onMenu?: (e: React.MouseEvent) => void;
  /** Guardado en la pantalla pero todavía no en el servidor: "subiendo" (con señal) o "sin-subir" (en el aparato). */
  status?: "subiendo" | "sin-subir";
  /** Props táctiles de `TxGestures` (mantener apretado, menú). */
  gestures?: Partial<React.ComponentProps<"button">>;
}) {
  const isTransfer = tx.kind === "transfer";
  const category = lk.category(tx.categoryId);
  const account = lk.account(tx.accountId);

  let title: string | null = tx.title;
  let subtitle: React.ReactNode;
  if (isTransfer) {
    const from = lk.account(tx.accountId)?.name ?? "?";
    const to = lk.account(tx.toAccountId)?.name ?? "?";
    // Sin nota, el título dice el recorrido; con nota, el recorrido baja al subtítulo.
    title = tx.title ?? `Desde ${from} a ${to}`;
    subtitle = tx.title ? (
      <span className="flex min-w-0 items-center gap-1">
        <span className="shrink-0">Transferencia,</span>
        <Route from={from} to={to} />
      </span>
    ) : (
      "Transferencia"
    );
  } else {
    subtitle = category?.name ?? "Sin clasificar";
    if (tx.installment) subtitle += ` · cuota ${tx.installment.no}/${tx.installment.count}`;
    if (showAccount && account) subtitle += ` · ${account.name}`;
  }

  const fx = visibleEffects(tx, selection, lk);
  // Transferencia entre dos cuentas elegidas de la misma moneda: no cambia el total.
  const internal = isTransfer && fx.length === 2 && fx[0].currency === fx[1].currency;

  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={onMenu}
      {...gestures}
      aria-busy={status === "subiendo" || undefined}
      className={cx(
        "tap-tint flex min-h-[64px] w-full items-center gap-3.5 border-b border-line px-1 py-3 text-left transition-[background-color,opacity] duration-[80ms] select-none [-webkit-touch-callout:none] hover:bg-surface-2/70",
        status && "opacity-70",
      )}
    >
      <CategoryAvatar category={category} transfer={isTransfer} />
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className={cx("truncate text-[15px]", title ? "font-medium" : "text-muted")}>{title || "Sin título"}</span>
          {tx.photos.length > 0 && <Camera size={14} className="shrink-0 text-muted" aria-label="Con comprobante" />}
        </span>
        <span className="truncate text-[13px] text-muted">
          {status ? (
            <span className="inline-flex items-center gap-1">
              <CloudArrowUp size={13} weight="bold" aria-hidden className={status === "subiendo" ? "motion-safe:animate-pulse" : undefined} />
              {status === "subiendo" ? "Subiendo…" : "En el aparato, sin subir"}
            </span>
          ) : (
            subtitle
          )}
        </span>
      </span>
      <span className="grid shrink-0 justify-items-end gap-0.5 font-mono text-[14px] font-medium">
        {internal ? (
          <span className="tabular font-normal text-muted" title="Entre cuentas elegidas: no cambia el total">
            {moneyCents(tx.amountCents, fx[0].currency)}
          </span>
        ) : (
          fx.map((e, i) => (
            <Amount key={i} cents={e.cents} currency={e.currency} className={i > 0 ? "text-[13px] font-normal" : ""} />
          ))
        )}
      </span>
    </button>
  );
}

// ─── Navegación por mes ─────────────────────────────────────────────────────

export function MonthNav({ month, basePath, current }: { month: string; basePath: string; current: string }) {
  const href = (m: string) => (m === current ? basePath : `${basePath}?mes=${m}`);
  // El mes cambia al toque (los datos llegan después); tres toques son tres meses.
  const step = usePeriodStep(month, [href(shiftMonth(month, -1)), href(shiftMonth(month, 1))]);
  const shown = step.shown;
  const slide = useSlide(shown);
  const move = (m: string) => step.go(m, href(m));
  useStepEvents((d) => move(shiftMonth(shown, d)));
  const click = (m: string) => (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    move(m);
  };
  return (
    <div className="flex items-center gap-0.5">
      <Link
        href={href(shiftMonth(shown, -1))}
        onClick={click(shiftMonth(shown, -1))}
        aria-label="Mes anterior"
        className="inline-flex size-11 items-center justify-center rounded-[4px] text-muted transition-colors hover:bg-surface-2 hover:text-fg"
      >
        <CaretLeft size={18} />
      </Link>
      <h2 className="min-w-[9.5rem] overflow-hidden text-center" aria-live="polite">
        <span key={shown} className={cx("display inline-block text-[22px] first-letter:uppercase", slide)}>
          {formatMonth(shown)}
        </span>
      </h2>
      <Link
        href={href(shiftMonth(shown, 1))}
        onClick={click(shiftMonth(shown, 1))}
        aria-label="Mes siguiente"
        className="inline-flex size-11 items-center justify-center rounded-[4px] text-muted transition-colors hover:bg-surface-2 hover:text-fg"
      >
        <CaretRight size={18} />
      </Link>
      {shown !== current && (
        <Link
          href={basePath}
          onClick={click(current)}
          className="ml-1 inline-flex h-9 items-center rounded-[4px] border border-line-strong px-3 text-[13px] font-medium transition-colors hover:bg-surface-2"
        >
          Hoy
        </Link>
      )}
    </div>
  );
}

export function EmptyBlock({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="mt-6 grid justify-items-start gap-3 border-y border-line py-10">
      {icon && <span className="inline-flex text-accent-fg">{icon}</span>}
      <h2 className="display text-[30px]">{title}</h2>
      {children}
    </div>
  );
}
