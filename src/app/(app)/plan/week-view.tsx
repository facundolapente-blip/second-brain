"use client";

import Link from "next/link";
import { tone } from "@/lib/palette";
import { motion } from "motion/react";
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
import { CategoryTag, categoryMap, Fires } from "./plan-ui";
import { PlanTabs } from "./plan-nav";

const SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export function WeekView({
  monday,
  today,
  blocks: initialBlocks,
  categories,
  habits,
  tasks,
}: {
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
        title="Semana"
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

      <main className="mx-auto max-w-6xl px-4 lg:px-8">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 lg:pt-5">
          <div className="flex items-center gap-1">
            <Link
              href={`/plan?semana=${prev}`}
              aria-label="Semana anterior"
              className="inline-flex size-11 items-center justify-center rounded-full text-fg transition-[background-color,transform] duration-300 ease-spring hover:bg-surface-2 active:scale-90"
            >
              <CaretLeft size={18} weight="bold" />
            </Link>
            <h2 className="display min-w-36 text-center text-[18px] font-semibold">
              {formatShort(monday)} al {formatShort(addDays(monday, 6))}
            </h2>
            <Link
              href={`/plan?semana=${next}`}
              aria-label="Semana siguiente"
              className="inline-flex size-11 items-center justify-center rounded-full text-fg transition-[background-color,transform] duration-300 ease-spring hover:bg-surface-2 active:scale-90"
            >
              <CaretRight size={18} weight="bold" />
            </Link>
          </div>
          {!isThisWeek && (
            <Link href="/plan" className="inline-flex h-9 items-center rounded-full border border-line-strong bg-surface/60 px-3.5 text-[13px] font-medium transition-colors hover:bg-surface-2">
              Esta semana
            </Link>
          )}
          {work.length > 0 && (
            <p className="ml-auto inline-flex items-center gap-2.5 text-[13px] text-muted">
              <span className="relative block h-1.5 w-20 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                <motion.span
                  className="absolute inset-y-0 left-0 rounded-full bg-[var(--st-done-line)]"
                  initial={false}
                  animate={{ width: `${(doneCount / work.length) * 100}%` }}
                />
              </span>
              <span>
                <span className="num text-[17px] font-semibold text-fg">{doneCount}</span>
                <span className="tabular"> de {work.length} hechos</span>
              </span>
            </p>
          )}
        </div>
        {copyMsg && (
          <p role="status" className="mb-3 rounded-[14px] bg-accent-soft px-3.5 py-2.5 text-[13px] text-accent-fg">
            {copyMsg}
          </p>
        )}

        {/* Celular: tira de días + lista del día elegido */}
        <div className="lg:hidden">
          <div className="grid grid-cols-7 gap-1.5 pb-4" role="tablist" aria-label="Días">
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
                    "relative flex flex-col items-center rounded-[18px] pt-2 pb-2 transition-[background-color,transform] duration-300 ease-spring active:scale-95",
                    active ? "btn-glow bg-accent text-on-accent" : "text-fg hover:bg-surface-2",
                  )}
                >
                  <span className={cx("text-[11.5px] font-medium", active ? "text-on-accent/80" : d === today ? "text-accent-fg" : "text-muted")}>
                    {SHORT[weekday(d)]}
                  </span>
                  <span className="num text-[19px] font-semibold">{Number(d.slice(8))}</span>
                  <span
                    className={cx(
                      "mt-0.5 h-1.5 w-1.5 rounded-full",
                      count === 0 ? "bg-transparent" : pending ? (active ? "bg-on-accent" : "bg-accent") : active ? "bg-on-accent/50" : "bg-faint",
                    )}
                    aria-hidden
                  />

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
        <div className="hidden grid-cols-7 gap-2.5 lg:grid">
          {days.map((d) => {
            const list = byDay.get(d)!;
            return (
              <section key={d} aria-label={WEEKDAY_LONG[weekday(d)]} className="grid content-start gap-2">
                <header className="flex items-baseline gap-1.5 px-1 pb-1">
                  <span className={cx("display text-[15px] font-semibold", d === today ? "text-accent-fg" : "text-fg")}>
                    {WEEKDAY_LONG[weekday(d)]}
                  </span>
                  <span className="num text-[15px] text-muted">{Number(d.slice(8))}</span>
                  <span className="tabular ml-auto text-[12px] text-faint">{list.length || ""}</span>
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
                  className="flex h-10 items-center gap-1.5 rounded-[14px] px-2.5 text-[13px] text-muted transition-colors hover:bg-surface-2 hover:text-fg"
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
        className="btn-glow fixed right-5 bottom-[calc(92px+env(safe-area-inset-bottom))] z-20 inline-flex size-14 items-center justify-center rounded-[20px] bg-accent text-on-accent transition-transform duration-300 ease-spring active:scale-90 lg:hidden"
      >
        <Plus size={26} weight="bold" />
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
      <h3 className="display pb-3 text-[18px] font-semibold first-letter:uppercase">
        {day === today ? "Hoy, " : ""}
        {WEEKDAY_LONG[weekday(day)].toLowerCase()} {Number(day.slice(8))}
      </h3>
      {blocks.length === 0 ? (
        <div className="grid justify-items-start gap-2 empty-card p-6">
          <p className="text-sm text-muted">Nada planeado para este día.</p>
          <Button variant="outline" size="sm" onClick={onNew}>
            <Plus size={15} /> Agregar bloque
          </Button>
        </div>
      ) : (
        <ol className="grid gap-2">
          {blocks.map((b) => (
            <li key={b.id} className="grid grid-cols-[52px_1fr] items-start gap-2">
              <span className="tabular pt-3.5 text-right text-[12px] leading-tight font-medium text-muted">
                {b.startTime ? b.startTime.replace(/^0/, "") : "Todo el día"}
                {b.endTime && <span className="block text-faint">{b.endTime.replace(/^0/, "")}</span>}
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
        "group relative flex items-start gap-2 overflow-hidden p-3 transition-[border-color,opacity] duration-300",
        free ? "rounded-[16px] border border-dashed border-line-strong bg-transparent" : "card card-sm hover:border-line-strong",
        b.done && !free && "opacity-70",
      )}
    >
      {/* Filo de color de la categoría a la izquierda, como una etiqueta de agenda. */}
      {!free && category && (
        <span aria-hidden style={tone(category.color)} className="absolute inset-y-2.5 left-0 w-[3px] rounded-r-full bg-tone-solid" />
      )}
      <button type="button" onClick={onEdit} className="grid min-w-0 flex-1 gap-1.5 text-left">
        <span
          className={cx(
            "text-[14px] leading-snug font-medium",
            free && "text-muted",
            b.done && !free && "text-muted line-through decoration-faint",
          )}
        >
          {b.title}
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          <CategoryTag category={category} />
          <Fires n={b.priority} size={12} />
          {habit && (
            <span className="inline-flex items-center gap-0.5 text-[12px] text-accent-fg" title={`Vinculado a ${habit}`}>
              <Medal size={13} weight="fill" aria-hidden />
              <span className="sr-only">Vinculado al hábito {habit}</span>
            </span>
          )}
        </span>
        {compact && range && <span className="tabular text-[12px] text-muted">{range}</span>}
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
            compact && "-m-1.5 size-10",
          )}
        >
          <span
            className={cx(
              "inline-flex size-6 items-center justify-center rounded-[8px] border-2 transition-[background-color,border-color,transform] duration-300 ease-spring",
              b.done
                ? "scale-110 border-[var(--st-done-line)] bg-[var(--st-done-line)] text-on-accent shadow-[0_4px_12px_-4px_var(--st-done-line)]"
                : "border-line-strong bg-surface",
            )}
          >
            {b.done && <Check size={14} weight="bold" />}
          </span>
        </button>
      )}
    </article>
  );
}
