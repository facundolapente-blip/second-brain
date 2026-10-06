"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowBendUpRight, Check, Plus, X } from "@phosphor-icons/react";
import { addDays, diffDays, formatLong, weekday } from "@/lib/dates";
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
        kicker={formatLong(selected)}
        tabs={<HabitsTabs />}
        actions={
          <Button variant="accent" size="sm" className="max-lg:hidden" onClick={() => form.current?.create()}>
            <Plus size={16} weight="bold" /> Nuevo hábito
          </Button>
        }
      />

      <main className="mx-auto max-w-3xl">
        <DateStrip days={days} selected={selected} today={today} onSelect={setSelected} />

        <div className="px-4 lg:px-8">
          {habits.length === 0 ? (
            <EmptyState onCreate={() => form.current?.create()} />
          ) : visible.length === 0 ? (
            <p className="display py-20 text-center text-[22px] text-muted">No hay hábitos para este día.</p>
          ) : (
            <ul className="divide-y divide-line border-b border-line">
              {visible.map((h, i) => {
                const hLogs = logs[h.id] ?? {};
                const log = hLogs[selected];
                const state = dayState(h, hLogs, selected, today);
                const isCount = h.target > 1 || !!h.unit;
                return (
                  <li key={h.id} className="rise flex items-center gap-4 py-4" style={{ "--i": i } as React.CSSProperties}>
                    <button
                      type="button"
                      onClick={() => daySheet.current?.show(h, selected)}
                      disabled={isFuture}
                      className="flex min-w-0 flex-1 items-center gap-4 text-left"
                    >
                      <ToneSquare size={42} style={tone(h.color)}>
                        <HabitIcon name={h.icon} size={22} weight="fill" />
                      </ToneSquare>
                      <span className="grid min-w-0 gap-1">
                        <span className="flex items-baseline gap-2">
                          <span className="truncate text-[16.5px] font-medium tracking-[-0.01em]">{h.name}</span>
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

function DateStrip({
  days,
  selected,
  today,
  onSelect,
}: {
  days: string[];
  selected: string;
  today: string;
  onSelect: (d: string) => void;
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
      className="relative flex snap-x gap-1 overflow-x-auto border-b border-line px-3 pt-1 pb-3 [scrollbar-width:none] lg:px-8 lg:pt-4 [&::-webkit-scrollbar]:hidden"
    >
      {days.map((d) => {
        const active = d === selected;
        const isToday = d === today;
        return (
          <button
            key={d}
            data-day={d}
            type="button"
            onClick={() => onSelect(d)}
            className={cx(
              "relative flex h-[68px] w-[50px] shrink-0 snap-center flex-col items-center justify-center gap-1 rounded-[6px] transition-colors duration-200",
              active ? "bg-ink text-on-ink" : "text-fg hover:bg-surface-2",
            )}
            aria-pressed={active}
          >
            <span
              className={cx(
                "font-mono text-[10.5px] font-medium tracking-[0.08em] uppercase",
                active ? "text-on-ink/75" : "text-muted",
              )}
            >
              {WEEKDAY_SHORT[weekday(d)]}
            </span>
            <span className="figure text-[23px]">{Number(d.slice(8))}</span>
            {isToday && (
              <span
                aria-hidden
                className={cx("absolute bottom-1.5 size-1 rounded-full", active ? "bg-on-ink/80" : "bg-accent")}
              />
            )}
          </button>
        );
      })}
    </div>
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
        "inline-flex size-11 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-[transform,background-color,border-color] duration-200 active:scale-90 disabled:opacity-40 motion-reduce:transition-none motion-reduce:active:scale-100",
        s.cls,
      )}
    >
      {s.icon}
    </button>
  );
}

export function Fab({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Nuevo hábito"
      className="lift fixed right-4 bottom-[calc(84px+env(safe-area-inset-bottom))] z-20 inline-flex size-14 items-center justify-center rounded-full bg-ink text-on-ink transition-transform active:scale-95 lg:hidden"
    >
      <Plus size={24} />
    </button>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="mt-8 grid justify-items-start gap-3 border-y border-line py-10">
      <p className="kicker">Hábitos</p>
      <h2 className="display text-[30px]">Todavía no hay hábitos</h2>
      <p className="max-w-[46ch] text-sm leading-relaxed text-muted">
        Creá el primero. Elegí la frecuencia (todos los días, algunos días o unas veces por semana) y marcalo acá cada día.
      </p>
      <Button variant="accent" onClick={onCreate}>
        <Plus size={16} weight="bold" /> Crear hábito
      </Button>
    </div>
  );
}
