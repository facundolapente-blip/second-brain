"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CaretLeft, CaretRight, X } from "@phosphor-icons/react";
import { haptic } from "@/components/haptics";
import { cx } from "@/components/ui";
import { addDays, formatMonth, formatShort, shiftMonth, weekday } from "@/lib/dates";
import { deadlineShortcuts, monthGrid } from "@/lib/plan-logic";

const WEEK = ["L", "M", "M", "J", "V", "S", "D"];
const WEEK_LONG = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const DAY_NAME = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** Compu (mouse y pantalla ancha): cartel al lado de la fecha. Si no, hoja chica abajo. */
const isDesktop = () => window.matchMedia("(min-width: 1024px) and (pointer: fine)").matches;

/**
 * Selector de deadline propio (reemplaza al del aparato): atajos Hoy, Mañana,
 * Próximo lunes, +1 semana y Sin fecha, y debajo un calendario chico del mes.
 * En la compu se abre como cartel junto a la fecha; en el celular, como hoja
 * chica abajo. Teclado: flechas por día y semana, Re Pág / Av Pág por mes,
 * Inicio / Fin de la semana, Enter elige y Escape cierra (el foco vuelve a la fecha).
 */
export function DatePicker({
  value,
  today,
  onChange,
  label,
  className,
  triggerClassName,
  children,
}: {
  value: string | null;
  today: string;
  onChange: (date: string | null) => void;
  /** Para el lector de pantalla y el título del cartel ("Deadline de X"). */
  label: string;
  className?: string;
  triggerClassName?: string;
  children: React.ReactNode;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState<null | { desktop: boolean }>(null);
  const [closing, setClosing] = useState(false);
  function close(refocus = true) {
    setClosing(true);
    setTimeout(() => {
      setOpen(null);
      setClosing(false);
      if (refocus) trigger.current?.focus({ preventScroll: true });
    }, 130);
  }
  function pick(d: string | null) {
    haptic("select");
    if (d !== value) onChange(d);
    close();
  }
  return (
    <span className={cx("relative inline-flex shrink-0", className)}>
      <button
        ref={trigger}
        type="button"
        draggable={false}
        onClick={(e) => {
          e.stopPropagation();
          if (open) return close();
          setOpen({ desktop: isDesktop() });
        }}
        aria-haspopup="dialog"
        aria-expanded={!!open}
        aria-label={label}
        title="Cambiar la fecha"
        className={cx("press rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]", triggerClassName)}
      >
        {children}
      </button>
      {open && (
        <Popover anchor={trigger} desktop={open.desktop} closing={closing} onClose={close} label={label}>
          <Panel value={value} today={today} onPick={pick} onClose={close} />
        </Popover>
      )}
    </span>
  );
}

/** El cartel (compu) o la hoja chica (celular), afuera de la tabla para que nada lo recorte. */
function Popover({
  anchor,
  desktop,
  closing,
  onClose,
  label,
  children,
}: {
  anchor: React.RefObject<HTMLButtonElement | null>;
  desktop: boolean;
  closing: boolean;
  onClose: (refocus?: boolean) => void;
  label: string;
  children: React.ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; up: boolean } | null>(null);
  useLayoutEffect(() => {
    if (!desktop || !anchor.current || !box.current) return;
    const a = anchor.current.getBoundingClientRect();
    const b = box.current.getBoundingClientRect();
    // Abajo de la fecha; si no entra, arriba; si tampoco, lo más abajo que entre en la pantalla.
    const fitsBelow = a.bottom + 6 + b.height <= window.innerHeight - 8;
    const up = !fitsBelow && a.top - 6 - b.height >= 8;
    const top = fitsBelow ? a.bottom + 6 : up ? a.top - 6 - b.height : Math.max(8, window.innerHeight - b.height - 8);
    setPos({ left: Math.max(8, Math.min(a.left, window.innerWidth - b.width - 8)), top, up });
  }, [desktop, anchor]);
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (box.current?.contains(t) || anchor.current?.contains(t)) return;
      onClose(false);
    };
    const scroll = (e: Event) => {
      if (desktop && !box.current?.contains(e.target as Node)) onClose(false);
    };
    const resize = () => onClose(false);
    document.addEventListener("pointerdown", down, true);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", resize);
    };
  }, [anchor, desktop, onClose]);
  const host = (anchor.current?.closest("[data-module]") as HTMLElement | null) ?? document.body;
  return createPortal(
    <>
      {!desktop && <div aria-hidden className={cx("fixed inset-0 z-[70] bg-black/30", closing ? "plan-fade-out" : "plan-fade-in")} />}
      <div
        ref={box}
        role="dialog"
        aria-modal={desktop ? undefined : true}
        aria-label={label}
        style={desktop ? { left: pos?.left ?? -9999, top: pos?.top ?? -9999 } : undefined}
        className={cx(
          "z-[71] border border-line-strong bg-surface text-fg shadow-[0_18px_44px_-18px_rgba(var(--shadow-tint),0.5)]",
          desktop
            ? cx("fixed w-[18.5rem] rounded-2xl p-2", pos && (closing ? "menu-out" : "menu-in"), pos?.up ? "origin-bottom-left" : "origin-top-left")
            : cx("fixed inset-x-0 bottom-0 rounded-t-[22px] px-3 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]", closing ? "plan-sheet-out" : "plan-sheet-in"),
        )}
      >
        {!desktop && (
          <div className="flex items-center justify-between pb-1 pl-2">
            <span aria-hidden className="absolute top-2 left-1/2 h-1 w-9 -translate-x-1/2 rounded-full bg-line-strong" />
            <h2 className="pt-3 text-[15px] font-semibold">{label}</h2>
            <button type="button" onClick={() => onClose()} aria-label="Cerrar" className="mt-2 inline-flex size-11 items-center justify-center rounded-full text-muted hover:bg-surface-2">
              <X size={18} />
            </button>
          </div>
        )}
        {children}
      </div>
    </>,
    host,
  );
}

