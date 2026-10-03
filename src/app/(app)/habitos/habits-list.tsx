"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import {
  Archive,
  ArrowCounterClockwise,
  CalendarBlank,
  ChartBar,

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
                className="label-mono inline-flex h-11 items-center rounded-md px-2 text-accent-fg hover:bg-surface-2"
              >
                Volver
              </Link>
            ) : (
              <Link
                href="/habitos/archivados"
                aria-label="Archivados"
                title="Archivados"
                className="inline-flex size-11 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"
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

      <main className="mx-auto grid max-w-3xl gap-3 px-3 pt-3 sm:px-4 lg:px-8 lg:pt-6">
        {(searching || activeCategory) && (
          <div className="flex flex-wrap items-center gap-2">
            {searching && (
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar hábito"
                aria-label="Buscar hábito"
                className="h-11 min-w-0 flex-1 rounded-md border border-rule bg-surface px-3 text-[15px] outline-none focus:ring-2 focus:ring-[var(--focus)]"
              />
            )}
            {activeCategory && (
              <button
                type="button"
                onClick={() => setCategory(null)}
                style={tone(activeCategory.color)}
                className="inline-flex h-10 items-center gap-1.5 rounded-md border border-tone-solid bg-tone px-3 text-[13px] font-medium text-tone-fg"
              >
                {activeCategory.name}
                <X size={13} weight="bold" />
              </button>
            )}
          </div>
        )}

        {habits.length === 0 ? (
          <div className="mt-4 border border-dashed border-line-strong p-8 text-sm text-muted">
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
          <p className="py-12 text-center text-sm text-muted">Ningún hábito coincide.</p>
        ) : (
          <>
          <p className="label-mono flex items-center gap-2 text-muted">
            <span className="tabular text-fg">{String(visible.length).padStart(2, "0")}</span>
            {visible.length === 1 ? "hábito" : "hábitos"}
            <span aria-hidden className="h-px flex-1 bg-line-strong" />
          </p>
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
          </>
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
      className="rise border border-line-strong bg-surface"
    >
      <div className="flex items-center gap-3 px-3.5 pt-3 pb-2.5">
        <ToneSquare size={36} style={tone(habit.color)}>
          <HabitIcon name={habit.icon} size={20} weight="fill" />
        </ToneSquare>
        <div className="grid min-w-0 flex-1 gap-1">
          <h2 className="truncate text-[17px] leading-tight font-bold tracking-tight">{habit.name}</h2>
          <span>
            <HabitBadge habit={habit} />
          </span>
        </div>
      </div>

      <div className="grid grid-cols-7 justify-items-center gap-1 px-2.5 pb-3">
        {days.map((d) => (
          <div key={d} className="grid justify-items-center gap-1">
            <span className={cx("label-mono text-[10px]", d === today ? "font-bold text-fg" : "text-muted")}>
              {WEEKDAY_SHORT[weekday(d)]}
            </span>
            <DayCircle date={d} state={dayState(habit, logs, d, today)} onTap={() => tap(d)} />
          </div>
        ))}
      </div>

      <div className="flex items-stretch border-t border-line" style={tone(habit.color)}>
        <Readout label="Racha" title="Racha actual">
          <LinkSimple size={14} weight="bold" className="text-tone-solid" aria-hidden />
          {streak}
        </Readout>
        <Readout label="Puntaje" title="Puntaje del hábito">
          <span className="relative inline-block h-2 w-10 border border-line-strong" aria-hidden>
            <span className="absolute inset-y-0 left-0 bg-tone-solid" style={{ width: `${score}%` }} />
          </span>
          {score}%
        </Readout>
        <div className="ml-auto flex items-center pr-1">
          <Link
            href={`/habitos/${habit.id}?tab=calendario`}
            aria-label="Calendario"
            title="Calendario"
            className="inline-flex size-11 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <CalendarBlank size={20} />
          </Link>
          <Link
            href={`/habitos/${habit.id}?tab=estadisticas`}
            aria-label="Estadísticas"
            title="Estadísticas"
            className="inline-flex size-11 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-fg"
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

/** Lectura de un instrumento: etiqueta mono chica arriba, valor grande abajo. */
function Readout({ label, title, children }: { label: string; title: string; children: React.ReactNode }) {
  return (
    <div title={title} className="grid content-center gap-0.5 border-r border-line px-3.5 py-1.5">
      <span className="label-mono text-[10px] text-muted">{label}</span>
      <span className="tabular inline-flex items-center gap-1.5 text-[17px] leading-none font-semibold text-fg">
        {children}
      </span>
    </div>
  );
}
