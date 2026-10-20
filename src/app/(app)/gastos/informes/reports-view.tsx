"use client";

import { useChangeMotion, useSwap } from "@/components/motion";
import { PointerTrack, useDraw } from "../motion";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { quiet } from "@/components/safe-action";
import { saveReportRate } from "@/lib/offline/finance";
import { ArrowDownLeft, ArrowDownRight, ArrowSquareOut, ArrowUpRight, CalendarBlank, CaretDown, ChartBar, ChartLineUp, ChartPieSlice, Scales, TrendUp, type Icon } from "@phosphor-icons/react";
import { StatTile, TintedCard } from "@/components/tinted-card";
import { addDays, formatMonth, monthBounds, shiftMonth, weekday } from "@/lib/dates";
import { currencySymbol, moneyCents, shortNumber, moneyWhole } from "@/lib/format";
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
import { CategoryAvatar, EmptyBlock, MiniBars, useLookups } from "../shared";
import { PeriodNav } from "../period-nav";
import { NavDim, usePeriodSwipe } from "../period-step";
import { normTitle } from "@/lib/smart-logic";

const ALL = "ALL";

/**
 * Cotización de "Todo en pesos": "US$ 1 = $ 40,5", editable, con "Usar la de hoy".
 * Se guarda al salir del campo o con Enter (se recuerda para la próxima vez).
 */
function RateField({ rate, todayUsd, onChange }: { rate: number; todayUsd: number | null; onChange: (n: number) => void }) {
  const fmt = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");
  const [text, setText] = useState(fmt(rate));
  // La última guardada: mientras se escribe las cifras cambian, pero se guarda al terminar.
  const saved = useRef(rate);
  const read = (t: string) => {
    const s = t.trim();
    const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
    return Number.isFinite(n) && n > 0 && n < 100000 ? n : null;
  };
  function commit(n: number | null) {
    if (n === null) {
      setText(fmt(saved.current));
      onChange(saved.current);
      return;
    }
    setText(fmt(n));
    onChange(n);
    if (n !== saved.current) {
      saved.current = n;
      quiet(saveReportRate(n));
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-[13px]">
      <label className="inline-flex h-10 items-center gap-1.5 rounded-full border border-line-strong bg-surface pr-1 pl-3.5 focus-within:border-accent">
        <span className="whitespace-nowrap text-muted">US$ 1 = $</span>
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const n = read(e.target.value);
            if (n !== null) onChange(n);
          }}
          onBlur={() => commit(read(text))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit(read(text));
            }
          }}
          inputMode="decimal"
          aria-label="Cotización del dólar, en pesos"
          className="h-8 w-16 bg-transparent font-mono tabular outline-none"
        />
      </label>
      {todayUsd !== null && Math.abs(todayUsd - rate) >= 0.005 && (
        <button
          type="button"
          onClick={() => commit(Math.round(todayUsd * 100) / 100)}
          className="inline-flex h-10 items-center rounded-full px-3 whitespace-nowrap text-muted transition-colors hover:bg-surface-2 hover:text-fg"
        >
          Usar la de hoy ({fmt(todayUsd)})
        </button>
      )}
    </div>
  );
}


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
 * Se mira una moneda a la vez o "Todo en pesos" (los dólares, con una cotización
 * elegida que se recuerda: 40,5 de entrada o "Usar la de hoy"), y respeta las cuentas
 * elegidas en el selector.
 */
