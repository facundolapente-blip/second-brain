"use client";

import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight } from "@phosphor-icons/react";
import { formatMonth } from "@/lib/dates";
import { currencySymbol, moneyCents } from "@/lib/format";
import {
  byCategory,
  byMonth,
  isSelected,
  type AccountDTO,
  type CategoryDTO,
  type FlowRow,
} from "@/lib/finance-logic";
import { PageHeader } from "@/components/page-header";
import { cx, Segmented } from "@/components/ui";
import { AccountSwitcher } from "../account-switcher";
import { GastosTabs } from "../gastos-nav";
import { useSelection } from "../selection";
import { CategoryAvatar, MonthNav, useLookups } from "../shared";

/**
 * Semilla de la sección de análisis: gasto/ingreso por categoría del mes y
 * evolución de los últimos meses. Se mira una moneda a la vez (no se convierte
 * USD a UYU) y respeta las cuentas elegidas en el selector.
 */
export function ReportsView({
  month,
  months,
  today,
  accounts,
  categories,
  rows,
}: {
  month: string;
  months: string[];
  today: string;
  accounts: AccountDTO[];
  categories: CategoryDTO[];
  rows: FlowRow[];
}) {
  const { selection, setSelection } = useSelection(accounts);
  const lk = useLookups(accounts, categories);

  const currencies = useMemo(() => {
    const set = new Set(accounts.filter((a) => isSelected(selection, a.id) && !a.archived).map((a) => a.currency));
    return [...set].sort((a, b) => (a === "UYU" ? -1 : b === "UYU" ? 1 : a.localeCompare(b)));
  }, [accounts, selection]);
  const [pickedCurrency, setCurrency] = useState<string>("UYU");
  const currency = currencies.includes(pickedCurrency) ? pickedCurrency : (currencies[0] ?? "UYU");
  const [kind, setKind] = useState<"expense" | "income">("expense");

  const scoped = useMemo(
    () => rows.filter((r) => isSelected(selection, r.accountId) && lk.currencyOf(r.accountId) === currency),
    [rows, selection, lk, currency],
  );
  const monthRows = useMemo(() => scoped.filter((r) => r.date.startsWith(month)), [scoped, month]);
  const evolution = useMemo(() => byMonth(scoped, months), [scoped, months]);
  const cats = useMemo(() => byCategory(monthRows, kind), [monthRows, kind]);

  const cur = evolution[evolution.length - 1];
  const prev = evolution[evolution.length - 2];
  const total = kind === "expense" ? cur.expense : cur.income;

  return (
    <>
      <PageHeader title="Informes" tabs={<GastosTabs />} />

      <main className="mx-auto grid max-w-3xl gap-8 px-4 pt-2 pb-8 lg:px-8 lg:pt-6">
        {/* Filtros: una sola fila arriba de todo lo que afectan. */}
        <section className="grid gap-3 lg:grid-cols-[1fr_minmax(0,320px)] lg:items-center">
          <div className="flex flex-wrap items-center gap-3">
            <div className="-ml-2.5">
              <MonthNav month={month} basePath="/gastos/informes" current={today.slice(0, 7)} />
            </div>
            {currencies.length > 1 && (
              <div className="w-40">
                <Segmented
                  value={currency}
                  onChange={setCurrency}
                  options={currencies.map((c) => ({ value: c, label: c }))}
                />
              </div>
            )}
          </div>
          <AccountSwitcher accounts={accounts} selection={selection} onChange={setSelection} />
        </section>

        <section className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
          <Stat label="Gastos" cents={cur.expense} prevCents={prev?.expense} currency={currency} upIsGood={false} hero />
          <Stat label="Ingresos" cents={cur.income} prevCents={prev?.income} currency={currency} upIsGood />
          <Stat label="Neto" cents={cur.income - cur.expense} currency={currency} signed />
        </section>

        <section className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[15px] font-semibold">Por categoría</h2>
            <div className="w-48">
              <Segmented
                value={kind}
                onChange={setKind}
                options={[
                  { value: "expense", label: "Gastos" },
                  { value: "income", label: "Ingresos" },
                ]}
              />
            </div>
          </div>
          {cats.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">
              No hay {kind === "expense" ? "gastos" : "ingresos"} en {currency} este mes.
            </p>
          ) : (
            <CategoryBars
              items={cats.map((c) => ({
                key: c.categoryId ?? "none",
                category: lk.category(c.categoryId),
                cents: c.cents,
              }))}
              total={total}
              currency={currency}
              color={kind === "expense" ? "var(--fin-out)" : "var(--fin-in)"}
            />
          )}
        </section>

        <section className="grid gap-3">
          <h2 className="text-[15px] font-semibold">Últimos {months.length} meses</h2>
          <MonthlyColumns data={evolution} current={month} currency={currency} />
        </section>
      </main>
    </>
  );
}

