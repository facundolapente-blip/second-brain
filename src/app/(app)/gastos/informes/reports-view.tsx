"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight, ChartBar } from "@phosphor-icons/react";
import { addDays, formatMonth, monthBounds, shiftMonth, weekday } from "@/lib/dates";
import { currencySymbol, moneyCents } from "@/lib/format";
import {
  byCategory,
  byMonth,
  isSelected,
  type AccountDTO,
  type CategoryDTO,
  type FlowRow,
  type Period,
} from "@/lib/finance-logic";
import { PageHeader } from "@/components/page-header";
import { cx, Segmented } from "@/components/ui";
import { AccountChips, AccountSwitcher } from "../account-switcher";
import { GastosTabs } from "../gastos-nav";
import { useSelection } from "../selection";
import { CategoryAvatar, useLookups } from "../shared";
import { PeriodNav } from "../period-nav";

/** En la computadora cada bloque es una tarjeta con el aro y la sombra del tema. */
const CARD =
  "lg:rounded-2xl lg:border lg:border-[var(--card-ring)] lg:bg-surface lg:p-7 lg:shadow-[var(--card-shadow)]";

function daysInMonth(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

function monthName(m: string) {
  return new Intl.DateTimeFormat("es-UY", { month: "long", timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`)).toLowerCase();
}

/**
 * Semilla de la sección de análisis: cifras del mes, ritmo de gasto contra el
 * mes anterior, gasto/ingreso por categoría y evolución de los últimos meses.
 * Se mira una moneda a la vez (no se convierte USD a UYU) y respeta las
 * cuentas elegidas en el selector.
 */
export function ReportsView({
  period,
  month,
  months,
  today,
  accounts,
  categories,
  rows,
}: {
  /** Mes (el de siempre) o año entero. */
  period: Period;
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
  const yearMode = period.kind === "year";
  const year = yearMode ? period.year : month.slice(0, 4);
  const prevYear = String(Number(year) - 1);
  const isCurrentYear = yearMode && year === today.slice(0, 4);
  // Lo que se mira: el mes elegido, o el año entero.
  const periodRows = useMemo(
    () => scoped.filter((r) => (yearMode ? r.date.startsWith(year) : r.date.startsWith(month))),
    [scoped, month, year, yearMode],
  );
  const evolution = useMemo(() => byMonth(scoped, months), [scoped, months]);
  const cats = useMemo(() => byCategory(periodRows, kind), [periodRows, kind]);

  const prevMonth = shiftMonth(month, -1);
  const isCurrent = !yearMode && month === today.slice(0, 7);

  // Año: el anterior (en el año en curso, hasta el mismo día) para comparar total y categorías.
  const prevYearRows = useMemo(
    () => (yearMode ? scoped.filter((r) => r.date.startsWith(prevYear) && (!isCurrentYear || r.date.slice(5) <= today.slice(5))) : []),
    [scoped, yearMode, prevYear, isCurrentYear, today],
  );

  // Promedio de los tres meses anteriores por categoría, para comparar el mes elegido
  // (por año: lo del año anterior).
  const avgPrev = useMemo(() => {
    if (yearMode) {
      const m = new Map<string, number>();
      for (const r of prevYearRows) {
        if (r.kind !== kind) continue;
        const k = r.categoryId ?? "none";
        m.set(k, (m.get(k) ?? 0) + r.cents);
      }
      return m;
    }
    const prev3 = [1, 2, 3].map((n) => shiftMonth(month, -n));
    const m = new Map<string, number>();
    for (const r of scoped) {
      if (r.kind !== kind || !prev3.includes(r.date.slice(0, 7))) continue;
      const k = r.categoryId ?? "none";
      m.set(k, (m.get(k) ?? 0) + r.cents / 3);
    }
    return m;
  }, [scoped, month, kind, yearMode, prevYearRows]);

  // Gasto promedio por día de la semana en toda la ventana (lunes primero).
  const weekdayAvg = useMemo(() => {
    const from = monthBounds(months[0]).from;
    const last = monthBounds(yearMode ? months[11] : month).to;
    const end = last > today ? today : last;
    const count = [0, 0, 0, 0, 0, 0, 0];
    for (let d = from; d <= end; d = addDays(d, 1)) count[(weekday(d) + 6) % 7]++;
    const sum = [0, 0, 0, 0, 0, 0, 0];
    for (const r of scoped) if (r.kind === "expense" && r.date >= from && r.date <= end) sum[(weekday(r.date) + 6) % 7] += r.cents;
    return sum.map((s, i) => (count[i] ? Math.round(s / count[i]) : 0));
  }, [scoped, months, month, yearMode, today]);
  // En el mes en curso se compara contra el anterior hasta el mismo día: comparar
  // 2 días contra un mes entero siempre da "−95%" y no dice nada.
  const cutDay = isCurrent ? Number(today.slice(8)) : 31;
  const prevPartial = useMemo(() => {
    const out = { expense: 0, income: 0 };
    for (const r of scoped) if (r.date.startsWith(prevMonth) && Number(r.date.slice(8)) <= cutDay) out[r.kind] += r.cents;
    return out;
  }, [scoped, prevMonth, cutDay]);

  const yearTotals = useMemo(() => {
    const out = { expense: 0, income: 0 };
    for (const r of periodRows) out[r.kind] += r.cents;
    return out;
  }, [periodRows]);
  const prevYearTotals = useMemo(() => {
    const out = { expense: 0, income: 0 };
    for (const r of prevYearRows) out[r.kind] += r.cents;
    return out;
  }, [prevYearRows]);

  const cur = yearMode ? { month, ...yearTotals } : evolution[evolution.length - 1];
  const prevCmp = yearMode ? prevYearTotals : prevPartial;
  const total = kind === "expense" ? cur.expense : cur.income;
  const daysOfYear = Number(year) % 4 === 0 ? 366 : 365;
  const elapsed = yearMode
    ? isCurrentYear
      ? Math.round((Date.parse(today) - Date.parse(`${year}-01-01`)) / 86_400_000) + 1
      : daysOfYear
    : isCurrent
      ? cutDay
      : daysInMonth(month);
  const compareLabel = yearMode
    ? isCurrentYear
      ? `vs. ${prevYear} a esta altura`
      : `vs. ${prevYear}`
    : isCurrent
      ? `vs. ${shortMonth(prevMonth)} al día ${cutDay}`
      : `vs. ${monthName(prevMonth)}`;
  const empty = cur.expense === 0 && cur.income === 0 && evolution.every((e) => e.expense === 0 && e.income === 0);
  // En modo año se ven los 12 meses también en el celular.
  const phoneEvolution = yearMode ? evolution : evolution.slice(-6);

  return (
    <>
      <PageHeader title="Informes" wide tabs={<GastosTabs />} />

      <main className="mx-auto grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-12 px-4 pt-2 pb-8 lg:max-w-6xl lg:grid-cols-12 lg:gap-5 lg:px-10 lg:pt-6">
        {/* Filtros: una sola fila arriba de todo lo que afectan. */}
        <div className="lg:col-span-12">
          <AccountChips accounts={accounts} selection={selection} onChange={setSelection} />
          <Link
            href="/gastos/proyeccion"
            className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line-strong px-3.5 text-[13px] text-muted transition-colors hover:bg-surface-2 hover:text-fg lg:hidden"
          >
            Ver la proyección de gastos →
          </Link>
        </div>
        <section className="grid gap-3 lg:col-span-12 lg:grid-cols-[1fr_minmax(0,340px)] lg:items-center" aria-label="Filtros">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <PeriodNav key={`${period.from}_${period.to}`} period={period} today={today} basePath="/gastos/informes" modes={["month", "year"]} />
            {currencies.length > 1 && (
              <div className="w-36">
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

        {empty ? (
          <div className="grid justify-items-start gap-2 border-y border-line py-10 lg:col-span-12">
            <span className="inline-flex text-accent-fg">
              <ChartBar size={22} aria-hidden />
            </span>
            <h2 className="display text-[28px]">Sin movimientos en {currency}</h2>
            <p className="max-w-[44ch] text-sm leading-relaxed text-muted">
              No hay gastos ni ingresos {yearMode ? `en ${year}` : "en estos meses"} para las cuentas elegidas. Probá con otra moneda o con todas las cuentas.
            </p>
          </div>
        ) : (
          <>
            <section
              className={`grid grid-cols-2 gap-x-6 gap-y-6 border-y border-line py-6 sm:grid-cols-4 lg:col-span-12 ${CARD}`}
              aria-label={yearMode ? "Cifras del año" : "Cifras del mes"}
            >
              <Stat
                label={isCurrent || isCurrentYear ? "Gastado hasta hoy" : "Gastos"}
                cents={cur.expense}
                prevCents={prevCmp.expense}
                compareLabel={compareLabel}
                currency={currency}
                upIsGood={false}
                hero
              />
              <Stat
                label="Ingresos"
                cents={cur.income}
                prevCents={prevCmp.income}
                compareLabel={compareLabel}
                currency={currency}
                upIsGood
              />
              <Stat label="Neto" cents={cur.income - cur.expense} currency={currency} signed />
              <Stat label="Gasto por día" cents={Math.round(cur.expense / Math.max(1, elapsed) / 100) * 100} currency={currency} hint={`en ${elapsed} días`} />
            </section>

            <div className="grid content-start gap-12 lg:col-span-7 lg:gap-5">
              {!yearMode && (
              <section className={`grid content-start gap-3 ${CARD}`}>
                <div className="grid gap-0.5">
                  <h2 className="display text-[28px]">Ritmo del mes</h2>
                  <p className="text-[14px] text-muted">Gasto acumulado día a día contra {monthName(prevMonth)}.</p>
                </div>
                <PaceChart rows={scoped} month={month} prevMonth={prevMonth} lastDay={isCurrent ? cutDay : daysInMonth(month)} currency={currency} />
              </section>
              )}

              <section className={`grid content-start gap-3 ${CARD}`}>
                <div className="grid gap-0.5">
                  <h2 className="display text-[28px]">Qué días gastás</h2>
                  <p className="text-[14px] text-muted">
                    {yearMode
                      ? `Gasto promedio por día de la semana en ${year}.`
                      : `Gasto promedio por día de la semana, desde ${monthName(months[0])} de ${months[0].slice(0, 4)}.`}
                  </p>
                </div>
                <WeekdaySpend values={weekdayAvg} currency={currency} />
              </section>
            </div>

            <section className={`grid content-start gap-4 lg:col-span-5 ${CARD}`}>
              <div className="flex items-center justify-between gap-3">
                <h2 className="display text-[28px]">Por categoría</h2>
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
                  No hay {kind === "expense" ? "gastos" : "ingresos"} en {currency} {yearMode ? `en ${year}` : "este mes"}.
                </p>
              ) : (
                <CategoryBars
                  items={cats.map((c) => ({
                    key: c.categoryId ?? "none",
                    category: lk.category(c.categoryId),
                    cents: c.cents,
                    avg: avgPrev.get(c.categoryId ?? "none") ?? 0,
                  }))}
                  total={total}
                  currency={currency}
                  color={kind === "expense" ? "var(--fin-out)" : "var(--fin-in)"}
                  vsLabel={yearMode ? (isCurrentYear ? `${prevYear} a esta altura` : prevYear) : undefined}
                />
              )}
            </section>

            <section className={`grid content-start gap-3 lg:col-span-12 ${CARD}`}>
              <h2 className="display text-[28px]">
                {yearMode ? (
                  `Mes a mes en ${year}`
                ) : (
                  <>
                    Últimos <span className="lg:hidden">{Math.min(6, months.length)}</span>
                    <span className="hidden lg:inline">{months.length}</span> meses
                  </>
                )}
              </h2>
              <div className="lg:hidden">
                <MonthlyColumns data={phoneEvolution} current={month} currency={currency} />
              </div>
              <div className="hidden lg:block">
                <MonthlyColumns data={evolution} current={month} currency={currency} height={220} />
              </div>
            </section>

            <section className={`grid content-start gap-3 lg:col-span-12 ${CARD}`}>
              <div className="grid gap-0.5">
                <h2 className="display text-[28px]">{yearMode ? `Ahorro por mes en ${year}` : "Ahorro por mes"}</h2>
                <p className="text-[14px] text-muted">Ingresos menos gastos. Arriba de la línea sobró, abajo faltó.</p>
              </div>
              <div className="lg:hidden">
                <NetColumns data={phoneEvolution} current={month} currency={currency} />
              </div>
              <div className="hidden lg:block">
                <NetColumns data={evolution} current={month} currency={currency} height={200} />
              </div>
            </section>
          </>
        )}
      </main>
    </>
  );
}

// ─── Cifras ─────────────────────────────────────────────────────────────────

function Stat({
  label,
  cents,
  prevCents,
  compareLabel,
  currency,
  upIsGood,
  signed,
  hero,
  hint,
}: {
  label: string;
  cents: number;
  prevCents?: number;
  compareLabel?: string;
  currency: string;
  upIsGood?: boolean;
  signed?: boolean;
  hero?: boolean;
  hint?: string;
}) {
  const delta = prevCents !== undefined && prevCents > 0 ? (cents - prevCents) / prevCents : null;
  const good = delta !== null && (upIsGood ? delta >= 0 : delta <= 0);
  return (
    <div className={cx("grid content-start gap-1", hero && "col-span-2 sm:col-span-1")}>
      <span className="kicker">{label}</span>
      {/* Siempre en un renglón: las cifras largas (un año entero) van un poco más chicas. */}
      <span
        className={cx(
          "figure pt-1 whitespace-nowrap",
          hero
            ? moneyCents(cents, currency).length > 11
              ? "text-[32px] lg:text-[36px]"
              : "text-[44px]"
            : moneyCents(cents, currency).length > 11
              ? "text-[22px] lg:text-[24px]"
              : "text-[28px]",
        )}
      >
        {signed && cents !== 0 ? (cents > 0 ? "+ " : "− ") : ""}
        {moneyCents(cents, currency)}
      </span>
      {delta !== null && Math.abs(delta) >= 0.005 ? (
        <span className={cx("inline-flex items-center gap-1 text-[12.5px]", good ? "fin-income" : "text-danger")}>
          {delta > 0 ? <ArrowUpRight size={13} weight="bold" aria-hidden /> : <ArrowDownRight size={13} weight="bold" aria-hidden />}
          <span>
            {delta > 0 ? "+" : "−"}
            {Math.abs(Math.round(delta * 100))}% <span className="text-muted">{compareLabel}</span>
          </span>
        </span>
      ) : (
        hint && <span className="text-[12.5px] text-muted">{hint}</span>
      )}
    </div>
  );
}

// ─── Ritmo del mes ──────────────────────────────────────────────────────────

/**
 * Gasto acumulado por día: el mes elegido en el color del gasto y el anterior
 * en gris (énfasis en uno, contexto en el otro). Un solo eje, leyenda, valor
 * directo solo al final de cada línea, cruz que sigue al puntero (también con
 * flechas del teclado) y tabla con todos los números.
 */
function PaceChart({
  rows,
  month,
  prevMonth,
  lastDay,
  currency,
}: {
  rows: FlowRow[];
  month: string;
  prevMonth: string;
  /** Último día con datos del mes elegido (hoy, si es el mes en curso). */
  lastDay: number;
  currency: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const span = Math.max(daysInMonth(month), daysInMonth(prevMonth));

  const { curSeries, prevSeries } = useMemo(() => {
    const a = new Array(span + 1).fill(0);
    const b = new Array(span + 1).fill(0);
    for (const r of rows) {
      if (r.kind !== "expense") continue;
      const d = Number(r.date.slice(8));
      if (r.date.startsWith(month)) a[d] += r.cents;
      else if (r.date.startsWith(prevMonth)) b[d] += r.cents;
    }
    for (let i = 1; i <= span; i++) {
      a[i] += a[i - 1];
      b[i] += b[i - 1];
    }
    return {
      curSeries: a.slice(0, lastDay + 1),
      prevSeries: b.slice(0, daysInMonth(prevMonth) + 1),
    };
  }, [rows, month, prevMonth, span, lastDay]);

  const top = niceMax(Math.max(curSeries.at(-1) ?? 0, prevSeries.at(-1) ?? 0) / 100);
  const W = 600;
  const H = 180;
  const x = (d: number) => (d / span) * W;
  const y = (cents: number) => H - (cents / 100 / top) * H;
  const path = (s: number[]) => s.map((v, d) => `${d === 0 ? "M" : "L"}${x(d).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const sym = currencySymbol(currency);
  const ticks = [top, top / 2, 0];
  const curEnd = curSeries.length - 1;
  const prevEnd = prevSeries.length - 1;

  function pick(clientX: number) {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    const d = Math.round(((clientX - r.left) / r.width) * span);
    setHover(Math.min(span, Math.max(1, d)));
  }

  const h = hover;
  const pct = (d: number) => `${(d / span) * 100}%`;
  const topPct = (cents: number) => `${(y(cents) / H) * 100}%`;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted">
        <LegendLine color="var(--fin-out)" label={formatMonth(month)} />
        <LegendLine color="var(--faint)" label={formatMonth(prevMonth)} />
      </div>

      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2">
        <div className="relative w-14" style={{ height: H }} aria-hidden>
          {ticks.map((t) => (
            <span
              key={t}
              className="tabular absolute right-0 -translate-y-1/2 text-[11px] whitespace-nowrap text-muted"
              style={{ top: topPct(t * 100) }}
            >
              {t === 0 ? "0" : `${sym} ${compact.format(t)}`}
            </span>
          ))}
        </div>

        <div
          ref={box}
          role="img"
          tabIndex={0}
          aria-label={`Gasto acumulado: ${formatMonth(month)} ${moneyCents(curSeries[curEnd], currency)} al día ${curEnd}; ${formatMonth(prevMonth)} ${moneyCents(prevSeries[prevEnd], currency)} en total.`}
          onPointerMove={(e) => pick(e.clientX)}
          onPointerDown={(e) => pick(e.clientX)}
          onPointerLeave={() => setHover(null)}
          onBlur={() => setHover(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") setHover((v) => Math.min(span, (v ?? curEnd) + 1));
            else if (e.key === "ArrowLeft") setHover((v) => Math.max(1, (v ?? curEnd) - 1));
            else if (e.key === "Escape") setHover(null);
            else return;
            e.preventDefault();
          }}
          className="relative touch-pan-y rounded-[4px] outline-offset-4"
          style={{ height: H }}
        >
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute inset-x-0 h-px"
              style={{ top: topPct(t * 100), background: t === 0 ? "var(--border-strong)" : "var(--fin-grid)" }}
            />
          ))}
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden>
            <path d={path(prevSeries)} fill="none" stroke="var(--faint)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            <path
              d={`${path(curSeries)} L${x(curEnd).toFixed(1)},${H} L0,${H} Z`}
              fill="var(--fin-out)"
              fillOpacity={0.1}
              stroke="none"
            />
            <path d={path(curSeries)} fill="none" stroke="var(--fin-out)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>

          {/* Puntos finales con anillo del color de fondo, en HTML para que no se deformen. */}
          <Dot left={pct(prevEnd)} top={topPct(prevSeries[prevEnd])} color="var(--faint)" />
          <Dot left={pct(curEnd)} top={topPct(curSeries[curEnd])} color="var(--fin-out)" />
          {h === null && (
            <span
              className="tabular pointer-events-none absolute text-[11px] font-medium whitespace-nowrap text-fg"
              style={{
                left: pct(curEnd),
                top: topPct(curSeries[curEnd]),
                transform: `translate(${curEnd > span * 0.75 ? "calc(-100% - 8px)" : "8px"}, -130%)`,
              }}
            >
              {compact.format(curSeries[curEnd] / 100)}
            </span>
          )}

          {h !== null && (
            <>
              <span className="pointer-events-none absolute inset-y-0 w-px bg-line-strong" style={{ left: pct(h) }} />
              {h <= curEnd && <Dot left={pct(h)} top={topPct(curSeries[h])} color="var(--fin-out)" />}
              {h <= prevEnd && <Dot left={pct(h)} top={topPct(prevSeries[h])} color="var(--faint)" />}
              <div
                className="lift pointer-events-none absolute top-0 z-10 grid min-w-44 gap-1 rounded-[4px] border border-line-strong bg-surface p-2.5 text-[12.5px]"
                style={{ left: pct(h), transform: `translateX(${h > span / 2 ? "calc(-100% - 10px)" : "10px"})` }}
              >
                <span className="text-muted">Día {h}</span>
                <TooltipRow color="var(--fin-out)" label={monthName(month)} value={h <= curEnd ? moneyCents(curSeries[h], currency) : "Sin datos"} />
                <TooltipRow color="var(--faint)" label={monthName(prevMonth)} value={h <= prevEnd ? moneyCents(prevSeries[h], currency) : "Sin datos"} />
              </div>
            </>
          )}
        </div>

        <span />
        <div className="relative h-5 pt-1.5 text-[11px] text-muted" aria-hidden>
          {[1, 10, 20, span].map((d) => (
            <span key={d} className="tabular absolute -translate-x-1/2" style={{ left: pct(d) }}>
              {d}
            </span>
          ))}
        </div>
      </div>

      <details className="text-sm">
        <summary className="kicker inline-flex min-h-11 cursor-pointer items-center select-none hover:text-fg">Ver como tabla</summary>
        <div className="mt-2 max-h-72 overflow-y-auto">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-bg">
              <tr className="text-left text-muted">
                <th className="py-1.5 font-normal">Día</th>
                <th className="py-1.5 text-right font-normal first-letter:uppercase">{monthName(month)}</th>
                <th className="py-1.5 text-right font-normal first-letter:uppercase">{monthName(prevMonth)}</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {Array.from({ length: span }, (_, i) => i + 1).map((d) => (
                <tr key={d} className="border-t border-line">
                  <td className="py-1.5">{d}</td>
                  <td className="py-1.5 text-right">{d <= curEnd ? moneyCents(curSeries[d], currency) : ""}</td>
                  <td className="py-1.5 text-right">{d <= prevEnd ? moneyCents(prevSeries[d], currency) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function Dot({ left, top, color }: { left: string; top: string; color: string }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-bg"
      style={{ left, top, background: color }}
    />
  );
}

function LegendLine({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 first-letter:uppercase">
      <span className="h-0.5 w-4 rounded-full" style={{ background: color }} aria-hidden />
      <span className="first-letter:uppercase">{label}</span>
    </span>
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
  vsLabel,
}: {
  /** avg: promedio de los tres meses anteriores (o lo del año anterior), para el "vs." de cada fila. */
  items: { key: string; category?: CategoryDTO; cents: number; avg?: number }[];
  total: number;
  currency: string;
  color: string;
  /** Contra qué se compara (por año: "2025"); sin esto, el promedio de 3 meses. */
  vsLabel?: string;
}) {
  const max = Math.max(...items.map((i) => i.cents), 1);
  // Las primeras ocho a la vista; el resto, plegado, para que la lista no se coma la pantalla.
  const TOP = 8;
  const row = (it: (typeof items)[number], i: number) => {
        const pct = total > 0 ? Math.round((it.cents / total) * 100) : 0;
        const name = it.category?.name ?? "Sin clasificar";
        return (
          <li
            key={it.key}
            className="rise grid grid-cols-[32px_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5"
            style={{ "--i": Math.min(i, 8) } as React.CSSProperties}
          >
            <span className="row-span-2">
              <CategoryAvatar category={it.category} size={32} />
            </span>
            <span className="flex items-baseline justify-between gap-3 text-[14px]">
              <span className={cx("truncate", !it.category && "text-muted")}>{name}</span>
              <span className="shrink-0">
                <span className="font-mono text-[13.5px] font-medium tabular">{moneyCents(it.cents, currency)}</span>
                <span className="tabular ml-2 inline-block w-9 text-right text-[12.5px] text-muted">
                  {pct === 0 && it.cents > 0 ? "<1" : pct}%
                </span>
              </span>
            </span>
            <span className="block h-2" aria-hidden>
              <span
                className="block h-2 rounded-r-[4px]"
                style={{ width: `${Math.max(1.5, (it.cents / max) * 100)}%`, background: color }}
              />
            </span>
            {it.avg !== undefined && (
              <span className="col-start-2">
                <VsAverage cents={it.cents} avg={it.avg} vsLabel={vsLabel} />
              </span>
            )}
          </li>
        );
  };
  return (
    <div className="grid gap-3.5">
      <ul className="grid gap-3.5">{items.slice(0, TOP).map(row)}</ul>
      {items.length > TOP && (
        <details className="group">
          <summary className="kicker inline-flex min-h-11 cursor-pointer items-center select-none hover:text-fg">
            <span className="group-open:hidden">Ver {items.length - TOP} más</span>
            <span className="hidden group-open:inline">Ver menos</span>
          </summary>
          <ul className="mt-2 grid gap-3.5">{items.slice(TOP).map((it, i) => row(it, i + TOP))}</ul>
        </details>
      )}
    </div>
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
    .replace(".", "")
    .toLowerCase();
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
  height = 168,
}: {
  data: { month: string; expense: number; income: number }[];
  current: string;
  currency: string;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const top = niceMax(Math.max(...data.flatMap((d) => [d.expense, d.income]), 0) / 100);
  const ticks = [top, top / 2, 0];
  const H = height;
  const h = (cents: number) => (cents <= 0 ? 0 : Math.max(2, (cents / 100 / top) * H));
  const sym = currencySymbol(currency);

  return (
    <div className="grid gap-3">
      <div className="flex gap-4 text-[13px] text-muted">
        <LegendKey color="var(--fin-in)" label="Ingresos" />
        <LegendKey color="var(--fin-out)" label="Gastos" />
      </div>

      <div className="relative grid grid-cols-[auto_minmax(0,1fr)] gap-x-2">
        {/* Eje Y con valores redondos */}
        <div className="relative w-14" style={{ height: H }} aria-hidden>
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
          <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}>
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
                    "relative flex items-end justify-center gap-[2px] rounded-t-md transition-colors",
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
              className="lift pointer-events-none absolute top-0 z-10 grid min-w-40 gap-1 rounded-[4px] border border-line-strong bg-surface p-2.5 text-[12.5px]"
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
        <div className="grid pt-1.5" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }} aria-hidden>
          {data.map((d) => (
            <span key={d.month} className={cx("text-center font-mono text-[10.5px] uppercase", d.month === current ? "font-semibold text-fg" : "text-muted")}>
              {shortMonth(d.month)}
            </span>
          ))}
        </div>
      </div>

      <details className="text-sm">
        <summary className="kicker inline-flex min-h-11 cursor-pointer items-center select-none hover:text-fg">Ver como tabla</summary>
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
      <span className="size-2.5 rounded-[3px]" style={{ background: color }} aria-hidden />
      {label}
    </span>
  );
}

function TooltipRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-0.5 w-3 rounded-full" style={{ background: color }} />
      <span className="tabular font-semibold">{value}</span>
      <span className="text-muted first-letter:uppercase">{label}</span>
    </span>
  );
}

// ─── Comparación con el promedio ────────────────────────────────────────────

/** "+23% vs. promedio": texto neutro (en gastos subir es malo, en ingresos bueno; la flecha no juzga). */
function VsAverage({ cents, avg, vsLabel }: { cents: number; avg: number; vsLabel?: string }) {
  if (avg <= 0)
    return <span className="text-[12px] text-muted">{vsLabel ? `Nueva: sin movimientos en ${vsLabel}` : "Nueva: sin movimientos en los 3 meses anteriores"}</span>;
  const delta = (cents - avg) / avg;
  const pct = Math.round(Math.abs(delta) * 100);
  if (pct < 1) return <span className="text-[12px] text-muted">{vsLabel ? `Igual que en ${vsLabel}` : "Igual que el promedio de 3 meses"}</span>;
  return (
    <span className="inline-flex items-center gap-1 text-[12px] text-muted">
      {delta > 0 ? <ArrowUpRight size={12} weight="bold" aria-hidden /> : <ArrowDownRight size={12} weight="bold" aria-hidden />}
      <span className="tabular">
        {delta > 0 ? "+" : "−"}
        {pct}% vs. {vsLabel ?? "promedio de 3 meses"}
      </span>
    </span>
  );
}

// ─── Días de la semana ──────────────────────────────────────────────────────

const WEEKDAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

/**
 * Gasto promedio por día de la semana. Una sola serie: el día más caro en el
 * color del gasto y el resto en un tono suave; el monto va escrito en cada fila.
 */
function WeekdaySpend({ values, currency }: { values: number[]; currency: string }) {
  const round = (c: number) => (currency === "UYU" ? Math.round(c / 100) * 100 : c);
  const max = Math.max(1, ...values);
  const top = values.indexOf(Math.max(...values));
  if (values.every((v) => v === 0)) return <p className="py-6 text-sm text-muted">Sin gastos en {currency} en este período.</p>;
  return (
    <ul className="grid gap-1">
      {values.map((v, i) => (
        <li key={i} className="grid grid-cols-[5.5rem_minmax(0,1fr)_5.5rem] items-center gap-3 py-1 text-[14px]">
          <span className={cx(i === top ? "font-medium text-fg" : "text-muted")}>{WEEKDAYS[i]}</span>
          <span className="block h-2.5" aria-hidden>
            <span
              className="block h-2.5 rounded-r-[4px]"
              style={{
                width: `${Math.max(1.5, (v / max) * 100)}%`,
                background: i === top ? "var(--fin-out)" : "color-mix(in oklab, var(--fin-out) 42%, var(--surface))",
              }}
            />
          </span>
          <span className="text-right font-mono text-[12.5px] tabular">{moneyCents(round(v), currency)}</span>
        </li>
      ))}
    </ul>
  );
}

// ─── Ahorro por mes ─────────────────────────────────────────────────────────

/**
 * Neto de cada mes (ingresos menos gastos) como columnas divergentes desde una
 * línea de cero neutra: arriba lo que sobró (color del ingreso), abajo lo que
 * faltó (color del gasto). Un solo eje, leyenda, valor directo solo en el mes
 * elegido, lectura al pasar o enfocar y tabla.
 */
function NetColumns({
  data,
  current,
  currency,
  height = 150,
}: {
  data: { month: string; expense: number; income: number }[];
  current: string;
  currency: string;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const nets = data.map((d) => d.income - d.expense);
  const top = niceMax(Math.max(1, ...nets.map((n) => Math.abs(n))) / 100);
  const hi = nets.some((n) => n > 0) || nets.every((n) => n === 0) ? top : 0;
  const lo = nets.some((n) => n < 0) ? -top : 0;
  const H = height;
  /** Píxeles desde arriba para un monto en centavos. */
  const yOf = (cents: number) => ((hi - cents / 100) / (hi - lo || 1)) * H;
  const base = yOf(0);
  const sym = currencySymbol(currency);
  const ticks = [hi, 0, lo].filter((t, i, a) => a.indexOf(t) === i);
  const shownIdx = hover ?? data.findIndex((d) => d.month === current);
  const word = (n: number) => (n > 0 ? "sobró" : n < 0 ? "faltó" : "quedó en cero");

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="flex gap-4 text-[13px] text-muted">
          <LegendKey color="var(--fin-in)" label="Sobró" />
          <LegendKey color="var(--fin-out)" label="Faltó" />
        </div>
        <p className="tabular min-h-5 text-[13px] text-muted first-letter:uppercase" aria-live="polite">
          {shownIdx >= 0 &&
            `${formatMonth(data[shownIdx].month)}: ${word(nets[shownIdx])}${nets[shownIdx] !== 0 ? ` ${moneyCents(nets[shownIdx], currency)}` : ""}`}
        </p>
      </div>

      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2">
        <div className="relative w-14" style={{ height: H }} aria-hidden>
          {ticks.map((t) => (
            <span
              key={t}
              className="tabular absolute right-0 -translate-y-1/2 text-[11px] whitespace-nowrap text-muted"
              style={{ top: yOf(t * 100) }}
            >
              {t === 0 ? "0" : `${t < 0 ? "−" : ""}${sym} ${compact.format(Math.abs(t))}`}
            </span>
          ))}
        </div>

        <div className="relative" style={{ height: H }}>
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute inset-x-0 h-px"
              style={{ top: yOf(t * 100), background: t === 0 ? "var(--border-strong)" : "var(--fin-grid)" }}
            />
          ))}
          <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}>
            {data.map((d, i) => {
              const n = nets[i];
              const y = yOf(n);
              const selected = d.month === current;
              return (
                <button
                  key={d.month}
                  type="button"
                  aria-label={`${formatMonth(d.month)}: ${word(n)} ${moneyCents(n, currency)}`}
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover((x) => (x === i ? null : x))}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover((x) => (x === i ? null : x))}
                  className={cx("relative rounded-md transition-colors", hover === i && "bg-surface-2/70")}
                >
                  {n !== 0 && (
                    <span
                      className={cx(
                        "absolute left-1/2 w-[clamp(10px,40%,34px)] -translate-x-1/2",
                        n > 0 ? "rounded-t-[4px]" : "rounded-b-[4px]",
                      )}
                      style={{
                        top: n > 0 ? y : base,
                        height: Math.max(2, Math.abs(base - y)),
                        background: n > 0 ? "var(--fin-in)" : "var(--fin-out)",
                      }}
                    >
                      {selected && (
                        <span
                          className={cx(
                            "tabular pointer-events-none absolute left-1/2 -translate-x-1/2 text-[10.5px] font-medium whitespace-nowrap text-fg",
                            n > 0 ? "bottom-full mb-1" : "top-full mt-1",
                          )}
                        >
                          {n < 0 ? "−" : "+"}
                          {compact.format(Math.abs(n) / 100)}
                        </span>
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <span />
        <div className="grid pt-1.5" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }} aria-hidden>
          {data.map((d) => (
            <span key={d.month} className={cx("text-center font-mono text-[10.5px] uppercase", d.month === current ? "font-semibold text-fg" : "text-muted")}>
              {shortMonth(d.month)}
            </span>
          ))}
        </div>
      </div>

      <details className="text-sm">
        <summary className="kicker inline-flex min-h-11 cursor-pointer items-center select-none hover:text-fg">Ver como tabla</summary>
        <table className="mt-2 w-full text-[13px]">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-1.5 font-normal">Mes</th>
              <th className="py-1.5 text-right font-normal">Ahorro</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {data.map((d, i) => (
              <tr key={d.month} className="border-t border-line">
                <td className="py-1.5 first-letter:uppercase">{formatMonth(d.month)}</td>
                <td className="py-1.5 text-right">
                  {nets[i] < 0 ? "− " : nets[i] > 0 ? "+ " : ""}
                  {moneyCents(nets[i], currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
