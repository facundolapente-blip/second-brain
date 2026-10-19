"use client";

import { useId, useOptimistic, useRef, useState, useSyncExternalStore } from "react";
import { DndContext, DragOverlay, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { CalendarPlus, Plus } from "@phosphor-icons/react";
import { useSafeTransition } from "@/components/safe-action";
import { haptic } from "@/components/haptics";
import { setTaskStatus } from "@/lib/offline/plan";
import { formatShort } from "@/lib/dates";
import { daysLeft, daysLeftLabel, TASK_DRAG, TASK_STATUS, type CategoryDTO, type TaskDTO, type TaskStatus } from "@/lib/plan-logic";
import { tone } from "@/lib/palette";
import { cx } from "@/components/ui";
import { useNewIds, useTick } from "@/components/motion";
import { CategoryTag, PriorityDots, StepBar } from "../plan-ui";
import { land, landFrom, liftImage, useLandedKeys } from "../drag-motion";
import { DatePicker } from "./date-picker";

/** Arrastre nativo de una tarjeta entre columnas (además de TASK_DRAG, que la deja agendar en un día). */
const KANBAN_DRAG = "text/x-tarea-tablero";

/** Mouse o lápiz (compu): ahí las tarjetas usan el arrastre nativo; con el dedo, dnd-kit manteniendo apretado. */
function useFinePointer() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(pointer: fine)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(pointer: fine)").matches,
    () => false,
  );
}

/**
 * El consejo de cómo se usa el tablero en el celular sale solo la primera vez
 * (se recuerda en el aparato). Se decide una vez por visita: no desaparece mientras se lee.
 */
const TIP_KEY = "sb_plan_tablero_consejo";
let tipDecision: boolean | null = null;
function showTip(): boolean {
  if (tipDecision === null) {
    try {
      tipDecision = !localStorage.getItem(TIP_KEY);
      localStorage.setItem(TIP_KEY, "1");
    } catch {
      tipDecision = false;
    }
  }
  return tipDecision;
}
const noop = () => () => {};

