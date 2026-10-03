"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowBendUpRight, Check, Plus, X } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { addDays, diffDays, weekday } from "@/lib/dates";
import { dayState, isScheduled, WEEKDAY_SHORT, type LogMap } from "@/lib/habit-logic";
import { HabitIcon } from "@/lib/habit-icons";
import { tone } from "@/lib/palette";
import type { CategoryDTO, HabitDTO } from "@/lib/habits";
import { PageHeader } from "@/components/page-header";
import { Button, cx, ToneSquare } from "@/components/ui";
import { DaySheet, HabitBadge, useHabitLogs, type DaySheetHandle } from "./habit-ui";
import { HabitForm, type HabitFormHandle } from "./habit-form";
import { HabitsTabs } from "./habits-nav";

const PAST = 30;
const FUTURE = 7;

export function TodayView({
  habits,
  logs: initialLogs,
  categories,
  today,
}: {
  habits: HabitDTO[];
  logs: Record<string, LogMap>;
  categories: CategoryDTO[];
  today: string;
}) {
  const { logs, mark } = useHabitLogs(initialLogs);
  const [selected, setSelected] = useState(today);
  const form = useRef<HabitFormHandle>(null);
  const daySheet = useRef<DaySheetHandle>(null);

  const days = useMemo(
    () => Array.from({ length: PAST + FUTURE + 1 }, (_, i) => addDays(today, i - PAST)),
    [today],
  );

  // Como en HabitNow: primero lo que falta marcar, después prioridad y nombre.
  const settled = (h: HabitDTO) => {
    const st = dayState(h, logs[h.id] ?? {}, selected, today);
    return st === "done" || st === "failed" || st === "skipped" ? 1 : 0;
  };
  const visible = habits
    .filter((h) => isScheduled(h, selected))
    .sort((a, b) => settled(a) - settled(b) || b.priority - a.priority || a.name.localeCompare(b.name, "es"));

  const isFuture = selected > today;
  const doneCount = visible.filter((h) => dayState(h, logs[h.id] ?? {}, selected, today) === "done").length;

  // Avance de cada día de la tira (anillo chico): hechos sobre los que tocaban.
  const progress = useMemo(() => {
    const out: Record<string, number> = {};
    for (const d of days) {
      if (d > today) continue;
      const sched = habits.filter((h) => isScheduled(h, d));
      if (!sched.length) continue;
      out[d] = sched.filter((h) => dayState(h, logs[h.id] ?? {}, d, today) === "done").length / sched.length;
    }
    return out;
  }, [days, habits, logs, today]);

  return (
    <>
      <PageHeader
        title={selected === today ? "Hoy" : relativeTitle(selected, today)}
        tabs={<HabitsTabs />}
        actions={
          <Button variant="accent" size="sm" className="max-lg:hidden" onClick={() => form.current?.create()}>
            <Plus size={16} weight="bold" /> Nuevo hábito
          </Button>
        }
      />

      <main className="mx-auto max-w-3xl">
        <DateStrip days={days} selected={selected} today={today} onSelect={setSelected} progress={progress} />

        <div className="px-4 lg:px-8">
          {visible.length > 0 && !isFuture && <DaySummary done={doneCount} total={visible.length} />}
          {habits.length === 0 ? (
            <EmptyState onCreate={() => form.current?.create()} />
          ) : visible.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted">No hay hábitos para este día.</p>
          ) : (
            <ul className="card divide-y divide-line overflow-hidden px-3.5 lg:px-5">
              {visible.map((h, i) => {
                const hLogs = logs[h.id] ?? {};
                const log = hLogs[selected];
                const state = dayState(h, hLogs, selected, today);
                const isCount = h.target > 1 || !!h.unit;
                return (
                  <li key={h.id} className="rise flex items-center gap-3.5 py-3" style={{ "--i": i } as React.CSSProperties}>
                    <button
                      type="button"
                      onClick={() => daySheet.current?.show(h, selected)}
                      disabled={isFuture}
                      className="flex min-w-0 flex-1 items-center gap-3.5 text-left"
                    >
                      <ToneSquare size={44} style={tone(h.color)}>
                        <HabitIcon name={h.icon} size={24} weight="fill" />
                      </ToneSquare>
                      <span className="grid min-w-0 gap-1">
                        <span className="flex items-baseline gap-2">
                          <span className="truncate text-[16px] font-semibold tracking-[-0.01em]">{h.name}</span>
                          {isCount && (
                            <span className="tabular shrink-0 text-sm text-muted">
                              {log?.s === "done" ? log.v : 0}
                              {h.target > 1 ? `/${h.target}` : ""} {h.unit ?? ""}
                            </span>
                          )}
                        </span>
                        <span>
                          <HabitBadge habit={h} />
                        </span>
                      </span>
                    </button>
                    <CheckButton
                      state={state}
                      disabled={isFuture}
                      onTap={() => {
                        if (isCount) daySheet.current?.show(h, selected);
                        else mark(h.id, selected, log?.s === "done" ? null : "done", 1);
                      }}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>

      <Fab onClick={() => form.current?.create()} />
      <HabitForm ref={form} categories={categories} today={today} />
      <DaySheet ref={daySheet} logs={logs} mark={mark} />
    </>
  );
}

function relativeTitle(iso: string, today: string) {
  const d = diffDays(iso, today);
  if (d === -1) return "Ayer";
  if (d === 1) return "Mañana";
  return `${WEEKDAY_SHORT[weekday(iso)]} ${Number(iso.slice(8))}`;
}

function DaySummary({ done, total }: { done: number; total: number }) {
  const pct = total ? done / total : 0;
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <section aria-label="Avance del día" className="rise mb-4 flex items-center gap-4 px-1">
      <svg viewBox="0 0 64 64" className="size-16 shrink-0 -rotate-90" aria-hidden>
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="7" className="stroke-surface-3" />
        <motion.circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          className="stroke-[var(--st-done-line)]"
          strokeDasharray={c}
          initial={false}
          animate={{ strokeDashoffset: c * (1 - pct) }}
          transition={{ type: "spring", stiffness: 120, damping: 22 }}
        />
      </svg>
      <div className="grid">
        <p className="flex items-baseline gap-1.5">
          <span className="num text-[40px] leading-none font-semibold">{done}</span>
          <span className="num text-xl text-muted">/{total}</span>
        </p>
        <p className="mt-1 text-sm text-muted">
          {done === total ? "Todo hecho por hoy" : done === 0 ? "Nada hecho todavía" : `Faltan ${total - done}`}
        </p>
      </div>
    </section>
  );
}

function DateStrip({
  days,
  selected,
  today,
  onSelect,
  progress,
}: {
  days: string[];
  selected: string;
  today: string;
  onSelect: (d: string) => void;
  progress: Record<string, number>;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  useEffect(() => {
    const box = scroller.current;
    const el = box?.querySelector<HTMLElement>(`[data-day="${selected}"]`);
    if (!box || !el) return;
    // Centra el día elegido; la primera vez sin animación para no arrancar en otro lado.
    box.scrollTo({
      left: el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2,
      behavior: mounted.current ? "smooth" : "instant",
    });
    mounted.current = true;
  }, [selected]);

  const R = 15;
  const C = 2 * Math.PI * R;
  return (
    <div
      ref={scroller}
      className="relative flex snap-x gap-1.5 overflow-x-auto px-4 pt-1 pb-5 [scrollbar-width:none] lg:px-8 [&::-webkit-scrollbar]:hidden"
    >
      {days.map((d) => {
        const active = d === selected;
        const isToday = d === today;
        const p = progress[d];
        return (
          <button
            key={d}
            data-day={d}
            type="button"
            onClick={() => onSelect(d)}
            aria-pressed={active}
            aria-label={`${WEEKDAY_SHORT[weekday(d)]} ${Number(d.slice(8))}${isToday ? ", hoy" : ""}`}
            className={cx(
              "relative flex w-[50px] shrink-0 snap-center flex-col items-center gap-1 rounded-[18px] pt-2 pb-2 transition-[background-color,box-shadow,transform] duration-300 ease-spring active:scale-95",
              active ? "btn-glow bg-accent text-on-accent" : "text-muted hover:bg-surface-2",
            )}
          >
            <span
              className={cx(
                "text-[11.5px] font-medium",
                active ? "text-on-accent/80" : isToday ? "text-accent-fg" : "text-muted",
              )}
            >
              {WEEKDAY_SHORT[weekday(d)]}
            </span>
            <span className="relative grid size-9 place-items-center">
              <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90" aria-hidden>
                <circle
                  cx="18"
                  cy="18"
                  r={R}
                  fill="none"
                  strokeWidth="2.5"
                  className={active ? "stroke-[rgba(0,0,0,0.14)]" : "stroke-surface-3"}
                />
                {p !== undefined && p > 0 && (
                  <circle
                    cx="18"
                    cy="18"
                    r={R}
                    fill="none"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeDasharray={C}
                    strokeDashoffset={C * (1 - p)}
                    className={active ? "stroke-on-accent" : "stroke-[var(--st-done-line)]"}
                  />
                )}
              </svg>
              <span className={cx("num relative text-[17px] font-semibold", active ? "text-on-accent" : "text-fg")}>
                {Number(d.slice(8))}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function CheckButton({ state, onTap, disabled }: { state: string; onTap: () => void; disabled?: boolean }) {
  const map: Record<string, { cls: string; icon: React.ReactNode; label: string }> = {
    done: {
      cls: "bg-[var(--st-done-bg)] text-[var(--st-done-fg)] ring-2 ring-inset ring-[var(--st-done-line)] shadow-[0_6px_18px_-6px_var(--st-done-line)]",
      icon: <Check size={22} weight="bold" />,
      label: "Hecho",
    },
    failed: {
      cls: "bg-[var(--st-fail-bg)] text-[var(--st-fail-fg)] ring-2 ring-inset ring-[var(--st-fail-line)]",
      icon: <X size={20} weight="bold" />,
      label: "Fallado",
    },
    skipped: {
      cls: "bg-[var(--st-skip-bg)] text-[var(--st-skip-fg)] ring-2 ring-inset ring-[var(--st-skip-line)]",
      icon: <ArrowBendUpRight size={20} weight="bold" />,
      label: "Salteado",
    },
    partial: {
      cls: "bg-[var(--st-done-bg)] text-[var(--st-done-fg)] ring-2 ring-inset ring-[var(--st-done-line)]/40",
      icon: null,
      label: "A medias",
    },
  };
  const s = map[state] ?? {
    cls: "bg-surface-2 ring-2 ring-inset ring-line-strong shadow-[inset_0_2px_4px_rgba(var(--shadow-tint),0.12)]",
    icon: null,
    label: "Marcar como hecho",
  };
  return (
    <motion.button
      type="button"
      onClick={onTap}
      disabled={disabled}
      aria-label={s.label}
      whileTap={{ scale: 0.82 }}
      className={cx(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-[background-color,box-shadow,color] duration-300 disabled:opacity-40",
        s.cls,
      )}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {s.icon && (
          <motion.span
            key={state}
            initial={{ scale: 0.3, opacity: 0, rotate: -30 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 0.3, opacity: 0 }}
            transition={{ type: "spring", stiffness: 520, damping: 22 }}
            className="inline-flex"
          >
            {s.icon}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

export function Fab({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Nuevo hábito"
      className="btn-glow fixed right-5 bottom-[calc(92px+env(safe-area-inset-bottom))] z-20 inline-flex size-14 items-center justify-center rounded-[20px] bg-accent text-on-accent transition-transform duration-300 ease-spring active:scale-90 lg:hidden"
    >
      <Plus size={26} weight="bold" />
    </button>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="mt-6 grid justify-items-start gap-3 empty-card p-8">
      <h2 className="text-lg font-semibold tracking-tight">Todavía no hay hábitos</h2>
      <p className="max-w-[46ch] text-sm leading-relaxed text-muted">
        Creá el primero. Elegí la frecuencia (todos los días, algunos días o unas veces por semana) y marcalo acá cada día.
      </p>
      <Button variant="accent" onClick={onCreate}>
        <Plus size={16} weight="bold" /> Crear hábito
      </Button>
    </div>
  );
}
