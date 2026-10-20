"use client";

import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "@phosphor-icons/react";
import { Fragment } from "react";
import { cx } from "@/components/ui";
import { formatKm, formatSleep, watchStressLevel } from "@/lib/checkin-logic";

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

export function Kpi({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div className="grid content-start gap-1.5 rounded-2xl bg-white/10 p-3.5 ring-1 ring-white/10 lg:p-4">
      <span className="text-[12px] font-medium opacity-85">{label}</span>
      <span className="figure text-[26px] lg:text-[30px]">{value}</span>
      <span className="min-h-5">{children}</span>
    </div>
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

export function Card({
  title,
  color,
  href,
  className,
  children,
}: {
  title: string;
  color: string;
  href?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className={cx("rise grid min-w-0 content-start gap-4 rounded-[20px] border border-line bg-surface p-4 lg:p-5", className)}>
      <header className="flex items-center gap-2">
        <span aria-hidden className="size-2 rounded-full" style={{ background: color }} />
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        {href && (
          <Link href={href} className="-my-2 -mr-2 ml-auto inline-flex min-h-11 items-center px-2 text-[13px] text-muted hover:text-fg">
            Abrir
          </Link>
        )}
      </header>
      {children}
    </section>
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
