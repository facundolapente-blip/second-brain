"use client";

import { useEffect, useState } from "react";
import { CaretDown, Check, Plus } from "@phosphor-icons/react";
import { weekday } from "@/lib/dates";
import { HOURS_TODO_FOLD_COOKIE, isFreeBlock, sortKeyAt, WEEKDAY_LONG, type BlockDTO, type CategoryDTO } from "@/lib/plan-logic";
import { PRIORITIES, PriorityDots } from "./plan-ui";
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
  onMove: (id: string, date: string, startTime?: string | null, sortKey?: number) => void;
};

const DRAG = "text/x-bloque";

/** Escritorio, vista lista: 7 columnas; los bloques se arrastran de un día a otro. */
/**
 * Lugar donde caería lo arrastrado: antes de la tarjeta cuyo centro queda por
 * debajo del puntero (las tarjetas llevan `data-bloque`).
 */
function dropIndex(section: HTMLElement, y: number, skip: string | null): number {
  const cards = [...section.querySelectorAll<HTMLElement>("[data-bloque]")].filter((c) => c.dataset.bloque !== skip);
  const i = cards.findIndex((c) => {
    const r = c.getBoundingClientRect();
    return y < r.top + r.height / 2;
  });
  return i === -1 ? cards.length : i;
}

