"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import {
  Archive,
  ArrowCounterClockwise,
  CalendarBlank,
  ChartBar,
  CheckCircle,
  DotsThreeVertical,
  Funnel,
  LinkSimple,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  Trash,
  X,
} from "@phosphor-icons/react";
import { archiveHabit, deleteHabit } from "@/lib/habit-actions";
import { addDays, weekday } from "@/lib/dates";
import { currentStreak, dayState, habitScore, WEEKDAY_SHORT, type LogMap, type PackedLogMap } from "@/lib/habit-logic";
import { HabitIcon } from "@/lib/habit-icons";
import { tone } from "@/lib/palette";
import type { CategoryDTO, HabitDTO } from "@/lib/habits";
import { PageHeader } from "@/components/page-header";
import { Button, cx, IconButton, ToneSquare } from "@/components/ui";
import { Menu } from "@/components/menu";
import { DayCircle, DaySheet, HabitBadge, useDayTap, useHabitLogs, type DaySheetHandle, type MarkFn } from "./habit-ui";
import { HabitForm, type HabitFormHandle } from "./habit-form";
import { HabitsTabs } from "./habits-nav";
import { Fab } from "./today-view";

export function HabitsList({
  habits,
  logs: initialLogs,
  categories,
  today,
  archived = false,
}: {
  habits: HabitDTO[];
  logs: PackedLogMap;
  categories: CategoryDTO[];
  today: string;
  archived?: boolean;
}) {
  const { logs, mark } = useHabitLogs(initialLogs);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const form = useRef<HabitFormHandle>(null);
  const daySheet = useRef<DaySheetHandle>(null);

  const q = query.trim().toLowerCase();
  // Mismo orden que HabitNow: prioridad y después nombre.
  const visible = habits
    .filter((h) => (!q || h.name.toLowerCase().includes(q)) && (!category || h.categoryId === category))
    .sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name, "es"));
  const activeCategory = categories.find((c) => c.id === category);

  return (
    <>
      <PageHeader
        title={archived ? "Archivados" : "Hábitos"}
        wide
        tabs={<HabitsTabs />}
        actions={
          <>
            <IconButton label="Buscar" onClick={() => setSearching((s) => !s)}>
              <MagnifyingGlass size={21} />
            </IconButton>
            <Menu
              trigger={(toggle) => (
                <IconButton label="Filtrar por categoría" onClick={toggle} className={cx(category && "text-accent")}>
                  <Funnel size={21} weight={category ? "fill" : "regular"} />
                </IconButton>
              )}
              items={[
                { label: "Todas las categorías", onSelect: () => setCategory(null) },
                ...categories.map((c) => ({
                  label: c.name,
                  icon: (
                    <ToneSquare size={20} style={tone(c.color)}>
                      <HabitIcon name={c.icon} size={12} weight="fill" />
                    </ToneSquare>
                  ),
                  onSelect: () => setCategory(c.id),
                })),
              ]}
            />
            {archived ? (
              <Link
                href="/habitos/lista"
                className="inline-flex h-11 items-center rounded-[4px] px-2 text-sm font-medium text-accent-fg hover:bg-surface-2"
              >
                Volver
              </Link>
            ) : (
              <Link
                href="/habitos/archivados"
                aria-label="Archivados"
                title="Archivados"
                className="inline-flex size-11 items-center justify-center rounded-[4px] text-muted hover:bg-surface-2 hover:text-fg"
              >
                <Archive size={21} />
              </Link>
            )}
            {!archived && (
              <Button
                variant="accent"
                size="sm"
                className="ml-2 max-lg:hidden"
                onClick={() => form.current?.create()}
              >
                <Plus size={16} weight="bold" /> Nuevo hábito
              </Button>
            )}
          </>
        }
      />

      <main className="mx-auto grid max-w-3xl px-4 pt-3 lg:max-w-6xl lg:px-10 lg:pt-6">
        {(searching || activeCategory) && (
          <div className="flex flex-wrap items-center gap-2 pb-3">
            {searching && (
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar hábito"
                aria-label="Buscar hábito"
                className="h-11 min-w-0 flex-1 rounded-[4px] border border-line-strong bg-surface px-3 text-[15px] outline-none placeholder:text-faint focus:ring-2 focus:ring-[var(--focus)]"
              />
            )}
            {activeCategory && (
              <button
                type="button"
                onClick={() => setCategory(null)}
                style={tone(activeCategory.color)}
                className="inline-flex h-9 items-center gap-1.5 rounded-[4px] bg-tone px-2.5 text-[13px] font-medium text-tone-fg"
              >
                {activeCategory.name}
                <X size={13} weight="bold" />
              </button>
            )}
          </div>
        )}

        {habits.length === 0 ? (
          <div className="mt-6 border-y border-line py-10 text-[15px] text-muted">
            {archived ? (
              "No hay hábitos archivados."
            ) : (
              <div className="grid justify-items-start gap-3">
                <p>Todavía no creaste ningún hábito.</p>
                <Button variant="accent" onClick={() => form.current?.create()}>
                  <Plus size={16} weight="bold" /> Crear hábito
                </Button>
              </div>
            )}
          </div>
        ) : visible.length === 0 ? (
          <p className="display py-16 text-center text-[22px] text-muted">Ningún hábito coincide.</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2 lg:gap-4">
          {visible.map((h, i) => (
            <HabitCard
              key={h.id}
              index={i}
              habit={h}
              logs={logs[h.id] ?? {}}
              today={today}
              mark={mark}
              onDetail={(habit, date) => daySheet.current?.show(habit, date)}
              onEdit={() => form.current?.edit(h)}
            />
          ))}
          </div>
        )}
      </main>

      {!archived && <Fab onClick={() => form.current?.create()} />}
      <HabitForm ref={form} categories={categories} today={today} />
      <DaySheet ref={daySheet} logs={logs} mark={mark} />
    </>
  );
}

