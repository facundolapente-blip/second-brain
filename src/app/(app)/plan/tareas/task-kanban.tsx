"use client";

import { useId, useOptimistic, useState } from "react";
import { DndContext, DragOverlay, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { Plus } from "@phosphor-icons/react";
import { useSafeTransition } from "@/components/safe-action";
import { setTaskStatus } from "@/lib/offline/plan";
import { formatShort } from "@/lib/dates";
import { daysLeft, daysLeftLabel, progressPct, TASK_STATUS, type CategoryDTO, type TaskDTO, type TaskStatus } from "@/lib/plan-logic";
import { tone } from "@/lib/palette";
import { cx } from "@/components/ui";
import { CategoryTag, PriorityDots } from "../plan-ui";

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
 * Arrastrar una tarjeta a otra columna le cambia el estado (en el celular,
 * manteniéndola apretada; las columnas se deslizan de costado).
 */
export function TaskKanban({
  tasks,
  categories,
  today,
  onOpen,
  onNew,
}: {
  tasks: TaskDTO[];
  categories: CategoryDTO[];
  today: string;
  onOpen: (t: TaskDTO) => void;
  onNew: (status: TaskStatus) => void;
}) {
  const id = useId();
  const cats = new Map(categories.map((c) => [c.id, c]));
  const [, start] = useSafeTransition();
  // El cambio se ve enseguida; si el servidor falla, vuelve solo.
  const [moved, move] = useOptimistic(tasks, (list: TaskDTO[], m: { id: string; status: TaskStatus }) =>
    list.map((t) => (t.id === m.id ? { ...t, status: m.status, doneAt: m.status === "done" ? new Date().toISOString() : null } : t)),
  );
  const [dragging, setDragging] = useState<TaskDTO | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 280, tolerance: 8 } }),
  );

  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    const to = e.over?.id as TaskStatus | undefined;
    const t = moved.find((x) => x.id === e.active.id);
    if (!t || !to || !COLUMNS.includes(to) || t.status === to) return;
    start(async () => {
      move({ id: t.id, status: to });
      await setTaskStatus(t.id, to);
    });
  }

  return (
    <DndContext
      id={id}
      sensors={sensors}
      onDragStart={(e) => setDragging(moved.find((t) => t.id === e.active.id) ?? null)}
      onDragCancel={() => setDragging(null)}
      onDragEnd={onDragEnd}
    >
      {/* Compu: las cuatro columnas a la vista. Celular: de a una, deslizando. */}
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] lg:mx-0 lg:grid lg:snap-none lg:grid-cols-4 lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden">
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
            onOpen={onOpen}
            onNew={() => onNew(status)}
          />
        ))}
      </div>
      <p className="pt-1 text-[12px] text-muted lg:hidden">Deslizá para ver las otras columnas · mantené apretada una tarjeta para moverla</p>
      <DragOverlay dropAnimation={null}>
        {dragging && <Card task={dragging} category={dragging.categoryId ? cats.get(dragging.categoryId) : null} today={today} overlay />}
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
  onOpen,
  onNew,
}: {
  status: TaskStatus;
  tasks: TaskDTO[];
  cats: Map<string, CategoryDTO>;
  today: string;
  dragging: TaskDTO | null;
  onOpen: (t: TaskDTO) => void;
  onNew: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const st = TASK_STATUS[status];
  const canDrop = dragging !== null && dragging.status !== status;
  return (
    <section
      ref={setNodeRef}
      aria-label={`${st.label}: ${tasks.length}`}
      className={cx(
        "grid w-[85%] shrink-0 snap-start content-start gap-2 rounded-2xl bg-surface-2 p-2.5 transition-colors sm:w-[46%] lg:w-auto",
        isOver && canDrop && "bg-[color-mix(in_oklab,var(--accent)_12%,var(--surface-2))] ring-1 ring-accent",
      )}
    >
      <header className="flex min-h-9 items-center gap-2 px-1.5">
        <span aria-hidden style={tone(st.tone)} className="size-2.5 rounded-[3px] bg-[var(--tone-chip)]" />
        <h3 className="text-[13.5px] font-semibold">{st.label}</h3>
        <span className="font-mono text-[12px] text-muted tabular">{tasks.length}</span>
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
        {tasks.map((t) => (
          <DraggableCard key={t.id} task={t} category={t.categoryId ? cats.get(t.categoryId) : null} today={today} onOpen={() => onOpen(t)} />
        ))}
      </ul>
      {(tasks.length === 0 || canDrop) && (
        <p
          className={cx(
            "grid min-h-14 place-items-center rounded-xl border border-dashed px-3 text-center text-[12.5px] text-muted",
            isOver && canDrop ? "border-accent" : "border-line-strong",
          )}
        >
          {canDrop ? `Soltá acá para pasarla a ${st.label}` : "Nada por acá"}
        </p>
      )}
    </section>
  );
}

