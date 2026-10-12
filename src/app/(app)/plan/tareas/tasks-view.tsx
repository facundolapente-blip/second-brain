"use client";

import { useNewIds } from "@/components/motion";
import { notifyDeleted } from "@/components/undo-toast";
import { showContextMenu } from "@/components/context-menu";
import { quiet, useSafeTransition } from "@/components/safe-action";
import { useOptimistic, useRef, useState, useEffect } from "react";
import { CaretDown, Check, Minus, Plus, CalendarPlus, CopySimple, NotePencil, PencilSimple, Trash } from "@phosphor-icons/react";
import { bumpTaskProgress, reorderTasks, saveTaskColumns, setTaskScheduled, deleteTask, duplicateTask, renameTask } from "@/lib/offline/plan";
import { formatShort } from "@/lib/dates";
import { applyTaskView, daysLeft, TASKS_FOLD_COOKIE, daysLeftLabel, progressPct, repeatLabel, TASK_STATUS, SORTABLE_VIEWS, TASK_VIEWS, type CategoryDTO, type TaskDTO, type TaskView, TASK_COLUMNS, TASK_COLUMN_MAX, TASK_COLUMN_MIN, type TaskColumnKey, type TaskColumnWidths, TASK_DRAG } from "@/lib/plan-logic";
import { Button, cx } from "@/components/ui";
import { mergeOrder, Sortable, SortableItem } from "@/components/sortable";
import { BlockSheet, type BlockSheetHandle } from "../block-sheet";
import { CategoryTag, categoryMap, PriorityTag, ProgressBar, StatusPill } from "../plan-ui";
import { TaskSheet, type TaskSheetHandle } from "./task-sheet";

const LIMIT = 6;

/**
 * Tareas arriba de la semana, en la misma página (como el Plan Semanal de
 * Notion): vistas guardadas, tabla en la computadora y lista en el celular.
 * Muestra las primeras 6 y el resto con "Ver todas".
 */
/** Vista y "Ver todas" del tablero: viven mientras la app está abierta (cambiar de semana no los pierde). */
const savedBoard: { view: TaskView; all: boolean } = { view: "todo", all: false };

