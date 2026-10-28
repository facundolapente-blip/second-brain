"use client";

import { useNewIds } from "@/components/motion";
import { haptic } from "@/components/haptics";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CaretDown, Check, Plus } from "@phosphor-icons/react";
import { weekday } from "@/lib/dates";
import { HOURS_TODO_FOLD_COOKIE, hoursScrollTarget, isBlockNow, isFreeBlock, isUrgent, minutesNow, placeAt, WEEKDAY_LONG, type BlockDTO, type CategoryDTO, type SortKeyPatch, TASK_DRAG } from "@/lib/plan-logic";
import { PRIORITIES, PriorityDots } from "./plan-ui";
import { tone } from "@/lib/palette";
import { cx } from "@/components/ui";
import { BlockCard } from "./week-view";
import { land, liftImage, useLandedKeys } from "./drag-motion";

type Props = {
  days: string[];
  today: string;
  /** Minuto del día ahora (-1 mientras no se sabe): línea de "ahora" y bloque que está pasando. */
  now: number;
  byDay: Map<string, BlockDTO[]>;
  cats: Map<string, CategoryDTO>;
  onToggle: (b: BlockDTO) => void;
  onEdit: (b: BlockDTO) => void;
  onNew: (date: string, startTime?: string) => void;
  onMove: (id: string, date: string, startTime?: string | null, sortKey?: number, others?: SortKeyPatch[]) => void;
  /** Clic derecho en un bloque (duplicar, cambiar nombre...). */
  onMenu?: (e: React.MouseEvent, b: BlockDTO) => void;
  /** Soltar una tarea de la tabla en un día (o una hora): la agenda. `at`: dónde se soltó (de ahí sale el viaje). */
  onDropTask?: (taskId: string, date: string, startTime: string | null, sortKey?: number, others?: SortKeyPatch[], at?: { clientX: number; clientY: number }) => void;
};
const accepts = (e: React.DragEvent) => e.dataTransfer.types.includes(DRAG) || e.dataTransfer.types.includes(TASK_DRAG);

const DRAG = "text/x-bloque";

/**
 * Mientras se arrastra algo que puede caer en la semana (un bloque o una tarea, desde
 * cualquier lado de la página), las zonas que lo reciben se marcan (`.plan-drop`).
 */
function useDragActive() {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const start = (e: DragEvent) => {
      const types = e.dataTransfer?.types ?? [];
      if (types.includes(DRAG) || types.includes(TASK_DRAG)) setActive(true);
    };
    const stop = () => setActive(false);
    window.addEventListener("dragstart", start);
    window.addEventListener("dragend", stop);
    window.addEventListener("drop", stop);
    return () => {
      window.removeEventListener("dragstart", start);
      window.removeEventListener("dragend", stop);
      window.removeEventListener("drop", stop);
    };
  }, []);
  return active;
}

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

