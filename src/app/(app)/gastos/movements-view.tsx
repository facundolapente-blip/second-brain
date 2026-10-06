"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { ArrowDownLeft, ArrowsClockwise, ArrowUpRight, Bank, CaretRight, Copy, Plus, Receipt, Tag } from "@phosphor-icons/react";
import { formatShort } from "@/lib/dates";
import { moneyCents } from "@/lib/format";
import {
  balanceByCurrency,
  flowOf,
  dayLabel,
  groupByDay,
  netByCurrency,
  sortedCurrencies,
  touchesSelection,
  type AccountDTO,
  type CategoryDTO,
  type TemplateDTO,
  type TxDTO,
} from "@/lib/finance-logic";
import { PageHeader } from "@/components/page-header";
import { Button, cx } from "@/components/ui";
import { GastosTabs } from "./gastos-nav";
import { AccountChips, AccountSwitcher, selectionLabel } from "./account-switcher";
import { useSelection } from "./selection";
import { Balance, EmptyBlock, Fab, MonthNav, TotalsInline, TxRow, useLookups } from "./shared";
import { TxSheet, type TxSheetHandle } from "./tx-sheet";
import { CategorySpend, SideBalances } from "./month-side";

/** Atajo de teclado "N" para cargar un movimiento, salvo que se esté escribiendo o haya una hoja abierta. */
function useNewShortcut(onNew: () => void) {
  const cb = useRef(onNew);
  useEffect(() => {
    cb.current = onNew;
  });
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== "n" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable=true]") || document.querySelector("dialog[open]")) return;
      e.preventDefault();
      cb.current();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