function Panel({ value, today, onPick, onClose }: { value: string | null; today: string; onPick: (d: string | null) => void; onClose: () => void }) {
  const [month, setMonth] = useState((value ?? today).slice(0, 7));
  const [focus, setFocus] = useState(value ?? today);
  const grid = useRef<HTMLDivElement>(null);
  const keyed = useRef(false);
  // Al abrir, el foco va al día elegido (o a hoy); después sigue a las flechas.
  useEffect(() => {
    grid.current?.querySelector<HTMLElement>(`[data-day="${focus}"]`)?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!keyed.current) return;
    grid.current?.querySelector<HTMLElement>(`[data-day="${focus}"]`)?.focus({ preventScroll: true });
  }, [focus, month]);
  const moveFocus = (d: string) => {
    keyed.current = true;
    setFocus(d);
    if (d.slice(0, 7) !== month) setMonth(d.slice(0, 7));
  };
  function onKey(e: React.KeyboardEvent) {
    const wd = (weekday(focus) + 6) % 7;
    const map: Record<string, () => string> = {
      ArrowLeft: () => addDays(focus, -1),
      ArrowRight: () => addDays(focus, 1),
      ArrowUp: () => addDays(focus, -7),
      ArrowDown: () => addDays(focus, 7),
      Home: () => addDays(focus, -wd),
      End: () => addDays(focus, 6 - wd),
      PageUp: () => sameDayIn(shiftMonth(focus.slice(0, 7), -1), focus),
      PageDown: () => sameDayIn(shiftMonth(focus.slice(0, 7), 1), focus),
    };
    if (map[e.key]) {
      e.preventDefault();
      moveFocus(map[e.key]());
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  }
  const shortcuts = deadlineShortcuts(today, value);
  const weeks = monthGrid(month);
  return (
    <div
      className="grid gap-1"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <ul className="grid">
        {shortcuts.map((s) => (
          <li key={s.label}>
            <button
              type="button"
              onClick={() => onPick(s.date)}
              className={cx(
                "tap-tint flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 text-left text-[14px] hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none pointer-fine:min-h-9",
                value === s.date && "font-semibold",
              )}
            >
              <span>{s.label}</span>
              <span className="font-mono text-[12px] text-muted tabular">
                {DAY_NAME[weekday(s.date)].slice(0, 3)} {formatShort(s.date)}
              </span>
            </button>
          </li>
        ))}
        {value && (
          <li>
            <button
              type="button"
              onClick={() => onPick(null)}
              className="tap-tint flex min-h-11 w-full items-center rounded-xl px-3 text-left text-[14px] text-danger hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none pointer-fine:min-h-9"
            >
              Sin fecha
            </button>
          </li>
        )}
      </ul>
      <div className="mx-1 border-t border-line" />
      <div className="flex items-center justify-between px-1 pt-1">
        <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Mes anterior" className="inline-flex size-10 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-fg">
          <CaretLeft size={16} />
        </button>
        <span className="text-[13.5px] font-semibold first-letter:uppercase" aria-live="polite">
          {formatMonth(month)}
        </span>
        <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Mes siguiente" className="inline-flex size-10 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-fg">
          <CaretRight size={16} />
        </button>
      </div>
      <div ref={grid} role="grid" aria-label={formatMonth(month)} onKeyDown={onKey} className="grid gap-0.5 px-1 pb-1">
        <div role="row" className="grid grid-cols-7">
          {WEEK.map((w, i) => (
            <span key={i} role="columnheader" aria-label={WEEK_LONG[i]} className="grid h-7 place-items-center font-mono text-[10.5px] text-muted uppercase">
              {w}
            </span>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0]} role="row" className="grid grid-cols-7">
            {week.map((d) => {
              const out = d.slice(0, 7) !== month;
              const on = d === value;
              const isToday = d === today;
              return (
                <span key={d} role="gridcell" aria-selected={on}>
                  <button
                    type="button"
                    data-day={d}
                    tabIndex={d === focus ? 0 : -1}
                    onClick={() => onPick(d)}
                    onFocus={() => d !== focus && setFocus(d)}
                    aria-label={`${DAY_NAME[weekday(d)]} ${formatShort(d)}${isToday ? ", hoy" : ""}`}
                    className={cx(
                      "relative mx-auto grid size-10 place-items-center rounded-full text-[13.5px] tabular transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] pointer-fine:size-9",
                      on ? "bg-ink font-semibold text-on-ink" : out ? "text-faint hover:bg-surface-2" : "text-fg hover:bg-surface-2",
                      isToday && !on && "font-semibold text-accent-fg",
                    )}
                  >
                    {Number(d.slice(8))}
                    {isToday && <span aria-hidden className={cx("absolute bottom-1.5 size-1 rounded-full", on ? "bg-on-ink" : "bg-accent")} />}
                  </button>
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/** El mismo número de día en otro mes (del 31 a un mes de 30, el último). */
function sameDayIn(month: string, day: string): string {
  const last = Number(addDays(`${shiftMonth(month, 1)}-01`, -1).slice(8));
  return `${month}-${String(Math.min(Number(day.slice(8)), last)).padStart(2, "0")}`;
}