/** Columnas del tablero, en el orden de Notion: de lo que espera a lo terminado. */
const COLUMNS: TaskStatus[] = ["backlog", "todo", "doing", "done"];
/** Dentro de cada columna: primero lo que vence antes (terminadas: la más reciente arriba). */
function sortColumn(list: TaskDTO[], status: TaskStatus) {
  return [...list].sort((a, b) =>
    status === "done"
      ? (b.doneAt ?? "").localeCompare(a.doneAt ?? "")
      : (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") || b.priority - a.priority,
  );
}

/**
 * Tareas como tablero (vista nueva; la tabla sigue igual): una columna por estado.
 * Arrastrar una tarjeta a otra columna le cambia el estado. En la compu el
 * arrastre es el nativo del navegador (el mismo de la tabla), así una tarjeta
 * también se suelta en un día de la semana y se crea el bloque (`TASK_DRAG`).
 * En el celular, dnd-kit manteniéndola apretada; las columnas se deslizan de costado.
 *
 * Mientras se arrastra, la columna de abajo marca el lugar real donde va a quedar la
 * tarjeta (ordenada por fecha); al soltar, la tarjeta viaja corto hasta ahí.
 */
export function TaskKanban({
  tasks,
  categories,
  today,
  onOpen,
  onNew,
  onDeadline,
}: {
  tasks: TaskDTO[];
  categories: CategoryDTO[];
  today: string;
  onOpen: (t: TaskDTO) => void;
  onNew: (status: TaskStatus) => void;
  /** Cambiar la fecha desde la tarjeta (botón aparte). */
  onDeadline?: (t: TaskDTO, deadline: string | null) => void;
}) {
  const id = useId();
  const cats = new Map(categories.map((c) => [c.id, c]));
  const [, start] = useSafeTransition();
  // El cambio se ve enseguida; si el servidor falla, vuelve solo.
  const [moved, move] = useOptimistic(tasks, (list: TaskDTO[], m: { id: string; status: TaskStatus }) =>
    list.map((t) => (t.id === m.id ? { ...t, status: m.status, doneAt: m.status === "done" ? new Date().toISOString() : null } : t)),
  );
  const [dragging, setDragging] = useState<{ task: TaskDTO; height: number } | null>(null);
  const fine = useFinePointer();
  // Una tarjeta nueva entra asentándose; la que llega arrastrada viaja (no las dos cosas); al cargar, nada.
  const fresh = useNewIds(moved.map((t) => `${t.status}:${t.id}`));
  const flown = useLandedKeys(fresh, (k) => k.split(":")[1]);
  const landed = new Set([...fresh].filter((k) => !flown.has(k)));
  const sensors = useSensors(useSensor(TouchSensor, { activationConstraint: { delay: 280, tolerance: 8 } }));
  const tip = useSyncExternalStore(noop, showTip, () => false);
  // Celular: en qué columna se está (puntos y nombre en vez de un texto fijo).
  const scroller = useRef<HTMLDivElement>(null);
  const [col, setCol] = useState(0);
  function onScroll() {
    const el = scroller.current;
    const first = el?.firstElementChild as HTMLElement | null;
    if (!el || !first) return;
    const i = Math.round(el.scrollLeft / (first.offsetWidth + 12));
    if (i !== col) setCol(Math.max(0, Math.min(COLUMNS.length - 1, i)));
  }
  function goCol(i: number) {
    const el = scroller.current;
    const target = el?.children[i] as HTMLElement | undefined;
    if (!el || !target) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: target.offsetLeft - el.offsetLeft - 16, behavior: reduce ? "auto" : "smooth" });
  }

  function changeStatus(taskId: string, to: TaskStatus | undefined) {
    const t = moved.find((x) => x.id === taskId);
    if (!t || !to || !COLUMNS.includes(to) || t.status === to) return false;
    haptic(to === "done" ? "complete" : "success");
    start(async () => {
      move({ id: t.id, status: to });
      await setTaskStatus(t.id, to);
    });
    return true;
  }

  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    const taskId = String(e.active.id);
    const from = e.active.rect.current.translated;
    if (changeStatus(taskId, e.over?.id as TaskStatus | undefined)) landFrom(taskId, from ? { left: from.left, top: from.top } : null);
  }

  return (
    <DndContext
      id={id}
      sensors={sensors}
      onDragStart={(e) => {
        const t = moved.find((x) => x.id === e.active.id);
        haptic("select");
        setDragging(t ? { task: t, height: e.active.rect.current.initial?.height ?? 64 } : null);
      }}
      onDragCancel={() => setDragging(null)}
      onDragEnd={onDragEnd}
    >
      {/* Compu: las cuatro columnas a la vista. Celular: de a una, deslizando. */}
      <div
        ref={scroller}
        onScroll={onScroll}
        data-no-swipe
        className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] lg:mx-0 lg:grid lg:snap-none lg:grid-cols-4 lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {COLUMNS.map((status) => (
          <Column
            key={status}
            status={status}
            tasks={sortColumn(
              moved.filter((t) => t.status === status),
              status,
            )}
            cats={cats}
            today={today}
            dragging={dragging}
            landed={landed}
            native={fine}
            onNativeStart={setDragging}
            onNativeDrop={(taskId, e) => {
              if (changeStatus(taskId, status)) land(taskId, e);
            }}
            onOpen={onOpen}
            onNew={() => onNew(status)}
            onDeadline={onDeadline}
          />
        ))}
      </div>
      {/* Celular: en qué columna estás (tocar un punto va a esa). */}
      <div className="flex items-center justify-center gap-3 pt-1 lg:hidden">
        <div className="flex items-center" role="tablist" aria-label="Columnas">
          {COLUMNS.map((s, i) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={i === col}
              aria-label={TASK_STATUS[s].label}
              onClick={() => goCol(i)}
              className="inline-flex size-7 items-center justify-center"
            >
              <span
                aria-hidden
                style={tone(TASK_STATUS[s].tone)}
                className={cx("size-2 rounded-full transition-[scale,background-color] duration-[var(--dur-state)]", i === col ? "scale-125 bg-[var(--tone-chip)]" : "bg-line-strong")}
              />
            </button>
          ))}
        </div>
        <span className="text-[12.5px] font-medium text-muted" aria-live="polite">
          {TASK_STATUS[COLUMNS[col]].label} · {col + 1} de {COLUMNS.length}
        </span>
      </div>
      {tip && <p className="pt-1 text-center text-[12px] text-muted lg:hidden">Deslizá para ver las otras columnas · mantené apretada una tarjeta para moverla</p>}
      <DragOverlay dropAnimation={null}>
        {dragging && <Card task={dragging.task} category={dragging.task.categoryId ? cats.get(dragging.task.categoryId) : null} today={today} overlay />}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  status,
  tasks,
  cats,
  today,
  dragging,
  landed,
  native,
  onNativeStart,
  onNativeDrop,
  onOpen,
  onNew,
  onDeadline,
}: {
  status: TaskStatus;
  tasks: TaskDTO[];
  cats: Map<string, CategoryDTO>;
  today: string;
  dragging: { task: TaskDTO; height: number } | null;
  landed: Set<string>;
  native: boolean;
  onNativeStart: (d: { task: TaskDTO; height: number } | null) => void;
  onNativeDrop: (taskId: string, e: React.DragEvent) => void;
  onOpen: (t: TaskDTO) => void;
  onNew: () => void;
  onDeadline?: (t: TaskDTO, deadline: string | null) => void;
}) {
  const { setNodeRef, isOver: overTouch } = useDroppable({ id: status });
  const [overNative, setOverNative] = useState(false);
  const isOver = overTouch || overNative;
  const st = TASK_STATUS[status];
  const canDrop = dragging !== null && dragging.task.status !== status;
  const count = useTick(tasks.length);
  // Dónde va a quedar la tarjeta si se suelta acá: el lugar real en el orden de la columna.
  const slot =
    canDrop && isOver
      ? sortColumn([...tasks, { ...dragging.task, status, doneAt: status === "done" ? "9999" : null }], status).findIndex((t) => t.id === dragging.task.id)
      : -1;
  const placeholder = (
    <li key="lugar" aria-hidden className="plan-slot-card rounded-xl border-2 border-dashed border-accent bg-[color-mix(in_oklab,var(--accent)_10%,transparent)]" style={{ height: dragging?.height ?? 64 }} />
  );
  return (
    <section
      ref={setNodeRef}
      aria-label={`${st.label}: ${tasks.length}`}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(KANBAN_DRAG)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (!overNative) haptic("threshold");
        setOverNative(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverNative(false);
      }}
      onDrop={(e) => {
        const id = e.dataTransfer.getData(KANBAN_DRAG);
        setOverNative(false);
        onNativeStart(null);
        if (id) {
          e.preventDefault();
          onNativeDrop(id, e);
        }
      }}
      // Mientras se arrastra, las otras columnas muestran un borde punteado suave; la de abajo del puntero, lleno.
      data-drop={canDrop ? (isOver ? "over" : "ready") : undefined}
      className={cx(
        "plan-drop grid w-[85%] shrink-0 snap-start content-start gap-2 rounded-2xl bg-surface-2 p-2.5 transition-colors sm:w-[46%] lg:w-auto",
        isOver && canDrop && "bg-[color-mix(in_oklab,var(--accent)_12%,var(--surface-2))]",
      )}
    >
      <header className="flex min-h-9 items-center gap-2 px-1.5">
        <span aria-hidden style={tone(st.tone)} className="size-2.5 rounded-[3px] bg-[var(--tone-chip)]" />
        <h3 className="text-[13.5px] font-semibold">{st.label}</h3>
        <span className="font-mono text-[12px] text-muted tabular">
          <span key={count.key} className={count.className}>
            {tasks.length}
          </span>
        </span>
        {status !== "done" && (
          <button
            type="button"
            onClick={onNew}
            aria-label={`Nueva tarea en ${st.label}`}
            className="ml-auto inline-flex size-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface hover:text-fg"
          >
            <Plus size={15} />
          </button>
        )}
      </header>
      <ul className="grid gap-2">
        {tasks.map((t, i) => [
          slot === i ? placeholder : null,
          <DraggableCard
            key={t.id}
            task={t}
            category={t.categoryId ? cats.get(t.categoryId) : null}
            today={today}
            native={native}
            landed={landed.has(`${status}:${t.id}`)}
            onNativeStart={onNativeStart}
            onOpen={() => onOpen(t)}
            onDeadline={onDeadline}
          />,
        ])}
        {slot === tasks.length && placeholder}
      </ul>
      {tasks.length === 0 && !canDrop && (
        <p className="grid min-h-14 place-items-center rounded-xl border border-dashed border-line-strong px-3 text-center text-[12.5px] text-muted">Nada por acá</p>
      )}
      {/* Columna vacía mientras se arrastra (y todavía sin el puntero encima): dónde soltar. */}
      {tasks.length === 0 && canDrop && slot === -1 && (
        <p className="reveal grid min-h-14 place-items-center rounded-xl border border-dashed border-line-strong px-3 text-center text-[12.5px] text-muted">Soltá acá para pasarla a {st.label}</p>
      )}
    </section>
  );
}

