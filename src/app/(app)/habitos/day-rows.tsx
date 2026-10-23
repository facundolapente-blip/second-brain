"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowBendUpRight, Check, X } from "@phosphor-icons/react";
import { dayState, nextStatus, periodStart, unitLabel, weekProgress, type DayLog, type LogMap } from "@/lib/habit-logic";
import { HabitAvatar } from "@/lib/habit-icons";
import type { HabitDTO } from "@/lib/habits";
import { Sortable, SortableItem } from "@/components/sortable";
import { cx } from "@/components/ui";
import { haptic } from "@/components/haptics";
import { HabitBadge, type MarkFn } from "./habit-ui";
import "./habits.css";

/**
 * Hábitos que se vieron en el día: al destildar uno que ya no tocaría (un
 * fallado en una semana que igual se cumplió) no desaparece de la lista mientras
 * se mira ese día. `ids` son los que tocan según `showsOn`; devuelve esos más los
 * que ya se habían visto.
 */
export function useStickyDay(day: string, ids: string[]): Set<string> {
  const [seen, setSeen] = useState<{ day: string; ids: Set<string> }>(() => ({ day, ids: new Set(ids) }));
  let cur = seen.day === day ? seen : { day, ids: new Set<string>() };
  if (cur !== seen || ids.some((id) => !cur.ids.has(id))) {
    cur = { day, ids: new Set([...cur.ids, ...ids]) };
    setSeen(cur);
  }
  return cur.ids;
}

/**
 * Las filas de hábitos de un día, iguales en Hoy (Hábitos) y en Inicio: ícono,
 * nombre, frecuencia y el círculo (un toque tilde, dos cruz, tres blanco). Tocar
 * el hábito abre la hoja del día. Mantener apretado (o clic y arrastrar) y mover
 * cambia el orden. El orden y qué hábitos van los decide quien la usa.
 *
 * Rápida al tocar: cada fila está memorizada y recibe solo las marcas de su hábito
 * (el mismo objeto mientras no cambien, ver `useHabitLogs`), así un toque vuelve a
 * dibujar una fila y no todas. `celebrate` (de `useJustCompleted`) hace salir el aro
 * de "Día completo" del círculo del último hábito tocado.
 */
export function HabitDayRows({
  habits,
  logs,
  day,
  today,
  mark,
  onOpen,
  onReorder,
  celebrate,
  className,
  rowClassName,
}: {
  habits: HabitDTO[];
  logs: Record<string, LogMap>;
  day: string;
  today: string;
  mark: MarkFn;
  onOpen: (h: HabitDTO) => void;
  onReorder: (ids: string[]) => void;
  celebrate?: boolean;
  className?: string;
  rowClassName?: string;
}) {
  const isFuture = day > today;
  // El último hábito tocado (o abierto en la hoja): de su círculo sale el aro al completar el día.
  const [lastId, setLastId] = useState<string | null>(null);
  // Funciones estables para las filas memorizadas (leen lo último por una referencia).
  const latest = useRef({ mark, onOpen, day });
  useLayoutEffect(() => {
    latest.current = { mark, onOpen, day };
  });
  const tap = useCallback((h: HabitDTO, log: DayLog | undefined) => {
    setLastId(h.id);
    const { mark, onOpen, day } = latest.current;
    if (h.target > 1 || !!h.unit) return onOpen(h);
    // Un toque: tilde verde; dos: cruz roja; tres: vuelve a blanco.
    mark(h.id, day, nextStatus(log), 1);
  }, []);
  const open = useCallback((h: HabitDTO) => {
    setLastId(h.id);
    latest.current.onOpen(h);
  }, []);
  const idKey = habits.map((h) => h.id).join("|");
  const ids = useMemo(() => (idKey ? idKey.split("|") : []), [idKey]);
  return (
    <Sortable ids={ids} onReorder={onReorder}>
      <ul className={cx("divide-y divide-line", className)}>
        {habits.map((h) => (
          <HabitRow
            key={h.id}
            habit={h}
            logs={logs[h.id] ?? NO_LOGS}
            day={day}
            today={today}
            isFuture={isFuture}
            onTap={tap}
            onOpen={open}
            burst={!!celebrate && lastId === h.id}
            className={rowClassName}
          />
        ))}
      </ul>
    </Sortable>
  );
}

const NO_LOGS: LogMap = {};

