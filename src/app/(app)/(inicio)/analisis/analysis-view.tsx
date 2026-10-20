"use client";

import { useSwap } from "@/components/motion";
import { PillSwitch } from "@/components/pill-switch";
import { usePeriodNav } from "../period-nav";
import { useState } from "react";
import { CalendarBlank, ChartLineUp, Lightbulb, Medal, Notebook, Smiley, Wallet, type Icon } from "@phosphor-icons/react";
import { TintedCard, type CardTone } from "@/components/tinted-card";
import type { Corr, Insight } from "@/lib/insights";
import { METRICS, WEEKDAY_NAMES } from "@/lib/insights";
import { formatShort } from "@/lib/dates";
import { moneyCents, dec1, shortNumber, moneyWhole } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { cx } from "@/components/ui";

type Weekday = { weekday: number; habitPct: number | null; spentAvg: number; wrotePct: number; mood: number | null };
type Week = { monday: string; days: number; habitPct: number | null; spentCents: number; wrote: number; mood: number | null };

const MODULE_COLOR: Record<Insight["module"], string> = {
  habitos: "var(--c-habitos)",
  journal: "var(--c-journal)",
  gastos: "var(--c-gastos)",
  plan: "var(--c-plan)",
  inicio: "var(--mod-inicio)",
};