function DraggableCard({
  task,
  category,
  today,
  native,
  landed,
  onNativeStart,
  onOpen,
  onDeadline,
}: {
  task: TaskDTO;
  category?: CategoryDTO | null;
  today: string;
  native: boolean;
  /** Recién llegada a esta columna: se asienta (no al cargar). */
  landed?: boolean;
  onNativeStart: (d: { task: TaskDTO; height: number } | null) => void;
  onOpen: () => void;
  onDeadline?: (t: TaskDTO, deadline: string | null) => void;
}) {
  // Con el dedo, dnd-kit (manteniendo apretado); con el mouse, el arrastre nativo, que además
  // se puede soltar en un día de la semana. Con teclado, el estado se cambia en la hoja de la tarea.
  const { listeners, setNodeRef, isDragging } = useDraggable({ id: task.id, disabled: native });
  const [nativeDragging, setNativeDragging] = useState(false);
  return (
    <li
      ref={setNodeRef}
      data-flip={task.id}
      className={cx("touch-manipulation", native && "cursor-grab active:cursor-grabbing", landed && "plan-land", (isDragging || nativeDragging) && "plan-drag-source")}
      {...(native ? {} : listeners)}
      draggable={native || undefined}
      onDragStart={
        native
          ? (e) => {
              e.dataTransfer.setData(KANBAN_DRAG, task.id);
              // Terminada no se agenda (igual que en la tabla).
              if (task.status !== "done") e.dataTransfer.setData(TASK_DRAG, task.id);
              e.dataTransfer.effectAllowed = "copyMove";
              const card = (e.currentTarget.firstElementChild as HTMLElement | null) ?? e.currentTarget;
              liftImage(e, card);
              setNativeDragging(true);
              onNativeStart({ task, height: card.offsetHeight });
            }
          : undefined
      }
      onDragEnd={
        native
          ? () => {
              setNativeDragging(false);
              onNativeStart(null);
            }
          : undefined
      }
    >
      <Card task={task} category={category} today={today} onOpen={onOpen} onDeadline={onDeadline} />
    </li>
  );
}

