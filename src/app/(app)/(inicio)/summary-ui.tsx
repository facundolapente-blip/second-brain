"use client";

import { ArrowDownRight, ArrowUpRight, CalendarCheck, Medal, Notebook, Wallet, type Icon } from "@phosphor-icons/react";
import { Fragment } from "react";
import { cx } from "@/components/ui";
import { StatTile, TintedCard, type CardTone } from "@/components/tinted-card";
import { formatKm, formatSleep, watchStressLevel } from "@/lib/checkin-logic";
import { formatShort } from "@/lib/dates";
import { moneyWhole } from "@/lib/format";
import { bucketDays } from "@/lib/review-logic";

/** Piezas compartidas por la revisión semanal y el resumen del mes. */

/**
 * Diferencia contra el período anterior: "+12%" en verde o rojo según convenga. "pts" y
 * "lpm" restan (puntos de un puntaje, latidos por minuto); "%" es el cambio relativo.
 * `plain`: fuera del recuadro oscuro de arriba (en un Mini), "igual que antes" en gris.
 */
export function Delta({
  now,
  before,
  goodUp = true,
  unit = "%",
  plain = false,
}: {
  now: number | null;
  before: number | null;
  goodUp?: boolean;
  unit?: "%" | "pts" | "lpm";
  plain?: boolean;
}) {
  if (now === null || before === null) return null;
  let diff: number;
  if (unit !== "%") diff = Math.round(now - before);
  else if (before === 0) return null;
  else diff = Math.round(((now - before) / before) * 100);
  if (diff === 0) return <span className={plain ? "text-[11.5px] text-muted" : "hero-sub text-[12px]"}>igual que antes</span>;
  const good = diff > 0 === goodUp;
  return (
    <span
      className={cx(
        "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11.5px] font-medium",
        good ? "bg-[var(--st-done-bg)] text-[var(--st-done-fg)]" : "bg-[var(--st-fail-bg)] text-[var(--st-fail-fg)]",
      )}
    >
      {diff > 0 ? <ArrowUpRight size={11} weight="bold" aria-hidden /> : <ArrowDownRight size={11} weight="bold" aria-hidden />}
      {Math.abs(diff)}
      {unit === "%" ? "%" : ` ${unit}`}
    </span>
  );
}

/** Cifra chica. `delta`: la comparación con el período anterior (un `<Delta plain />`). */
export function Mini({ label, value, sub, delta }: { label: string; value: string; sub?: string; delta?: React.ReactNode }) {
  return (
    <div className="grid content-start gap-0.5 rounded-xl bg-surface-2 px-3 py-2.5">
      <dt className="text-[11.5px] text-muted">{label}</dt>
      <dd className="figure text-[22px] whitespace-nowrap print:text-[17px]">{value}</dd>
      {(sub || delta) && (
        <dd className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11.5px] text-muted">
          {sub && <span>{sub}</span>}
          {sub && delta && <span aria-hidden>·</span>}
          {delta}
        </dd>
      )}
    </div>
  );
}

/** Sección del resumen o de la revisión: tarjeta con cabecera teñida del módulo que muestra. */
export function Card({
  title,
  tone,
  icon,
  meta,
  href,
  hrefLabel = "Abrir",
  className,
  children,
}: {
  title: string;
  tone?: CardTone;
  icon: Icon;
  meta?: React.ReactNode;
  href?: string;
  hrefLabel?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <TintedCard tone={tone} icon={icon} title={title} meta={meta} action={href ? { href, label: hrefLabel } : undefined} className={className}>
      {children}
    </TintedCard>
  );
}

/** Lo que necesitan las cifras de arriba de cada día y del período (como los da `summarize`). */
type TileDay = { date: string; habitsDone: number; habitsDue: number; wrote: boolean; spentCents: number; blocksDone: number; blocksTotal: number };
type TileTotals = { habitPct: number | null; wroteDays: number; spentCents: number; blocksDone: number; blocksTotal: number };

/** Sin cambio: "Igual que antes"; sin con qué comparar (antes en 0 o sin datos), lo dice. */
function sameOrNone(now: number | null, before: number | null, unit: "%" | "pts" = "%") {
  return now !== null && before !== null && (unit !== "%" || before !== 0) ? "Igual que antes" : "Sin datos para comparar";
}

