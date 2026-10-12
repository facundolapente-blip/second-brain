"use client";

import Link from "next/link";
import { useState } from "react";
import { cx } from "@/components/ui";
import { formatMonth } from "@/lib/dates";

const nf = new Intl.NumberFormat("es-UY");

/**
 * Rampa secuencial de un solo tono (el acento) mezclado con la superficie:
 * clara a oscura, y en modo oscuro se invierte sola porque cambia la superficie.
 */
const RAMP = [
  "var(--surface-2)",
  "color-mix(in oklab, var(--accent) 22%, var(--surface))",
  "color-mix(in oklab, var(--accent) 45%, var(--surface))",
  "color-mix(in oklab, var(--accent) 70%, var(--surface))",
  "var(--accent)",
];

function daysInMonth(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

/** 0 sin escribir; 1 a 4 según la proporción de días escritos del mes. */
function bin(days: number, total: number) {
  if (days <= 0) return 0;
  const r = days / total;
  return r < 0.25 ? 1 : r < 0.5 ? 2 : r < 0.8 ? 3 : 4;
}

const MONTH_INITIALS = ["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

/**
 * Constancia: un renglón por año y una celda por mes, más oscura cuantos más
 * días escribiste. Cada celda abre ese mes en el calendario; el valor exacto se
 * lee arriba al pasar o enfocar, y también en la tabla.
 */
export function MonthHeatmap({
  firstMonth,
  currentMonth,
  perMonthDays,
  perMonth,
  todayDay,
}: {
  firstMonth: string;
  currentMonth: string;
  /** Día del mes de hoy: el mes en curso se mide contra los días que ya pasaron. */
  todayDay: number;
  perMonthDays: Record<string, number>;
  perMonth: Record<string, number>;
}) {
  const firstYear = Number(firstMonth.slice(0, 4));
  const lastYear = Number(currentMonth.slice(0, 4));
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, i) => String(lastYear - i));
  const [focus, setFocus] = useState<string | null>(null);

  const readout = (m: string) => {
    const d = perMonthDays[m] ?? 0;
    const e = perMonth[m] ?? 0;
    if (!d) return `${formatMonth(m)}: sin entradas`;
    return `${formatMonth(m)}: ${d} de ${daysInMonth(m)} días, ${e === 1 ? "1 entrada" : `${e} entradas`}`;
  };

  return (
    <div className="grid max-w-xl gap-3 lg:max-w-none">
      <p className="tabular min-h-5 text-[13px] text-muted first-letter:uppercase" aria-live="polite">
        {focus ? readout(focus) : "Tocá un mes para verlo en el calendario."}
      </p>
      <div className="grid grid-cols-[2.5rem_repeat(12,minmax(0,1fr))] gap-[3px] sm:gap-1">
        <span />
        {MONTH_INITIALS.map((l, i) => (
          <span key={i} aria-hidden className="pb-0.5 text-center font-mono text-[10.5px] text-muted">
            {l}
          </span>
        ))}
        {years.map((y) => (
          <Row key={y} year={y}>
            {Array.from({ length: 12 }, (_, i) => {
              const m = `${y}-${String(i + 1).padStart(2, "0")}`;
              if (m < firstMonth || m > currentMonth) return <span key={m} aria-hidden className="aspect-square" />;
              const d = perMonthDays[m] ?? 0;
              const b = bin(d, m === currentMonth ? todayDay : daysInMonth(m));
              return (
                <Link
                  key={m}
                  href={`/journal/calendario?mes=${m}`}
                  aria-label={readout(m)}
                  onPointerEnter={() => setFocus(m)}
                  onPointerLeave={() => setFocus((f) => (f === m ? null : f))}
                  onFocus={() => setFocus(m)}
                  onBlur={() => setFocus((f) => (f === m ? null : f))}
                  style={{ background: RAMP[b] }}
                  className={cx(
                    "aspect-square rounded-[2px] transition-[scale,box-shadow] duration-150 hover:scale-110 hover:shadow-[0_0_0_2px_var(--bg),0_0_0_3px_var(--text)] motion-reduce:hover:scale-100",
                    m === currentMonth && "shadow-[0_0_0_2px_var(--bg),0_0_0_3px_var(--accent)]",
                  )}
                />
              );
            })}
          </Row>
        ))}
      </div>
      <div className="flex items-center justify-end gap-1.5 text-[12px] text-muted" aria-hidden>
        Menos
        {RAMP.map((c, i) => (
          <span key={i} className="size-3 rounded-[2px]" style={{ background: c }} />
        ))}
        Más
      </div>
      <details className="text-sm">
        <summary className="kicker inline-flex min-h-11 cursor-pointer items-center select-none hover:text-fg">Ver como tabla</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[22rem] text-[13px]">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-1.5 font-normal">Mes</th>
                <th className="py-1.5 text-right font-normal">Días escritos</th>
                <th className="py-1.5 text-right font-normal">Entradas</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {Object.keys(perMonth)
                .sort()
                .reverse()
                .map((m) => (
                  <tr key={m} className="border-t border-line">
                    <td className="py-1.5 first-letter:uppercase">{formatMonth(m)}</td>
                    <td className="py-1.5 text-right">
                      {perMonthDays[m] ?? 0} de {daysInMonth(m)}
                    </td>
                    <td className="py-1.5 text-right">{nf.format(perMonth[m])}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function Row({ year, children }: { year: string; children: React.ReactNode }) {
  return (
    <>
      <span className="self-center font-mono text-[11px] text-muted tabular">{year}</span>
      {children}
    </>
  );
}

/**
 * Entradas por mes (últimos 12). Una sola serie: todas las columnas en gris y
 * el mes elegido en el acento. Solo el elegido lleva el número; los demás se
 * leen al pasar o enfocar (y cada columna abre su mes).
 */
export function MonthColumns({
  months,
  values,
  selected,
  basePath,
  height = 120,
}: {
  months: string[];
  values: number[];
  selected: string;
  /** Ruta a la que se le agrega ?mes=YYYY-MM. */
  basePath: string;
  /** Alto del área de columnas en px. */
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...values);
  const H = height;
  const shown = hover ?? months.indexOf(selected);
  const short = (m: string) =>
    new Intl.DateTimeFormat("es-UY", { month: "short", timeZone: "UTC" })
      .format(new Date(`${m}-01T00:00:00Z`))
      .replace(".", "");

  return (
    <div className="grid gap-2">
      <p className="tabular min-h-5 text-[13px] text-muted first-letter:uppercase" aria-live="polite">
        {shown >= 0 &&
          `${formatMonth(months[shown])}: ${values[shown] === 1 ? "1 entrada" : `${nf.format(values[shown])} entradas`}`}
      </p>
      <div className="relative" style={{ height: H }}>
        <span className="absolute inset-x-0 bottom-0 h-px bg-line-strong" />
        <div className="absolute inset-0 grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}>
          {months.map((m, i) => {
            const v = values[i];
            const isSel = m === selected;
            return (
              <Link
                key={m}
                href={`${basePath}?mes=${m}`}
                scroll={false}
                aria-label={`${formatMonth(m)}: ${v} entradas`}
                aria-current={isSel ? "true" : undefined}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover((x) => (x === i ? null : x))}
                onFocus={() => setHover(i)}
                onBlur={() => setHover((x) => (x === i ? null : x))}
                className={cx("group relative flex items-end justify-center rounded-t-[4px] transition-colors", hover === i && "bg-surface-2/70")}
              >
                <span
                  className={cx(
                    "relative block w-full max-w-6 rounded-t-[4px] transition-[height,background-color] duration-[480ms] ease-[var(--ease-out)]",
                    isSel ? "bg-accent" : "bg-surface-3 group-hover:bg-line-strong",
                  )}
                  style={{ height: v ? Math.max(3, (v / max) * (H - 18)) : 0 }}
                >
                  {isSel && v > 0 && (
                    <span className="tabular absolute bottom-full left-1/2 mb-1 -translate-x-1/2 text-[11px] font-medium text-fg">
                      {v}
                    </span>
                  )}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
      <div className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }} aria-hidden>
        {months.map((m) => (
          <span key={m} className={cx("text-center font-mono text-[10.5px] uppercase", m === selected ? "font-semibold text-fg" : "text-muted")}>
            {short(m).slice(0, 3)}
          </span>
        ))}
      </div>
      <details className="text-sm">
        <summary className="kicker inline-flex min-h-11 cursor-pointer items-center select-none hover:text-fg">Ver como tabla</summary>
        <table className="mt-1 w-full text-[13px]">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-1.5 font-normal">Mes</th>
              <th className="py-1.5 text-right font-normal">Entradas</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {months.map((m, i) => (
              <tr key={m} className="border-t border-line">
                <td className="py-1.5 first-letter:uppercase">{formatMonth(m)}</td>
                <td className="py-1.5 text-right">{nf.format(values[i])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

/** Barras horizontales por día de la semana, valor al final de cada una. */
export function WeekdayBars({ values }: { values: number[] }) {
  const labels = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
  const max = Math.max(1, ...values);
  const total = values.reduce((a, b) => a + b, 0) || 1;
  const top = values.indexOf(Math.max(...values));
  return (
    <ul className="grid gap-2">
      {values.map((v, i) => (
        <li key={i} className="grid grid-cols-[5.5rem_minmax(0,1fr)_3rem] items-center gap-3 border-b border-line py-1.5 text-[14px] last:border-b-0">
          <span className={cx(i === top ? "font-medium text-fg" : "text-muted")}>{labels[i]}</span>
          <span className="block h-2.5">
            <span
              className={cx("block h-2.5 rounded-r-[4px]", i === top ? "bg-accent" : "bg-[color-mix(in_oklab,var(--accent)_40%,var(--surface))]")}
              style={{ width: `${Math.max(2, (v / max) * 100)}%` }}
            />
          </span>
          <span className="text-right font-mono text-[12px] text-muted tabular" title={`${v} entradas`}>
            {Math.round((v / total) * 100)}%
          </span>
        </li>
      ))}
    </ul>
  );
}