export function ReportsView({
  period,
  month,
  months,
  today,
  accounts,
  categories,
  rows,
  reportRate,
  todayRates,
}: {
  /** Mes (el de siempre) o año entero. */
  period: Period;
  month: string;
  months: string[];
  today: string;
  accounts: AccountDTO[];
  categories: CategoryDTO[];
  rows: FlowRow[];
  /** Pesos por dólar para "Todo en pesos" (guardada). */
  reportRate: number;
  /** Cotización de hoy (pesos por unidad de cada moneda). */
  todayRates: Record<string, number>;
}) {
  const { selection, scope, setSelection } = useSelection(accounts);
  // Deslizar de costado cambia de mes o de año, como las flechas (no sobre los gráficos).
  const swipe = usePeriodSwipe();
  const lk = useLookups(accounts, categories);

  const currencies = useMemo(() => {
    const set = new Set(accounts.filter((a) => isSelected(scope, a.id) && !a.archived).map((a) => a.currency));
    return [...set].sort((a, b) => (a === "UYU" ? -1 : b === "UYU" ? 1 : a.localeCompare(b)));
  }, [accounts, scope]);
  const [pickedCurrency, setCurrency] = useState<string>("UYU");
  // "ALL" = todo en pesos: cada moneda pasada a pesos (los dólares con `rate`).
  const allPesos = pickedCurrency === ALL && currencies.length > 1;
  const currency = allPesos ? "UYU" : currencies.includes(pickedCurrency) ? pickedCurrency : (currencies[0] ?? "UYU");
  const [rate, setRate] = useState(reportRate);
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const catSwap = useSwap(`${allPesos ? ALL : currency}-${kind}`);
  // Otro mes o año: las cifras entran desde ese lado y los gráficos se dibujan de nuevo;
  // otras cuentas o moneda: fundido en las cifras y también se dibujan. Al cargar, nada.
  const lens = `${scope?.join(",") ?? "todas"}|${allPesos ? ALL : currency}`;
  const statsMotion = useChangeMotion(period.from, lens);
  const drawKey = `${period.from}|${period.to}|${lens}`;
  const draw = useDraw(drawKey);

  const scoped = useMemo(() => {
    const mine = rows.filter((r) => isSelected(scope, r.accountId));
    if (!allPesos) return mine.filter((r) => lk.currencyOf(r.accountId) === currency);
    return mine.map((r) => {
      const cur = lk.currencyOf(r.accountId);
      if (cur === "UYU") return r;
      const per = cur === "USD" ? rate : (todayRates[cur] ?? 0);
      return { ...r, cents: Math.round(r.cents * per) };
    });
  }, [rows, scope, lk, currency, allPesos, rate, todayRates]);
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

      <main {...swipe} className="mx-auto grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-4 px-4 pt-2 pb-8 lg:max-w-6xl lg:grid-cols-12 lg:gap-5 lg:px-10 lg:pt-6">
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
            <PeriodNav period={period} today={today} basePath="/gastos/informes" modes={["month", "year"]} />
            {currencies.length > 1 && (
              <div className="w-full sm:w-[22rem]">
                <Segmented
                  value={allPesos ? ALL : currency}
                  onChange={setCurrency}
                  options={[...currencies.map((c) => ({ value: c, label: c })), { value: ALL, label: "Todo en pesos" }]}
                />
              </div>
            )}
            {allPesos && <RateField rate={rate} todayUsd={todayRates.USD ?? null} onChange={setRate} />}
          </div>
          <AccountSwitcher accounts={accounts} selection={selection} onChange={setSelection} />
        </section>

        <NavDim className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:col-span-12 lg:grid-cols-12 lg:gap-5">
        {empty ? (
          <EmptyBlock title={`Sin movimientos${allPesos ? "" : ` en ${currency}`}`} icon={<ChartBar size={22} weight="fill" />} className="lg:col-span-12">
            <p className="max-w-[44ch] text-sm leading-relaxed text-muted">
              No hay gastos ni ingresos {yearMode ? `en ${year}` : "en estos meses"} para las cuentas elegidas. Probá con otra moneda o con todas las cuentas.
            </p>
          </EmptyBlock>
        ) : (
          <>
            <section className="lg:col-span-12" aria-label={yearMode ? "Cifras del año" : "Cifras del mes"}>
              <div key={drawKey} className={cx("grid grid-cols-2 gap-3 sm:grid-cols-4 lg:gap-4", statsMotion)}>
              <Stat
                icon={ArrowUpRight}
                label={isCurrent || isCurrentYear ? "Gastado hasta hoy" : "Gastos"}
                cents={cur.expense}
                prevCents={prevCmp.expense}
                compareLabel={compareLabel}
                currency={currency}
                upIsGood={false}
                hero
                bars={[
                  { label: yearMode ? year : shortMonth(month), cents: cur.expense, color: "var(--fin-out)" },
                  { label: yearMode ? prevYear : shortMonth(prevMonth), cents: prevCmp.expense, muted: true },
                ]}
              />
              <Stat
                icon={ArrowDownLeft}
                label="Ingresos"
                cents={cur.income}
                prevCents={prevCmp.income}
                compareLabel={compareLabel}
                currency={currency}
                upIsGood
                bars={[
                  { label: yearMode ? year : shortMonth(month), cents: cur.income, color: "var(--fin-in)" },
                  { label: yearMode ? prevYear : shortMonth(prevMonth), cents: prevCmp.income, muted: true },
                ]}
              />
              <Stat
                icon={Scales}
                label="Neto"
                cents={cur.income - cur.expense}
                currency={currency}
                signed
                hint="Ingresos menos gastos"
                bars={[
                  { label: "entró", cents: cur.income, color: "var(--fin-in)" },
                  { label: "salió", cents: cur.expense, color: "var(--fin-out)" },
                ]}
              />
              <Stat
                icon={CalendarBlank}
                label="Gasto por día"
                cents={Math.round(cur.expense / Math.max(1, elapsed) / 100) * 100}
                currency={currency}
                hint={`En ${elapsed} días`}
                className="col-span-2 sm:col-span-1"
              >
                {/* Cuánto del período pasó: de a 5 días en un mes, de a un mes en un año. */}
                <PeriodSegments done={yearMode ? Math.ceil((elapsed / daysOfYear) * 12) : Math.ceil(elapsed / 5)} total={yearMode ? 12 : Math.ceil((isCurrent ? daysInMonth(month) : elapsed) / 5)} label={`${elapsed} días con datos`} />
              </Stat>
              </div>
            </section>

            <div className="grid min-w-0 content-start gap-12 lg:col-span-7 lg:gap-5">
              {!yearMode && (
              <TintedCard icon={ChartLineUp} title="Ritmo del mes" meta={`Acumulado día a día contra ${monthName(prevMonth)}`} bodyClassName="gap-3!">
                <PaceChart rows={scoped} month={month} prevMonth={prevMonth} lastDay={isCurrent ? cutDay : daysInMonth(month)} currency={currency} drawKey={drawKey} draw={draw} />
              </TintedCard>
              )}

              <TintedCard
                icon={CalendarBlank}
                title="Qué días gastás"
                meta={yearMode ? `Promedio por día de la semana en ${year}` : `Promedio por día, desde ${monthName(months[0])} de ${months[0].slice(0, 4)}`}
                bodyClassName="gap-3!"
              >
                <WeekdaySpend values={weekdayAvg} currency={currency} />
              </TintedCard>
            </div>

            <TintedCard
              icon={ChartPieSlice}
              title="Por categoría"
              meta={`${moneyWhole(total, currency)} · ${cats.length === 1 ? "1 categoría" : `${cats.length} categorías`}`}
              headExtra={
                <div className="w-48 max-w-full">
                  <Segmented
                    value={kind}
                    onChange={setKind}
                    options={[
                      { value: "expense", label: "Gastos" },
                      { value: "income", label: "Ingresos" },
                    ]}
                  />
                </div>
              }
              className="lg:col-span-5"
            >
              {cats.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted">
                  No hay {kind === "expense" ? "gastos" : "ingresos"}
                  {allPesos ? "" : ` en ${currency}`} {yearMode ? `en ${year}` : "este mes"}.
                </p>
              ) : (
                <CategoryBars
                  key={`${allPesos ? ALL : currency}-${kind}`}
                  swap={catSwap}
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
                  rows={periodRows.filter((r) => r.kind === kind)}
                  range={yearMode ? { from: `${year}-01-01`, to: `${year}-12-31` } : monthBounds(month)}
                  today={today}
                />
              )}
            </TintedCard>

            <TintedCard
              icon={ChartBar}
              title={
                yearMode ? (
                  `Mes a mes en ${year}`
                ) : (
                  <>
                    Últimos <span className="lg:hidden">{Math.min(6, months.length)}</span>
                    <span className="hidden lg:inline">{months.length}</span> meses
                  </>
                )
              }
              meta="Ingresos y gastos por mes"
              className="lg:col-span-12"
              bodyClassName="gap-3!"
            >
              <div className="lg:hidden">
                <MonthlyColumns data={phoneEvolution} current={month} currency={currency} drawKey={drawKey} draw={draw} />
              </div>
              <div className="hidden lg:block">
                <MonthlyColumns data={evolution} current={month} currency={currency} height={220} drawKey={drawKey} draw={draw} />
              </div>
            </TintedCard>

            <TintedCard
              icon={TrendUp}
              title={yearMode ? `Ahorro por mes en ${year}` : "Ahorro por mes"}
              meta="Ingresos menos gastos: arriba sobró, abajo faltó"
              className="lg:col-span-12"
              bodyClassName="gap-3!"
            >
              <div className="lg:hidden">
                <NetColumns data={phoneEvolution} current={month} currency={currency} drawKey={drawKey} draw={draw} />
              </div>
              <div className="hidden lg:block">
                <NetColumns data={evolution} current={month} currency={currency} height={200} drawKey={drawKey} draw={draw} />
              </div>
            </TintedCard>
          </>
        )}
        </NavDim>
      </main>
    </>
  );
}