/** ¿`<Delta>` muestra un cambio? (sin comparación o "igual que antes", el "vs." sobra). */
function hasDelta(now: number | null, before: number | null, unit: "%" | "pts" = "%") {
  if (now === null || before === null) return false;
  if (unit !== "%") return Math.round(now - before) !== 0;
  return before !== 0 && Math.round(((now - before) / before) * 100) !== 0;
}

/** Barras chicas del período (un día, una semana o un mes cada una) con el color del módulo de la tarjeta. */
function TileBars({ values, max, from, to }: { values: (number | null)[]; max?: number; from: string; to: string }) {
  const top = max ?? Math.max(1, ...values.map((v) => v ?? 0));
  return (
    <>
      <span aria-hidden className="flex h-8 items-end gap-[3px]">
        {values.map((v, i) => (
          <span key={i} className="flex h-full min-w-0 flex-1 items-end overflow-hidden rounded-[3px] bg-surface-3">
            <span
              className="w-full rounded-[3px] bg-[var(--head-chip)]"
              style={{ height: v ? `${Math.max(10, Math.min(100, (v / top) * 100))}%` : 0 }}
            />
          </span>
        ))}
      </span>
      <span aria-hidden className="tmini-cap">
        <span>{from}</span>
        <span>{to}</span>
      </span>
    </>
  );
}

const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((n, x) => n + f(x), 0);

/**
 * Las cuatro cifras de arriba (Revisión semanal y Resumen): una tarjeta por módulo con su
 * color, la cifra, la comparación con el período anterior y una tira de cómo fue
 * (de a un día en la semana, por semana en el mes, por mes en el año).
 */
export function ModuleTiles({
  days,
  now,
  before,
  totalDays,
  vs,
  links,
}: {
  days: TileDay[];
  now: TileTotals;
  before: TileTotals;
  totalDays: number;
  /** "vs. semana anterior". */
  vs: string;
  links: { habitos: string; journal: string; gastos: string; plan: string };
}) {
  const buckets = bucketDays(days);
  const daily = buckets.length === days.length;
  const from = days.length ? formatShort(days[0].date) : "";
  const to = days.length ? formatShort(days[days.length - 1].date) : "";
  const sub = (show: boolean, delta: React.ReactNode, fallback: string) =>
    show ? (
      <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
        {delta}
        <span>{vs}</span>
      </span>
    ) : (
      fallback
    );
  // En el celular la cifra va un poco más chica: "$ 122.375" no entra en media pantalla a 32 px.
  const fit = "max-sm:[&_.tstat-fig]:text-[25px]!";
  return (
    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-4 print:grid-cols-4">
      <StatTile
        tone="habitos"
        icon={Medal}
        label="Hábitos"
        href={links.habitos}
        figure={now.habitPct === null ? "–" : now.habitPct}
        unit={now.habitPct === null ? undefined : "%"}
        sub={sub(hasDelta(now.habitPct, before.habitPct, "pts"), <Delta now={now.habitPct} before={before.habitPct} unit="pts" plain />, sameOrNone(now.habitPct, before.habitPct, "pts"))}
        className={fit}
      >
        <TileBars
          values={buckets.map((b) => {
            const due = sum(b.days, (d) => d.habitsDue);
            return due ? sum(b.days, (d) => d.habitsDone) / due : null;
          })}
          max={1}
          from={from}
          to={to}
        />
      </StatTile>
      <StatTile
        tone="journal"
        icon={Notebook}
        label="Días escritos"
        href={links.journal}
        figure={now.wroteDays}
        unit={`de ${totalDays}`}
        sub={sub(hasDelta(now.wroteDays, before.wroteDays), <Delta now={now.wroteDays} before={before.wroteDays} plain />, sameOrNone(now.wroteDays, before.wroteDays))}
        className={fit}
      >
        {daily ? (
          <>
            <span aria-hidden className="tmini-seg" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
              {days.map((d) => (
                <span key={d.date} data-on={d.wrote ? "" : undefined} />
              ))}
            </span>
            <span aria-hidden className="tmini-cap">
              <span>{from}</span>
              <span>{to}</span>
            </span>
          </>
        ) : (
          <TileBars values={buckets.map((b) => b.days.filter((d) => d.wrote).length / b.days.length)} max={1} from={from} to={to} />
        )}
      </StatTile>
      <StatTile
        tone="gastos"
        icon={Wallet}
        label="Gastado"
        href={links.gastos}
        figure={moneyWhole(now.spentCents)}
        sub={sub(hasDelta(now.spentCents, before.spentCents), <Delta now={now.spentCents} before={before.spentCents} goodUp={false} plain />, sameOrNone(now.spentCents, before.spentCents))}
        className={fit}
      >
        <TileBars values={buckets.map((b) => sum(b.days, (d) => d.spentCents))} from={from} to={to} />
      </StatTile>
      <StatTile
        tone="plan"
        icon={CalendarCheck}
        label="Plan"
        href={links.plan}
        figure={now.blocksDone}
        unit={`de ${now.blocksTotal}`}
        sub={sub(hasDelta(now.blocksDone, before.blocksDone), <Delta now={now.blocksDone} before={before.blocksDone} plain />, sameOrNone(now.blocksDone, before.blocksDone))}
        className={fit}
      >
        <TileBars
          values={buckets.map((b) => {
            const total = sum(b.days, (d) => d.blocksTotal);
            return total ? sum(b.days, (d) => d.blocksDone) / total : null;
          })}
          max={1}
          from={from}
          to={to}
        />
      </StatTile>
    </div>
  );
}

