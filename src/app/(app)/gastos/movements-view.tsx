"use client";

import Link from "next/link";
import { useMemo, useRef } from "react";
import { CaretRight, Copy, Plus } from "@phosphor-icons/react";
import { formatShort } from "@/lib/dates";
import { moneyCents } from "@/lib/format";
import {
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
import { Button } from "@/components/ui";
import { GastosTabs } from "./gastos-nav";
import { AccountSwitcher } from "./account-switcher";
import { useSelection } from "./selection";
import { Amount, EmptyBlock, Fab, MonthNav, TotalsInline, TxRow, useLookups } from "./shared";
import { TxSheet, type TxSheetHandle } from "./tx-sheet";

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

  const visible = useMemo(() => txs.filter((t) => touchesSelection(t, selection)), [txs, selection]);
  const groups = useMemo(() => groupByDay(visible, selection, lk.currencyOf), [visible, selection, lk]);
  const net = useMemo(() => netByCurrency(visible, selection, lk.currencyOf), [visible, selection, lk]);

  // Ingresos y gastos del mes por moneda (sin transferencias), para el resumen.
  const flows = useMemo(() => {
    const inc: Record<string, number> = {};
    const exp: Record<string, number> = {};
    for (const t of visible) {
      if (t.kind === "transfer") continue;
      const c = lk.currencyOf(t.accountId);
      const target = t.kind === "income" ? inc : exp;
      target[c] = (target[c] ?? 0) + t.amountCents;
    }
    return { inc, exp };
  }, [visible, lk]);

  const showAccount = selection === null || selection.length > 1;
  const netCurrencies = sortedCurrencies(net);
  const mainCur = netCurrencies[0] ?? "UYU";
  const hasAccounts = accounts.some((a) => !a.archived);

  return (
    <>
      <PageHeader
        title="Movimientos"
        tabs={<GastosTabs />}
        actions={
          <Button variant="accent" size="sm" className="max-lg:hidden" onClick={() => form.current?.create()}>
            <Plus size={16} weight="bold" /> Nuevo movimiento
          </Button>
        }
      />

      <main className="mx-auto max-w-3xl px-4 lg:px-8">
        {!hasAccounts ? (
          <EmptyBlock title="Empezá por tus cuentas">
            <p className="max-w-[46ch] text-sm leading-relaxed text-muted">
              Cada gasto o ingreso sale de una cuenta: efectivo, el banco, una tarjeta, tus dólares. Creá las que uses y
              después cargá movimientos.
            </p>
            <Link
              href="/gastos/cuentas?nueva=1"
              className="inline-flex h-10 items-center rounded-md bg-accent px-4 text-sm font-medium text-white"
            >
              Crear cuenta
            </Link>
          </EmptyBlock>
        ) : (
          <>
            <section className="grid gap-4 pt-2 pb-5 lg:grid-cols-[1fr_minmax(0,320px)] lg:items-end lg:gap-8 lg:pt-6">
              <div className="grid gap-1">
                <div className="-ml-2.5">
                  <MonthNav month={month} basePath="/gastos" current={today.slice(0, 7)} />
                </div>
                <div className="grid gap-0.5">
                  <span className="text-[13px] text-muted">Neto del mes</span>
                  <span className="text-[40px] leading-none font-semibold tracking-tight">
                    <Amount cents={net[mainCur] ?? 0} currency={mainCur} hero />
                  </span>
                  {netCurrencies.slice(1).map((c) => (
                    <Amount key={c} cents={net[c]} currency={c} className="text-lg font-semibold" />
                  ))}
                </div>
                <dl className="mt-2 flex items-start gap-6 text-[13px]">
                  <div className="grid gap-0.5">
                    <dt className="text-muted">Ingresos</dt>
                    <FlowValues totals={flows.inc} />
                  </div>
                  <div className="grid gap-0.5">
                    <dt className="text-muted">Gastos</dt>
                    <FlowValues totals={flows.exp} />
                  </div>
                </dl>
              </div>
              <div className="grid gap-2">
                <AccountSwitcher accounts={accounts} selection={selection} onChange={setSelection} />
                <div className="flex gap-2">
                  {uncategorized > 0 && (
                    <QuickLink href="/gastos/sin-clasificar" label={`${uncategorized} sin clasificar`} />
                  )}
                  <QuickLink href="/gastos/plantillas" label="Plantillas" icon />
                </div>
              </div>
            </section>

            {groups.length === 0 ? (
              <p className="border-t border-line py-16 text-center text-sm text-muted">No hay movimientos este mes.</p>
            ) : (
              <div className="grid gap-4 border-t border-line pt-3">
                {groups.map((g, gi) => {
                  const { label, relative } = dayLabel(g.date, today);
                  return (
                    <section key={g.date} className="rise" style={{ "--i": Math.min(gi, 8) } as React.CSSProperties}>
                      <header className="flex items-baseline justify-between gap-3 px-2 pb-1">
                        <h2 className="text-[13px] font-semibold">
                          {label}
                          {relative && <span className="ml-2 font-normal text-muted">{formatShort(g.date)}</span>}
                        </h2>
                        <TotalsInline totals={g.net} className="text-[13px] font-medium" />
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
          </>
        )}
      </main>

      {hasAccounts && <Fab onClick={() => form.current?.create()} />}
      <TxSheet ref={form} accounts={accounts} categories={categories} templates={templates} selection={selection} />
    </>
  );
}

/** Un monto por moneda, uno debajo del otro. */
function FlowValues({ totals }: { totals: Record<string, number> }) {
  const cur = sortedCurrencies(totals);
  return (
    <dd className="tabular grid font-medium">
      {cur.length === 0 ? <span>{moneyCents(0)}</span> : cur.map((c) => <span key={c}>{moneyCents(totals[c], c)}</span>)}
    </dd>
  );
}

function QuickLink({ href, label, icon }: { href: string; label: string; icon?: boolean }) {
  return (
    <Link
      href={href}
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-2.5 text-[13px] text-muted transition-colors hover:bg-surface-2 hover:text-fg"
    >
      {icon && <Copy size={14} />}
      {label}
      <CaretRight size={12} weight="bold" />
    </Link>
  );
}