export function BoardList({ days, today, byDay, cats, onToggle, onEdit, onNew, onMove }: Props) {
  const [over, setOver] = useState<string | null>(null);
  // Lo que se arrastra (durante el arrastre el navegador no deja leer los datos) y dónde caería.
  const [dragging, setDragging] = useState<BlockDTO | null>(null);
  const [slot, setSlot] = useState<{ day: string; index: number } | null>(null);
  const untimed = dragging !== null && !dragging.startTime;
  // Al soltar en otra columna la tarjeta se vuelve a dibujar ahí y el "dragend" le
  // llega a la vieja (que ya no está): sin esto la nueva quedaba transparente.
  useEffect(() => {
    const clear = () => {
      setDragging(null);
      setSlot(null);
      setOver(null);
    };
    window.addEventListener("dragend", clear);
    window.addEventListener("drop", clear);
    return () => {
      window.removeEventListener("dragend", clear);
      window.removeEventListener("drop", clear);
    };
  }, []);
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
              // Un bloque sin hora se puede dejar en cualquier lugar de la columna.
              if (untimed) {
                const index = dropIndex(e.currentTarget, e.clientY, dragging.id);
                setSlot((s) => (s?.day === d && s.index === index ? s : { day: d, index }));
              }
            }}
            onDragLeave={(e) => {
              if (e.currentTarget.contains(e.relatedTarget as Node)) return;
              setOver((o) => (o === d ? null : o));
              setSlot((s) => (s?.day === d ? null : s));
            }}
            onDrop={(e) => {
              const id = e.dataTransfer.getData(DRAG);
              setOver(null);
              setSlot(null);
              setDragging(null);
              if (!id) return;
              if (untimed && dragging.id === id) {
                const rest = list.filter((b) => b.id !== id);
                onMove(id, d, undefined, sortKeyAt(rest, dropIndex(e.currentTarget, e.clientY, id)));
              } else onMove(id, d);
            }}
            className={cx(
              "grid min-h-[60dvh] min-w-0 content-start gap-2 border-r border-line px-2.5 pb-6 transition-colors last:border-r-0",
              // Hoy: columna teñida del acento y una franja arriba.
              d === today && "rounded-t-lg bg-[color-mix(in_oklab,var(--accent)_13%,transparent)] shadow-[inset_0_3px_0_var(--accent)]",
              over === d && "bg-[color-mix(in_oklab,var(--accent)_18%,transparent)]",
            )}
          >
            <header className="flex items-end justify-between gap-1.5 border-b border-line px-1 pt-3 pb-2.5">
              <span className="grid justify-items-start gap-0.5">
                <span className={cx("kicker", d === today && "text-accent-fg!")}>{d === today ? `Hoy · ${WEEKDAY_LONG[weekday(d)]}` : WEEKDAY_LONG[weekday(d)]}</span>
                <span
                  className={cx(
                    "figure text-[30px]",
                    d === today && "-ml-1 rounded-lg bg-accent px-1.5 text-on-accent",
                  )}
                >
                  {Number(d.slice(8))}
                </span>
              </span>
              <span className="pb-1 font-mono text-[11px] text-faint tabular">{list.length || ""}</span>
            </header>
            {list.map((b) => {
              const others = list.filter((x) => x.id !== dragging?.id);
              const i = others.findIndex((x) => x.id === b.id);
              const lineBefore = slot?.day === d && i !== -1 && slot.index === i;
              const lineAfter = slot?.day === d && i !== -1 && i === others.length - 1 && slot.index === others.length;
              return (
              <div
                key={b.id}
                data-bloque={b.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(DRAG, b.id);
                  e.dataTransfer.effectAllowed = "move";
                  setDragging(b);
                }}
                onDragEnd={() => {
                  setDragging(null);
                  setSlot(null);
                  setOver(null);
                }}
                className={cx(
                  "relative cursor-grab active:cursor-grabbing",
                  dragging?.id === b.id && "opacity-40",
                  // Línea donde va a caer el bloque.
                  lineBefore && "before:absolute before:inset-x-0 before:-top-[5px] before:h-0.5 before:rounded-full before:bg-accent",
                  lineAfter && "after:absolute after:inset-x-0 after:-bottom-[5px] after:h-0.5 after:rounded-full after:bg-accent",
                )}
                title={b.startTime ? "Arrastralo a otro día" : "Arrastralo a otro día o a otro lugar de la columna"}
              >
                <BlockCard
                  block={b}
                  compact
                  category={b.categoryId ? cats.get(b.categoryId) : null}
                  onToggle={() => onToggle(b)}
                  onEdit={() => onEdit(b)}
                />
              </div>
              );
            })}
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
export function BoardHours({ days, today, byDay, cats, onToggle, onEdit, onNew, onMove, todoFolded = false }: Props & { todoFolded?: boolean }) {
  const [over, setOver] = useState<string | null>(null);
  // Los bloques sin hora son pendientes del día: lista corta arriba que se pliega (cookie: se recuerda entre visitas).
  const [folded, setFolded] = useState(todoFolded);
  function toggleFold() {
    const next = !folded;
    setFolded(next);
    document.cookie = `${HOURS_TODO_FOLD_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  }
  const hours = Array.from({ length: TO - FROM }, (_, i) => FROM + i);
  const cols = `3.5rem repeat(${days.length}, minmax(${days.length > 1 ? "9.5rem" : "0"}, 1fr))`;
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      {/* Un solo contenedor con scroll (vertical y horizontal): la cabecera queda fija
          arriba y las columnas de días coinciden siempre con las de la grilla. */}
      <div className="max-h-[75dvh] overflow-auto">
      {/* Con un solo día (celular) la grilla usa todo el ancho; con 7, cada día tiene un mínimo. */}
      <div className={days.length > 1 ? "min-w-[70rem]" : undefined}>
      {/* Cabecera de días y los pendientes sin hora */}
      <div className="sticky top-0 z-10 grid border-b border-line bg-surface" style={{ gridTemplateColumns: cols }}>
        <button
          type="button"
          onClick={toggleFold}
          aria-expanded={!folded}
          title={folded ? "Mostrar los pendientes sin hora" : "Plegar los pendientes sin hora"}
          className="flex items-start justify-center pt-2.5 text-muted hover:text-fg"
        >
          <CaretDown size={14} weight="bold" aria-hidden className={cx("transition-transform duration-200", folded && "-rotate-90")} />
          <span className="sr-only">{folded ? "Mostrar pendientes" : "Plegar pendientes"}</span>
        </button>
        {days.map((d) => {
          // Pendientes del día: primero los que faltan, después los hechos.
          const untimed = byDay.get(d)!.filter((b) => !b.startTime);
          const todo = [...untimed.filter((b) => !b.done), ...untimed.filter((b) => b.done)];
          const left = untimed.filter((b) => !b.done && !isFreeBlock(b)).length;
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
                "grid content-start gap-0.5 border-l border-line p-1.5",
                d === today && "bg-[color-mix(in_oklab,var(--accent)_5%,transparent)]",
                over === `${d}|` && "bg-[color-mix(in_oklab,var(--accent)_14%,transparent)]",
              )}
            >
              <button type="button" onClick={toggleFold} className="flex items-baseline gap-1.5 px-1 text-left">
                <span className={cx("text-[12px] font-medium", d === today ? "text-accent-fg" : "text-muted")}>
                  {WEEKDAY_LONG[weekday(d)].slice(0, 3)} {Number(d.slice(8))}
                </span>
                {untimed.length > 0 && (
                  <span className="text-[11.5px] text-muted tabular">
                    · {left === 0 ? "pendientes hechos" : left === 1 ? "1 para hacer" : `${left} para hacer`}
                  </span>
                )}
              </button>
              {!folded && todo.length > 0 && (
                <ul className="grid">
                  {todo.map((b) => (
                    <TodoRow key={b.id} b={b} cats={cats} onEdit={onEdit} onToggle={onToggle} />
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      {/* Grilla de horas */}
      <div>
        <div className="relative grid" style={{ gridTemplateColumns: cols }}>
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

/**
 * Un pendiente sin hora en la vista por horas: una línea con casilla, punto del
 * color de la categoría y título (como una lista de cosas para hacer). Se puede
 * arrastrar a una hora para agendarlo.
 */
function TodoRow({
  b,
  cats,
  onEdit,
  onToggle,
}: {
  b: BlockDTO;
  cats: Map<string, CategoryDTO>;
  onEdit: (b: BlockDTO) => void;
  onToggle: (b: BlockDTO) => void;
}) {
  const c = b.categoryId ? cats.get(b.categoryId) : null;
  const free = isFreeBlock(b);
  return (
    <li
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG, b.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className="flex min-h-9 items-center gap-1.5 rounded-md pr-1 hover:bg-surface-2"
      title="Arrastralo a una hora para agendarlo"
    >
      {free ? (
        <span className="w-8 shrink-0" />
      ) : (
        <button
          type="button"
          onClick={() => onToggle(b)}
          aria-pressed={b.done}
          aria-label={b.done ? `${b.title}: hecho. Desmarcar` : `Marcar ${b.title} como hecho`}
          className="inline-flex size-8 shrink-0 items-center justify-center"
        >
          <span
            className={cx(
              "inline-flex size-[18px] items-center justify-center rounded-[4px] border-[1.5px] transition-colors",
              b.done ? "border-[var(--st-done-line)] bg-[var(--st-done-line)] text-on-accent" : "border-fg/45",
            )}
          >
            {b.done && <Check size={12} weight="bold" />}
          </span>
        </button>
      )}
      <button type="button" onClick={() => onEdit(b)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
        {c && <span aria-hidden style={tone(c.color)} className="chip-solid size-2 shrink-0 rounded-full" />}
        <span className={cx("truncate text-[13.5px]", (b.done || free) && "text-muted", b.done && "line-through decoration-faint")}>{b.title}</span>
        {c && <span className="sr-only">, {c.name}</span>}
      </button>
    </li>
  );
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
              <span role="img" aria-label={`Prioridad ${priority.label.toLowerCase()}`} title={`Prioridad ${priority.label.toLowerCase()}`} className="inline-flex">
                <PriorityDots n={priority.value} size={6} mono />
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