function Card({
  task: t,
  category,
  today,
  onOpen,
  onDeadline,
  overlay,
}: {
  task: TaskDTO;
  category?: CategoryDTO | null;
  today: string;
  onOpen?: () => void;
  onDeadline?: (t: TaskDTO, deadline: string | null) => void;
  overlay?: boolean;
}) {
  const done = t.status === "done";
  const left = daysLeft(t.deadline, today);
  const late = !done && left !== null && left < 0;
  const near = !done && left !== null && left >= 0 && left <= 2;
  const steps = t.subtasks.length;
  const stepsDone = t.subtasks.filter((s) => s.done).length;
  const chip = t.deadline && (
    <span
      className={cx(
        "inline-flex rounded-md px-1.5 py-0.5 font-mono text-[11.5px] tabular",
        late ? "bg-[var(--st-fail-bg)] text-[var(--st-fail-fg)]" : near ? "bg-[var(--st-skip-bg)] text-[var(--st-skip-fg)]" : "bg-surface-2 text-muted",
      )}
    >
      {formatShort(t.deadline)}
      {!done && (late || near) && ` · ${daysLeftLabel(left)?.toLowerCase()}`}
    </span>
  );
  // La fecha es un botón aparte (abre el selector) encima de la tarjeta, que entera abre la hoja:
  // sin botones adentro de botones.
  const dateButton = !overlay && onDeadline && !done && (
    <DatePicker
      value={t.deadline}
      today={today}
      onChange={(d) => onDeadline(t, d)}
      label={t.deadline ? `Deadline de ${t.title} (${formatShort(t.deadline)})` : `Ponerle deadline a ${t.title}`}
      className="relative z-[1]"
      triggerClassName={t.deadline ? "rounded-md" : "inline-flex size-7 items-center justify-center rounded-full text-faint hover:bg-surface-2 hover:text-fg"}
    >
      {chip || <CalendarPlus size={15} aria-hidden />}
    </DatePicker>
  );
  return (
    <div
      className={cx(
        // Sube con el mouse y se hunde al apretar; levantada (celular), se inclina apenas.
        "relative grid w-full gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-left",
        overlay ? "plan-pickup shadow-[var(--card-shadow)]" : "lift press tap-tint",
        done && "opacity-80",
      )}
    >
      {!overlay && <button type="button" onClick={onOpen} aria-label={`Abrir ${t.title}`} className="absolute inset-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]" />}
      <span className={cx("pointer-events-none text-[14px] leading-snug font-semibold", done && "text-muted line-through decoration-faint")}>{t.title}</span>
      {(category || t.priority > 0) && (
        <span className="pointer-events-none flex flex-wrap items-center gap-2">
          <CategoryTag category={category} />
          {t.priority > 0 && <PriorityDots n={t.priority} />}
        </span>
      )}
      {(t.deadline || steps > 0 || dateButton) && (
        <span className="flex flex-wrap items-center gap-2">
          {dateButton || chip}
          {steps > 0 && (
            <span className="pointer-events-none flex min-w-16 flex-1 items-center gap-2" aria-label={`${stepsDone} de ${steps} pasos`}>
              <StepBar done={stepsDone} total={steps} track="h-1.5 rounded-[2px]" gap="gap-0.5" />
              <span className="font-mono text-[11.5px] text-muted tabular" aria-hidden>
                {stepsDone}/{steps}
              </span>
            </span>
          )}
        </span>
      )}
    </div>
  );
}
