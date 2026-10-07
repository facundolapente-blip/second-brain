"use client";

import { useOnNew } from "@/components/nav-add";
import Link from "next/link";
import { useOptimistic, useRef, useState, useTransition } from "react";
import { ArrowArcRight, CaretLeft, CaretRight, Check, Clock, Copy, DotsThreeVertical, MapPin, Plus } from "@phosphor-icons/react";
import { copyWeekToNext, moveBlock, passWeek, setBlockDone } from "@/lib/plan-actions";
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
import { PageHeader } from "@/components/page-header";
import { Button, cx, IconButton } from "@/components/ui";
import { Menu } from "@/components/menu";
import { BlockSheet, type BlockSheetHandle } from "./block-sheet";
import { CategoryTag, categoryMap, PriorityTag } from "./plan-ui";
import { PlanTabs } from "./plan-nav";
import { BoardHours, BoardList } from "./week-board";

const SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export function WeekView({
  monday,
  today,
  blocks: initialBlocks,
  categories,
  tasks,
  top,
}: {
  /** Lo que va arriba del calendario: las tareas. */
  top?: React.ReactNode;
  monday: string;
  today: string;
  blocks: BlockDTO[];
  categories: CategoryDTO[];
  tasks: Pick<TaskDTO, "id" | "title" | "status">[];
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const isThisWeek = days.includes(today);
  const [selected, setSelected] = useState(isThisWeek ? today : monday);
  // Cambios optimistas: tildar o mover (día y hora).
  const [blocks, applyDone] = useOptimistic(initialBlocks, (state, m: Partial<BlockDTO> & { id: string }) =>
    state.map((b) => (b.id === m.id ? { ...b, ...m } : b)),
  );
  const [view, setView] = useState<"lista" | "horas">("lista");
  const [, startTransition] = useTransition();
  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  const sheet = useRef<BlockSheetHandle>(null);
  const cats = categoryMap(categories);

  const byDay = new Map(days.map((d) => [d, sortBlocks(blocks.filter((b) => b.date === d))]));
  const work = blocks.filter((b) => !isFreeBlock(b));
  const doneCount = work.filter((b) => b.done).length;

  function toggle(b: BlockDTO) {
    startTransition(async () => {
      applyDone({ id: b.id, done: !b.done });
      await setBlockDone(b.id, !b.done);
    });
  }
  const openNew = (date: string, startTime?: string) => sheet.current?.open(startTime ? { date, startTime } : { date });
  function move(id: string, date: string, startTime?: string | null, sortKey?: number) {
    const b = blocks.find((x) => x.id === id);
    if (!b) return;
    const sameSpot = b.date === date && (startTime === undefined || startTime === b.startTime);
    if (sameSpot && (sortKey === undefined || sortKey === b.sortKey)) return;
    startTransition(async () => {
      applyDone({ id, date, ...(startTime !== undefined ? { startTime } : {}), ...(sortKey !== undefined ? { sortKey } : {}) });
      await moveBlock(id, date, startTime, sortKey);
    });
  }
  const openEdit = (b: BlockDTO) => sheet.current?.open(b);

  useOnNew(() => openNew(selected));
  const boardProps = { days, today, byDay, cats, onToggle: toggle, onEdit: openEdit, onNew: openNew, onMove: move };

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
                  // La misma tarjeta pasa a la semana siguiente (no se duplica).
                  label: "Pasar toda la semana a la siguiente",
                  icon: <ArrowArcRight size={16} />,
                  onSelect: () =>
                    startTransition(async () => {
                      const r = await passWeek(monday);
                      setCopyMsg(
                        r.ok
                          ? `Listo: ${r.count} ${r.count === 1 ? "tarjeta pasó" : "tarjetas pasaron"} a la semana que viene, sin tildar. Ajustá las que cambien de día.`
                          : r.error,
                      );
                    }),
                },
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

      <main className="mx-auto max-w-6xl px-4 lg:max-w-[110rem] lg:px-10">
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
            {copyMsg}{" "}
            {copyMsg.startsWith("Listo") && (
              <Link href={`/plan?semana=${addDays(monday, 7)}`} className="font-medium underline underline-offset-4">
                Ir a esa semana
              </Link>
            )}
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
                      active ? "text-on-ink" : "text-muted",
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
          <div className="mb-3 flex justify-end">
            <ViewToggle view={view} onChange={setView} />
          </div>
          {view === "lista" ? (
            <DayList
              day={selected}
              today={today}
              blocks={byDay.get(selected)!}
              cats={cats}
              onToggle={toggle}
              onEdit={openEdit}
              onNew={() => openNew(selected)}
            />
          ) : (
            // Por horas en el celular: el calendario del día elegido en la tira.
            <BoardHours {...boardProps} days={[selected]} />
          )}
        </div>

        {/* Escritorio: lista de 7 columnas o calendario por horas; los bloques se arrastran. */}
        <div className="hidden lg:block">
          <div className="mb-3 flex justify-end">
            <ViewToggle view={view} onChange={setView} />
          </div>
          {view === "lista" ? (
            <BoardList {...boardProps} />
          ) : (
            <BoardHours {...boardProps} />
          )}
        </div>
      </main>


      <BlockSheet ref={sheet} categories={categories} tasks={tasks} />
    </>
  );
}