function DraggableCard({ task, category, today, onOpen }: { task: TaskDTO; category?: CategoryDTO | null; today: string; onOpen: () => void }) {
  // Solo el arrastre con el mouse o el dedo; con teclado, el estado se cambia en la hoja de la tarea.
  const { listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <li ref={setNodeRef} className={cx("touch-manipulation", isDragging && "opacity-40")} {...listeners}>
      <Card task={task} category={category} today={today} onOpen={onOpen} />
    </li>
  );
}

function Card({
  task: t,
  category,
  today,
  onOpen,
  overlay,
}: {
  task: TaskDTO;
  category?: CategoryDTO | null;
  today: string;
  onOpen?: () => void;
  overlay?: boolean;
}) {
  const done = t.status === "done";
  const left = daysLeft(t.deadline, today);
  const late = !done && left !== null && left < 0;
  const near = !done && left !== null && left >= 0 && left <= 2;
  const steps = t.subtasks.length;
  const stepsDone = t.subtasks.filter((s) => s.done).length;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cx(
        "grid w-full gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-left transition-shadow hover:shadow-[var(--card-shadow)]",
        overlay && "rotate-1 shadow-[var(--card-shadow)]",
        done && "opacity-80",
      )}
    >
      <span className={cx("text-[14px] leading-snug font-semibold", done && "text-muted line-through decoration-faint")}>{t.title}</span>
      {(category || t.priority > 0) && (
        <span className="flex flex-wrap items-center gap-2">
          <CategoryTag category={category} />
          {t.priority > 0 && <PriorityDots n={t.priority} />}
        </span>
      )}
      {(t.deadline || steps > 0) && (
        <span className="flex flex-wrap items-center gap-2">
          {t.deadline && (
            <span
              className={cx(
                "rounded-md px-1.5 py-0.5 font-mono text-[11.5px] tabular",
                late ? "bg-[var(--st-fail-bg)] text-[var(--st-fail-fg)]" : near ? "bg-[var(--st-skip-bg)] text-[var(--st-skip-fg)]" : "bg-surface-2 text-muted",
              )}
            >
              {formatShort(t.deadline)}
              {!done && (late || near) && ` · ${daysLeftLabel(left)?.toLowerCase()}`}
            </span>
          )}
          {steps > 0 && (
            <span className="flex min-w-16 flex-1 items-center gap-2" aria-label={`${stepsDone} de ${steps} pasos`}>
              <span className="flex h-1.5 min-w-0 flex-1 gap-0.5" aria-hidden>
                {steps > 10 ? (
                  <span className="h-full flex-1 overflow-hidden rounded-full bg-surface-3">
                    <span className="block h-full rounded-full bg-accent" style={{ width: `${progressPct(stepsDone, steps) ?? 0}%` }} />
                  </span>
                ) : (
                  Array.from({ length: steps }, (_, i) => (
                    <span key={i} className={cx("h-full min-w-0 flex-1 rounded-[2px]", i < stepsDone ? (stepsDone >= steps ? "bg-[var(--st-done-line)]" : "bg-accent") : "bg-surface-3")} />
                  ))
                )}
              </span>
              <span className="font-mono text-[11.5px] text-muted tabular" aria-hidden>
                {stepsDone}/{steps}
              </span>
            </span>
          )}
        </span>
      )}
    </button>
  );
}
