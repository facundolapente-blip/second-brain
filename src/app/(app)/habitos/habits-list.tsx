"use client";

import { useSafeTransition } from "@/components/safe-action";
import { notifyDeleted } from "@/components/undo-toast";
import { useOnNew } from "@/components/nav-add";
import Link from "next/link";
import { useRef, useState } from "react";
import {
  Leaf,
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
import { archiveHabit, deleteHabit } from "@/lib/offline/habit";
import { addDays, weekday } from "@/lib/dates";
import { cleanDays, currentStreak, dayState, habitScore, WEEKDAY_SHORT, type LogMap, type PackedLogMap } from "@/lib/habit-logic";
import { HabitAvatar } from "@/lib/habit-icons";
import { tone } from "@/lib/palette";
import type { CategoryDTO, HabitDTO } from "@/lib/habits";
import { PageHeader } from "@/components/page-header";
import { Button, cx, IconButton } from "@/components/ui";
import { Menu } from "@/components/menu";
import { DayCircle, DaySheet, HabitBadge, useDayTap, useHabitLogs, useHabitOrder, type DaySheetHandle, type MarkFn } from "./habit-ui";
import { Sortable, SortableItem } from "@/components/sortable";
import { HabitForm, hasMarks, type HabitFormHandle } from "./habit-form";
import { HabitsTabs } from "./habits-nav";
import { WeekCount } from "./day-rows";

export function HabitsList({
  habits,
  logs: initialLogs,
  categories,
  today,
  archived = false,
  manualOrder = false,
}: {
  /** Si se ordenó arrastrando alguna vez, la lista respeta ese orden. */
  manualOrder?: boolean;
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
  const searchRef = useRef<HTMLInputElement>(null);
  /** Abre o cierra la búsqueda; al cerrarla se borra lo escrito (si no, el filtro quedaba escondido). */
  function toggleSearch(open = !searching) {
    if (!open) {
      setSearching(false);
      setQuery("");
      return;
    }
    setSearching(true);
    // El foco, dos cuadros después: cerrado, el campo está oculto (visibility) y no lo
    // toma hasta que arranca el plegado.
    requestAnimationFrame(() => requestAnimationFrame(() => searchRef.current?.focus({ preventScroll: true })));
  }
  useOnNew(() => {
    if (!archived) form.current?.create();
  });

  const q = query.trim().toLowerCase();
  // El orden arrastrado (el mismo de Hoy) o prioridad y nombre, como HabitNow.
  const { sorted, reorder } = useHabitOrder(habits, manualOrder);
  const visible = sorted.filter((h) => (!q || h.name.toLowerCase().includes(q)) && (!category || h.categoryId === category));
  const activeCategory = categories.find((c) => c.id === category);

  return (
    <>
      <PageHeader
        title={archived ? "Archivados" : "Hábitos"}
        wide
        tabs={<HabitsTabs />}
        actions={
          <>
            <IconButton label={searching ? "Cerrar la búsqueda" : "Buscar"} onClick={() => toggleSearch()} className={cx(searching && "text-accent")}>
              <MagnifyingGlass size={21} weight={searching ? "bold" : "regular"} />
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
                    <HabitAvatar icon={c.icon} color={c.color} size={20} />
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
        {/* La búsqueda se abre con el alto animado (antes aparecía de golpe y empujaba la lista). */}
        <div className="fold" data-closed={!searching || undefined}>
          <div>
            <div className="relative pb-3">
              <MagnifyingGlass size={17} aria-hidden className="pointer-events-none absolute top-3.5 left-3 text-faint" />
              <input
                ref={searchRef}
                type="search"
                enterKeyHint="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && toggleSearch(false)}
                placeholder="Buscar hábito"
                aria-label="Buscar hábito"
                className="h-11 w-full min-w-0 rounded-[4px] border border-line-strong bg-surface pr-11 pl-9 text-[15px] outline-none placeholder:text-faint focus:ring-2 focus:ring-[var(--focus)] [&::-webkit-search-cancel-button]:appearance-none"
              />
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  searchRef.current?.focus();
                }}
                aria-label="Limpiar la búsqueda"
                tabIndex={query ? 0 : -1}
                className={cx(
                  "absolute top-0 right-0 inline-flex size-11 items-center justify-center rounded-[4px] text-muted transition-opacity duration-150 hover:text-fg",
                  !query && "pointer-events-none opacity-0",
                )}
              >
                <X size={16} weight="bold" />
              </button>
            </div>
          </div>
        </div>
        {activeCategory && (
          <div className="reveal flex flex-wrap items-center gap-2 pb-3">
            <button
              type="button"
              onClick={() => setCategory(null)}
              style={tone(activeCategory.color)}
              className="inline-flex h-9 items-center gap-1.5 rounded-[4px] bg-tone px-2.5 text-[13px] font-medium text-tone-fg"
            >
              {activeCategory.name}
              <X size={13} weight="bold" />
            </button>
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
          // Mantener apretado una tarjeta (o clic y arrastrar) y moverla para cambiar el orden.
          <Sortable ids={visible.map((h) => h.id)} onReorder={reorder} grid disabled={archived}>
          <div className="grid gap-3 lg:grid-cols-2 lg:gap-4">
          {visible.map((h) => (
            <SortableItem key={h.id} id={h.id} as="div" disabled={archived} draggingClass="rounded-2xl shadow-[0_16px_40px_-14px_rgba(0,0,0,0.4)]">
            <HabitCard
              habit={h}
              logs={logs[h.id] ?? {}}
              today={today}
              mark={mark}
              onDetail={(habit, date) => daySheet.current?.show(habit, date)}
              onEdit={() => form.current?.edit(h, hasMarks(logs[h.id], h.startDate))}
            />
            </SortableItem>
          ))}
          </div>
          </Sortable>
        )}
      </main>

      <HabitForm ref={form} categories={categories} today={today} />
      <DaySheet ref={daySheet} logs={logs} mark={mark} />
    </>
  );
}

function HabitCard({
  habit,
  logs,
  today: realToday,
  mark,
  onDetail,
  onEdit,
}: {
  habit: HabitDTO;
  logs: LogMap;
  today: string;
  mark: MarkFn;
  onDetail: (h: HabitDTO, d: string) => void;
  onEdit: () => void;
}) {
  const [, startTransition] = useSafeTransition();
  const tap = useDayTap(habit, logs, mark, onDetail);
  // Un archivado se mira como estaba el día que se archivó.
  const today = habit.archivedOn && habit.archivedOn < realToday ? habit.archivedOn : realToday;
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const streak = currentStreak(habit, logs, today);
  const score = habitScore(habit, logs, today);
  const clean = cleanDays(habit, logs, today);

  return (
    <article
      className="rounded-2xl border border-line bg-surface px-3.5 pt-3.5 pb-1 lg:px-4 lg:pt-4 lg:pb-1.5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <h2 className="display truncate text-[19px] lg:text-[22px]">{habit.name}</h2>
          <span className="flex min-w-0 items-center gap-2">
            <HabitBadge habit={habit} />
            <WeekCount habit={habit} logs={logs} day={today} today={today} />
          </span>
        </div>
        <HabitAvatar icon={habit.icon} color={habit.color} className="size-8 lg:size-[38px]" />
      </div>

      <div className="mt-3 grid grid-cols-7 justify-items-center gap-1 lg:mt-4">
        {days.map((d) => (
          <div key={d} className="grid justify-items-center gap-1.5">
            <span className={cx("font-mono text-[10.5px] tracking-[0.08em] uppercase", d === today ? "font-semibold text-fg" : "text-muted")}>
              {WEEKDAY_SHORT[weekday(d)]}
            </span>
            <DayCircle date={d} state={dayState(habit, logs, d, today)} onTap={() => tap(d)} />
          </div>
        ))}
      </div>

      {habit.isQuit && (
        <p className="mt-3 flex items-baseline gap-1.5 text-[13px] text-muted">
          <Leaf size={14} weight="fill" className="self-center text-[var(--st-done-line)]" aria-hidden />
          <span className="figure text-[19px] text-fg">{clean.current}</span>
          {clean.current === 1 ? "día limpio" : "días limpios"}
          {clean.best > clean.current && <span className="ml-1">· récord {clean.best}</span>}
        </p>
      )}
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
                // Va a la papelera con su historial; el aviso de abajo permite deshacerlo.
                onSelect: () => {
                  startTransition(() => deleteHabit(habit.id));
                  notifyDeleted(`"${habit.name}" borrado`);
                },
              },
            ]}
          />
        </div>
      </div>
    </article>
  );
}