// ─── Cifras ─────────────────────────────────────────────────────────────────

function Stat({
  icon,
  label,
  cents,
  prevCents,
  compareLabel,
  currency,
  upIsGood,
  signed,
  hero,
  hint,
  bars,
  className,
  children,
}: {
  icon: Icon;
  label: string;
  cents: number;
  prevCents?: number;
  compareLabel?: string;
  currency: string;
  upIsGood?: boolean;
  signed?: boolean;
  hero?: boolean;
  hint?: string;
  /** Este período contra el de comparación, en barras chicas. */
  bars?: { label: string; cents: number; color?: string; muted?: boolean }[];
  className?: string;
  children?: React.ReactNode;
}) {
  const delta = prevCents !== undefined && prevCents > 0 ? (cents - prevCents) / prevCents : null;
  const good = delta !== null && (upIsGood ? delta >= 0 : delta <= 0);
  const text = `${signed && cents !== 0 ? (cents > 0 ? "+ " : "− ") : ""}${moneyWhole(cents, currency)}`;
  return (
    <StatTile
      icon={icon}
      label={label}
      className={cx(hero && "col-span-2 sm:col-span-1", className)}
      figure={
        // Siempre en un renglón: las cifras largas (un año entero) van un poco más chicas.
        <span
          className={
            hero
              ? text.length > 11
                ? "text-[30px] sm:text-[24px] lg:text-[30px]"
                : "text-[38px] sm:text-[28px] lg:text-[34px]"
              : text.length > 9
                ? "text-[20px] sm:text-[22px] lg:text-[26px]"
                : "text-[24px] sm:text-[26px] lg:text-[30px]"
          }
        >
          {text}
        </span>
      }
      sub={
        delta !== null && Math.abs(delta) >= 0.005 ? (
          <span className={cx("inline-flex items-center gap-1", good ? "fin-income" : "text-danger")}>
            {delta > 0 ? <ArrowUpRight size={13} weight="bold" aria-hidden /> : <ArrowDownRight size={13} weight="bold" aria-hidden />}
            <span>
              {delta > 0 ? "+" : "−"}
              {Math.abs(Math.round(delta * 100))}% <span className="text-muted">{compareLabel}</span>
            </span>
          </span>
        ) : (
          hint
        )
      }
    >
      {bars && bars.some((b) => b.cents > 0) && <MiniBars label={bars.map((b) => `${b.label}: ${moneyWhole(b.cents, currency)}`).join(", ")} rows={bars} />}
      {children}
    </StatTile>
  );
}