function HabitCard({
  habit,
  logs,
  today,
  mark,
  onDetail,
  onEdit,
  index,
}: {
  habit: HabitDTO;
  logs: LogMap;
  today: string;
  mark: MarkFn;
  onDetail: (h: HabitDTO, d: string) => void;
  onEdit: () => void;
  index: number;
}) {
  const [, startTransition] = useTransition();
  const tap = useDayTap(habit, logs, mark, onDetail);
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const streak = currentStreak(habit, logs, today);
  const score = habitScore(habit, logs, today);

  return (
    <article
      style={{ "--i": Math.min(index, 8) } as React.CSSProperties}
      className="rise rounded-2xl border border-line bg-surface px-4 pt-4 pb-1.5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <h2 className="display truncate text-[22px]">{habit.name}</h2>
          <span>
            <HabitBadge habit={habit} />
          </span>
        </div>
        <ToneSquare size={38} style={tone(habit.color)}>
          <HabitIcon name={habit.icon} size={20} weight="fill" />
        </ToneSquare>
      </div>

      <div className="mt-4 grid grid-cols-7 justify-items-center gap-1">
        {days.map((d) => (
          <div key={d} className="grid justify-items-center gap-1.5">
            <span className={cx("font-mono text-[10.5px] tracking-[0.08em] uppercase", d === today ? "font-semibold text-fg" : "text-muted")}>
              {WEEKDAY_SHORT[weekday(d)]}
            </span>
            <DayCircle date={d} state={dayState(habit, logs, d, today)} onTap={() => tap(d)} />
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-5 text-[13px]" style={tone(habit.color)}>
        <span className="inline-flex items-baseline gap-1.5 text-muted" title="Racha actual">
          <LinkSimple size={14} weight="bold" className="self-center text-tone-fg" aria-hidden />
          <span className="figure text-[19px] text-fg">{streak}</span>
          <span className="sr-only">de racha</span>
        </span>
        <span className="inline-flex items-baseline gap-1.5 text-muted" title="Puntaje del hábito">
          <CheckCircle size={14} weight="bold" className="self-center text-tone-fg" aria-hidden />
          <span className="figure text-[19px] text-fg">{score}%</span>
          <span className="sr-only">de puntaje</span>
        </span>
        <div className="ml-auto flex items-center">
          <Link
            href={`/habitos/${habit.id}?tab=calendario`}
            aria-label="Calendario"
            title="Calendario"
            className="inline-flex size-11 items-center justify-center rounded-[4px] text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <CalendarBlank size={20} />
          </Link>
          <Link
            href={`/habitos/${habit.id}?tab=estadisticas`}
            aria-label="Estadísticas"
            title="Estadísticas"
            className="inline-flex size-11 items-center justify-center rounded-[4px] text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <ChartBar size={20} />
          </Link>
          <Menu
            trigger={(toggle) => (
              <IconButton label="Más opciones" onClick={toggle}>
                <DotsThreeVertical size={20} weight="bold" />
              </IconButton>
            )}
            items={[
              { label: "Editar", icon: <PencilSimple size={16} />, onSelect: onEdit },
              habit.archived
                ? {
                    label: "Restaurar",
                    icon: <ArrowCounterClockwise size={16} />,
                    onSelect: () => startTransition(() => archiveHabit(habit.id, false)),
                  }
                : {
                    label: "Archivar",
                    icon: <Archive size={16} />,
                    onSelect: () => startTransition(() => archiveHabit(habit.id, true)),
                  },
              {
                label: "Eliminar",
                icon: <Trash size={16} />,
                danger: true,
                onSelect: () => {
                  if (confirm(`¿Eliminar "${habit.name}" y todo su historial? No se puede deshacer.`)) {
                    startTransition(() => deleteHabit(habit.id));
                  }
                },
              },
            ]}
          />
        </div>
      </div>
    </article>
  );
}
