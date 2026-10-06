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
              className="inline-flex size-11 items-center justify-center rounded-md border border-line-strong text-fg hover:border-rule hover:bg-surface-2"
            >
              <CaretLeft size={18} weight="bold" />
            </Link>
            <h2 className="tabular min-w-40 text-center text-[15px] font-semibold uppercase">
              {formatShort(monday)} al {formatShort(addDays(monday, 6))}
            </h2>
            <Link
              href={`/plan?semana=${next}`}
              aria-label="Semana siguiente"
              className="inline-flex size-11 items-center justify-center rounded-md border border-line-strong text-fg hover:border-rule hover:bg-surface-2"
            >
              <CaretRight size={18} weight="bold" />
            </Link>
          </div>
          {!isThisWeek && (
            <Link href="/plan" className="label-mono inline-flex min-h-11 items-center text-accent-fg hover:underline">
              Esta semana
            </Link>
          )}
          {work.length > 0 && (
            <p className="ml-auto flex items-center gap-2.5">
              <span className="tabular text-[20px] leading-none font-semibold">
                {String(doneCount).padStart(2, "0")}
                <span className="text-[14px] text-muted">/{String(work.length).padStart(2, "0")}</span>
              </span>
              <span className="label-mono text-muted">hechos</span>
              <span aria-hidden className="relative hidden h-2.5 w-24 border border-line-strong sm:block">
                <span className="absolute inset-y-0 left-0 bg-[var(--st-done-line)]" style={{ width: `${(doneCount / work.length) * 100}%` }} />
              </span>
            </p>
          )}
        </div>
        {copyMsg && (
          <p role="status" className="mb-3 border border-rule border-l-4 border-l-accent bg-surface px-3 py-2 text-[13px]">
            {copyMsg}
          </p>
        )}

        {/* Celular: tira de días + lista del día elegido */}
        <div className="lg:hidden">
          <div className="mb-4 grid grid-cols-7 border border-line-strong" role="tablist" aria-label="Días">
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
                    "relative flex min-h-[64px] flex-col items-center justify-center gap-0.5 border-r border-line transition-colors last:border-r-0",
                    active ? "bg-ink text-on-ink" : "bg-surface text-fg hover:bg-surface-2",
                  )}
                >
                  <span className={cx("label-mono text-[10px]", active ? "text-on-ink/75" : "text-muted")}>
                    {SHORT[weekday(d)]}
                  </span>
                  <span className="tabular text-[18px] leading-none font-semibold">{Number(d.slice(8))}</span>
                  <span
                    className={cx(
                      "mt-1 h-1.5 w-1.5",
                      count === 0 ? "bg-transparent" : pending ? "bg-accent" : active ? "bg-on-ink/50" : "bg-faint",
                    )}
                    aria-hidden
                  />
                  {d === today && <span className="absolute inset-x-0 top-0 h-[3px] bg-accent" aria-hidden />}
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
        <div className="hidden grid-cols-7 gap-px border border-line-strong bg-line-strong lg:grid">
          {days.map((d) => {
            const list = byDay.get(d)!;
            return (
              <section key={d} aria-label={WEEKDAY_LONG[weekday(d)]} className="grid min-h-[60dvh] content-start gap-1.5 bg-surface p-1.5">
                <header className={cx("relative -mx-1.5 -mt-1.5 mb-0.5 flex items-baseline gap-1.5 border-b border-line px-2.5 pt-2.5 pb-2", d === today && "bg-surface-2")}>
                  {d === today && <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-accent" />}
                  <span className={cx("label-mono", d === today ? "font-bold text-fg" : "text-muted")}>
                    {WEEKDAY_LONG[weekday(d)].slice(0, 3)}
                  </span>
                  <span className="tabular text-[20px] leading-none font-semibold">{Number(d.slice(8))}</span>
                  <span className="tabular ml-auto text-[11px] text-faint">{list.length ? String(list.length).padStart(2, "0") : ""}</span>
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
                  className="label-mono flex h-9 items-center gap-1.5 border border-dashed border-transparent px-2 text-[10.5px] text-faint transition-colors hover:border-line-strong hover:text-muted"
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
        className="lift fixed right-4 bottom-[calc(76px+env(safe-area-inset-bottom))] z-20 inline-flex size-14 items-center justify-center border border-rule bg-accent text-on-accent transition-[transform,box-shadow] duration-150 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none lg:hidden"
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
      <h3 className="label-mono pb-2 text-muted">
        {day === today ? "Hoy, " : ""}
        {WEEKDAY_LONG[weekday(day)].toLowerCase()} {Number(day.slice(8))}
      </h3>
      {blocks.length === 0 ? (
        <div className="grid justify-items-start gap-2 border border-dashed border-line-strong p-6">
          <p className="text-sm text-muted">Nada planeado para este día.</p>
          <Button variant="outline" size="sm" onClick={onNew}>
            <Plus size={15} /> Agregar bloque
          </Button>
        </div>
      ) : (
        <ol className="grid gap-2 border-l border-line-strong">
          {blocks.map((b) => (
            <li key={b.id} className="grid grid-cols-[52px_1fr] items-start gap-2">
              <span className="tabular pt-3 pr-1 text-right text-[12px] leading-tight font-medium text-fg">
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
      style={category ? tone(category.color) : undefined}
      className={cx(
        "group relative flex items-start gap-2 border border-l-[3px] p-2.5 transition-colors",
        free ? "border-dashed border-line-strong bg-transparent" : "border-line-strong bg-surface hover:border-rule",
        !free && (category ? "border-l-tone-solid" : "border-l-rule"),
        b.done && !free && "bg-surface-2",
      )}
    >
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
              "inline-flex size-6 items-center justify-center rounded-[2px] border-[1.5px] transition-colors",
              b.done
                ? "border-[var(--st-done-line)] bg-[var(--st-done-line)] text-[var(--on-st)]"
                : "border-rule bg-surface",
            )}
          >
            {b.done && <Check size={14} weight="bold" />}
          </span>
        </button>
      )}
    </article>
  );
}
