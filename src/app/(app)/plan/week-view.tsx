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
import { motion } from "motion/react";
import { Button, cx, IconButton } from "@/components/ui";
import { Burst, useHasChanged, useJustDone } from "@/components/celebrate";
import { tone } from "@/lib/palette";
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
              className="inline-flex size-10 items-center justify-center rounded-full bg-accent-soft text-accent-fg transition-transform active:scale-90"
            >
              <CaretLeft size={18} weight="bold" />
            </Link>
            <h2 className="tabular min-w-36 text-center text-[17px] font-extrabold">
              {formatShort(monday)} al {formatShort(addDays(monday, 6))}
            </h2>
            <Link
              href={`/plan?semana=${next}`}
              aria-label="Semana siguiente"
              className="inline-flex size-10 items-center justify-center rounded-full bg-accent-soft text-accent-fg transition-transform active:scale-90"
            >
              <CaretRight size={18} weight="bold" />
            </Link>
          </div>
          {!isThisWeek && (
            <Link href="/plan" className="text-sm font-semibold text-accent-fg hover:underline">
              Esta semana
            </Link>
          )}
          {work.length > 0 && (
            <p className="tabular ml-auto rounded-full bg-[var(--st-done-bg)] px-3 py-1 text-[13px] font-extrabold text-[var(--st-done-fg)]">
              {doneCount} de {work.length} hechos
            </p>
          )}
        </div>
        {copyMsg && (
          <p role="status" className="mb-3 rounded-[16px] bg-accent-soft px-4 py-2.5 text-[13px] font-bold text-accent-fg">
            {copyMsg}
          </p>
        )}

        {/* Celular: tira de días + lista del día elegido */}
        <div className="lg:hidden">
          <div className="grid grid-cols-7 gap-1 pb-4" role="tablist" aria-label="Días">
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
                    "relative flex flex-col items-center gap-0.5 rounded-full pt-2 pb-2.5 transition-[background-color,transform] duration-200 active:scale-95",
                    active ? "bg-accent text-on-accent" : "text-fg hover:bg-surface",
                  )}
                >
                  <span className={cx("text-[11px] font-bold", active ? "text-on-accent" : d === today ? "text-accent-fg" : "text-muted")}>
                    {SHORT[weekday(d)]}
                  </span>
                  <span className="tabular text-[17px] font-extrabold">{Number(d.slice(8))}</span>
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
                  <span className={cx("text-[14px] font-extrabold", d === today ? "text-accent-fg" : "text-fg")}>
                    {WEEKDAY_LONG[weekday(d)]}
                  </span>
                  <span className="tabular text-[13px] text-muted">{Number(d.slice(8))}</span>
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
                  className="flex h-10 items-center gap-1.5 rounded-full px-3 text-[13px] font-bold text-muted transition-colors hover:bg-accent-soft hover:text-accent-fg"
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
        className="lift-accent fixed right-4 bottom-[calc(96px+env(safe-area-inset-bottom))] z-20 inline-flex size-15 items-center justify-center rounded-full bg-accent text-on-accent hover:scale-105 transition-transform active:scale-95 lg:hidden"
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
      <h3 className="pb-2.5 text-[17px] font-extrabold first-letter:uppercase">
        {day === today ? "Hoy, " : ""}
        {WEEKDAY_LONG[weekday(day)].toLowerCase()} {Number(day.slice(8))}
      </h3>
      {blocks.length === 0 ? (
        <div className="grid justify-items-start gap-2 rounded-card card p-6">
          <p className="text-sm text-muted">Nada planeado para este día.</p>
          <Button variant="outline" size="sm" onClick={onNew}>
            <Plus size={15} /> Agregar bloque
          </Button>
        </div>
      ) : (
        <ol className="grid gap-2">
          {blocks.map((b) => (
            <li key={b.id} className="grid grid-cols-[52px_1fr] items-start gap-2">
              <span className="tabular pt-3 text-right text-[13px] leading-tight font-extrabold">
                {b.startTime ? b.startTime.replace(/^0/, "") : "Todo el día"}
                {b.endTime && <span className="block font-semibold text-muted">{b.endTime.replace(/^0/, "")}</span>}
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
  const shot = useJustDone(b.done);
  const changed = useHasChanged(b.done);
  return (
    <article
      style={category ? tone(category.color) : undefined}
      className={cx(
        "group relative flex items-start gap-2 overflow-hidden rounded-[18px] p-3 pl-4 transition-[background-color,transform] duration-200",
        free ? "bg-transparent outline-2 -outline-offset-2 outline-dashed outline-line-strong" : "card",
        b.done && !free && "bg-[var(--st-done-bg)]! shadow-none",
      )}
    >
      {!free && (
        <span
          aria-hidden
          className={cx("absolute inset-y-2.5 left-1.5 w-1 rounded-full", category ? "bg-tone-solid" : "bg-line-strong")}
        />
      )}
      <button type="button" onClick={onEdit} className="grid min-w-0 flex-1 gap-1.5 text-left">
        <span
          className={cx(
            "text-[15px] leading-snug font-extrabold",
            free && "text-muted",
            b.done && !free && "text-[var(--st-done-fg)] line-through decoration-[var(--st-done-line)]/50",
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
        <motion.button
          type="button"
          onClick={onToggle}
          aria-pressed={b.done}
          aria-label={b.done ? `${b.title}: hecho. Desmarcar` : `Marcar ${b.title} como hecho`}
          whileTap={{ scale: 0.85 }}
          className={cx("relative inline-flex size-11 shrink-0 items-center justify-center rounded-full", compact && "-m-1.5 size-10")}
        >
          <span className="relative inline-flex">
            <Burst shot={shot} reach={26} />
            <span
              className={cx(
                "inline-flex size-8 items-center justify-center rounded-full transition-[background-color,box-shadow] duration-200",
                compact && "size-7",
                b.done
                  ? "bg-[var(--st-done-solid)] text-[var(--st-done-on)]"
                  : "bg-surface ring-[2.5px] ring-inset ring-line-strong",
              )}
            >
              {b.done && (
                <motion.span
                  initial={changed ? { scale: 0.3, rotate: -25 } : false}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 600, damping: 16 }}
                  className="inline-flex"
                >
                  <Check size={compact ? 15 : 17} weight="bold" />
                </motion.span>
              )}
            </span>
          </span>
        </motion.button>
      )}
    </article>
  );
}
