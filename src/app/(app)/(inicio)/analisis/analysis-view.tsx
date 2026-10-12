"use client";

import { useSwap } from "@/components/motion";
import { PillSwitch } from "@/components/pill-switch";
import { useState } from "react";
import { Lightbulb } from "@phosphor-icons/react";
import type { Corr, Insight } from "@/lib/insights";
import { METRICS, WEEKDAY_NAMES } from "@/lib/insights";
import { formatShort } from "@/lib/dates";
import { moneyCents, dec1, shortNumber, moneyWhole } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { cx } from "@/components/ui";

type Weekday = { weekday: number; habitPct: number | null; spentAvg: number; wrotePct: number; mood: number | null };
type Week = { monday: string; habitPct: number | null; spentCents: number; wrote: number; mood: number | null };

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
  return (
    <>
      <PageHeader
        title="Análisis"
        kicker={`Últimos ${range} días, hasta ayer`}
        wide
        actions={
          <PillSwitch
            label="Período"
            value={String(range)}
            options={ranges.map((r) => ({ value: String(r), label: r === 365 ? "1 año" : `${r}d` }))}
            hrefOf={(r) => `/analisis?dias=${r}`}
            item="h-8 px-3 text-[12.5px]"
          />
        }
      />
      <main key={range} className={cx("mx-auto grid max-w-6xl grid-cols-1 gap-4 px-4 pt-2 pb-16 xl:grid-cols-12 lg:gap-5 lg:px-10 lg:pt-4", rangeSwap)}>
        <Card title="Lo que se ve en tus datos" className="xl:col-span-12">
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

        <Card title="Semana a semana" className="xl:col-span-12">
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <MiniBars
              title="Hábitos cumplidos"
              color="var(--c-habitos)"
              items={weeks.map((w) => ({ key: w.monday, label: formatShort(w.monday), value: w.habitPct, text: w.habitPct === null ? "–" : `${w.habitPct}%` }))}
              max={100}
            />
            <MiniBars
              title="Gasto (pesos)"
              color="var(--c-gastos)"
              items={weeks.map((w) => ({ key: w.monday, label: formatShort(w.monday), value: w.spentCents, text: moneyCents(w.spentCents) }))}
            />
            <MiniBars
              title="Días escritos"
              color="var(--c-journal)"
              items={weeks.map((w) => ({ key: w.monday, label: formatShort(w.monday), value: w.wrote, text: `${w.wrote} de 7` }))}
              max={7}
            />
            <MiniBars
              title="Ánimo promedio"
              color="var(--mod-inicio)"
              items={weeks.map((w) => ({ key: w.monday, label: formatShort(w.monday), value: w.mood, text: w.mood === null ? "sin datos" : dec1(w.mood) }))}
              max={5}
            />
          </div>
          <TableToggle>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-muted">
                  <th className="py-1.5 font-normal">Semana del</th>
                  <th className="py-1.5 text-right font-normal">Hábitos</th>
                  <th className="py-1.5 text-right font-normal">Gasto</th>
                  <th className="py-1.5 text-right font-normal">Días escritos</th>
                  <th className="py-1.5 text-right font-normal">Ánimo</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {[...weeks].reverse().map((w) => (
                  <tr key={w.monday} className="border-t border-line">
                    <td className="py-1">{formatShort(w.monday)}</td>
                    <td className="py-1 text-right">{w.habitPct === null ? "–" : `${w.habitPct}%`}</td>
                    <td className="py-1 text-right">{moneyCents(w.spentCents)}</td>
                    <td className="py-1 text-right">{w.wrote}</td>
                    <td className="py-1 text-right">{w.mood === null ? "–" : dec1(w.mood)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableToggle>
        </Card>

        <WeekdayCard weekdays={weekdays} />
        <CorrCard corr={corr} />
      </main>
    </>
  );
}

function Card({ title, className, children }: { title: string; className?: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className={cx("rise grid min-w-0 content-start gap-4 rounded-[20px] border border-line bg-surface p-4 lg:p-5", className)}>
      <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
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
  items: { key: string; label: string; value: number | null; text: string }[];
  max?: number;
}) {
  const [focus, setFocus] = useState<number | null>(null);
  const top = max ?? Math.max(1, ...items.map((i) => i.value ?? 0));
  const last = items.length - 1;
  const shown = items[focus ?? last];
  return (
    <div className="grid content-start gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[13px] font-medium">
          <span aria-hidden className="size-2 rounded-full" style={{ background: color }} />
          {title}
        </h3>
        <span className="tabular truncate text-[12px] text-muted" aria-live="polite">
          {shown ? `${shown.label}: ${shown.text}` : ""}
        </span>
      </div>
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
                background: it.value === null ? "var(--border)" : color,
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
  const cell = (pct: number, color: string) => `color-mix(in oklab, ${color} ${Math.max(6, pct)}%, var(--surface-2))`;

  return (
    <Card title="Por día de la semana" className="xl:col-span-6">
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
                style={{ background: cell(w.habitPct ?? 0, "var(--c-habitos)"), color: (w.habitPct ?? 0) > 60 ? "white" : undefined }}
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
                <td key={w.weekday} className="h-10 rounded-lg" style={{ background: cell(p, "var(--c-gastos)"), color: p > 60 ? "white" : undefined }}>
                  {shortNumber(w.spentAvg / 100)}
                </td>
              );
            })}
          </tr>
          <tr>
            <th scope="row" className="text-left font-normal text-muted">Escribís</th>
            {weekdays.map((w) => (
              <td key={w.weekday} className="h-10 rounded-lg" style={{ background: cell(w.wrotePct, "var(--c-journal)"), color: w.wrotePct > 60 ? "white" : undefined }}>
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
    <Card title="Qué se mueve junto" className="xl:col-span-6">
      <p className="tabular min-h-5 text-[12.5px] text-muted" aria-live="polite">
        {focus && f
          ? `${METRICS[focus[0]].label} y ${METRICS[focus[1]].label}: ${f.r === null ? `pocos datos (${f.n} días)` : `${f.r.toFixed(2)}, ${read(f.r)} · ${f.n} días`}`
          : "Verde: suben juntas. Naranja: una sube y la otra baja. Gris: pocos datos."}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[26rem] table-fixed border-separate border-spacing-[3px] text-center text-[11px]">
          <thead>
            <tr>
              <th className="w-20" />
              {METRICS.map((m) => (
                <th key={m.id} scope="col" className="truncate px-0.5 font-normal text-muted" title={m.label}>
                  {m.label.slice(0, 5)}
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