function DayList({
  day,
  today,
  blocks,
  cats,
  onToggle,
  onEdit,
  onNew,
}: {
  day: string;
  today: string;
  blocks: BlockDTO[];
  cats: Map<string, CategoryDTO>;
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
            <li key={b.id} className="grid grid-cols-[52px_1fr] items-start gap-3 border-b-2 border-fg/25">
              <span className="pt-3 text-right font-mono text-[13px] leading-tight font-medium text-fg/80 tabular">
                {b.startTime ? b.startTime.replace(/^0/, "") : <span className="text-[11.5px] font-normal text-muted">Todo el día</span>}
                {b.endTime && <span className="block font-normal text-muted">{b.endTime.replace(/^0/, "")}</span>}
              </span>
              <BlockCard
                block={b}
                category={b.categoryId ? cats.get(b.categoryId) : null}
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

export function BlockCard({
  block: b,
  category,
  onToggle,
  onEdit,
  compact,
}: {
  block: BlockDTO;
  category?: CategoryDTO | null;
  onToggle: () => void;
  onEdit: () => void;
  compact?: boolean;
}) {
  const free = isFreeBlock(b);
  const range = timeRange(b);
  return (
    <article
      className={cx(
        "group relative grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-1.5 transition-colors",
        compact ? "border-b-2 border-fg/25 px-1 py-2.5" : "py-2.5 pr-1",
        free && "opacity-80",
      )}
    >
      <button type="button" onClick={onEdit} className={cx("min-w-0 text-left", free && "col-span-2")}>
        <span
          className={cx(
            "block text-[14.5px] leading-snug font-medium break-words hyphens-auto",
            free && "font-serif text-[16px] font-normal text-muted",
            b.done && !free && "text-muted line-through decoration-faint",
          )}
        >
          {b.title}
        </span>
        {/* La hora, cerca del título y con peso parecido al de las etiquetas. */}
        {compact && range && (
          <span className="mt-1 flex items-center gap-1 font-mono text-[13px] font-medium whitespace-nowrap text-fg/75 tabular">
            <Clock size={13} weight="bold" aria-hidden className="shrink-0 text-muted" />
            {range.replace(" a ", "–")}
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
            "row-span-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-[transform,background-color] active:scale-90",
            compact && "row-span-1 -my-1.5 size-9",
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
      <button
        type="button"
        onClick={onEdit}
        tabIndex={-1}
        className={cx("grid min-w-0 gap-1.5 text-left", compact ? "col-span-2" : "col-start-1")}
      >
        <span className="flex flex-wrap items-center gap-1.5">
          <CategoryTag category={category} />
          <PriorityTag n={b.priority} />
        </span>
        {b.place && (
          <span className="inline-flex items-center gap-1 text-[12px] text-muted">
            <MapPin size={12} aria-hidden /> {b.place}
          </span>
        )}
      </button>
    </article>
  );
}

/** Lista o Por horas (en el celular y en la compu). */
function ViewToggle({ view, onChange }: { view: "lista" | "horas"; onChange: (v: "lista" | "horas") => void }) {
  return (
    <div role="radiogroup" aria-label="Vista" className="inline-flex rounded-full bg-surface-2 p-1">
      {(["lista", "horas"] as const).map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={view === v}
          onClick={() => onChange(v)}
          className={cx(
            "h-8 rounded-full px-3.5 text-[12.5px] font-medium transition-colors",
            view === v ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg",
          )}
        >
          {v === "lista" ? "Lista" : "Por horas"}
        </button>
      ))}
    </div>
  );
}
