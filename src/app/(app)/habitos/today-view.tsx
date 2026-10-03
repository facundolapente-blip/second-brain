"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
        <DateStrip days={days} selected={selected} today={today} onSelect={setSelected} />

        <div className="px-4 lg:px-8">
          {habits.length === 0 ? (
            <EmptyState onCreate={() => form.current?.create()} />
          ) : visible.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted">No hay hábitos para este día.</p>
          ) : (
            <>
            <DayTally
              states={visible.map((h) => dayState(h, logs[h.id] ?? {}, selected, today))}
            />
            <ul className="divide-y divide-line border-y border-line-strong">
              {visible.map((h, i) => {
                const hLogs = logs[h.id] ?? {};
                const log = hLogs[selected];
                const state = dayState(h, hLogs, selected, today);
                const isCount = h.target > 1 || !!h.unit;
                return (
                  <li key={h.id} className="rise flex items-center gap-3 py-3" style={{ "--i": i } as React.CSSProperties}>
                    <span aria-hidden className="tabular w-5 shrink-0 text-[11px] text-faint">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <button
                      type="button"
                      onClick={() => daySheet.current?.show(h, selected)}
                      disabled={isFuture}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <ToneSquare size={40} style={tone(h.color)}>
                        <HabitIcon name={h.icon} size={22} weight="fill" />
                      </ToneSquare>
                      <span className="grid min-w-0 gap-1">
                        <span className="flex items-baseline gap-2">
                          <span className="truncate text-[16px] font-semibold tracking-tight">{h.name}</span>
                          {isCount && (
                            <span className="tabular shrink-0 text-[13px] text-muted">
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
            </>
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
      className="relative flex snap-x overflow-x-auto border-b border-line-strong [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {days.map((d) => {
        const active = d === selected;
        const isToday = d === today;
        const weekend = weekday(d) === 0 || weekday(d) === 6;
        return (
          <button
            key={d}
            data-day={d}
            type="button"
            onClick={() => onSelect(d)}
            aria-pressed={active}
            aria-label={isToday ? `Hoy, ${d}` : d}
            className={cx(
              "relative flex h-[68px] w-[52px] shrink-0 snap-center flex-col items-center justify-center gap-1 border-r border-line transition-colors duration-150",
              active ? "bg-ink text-on-ink" : "text-fg hover:bg-surface-2",
            )}
          >
            <span
              className={cx(
                "label-mono text-[10px]",
                active ? "text-on-ink/75" : weekend ? "text-accent-fg" : "text-muted",
              )}
            >
              {WEEKDAY_SHORT[weekday(d)]}
            </span>
            <span className={cx("tabular text-[20px] leading-none", active ? "font-bold" : "font-medium")}>
              {Number(d.slice(8))}
            </span>
            {isToday && <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-accent" />}
          </button>
        );
      })}
    </div>
  );
}

/** Tablero del día: cuántos hábitos ya están resueltos y la barra segmentada. */
function DayTally({ states }: { states: string[] }) {
  const done = states.filter((s) => s === "done").length;
  const failed = states.filter((s) => s === "failed").length;
  const skipped = states.filter((s) => s === "skipped").length;
  const order = (s: string) => (s === "done" ? 0 : s === "skipped" ? 1 : s === "failed" ? 2 : 3);
  const sorted = [...states].sort((a, b) => order(a) - order(b));
  return (
    <section aria-label="Resumen del día" className="grid gap-2.5 py-4">
      <div className="flex items-end justify-between gap-4">
        <p className="flex items-baseline gap-2">
          <span className="tabular text-[40px] leading-none font-semibold tracking-tight">
            {String(done).padStart(2, "0")}
          </span>
          <span className="tabular text-[17px] text-muted">/{String(states.length).padStart(2, "0")}</span>
          <span className="label-mono ml-1 text-muted">hechos</span>
        </p>
        <dl className="tabular flex gap-3 text-[12px] text-muted">
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Salteados</dt>
            <span aria-hidden className="size-2 bg-[var(--st-skip-line)]" />
            <dd>{skipped}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Fallados</dt>
            <span aria-hidden className="size-2 bg-[var(--st-fail-line)]" />
            <dd>{failed}</dd>
          </div>
        </dl>
      </div>
      <div className="flex h-2.5 gap-[2px]" aria-hidden>
        {sorted.map((s, i) => (
          <span
            key={i}
            className={cx(
              "flex-1 transition-colors duration-200",
              s === "done"
                ? "bg-[var(--st-done-line)]"
                : s === "skipped"
                  ? "bg-[var(--st-skip-line)]"
                  : s === "failed"
                    ? "bg-[var(--st-fail-line)]"
                    : "bg-surface-3",
            )}
          />
        ))}
      </div>
    </section>
  );
}

function CheckButton({ state, onTap, disabled }: { state: string; onTap: () => void; disabled?: boolean }) {
  const map: Record<string, { cls: string; icon: React.ReactNode; label: string }> = {
    done: {
      cls: "border-[var(--st-done-line)] bg-[var(--st-done-line)] text-[var(--on-st)]",
      icon: <Check size={22} weight="bold" />,
      label: "Hecho",
    },
    failed: {
      cls: "border-[var(--st-fail-line)] bg-[var(--st-fail-bg)] text-[var(--st-fail-fg)]",
      icon: <X size={20} weight="bold" />,
      label: "Fallado",
    },
    skipped: {
      cls: "border-[var(--st-skip-line)] bg-[var(--st-skip-bg)] text-[var(--st-skip-fg)]",
      icon: <ArrowBendUpRight size={20} weight="bold" />,
      label: "Salteado",
    },
    partial: {
      cls: "border-dashed border-[var(--st-done-line)] bg-[var(--st-done-bg)] text-[var(--st-done-fg)]",
      icon: null,
      label: "A medias",
    },
  };
  const s = map[state] ?? { cls: "border-rule bg-surface hover:bg-surface-2", icon: null, label: "Marcar como hecho" };
  return (
    <button
      type="button"
      onClick={onTap}
      disabled={disabled}
      aria-label={s.label}
      className={cx(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-[2px] border-[1.5px] transition-[transform,background-color,border-color] duration-150 active:scale-90 disabled:opacity-40 motion-reduce:active:scale-100",
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
      className="lift fixed right-4 bottom-[calc(76px+env(safe-area-inset-bottom))] z-20 inline-flex size-14 items-center justify-center border border-rule bg-accent text-on-accent transition-[transform,box-shadow] duration-150 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none lg:hidden"
    >
      <Plus size={26} weight="bold" />
    </button>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="mt-6 grid justify-items-start gap-3 border border-dashed border-line-strong p-8">
      <span className="label-mono text-muted">Sin datos</span>
      <h2 className="display text-[26px] uppercase">Todavía no hay hábitos</h2>
      <p className="max-w-[46ch] text-sm leading-relaxed text-muted">
        Creá el primero. Elegí la frecuencia (todos los días, algunos días o unas veces por semana) y marcalo acá cada día.
      </p>
      <Button variant="accent" onClick={onCreate}>
        <Plus size={16} weight="bold" /> Crear hábito
      </Button>
    </div>
  );
}
