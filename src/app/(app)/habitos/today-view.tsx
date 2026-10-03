"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { Burst, useHasChanged, useJustDone } from "@/components/celebrate";
import { ArrowBendUpRight, Check, Plus, X } from "@phosphor-icons/react";
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
        <DateStrip
          days={days}
          selected={selected}
          today={today}
          onSelect={setSelected}
          progress={(d) => dayProgress(habits, logs, d, today)}
        />
        {visible.length > 0 && <DaySummary habits={visible} logs={logs} day={selected} today={today} />}

        <div className="px-4 lg:px-8">
          {habits.length === 0 ? (
            <EmptyState onCreate={() => form.current?.create()} />
          ) : visible.length === 0 ? (
            <p className="card rounded-card py-14 text-center text-[15px] font-semibold text-muted">No hay hábitos para este día.</p>
          ) : (
            <ul className="card divide-y divide-line overflow-hidden rounded-card">
              {visible.map((h, i) => {
                const hLogs = logs[h.id] ?? {};
                const log = hLogs[selected];
                const state = dayState(h, hLogs, selected, today);
                const isCount = h.target > 1 || !!h.unit;
                return (
                  <li key={h.id} className="rise flex items-center gap-3 py-3 pr-3 pl-3.5" style={{ "--i": i } as React.CSSProperties}>
                    <button
                      type="button"
                      onClick={() => daySheet.current?.show(h, selected)}
                      disabled={isFuture}
                      className="flex min-w-0 flex-1 items-center gap-3.5 rounded-[14px] text-left transition-transform active:scale-[0.98]"
                    >
                      <ToneSquare size={44} style={tone(h.color)}>
                        <HabitIcon name={h.icon} size={24} weight="fill" />
                      </ToneSquare>
                      <span className="grid min-w-0 gap-1">
                        <span className="flex items-baseline gap-2">
                          <span className="truncate text-[17px] font-bold tracking-[-0.01em]">{h.name}</span>
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

/** Parte de los hábitos programados que quedaron hechos ese día (para el anillo de la tira). */
function dayProgress(habits: HabitDTO[], logs: Record<string, LogMap>, d: string, today: string) {
  if (d > today) return null;
  let total = 0;
  let done = 0;
  for (const h of habits) {
    if (!isScheduled(h, d)) continue;
    const st = dayState(h, logs[h.id] ?? {}, d, today);
    if (st === "before") continue;
    total++;
    if (st === "done") done++;
  }
  return total ? done / total : null;
}

/** Resumen del día elegido: anillo grande de avance y cuántos van, estilo Fitness. */
function DaySummary({
  habits,
  logs,
  day,
  today,
}: {
  habits: HabitDTO[];
  logs: Record<string, LogMap>;
  day: string;
  today: string;
}) {
  let done = 0;
  for (const h of habits) if (dayState(h, logs[h.id] ?? {}, day, today) === "done") done++;
  const total = habits.length;
  const msg =
    day > today ? "Todavía no llegó este día" : done === total ? "Todo hecho. Bien ahí." : done === 0 ? "Arrancá con uno" : "Seguí así";
  return (
    <div className="mb-4 flex items-center gap-3.5 px-4 lg:px-8">
      <Ring value={total ? done / total : 0} size={48} stroke={7} />
      <div className="grid leading-tight">
        <span className="tabular text-[22px] font-black tracking-tight">
          {done} <span className="text-muted">de {total}</span>
        </span>
        <span className="text-sm font-semibold text-muted">{msg}</span>
      </div>
    </div>
  );
}

/** Anillo de avance con el acento del módulo. */
function Ring({ value, size, stroke }: { value: number; size: number; stroke: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        initial={false}
        animate={{ strokeDashoffset: c * (1 - Math.min(1, value)) }}
        transition={{ type: "spring", stiffness: 120, damping: 20 }}
      />
    </svg>
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
  progress: (d: string) => number | null;
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

  return (
    <div
      ref={scroller}
      className="relative flex snap-x gap-1 overflow-x-auto px-4 pt-1 pb-4 [scrollbar-width:none] lg:px-8 [&::-webkit-scrollbar]:hidden"
    >
      {days.map((d) => {
        const active = d === selected;
        const isToday = d === today;
        const p = progress(d);
        return (
          <button
            key={d}
            data-day={d}
            type="button"
            onClick={() => onSelect(d)}
            aria-pressed={active}
            aria-label={`${WEEKDAY_SHORT[weekday(d)]} ${Number(d.slice(8))}${isToday ? ", hoy" : ""}`}
            className={cx(
              "relative flex w-[50px] shrink-0 snap-center flex-col items-center gap-1 rounded-full pt-2 pb-1.5 transition-[background-color,transform] duration-200 active:scale-95",
              active ? "bg-accent text-on-accent" : "hover:bg-surface",
            )}
          >
            <span className={cx("text-[11px] font-bold", active ? "text-on-accent" : isToday ? "text-accent-fg" : "text-muted")}>
              {isToday && !active ? "Hoy" : WEEKDAY_SHORT[weekday(d)]}
            </span>
            <span className="relative grid size-[38px] place-items-center">
              {p !== null && <MiniRing value={p} onAccent={active} />}
              <span className={cx("tabular relative text-[16px] font-extrabold", !active && (p === null ? "text-faint" : "text-fg"))}>
                {Number(d.slice(8))}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function MiniRing({ value, onAccent }: { value: number; onAccent: boolean }) {
  const size = 38;
  const stroke = 3.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90" aria-hidden>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        stroke={onAccent ? "color-mix(in srgb, var(--on-accent) 30%, transparent)" : "var(--surface-3)"}
      />
      {value > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - value)}
          stroke={onAccent ? "var(--on-accent)" : "var(--accent)"}
          className="transition-[stroke-dashoffset] duration-500"
        />
      )}
    </svg>
  );
}

function CheckButton({ state, onTap, disabled }: { state: string; onTap: () => void; disabled?: boolean }) {
  const map: Record<string, { cls: string; icon: React.ReactNode; label: string }> = {
    done: {
      cls: "bg-[var(--st-done-solid)] text-[var(--st-done-on)]",
      icon: <Check size={24} weight="bold" />,
      label: "Hecho",
    },
    failed: {
      cls: "bg-[var(--st-fail-solid)] text-[var(--st-fail-on)]",
      icon: <X size={22} weight="bold" />,
      label: "Fallado",
    },
    skipped: {
      cls: "bg-[var(--st-skip-solid)] text-[var(--st-skip-on)]",
      icon: <ArrowBendUpRight size={22} weight="bold" />,
      label: "Salteado",
    },
    partial: {
      cls: "bg-[var(--st-done-bg)] text-[var(--st-done-fg)] outline-[2.5px] outline-dashed -outline-offset-[2.5px] outline-[var(--st-done-line)]",
      icon: <Check size={20} weight="bold" className="opacity-60" />,
      label: "A medias",
    },
  };
  const s = map[state] ?? {
    cls: "bg-transparent text-transparent ring-[2.5px] ring-inset ring-line-strong hover:text-faint",
    icon: <Check size={22} weight="bold" />,
    label: "Marcar como hecho",
  };
  const changed = useHasChanged(state);
  const settled = (state === "done" || state === "failed" || state === "skipped") && changed;
  const shot = useJustDone(state === "done");
  return (
    <span className="relative shrink-0">
      <Burst shot={shot} />
      <motion.button
        type="button"
        onClick={onTap}
        disabled={disabled}
        aria-label={s.label}
        whileTap={{ scale: 0.85 }}
        className={cx(
          "relative inline-flex size-12 items-center justify-center rounded-full transition-[background-color,color,box-shadow] duration-200 disabled:opacity-40",
          s.cls,
        )}
      >
        <motion.span
          key={state}
          initial={settled ? { scale: 0.3, rotate: -25 } : false}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 600, damping: 16 }}
          className="inline-flex"
        >
          {s.icon}
        </motion.span>
      </motion.button>
    </span>
  );
}

export function Fab({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Nuevo hábito"
      className="lift-accent fixed right-4 bottom-[calc(96px+env(safe-area-inset-bottom))] z-20 inline-flex size-15 items-center justify-center rounded-full bg-accent text-on-accent hover:scale-105 transition-transform active:scale-95 lg:hidden"
    >
      <Plus size={26} weight="bold" />
    </button>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="mt-6 grid justify-items-start gap-3 rounded-card card p-8">
      <h2 className="text-lg font-extrabold tracking-tight">Todavía no hay hábitos</h2>
      <p className="max-w-[46ch] text-sm leading-relaxed text-muted">
        Creá el primero. Elegí la frecuencia (todos los días, algunos días o unas veces por semana) y marcalo acá cada día.
      </p>
      <Button variant="accent" onClick={onCreate}>
        <Plus size={16} weight="bold" /> Crear hábito
      </Button>
    </div>
  );
}
