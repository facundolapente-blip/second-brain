"use client";

import Form from "next/form";
import Link from "next/link";
import { useRef } from "react";
import { MagnifyingGlass, X } from "@phosphor-icons/react";
import { flowOf, type AccountDTO, type CategoryDTO, type TemplateDTO, type TxDTO } from "@/lib/finance-logic";
import { formatMonth, formatShort } from "@/lib/dates";
import { moneyCents } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Button, inputClass } from "@/components/ui";
import { GastosTabs } from "../gastos-nav";
import { TxRow, useLookups, type Lookups } from "../shared";
import { TxSheet, type TxSheetHandle } from "../tx-sheet";

type Params = { q: string; cuenta: string; cat: string; tipo: string; desde: string; hasta: string; min: string; max: string };

/** Todos los movimientos, de todos los meses, con buscador y filtros (en la URL). */
export function HistoryView({
  accounts,
  categories,
  templates,
  txs,
  total,
  hasMore,
  params,
  limit,
}: {
  accounts: AccountDTO[];
  categories: CategoryDTO[];
  templates: TemplateDTO[];
  txs: TxDTO[];
  total: number;
  hasMore: boolean;
  params: Params;
  limit: number;
}) {
  const lk = useLookups(accounts, categories);
  const form = useRef<TxSheetHandle>(null);
  const openTx = (t: TxDTO) => form.current?.edit(t);
  const filtered = Object.values(params).some(Boolean);

  // Totales de lo que se ve, por moneda (sin transferencias ni ajustes).
  const totals = { exp: new Map<string, number>(), inc: new Map<string, number>() };
  for (const t of txs) {
    const f = flowOf(t, lk.category);
    if (!f) continue;
    const m = f.kind === "expense" ? totals.exp : totals.inc;
    const cur = lk.currencyOf(t.accountId);
    m.set(cur, (m.get(cur) ?? 0) + f.cents);
  }
  const fmt = (m: Map<string, number>) => [...m].map(([c, v]) => moneyCents(v, c)).join(" + ") || "$ 0";

  // Agrupado por mes.
  const months = new Map<string, TxDTO[]>();
  for (const t of txs) months.set(t.date.slice(0, 7), [...(months.get(t.date.slice(0, 7)) ?? []), t]);
  const more = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).filter(([, v]) => v)), n: String(limit + 300) });

  return (
    <>
      <PageHeader title="Buscar movimientos" wide tabs={<GastosTabs />} />
      <main className="mx-auto grid max-w-3xl gap-4 px-4 pt-2 pb-10 lg:max-w-6xl lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start lg:gap-8 lg:px-10 lg:pt-6">
        <Form action="/gastos/buscar" className="grid gap-3 rounded-[20px] border border-line bg-surface p-4 lg:sticky lg:top-28">
          <label className="flex h-11 items-center gap-2 rounded-full border border-line-strong bg-surface px-3.5 focus-within:border-accent">
            <MagnifyingGlass size={16} className="text-muted" aria-hidden />
            <input name="q" defaultValue={params.q} placeholder="Buscar: mc, nafta, alquiler…" className="min-w-0 flex-1 bg-transparent text-[14.5px] outline-none" />
          </label>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
            <select name="cuenta" defaultValue={params.cuenta} aria-label="Cuenta" className={inputClass}>
              <option value="">Todas las cuentas</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <select name="tipo" defaultValue={params.tipo} aria-label="Tipo" className={inputClass}>
              <option value="">Gastos, ingresos y transferencias</option>
              <option value="expense">Solo gastos</option>
              <option value="income">Solo ingresos</option>
              <option value="transfer">Solo transferencias</option>
            </select>
            <select name="cat" defaultValue={params.cat} aria-label="Categoría" className={`${inputClass} col-span-2 lg:col-span-1`}>
              <option value="">Todas las categorías</option>
              <option value="none">Sin clasificar</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.kind === "income" ? " (ingreso)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid min-w-0 gap-1 text-[12px] text-muted">
              Desde
              <input type="date" name="desde" defaultValue={params.desde} className={`${inputClass} min-w-0`} />
            </label>
            <label className="grid min-w-0 gap-1 text-[12px] text-muted">
              Hasta
              <input type="date" name="hasta" defaultValue={params.hasta} className={`${inputClass} min-w-0`} />
            </label>
            <label className="grid min-w-0 gap-1 text-[12px] text-muted">
              Monto mínimo
              <input name="min" inputMode="decimal" defaultValue={params.min} placeholder="0" className={`${inputClass} min-w-0`} />
            </label>
            <label className="grid min-w-0 gap-1 text-[12px] text-muted">
              Monto máximo
              <input name="max" inputMode="decimal" defaultValue={params.max} placeholder="—" className={`${inputClass} min-w-0`} />
            </label>
          </div>
          <div className="flex gap-2">
            <Button type="submit" className="flex-1">
              Buscar
            </Button>
            {filtered && (
              <Link
                href="/gastos/buscar"
                className="inline-flex h-11 items-center gap-1 rounded-full px-3.5 text-[13px] text-muted hover:bg-surface-2 hover:text-fg"
              >
                <X size={13} aria-hidden /> Limpiar
              </Link>
            )}
          </div>
        </Form>

        <section className="grid content-start gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-2xl bg-surface-2 px-4 py-3 text-[13.5px]">
            <span>
              <strong className="font-semibold">{total.toLocaleString("es-UY")}</strong> {total === 1 ? "movimiento" : "movimientos"}
            </span>
            <span className="text-muted">
              Gastos <span className="tabular font-medium text-fg">{fmt(totals.exp)}</span> · Ingresos{" "}
              <span className="tabular font-medium text-fg">{fmt(totals.inc)}</span>
              {hasMore && " (de lo que se ve)"}
            </span>
          </div>
          {txs.length === 0 ? (
            <p className="py-10 text-center text-[14px] text-muted">No hay movimientos con esos filtros.</p>
          ) : (
            <MonthGroups months={[...months]} lk={lk} onOpen={openTx} />
          )}
          {hasMore && (
            <Link
              href={`/gastos/buscar?${more.toString()}`}
              scroll={false}
              className="inline-flex h-11 items-center justify-center rounded-full border border-line-strong text-[14px] font-medium hover:bg-surface-2"
            >
              Cargar más
            </Link>
          )}
        </section>
      </main>
      <TxSheet ref={form} accounts={accounts} categories={categories} templates={templates} selection={null} />
    </>
  );
}

function MonthGroups({ months, lk, onOpen }: { months: [string, TxDTO[]][]; lk: Lookups; onOpen: (t: TxDTO) => void }) {
  return months.map(([m, list]) => (
    <div key={m}>
      <h2 className="display z-10 -mx-4 border-b border-fg/80 bg-bg/92 px-4 pt-3 pb-2 text-[19px] backdrop-blur-md first-letter:uppercase max-lg:sticky max-lg:top-[calc(4rem+env(safe-area-inset-top))] lg:mx-0 lg:px-0">
        {formatMonth(m)}
      </h2>
      <ul>
        {list.map((t) => (
          <li key={t.id} className="relative">
            <TxRow tx={t} lk={lk} selection={null} showAccount onClick={() => onOpen(t)} />
            <span className="pointer-events-none absolute top-1.5 right-1 font-mono text-[10.5px] text-faint">{formatShort(t.date)}</span>
          </li>
        ))}
      </ul>
    </div>
  ));
}
