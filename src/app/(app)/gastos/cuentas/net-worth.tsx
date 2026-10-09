"use client";

import { useState } from "react";
import { formatMonth } from "@/lib/dates";
import { moneyCents } from "@/lib/format";

/**
 * Patrimonio: las cuentas juntas en pesos (los dólares con la cotización de hoy)
 * y cómo cerró cada uno de los últimos 12 meses. Si hay cuentas de trabajo, se
 * muestran dos: el personal y el de la empresa.
 */
export function NetWorth({
  series,
  usdRate,
  title = "Patrimonio total, en pesos",
  note,
}: {
  series: { month: string; cents: number }[];
  usdRate: number | null;
  title?: string;
  note?: string;
}) {
  const [focus, setFocus] = useState<number | null>(null);
  const now = series.at(-1)?.cents ?? 0;
  const first = series[0]?.cents ?? 0;
  const diff = now - first;
  const max = Math.max(1, ...series.map((s) => Math.abs(s.cents)));
  const shown = focus === null ? series.length - 1 : focus;
  const label = (m: string) => formatMonth(m).split(" ")[0].slice(0, 3);

  return (
    <section aria-label={title} className="grid gap-3 rounded-[20px] border border-line bg-surface p-4 lg:p-5">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div>
          <p className="kicker">{title}</p>
          <p className="figure mt-1 text-[34px]">{moneyCents(now)}</p>
        </div>
        <p className="pb-1 text-[13px] text-muted">
          {diff >= 0 ? "+" : "−"}
          {moneyCents(Math.abs(diff))} en 12 meses
          {usdRate ? ` · US$ 1 = ${moneyCents(Math.round(usdRate * 100))}` : ""}
        </p>
      </div>
      <p className="tabular min-h-5 text-[12.5px] text-muted first-letter:uppercase" aria-live="polite">
        {series[shown] && `${formatMonth(series[shown].month)}: ${moneyCents(series[shown].cents)}`}
      </p>
      <div className="flex h-24 items-end gap-1" role="list" aria-label="Patrimonio al cierre de cada mes">
        {series.map((s, i) => (
          <button
            key={s.month}
            type="button"
            role="listitem"
            aria-label={`${formatMonth(s.month)}: ${moneyCents(s.cents)}`}
            onPointerEnter={() => setFocus(i)}
            onPointerLeave={() => setFocus(null)}
            onFocus={() => setFocus(i)}
            onBlur={() => setFocus(null)}
            className="grid h-full flex-1 grid-rows-[1fr_auto] items-end gap-1 outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <span
              className="w-full rounded-t-[4px] transition-opacity"
              style={{
                height: `${Math.max(3, (Math.abs(s.cents) / max) * 100)}%`,
                background: s.cents < 0 ? "var(--st-fail-line)" : i === series.length - 1 ? "var(--accent)" : "color-mix(in oklab, var(--accent) 45%, var(--surface-2))",
                opacity: focus !== null && focus !== i ? 0.5 : 1,
              }}
            />
            <span className="font-mono text-[9.5px] text-muted">{label(s.month)}</span>
          </button>
        ))}
      </div>
      <details className="text-sm">
        <summary className="kicker inline-flex min-h-11 cursor-pointer items-center select-none hover:text-fg">Ver como tabla</summary>
        <table className="mt-1 w-full text-[13px]">
          <tbody className="tabular">
            {[...series].reverse().map((s) => (
              <tr key={s.month} className="border-t border-line">
                <td className="py-1 first-letter:uppercase">{formatMonth(s.month)}</td>
                <td className="py-1 text-right">{moneyCents(s.cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <p className="text-[11.5px] text-muted">
        {note ? `${note} ` : ""}Con la cotización de hoy para todos los meses: es una referencia, no el valor exacto de cada momento.
      </p>
    </section>
  );
}
