"use client";

import { useEffect, useState } from "react";
import { Plus } from "@phosphor-icons/react";
import { formatShort, weekday } from "@/lib/dates";
import { BLOCK_DRAG, isFreeBlock, isUrgent, monthCellBlocks, TASK_DRAG, WEEKDAY_LONG, type BlockDTO, type CategoryDTO, type SortKeyPatch } from "@/lib/plan-logic";
import { tone } from "@/lib/palette";
import { cx } from "@/components/ui";
import { haptic } from "@/components/haptics";
import { land, liftImage } from "./drag-motion";

/** Encabezado de la grilla: la semana empieza el lunes. */
const HEAD = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const HEAD_INITIAL = ["L", "M", "X", "J", "V", "S", "D"];
/** Bloques que se ven en la celda de un día (compu); el resto, "+N más". */
const CELL_MAX = 4;
/** Puntitos por día en la grilla del celular. */
const DOTS_MAX = 4;

const accepts = (e: React.DragEvent) => e.dataTransfer.types.includes(BLOCK_DRAG) || e.dataTransfer.types.includes(TASK_DRAG);
const shortTime = (t: string) => t.replace(/^0/, "");
/** "martes 3 de noviembre" (para el lector de pantalla). */
const dayLabel = (d: string) => `${WEEKDAY_LONG[weekday(d)].toLowerCase()} ${Number(d.slice(8))}`;
/** El color del punto de un bloque: "Libre" verde, si no el de su categoría (gris sin categoría). */
const dotTone = (b: BlockDTO, cats: Map<string, CategoryDTO>) => (isFreeBlock(b) ? "green" : (b.categoryId && cats.get(b.categoryId)?.color) || "stone");

type Props = {
  month: string;
  days: string[];
  today: string;
  byDay: Map<string, BlockDTO[]>;
  cats: Map<string, CategoryDTO>;
};

/**
 * Compu: el mes en una grilla de lunes a domingo. Cada día con sus bloques en orden
 * (hora corta + título, punto del color de la categoría); los que no entran, "+N más",
 * que lleva a ese día en la semana (igual que tocar el número). Los bloques se
 * arrastran a otro día y las tareas de la tabla se sueltan en un día para agendarlas.
 */