// ─── Cifras ─────────────────────────────────────────────────────────────────

function Stat({
  label,
  cents,
  prevCents,
  currency,
  upIsGood,
  signed,
  hero,
}: {
  label: string;
  cents: number;
  prevCents?: number;
  currency: string;
  upIsGood?: boolean;
  signed?: boolean;
  hero?: boolean;
}) {
  const delta = prevCents !== undefined && prevCents > 0 ? (cents - prevCents) / prevCents : null;
  const good = delta !== null && (upIsGood ? delta >= 0 : delta <= 0);
  return (
    <div className={cx("grid content-start gap-1", hero && "col-span-2 sm:col-span-1")}>
      <span className="text-[13px] text-muted">{label}</span>
      <span className={cx("leading-none font-semibold tracking-tight", hero ? "text-[36px]" : "text-[24px]")}>
        {signed && cents !== 0 ? (cents > 0 ? "+ " : "− ") : ""}
        {moneyCents(cents, currency)}
      </span>
      {delta !== null && Math.abs(delta) >= 0.005 && (
        <span className={cx("inline-flex items-center gap-1 text-[12.5px]", good ? "fin-income" : "text-danger")}>
          {delta > 0 ? <ArrowUpRight size={13} weight="bold" /> : <ArrowDownRight size={13} weight="bold" />}
          {Math.abs(Math.round(delta * 100))}% vs. mes anterior
        </span>
      )}
    </div>
  );
}

// ─── Barras por categoría ───────────────────────────────────────────────────

/**
 * Una sola serie: el color es el del tipo (gasto/ingreso), no el de cada
 * categoría, y la identidad la da el nombre. Valor y porcentaje en texto al
 * final de cada fila, así que nada depende del hover.
 */
