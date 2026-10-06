"use client";

import { useState } from "react";
import { Check, Plus } from "@phosphor-icons/react";
import { weekday } from "@/lib/dates";
import { isFreeBlock, WEEKDAY_LONG, type BlockDTO, type CategoryDTO } from "@/lib/plan-logic";
import { PRIORITIES } from "./plan-ui";
import { tone } from "@/lib/palette";
import { cx } from "@/components/ui";
import { BlockCard } from "./week-view";

type Props = {
  days: string[];
  today: string;
  byDay: Map<string, BlockDTO[]>;
  cats: Map<string, CategoryDTO>;
  onToggle: (b: BlockDTO) => void;
  onEdit: (b: BlockDTO) => void;
  onNew: (date: string, startTime?: string) => void;
  onMove: (id: string, date: string, startTime?: string | null) => void;
};

const DRAG = "text/x-bloque";

/** Escritorio, vista lista: 7 columnas; los bloques se arrastran de un día a otro. */
export function BoardList({ days, today, byDay, cats, onToggle, onEdit, onNew, onMove }: Props) {
  const [over, setOver] = useState<string | null>(null);
  return (
    // Cada día con un ancho mínimo cómodo: si no entran los 7, se corre de costado.
    <div className="overflow-x-auto pb-2">
    <div className="grid min-w-[73.5rem] grid-cols-[repeat(7,minmax(10.5rem,1fr))] border-t border-fg/80">
      {days.map((d) => {
        const list = byDay.get(d)!;
        return (
          <section
            key={d}
            aria-label={WEEKDAY_LONG[weekday(d)]}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes(DRAG)) return;
              e.preventDefault();
              setOver(d);
            }}
            onDragLeave={() => setOver((o) => (o === d ? null : o))}
            onDrop={(e) => {
              const id = e.dataTransfer.getData(DRAG);
              setOver(null);
              if (id) onMove(id, d);
            }}
            className={cx(
              "grid min-h-[60dvh] min-w-0 content-start border-r border-line px-2.5 pb-6 transition-colors first:pl-0 last:border-r-0 last:pr-0",
              d === today && "bg-[color-mix(in_oklab,var(--accent)_4%,transparent)]",
              over === d && "bg-[color-mix(in_oklab,var(--accent)_12%,transparent)]",
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
              <div
                key={b.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(DRAG, b.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                className="cursor-grab active:cursor-grabbing"
                title="Arrastralo a otro día"
              >
                <BlockCard
                  block={b}
                  compact
                  category={b.categoryId ? cats.get(b.categoryId) : null}
                  onToggle={() => onToggle(b)}
                  onEdit={() => onEdit(b)}
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() => onNew(d)}
              className="mt-1 flex h-11 items-center gap-1.5 rounded-[4px] px-1 text-[13px] text-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              <Plus size={14} /> Nuevo
            </button>
          </section>
        );
      })}
    </div>
    </div>
  );
}

const FROM = 6;
const TO = 24;
const ROW = 60; // px por hora
const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/**
 * Escritorio, vista por horas: como un calendario. Arriba lo que no tiene
 * hora; tocar un hueco crea un bloque a esa hora; arrastrar mueve día y hora.
 */