export function BoardMonth({
  month,
  days,
  today,
  byDay,
  cats,
  onEdit,
  onNew,
  onOpenDay,
  onMove,
  onMenu,
  onDropTask,
}: Props & {
  onEdit: (b: BlockDTO) => void;
  onNew: (date: string) => void;
  /** Ir a ese día en la vista de semana. */
  onOpenDay: (date: string) => void;
  onMove: (id: string, date: string) => void;
  onMenu: (e: React.MouseEvent, b: BlockDTO) => void;
  onDropTask: (taskId: string, date: string, startTime: string | null, sortKey?: number, others?: SortKeyPatch[], at?: { clientX: number; clientY: number }) => void;
}) {
  const [over, setOver] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  useEffect(() => {
    const clear = () => {
      setOver(null);
      setDragging(null);
    };
    window.addEventListener("dragend", clear);
    window.addEventListener("drop", clear);
    return () => {
      window.removeEventListener("dragend", clear);
      window.removeEventListener("drop", clear);
    };
  }, []);
  return (
    <div className="border-t border-fg/80">
      <div className="grid grid-cols-7 border-b border-line" aria-hidden>
        {HEAD.map((h) => (
          <span key={h} className="kicker px-2 pt-2.5 pb-2">
            {h}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-[repeat(7,minmax(0,1fr))]">
        {days.map((d) => {
          const list = byDay.get(d) ?? [];
          const { shown, more } = monthCellBlocks(list, CELL_MAX);
          const isToday = d === today;
          const outside = d.slice(0, 7) !== month;
          return (
            <section
              key={d}
              aria-label={`${isToday ? "Hoy, " : ""}${dayLabel(d)}`}
              onDragOver={(e) => {
                if (!accepts(e)) return;
                e.preventDefault();
                setOver(d);
              }}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                setOver((o) => (o === d ? null : o));
              }}
              onDrop={(e) => {
                setOver(null);
                const taskId = e.dataTransfer.getData(TASK_DRAG);
                if (taskId)
                  return onDropTask(taskId, d, null, undefined, undefined, {
                    clientX: e.clientX,
                    clientY: e.clientY,
                  });
                const id = e.dataTransfer.getData(BLOCK_DRAG);
                setDragging(null);
                if (!id) return;
                haptic("success");
                land(id, e);
                onMove(id, d);
              }}
              data-drop={over === d ? "over" : undefined}
              className={cx(
                "plan-drop group/day grid min-h-[8.5rem] min-w-0 content-start gap-1 border-r border-b border-line px-1.5 pt-1.5 pb-2 transition-colors [&:nth-child(7n)]:border-r-0",
                outside && "bg-[color-mix(in_oklab,var(--surface-2)_70%,transparent)]",
                // Hoy: teñido del acento con la franja arriba, como la columna de la semana.
                isToday && "bg-[color-mix(in_oklab,var(--accent)_13%,transparent)] shadow-[inset_0_3px_0_var(--accent)]",
                over === d && "bg-[color-mix(in_oklab,var(--accent)_18%,transparent)]",
              )}
            >
              <header className="flex items-center justify-between gap-1">
                <button
                  type="button"
                  onClick={() => onOpenDay(d)}
                  title="Ver este día en la semana"
                  aria-label={`Ver ${dayLabel(d)} en la semana`}
                  className={cx(
                    "figure inline-flex h-7 min-w-7 items-center justify-center rounded-lg px-1.5 text-[15px] whitespace-nowrap transition-colors",
                    isToday ? "bg-accent text-on-accent" : outside ? "text-muted hover:bg-surface-2 hover:text-fg" : "text-fg hover:bg-surface-2",
                  )}
                >
                  {/* El 1° de cada mes lleva el mes (los días de los meses vecinos se distinguen). */}
                  {d.endsWith("-01") ? formatShort(d) : Number(d.slice(8))}
                </button>
                <button
                  type="button"
                  onClick={() => onNew(d)}
                  aria-label={`Nuevo bloque el ${dayLabel(d)}`}
                  title="Nuevo bloque"
                  className="inline-flex size-7 items-center justify-center rounded-full text-muted opacity-0 transition-opacity group-hover/day:opacity-100 hover:bg-surface-2 hover:text-fg focus-visible:opacity-100"
                >
                  <Plus size={14} weight="bold" />
                </button>
              </header>
              {shown.map((b) => {
                const free = isFreeBlock(b);
                const c = b.categoryId ? cats.get(b.categoryId) : null;
                return (
                  <button
                    key={b.id}
                    type="button"
                    data-flip={b.id}
                    data-leave={b.id}
                    data-ring
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(BLOCK_DRAG, b.id);
                      e.dataTransfer.effectAllowed = "move";
                      liftImage(e, e.currentTarget);
                      setDragging(b.id);
                    }}
                    onDragEnd={() => setDragging(null)}
                    onClick={() => onEdit(b)}
                    onContextMenu={(e) => onMenu(e, b)}
                    title={b.startTime ? `${shortTime(b.startTime)} ${b.title}` : b.title}
                    className={cx(
                      "flex h-7 min-w-0 cursor-grab items-center gap-1.5 rounded-md border border-transparent px-1.5 text-left text-[12.5px] leading-none transition-colors hover:bg-surface-2 active:cursor-grabbing",
                      free && "free-block",
                      !free && isUrgent(b, b.done) && "urgent-block",
                      dragging === b.id && "plan-drag-source",
                    )}
                  >
                    <span aria-hidden style={tone(dotTone(b, cats))} className={cx("chip-solid size-2 shrink-0 rounded-full", b.done && !free && "opacity-45")} />
                    {/* La hora, desde que la columna da para hora y título (antes queda en el cartelito). */}
                    {b.startTime && <span className="shrink-0 font-mono text-[11.5px] text-muted tabular max-xl:sr-only">{shortTime(b.startTime)}</span>}
                    <span className={cx("min-w-0 truncate font-medium", free && "font-normal", b.done && !free && "font-normal text-muted line-through decoration-faint")}>{b.title}</span>
                    {c && <span className="sr-only">, {c.name}</span>}
                    {b.done && !free && <span className="sr-only">, hecho</span>}
                  </button>
                );
              })}
              {more > 0 && (
                <button
                  type="button"
                  onClick={() => onOpenDay(d)}
                  className="flex h-6 items-center rounded-md px-1.5 text-left text-[12px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg"
                >
                  +{more} más
                </button>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Celular: la grilla del mes chica, con un puntito del color de la categoría por
 * bloque. Tocar un día lo elige (la lista del día va debajo).
 */
export function MonthMini({
  month,
  days,
  today,
  byDay,
  cats,
  selected,
  onPick,
  className,
  ...rest
}: Props & {
  selected: string;
  onPick: (d: string) => void;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cx("border-b border-line pb-3", className)}>
      <div className="grid grid-cols-7 pb-1" aria-hidden>
        {HEAD_INITIAL.map((h, i) => (
          <span key={i} className="text-center font-mono text-[10px] font-medium tracking-[0.08em] text-muted uppercase">
            {h}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-[repeat(7,minmax(0,1fr))] gap-y-0.5">
        {days.map((d) => {
          const list = byDay.get(d) ?? [];
          const active = d === selected;
          const outside = d.slice(0, 7) !== month;
          const work = list.filter((b) => !isFreeBlock(b)).length;
          return (
            <button
              key={d}
              type="button"
              onClick={() => onPick(d)}
              aria-pressed={active}
              aria-label={`${d === today ? "Hoy, " : ""}${dayLabel(d)}${work ? `, ${work} ${work === 1 ? "bloque" : "bloques"}` : ""}`}
              className={cx(
                "tap-tint relative mx-auto flex min-h-[3.25rem] w-full max-w-12 flex-col items-center justify-start gap-1 rounded-[10px] pt-1.5 transition-colors",
                active ? "bg-ink text-on-ink" : outside ? "text-muted" : "text-fg",
              )}
            >
              <span className={cx("figure text-[16px] leading-none", d === today && !active && "text-accent-fg")}>{Number(d.slice(8))}</span>
              <span className="flex h-1.5 items-center gap-[2px]" aria-hidden>
                {list.slice(0, DOTS_MAX).map((b) => (
                  <span key={b.id} style={tone(dotTone(b, cats))} className={cx("chip-solid size-1.5 rounded-full", b.done && !isFreeBlock(b) && "opacity-40", active && "ring-1 ring-on-ink/70")} />
                ))}
                {list.length > DOTS_MAX && <span className={cx("text-[9px] leading-none font-semibold", active ? "text-on-ink" : "text-muted")}>+</span>}
              </span>
              {d === today && !active && <span className="absolute inset-x-3 top-0 h-[2px] rounded-b-full bg-accent" aria-hidden />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
