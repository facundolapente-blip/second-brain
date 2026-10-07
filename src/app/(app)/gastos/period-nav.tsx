"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { formatMonth, shiftMonth } from "@/lib/dates";
import { periodHref, periodLabel, type Period } from "@/lib/finance-logic";
import { Button, cx, Input, Segmented } from "@/components/ui";

const arrow =
  "inline-flex size-11 items-center justify-center rounded-[4px] text-muted transition-colors hover:bg-surface-2 hover:text-fg";
const todayBtn =
  "ml-1 inline-flex h-9 items-center rounded-[4px] border border-line-strong px-3 text-[13px] font-medium transition-colors hover:bg-surface-2";

/**
 * Qué se ve en Movimientos: un mes, un año o un período con fecha de inicio y
 * de fin. Todo va en la URL (?mes=, ?anio=, ?desde=&hasta=).
 */
export function PeriodNav({
  period,
  today,
  basePath = "/gastos",
  modes = ["month", "year", "range"],
}: {
  period: Period;
  today: string;
  basePath?: string;
  /** Qué modos se ofrecen (Informes: solo mes y año). */
  modes?: Period["kind"][];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Period["kind"]>(period.kind);
  const [from, setFrom] = useState(period.from);
  const [to, setTo] = useState(period.to);
  const thisMonth = today.slice(0, 7);
  const thisYear = today.slice(0, 4);
  // Mes y año de referencia al cambiar de modo: el final de lo que se está viendo (sin pasar de hoy).
  const ref = period.to > today ? today : period.to;
  const go = (p: Parameters<typeof periodHref>[0]) => router.push(periodHref(p, today, basePath));

  return (
    <div className="grid gap-2">
      <div className={cx("w-full", modes.length === 3 ? "max-w-[19rem]" : "max-w-[13rem]")}>
        <Segmented
          value={mode}
          onChange={(m) => {
            setMode(m);
            if (m === "month") go({ kind: "month", month: ref.slice(0, 7) });
            if (m === "year") go({ kind: "year", year: ref.slice(0, 4) });
          }}
          options={(
            [
              { value: "month", label: "Mes" },
              { value: "year", label: "Año" },
              { value: "range", label: "Período" },
            ] as const
          ).filter((o) => modes.includes(o.value))}
        />
      </div>

      {mode === "month" && period.kind === "month" && (
        <div className="-ml-3 flex items-center gap-0.5">
          <Link href={periodHref({ kind: "month", month: shiftMonth(period.month, -1) }, today, basePath)} aria-label="Mes anterior" className={arrow}>
            <CaretLeft size={18} />
          </Link>
          <h2 className="display min-w-[9.5rem] text-center text-[22px] first-letter:uppercase">{formatMonth(period.month)}</h2>
          <Link href={periodHref({ kind: "month", month: shiftMonth(period.month, 1) }, today, basePath)} aria-label="Mes siguiente" className={arrow}>
            <CaretRight size={18} />
          </Link>
          {period.month !== thisMonth && (
            <Link href={basePath} className={todayBtn}>
              Hoy
            </Link>
          )}
        </div>
      )}

      {mode === "year" && period.kind === "year" && (
        <div className="-ml-3 flex items-center gap-0.5">
          <Link href={periodHref({ kind: "year", year: String(Number(period.year) - 1) }, today, basePath)} aria-label="Año anterior" className={arrow}>
            <CaretLeft size={18} />
          </Link>
          <h2 className="display min-w-[6rem] text-center text-[22px]">{period.year}</h2>
          <Link href={periodHref({ kind: "year", year: String(Number(period.year) + 1) }, today, basePath)} aria-label="Año siguiente" className={arrow}>
            <CaretRight size={18} />
          </Link>
          {period.year !== thisYear && (
            <Link href={periodHref({ kind: "year", year: thisYear }, today, basePath)} className={todayBtn}>
              Este año
            </Link>
          )}
        </div>
      )}

      {mode === "range" && (
        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (from && to) go({ kind: "range", from, to });
          }}
        >
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-[12.5px] text-muted">
              Desde
              <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} required className="w-[10.5rem]" />
            </label>
            <label className="grid gap-1 text-[12.5px] text-muted">
              Hasta
              <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} required className="w-[10.5rem]" />
            </label>
            <Button type="submit" variant="accent" size="sm" className="h-11">
              Ver
            </Button>
          </div>
          {period.kind === "range" && (
            <p className={cx("display text-[20px]")}>{periodLabel(period)}</p>
          )}
        </form>
      )}
    </div>
  );
}
