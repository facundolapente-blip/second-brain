"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "@phosphor-icons/react";
import { addDays, diffDays, formatLong, weekday } from "@/lib/dates";
import { WEEKDAY_SHORT, type PackedLogMap, showsOn } from "@/lib/habit-logic";
import type { CategoryDTO, HabitDTO } from "@/lib/habits";
import { PageHeader } from "@/components/page-header";
import { Button, cx } from "@/components/ui";
import { DaySheet, useHabitLogs, useHabitOrder, type DaySheetHandle } from "./habit-ui";
import { HabitDayRows } from "./day-rows";
import { HabitForm, type HabitFormHandle } from "./habit-form";
import { HabitsTabs } from "./habits-nav";
import { TodayPanel } from "./today-panel";

const PAST = 30;
const FUTURE = 7;

export function TodayView({
  habits,
  logs: initialLogs,
  categories,
  today,
  manualOrder = false,
}: {
  habits: HabitDTO[];
  logs: PackedLogMap;
  categories: CategoryDTO[];
  today: string;
  /** Si se ordenó arrastrando alguna vez, Hoy y la Lista usan ese orden. */
  manualOrder?: boolean;
}) {
  const { logs, mark } = useHabitLogs(initialLogs);
  const [selected, setSelected] = useState(today);
  const form = useRef<HabitFormHandle>(null);
  const daySheet = useRef<DaySheetHandle>(null);

  const days = useMemo(
    () => Array.from({ length: PAST + FUTURE + 1 }, (_, i) => addDays(today, i - PAST)),
    [today],
  );

  // Orden fijo (el arrastrado, o prioridad y nombre): al tildar, la fila no cambia de lugar.
  const { sorted, reorder } = useHabitOrder(habits, manualOrder);
  const visible = sorted.filter((h) => showsOn(h, logs[h.id] ?? {}, selected));


  return (
    <>
      <PageHeader
        title={selected === today ? "Hoy" : relativeTitle(selected, today)}
        kicker={formatLong(selected)}
        wide
        tabs={<HabitsTabs />}
        actions={
          <Button variant="accent" size="sm" className="max-lg:hidden" onClick={() => form.current?.create()}>
            <Plus size={16} weight="bold" /> Nuevo hábito
          </Button>
        }
      />

      <main className="mx-auto max-w-3xl lg:grid lg:max-w-6xl lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-8 lg:px-10 lg:pt-6">
        <section className="min-w-0 lg:overflow-hidden lg:rounded-2xl lg:border lg:border-[var(--card-ring)] lg:bg-surface lg:shadow-[var(--card-shadow)]">
        <DateStrip days={days} selected={selected} today={today} onSelect={setSelected} />

        <div className="px-4 lg:px-6">
          {habits.length === 0 ? (
            <EmptyState onCreate={() => form.current?.create()} />
          ) : visible.length === 0 ? (
            <p className="display py-20 text-center text-[22px] text-muted">No hay hábitos para este día.</p>
          ) : (
            <HabitDayRows
              habits={visible}
              logs={logs}
              day={selected}
              today={today}
              mark={mark}
              onOpen={(h) => daySheet.current?.show(h, selected)}
              onReorder={reorder}
              className="border-b border-line lg:border-b-0"
              rowClassName="bg-bg py-1.5 lg:bg-surface lg:py-4"
            />
          )}
        </div>
        </section>

        {habits.length > 0 && (
          <div className="hidden lg:block">
            <TodayPanel habits={habits} logs={logs} selected={selected} today={today} />
          </div>
        )}
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
      className="relative flex snap-x gap-1 overflow-x-auto border-b border-line px-3 pt-1 pb-3 [scrollbar-width:none] lg:px-5 lg:pt-4 [&::-webkit-scrollbar]:hidden"
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