export function TasksBoard({
  tasks,
  categories,
  today,
  manualOrder = false,
  folded: foldedInitial = false,
  columns = {},
}: {
  tasks: TaskDTO[];
  categories: CategoryDTO[];
  today: string;
  /** Si se arrastró alguna vez, las vistas ordenables usan ese orden. */
  manualOrder?: boolean;
  /** En el celular, las tareas se pliegan en una línea de resumen. */
  folded?: boolean;
  /** Anchos de columna guardados (tabla de la compu). */
  columns?: TaskColumnWidths;
}) {
  const [folded, setFolded] = useState(foldedInitial);
  function toggleFold() {
    const next = !folded;
    setFolded(next);
    document.cookie = `${TASKS_FOLD_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  }
  const open = tasks.filter((t) => t.status !== "done");
  const overdue = open.filter((t) => (daysLeft(t.deadline, today) ?? 0) < 0).length;
  // La vista y "Ver todas" sobreviven al cambio de semana (la página vuelve a montar el tablero).
  const [view, setViewState] = useState<TaskView>(() => savedBoard.view);
  const [all, setAllState] = useState(() => savedBoard.all);
  // Cambiar de vista: fundido corto (solo después de tocar, no al cargar).
  const [swapped, setSwapped] = useState(false);
  const setView = (v: TaskView) => {
    setSwapped(true);
    setViewState(v);
  };
  const setAll = setAllState;
  useEffect(() => {
    savedBoard.view = view;
    savedBoard.all = all;
  }, [view, all]);
  const sheet = useRef<TaskSheetHandle>(null);
  const blockSheet = useRef<BlockSheetHandle>(null);
  const cats = categoryMap(categories);
  // Orden optimista mientras se guarda lo arrastrado.
  const [localOrder, setLocalOrder] = useState<Map<string, number> | null>(null);
  const [, startOrder] = useSafeTransition();
  const manual = manualOrder || localOrder !== null;
  const ordered = localOrder ? tasks.map((t) => ({ ...t, order: localOrder.get(t.id) ?? t.order })) : tasks;
  const matching = applyTaskView(ordered, view, manual);
  const canSort = SORTABLE_VIEWS.includes(view);
  function reorder(visibleNew: string[]) {
    // La base es el orden de esta vista seguido por el resto: lo que no se ve no se mueve.
    const viewIds = matching.map((t) => t.id);
    const rest = [...ordered].sort((a, b) => a.order - b.order).map((t) => t.id).filter((id) => !viewIds.includes(id));
    const full = mergeOrder([...viewIds, ...rest], visibleNew);
    setLocalOrder(new Map(full.map((id, i) => [id, i])));
    startOrder(() => reorderTasks(full));
  }
  const visible = all ? matching : matching.slice(0, LIMIT);
  const fresh = useNewIds(visible.map((t) => t.id));
  const hidden = matching.length - visible.length;
  // Clic derecho en una tarea (tabla de la compu).
  const [, startMenu] = useSafeTransition();
  function taskMenu(e: React.MouseEvent, t: TaskDTO) {
    showContextMenu(
      e,
      [
        {
          label: "Cambiar nombre",
          icon: <PencilSimple size={15} />,
          rename: { value: t.title, onSave: (title) => startMenu(() => renameTask(t.id, title)) },
        },
        { label: "Duplicar", icon: <CopySimple size={15} />, onSelect: () => startMenu(() => duplicateTask(t.id)) },
        { label: "Editar", icon: <NotePencil size={15} />, onSelect: () => sheet.current?.open(t) },
        ...(t.status !== "done" ? [{ label: "Agendar en la semana", icon: <CalendarPlus size={15} />, onSelect: () => schedule(t) }] : []),
        {
          label: "Borrar",
          icon: <Trash size={15} />,
          danger: true,
          onSelect: () => {
            startMenu(() => deleteTask(t.id));
            notifyDeleted("Tarea borrada");
          },
        },
      ],
      t.title,
    );
  }
  const schedule = (t: TaskDTO) =>
    blockSheet.current?.open({
      date: today,
      title: t.title,
      categoryId: t.categoryId,
      priority: t.priority,
      taskId: t.id,
    });

  return (
    <section id="tareas" aria-label="Tareas" className="scroll-mt-24 pt-3 lg:pt-5">
      <div className="flex items-center gap-2">
        {/* En el celular el título pliega la lista (queda una línea con el resumen). */}
        <button
          type="button"
          onClick={toggleFold}
          aria-expanded={!folded}
          aria-controls="tareas-cuerpo"
          className="-ml-1 flex min-h-11 min-w-0 items-center gap-2 rounded-lg px-1 text-left lg:pointer-events-none"
        >
          <h2 className="display text-[22px] lg:text-[26px]">Tareas</h2>
          {/* Las vencidas primero: si no entra todo en el celular, lo que se corta es lo menos importante. */}
          <span className="truncate font-mono text-[12px] text-muted tabular">
            {overdue > 0 && <span className="text-danger">{overdue === 1 ? "1 vencida" : `${overdue} vencidas`} · </span>}
            {open.length} abiertas
          </span>
          <CaretDown
            size={14}
            weight="bold"
            aria-hidden
            className={cx("shrink-0 text-muted transition-transform duration-[var(--dur-state)] ease-[var(--ease-out)] lg:hidden", folded && "-rotate-90")}
          />
        </button>
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => sheet.current?.open()}>
          <Plus size={15} weight="bold" /> Nueva tarea
        </Button>
      </div>
      {/* En el celular se pliega con el alto animado (en la compu siempre se ve). */}
      <div id="tareas-cuerpo" className="fold fold-mobile" data-closed={folded || undefined}>
      <div>
      <div
        role="tablist"
        aria-label="Vistas"
        className="-mx-4 flex gap-1.5 overflow-x-auto px-4 py-3 [scrollbar-width:none] lg:mx-0 lg:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {TASK_VIEWS.map((v) => {
          const n = applyTaskView(ordered, v.id, manual).length;
          const on = v.id === view;
          return (
            <button
              key={v.id}
              role="tab"
              aria-selected={on}
              onClick={() => {
                setView(v.id);
                setAll(false);
              }}
              className={cx(
                "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] transition-colors",
                on ? "border-ink bg-ink font-medium text-on-ink" : "border-line-strong text-muted hover:bg-surface-2 hover:text-fg",
              )}
            >
              {v.label}
              <span className={cx("font-mono text-[11px] tabular", on ? "text-on-ink/90" : "text-muted")}>{n}</span>
            </button>
          );
        })}
      </div>

      <div key={view} className={swapped ? "swap" : undefined}>
      {visible.length === 0 ? (
        <div className="grid justify-items-start gap-3 border-y border-line py-6">
          <p className="text-[15px] text-muted">
            {view === "done" ? "Todavía no terminaste ninguna tarea." : "No hay tareas en esta vista."}
          </p>
        </div>
      ) : (
        <>
          <TaskTable tasks={visible} fresh={fresh} cats={cats} today={today} onOpen={(t) => sheet.current?.open(t)} sortable={canSort} onReorder={reorder} columns={columns} onMenu={taskMenu} />
          {/* Celular: mantener apretada una tarea y moverla para cambiar el orden. */}
          <Sortable ids={visible.map((t) => t.id)} onReorder={reorder} disabled={!canSort}>
          <ul className="grid border-t border-line lg:hidden">
            {visible.map((t) => (
              <TaskRow
                key={t.id}
                fresh={fresh.has(t.id)}
                task={t}
                category={t.categoryId ? cats.get(t.categoryId) : null}
                today={today}
                onOpen={() => sheet.current?.open(t)}
                sortable={canSort}
              />
            ))}
          </ul>
          </Sortable>
        </>
      )}
      {(hidden > 0 || (all && matching.length > LIMIT)) && (
        <button
          type="button"
          onClick={() => setAll((a) => !a)}
          className="mt-2 inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-[13.5px] font-medium text-accent-fg hover:bg-surface-2"
        >
          {all ? "Ver menos" : `Ver todas (${hidden} más)`}
        </button>
      )}
      </div>
      </div>
      </div>

      <TaskSheet ref={sheet} categories={categories} onSchedule={schedule} />
      <BlockSheet
        ref={blockSheet}
        categories={categories}
        tasks={tasks.map((t) => ({ id: t.id, title: t.title, status: t.status }))}
      />
    </section>
  );
}

function TaskRow({
  task: t,
  category,
  today,
  onOpen,
  sortable,
  fresh,
}: {
  task: TaskDTO;
  category?: CategoryDTO | null;
  today: string;
  onOpen: () => void;
  sortable: boolean;
  /** Recién aparecida ("Ver todas", nueva): entra con un fundido. */
  fresh?: boolean;
}) {
  const left = daysLeft(t.deadline, today);
  const pct = progressPct(t.progress, t.goal);
  const st = TASK_STATUS[t.status];
  const done = t.status === "done";
  return (
    <SortableItem id={t.id} disabled={!sortable} className={cx("border-b border-line bg-bg", fresh && "reveal")}>
      <button type="button" onClick={onOpen} className="grid w-full gap-2.5 px-1 py-3.5 text-left">
        <span className="flex items-start gap-3">
          <span className="grid min-w-0 flex-1 gap-0.5">
            <span className={cx("text-[15.5px] leading-snug font-medium", done && "text-muted line-through decoration-faint")}>{t.title}</span>
            <TaskMeta t={t} done={done} />
          </span>
          <Deadline deadline={t.deadline} left={left} done={done} />
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          <StatusPill label={st.label} toneKey={st.tone} />
          <CategoryTag category={category} />
          <PriorityTag n={t.priority} />
        </span>
      </button>
      {pct !== null && (
        <div className="flex items-center gap-2 px-1 pb-3">
          <ProgressBar pct={pct} label={`${t.progress ?? 0} de ${t.goal}`} />
          {!done && <ProgressButtons task={t} />}
        </div>
      )}
    </SortableItem>
  );
}

/** Deadline: la fecha y, si está cerca o vencida, una etiqueta suave de color. */
function Deadline({ deadline, left, done }: { deadline: string | null; left: number | null; done: boolean }) {
  if (!deadline) return <span className="text-faint" aria-label="Sin deadline">–</span>;
  const tone =
    done || left === null || left > 2
      ? null
      : left < 0
        ? "bg-[var(--st-fail-bg)] text-[var(--st-fail-fg)]"
        : "bg-[var(--st-skip-bg)] text-[var(--st-skip-fg)]";
  return (
    <span className="grid shrink-0 justify-items-start gap-1">
      <span className="text-[13.5px] tabular">{formatShort(deadline)}</span>
      {!done && left !== null && (
        <span className={cx("rounded-md text-[11.5px] leading-none", tone ? `${tone} px-1.5 py-1 font-medium` : "text-muted")}>
          {daysLeftLabel(left)}
        </span>
      )}
    </span>
  );
}

/** Botones de +1 / −1 del progreso (en la tabla aparecen al pasar el mouse). */
function ProgressButtons({ task: t, hover }: { task: TaskDTO; hover?: boolean }) {
  const [, start] = useSafeTransition();
  const cls =
    "relative inline-flex size-8 items-center justify-center rounded-full text-muted transition-colors before:absolute before:-inset-1.5 hover:bg-surface-3 hover:text-fg";
  return (
    <span className={cx("flex shrink-0", hover && "opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100")}>
      <button type="button" onClick={() => start(() => bumpTaskProgress(t.id, -1))} aria-label={`Restar uno al progreso de ${t.title}`} className={cls}>
        <Minus size={13} weight="bold" />
      </button>
      <button type="button" onClick={() => start(() => bumpTaskProgress(t.id, 1))} aria-label={`Sumar uno al progreso de ${t.title}`} className={cls}>
        <Plus size={13} weight="bold" />
      </button>
    </span>
  );
}

/** En la computadora, la vista es una tabla ancha como la base de Notion. */
function TaskTable({
  tasks,
  cats,
  today,
  onOpen,
  sortable,
  onReorder,
  columns,
  onMenu,
  fresh,
}: {
  /** Filas recién aparecidas: entran con un fundido. */
  fresh?: Set<string>;
  tasks: TaskDTO[];
  cats: Map<string, CategoryDTO>;
  today: string;
  onOpen: (t: TaskDTO) => void;
  /** Clic y arrastrar una fila para cambiar el orden. */
  sortable: boolean;
  onReorder: (ids: string[]) => void;
  columns: TaskColumnWidths;
  onMenu: (e: React.MouseEvent, t: TaskDTO) => void;
}) {
  const [widths, setWidths] = useState<TaskColumnWidths>(columns);
  const widthOf = (k: TaskColumnKey) => widths[k] ?? TASK_COLUMNS.find((c) => c.key === k)!.width;
  const total = TASK_COLUMNS.reduce((a, c) => a + widthOf(c.key), 0) + 180;
  function resize(k: TaskColumnKey, w: number | null, save: boolean) {
    const next = { ...widths };
    if (w === null) delete next[k];
    else next[k] = Math.round(Math.min(TASK_COLUMN_MAX, Math.max(TASK_COLUMN_MIN, w)));
    setWidths(next);
    if (save) quiet(saveTaskColumns(next));
  }
  return (
    // El envoltorio de arrastre va por fuera de la tabla (mete elementos de accesibilidad que una tabla no admite).
    <Sortable ids={tasks.map((t) => t.id)} onReorder={onReorder} disabled={!sortable}>
    <div className="hidden overflow-x-auto overflow-y-hidden rounded-2xl border border-line bg-surface lg:block">
      <table className="w-full table-fixed text-left text-[14px]" style={{ minWidth: total }}>
        <colgroup>
          {TASK_COLUMNS.map((c) => (
            <col key={c.key} style={{ width: widthOf(c.key) }} />
          ))}
          <col />
        </colgroup>
        <thead>
          <tr className="border-b border-line text-[12px] text-muted">
            {TASK_COLUMNS.map((c, i) => (
              <th
                key={c.key}
                className={cx("relative py-3 font-medium", i === 0 ? "pr-3 pl-5" : "px-3", c.key === "scheduled" && "text-center")}
              >
                <span className="block truncate">{c.label}</span>
                <ColumnResizer label={c.label} width={widthOf(c.key)} onResize={(w, save) => resize(c.key, w, save)} />
              </th>
            ))}
            <th className="py-3 pr-5 pl-3 font-medium">Progreso</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => {
            const left = daysLeft(t.deadline, today);
            const pct = progressPct(t.progress, t.goal);
            const st = TASK_STATUS[t.status];
            const done = t.status === "done";
            return (
              <SortableItem
                as="tr"
                key={t.id}
                id={t.id}
                disabled={!sortable}
                onContextMenu={(e) => onMenu(e, t)}
                className={cx("group border-b border-line bg-surface transition-colors last:border-b-0 hover:bg-surface-2/60", fresh?.has(t.id) && "reveal")}
                draggingClass="shadow-[0_12px_32px_-12px_rgba(0,0,0,0.35)]"
              >
                <td className="py-2 pr-3 pl-3">
                  <div className="flex items-center">
                  {!done && (
                    // Arrastrar esta agarradera a un día de la semana agenda la tarea.
                    // (La fila entera se arrastra para ordenar: esto va aparte.)
                    <span
                      draggable
                      role="button"
                      tabIndex={-1}
                      aria-label={`Arrastrar "${t.title}" a un día de la semana para agendarla`}
                      title="Arrastrala a un día de la semana para agendarla"
                      onMouseDown={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                      onDragStart={(e) => {
                        e.dataTransfer.setData(TASK_DRAG, t.id);
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      className="-ml-1 inline-flex size-8 shrink-0 cursor-grab items-center justify-center rounded-md text-faint transition-colors group-hover:text-muted hover:bg-surface-2 hover:text-fg active:cursor-grabbing"
                    >
                      <CalendarPlus size={16} aria-hidden />
                    </span>
                  )}
                  <button type="button" onClick={() => onOpen(t)} className="grid min-h-12 w-full min-w-0 content-center gap-0.5 rounded-lg px-2 text-left">
                    <span className={cx("leading-snug font-medium", done && "text-muted line-through decoration-faint")}>{t.title}</span>
                    <TaskMeta t={t} done={done} hideScheduled />
                  </button>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <StatusPill label={st.label} toneKey={st.tone} />
                </td>
                <td className="px-3 py-2">
                  <CategoryTag category={t.categoryId ? cats.get(t.categoryId) : null} />
                </td>
                <td className="px-3 py-2">
                  <PriorityTag n={t.priority} />
                </td>
                <td className="px-3 py-2">
                  <Deadline deadline={t.deadline} left={left} done={done} />
                </td>
                <td className="px-3 py-2 text-center">
                  <ScheduledBox task={t} />
                </td>
                <td className="py-2 pr-4 pl-3">
                  {pct !== null ? (
                    <span className="flex items-center gap-2">
                      <ProgressBar pct={pct} label={`${t.progress ?? 0}/${t.goal}`} />
                      {!done && <ProgressButtons task={t} hover />}
                    </span>
                  ) : (
                    <span className="text-faint" aria-label="Sin progreso">–</span>
                  )}
                </td>
              </SortableItem>
            );
          })}
        </tbody>
      </table>
    </div>
    </Sortable>
  );
}

/**
 * Borde derecho de un encabezado: arrastrar cambia el ancho de la columna
 * (se guarda al soltar); doble clic vuelve al ancho de siempre; con teclado, flechas.
 */
function ColumnResizer({ label, width, onResize }: { label: string; width: number; onResize: (w: number | null, save: boolean) => void }) {
  const start = useRef<{ x: number; w: number } | null>(null);
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={`Ancho de ${label}`}
      aria-valuenow={width}
      tabIndex={0}
      title="Arrastrá para cambiar el ancho · doble clic: ancho original"
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        start.current = { x: e.clientX, w: width };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (start.current) onResize(start.current.w + e.clientX - start.current.x, false);
      }}
      onPointerUp={(e) => {
        if (!start.current) return;
        onResize(start.current.w + e.clientX - start.current.x, true);
        start.current = null;
      }}
      onDoubleClick={() => onResize(null, true)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          onResize(width + (e.key === "ArrowRight" ? 16 : -16), true);
        }
      }}
      className="group/res absolute inset-y-0 right-0 z-10 flex w-3 cursor-col-resize touch-none justify-end outline-none"
    >
      <span className="my-2 w-0.5 rounded-full bg-line transition-colors group-hover/res:bg-accent group-focus-visible/res:bg-accent group-active/res:bg-accent" />
    </span>
  );
}

/** Casilla "Agendada" (se tilda en la tabla, como en Notion). */
function ScheduledBox({ task }: { task: TaskDTO }) {
  const [on, setOn] = useOptimistic(task.scheduled);
  const [, start] = useSafeTransition();
  const [tapped, setTapped] = useState(false);
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={`${task.title}: ${on ? "agendada" : "sin agendar"}`}
      onClick={() => {
        setTapped(true);
        start(async () => {
          setOn(!on);
          await setTaskScheduled(task.id, !on);
        });
      }}
      className="inline-flex size-11 items-center justify-center rounded-full"
    >
      <span
        className={cx(
          "inline-flex size-[22px] items-center justify-center rounded-[4px] border-[1.5px] transition-colors",
          on ? "border-[var(--st-done-line)] bg-[var(--st-done-line)] text-on-accent" : "border-fg/45 hover:border-fg/70",
        )}
      >
        {on && <Check size={14} weight="bold" className={tapped ? "mark-pop" : undefined} />}
      </span>
    </button>
  );
}

/** Debajo del título: pasos, si se repite, cuántos links y si está agendada (en la tabla, eso va en su columna). */
function TaskMeta({ t, done, hideScheduled }: { t: TaskDTO; done: boolean; hideScheduled?: boolean }) {
  const steps = t.subtasks.length ? `${t.subtasks.filter((s) => s.done).length}/${t.subtasks.length} pasos` : null;
  const rep = repeatLabel(t.repeat, t.repeatEvery);
  const links = t.links.length ? (t.links.length === 1 ? "1 link" : `${t.links.length} links`) : null;
  const parts = [steps, rep && `se repite ${rep.toLowerCase()}`, links, t.scheduled && !done && !hideScheduled ? "agendada" : null].filter(Boolean);
  if (!parts.length) return null;
  return <span className="text-[12px] text-muted first-letter:uppercase">{parts.join(" · ")}</span>;
}