const HabitRow = memo(function HabitRow({
  habit: h,
  logs: hLogs,
  day,
  today,
  isFuture,
  onTap,
  onOpen,
  burst,
  className,
}: {
  habit: HabitDTO;
  logs: LogMap;
  day: string;
  today: string;
  isFuture: boolean;
  onTap: (h: HabitDTO, log: DayLog | undefined) => void;
  onOpen: (h: HabitDTO) => void;
  burst: boolean;
  className?: string;
}) {
  const log = hLogs[day];
  // El círculo muestra la marca que hay: un salteado de hoy (que el
  // estado del día deja en blanco) se ve salteado, así el toque se entiende.
  const state = log?.s === "skipped" ? "skipped" : dayState(h, hLogs, day, today);
  const isCount = h.target > 1 || !!h.unit;
  const value = log?.s === "done" ? log.v : 0;
  return (
    <SortableItem id={h.id} className={cx("flex items-center gap-3 lg:gap-4", className)}>
      <button
        type="button"
        onClick={() => onOpen(h)}
        disabled={isFuture}
        className="tap-tint -my-1 -ml-1.5 flex min-w-0 flex-1 items-center gap-3 rounded-lg py-1 pl-1.5 text-left transition-colors duration-[80ms] hover:bg-ink/[0.03] disabled:hover:bg-transparent lg:gap-4"
      >
        <HabitAvatar icon={h.icon} color={h.color} className="size-9 lg:size-[42px]" />
        <span className="grid min-w-0 gap-0.5 lg:gap-1">
          <span className="flex items-baseline gap-2">
            <span className="truncate text-[16px] leading-tight font-medium tracking-[-0.01em] lg:text-[16.5px]">{h.name}</span>
            {isCount && (
              <span className="tabular shrink-0 text-sm text-muted">
                {value}
                {h.target > 1 ? `/${h.target}` : ""} {unitLabel(h.target > 1 ? h.target : value, h.unit)}
              </span>
            )}
          </span>
          <span className="flex min-w-0 items-center gap-2">
            <HabitBadge habit={h} compact />
            <WeekCount habit={h} logs={hLogs} day={day} today={today} />
          </span>
        </span>
      </button>
      <CheckButton state={state} disabled={isFuture} burst={burst} onTap={() => onTap(h, log)} />
    </SortableItem>
  );
});

/** "2/4 esta semana" en los "X veces por semana": hechas en la semana del hábito sobre la meta. */
export function WeekCount({ habit, logs, day, today, className }: { habit: HabitDTO; logs: LogMap; day: string; today: string; className?: string }) {
  const wp = weekProgress(habit, logs, day);
  if (!wp) return null;
  const thisWeek = periodStart(habit, day) === periodStart(habit, today);
  return (
    <span className={cx("tabular min-w-0 truncate font-mono text-[11.5px] leading-none text-muted lg:text-[12px]", className)}>
      {wp.done}/{wp.need} {/* En el celular no entra entero al lado de la frecuencia: "2/4 sem." */}
      <span className="sm:hidden" aria-hidden>sem.</span>
      <span className="max-sm:sr-only">{thisWeek ? "esta semana" : "esa semana"}</span>
    </span>
  );
}

const CHECK_STATES: Record<string, { cls: string; icon: React.ReactNode; label: string }> = {
  // Hecho: lleno del verde de "hecho" con el tilde blanco (antes un verde pálido que
  // casi no se distinguía de "sin marcar"). Los colores están en habits.css.
  done: {
    cls: "border-[var(--hc-done)] bg-[var(--hc-done)] text-[var(--hc-on-done)]",
    icon: <Check size={20} weight="bold" />,
    label: "Hecho",
  },
  // Fallado: rojo suave lleno, con la cruz en rojo oscuro.
  failed: {
    cls: "border-[var(--st-fail-bg)] bg-[var(--st-fail-bg)] text-[var(--st-fail-fg)]",
    icon: <X size={18} weight="bold" />,
    label: "Fallado",
  },
  // Fallado en una semana que igual llegó a la meta: la cruz, más suave.
  missed: {
    cls: "border-transparent bg-[var(--st-fail-bg)]/50 text-[var(--st-fail-fg)]/70",
    icon: <X size={18} weight="bold" />,
    label: "Fallado (la semana igual se cumplió)",
  },
  skipped: {
    cls: "border-[var(--st-skip-line)] bg-[var(--st-skip-bg)] text-[var(--st-skip-fg)]",
    icon: <ArrowBendUpRight size={18} weight="bold" />,
    label: "Salteado",
  },
  unmarked: {
    cls: "border-transparent bg-[var(--st-skip-bg)] text-[var(--st-skip-fg)]",
    icon: null,
    label: "Sin marcar",
  },
  partial: {
    cls: "border-dashed border-[var(--st-done-line)] bg-[var(--st-done-bg)] text-[var(--st-done-fg)]",
    icon: null,
    label: "A medias",
  },
};
const CHECK_DEFAULT = { cls: "border-line-strong hover:border-fg/50", icon: null, label: "Marcar como hecho" };