/** Escritorio, vista lista: 7 columnas; los bloques se arrastran de un día a otro. */
export function BoardList({ days, today, now, byDay, cats, onToggle, onEdit, onNew, onMove, onMenu, onDropTask }: Props) {
  // Un bloque recién creado, movido a otra columna o restaurado entra con un fundido (no al
  // cargar). El que llega arrastrado no: viaja desde donde se soltó (`land`).
  const fresh = useNewIds(days.flatMap((d) => byDay.get(d)!.map((b) => `${d}:${b.id}`)));
  const flown = useLandedKeys(fresh, (k) => k.split(":")[1]);
  const [over, setOver] = useState<string | null>(null);
  // Lo que se arrastra (durante el arrastre el navegador no deja leer los datos) y dónde caería.
  const [dragging, setDragging] = useState<BlockDTO | null>(null);
  const [slot, setSlot] = useState<{ day: string; index: number } | null>(null);
  const untimed = dragging !== null && !dragging.startTime;
  const dragActive = useDragActive();
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
    // Cada día con un ancho mínimo cómodo (entran los 7 desde ~1280 px); si no, se corre de costado.
    <div className="overflow-x-auto pb-2">
      <div className="grid min-w-[57.75rem] grid-cols-[repeat(7,minmax(8.25rem,1fr))] border-t border-fg/80">
        {days.map((d) => {
          const list = byDay.get(d)!;
          return (
            <section
              key={d}
              aria-label={WEEKDAY_LONG[weekday(d)]}
              onDragOver={(e) => {
                if (!accepts(e)) return;
                e.preventDefault();
                // Cruzar a otro día: un pulso corto (en el celular; en la compu no hace nada).
                if (over !== d) haptic("threshold");
                setOver(d);
                // Un bloque sin hora (o una tarea) se puede dejar en cualquier lugar de la columna.
                if (untimed || e.dataTransfer.types.includes(TASK_DRAG)) {
                  const index = dropIndex(e.currentTarget, e.clientY, dragging?.id ?? null);
                  setSlot((s) => (s?.day === d && s.index === index ? s : { day: d, index }));
                }
              }}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                setOver((o) => (o === d ? null : o));
                setSlot((s) => (s?.day === d ? null : s));
              }}
              onDrop={(e) => {
                const taskId = e.dataTransfer.getData(TASK_DRAG);
                if (taskId) {
                  setOver(null);
                  setSlot(null);
                  const p = placeAt(list, dropIndex(e.currentTarget, e.clientY, null));
                  onDropTask?.(taskId, d, null, p.key, p.others, { clientX: e.clientX, clientY: e.clientY });
                  return;
                }
                const id = e.dataTransfer.getData(DRAG);
                setOver(null);
                setSlot(null);
                setDragging(null);
                if (!id) return;
                haptic("success");
                // La tarjeta viaja corto desde donde se soltó hasta su lugar.
                land(id, e);
                if (untimed && dragging.id === id) {
                  const rest = list.filter((b) => b.id !== id);
                  const p = placeAt(rest, dropIndex(e.currentTarget, e.clientY, id));
                  onMove(id, d, undefined, p.key, p.others);
                } else onMove(id, d);
              }}
              data-drop={over === d ? "over" : dragActive ? "ready" : undefined}
              className={cx(
                "plan-drop grid min-h-[60dvh] min-w-0 content-start gap-2 border-r border-line px-2.5 pb-6 transition-colors last:border-r-0",
                // Hoy: columna teñida del acento y una franja arriba.
                d === today && "rounded-t-lg bg-[color-mix(in_oklab,var(--accent)_13%,transparent)] shadow-[inset_0_3px_0_var(--accent)]",
                over === d && "bg-[color-mix(in_oklab,var(--accent)_18%,transparent)]",
              )}
            >
              <header className="flex items-end justify-between gap-1.5 border-b border-line px-1 pt-3 pb-2.5">
                <span className="grid justify-items-start gap-0.5">
                  <span className={cx("kicker", d === today && "text-accent-fg!")}>{d === today ? `Hoy · ${WEEKDAY_LONG[weekday(d)]}` : WEEKDAY_LONG[weekday(d)]}</span>
                  <span className={cx("figure text-[30px]", d === today && "-ml-1 rounded-lg bg-accent px-1.5 text-on-accent")}>{Number(d.slice(8))}</span>
                </span>
                <span className="pb-1 font-mono text-[11px] text-muted tabular">{list.filter((b) => !isFreeBlock(b)).length || ""}</span>
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
                    data-flip={b.id}
                    onContextMenu={(e) => onMenu?.(e, b)}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(DRAG, b.id);
                      e.dataTransfer.effectAllowed = "move";
                      // Lo que sigue al mouse: la tarjeta levantada (sombra y un poco más grande).
                      liftImage(e, e.currentTarget.querySelector<HTMLElement>("[data-ring]") ?? e.currentTarget);
                      setDragging(b);
                    }}
                    onDragEnd={() => {
                      setDragging(null);
                      setSlot(null);
                      setOver(null);
                    }}
                    className={cx(
                      "relative cursor-grab active:cursor-grabbing",
                      fresh.has(`${d}:${b.id}`) && !flown.has(`${d}:${b.id}`) && "reveal",
                      dragging?.id === b.id && "plan-drag-source",
                      // Línea donde va a caer el bloque (aparece abriéndose desde el centro).
                      lineBefore && "plan-slot-before before:absolute before:inset-x-0 before:-top-[5px] before:h-0.5 before:rounded-full before:bg-accent",
                      lineAfter && "plan-slot-after after:absolute after:inset-x-0 after:-bottom-[5px] after:h-0.5 after:rounded-full after:bg-accent",
                    )}
                    title={b.startTime ? "Arrastralo a otro día" : "Arrastralo a otro día o a otro lugar de la columna"}
                  >
                    <BlockCard
                      block={b}
                      compact
                      live={isBlockNow(b, today, now)}
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
const SNAP = 15; // al soltar, la hora se redondea a cuartos de hora
const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Lo que se arrastra en la vista por horas: cuánto dura (min) y a qué altura de la tarjeta se agarró (px). */
type HourDrag = { dur: number; offset: number };

/** Cuántas veces se abrió Por horas tocando el selector (en el celular, solo entonces se lleva la página a la hora). */
let scrolledFor = 0;

/**
 * Vista por horas: como un calendario. Arriba lo que no tiene hora; tocar un hueco
 * crea un bloque a esa hora; arrastrar mueve día y hora. Abre en la hora de ahora
 * (una antes) y la columna de hoy tiene la línea de "ahora".
 *
 * En la compu la grilla es una caja con su propio scroll (la cabecera de días queda
 * fija arriba); en el celular usa el scroll de la página y la cabecera del día queda
 * pegada debajo del encabezado (dos scrolls se peleaban).
 */
export function BoardHours({
  days,
  today,
  now,
  byDay,
  cats,
  onToggle,
  onEdit,
  onNew,
  onMove,
  onMenu,
  onDropTask,
  todoFolded = false,
  openSeq = 0,
}: Props & { todoFolded?: boolean; /** Sube cada vez que se elige Por horas en el selector (celular: lleva la página a la hora). */ openSeq?: number }) {
  const fresh = useNewIds(days.flatMap((d) => byDay.get(d)!.map((b) => `${d}:${b.id}:${b.startTime ?? ""}`)));
  const flown = useLandedKeys(fresh, (k) => k.split(":")[1]);
  const [over, setOver] = useState<string | null>(null);
  // Dónde caería lo arrastrado en la grilla (día y minuto de inicio, ya redondeado).
  const [drop, setDrop] = useState<{ day: string; min: number; dur: number } | null>(null);
  // Lo que se arrastra (el navegador no deja leer los datos durante el arrastre).
  const grab = useRef<HourDrag | null>(null);
  const dragActive = useDragActive();
  useEffect(() => {
    const clear = () => {
      grab.current = null;
      setDrop(null);
    };
    window.addEventListener("dragend", clear);
    window.addEventListener("drop", clear);
    return () => {
      window.removeEventListener("dragend", clear);
      window.removeEventListener("drop", clear);
    };
  }, []);
  const onGrab = (offset: number, dur: number) => {
    grab.current = { offset, dur };
  };
  // Los bloques sin hora son pendientes del día: lista corta arriba que se pliega (cookie: se recuerda entre visitas).
  const [folded, setFolded] = useState(todoFolded);
  function toggleFold() {
    const next = !folded;
    setFolded(next);
    document.cookie = `${HOURS_TODO_FOLD_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  }
  // La grilla arranca a las 6, o antes si algún bloque de estos días empieza más temprano (los "Libre" no cuentan).
  const timed = days.flatMap((d) => byDay.get(d)!.filter((b) => b.startTime && !isFreeBlock(b)));
  const from = Math.min(FROM, ...timed.map((b) => Math.floor(mins(b.startTime!) / 60)));
  const hours = Array.from({ length: TO - from }, (_, i) => from + i);

  // Al abrir: la grilla en una hora antes de ahora (o en el primer bloque, si es más temprano).
  // Sin animación (es al cargar). En la compu se mueve la caja; en el celular, la página,
  // y solo cuando se eligió Por horas tocando el selector (al entrar al Plan arriba están las tareas).
  const box = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = box.current;
    const g = grid.current;
    if (!el || !g) return;
    const first = timed.length ? Math.min(...timed.map((b) => mins(b.startTime!))) : null;
    const target = hoursScrollTarget(minutesNow(), first, from);
    const offset = (target - from) * ROW;
    if (el.scrollHeight > el.clientHeight + 1) {
      el.scrollTop = offset;
    } else if (openSeq > scrolledFor) {
      scrolledFor = openSeq;
      const sticky = (head.current?.offsetHeight ?? 0) + (document.querySelector("header.sticky")?.getBoundingClientRect().height ?? 64);
      const y = g.getBoundingClientRect().top + window.scrollY + offset - sticky - 4;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: Math.max(0, y), behavior: reduce ? "auto" : "smooth" });
    }
    // Solo al montar (cambiar de día en el celular vuelve a montar la grilla).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Minuto de inicio según la altura del puntero en la columna: el borde de arriba
  // de la tarjeta arrastrada (no el puntero), redondeado a 15 minutos.
  const minuteAt = (e: React.DragEvent<HTMLElement>) => {
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top - (grab.current?.offset ?? 0);
    const m = from * 60 + Math.round((y / ROW) * (60 / SNAP)) * SNAP;
    return Math.max(from * 60, Math.min(TO * 60 - SNAP, m));
  };
  // Columnas que se achican hasta 7,5rem: entran los 7 días desde ~1280 px (como Lista).
  const cols = `3.5rem repeat(${days.length}, minmax(${days.length > 1 ? "7.5rem" : "0"}, 1fr))`;
  const nowTop = now >= from * 60 && now < TO * 60 ? ((now - from * 60) / 60) * ROW : null;
  return (
    // overflow-clip (no hidden) en el celular: así la cabecera pegada sigue a la página.
    <div className="rounded-2xl border border-line bg-surface max-lg:overflow-clip lg:overflow-hidden">
      {/* En la compu, un solo contenedor con scroll (vertical y horizontal): la cabecera
          queda fija arriba y las columnas de días coinciden siempre con las de la grilla. */}
      <div ref={box} className="lg:max-h-[75dvh] lg:overflow-auto">
        {/* Con un solo día (celular) la grilla usa todo el ancho; con 7, cada día tiene un mínimo. */}
        <div className={days.length > 1 ? "min-w-[56rem]" : undefined}>
          {/* Cabecera de días y los pendientes sin hora */}
          <div
            ref={head}
            className="sticky top-[calc(4rem+env(safe-area-inset-top))] z-10 grid rounded-t-2xl border-b border-line bg-surface lg:top-0 lg:rounded-none"
            style={{ gridTemplateColumns: cols }}
          >
            <button
              type="button"
              onClick={toggleFold}
              aria-expanded={!folded}
              title={folded ? "Mostrar los pendientes sin hora" : "Plegar los pendientes sin hora"}
              className="flex items-start justify-center pt-2.5 text-muted hover:text-fg"
            >
              <CaretDown size={14} weight="bold" aria-hidden className={cx("transition-transform duration-[var(--dur-state)] ease-[var(--ease-out)]", folded && "-rotate-90")} />
              <span className="sr-only">{folded ? "Mostrar pendientes" : "Plegar pendientes"}</span>
            </button>
            {days.map((d) => {
              // Pendientes del día: primero los que faltan, después los hechos. Un "Libre" sin hora
              // no es un pendiente: en Por horas no se muestra (pedido de Facu; en Lista sigue).
              const untimed = byDay.get(d)!.filter((b) => !b.startTime && !isFreeBlock(b));
              const todo = [...untimed.filter((b) => !b.done), ...untimed.filter((b) => b.done)];
              const left = untimed.filter((b) => !b.done).length;
              return (
                <div
                  key={d}
                  onDragOver={(e) => {
                    if (!accepts(e)) return;
                    e.preventDefault();
                    if (over !== `${d}|`) haptic("threshold");
                    setOver(`${d}|`);
                  }}
                  onDragLeave={() => setOver(null)}
                  data-drop={over === `${d}|` ? "over" : dragActive ? "ready" : undefined}
                  onDrop={(e) => {
                    setOver(null);
                    const taskId = e.dataTransfer.getData(TASK_DRAG);
                    if (taskId) return onDropTask?.(taskId, d, null, undefined, undefined, { clientX: e.clientX, clientY: e.clientY });
                    const id = e.dataTransfer.getData(DRAG);
                    if (!id) return;
                    haptic("success");
                    land(id, e);
                    onMove(id, d, null);
                  }}
                  className={cx(
                    // min-w-0: sin esto el título largo de un pendiente estira la celda y pisa el día de al lado.
                    "plan-drop grid min-w-0 content-start gap-0.5 border-l border-line p-1.5",
                    d === today && "bg-[color-mix(in_oklab,var(--accent)_5%,transparent)]",
                    over === `${d}|` && "bg-[color-mix(in_oklab,var(--accent)_14%,transparent)]",
                  )}
                >
                  <button type="button" onClick={toggleFold} className="flex items-baseline gap-1.5 px-1 text-left">
                    <span className={cx("text-[12px] font-medium", d === today ? "text-accent-fg" : "text-muted")}>
                      {WEEKDAY_LONG[weekday(d)].slice(0, 3)} {Number(d.slice(8))}
                    </span>
                    {untimed.length > 0 && (
                      <span className="text-[11.5px] text-muted tabular">· {left === 0 ? "pendientes hechos" : left === 1 ? "1 para hacer" : `${left} para hacer`}</span>
                    )}
                  </button>
                  {todo.length > 0 && (
                    <div className="fold" data-closed={folded || undefined}>
                      <ul className="grid min-w-0">
                        {todo.map((b) => (
                          <TodoRow key={b.id} b={b} cats={cats} onEdit={onEdit} onToggle={onToggle} onMenu={onMenu} onGrab={onGrab} />
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {/* Grilla de horas */}
          <div ref={grid} className="relative grid" style={{ gridTemplateColumns: cols }}>
            <div>
              {hours.map((h) => (
                <div key={h} style={{ height: ROW }} className="pr-2 text-right font-mono text-[10.5px] text-muted">
                  {String(h).padStart(2, "0")}:00
                </div>
              ))}
            </div>
            {days.map((d) => (
              // La columna entera recibe lo que se suelta (también encima de otro bloque o
              // del mismo que se arrastra): la hora sale de la altura, en cuartos de hora.
              <div
                key={d}
                onDragOver={(e) => {
                  if (!accepts(e)) return;
                  e.preventDefault();
                  const min = minuteAt(e);
                  const dur = grab.current?.dur ?? 60;
                  if (drop?.day !== d) haptic("threshold");
                  setDrop((o) => (o?.day === d && o.min === min && o.dur === dur ? o : { day: d, min, dur }));
                }}
                onDragLeave={(e) => {
                  if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                  setDrop((o) => (o?.day === d ? null : o));
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const time = hhmm(minuteAt(e));
                  setDrop(null);
                  const taskId = e.dataTransfer.getData(TASK_DRAG);
                  if (taskId) return onDropTask?.(taskId, d, time, undefined, undefined, { clientX: e.clientX, clientY: e.clientY });
                  const id = e.dataTransfer.getData(DRAG);
                  if (!id) return;
                  haptic("success");
                  land(id, e);
                  onMove(id, d, time);
                }}
                className={cx("relative border-l border-line", d === today && "bg-[color-mix(in_oklab,var(--accent)_3%,transparent)]")}
              >
                {hours.map((h) => {
                  const time = `${String(h).padStart(2, "0")}:00`;
                  return (
                    <button
                      key={h}
                      type="button"
                      aria-label={`Nuevo bloque ${WEEKDAY_LONG[weekday(d)]} a las ${time}`}
                      onClick={() => onNew(d, time)}
                      style={{ height: ROW }}
                      className="block w-full border-t border-line/60 transition-colors hover:bg-surface-2"
                    />
                  );
                })}
                {lanesOf(byDay.get(d)!.filter((b) => b.startTime), from).map(({ b, start, end, lane, lanes }) => {
                  const top = ((start - from * 60) / 60) * ROW;
                  const height = Math.max(22, ((end - start) / 60) * ROW - 2);
                  return (
                    <div
                      key={b.id}
                      data-leave={b.id}
                      data-flip={b.id}
                      className={cx("absolute z-[2]", fresh.has(`${d}:${b.id}:${b.startTime ?? ""}`) && !flown.has(`${d}:${b.id}:${b.startTime ?? ""}`) && "reveal")}
                      style={{ top, height, left: `calc(${(lane / lanes) * 100}% + 3px)`, width: `calc(${100 / lanes}% - 6px)` }}
                    >
                      <Chip b={b} cats={cats} onEdit={onEdit} onToggle={onToggle} onMenu={onMenu} onGrab={onGrab} dur={end - start} live={isBlockNow(b, today, now)} full />
                    </div>
                  );
                })}
                {/* Ahora: línea con un punto en la columna de hoy (se corre cada minuto). */}
                {d === today && nowTop !== null && (
                  <div aria-hidden className="pointer-events-none absolute inset-x-0 z-[3] h-0" style={{ top: nowTop }}>
                    <span className="absolute inset-x-0 -top-px h-[2px] bg-[var(--danger)]" />
                    <span className="absolute -top-[5px] -left-[5px] size-2.5 rounded-full bg-[var(--danger)] ring-2 ring-surface" />
                  </div>
                )}
                {/* Dónde va a quedar: el lugar con su hora (no recibe el puntero). Se corre de
                    cuarto de hora en cuarto de hora (translate) en vez de saltar. */}
                {drop?.day === d && (
                  <div
                    aria-hidden
                    className="plan-ghost pointer-events-none absolute inset-x-[3px] top-0 z-[4] rounded-lg border-2 border-dashed border-accent bg-[color-mix(in_oklab,var(--accent)_12%,transparent)] px-1.5 py-0.5"
                    style={{ translate: `0 ${((drop.min - from * 60) / 60) * ROW}px`, height: Math.max(22, (drop.dur / 60) * ROW - 2) }}
                  >
                    <span className="font-mono text-[11px] font-semibold text-accent-fg tabular">{hhmm(drop.min)}</span>
                  </div>
                )}
              </div>
            ))}
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
function lanesOf(blocks: BlockDTO[], from: number) {
  const items = blocks
    .map((b) => {
      const start = Math.max(from * 60, mins(b.startTime!));
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
  onMenu,
  onGrab,
}: {
  b: BlockDTO;
  cats: Map<string, CategoryDTO>;
  onEdit: (b: BlockDTO) => void;
  onToggle: (b: BlockDTO) => void;
  onMenu?: (e: React.MouseEvent, b: BlockDTO) => void;
  /** Al empezar a arrastrarlo: sin hora cae con su borde de arriba en el puntero y dura una hora. */
  onGrab?: (offset: number, dur: number) => void;
}) {
  const c = b.categoryId ? cats.get(b.categoryId) : null;
  const free = isFreeBlock(b);
  // La tilde aparece con un golpe corto, solo después de tocarla.
  const [tapped, setTapped] = useState(false);
  const [dragging, setDragging] = useState(false);
  return (
    <li
      data-leave={b.id}
      data-flip={b.id}
      data-ring
      onContextMenu={(e) => onMenu?.(e, b)}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG, b.id);
        e.dataTransfer.effectAllowed = "move";
        liftImage(e, e.currentTarget);
        onGrab?.(0, 60);
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      className={cx("tap-tint flex min-h-9 min-w-0 items-center gap-1.5 rounded-md pr-1 hover:bg-surface-2", !free && isUrgent(b, b.done) && "urgent-row", dragging && "plan-drag-source")}
      title="Arrastralo a una hora para agendarlo"
    >
      {free ? (
        <span className="w-8 shrink-0" />
      ) : (
        <button
          type="button"
          onClick={() => {
            haptic("tap");
            setTapped(true);
            onToggle(b);
          }}
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
            {b.done && <Check size={12} weight="bold" className={tapped ? "mark-pop" : undefined} />}
          </span>
        </button>
      )}
      <button type="button" onClick={() => onEdit(b)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
        {c && <span aria-hidden style={tone(c.color)} className="chip-solid size-2 shrink-0 rounded-full" />}
        <span className={cx("truncate text-[13.5px]", b.done && "text-muted", b.done && "line-through decoration-faint")}>{b.title}</span>
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
  onMenu,
  onGrab,
  dur = 60,
  full,
  live,
}: {
  b: BlockDTO;
  cats: Map<string, CategoryDTO>;
  onEdit: (b: BlockDTO) => void;
  onToggle: (b: BlockDTO) => void;
  onMenu?: (e: React.MouseEvent, b: BlockDTO) => void;
  /** Al empezar a arrastrarlo: a qué altura se agarró (px) y cuánto dura (min). */
  onGrab?: (offset: number, dur: number) => void;
  dur?: number;
  full?: boolean;
  /** Está pasando ahora: aro de acento. */
  live?: boolean;
}) {
  const [tapped, setTapped] = useState(false);
  const [dragging, setDragging] = useState(false);
  const c = b.categoryId ? cats.get(b.categoryId) : null;
  const priority = PRIORITIES.find((p) => p.value === b.priority);
  return (
    <div
      data-ring
      onContextMenu={(e) => onMenu?.(e, b)}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG, b.id);
        e.dataTransfer.effectAllowed = "move";
        liftImage(e, e.currentTarget);
        onGrab?.(e.clientY - e.currentTarget.getBoundingClientRect().top, dur);
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      // "Libre": verde suave en vez del color de su categoría.
      style={tone(isFreeBlock(b) ? "green" : (c?.color ?? "stone"))}
      className={cx(
        "group flex cursor-grab items-start gap-1 overflow-hidden rounded-lg bg-tone px-1.5 py-1 text-tone-fg transition-opacity duration-[var(--dur-state)] active:cursor-grabbing",
        full && "h-full",
        b.done && "opacity-60",
        // Urgente: borde rojo por dentro (el relleno es el color de su categoría).
        !isFreeBlock(b) && isUrgent(b, b.done) && "ring-2 ring-[var(--p-red-chip)] ring-inset",
        dragging && "plan-drag-source",
        live && "plan-live",
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
                <PriorityDots n={priority.value} size={7} mono />
              </span>
            )}
          </span>
        )}
        {full && b.startTime && (
          <span className="block font-mono text-[10px] opacity-75">
            {b.startTime}
            {b.endTime ? `–${b.endTime}` : ""}
            {live && <span className="sr-only">, está pasando ahora</span>}
          </span>
        )}
      </button>
      {!isFreeBlock(b) && (
        <button
          type="button"
          onClick={() => {
            haptic("tap");
            setTapped(true);
            onToggle(b);
          }}
          aria-pressed={b.done}
          aria-label={b.done ? `${b.title}: hecho. Desmarcar` : `Marcar ${b.title} como hecho`}
          className={cx(
            // El dibujo mide 16 px pero el área para tocar es de ~40 (pseudo-elemento; la tarjeta la recorta si es más baja).
            "relative inline-flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors duration-[var(--dur-quick)] before:absolute before:-inset-3 before:content-['']",
            b.done ? "border-current bg-current" : "border-current/60",
          )}
        >
          {b.done && <Check size={9} weight="bold" className={cx("text-surface", tapped && "mark-pop")} />}
        </button>
      )}
    </div>
  );
}