export function BoardHours({ days, today, byDay, cats, onToggle, onEdit, onNew, onMove }: Props) {
  const [over, setOver] = useState<string | null>(null);
  const hours = Array.from({ length: TO - FROM }, (_, i) => FROM + i);
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      {/* Un solo contenedor con scroll (vertical y horizontal): la cabecera queda fija
          arriba y las columnas de días coinciden siempre con las de la grilla. */}
      <div className="max-h-[75dvh] overflow-auto">
      <div className="min-w-[70rem]">
      {/* Cabecera de días y lo que no tiene hora */}
      <div className="sticky top-0 z-10 grid grid-cols-[3.5rem_repeat(7,minmax(9.5rem,1fr))] border-b border-line bg-surface">
        <span />
        {days.map((d) => {
          const untimed = byDay.get(d)!.filter((b) => !b.startTime);
          return (
            <div
              key={d}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes(DRAG)) return;
                e.preventDefault();
                setOver(`${d}|`);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                const id = e.dataTransfer.getData(DRAG);
                setOver(null);
                if (id) onMove(id, d, null);
              }}
              className={cx(
                "grid min-h-16 content-start gap-1 border-l border-line p-1.5",
                d === today && "bg-[color-mix(in_oklab,var(--accent)_5%,transparent)]",
                over === `${d}|` && "bg-[color-mix(in_oklab,var(--accent)_14%,transparent)]",
              )}
            >
              <span className={cx("px-1 text-[12px] font-medium", d === today ? "text-accent-fg" : "text-muted")}>
                {WEEKDAY_LONG[weekday(d)].slice(0, 3)} {Number(d.slice(8))}
              </span>
              {untimed.map((b) => (
                <Chip key={b.id} b={b} cats={cats} onEdit={onEdit} onToggle={onToggle} />
              ))}
            </div>
          );
        })}
      </div>
      {/* Grilla de horas */}
      <div>
        <div className="relative grid grid-cols-[3.5rem_repeat(7,minmax(9.5rem,1fr))]">
          <div>
            {hours.map((h) => (
              <div key={h} style={{ height: ROW }} className="pr-2 text-right font-mono text-[10.5px] text-muted">
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
          </div>
          {days.map((d) => (
            <div key={d} className={cx("relative border-l border-line", d === today && "bg-[color-mix(in_oklab,var(--accent)_3%,transparent)]")}>
              {hours.map((h) => {
                const slot = `${d}|${h}`;
                const time = `${String(h).padStart(2, "0")}:00`;
                return (
                  <button
                    key={h}
                    type="button"
                    aria-label={`Nuevo bloque ${WEEKDAY_LONG[weekday(d)]} a las ${time}`}
                    onClick={() => onNew(d, time)}
                    onDragOver={(e) => {
                      if (!e.dataTransfer.types.includes(DRAG)) return;
                      e.preventDefault();
                      setOver(slot);
                    }}
                    onDragLeave={() => setOver((o) => (o === slot ? null : o))}
                    onDrop={(e) => {
                      const id = e.dataTransfer.getData(DRAG);
                      setOver(null);
                      if (id) onMove(id, d, time);
                    }}
                    style={{ height: ROW }}
                    className={cx(
                      "block w-full border-t border-line/60 transition-colors hover:bg-surface-2",
                      over === slot && "bg-[color-mix(in_oklab,var(--accent)_16%,transparent)]",
                    )}
                  />
                );
              })}
              {lanesOf(byDay.get(d)!.filter((b) => b.startTime)).map(({ b, start, end, lane, lanes }) => {
                  const top = ((start - FROM * 60) / 60) * ROW;
                  const height = Math.max(22, ((end - start) / 60) * ROW - 2);
                  return (
                    <div
                      key={b.id}
                      className="absolute"
                      style={{ top, height, left: `calc(${(lane / lanes) * 100}% + 3px)`, width: `calc(${100 / lanes}% - 6px)` }}
                    >
                      <Chip b={b} cats={cats} onEdit={onEdit} onToggle={onToggle} full />
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
      </div>
      </div>
    </div>
  );
}

/**
 * Bloques que se pisan en el horario van lado a lado (como en un calendario):
 * cada grupo de bloques encadenados se reparte en carriles.
 */
function lanesOf(blocks: BlockDTO[]) {
  const items = blocks
    .map((b) => {
      const start = Math.max(FROM * 60, mins(b.startTime!));
      return { b, start, end: Math.max(start + 30, b.endTime ? mins(b.endTime) : start + 60), lane: 0, lanes: 1 };
    })
    .sort((x, y) => x.start - y.start || y.end - x.end);
  let group: typeof items = [];
  let groupEnd = -1;
  let laneEnds: number[] = [];
  const close = () => {
    for (const it of group) it.lanes = laneEnds.length;
    group = [];
    laneEnds = [];
  };
  for (const it of items) {
    if (it.start >= groupEnd) close();
    let lane = laneEnds.findIndex((e) => e <= it.start);
    if (lane < 0) lane = laneEnds.push(0) - 1;
    laneEnds[lane] = it.end;
    it.lane = lane;
    group.push(it);
    groupEnd = Math.max(groupEnd, it.end);
  }
  close();
  return items;
}

function Chip({
  b,
  cats,
  onEdit,
  onToggle,
  full,
}: {
  b: BlockDTO;
  cats: Map<string, CategoryDTO>;
  onEdit: (b: BlockDTO) => void;
  onToggle: (b: BlockDTO) => void;
  full?: boolean;
}) {
  const c = b.categoryId ? cats.get(b.categoryId) : null;
  const priority = PRIORITIES.find((p) => p.value === b.priority);
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG, b.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      style={tone(c?.color ?? "stone")}
      className={cx(
        "group flex cursor-grab items-start gap-1 overflow-hidden rounded-lg bg-tone px-1.5 py-1 text-tone-fg active:cursor-grabbing",
        full && "h-full",
        isFreeBlock(b) && "opacity-60",
        b.done && "opacity-60",
      )}
      title="Arrastralo a otro día u hora"
    >
      <button type="button" onClick={() => onEdit(b)} className="grid min-w-0 flex-1 content-start gap-0.5 text-left">
        <span className={cx("block truncate text-[13px] leading-tight font-semibold", b.done && "line-through")}>{b.title}</span>
        {(c || priority) && (
          <span className="flex min-w-0 flex-wrap items-center gap-1 text-[10.5px] leading-tight">
            {c && <span className="truncate font-medium">{c.name}</span>}
            {priority && (
              <span style={tone(priority.tone)} className="rounded-[4px] bg-tone-solid px-1 py-px font-medium text-white">
                {priority.label}
              </span>
            )}
          </span>
        )}
        {full && b.startTime && (
          <span className="block font-mono text-[10px] opacity-75">
            {b.startTime}
            {b.endTime ? `–${b.endTime}` : ""}
          </span>
        )}
      </button>
      {!isFreeBlock(b) && (
        <button
          type="button"
          onClick={() => onToggle(b)}
          aria-label={b.done ? "Marcar como no hecho" : "Marcar como hecho"}
          className={cx(
            "inline-flex size-4 shrink-0 items-center justify-center rounded-full border",
            b.done ? "border-current bg-current" : "border-current/60",
          )}
        >
          {b.done && <Check size={9} weight="bold" className="text-surface" />}
        </button>
      )}
    </div>
  );
}
