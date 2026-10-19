"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { formatMonth, shiftMonth } from "@/lib/dates";
import { periodHref, periodLabel, type Period } from "@/lib/finance-logic";
import { Button, cx, Input, Segmented } from "@/components/ui";
import { useSlide } from "@/components/motion";
import { usePeriodStep, useStepEvents } from "./period-step";

/** Mes o año corrido `delta` lugares (el período libre no tiene flechas). */
function shifted(p: Period, delta: number): Period | null {
  if (p.kind === "month") {
    const month = shiftMonth(p.month, delta);
    return { kind: "month", month, from: `${month}-01`, to: `${month}-31` };
  }
  if (p.kind === "year") {
    const year = String(Number(p.year) + delta);
    return { kind: "year", year, from: `${year}-01-01`, to: `${year}-12-31` };
  }
  return null;
}

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
  // Llegó otro período por la URL (atrás del navegador, otro enlace): el modo y las fechas lo siguen.
  const [seen, setSeen] = useState(`${period.from}_${period.to}`);
  if (seen !== `${period.from}_${period.to}`) {
    setSeen(`${period.from}_${period.to}`);
    setMode(period.kind);
    setFrom(period.from);
    setTo(period.to);
  }
  // El renglón de flechas o fechas entra suave solo si se cambió de modo con un toque (al cargar, quieto).
  const [modeTouched, setModeTouched] = useState(false);
  const href = (p: Period) => periodHref(p, today, basePath);
  const prev = shifted(period, -1);
  const next = shifted(period, 1);
  // Lo que se ve cambia al toque; los datos llegan después (y se precargan los vecinos).
  const step = usePeriodStep(period, [prev ? href(prev) : "", next ? href(next) : ""]);
  const shown = step.shown;
  const move = (delta: 1 | -1) => {
    const n = shifted(shown, delta);
    if (n) step.go(n, href(n));
  };
  useStepEvents((d) => {
    if (mode === shown.kind && shown.kind !== "range") move(d);
  });
  const slide = useSlide(shown.from);
  /** Flecha: enlace de verdad (sirve sin JavaScript y con clic del medio), pero con un clic común no espera. */
  const arrowProps = (delta: 1 | -1) => {
    const n = shifted(shown, delta);
    return {
      href: n ? href(n) : basePath,
      onClick: (e: React.MouseEvent) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        move(delta);
      },
    };
  };
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
            setModeTouched(true);
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

      {mode === "month" && shown.kind === "month" && (
        <div className={cx("-ml-3 flex items-center gap-0.5", modeTouched && "reveal")}>
          <Link {...arrowProps(-1)} aria-label="Mes anterior" className={arrow}>
            <CaretLeft size={18} />
          </Link>
          <h2 className="min-w-[9.5rem] overflow-hidden text-center" aria-live="polite">
            <span key={shown.month} className={cx("display inline-block text-[22px] first-letter:uppercase", slide)}>
              {formatMonth(shown.month)}
            </span>
          </h2>
          <Link {...arrowProps(1)} aria-label="Mes siguiente" className={arrow}>
            <CaretRight size={18} />
          </Link>
          {shown.month !== thisMonth && (
            <Link
              href={basePath}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                e.preventDefault();
                const n = shifted({ kind: "month", month: thisMonth, from: "", to: "" }, 0)!;
                step.go(n, basePath);
              }}
              className={todayBtn}
            >
              Hoy
            </Link>
          )}
        </div>
      )}

      {mode === "year" && shown.kind === "year" && (
        <div className={cx("-ml-3 flex items-center gap-0.5", modeTouched && "reveal")}>
          <Link {...arrowProps(-1)} aria-label="Año anterior" className={arrow}>
            <CaretLeft size={18} />
          </Link>
          <h2 className="min-w-[6rem] overflow-hidden text-center" aria-live="polite">
            <span key={shown.year} className={cx("display inline-block text-[22px]", slide)}>
              {shown.year}
            </span>
          </h2>
          <Link {...arrowProps(1)} aria-label="Año siguiente" className={arrow}>
            <CaretRight size={18} />
          </Link>
          {shown.year !== thisYear && (
            <Link
              href={href({ kind: "year", year: thisYear, from: "", to: "" })}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                e.preventDefault();
                const n = shifted({ kind: "year", year: thisYear, from: "", to: "" }, 0)!;
                step.go(n, href(n));
              }}
              className={todayBtn}
            >
              Este año
            </Link>
          )}
        </div>
      )}

      {mode === "range" && (
        <form
          className={cx("grid gap-2", modeTouched && "reveal")}
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
