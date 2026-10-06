"use client";

import Link from "next/link";
import { useOptimistic, useRef, useState, useTransition } from "react";
import { CaretLeft, CaretRight, Check, Copy, DotsThreeVertical, MapPin, Medal, Plus } from "@phosphor-icons/react";
import { copyWeekToNext, setBlockDone } from "@/lib/plan-actions";
import { addDays, formatShort, weekday } from "@/lib/dates";
import {
  isFreeBlock,
  sortBlocks,
  timeRange,
  WEEKDAY_LONG,
  type BlockDTO,
  type CategoryDTO,
  type TaskDTO,
} from "@/lib/plan-logic";
import type { LinkableHabit } from "@/lib/plan";
import { PageHeader } from "@/components/page-header";
import { Button, cx, IconButton } from "@/components/ui";
import { Menu } from "@/components/menu";
import { BlockSheet, type BlockSheetHandle } from "./block-sheet";
import { CategoryTag, categoryMap, PriorityTag } from "./plan-ui";
import { PlanTabs } from "./plan-nav";

const SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export function WeekView({
  monday,
  today,
  blocks: initialBlocks,
  categories,
  habits,
  tasks,
  top,
}: {
  /** Lo que va arriba del calendario: las tareas. */
  top?: React.ReactNode;
  monday: string;
  today: string;
  blocks: BlockDTO[];
  categories: CategoryDTO[];
  habits: LinkableHabit[];
  tasks: Pick<TaskDTO, "id" | "title" | "status">[];
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const isThisWeek = days.includes(today);
  const [selected, setSelected] = useState(isThisWeek ? today : monday);
  const [blocks, applyDone] = useOptimistic(initialBlocks, (state, m: { id: string; done: boolean }) =>
    state.map((b) => (b.id === m.id ? { ...b, done: m.done } : b)),
  );
  const [, startTransition] = useTransition();
  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  const sheet = useRef<BlockSheetHandle>(null);
  const cats = categoryMap(categories);
  const habitName = new Map(habits.map((h) => [h.id, h.name]));

  const byDay = new Map(days.map((d) => [d, sortBlocks(blocks.filter((b) => b.date === d))]));
  const work = blocks.filter((b) => !isFreeBlock(b));
  const doneCount = work.filter((b) => b.done).length;

  function toggle(b: BlockDTO) {
    startTransition(async () => {
      applyDone({ id: b.id, done: !b.done });
      await setBlockDone(b.id, !b.done);
    });
  }
  const openNew = (date: string) => sheet.current?.open({ date });
  const openEdit = (b: BlockDTO) => sheet.current?.open(b);

  const prev = addDays(monday, -7);
  const next = addDays(monday, 7);

  return (
    <>
      <PageHeader
        title="Plan semanal"
        wide
        tabs={<PlanTabs />}
        actions={
          <>
            <Menu
              trigger={(toggleMenu) => (
                <IconButton label="Más opciones" onClick={toggleMenu}>
                  <DotsThreeVertical size={20} weight="bold" />
                </IconButton>
              )}
              items={[
                {
                  label: "Copiar a la semana que viene",
                  icon: <Copy size={16} />,
                  onSelect: () =>
                    startTransition(async () => {
                      const r = await copyWeekToNext(monday);
                      setCopyMsg(r.ok ? "Listo: la semana que viene ya tiene estos bloques." : r.error);
                    }),
                },
              ]}
            />
            <Button variant="accent" size="sm" className="ml-1 max-lg:hidden" onClick={() => openNew(selected)}>
              <Plus size={16} weight="bold" /> Nuevo bloque
            </Button>
          </>
        }
      />

      <main className="mx-auto max-w-6xl px-4 lg:px-10">
        {top}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 lg:pt-5">
          <div className="flex items-center gap-1">
            <Link
              href={`/plan?semana=${prev}`}
              aria-label="Semana anterior"
              className="inline-flex size-11 items-center justify-center rounded-[4px] text-fg hover:bg-surface-2"
            >
              <CaretLeft size={18} />
            </Link>
            <h2 className="display min-w-40 text-center text-[21px]">
              {formatShort(monday)} al {formatShort(addDays(monday, 6))}
            </h2>
            <Link
              href={`/plan?semana=${next}`}
              aria-label="Semana siguiente"
              className="inline-flex size-11 items-center justify-center rounded-[4px] text-fg hover:bg-surface-2"
            >
              <CaretRight size={18} />
            </Link>
          </div>
          {!isThisWeek && (
            <Link href="/plan" className="inline-flex min-h-11 items-center text-sm font-medium text-accent-fg hover:underline">
              Esta semana
            </Link>
          )}
          {work.length > 0 && (
            <p className="kicker tabular ml-auto">
              {doneCount} de {work.length} hechos
            </p>
          )}
        </div>
        {copyMsg && (
          <p role="status" className="mb-3 border-l-[1.5px] border-accent py-1 pl-3 text-[14px] text-accent-fg">
            {copyMsg}
          </p>
        )}

        {/* Celular: tira de días + lista del día elegido */}
        <div className="lg:hidden">
          <div className="grid grid-cols-7 gap-1 border-y border-line py-2 mb-5" role="tablist" aria-label="Días">
            {days.map((d) => {
              const active = d === selected;
              const count = byDay.get(d)!.filter((b) => !isFreeBlock(b)).length;
              const pending = byDay.get(d)!.some((b) => !b.done && !isFreeBlock(b));
              return (
                <button
                  key={d}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSelected(d)}
                  className={cx(
                    "relative flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-[6px] transition-colors",
                    active ? "bg-ink text-on-ink" : "text-fg hover:bg-surface-2",
                  )}
                >
                  <span
                    className={cx(
                      "font-mono text-[10px] font-medium tracking-[0.08em] uppercase",
                      active ? "text-on-ink/75" : "text-muted",
                    )}
                  >
                    {SHORT[weekday(d)]}
                  </span>
                  <span className="figure text-[21px]">{Number(d.slice(8))}</span>
                  <span
                    className={cx(
                      "mt-0.5 h-1.5 w-1.5 rounded-full",
                      count === 0 ? "bg-transparent" : pending ? (active ? "bg-on-ink" : "bg-accent") : active ? "bg-on-ink/50" : "bg-faint",
                    )}
                    aria-hidden
                  />
                  {d === today && !active && (
                    <span className="absolute inset-x-3 top-0 h-[2px] rounded-b-full bg-accent" aria-hidden />
                  )}
                </button>
              );
            })}
          </div>
          <DayList
            day={selected}
            today={today}
            blocks={byDay.get(selected)!}
            cats={cats}
            habitName={habitName}
            onToggle={toggle}
            onEdit={openEdit}
            onNew={() => openNew(selected)}
          />
        </div>

        {/* Escritorio: tablero de 7 columnas */}
        <div className="hidden grid-cols-7 border-t border-fg/80 lg:grid">
          {days.map((d) => {
            const list = byDay.get(d)!;
            return (
              <section
                key={d}
                aria-label={WEEKDAY_LONG[weekday(d)]}
                className={cx(
                  "grid min-h-[60dvh] min-w-0 content-start border-r border-line px-2.5 pb-6 first:pl-0 last:border-r-0 last:pr-0",
                  d === today && "bg-[color-mix(in_oklab,var(--accent)_4%,transparent)]",
                )}
              >
                <header className="flex items-end justify-between gap-1.5 border-b border-line px-1 pt-3 pb-2.5">
                  <span className="grid gap-0.5">
                    <span className={cx("kicker", d === today && "text-accent-fg!")}>{WEEKDAY_LONG[weekday(d)]}</span>
                    <span className="figure text-[30px]">{Number(d.slice(8))}</span>
                  </span>
                  <span className="pb-1 font-mono text-[11px] text-faint tabular">{list.length || ""}</span>
                </header>
                {list.map((b) => (
                  <BlockCard
                    key={b.id}
                    block={b}
                    compact
                    category={b.categoryId ? cats.get(b.categoryId) : null}
                    habit={b.habitId ? habitName.get(b.habitId) : undefined}
                    onToggle={() => toggle(b)}
                    onEdit={() => openEdit(b)}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => openNew(d)}
                  className="mt-1 flex h-11 items-center gap-1.5 rounded-[4px] px-1 text-[13px] text-muted transition-colors hover:bg-surface-2 hover:text-fg"
                >
                  <Plus size={14} /> Nuevo
                </button>
              </section>
            );
          })}
        </div>
      </main>

      <button
        type="button"
        onClick={() => openNew(selected)}
        aria-label="Nuevo bloque"
        className="lift fixed right-4 bottom-[calc(84px+env(safe-area-inset-bottom))] z-20 inline-flex size-14 items-center justify-center rounded-full bg-ink text-on-ink transition-transform active:scale-95 lg:hidden"
      >
        <Plus size={24} />
      </button>

      <BlockSheet ref={sheet} categories={categories} habits={habits} tasks={tasks} />
    </>
  );
}

function DayList({
  day,
  today,
  blocks,
  cats,
  habitName,
  onToggle,
  onEdit,
  onNew,
}: {
  day: string;
  today: string;
  blocks: BlockDTO[];
  cats: Map<string, CategoryDTO>;
  habitName: Map<string, string>;
  onToggle: (b: BlockDTO) => void;
  onEdit: (b: BlockDTO) => void;
  onNew: () => void;
}) {
  return (
    <section aria-label={WEEKDAY_LONG[weekday(day)]}>
      <h3 className="display pb-3 text-[24px] first-letter:uppercase">
        {day === today ? "Hoy, " : ""}
        {WEEKDAY_LONG[weekday(day)].toLowerCase()} {Number(day.slice(8))}
      </h3>
      {blocks.length === 0 ? (
        <div className="grid justify-items-start gap-3 border-t border-line py-8">
          <p className="display text-[20px] text-muted">Nada planeado para este día.</p>
          <Button variant="outline" size="sm" onClick={onNew}>
            <Plus size={15} /> Agregar bloque
          </Button>
        </div>
      ) : (
        <ol className="grid border-t border-line">
          {blocks.map((b) => (
            <li key={b.id} className="grid grid-cols-[52px_1fr] items-start gap-3 border-b border-line">
              <span className="pt-3.5 text-right font-mono text-[11.5px] leading-tight text-muted tabular">
                {b.startTime ? b.startTime.replace(/^0/, "") : "Todo el día"}
                {b.endTime && <span className="block text-muted/80">{b.endTime.replace(/^0/, "")}</span>}
              </span>
              <BlockCard
                block={b}
                category={b.categoryId ? cats.get(b.categoryId) : null}
                habit={b.habitId ? habitName.get(b.habitId) : undefined}
                onToggle={() => onToggle(b)}
                onEdit={() => onEdit(b)}
              />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function BlockCard({
  block: b,
  category,
  habit,
  onToggle,
  onEdit,
  compact,
}: {
  block: BlockDTO;
  category?: CategoryDTO | null;
  habit?: string;
  onToggle: () => void;
  onEdit: () => void;
  compact?: boolean;
}) {
  const free = isFreeBlock(b);
  const range = timeRange(b);
  return (
    <article
      className={cx(
        "group relative flex items-start gap-2 transition-colors",
        compact ? "border-b border-line px-1 py-2.5" : "py-2.5 pr-1",
        free && "opacity-80",
      )}
    >
      <button type="button" onClick={onEdit} className="grid min-w-0 flex-1 gap-1.5 text-left">
        <span
          className={cx(
            "text-[14.5px] leading-snug font-medium",
            free && "font-serif text-[16px] font-normal text-muted",
            b.done && !free && "text-muted line-through decoration-faint",
          )}
        >
          {b.title}
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          <CategoryTag category={category} />
          <PriorityTag n={b.priority} />
          {habit && (
            <span className="inline-flex items-center gap-0.5 text-[12px] text-accent-fg" title={`Vinculado a ${habit}`}>
              <Medal size={13} weight="fill" aria-hidden />
              <span className="sr-only">Vinculado al hábito {habit}</span>
            </span>
          )}
        </span>
        {compact && range && <span className="font-mono text-[11px] text-muted tabular">{range}</span>}
        {b.place && (
          <span className="inline-flex items-center gap-1 text-[12px] text-muted">
            <MapPin size={12} aria-hidden /> {b.place}
          </span>
        )}
      </button>
      {!free && (
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={b.done}
          aria-label={b.done ? `${b.title}: hecho. Desmarcar` : `Marcar ${b.title} como hecho`}
          className={cx(
            "inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-[transform,background-color] active:scale-90",
            compact && "-my-1.5 -mr-1.5 size-9",
          )}
        >
          <span
            className={cx(
              "inline-flex size-[22px] items-center justify-center rounded-[4px] border-[1.5px] transition-colors",
              b.done
                ? "border-[var(--st-done-line)] bg-[var(--st-done-line)] text-on-accent"
                : "border-fg/45 bg-transparent group-hover:border-fg/70",
            )}
          >
            {b.done && <Check size={14} weight="bold" />}
          </span>
        </button>
      )}
    </article>
  );
}
