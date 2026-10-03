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
import { currentStreak, dayState, habitScore, WEEKDAY_SHORT, type LogMap } from "@/lib/habit-logic";
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
  logs: Record<string, LogMap>;
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
                className="inline-flex h-9 items-center rounded-full bg-accent-soft px-4 text-sm font-bold text-accent-fg"
              >
                Volver
              </Link>
            ) : (
              <Link
                href="/habitos/archivados"
                aria-label="Archivados"
                title="Archivados"
                className="relative inline-flex size-9 items-center justify-center rounded-full text-muted transition-colors before:absolute before:-inset-1 before:content-[''] hover:bg-surface-2 hover:text-fg"
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

      <main className="mx-auto grid max-w-3xl gap-3 px-3 pt-2 sm:px-4 lg:px-8 lg:pt-5">
        {(searching || activeCategory) && (
          <div className="flex flex-wrap items-center gap-2">
            {searching && (
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar hábito"
                aria-label="Buscar hábito"
                className="field h-11 min-w-0 flex-1 rounded-full border px-4 text-[15px] outline-none focus:ring-4 focus:ring-[var(--focus)]"
              />
            )}
            {activeCategory && (
              <button
                type="button"
                onClick={() => setCategory(null)}
                style={tone(activeCategory.color)}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-tone px-3.5 text-[13px] font-bold text-tone-fg"
              >
                {activeCategory.name}
                <X size={13} weight="bold" />
              </button>
            )}
          </div>
        )}

        {habits.length === 0 ? (
          <div className="mt-4 rounded-card card p-8 text-sm text-muted">
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
          <p className="py-12 text-center text-[15px] font-semibold text-muted">Ningún hábito coincide.</p>
        ) : (
          visible.map((h, i) => (
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
          ))
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
      className="rise rounded-card card px-4 pt-4 pb-2.5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1.5">
          <h2 className="truncate text-[17px] font-extrabold tracking-[-0.01em]">{habit.name}</h2>
          <span>
            <HabitBadge habit={habit} />
          </span>
        </div>
        <ToneSquare size={42} style={tone(habit.color)}>
          <HabitIcon name={habit.icon} size={23} weight="fill" />
        </ToneSquare>
      </div>

      <div className="mt-3 grid grid-cols-7 justify-items-center gap-1">
        {days.map((d) => (
          <div key={d} className="grid justify-items-center gap-1.5">
            <span className={cx("text-[12px] font-bold", d === today ? "text-accent-fg" : "text-muted")}>
              {WEEKDAY_SHORT[weekday(d)]}
            </span>
            <DayCircle date={d} state={dayState(habit, logs, d, today)} onTap={() => tap(d)} />
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-[13px] font-extrabold" style={tone(habit.color)}>
        <span className="tabular inline-flex h-7 items-center gap-1 rounded-full bg-tone px-2.5 text-tone-fg" title="Racha actual">
          <LinkSimple size={15} weight="bold" />
          {streak}
        </span>
        <span className="tabular inline-flex h-7 items-center gap-1 rounded-full bg-tone px-2.5 text-tone-fg" title="Puntaje del hábito">
          <CheckCircle size={15} weight="bold" />
          {score}%
        </span>
        <div className="ml-auto flex items-center">
          <Link
            href={`/habitos/${habit.id}?tab=calendario`}
            aria-label="Calendario"
            title="Calendario"
            className="relative inline-flex size-9 items-center justify-center rounded-full text-muted transition-colors before:absolute before:-inset-1 before:content-[''] hover:bg-surface-2 hover:text-fg"
          >
            <CalendarBlank size={20} />
          </Link>
          <Link
            href={`/habitos/${habit.id}?tab=estadisticas`}
            aria-label="Estadísticas"
            title="Estadísticas"
            className="relative inline-flex size-9 items-center justify-center rounded-full text-muted transition-colors before:absolute before:-inset-1 before:content-[''] hover:bg-surface-2 hover:text-fg"
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