/** Segmentos chicos de lo que pasó del período (los hechos en el color del módulo). */
function PeriodSegments({ done, total, label }: { done: number; total: number; label: string }) {
  const n = Math.max(1, total);
  return (
    <span className="tmini-seg" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }} role="img" aria-label={label}>
      {Array.from({ length: n }, (_, i) => (
        <span key={i} data-on={i < done ? "" : undefined} />
      ))}
    </span>
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
  drawKey,
  draw,
}: {
  rows: FlowRow[];
  month: string;
  prevMonth: string;
  /** Último día con datos del mes elegido (hoy, si es el mes en curso). */
  lastDay: number;
  currency: string;
  /** Al cambiar, el gráfico se vuelve a dibujar (crece desde el eje). */
  drawKey: string;
  draw?: string;
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
          key={drawKey}
          ref={box}
          role="img"
          data-no-swipe
          tabIndex={0}
          aria-label={`Gasto acumulado: ${formatMonth(month)} ${moneyWhole(curSeries[curEnd], currency)} al día ${curEnd}; ${formatMonth(prevMonth)} ${moneyWhole(prevSeries[prevEnd], currency)} en total.`}
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
          className={cx("relative touch-pan-y rounded-[4px] outline-offset-4", draw)}
          style={{ height: H }}
        >
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute inset-x-0 h-px"
              style={{ top: topPct(t * 100), background: t === 0 ? "var(--border-strong)" : "var(--fin-grid)" }}
            />
          ))}
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="fin-grow-y absolute inset-0 size-full overflow-visible" aria-hidden>
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
          <Dot left={pct(prevEnd)} top={topPct(prevSeries[prevEnd])} color="var(--faint)" className="fin-late" />
          <Dot left={pct(curEnd)} top={topPct(curSeries[curEnd])} color="var(--fin-out)" className="fin-late" />
          {h === null && (
            <span
              className="fin-late tabular pointer-events-none absolute text-[11px] font-medium whitespace-nowrap text-fg"
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
            // La línea, los puntos y el cuadro se deslizan de un día a otro (no saltan).
            <PointerTrack at={h / span}>
              <span className="absolute inset-y-0 left-0 w-px bg-line-strong" />
              {h <= curEnd && <Dot left="0" top={topPct(curSeries[h])} color="var(--fin-out)" />}
              {h <= prevEnd && <Dot left="0" top={topPct(prevSeries[h])} color="var(--faint)" />}
              <div
                className="fade-in fin-tip lift absolute top-0 left-0 grid min-w-44 gap-1 rounded-[4px] border border-line-strong bg-surface p-2.5 text-[12.5px]"
                style={{ translate: h > span / 2 ? "calc(-100% - 10px) 0" : "10px 0" }}
              >
                <span className="text-muted">Día {h}</span>
                {/* Un día que todavía no llegó (o que el mes anterior no tuvo) no tiene fila. */}
                {h <= curEnd && <TooltipRow color="var(--fin-out)" label={monthName(month)} value={moneyWhole(curSeries[h], currency)} />}
                {h <= prevEnd && <TooltipRow color="var(--faint)" label={monthName(prevMonth)} value={moneyWhole(prevSeries[h], currency)} />}
              </div>
            </PointerTrack>
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
                  <td className="py-1.5 text-right">{d <= curEnd ? moneyWhole(curSeries[d], currency) : ""}</td>
                  <td className="py-1.5 text-right">{d <= prevEnd ? moneyWhole(prevSeries[d], currency) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function Dot({ left, top, color, className }: { left: string; top: string; color: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx("pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-bg", className)}
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
  rows,
  range,
  today,
  swap,
}: {
  /** avg: promedio de los tres meses anteriores (o lo del año anterior), para el "vs." de cada fila. */
  items: { key: string; category?: CategoryDTO; cents: number; avg?: number }[];
  total: number;
  currency: string;
  color: string;
  /** Contra qué se compara (por año: "2025"); sin esto, el promedio de 3 meses. */
  vsLabel?: string;
  /** Los movimientos del período (de este tipo): al tocar una categoría se ven los suyos. */
  rows: FlowRow[];
  /** Fundido al cambiar de moneda o de Gastos/Ingresos. */
  swap?: string;
  range: { from: string; to: string };
  today: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const max = Math.max(...items.map((i) => i.cents), 1);
  // Las primeras ocho a la vista; el resto, plegado, para que la lista no se coma la pantalla.
  const TOP = 8;
  const row = (it: (typeof items)[number], i: number) => {
        const pct = total > 0 ? Math.round((it.cents / total) * 100) : 0;
        const name = it.category?.name ?? "Sin clasificar";
        const isOpen = open === it.key;
        const panelId = `cat-detalle-${it.key}`;
        return (
          <li key={it.key} className="grid gap-2" style={{ "--i": Math.min(i, 8) } as React.CSSProperties}>
          <button
            type="button"
            aria-expanded={isOpen}
            aria-controls={panelId}
            onClick={() => setOpen(isOpen ? null : it.key)}
            className="-mx-2 grid grid-cols-[32px_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-surface-2 focus-visible:bg-surface-2"
          >
            <span className="row-span-2">
              <CategoryAvatar category={it.category} size={32} />
            </span>
            <span className="flex items-baseline justify-between gap-3 text-[14px]">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className={cx("truncate", !it.category && "text-muted")}>{name}</span>
                <CaretDown
                  size={12}
                  weight="bold"
                  aria-hidden
                  className={cx("shrink-0 text-faint transition-transform duration-150", isOpen && "rotate-180 text-muted")}
                />
              </span>
              <span className="shrink-0">
                <span className="font-mono text-[13.5px] font-medium tabular">{moneyWhole(it.cents, currency)}</span>
                <span className="tabular ml-2 inline-block w-9 text-right text-[12.5px] text-muted">
                  {pct === 0 && it.cents > 0 ? "<1" : pct}%
                </span>
              </span>
            </span>
            <span className="block h-2" aria-hidden>
              <span
                className="bar-anim block h-2 rounded-r-[4px]"
                style={{ width: `${Math.max(1.5, (it.cents / max) * 100)}%`, background: color }}
              />
            </span>
            {it.avg !== undefined && (
              <span className="col-start-2">
                <VsAverage cents={it.cents} avg={it.avg} vsLabel={vsLabel} />
              </span>
            )}
          </button>
          {isOpen && (
            <CategoryDetail
              id={panelId}
              name={name}
              categoryKey={it.key}
              rows={rows.filter((r) => (r.categoryId ?? "none") === it.key)}
              currency={currency}
              range={range}
              today={today}
            />
          )}
          </li>
        );
  };
  return (
    <div className={cx("grid gap-3.5", swap)}>
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

const shortDay = new Intl.DateTimeFormat("es-UY", { day: "numeric", month: "short", timeZone: "UTC" });

/**
 * Los movimientos de una categoría en el período, con el nombre que se les puso:
 * uno por uno (del más nuevo al más viejo) o juntados por nombre ("Disco × 6").
 * Un reintegro resta (va con "−").
 */
function CategoryDetail({
  id,
  name,
  categoryKey,
  rows,
  currency,
  range,
  today,
}: {
  id: string;
  name: string;
  categoryKey: string;
  rows: FlowRow[];
  currency: string;
  range: { from: string; to: string };
  today: string;
}) {
  const [mode, setMode] = useState<"each" | "name">("each");
  const [all, setAll] = useState(false);
  const modeSwap = useSwap(`${mode}-${all}`);
  const year = today.slice(0, 4);
  const day = (iso: string) =>
    shortDay.format(new Date(`${iso}T00:00:00Z`)).replace(".", "") + (iso.slice(0, 4) !== year ? ` ${iso.slice(0, 4)}` : "");

  const each = useMemo(() => [...rows].sort((a, b) => b.date.localeCompare(a.date) || b.cents - a.cents), [rows]);
  const groups = useMemo(() => {
    const map = new Map<string, { label: string | null; cents: number; count: number; last: string }>();
    // `each` va del más nuevo al más viejo: el nombre que se muestra es el último que se usó.
    for (const r of each) {
      const key = r.title ? normTitle(r.title) || r.title.toLowerCase() : "";
      const g = map.get(key);
      if (g) {
        g.cents += r.cents;
        g.count += 1;
      } else map.set(key, { label: r.title, cents: r.cents, count: 1, last: r.date });
    }
    return [...map.values()].sort((a, b) => b.cents - a.cents);
  }, [each]);

  const LIMIT = 10;
  const total = mode === "each" ? each.length : groups.length;
  const href = `/gastos/buscar?cat=${encodeURIComponent(categoryKey)}&desde=${range.from}&hasta=${range.to}`;
  const amount = (c: number) => (c < 0 ? `−${moneyCents(-c, currency)}` : moneyCents(c, currency));

  return (
    <div id={id} className="reveal grid gap-2 rounded-xl border border-line bg-surface-2/60 p-3 sm:ml-[44px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12.5px] text-muted">
          {rows.length === 1 ? "1 movimiento" : `${rows.length} movimientos`}
          {groups.length > 1 && rows.length !== groups.length ? ` · ${groups.length} nombres` : ""}
        </p>
        {groups.length < rows.length && (
          <div className="w-[13rem]">
            <Segmented
              value={mode}
              onChange={(v) => {
                setMode(v);
                setAll(false);
              }}
              options={[
                { value: "each", label: "Uno por uno" },
                { value: "name", label: "Por nombre" },
              ]}
            />
          </div>
        )}
      </div>
      <ul key={`${mode}-${all}`} className={cx("grid", modeSwap)} aria-label={`Movimientos de ${name}`}>
        {mode === "each"
          ? (all ? each : each.slice(0, LIMIT)).map((r) => (
              <li key={r.id} className="grid grid-cols-[4.25rem_minmax(0,1fr)_auto] items-baseline gap-3 border-b border-line py-2 last:border-b-0">
                <span className="font-mono text-[12px] text-muted tabular">{day(r.date)}</span>
                <span className={cx("min-w-0 text-[13.5px] break-words", !r.title && "text-muted")}>
                  {r.title ?? "Sin título"}
                  {r.cents < 0 && <span className="ml-1.5 text-[11.5px] text-muted">reintegro</span>}
                </span>
                <span className="font-mono text-[13px] font-medium tabular">{amount(r.cents)}</span>
              </li>
            ))
          : (all ? groups : groups.slice(0, LIMIT)).map((g, i) => (
              <li key={`${g.label}-${i}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 border-b border-line py-2 last:border-b-0">
                <span className="min-w-0 text-[13.5px] break-words">
                  <span className={cx(!g.label && "text-muted")}>{g.label ?? "Sin título"}</span>
                  <span className="ml-1.5 font-mono text-[12px] text-muted tabular">{g.count > 1 ? `× ${g.count}` : day(g.last)}</span>
                </span>
                <span className="font-mono text-[13px] font-medium tabular">{amount(g.cents)}</span>
              </li>
            ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {total > LIMIT ? (
          <button type="button" onClick={() => setAll(!all)} className="kicker inline-flex min-h-11 items-center hover:text-fg">
            {all ? "Ver menos" : `Ver ${total - LIMIT} más`}
          </button>
        ) : (
          <span />
        )}
        <Link href={href} className="inline-flex min-h-11 items-center gap-1.5 text-[12.5px] text-muted hover:text-fg">
          Abrir en Buscar <ArrowSquareOut size={13} aria-hidden />
        </Link>
      </div>
    </div>
  );
}

// ─── Evolución mensual ──────────────────────────────────────────────────────

// Números cortos de los gráficos: siempre "k" minúscula y coma (Intl compact mezcla "K" y "k").
const compact = { format: shortNumber };

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
  drawKey,
  draw,
}: {
  data: { month: string; expense: number; income: number }[];
  current: string;
  currency: string;
  height?: number;
  drawKey: string;
  draw?: string;
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

        <div className="relative" data-no-swipe style={{ height: H }}>
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute inset-x-0 h-px"
              style={{ top: H - (t / top) * H, background: t === 0 ? "var(--border-strong)" : "var(--fin-grid)" }}
            />
          ))}
          <div key={drawKey} className={cx("absolute inset-0 grid", draw)} style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}>
            {data.map((d, i) => {
              const selected = d.month === current;
              return (
                <button
                  key={d.month}
                  type="button"
                  aria-label={`${formatMonth(d.month)}: ingresos ${moneyWhole(d.income, currency)}, gastos ${moneyWhole(d.expense, currency)}`}
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
                  <Column cents={d.income} height={h(d.income)} color="var(--fin-in)" label={false} i={i} />
                  <Column cents={d.expense} height={h(d.expense)} color="var(--fin-out)" label={selected} i={i} />
                </button>
              );
            })}
          </div>

          {hover !== null && (
            // El cuadro se desliza de un mes a otro en vez de saltar.
            <PointerTrack at={(hover + 0.5) / data.length}>
              <div
                className="fade-in fin-tip lift absolute top-0 left-0 grid min-w-40 gap-1 rounded-[4px] border border-line-strong bg-surface p-2.5 text-[12.5px]"
                style={{ translate: hover >= data.length / 2 ? "calc(-100% - 14px) 0" : "14px 0" }}
              >
                <span className="text-muted first-letter:uppercase">{formatMonth(data[hover].month)}</span>
                <TooltipRow color="var(--fin-in)" label="Ingresos" value={moneyWhole(data[hover].income, currency)} />
                <TooltipRow color="var(--fin-out)" label="Gastos" value={moneyWhole(data[hover].expense, currency)} />
              </div>
            </PointerTrack>
          )}
        </div>

        <span />
        <div className="grid pt-1.5" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }} aria-hidden>
          {data.map((d) => (
            <span key={d.month} className={cx("text-center font-mono text-[11px] uppercase", d.month === current ? "font-semibold text-fg" : "text-muted")}>
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
                <td className="py-1.5 text-right">{moneyWhole(d.income, currency)}</td>
                <td className="py-1.5 text-right">{moneyWhole(d.expense, currency)}</td>
                <td className="py-1.5 text-right">
                  {d.income - d.expense < 0 ? "− " : ""}
                  {moneyWhole(d.income - d.expense, currency)}
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
function Column({ cents, height, color, label, i }: { cents: number; height: number; color: string; label: boolean; i: number }) {
  // La barra y su rótulo van separados: al dibujarse, la barra crece desde la base
  // y el rótulo aparece al final (si fuera adentro, se estiraría con ella).
  return (
    <span className="relative block w-[clamp(8px,28%,24px)]" style={{ height }}>
      <span className="fin-grow-y absolute inset-0 rounded-t-[4px]" style={{ background: color, "--i": i } as React.CSSProperties} />
      {label && cents > 0 && (
        <span className="fin-late tabular pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 rounded-[3px] bg-surface px-1 text-[11px] font-medium whitespace-nowrap text-fg">
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
              className="bar-anim block h-2.5 rounded-r-[4px]"
              style={{
                width: `${Math.max(1.5, (v / max) * 100)}%`,
                background: i === top ? "var(--fin-out)" : "color-mix(in oklab, var(--fin-out) 42%, var(--surface))",
              }}
            />
          </span>
          <span className="text-right font-mono text-[12.5px] tabular">{moneyWhole(round(v), currency)}</span>
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
  drawKey,
  draw,
}: {
  data: { month: string; expense: number; income: number }[];
  current: string;
  currency: string;
  height?: number;
  drawKey: string;
  draw?: string;
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
            `${formatMonth(data[shownIdx].month)}: ${word(nets[shownIdx])}${nets[shownIdx] !== 0 ? ` ${moneyWhole(nets[shownIdx], currency)}` : ""}`}
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

        <div className="relative" data-no-swipe style={{ height: H }}>
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute inset-x-0 h-px"
              style={{ top: yOf(t * 100), background: t === 0 ? "var(--border-strong)" : "var(--fin-grid)" }}
            />
          ))}
          <div key={drawKey} className={cx("absolute inset-0 grid", draw)} style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}>
            {data.map((d, i) => {
              const n = nets[i];
              const y = yOf(n);
              const selected = d.month === current;
              return (
                <button
                  key={d.month}
                  type="button"
                  aria-label={`${formatMonth(d.month)}: ${word(n)} ${moneyWhole(n, currency)}`}
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover((x) => (x === i ? null : x))}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover((x) => (x === i ? null : x))}
                  className={cx("relative rounded-md transition-colors", hover === i && "bg-surface-2/70")}
                >
                  {n !== 0 && (
                    <span
                      className="absolute left-1/2 w-[clamp(10px,40%,34px)] -translate-x-1/2"
                      style={{ top: n > 0 ? y : base, height: Math.max(2, Math.abs(base - y)) }}
                    >
                      {/* Crece desde la línea de cero: hacia arriba lo que sobró, hacia abajo lo que faltó. */}
                      <span
                        className={cx("fin-grow-y absolute inset-0", n > 0 ? "rounded-t-[4px]" : "fin-from-top rounded-b-[4px]")}
                        style={{ background: n > 0 ? "var(--fin-in)" : "var(--fin-out)", "--i": i } as React.CSSProperties}
                      />
                      {selected && (
                        <span
                          className={cx(
                            "fin-late tabular pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-[3px] bg-surface px-1 text-[11px] font-medium whitespace-nowrap text-fg",
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
            <span key={d.month} className={cx("text-center font-mono text-[11px] uppercase", d.month === current ? "font-semibold text-fg" : "text-muted")}>
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
                  {moneyWhole(nets[i], currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