function unpress(e: React.PointerEvent<HTMLElement>) {
  delete e.currentTarget.dataset.pressed;
}

function CheckButton({ state, onTap, disabled, burst }: { state: string; onTap: () => void; disabled?: boolean; burst?: boolean }) {
  const [tapped, setTapped] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const prev = useRef(state);
  // Al pasar a "hecho" con un toque, el círculo da un golpe con resorte (0,9 → 1,06 → 1).
  useLayoutEffect(() => {
    const was = prev.current;
    prev.current = state;
    const el = ref.current;
    if (!tapped || was === state || state !== "done" || !el || typeof el.animate !== "function") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.animate([{ scale: "0.9" }, { scale: "1.06", offset: 0.55 }, { scale: "1" }], {
      duration: 240,
      easing: "cubic-bezier(0.16, 1, 0.3, 1)",
    });
  }, [state, tapped]);
  // Si se suelta fuera del círculo (o el toque se vuelve scroll o arrastre), deja de estar apretado.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const off = () => delete el.dataset.pressed;
    window.addEventListener("pointerup", off);
    window.addEventListener("pointercancel", off);
    return () => {
      window.removeEventListener("pointerup", off);
      window.removeEventListener("pointercancel", off);
    };
  }, []);
  const s = CHECK_STATES[state] ?? CHECK_DEFAULT;
  return (
    <button
      ref={ref}
      type="button"
      data-state={state}
      // Apretado al instante, sin esperar a React: escala y borde en 80 ms (habits.css).
      onPointerDown={(e) => {
        if (!disabled) e.currentTarget.dataset.pressed = "";
      }}
      onPointerUp={unpress}
      onPointerLeave={unpress}
      onPointerCancel={unpress}
      onClick={() => {
        // La vibración sale en el mismo cuadro que el cambio del círculo (la fila se
        // dibuja enseguida: ver HabitRow).
        haptic("tap");
        setTapped(true);
        onTap();
      }}
      disabled={disabled}
      aria-label={s.label}
      className={cx(
        "habit-check relative inline-flex size-9 shrink-0 items-center justify-center rounded-full border-[1.5px] lg:size-11 disabled:opacity-40",
        s.cls,
      )}
    >
      {s.icon && (
        <span key={state} className={cx("inline-flex", tapped && (state === "done" ? "check-draw" : "mark-pop"))}>
          {s.icon}
        </span>
      )}
      {burst && <span aria-hidden className="habit-burst" />}
    </button>
  );
}

/**
 * True justo cuando el día pasa a completo con un toque (no al abrir la página
 * ya completa, ni al pasar a mirar otro día ya completo: `scope` es el día que se
 * mira). Dispara el único momento con movimiento propio de la app y la vibración
 * de "completo".
 */
export function useJustCompleted(complete: boolean, scope = "") {
  const [st, setSt] = useState({ complete, scope, celebrate: false });
  let cur = st;
  if (st.scope !== scope) {
    cur = { complete, scope, celebrate: false };
    setSt(cur);
  } else if (st.complete !== complete) {
    cur = { complete, scope, celebrate: complete };
    setSt(cur);
  }
  const celebrate = cur.celebrate;
  useEffect(() => {
    if (celebrate) haptic("complete");
  }, [celebrate]);
  return celebrate;
}

/**
 * Cierre de la lista cuando está todo hecho. Aparece con movimiento solo si se
 * acaba de completar (`celebrate`); al abrir un día ya completo, quieto.
 */
export function DayComplete({ done, total, celebrate }: { done: number; total: number; celebrate: boolean }) {
  const complete = total > 0 && done >= total;
  if (!complete) return null;
  return (
    <p className={cx("flex items-center justify-center gap-2.5 py-6 text-[14px] font-medium text-fg", celebrate && "reveal")} role="status">
      <span
        className={cx(
          "inline-flex size-8 items-center justify-center rounded-full border-[1.5px] border-[var(--st-done-line)] bg-[var(--st-done-bg)] text-[var(--st-done-fg)]",
          celebrate && "day-done",
        )}
      >
        <Check size={16} weight="bold" aria-hidden />
      </span>
      Día completo
    </p>
  );
}