export function MovementsView({
  month,
  today,
  accounts,
  categories,
  templates,
  txs,
  uncategorized,
}: {
  month: string;
  today: string;
  accounts: AccountDTO[];
  categories: CategoryDTO[];
  templates: TemplateDTO[];
  txs: TxDTO[];
  uncategorized: number;
}) {
  const { selection, setSelection } = useSelection(accounts);
  const lk = useLookups(accounts, categories);
  const form = useRef<TxSheetHandle>(null);
  const hasAccounts = accounts.some((a) => !a.archived);
  useNewShortcut(() => hasAccounts && form.current?.create());

  const visible = useMemo(() => txs.filter((t) => touchesSelection(t, selection)), [txs, selection]);
  const groups = useMemo(() => groupByDay(visible, selection, lk.currencyOf), [visible, selection, lk]);
  const net = useMemo(() => netByCurrency(visible, selection, lk.currencyOf), [visible, selection, lk]);

  // Ingresos y gastos del mes por moneda (sin transferencias), para el resumen.
  const flows = useMemo(() => {
    const inc: Record<string, number> = {};
    const exp: Record<string, number> = {};
    for (const t of visible) {
      // Transferencias y ajustes no cuentan; un reintegro resta del gasto.
      const f = flowOf(t, lk.category);
      if (!f) continue;
      const c = lk.currencyOf(t.accountId);
      const target = f.kind === "income" ? inc : exp;
      target[c] = (target[c] ?? 0) + f.cents;
    }
    return { inc, exp };
  }, [visible, lk]);

  const balance = useMemo(
    () => balanceByCurrency(selection ? accounts : accounts.filter((a) => !a.archived), selection),
    [accounts, selection],
  );
  const showAccount = selection === null || selection.length > 1;
  const isCurrent = month === today.slice(0, 7);

  return (
    <>
      <PageHeader
        title="Movimientos"
        wide
        tabs={<GastosTabs />}
        actions={
          <Button
            variant="accent"
            size="sm"
            className="max-lg:hidden"
            onClick={() => form.current?.create()}
            aria-keyshortcuts="N"
            title="Atajo: N"
          >
            <Plus size={16} weight="bold" /> Nuevo movimiento
          </Button>
        }
      />

      <main className="mx-auto max-w-3xl px-4 lg:max-w-6xl lg:px-10">
        {!hasAccounts ? (
          <EmptyBlock title="Empezá por tus cuentas" icon={<Bank size={22} aria-hidden />}>
            <p className="max-w-[46ch] text-sm leading-relaxed text-muted">
              Cada gasto o ingreso sale de una cuenta: efectivo, el banco, una tarjeta, tus dólares. Creá las que uses y
              después cargá movimientos.
            </p>
            <Link
              href="/gastos/cuentas?nueva=1"
              className="inline-flex h-11 items-center rounded-[4px] bg-ink px-4 text-sm font-medium text-on-ink transition-opacity hover:opacity-85"
            >
              Crear cuenta
            </Link>
          </EmptyBlock>
        ) : (
          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-x-10">
            <section className="grid gap-5 pt-1 pb-5 lg:col-start-1 lg:row-start-1 lg:pt-6">
              <AccountChips accounts={accounts} selection={selection} onChange={setSelection} />
              <div className="grid gap-3">
                <div className="-ml-3">
                  <MonthNav month={month} basePath="/gastos" current={today.slice(0, 7)} />
                </div>
                <div className="grid gap-1">
                  <span className="kicker">Saldo actual · {selectionLabel(accounts, selection)}</span>
                  <BalanceHero totals={balance} />
                </div>
                <dl className="grid grid-cols-2 divide-x divide-line border-y border-line lg:max-w-xl">
                  <FlowTile label="Ingresos" totals={flows.inc} kind="in" />
                  <FlowTile label="Gastos" totals={flows.exp} kind="out" />
                </dl>
              </div>
            </section>

            {/* Celular: debajo del resumen. Computadora: panel lateral fijo con saldos y gasto por categoría. */}
            <aside className="grid content-start gap-4 pb-5 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:pt-6 lg:pb-0">
              <div className="grid gap-2">
                <AccountSwitcher
                  accounts={accounts}
                  selection={selection}
                  onChange={setSelection}
                  summary={{ label: isCurrent ? "Neto del mes en curso" : "Neto del mes", totals: net }}
                />
                <div className="flex flex-wrap gap-2">
                  {uncategorized > 0 && (
                    <QuickLink
                      href="/gastos/sin-clasificar"
                      label={`${uncategorized} sin clasificar`}
                      icon={<Tag size={14} aria-hidden />}
                    />
                  )}
                  <QuickLink href="/gastos/plantillas" label="Plantillas" icon={<Copy size={14} aria-hidden />} />
                  <QuickLink href="/gastos/recurrentes" label="Recurrentes" icon={<ArrowsClockwise size={14} aria-hidden />} />
                </div>
              </div>
              <div className="hidden gap-4 lg:grid">
                <SideBalances accounts={accounts} selection={selection} onChange={setSelection} />
                <CategorySpend txs={visible} lk={lk} month={month} />
              </div>
            </aside>

            {groups.length === 0 ? (
              <div className="grid justify-items-center gap-2 border-t border-line py-16 text-center lg:col-start-1 lg:row-start-2">
                <span className="inline-flex size-11 items-center justify-center rounded-full border border-line-strong text-muted">
                  <Receipt size={20} aria-hidden />
                </span>
                <p className="display text-[24px]">No hay movimientos este mes</p>
                <p className="max-w-[34ch] text-sm text-muted">
                  {selection ? "En las cuentas elegidas. Probá con todas o con otro mes." : "Cargá el primero con el botón de más."}
                </p>
              </div>
            ) : (
              <div className="grid gap-6 pt-2 lg:col-start-1 lg:row-start-2">
                {groups.map((g, gi) => {
                  const { label, relative } = dayLabel(g.date, today);
                  return (
                    <section
                      key={g.date}
                      aria-label={relative ? `${label}, ${formatShort(g.date)}` : label}
                      className="rise"
                      style={{ "--i": Math.min(gi, 8) } as React.CSSProperties}
                    >
                      {/* En el celular el día queda pegado arriba mientras se recorre su lista. */}
                      <header className="z-10 -mx-4 flex items-baseline justify-between gap-3 border-b border-fg/80 bg-bg/92 px-4 pt-3 pb-2 backdrop-blur-md max-lg:sticky max-lg:top-[calc(4rem+env(safe-area-inset-top))] lg:mx-0 lg:px-0">
                        <h3 className="display text-[19px] first-letter:uppercase">
                          {label}
                          {relative && <span className="kicker ml-2.5">{formatShort(g.date)}</span>}
                        </h3>
                        <TotalsInline totals={g.net} className="font-mono text-[12.5px] font-medium" />
                      </header>
                      <ul>
                        {g.txs.map((t) => (
                          <li key={t.id}>
                            <TxRow
                              tx={t}
                              lk={lk}
                              selection={selection}
                              showAccount={showAccount}
                              onClick={() => form.current?.edit(t)}
                            />
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {hasAccounts && <Fab onClick={() => form.current?.create()} />}
      <TxSheet ref={form} accounts={accounts} categories={categories} templates={templates} selection={selection} />
    </>
  );
}

/**
 * La cifra del mes: grande, en tinta (no en verde) y con signo explícito; el
 * color queda para los montos chicos de la lista.
 */
/** Saldo de las cuentas elegidas: la cifra protagonista (lo que queda). */
function BalanceHero({ totals }: { totals: Record<string, number> }) {
  const cur = sortedCurrencies(totals);
  if (cur.length === 0) return <span className="figure text-[52px] lg:text-[64px]">{moneyCents(0)}</span>;
  return (
    <span className="grid gap-0.5">
      <Balance cents={totals[cur[0]]} currency={cur[0]} hero className="figure text-[52px] lg:text-[64px]" />
      {cur.slice(1).map((c) => (
        <Balance key={c} cents={totals[c]} currency={c} hero className="figure text-[26px] text-fg" />
      ))}
    </span>
  );
}

/** Ingresos o gastos del mes: flecha que entra o sale, así no depende del color. */
function FlowTile({ label, totals, kind }: { label: string; totals: Record<string, number>; kind: "in" | "out" }) {
  const cur = sortedCurrencies(totals);
  return (
    <div className="grid content-start gap-1.5 px-0 py-3 [&+&]:pl-4">
      <dt className="kicker flex items-center gap-1.5">
        <span
          aria-hidden
          className={cx(
            "inline-flex size-5 items-center justify-center rounded-full",
            kind === "in" ? "bg-[var(--st-done-bg)] text-[var(--st-done-fg)]" : "bg-surface-2 text-fg",
          )}
        >
          {kind === "in" ? <ArrowDownLeft size={12} weight="bold" /> : <ArrowUpRight size={12} weight="bold" />}
        </span>
        {label}
      </dt>
      <dd className="tabular grid font-mono text-[15px] font-medium">
        {cur.length === 0 ? <span>{moneyCents(0)}</span> : cur.map((c) => <span key={c}>{moneyCents(totals[c], c)}</span>)}
      </dd>
    </div>
  );
}

function QuickLink({ href, label, icon }: { href: string; label: string; icon?: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex h-10 items-center gap-1.5 rounded-[4px] border border-line-strong px-3 text-[13px] text-muted transition-colors hover:bg-surface-2 hover:text-fg"
    >
      {icon}
      {label}
      <CaretRight size={12} weight="bold" aria-hidden />
    </Link>
  );
}