export function AnalysisView({
  range,
  ranges,
  insights,
  weekdays,
  corr,
  weeks,
  checkinDays,
}: {
  range: number;
  ranges: number[];
  insights: Insight[];
  weekdays: Weekday[];
  corr: Corr[][];
  weeks: Week[];
  checkinDays: number;
}) {
  // Otro rango: el contenido cambia con un fundido (no al cargar).
  const rangeSwap = useSwap(String(range));
  // El rango elegido y el rótulo cambian al toque; si los datos tardan, el contenido se atenúa.
  const nav = usePeriodNav(String(range));
  const shown = Number(nav.shown);
  const rangeSwitch = (
    <PillSwitch
      label="Período"
      value={nav.shown}
      options={ranges.map((r) => ({ value: String(r), label: r === 365 ? "1 año" : `${r}d` }))}
      onChange={(r) => r !== nav.shown && nav.go(r, `/analisis?dias=${r}`)}
      item="h-8 px-3 text-[12.5px]"
    />
  );
  return (
    <>
      <PageHeader
        title="Análisis"
        kicker={shown === 365 ? "Último año, hasta ayer" : `Últimos ${shown} días, hasta ayer`}
        wide
        // En el celular el selector va debajo: al lado del título se cortaban el rótulo y el título.
        actions={<div className="hidden sm:block">{rangeSwitch}</div>}
      />
      <div className="mx-auto flex max-w-6xl px-4 pb-2 sm:hidden">{rangeSwitch}</div>
      <main key={range} {...nav.bodyProps} className={cx("mx-auto grid max-w-6xl grid-cols-1 gap-4 px-4 pt-2 pb-16 md:grid-cols-2 xl:grid-cols-12 lg:gap-5 lg:px-10 lg:pt-4", rangeSwap)}>
        <Card title="Lo que se ve en tus datos" icon={Lightbulb} meta={insights.length ? `${Math.min(8, insights.length)} ${insights.length === 1 ? "cruce" : "cruces"} · ${checkinDays} días con check-in` : `${checkinDays} días con check-in`} className="md:col-span-2 xl:col-span-12">
          {insights.length === 0 ? (
            <p className="text-[14px] leading-relaxed text-muted">
              Todavía no aparece ninguna relación clara. Hace falta al menos 5 días de cada lado para comparar.
            </p>
          ) : (
            <ul className="grid gap-2.5 md:grid-cols-2">
              {insights.slice(0, 8).map((ins, i) => (
                <li
                  key={ins.id}
                  style={{ "--i": i } as React.CSSProperties}
                  className="rise flex gap-3 rounded-2xl bg-surface-2 p-4"
                >
                  <span
                    aria-hidden
                    className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-white"
                    style={{ background: MODULE_COLOR[ins.module] }}
                  >
                    <Lightbulb size={16} weight="fill" />
                  </span>
                  <span className="grid gap-1">
                    <span className="text-[14.5px] leading-snug font-medium">{ins.text}</span>
                    <span className="text-[12.5px] text-muted">{ins.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {checkinDays < 14 && (
            <p className="rounded-xl border border-dashed border-line-strong p-3 text-[13px] leading-relaxed text-muted">
              Con el check-in de Inicio (ánimo, energía, estrés, sueño) se desbloquean más cruces. Llevás {checkinDays}{" "}
              {checkinDays === 1 ? "día cargado" : "días cargados"} en este período; con dos semanas ya empiezan a aparecer.
            </p>
          )}
          <p className="text-[12px] text-muted">
            Son coincidencias en tus datos, no causas: sirven para hacerte preguntas, no para sacar conclusiones.
          </p>
        </Card>

        {weeks.some((w) => w.days < 7) && (
          <p className="text-[12.5px] text-muted md:col-span-2 xl:col-span-12">Semana a semana · las semanas cortadas por el período (con menos de 7 días) van más claras.</p>
        )}
        <WeekCard
          title="Hábitos cumplidos"
          tone="habitos"
          icon={Medal}
          color="var(--c-habitos)"
          weeks={weeks}
          value={(w) => w.habitPct}
          text={(w) => (w.habitPct === null ? "–" : `${w.habitPct}%`)}
          max={100}
        />
        <WeekCard
          title="Gasto (pesos)"
          tone="gastos"
          icon={Wallet}
          color="var(--c-gastos)"
          weeks={weeks}
          value={(w) => w.spentCents}
          text={(w) => moneyCents(w.spentCents)}
        />
        <WeekCard
          title="Días escritos"
          tone="journal"
          icon={Notebook}
          color="var(--c-journal)"
          weeks={weeks}
          value={(w) => w.wrote}
          text={(w) => `${w.wrote} de ${w.days}`}
          max={7}
        />
        <WeekCard
          title="Ánimo promedio"
          tone="inicio"
          icon={Smiley}
          color="var(--mod-inicio)"
          weeks={weeks}
          value={(w) => w.mood}
          text={(w) => (w.mood === null ? "sin datos" : dec1(w.mood))}
          max={5}
        />

        <WeekdayCard weekdays={weekdays} />
        <CorrCard corr={corr} />
      </main>
    </>
  );
}

/** "6 oct" o "6 oct (3 días)" si la semana viene cortada por el período. */
function weekLabel(w: Week) {
  return w.days < 7 ? `${formatShort(w.monday)} (${w.days} ${w.days === 1 ? "día" : "días"})` : formatShort(w.monday);
}

function Card({
  title,
  tone,
  icon,
  meta,
  className,
  children,
}: {
  title: string;
  tone?: CardTone;
  icon: Icon;
  meta?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <TintedCard tone={tone} icon={icon} title={title} meta={meta} className={className}>
      {children}
    </TintedCard>
  );
}

/** Una serie semanal (un módulo): su tarjeta con su color, las barras y su tabla. */
function WeekCard({
  title,
  tone,
  icon,
  color,
  weeks,
  value,
  text,
  max,
}: {
  title: string;
  tone: CardTone;
  icon: Icon;
  color: string;
  weeks: Week[];
  value: (w: Week) => number | null;
  text: (w: Week) => string;
  max?: number;
}) {
  return (
    <Card title={title} tone={tone} icon={icon} meta={`${weeks.length} ${weeks.length === 1 ? "semana" : "semanas"}`} className="md:col-span-1 xl:col-span-3">
      <MiniBars
        title={title}
        color={color}
        items={weeks.map((w) => ({ key: w.monday, label: weekLabel(w), partial: w.days < 7, value: value(w), text: text(w) }))}
        max={max}
      />
      <TableToggle>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-1.5 font-normal">Semana del</th>
              <th className="py-1.5 text-right font-normal">{title}</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {[...weeks].reverse().map((w) => (
              <tr key={w.monday} className="border-t border-line">
                <td className="py-1">{weekLabel(w)}</td>
                <td className="py-1 text-right">{text(w)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableToggle>
    </Card>
  );
}

function TableToggle({ children }: { children: React.ReactNode }) {
  return (
    <details className="text-sm">
      <summary className="kicker inline-flex min-h-11 cursor-pointer items-center select-none hover:text-fg">Ver como tabla</summary>
      <div className="mt-1 max-h-72 overflow-auto">{children}</div>
    </details>
  );
}

/** Barras chicas de una serie semanal; el valor exacto aparece arriba al pasar o enfocar. */
function MiniBars({
  title,
  color,
  items,
  max,
}: {
  title: string;
  color: string;
  items: { key: string; label: string; value: number | null; text: string; partial?: boolean }[];
  max?: number;
}) {
  const [focus, setFocus] = useState<number | null>(null);
  const top = max ?? Math.max(1, ...items.map((i) => i.value ?? 0));
  const last = items.length - 1;
  const shown = items[focus ?? last];
  return (
    <div className="grid content-start gap-2">
      <p className="tabular min-h-5 truncate text-[12.5px] text-muted" aria-live="polite" aria-label={title}>
        {shown ? `${shown.label}: ${shown.text}` : ""}
      </p>
      <div className="flex h-24 items-end gap-[3px]">
        {items.map((it, i) => (
          <button
            key={it.key}
            type="button"
            aria-label={`Semana del ${it.label}: ${it.text}`}
            onPointerEnter={() => setFocus(i)}
            onPointerLeave={() => setFocus(null)}
            onFocus={() => setFocus(i)}
            onBlur={() => setFocus(null)}
            className="flex h-full flex-1 items-end rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <span
              className={cx("w-full rounded-t-[3px] transition-opacity", focus !== null && focus !== i && "opacity-45")}
              style={{
                height: it.value === null ? "2px" : `${Math.max(3, (it.value / top) * 100)}%`,
                // Semana cortada por el período: más clara (no se compara de igual a igual).
                background: it.value === null ? "var(--border)" : it.partial ? `color-mix(in oklab, ${color} 38%, var(--surface-2))` : color,
              }}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

function WeekdayCard({ weekdays }: { weekdays: Weekday[] }) {
  const maxSpent = Math.max(1, ...weekdays.map((w) => w.spentAvg));
  const withHabits = weekdays.filter((w) => w.habitPct !== null);
  const best = [...withHabits].sort((a, b) => (b.habitPct ?? 0) - (a.habitPct ?? 0))[0];
  const worst = [...withHabits].sort((a, b) => (a.habitPct ?? 0) - (b.habitPct ?? 0))[0];
  const spender = [...weekdays].sort((a, b) => b.spentAvg - a.spentAvg)[0];
  // Tope de intensidad: el número (en el color de texto) se lee en los dos temas.
  const cell = (pct: number, color: string) => `color-mix(in oklab, ${color} ${Math.round(6 + Math.min(100, pct) * 0.39)}%, var(--surface-2))`;

  return (
    <Card title="Por día de la semana" icon={CalendarBlank} meta="Hábitos, gasto y journal" className="md:col-span-2 xl:col-span-6">
      {best && worst && (
        <p className="text-[13.5px] leading-relaxed text-muted">
          Tu mejor día para los hábitos es el <strong className="font-medium text-fg">{WEEKDAY_NAMES[best.weekday].toLowerCase()}</strong> (
          {best.habitPct}%) y el más flojo el <strong className="font-medium text-fg">{WEEKDAY_NAMES[worst.weekday].toLowerCase()}</strong> (
          {worst.habitPct}%). Donde más gastás: los{" "}
          <strong className="font-medium text-fg">{WEEKDAY_NAMES[spender.weekday].toLowerCase()}</strong> ({moneyWhole(spender.spentAvg)} en
          promedio).
        </p>
      )}
      <table className="w-full table-fixed border-separate border-spacing-1 text-center text-[12px]">
        <thead>
          <tr>
            <th className="w-20" />
            {weekdays.map((w) => (
              <th key={w.weekday} scope="col" className="font-mono text-[11px] font-normal text-muted">
                {WEEKDAY_NAMES[w.weekday].slice(0, 3)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="tabular">
          <tr>
            <th scope="row" className="text-left font-normal text-muted">Hábitos</th>
            {weekdays.map((w) => (
              <td
                key={w.weekday}
                className="h-10 rounded-lg"
                style={{ background: cell(w.habitPct ?? 0, "var(--c-habitos)") }}
              >
                {w.habitPct === null ? "–" : `${w.habitPct}%`}
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row" className="text-left font-normal text-muted">Gasto</th>
            {weekdays.map((w) => {
              const p = (w.spentAvg / maxSpent) * 100;
              return (
                <td key={w.weekday} className="h-10 rounded-lg" style={{ background: cell(p, "var(--c-gastos)") }}>
                  {shortNumber(w.spentAvg / 100)}
                </td>
              );
            })}
          </tr>
          <tr>
            <th scope="row" className="text-left font-normal text-muted">Escribís</th>
            {weekdays.map((w) => (
              <td key={w.weekday} className="h-10 rounded-lg" style={{ background: cell(w.wrotePct, "var(--c-journal)") }}>
                {w.wrotePct}%
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <p className="text-[12px] text-muted">Gasto: promedio por día en pesos. Escribís: % de esos días con entrada.</p>
    </Card>
  );
}

function CorrCard({ corr }: { corr: Corr[][] }) {
  const [focus, setFocus] = useState<[number, number] | null>(null);
  const color = (r: number | null) => {
    if (r === null) return "var(--surface-2)";
    // Tope de intensidad para que el número se lea en los dos temas.
    const p = Math.round(Math.abs(r) * 45);
    return `color-mix(in oklab, ${r >= 0 ? "var(--c-habitos)" : "var(--p-orange-solid)"} ${p}%, var(--surface-2))`;
  };
  const pairs: { a: string; b: string; r: number; n: number }[] = [];
  for (let i = 0; i < METRICS.length; i++)
    for (let j = i + 1; j < METRICS.length; j++) {
      const c = corr[i][j];
      if (c.r !== null) pairs.push({ a: METRICS[i].label, b: METRICS[j].label, r: c.r, n: c.n });
    }
  pairs.sort((x, y) => Math.abs(y.r) - Math.abs(x.r));
  const read = (r: number) =>
    Math.abs(r) < 0.15 ? "casi nada" : Math.abs(r) < 0.35 ? (r > 0 ? "suben algo juntas" : "una sube, la otra baja algo") : r > 0 ? "suben juntas" : "una sube, la otra baja";

  const f = focus ? corr[focus[0]][focus[1]] : null;
  return (
    <Card title="Qué se mueve junto" icon={ChartLineUp} meta={`${pairs.length} ${pairs.length === 1 ? "par" : "pares"} con datos`} className="md:col-span-2 xl:col-span-6">
      <p className="tabular min-h-5 text-[12.5px] text-muted" aria-live="polite">
        {focus && f
          ? `${METRICS[focus[0]].label} y ${METRICS[focus[1]].label}: ${f.r === null ? `pocos datos (${f.n} días)` : `${f.r.toFixed(2)}, ${read(f.r)} · ${f.n} días`}`
          : "Verde: suben juntas. Naranja: una sube y la otra baja. Gris: pocos datos."}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[31rem] table-fixed border-separate border-spacing-[3px] text-center text-[11px]">
          <thead>
            <tr>
              <th className="w-20" />
              {METRICS.map((m) => (
                <th key={m.id} scope="col" className="px-0.5 font-normal whitespace-nowrap text-muted" title={m.label}>
                  <abbr title={m.label} aria-label={m.label} className="no-underline">
                    {m.short}
                  </abbr>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular">
            {METRICS.map((m, i) => (
              <tr key={m.id}>
                <th scope="row" className="truncate text-left font-normal text-muted">
                  {m.label}
                </th>
                {METRICS.map((m2, j) => {
                  const c = corr[i][j];
                  if (i === j) return <td key={m2.id} className="h-8 rounded-md bg-surface-3" aria-hidden />;
                  return (
                    <td
                      key={m2.id}
                      tabIndex={0}
                      aria-label={`${m.label} y ${m2.label}: ${c.r === null ? "pocos datos" : c.r.toLocaleString("es-UY", { maximumFractionDigits: 2 })}`}
                      onPointerEnter={() => setFocus([i, j])}
                      onPointerLeave={() => setFocus(null)}
                      onFocus={() => setFocus([i, j])}
                      onBlur={() => setFocus(null)}
                      className="h-8 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                      style={{ background: color(c.r) }}
                    >
                      {c.r === null ? "" : dec1(c.r)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TableToggle>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-1.5 font-normal">Par</th>
              <th className="py-1.5 text-right font-normal">Correlación</th>
              <th className="py-1.5 text-right font-normal">Días</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {pairs.map((p) => (
              <tr key={`${p.a}-${p.b}`} className="border-t border-line">
                <td className="py-1">
                  {p.a} y {p.b} <span className="text-muted">· {read(p.r)}</span>
                </td>
                <td className="py-1 text-right">{p.r.toFixed(2)}</td>
                <td className="py-1 text-right">{p.n}</td>
              </tr>
            ))}
            {pairs.length === 0 && (
              <tr>
                <td colSpan={3} className="py-2 text-muted">
                  Todavía no hay suficientes días con datos cruzados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TableToggle>
    </Card>
  );
}