function CategoryBars({
  items,
  total,
  currency,
  color,
}: {
  items: { key: string; category?: CategoryDTO; cents: number }[];
  total: number;
  currency: string;
  color: string;
}) {
  const max = Math.max(...items.map((i) => i.cents), 1);
  return (
    <ul className="grid gap-3.5">
      {items.map((it) => {
        const pct = total > 0 ? Math.round((it.cents / total) * 100) : 0;
        const name = it.category?.name ?? "Sin clasificar";
        return (
          <li key={it.key} className="grid grid-cols-[32px_1fr] items-center gap-x-3 gap-y-1.5" title={`${name}: ${moneyCents(it.cents, currency)} (${pct}%)`}>
            <span className="row-span-2">
              <CategoryAvatar category={it.category} size={32} />
            </span>
            <span className="flex items-baseline justify-between gap-3 text-[14px]">
              <span className={cx("truncate", !it.category && "text-muted")}>{name}</span>
              <span className="shrink-0">
                <span className="tabular font-medium">{moneyCents(it.cents, currency)}</span>
                <span className="tabular ml-2 inline-block w-9 text-right text-[12.5px] text-muted">
                  {pct === 0 && it.cents > 0 ? "<1" : pct}%
                </span>
              </span>
            </span>
            <span className="block h-2">
              <span
                className="block h-2 rounded-r-[4px]"
                style={{ width: `${Math.max(1.5, (it.cents / max) * 100)}%`, background: color }}
              />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Evolución mensual ──────────────────────────────────────────────────────

const compact = new Intl.NumberFormat("es-UY", { notation: "compact", maximumFractionDigits: 1 });

/** Tope "redondo" para el eje: 1, 2, 2.5 o 5 por potencia de 10. */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

function shortMonth(m: string): string {
  return new Intl.DateTimeFormat("es-UY", { month: "short", timeZone: "UTC" })
    .format(new Date(`${m}-01T00:00:00Z`))
    .replace(".", "");
}

/**
 * Columnas agrupadas ingreso/gasto por mes. Un solo eje, leyenda siempre,
 * etiqueta directa solo en el mes elegido, tooltip por mes (hover y foco) y
 * la tabla con todos los números debajo.
 */
function MonthlyColumns({
  data,
  current,
  currency,
}: {
  data: { month: string; expense: number; income: number }[];
  current: string;
  currency: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const top = niceMax(Math.max(...data.flatMap((d) => [d.expense, d.income]), 0) / 100);
  const ticks = [top, top / 2, 0];
  const H = 168;
  const h = (cents: number) => (cents <= 0 ? 0 : Math.max(2, (cents / 100 / top) * H));
  const sym = currencySymbol(currency);

  return (
    <div className="grid gap-3">
      <div className="flex gap-4 text-[13px] text-muted">
        <LegendKey color="var(--fin-in)" label="Ingresos" />
        <LegendKey color="var(--fin-out)" label="Gastos" />
      </div>

      <div className="relative grid grid-cols-[auto_1fr] gap-x-2">
        {/* Eje Y con valores redondos */}
        <div className="relative w-14" style={{ height: H }}>
          {ticks.map((t) => (
            <span
              key={t}
              className="tabular absolute right-0 -translate-y-1/2 text-[11px] whitespace-nowrap text-muted"
              style={{ top: H - (t / top) * H }}
            >
              {t === 0 ? "0" : `${sym} ${compact.format(t)}`}
            </span>
          ))}
        </div>

        <div className="relative" style={{ height: H }}>
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute inset-x-0 h-px"
              style={{ top: H - (t / top) * H, background: t === 0 ? "var(--border-strong)" : "var(--fin-grid)" }}
            />
          ))}
          <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${data.length}, 1fr)` }}>
            {data.map((d, i) => {
              const selected = d.month === current;
              return (
                <button
                  key={d.month}
                  type="button"
                  aria-label={`${formatMonth(d.month)}: ingresos ${moneyCents(d.income, currency)}, gastos ${moneyCents(d.expense, currency)}`}
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover((x) => (x === i ? null : x))}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover((x) => (x === i ? null : x))}
                  className={cx(
                    "relative flex items-end justify-center gap-[2px] rounded-t-md outline-none transition-colors",
                    hover === i && "bg-surface-2/70",
                  )}
                >
                  {/* Solo el gasto lleva etiqueta: dos cifras lado a lado chocan en el celular. */}
                  <Column cents={d.income} height={h(d.income)} color="var(--fin-in)" label={false} />
                  <Column cents={d.expense} height={h(d.expense)} color="var(--fin-out)" label={selected} />
                </button>
              );
            })}
          </div>

          {hover !== null && (
            <div
              className="pointer-events-none absolute top-0 z-10 grid min-w-40 gap-1 rounded-[10px] border border-line bg-surface p-2.5 text-[12.5px] shadow-[0_4px_16px_-6px_rgba(0,0,0,0.12)]"
              style={{
                left: `${((hover + 0.5) / data.length) * 100}%`,
                transform: `translateX(${hover >= data.length / 2 ? "-105%" : "5%"})`,
              }}
            >
              <span className="text-muted first-letter:uppercase">{formatMonth(data[hover].month)}</span>
              <TooltipRow color="var(--fin-in)" label="Ingresos" value={moneyCents(data[hover].income, currency)} />
              <TooltipRow color="var(--fin-out)" label="Gastos" value={moneyCents(data[hover].expense, currency)} />
            </div>
          )}
        </div>

        <span />
        <div className="grid pt-1.5" style={{ gridTemplateColumns: `repeat(${data.length}, 1fr)` }}>
          {data.map((d) => (
            <span key={d.month} className={cx("text-center text-[12px]", d.month === current ? "font-semibold text-fg" : "text-muted")}>
              {shortMonth(d.month)}
            </span>
          ))}
        </div>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-[13px] text-muted select-none">Ver como tabla</summary>
        <table className="mt-2 w-full text-[13px]">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-1.5 font-normal">Mes</th>
              <th className="py-1.5 text-right font-normal">Ingresos</th>
              <th className="py-1.5 text-right font-normal">Gastos</th>
              <th className="py-1.5 text-right font-normal">Neto</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {data.map((d) => (
              <tr key={d.month} className="border-t border-line">
                <td className="py-1.5 first-letter:uppercase">{formatMonth(d.month)}</td>
                <td className="py-1.5 text-right">{moneyCents(d.income, currency)}</td>
                <td className="py-1.5 text-right">{moneyCents(d.expense, currency)}</td>
                <td className="py-1.5 text-right">
                  {d.income - d.expense < 0 ? "− " : ""}
                  {moneyCents(d.income - d.expense, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

/** Una columna; en el mes elegido lleva su valor arriba (etiqueta directa selectiva). */
function Column({ cents, height, color, label }: { cents: number; height: number; color: string; label: boolean }) {
  return (
    <span className="relative block w-[clamp(8px,28%,24px)] rounded-t-[4px]" style={{ height, background: color }}>
      {label && cents > 0 && (
        <span className="tabular pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 text-[10.5px] font-medium whitespace-nowrap text-fg">
          {compact.format(cents / 100)}
        </span>
      )}
    </span>
  );
}

function LegendKey({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2.5 rounded-[3px]" style={{ background: color }} />
      {label}
    </span>
  );
}

function TooltipRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-0.5 w-3 rounded-full" style={{ background: color }} />
      <span className="tabular font-semibold">{value}</span>
      <span className="text-muted">{label}</span>
    </span>
  );
}
