"use client";

import { ArrowBendUpRight, Check, X } from "@phosphor-icons/react";
import { dayState, nextStatus, type LogMap } from "@/lib/habit-logic";
import { HabitAvatar } from "@/lib/habit-icons";
import type { HabitDTO } from "@/lib/habits";
import { Sortable, SortableItem } from "@/components/sortable";
import { cx } from "@/components/ui";
import { HabitBadge, type MarkFn } from "./habit-ui";

/**
 * Las filas de hábitos de un día, iguales en Hoy (Hábitos) y en Inicio: ícono,
 * nombre, frecuencia y el círculo (un toque tilde, dos cruz, tres blanco). Tocar
 * el hábito abre la hoja del día. Mantener apretado (o clic y arrastrar) y mover
 * cambia el orden. El orden y qué hábitos van los decide quien la usa.
 */
export function HabitDayRows({
  habits,
  logs,
  day,
  today,
  mark,
  onOpen,
  onReorder,
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
  className?: string;
  rowClassName?: string;
}) {
  const isFuture = day > today;
  return (
    <Sortable ids={habits.map((h) => h.id)} onReorder={onReorder}>
      <ul className={cx("divide-y divide-line", className)}>
        {habits.map((h) => {
          const hLogs = logs[h.id] ?? {};
          const log = hLogs[day];
          const state = dayState(h, hLogs, day, today);
          const isCount = h.target > 1 || !!h.unit;
          return (
            <SortableItem key={h.id} id={h.id} className={cx("flex items-center gap-3 lg:gap-4", rowClassName)}>
              <button
                type="button"
                onClick={() => onOpen(h)}
                disabled={isFuture}
                className="flex min-w-0 flex-1 items-center gap-3 text-left lg:gap-4"
              >
                <HabitAvatar icon={h.icon} color={h.color} className="size-8 lg:size-[42px]" />
                <span className="grid min-w-0 gap-0.5 lg:gap-1">
                  <span className="flex items-baseline gap-2">
                    <span className="truncate text-[15px] leading-tight font-medium tracking-[-0.01em] lg:text-[16.5px]">{h.name}</span>
                    {isCount && (
                      <span className="tabular shrink-0 text-sm text-muted">
                        {log?.s === "done" ? log.v : 0}
                        {h.target > 1 ? `/${h.target}` : ""} {h.unit ?? ""}
                      </span>
                    )}
                  </span>
                  <span>
                    <HabitBadge habit={h} compact />
                  </span>
                </span>
              </button>
              <CheckButton
                state={state}
                disabled={isFuture}
                onTap={() => {
                  if (isCount) onOpen(h);
                  // Un toque: tilde verde; dos: cruz roja; tres: vuelve a blanco.
                  else mark(h.id, day, nextStatus(log), 1);
                }}
              />
            </SortableItem>
          );
        })}
      </ul>
    </Sortable>
  );
}

function CheckButton({ state, onTap, disabled }: { state: string; onTap: () => void; disabled?: boolean }) {
  const map: Record<string, { cls: string; icon: React.ReactNode; label: string }> = {
    done: {
      cls: "border-[var(--st-done-line)] bg-[var(--st-done-bg)] text-[var(--st-done-fg)]",
      icon: <Check size={20} weight="bold" />,
      label: "Hecho",
    },
    failed: {
      cls: "border-[var(--st-fail-line)] bg-[var(--st-fail-bg)] text-[var(--st-fail-fg)]",
      icon: <X size={18} weight="bold" />,
      label: "Fallado",
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
  const s = map[state] ?? { cls: "border-line-strong hover:border-fg/50", icon: null, label: "Marcar como hecho" };
  return (
    <button
      type="button"
      onClick={onTap}
      disabled={disabled}
      aria-label={s.label}
      className={cx(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-[transform,background-color,border-color] duration-200 active:scale-90 lg:size-11 disabled:opacity-40 motion-reduce:transition-none motion-reduce:active:scale-100",
        s.cls,
      )}
    >
      {s.icon}
    </button>
  );
}
