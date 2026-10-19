"use client";

import Link from "next/link";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { formatMonth, shiftMonth } from "@/lib/dates";
import { useSlide } from "@/components/motion";
import { cx } from "@/components/ui";
import { usePeriodStep, useStepEvents } from "../gastos/period-step";

/**
 * Flechas de mes del calendario y las estadísticas: el nombre cambia y desliza al
 * toque (los datos llegan después, con `NavDim`), cada toque cuenta desde el mes
 * que ya se ve y el anterior y el siguiente quedan precargados. Deslizar la
 * pantalla (`PeriodSwipeMain`) hace lo mismo.
 */
export function JournalMonthNav({
  month,
  base,
  suffix = "",
  max,
  todayMonth,
  todayHref,
  titleClassName = "text-[26px]",
  children,
}: {
  month: string;
  /** La dirección hasta el mes: `${base}${mes}${suffix}`. */
  base: string;
  suffix?: string;
  /** Último mes al que se puede ir (estadísticas: el actual). */
  max?: string;
  todayMonth?: string;
  /** "Volver a hoy" (si se pasa y no se está en el mes de hoy). */
  todayHref?: string;
  titleClassName?: string;
  children?: React.ReactNode;
}) {
  const href = (m: string) => `${base}${m}${suffix}`;
  const can = (m: string) => !max || m <= max;
  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);
  const step = usePeriodStep(month, [href(prev), can(next) ? href(next) : ""]);
  const shown = step.shown;
  const slide = useSlide(shown);
  const move = (m: string, to = href(m)) => {
    if (can(m)) step.go(m, to);
  };
  useStepEvents((d) => move(shiftMonth(shown, d)));
  const click = (m: string, to?: string) => (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    move(m, to);
  };
  const arrow = "inline-flex size-11 shrink-0 items-center justify-center rounded-[4px] text-fg transition-colors hover:bg-surface-2";
  const sPrev = shiftMonth(shown, -1);
  const sNext = shiftMonth(shown, 1);
  return (
    <div className="flex items-center justify-between gap-2">
      <Link href={href(sPrev)} scroll={false} onClick={click(sPrev)} aria-label="Mes anterior" className={arrow}>
        <CaretLeft size={18} />
      </Link>
      <div className="grid min-w-0 justify-items-center gap-0.5 overflow-hidden text-center leading-tight">
        <h2 aria-live="polite" className="overflow-hidden">
          <span key={shown} className={cx("display inline-block first-letter:uppercase", titleClassName, slide)}>
            {formatMonth(shown)}
          </span>
        </h2>
        {children}
        {todayHref && todayMonth && shown !== todayMonth && (
          <Link
            href={todayHref}
            scroll={false}
            onClick={click(todayMonth, todayHref)}
            className="mt-0.5 text-[13px] font-medium text-accent-fg hover:underline"
          >
            Volver a hoy
          </Link>
        )}
      </div>
      {can(sNext) ? (
        <Link href={href(sNext)} scroll={false} onClick={click(sNext)} aria-label="Mes siguiente" className={arrow}>
          <CaretRight size={18} />
        </Link>
      ) : (
        <span className="size-11 shrink-0" />
      )}
    </div>
  );
}