/** Promedios del reloj (y el sueño) de un período, como los da `summarize`. */
type BodyAvgs = {
  sleepMin: number | null;
  steps: number | null;
  stressWatch: number | null;
  hrMin: number | null;
  distanceM: number | null;
  activeKcal: number | null;
};
export type BodyMini = "sleep" | "steps" | "stressWatch" | "hrMin" | "distance" | "kcal";

const nfUy = new Intl.NumberFormat("es-UY");

/**
 * Cifras del cuerpo (sueño y lo del reloj) contra el período anterior. Solo las que
 * tienen dato en el período; la comparación, solo si el anterior también lo tiene.
 */
export function BodyMinis({ now, before, show }: { now: BodyAvgs; before: BodyAvgs; show: BodyMini[] }) {
  const delta = (n: number | null, b: number | null, opts: { goodUp?: boolean; unit?: "%" | "pts" | "lpm" } = {}) =>
    n !== null && b !== null ? <Delta now={n} before={b} plain {...opts} /> : undefined;
  const items: Record<BodyMini, React.ReactNode> = {
    sleep: now.sleepMin !== null && (
      <Mini
        label="Sueño promedio"
        value={formatSleep(Math.round(now.sleepMin / 15) * 15)}
        delta={delta(now.sleepMin, before.sleepMin)}
      />
    ),
    steps: now.steps !== null && (
      <Mini label="Pasos por día" value={nfUy.format(Math.round(now.steps))} delta={delta(now.steps, before.steps)} />
    ),
    stressWatch: now.stressWatch !== null && (
      <Mini
        label="Estrés del reloj"
        value={String(Math.round(now.stressWatch))}
        sub={watchStressLevel(Math.round(now.stressWatch))}
        delta={delta(now.stressWatch, before.stressWatch, { goodUp: false, unit: "pts" })}
      />
    ),
    hrMin: now.hrMin !== null && (
      <Mini
        label="Pulso mínimo"
        value={`${Math.round(now.hrMin)} lpm`}
        delta={delta(now.hrMin, before.hrMin, { goodUp: false, unit: "lpm" })}
      />
    ),
    distance: now.distanceM !== null && (
      <Mini label="Distancia por día" value={formatKm(now.distanceM)} delta={delta(now.distanceM, before.distanceM)} />
    ),
    kcal: now.activeKcal !== null && (
      <Mini
        label="Calorías por día"
        value={`${nfUy.format(Math.round(now.activeKcal))} kcal`}
        delta={delta(now.activeKcal, before.activeKcal)}
      />
    ),
  };
  return (
    <>
      {show.map((k) => (
        <Fragment key={k}>{items[k] || null}</Fragment>
      ))}
    </>
  );
}

/** ¿Hay algún dato del reloj en el período? (para mostrar el grupo "Del reloj"). */
export function hasWatchData(a: BodyAvgs) {
  return a.steps !== null || a.stressWatch !== null || a.hrMin !== null || a.distanceM !== null || a.activeKcal !== null;
}
