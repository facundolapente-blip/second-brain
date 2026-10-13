"use client";

import { useNewIds } from "@/components/motion";
import { notifyDeleted } from "@/components/undo-toast";
import { showContextMenu } from "@/components/context-menu";
import { quiet, useSafeTransition } from "@/components/safe-action";
import { Fragment, useOptimistic, useRef, useState, useEffect } from "react";
import { CaretDown, Check, Plus, CalendarPlus, CopySimple, NotePencil, PencilSimple, Trash } from "@phosphor-icons/react";
import { saveTaskColumns, setTaskScheduled, deleteTask, duplicateTask, renameTask } from "@/lib/offline/plan";
import { formatShort } from "@/lib/dates";
import { applyTaskView, daysLeft, TASKS_FOLD_COOKIE, daysLeftLabel, progressPct, repeatLabel, TASK_STATUS, TASK_VIEWS, type CategoryDTO, type TaskDTO, type TaskStatus, type TaskView, TASK_COLUMNS, TASK_COLUMN_MAX, TASK_COLUMN_MIN, TASK_FLEX_COLUMN, type TaskColumnKey, type TaskColumnWidths, TASK_DRAG } from "@/lib/plan-logic";
import { Button, cx } from "@/components/ui";
import { BlockSheet, type BlockSheetHandle } from "../block-sheet";
import { CategoryTag, categoryMap, PriorityTag } from "../plan-ui";
import { tone } from "@/lib/palette";
import { TaskSheet, type TaskSheetHandle } from "./task-sheet";

const LIMIT = 6;

/** Orden de los grupos de la tabla (en "Terminadas" hay uno solo). */
const GROUPS: TaskStatus[] = ["doing", "todo", "backlog", "done"];

/**
 * Agrupa por estado y, dentro de cada grupo, primero lo que vence antes
 * (sin deadline al final, en el orden de la vista). "Terminadas" queda como
 * viene: de la terminada más reciente a la más vieja.
 */
function arrange(list: TaskDTO[], view: TaskView): TaskDTO[] {
  if (view === "done") return list;
  return list
    .map((t, i) => ({ t, i }))
    .sort(
      (a, b) =>
        GROUPS.indexOf(a.t.status) - GROUPS.indexOf(b.t.status) ||
        (a.t.deadline ?? "9999").localeCompare(b.t.deadline ?? "9999") ||
        a.i - b.i,
    )
    .map((x) => x.t);
}

/** Tareas visibles partidas en grupos de estado, con el total del grupo en la vista. */
function groupsOf(visible: TaskDTO[], matching: TaskDTO[]) {
  return GROUPS.map((status) => ({
    status,
    tasks: visible.filter((t) => t.status === status),
    total: matching.filter((t) => t.status === status).length,
  })).filter((g) => g.tasks.length > 0);
}

/**
 * Tareas arriba de la semana, en la misma página (como el Plan Semanal de
 * Notion): vistas guardadas, tabla en la computadora y lista en el celular.
 * Muestra las primeras 6 y el resto con "Ver todas".
 */
/** Vista y "Ver todas" del tablero: viven mientras la app está abierta (cambiar de semana no los pierde). */
const savedBoard: { view: TaskView; all: boolean; widths?: TaskColumnWidths } = { view: "deadline", all: false };

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
  // Anchos de columna: uno solo para todas las vistas (se guardan al soltar y sobreviven al cambio de vista y de semana).
  const [widths, setWidths] = useState<TaskColumnWidths>(() => savedBoard.widths ?? columns);
  function resize(k: TaskColumnKey, w: number | null, save: boolean) {
    const next = { ...widths };
    if (w === null) delete next[k];
    else next[k] = Math.round(Math.min(TASK_COLUMN_MAX, Math.max(TASK_COLUMN_MIN, w)));
    setWidths(next);
    if (save) quiet(saveTaskColumns(next));
  }
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
    savedBoard.widths = widths;
  }, [view, all, widths]);
  const sheet = useRef<TaskSheetHandle>(null);
  const blockSheet = useRef<BlockSheetHandle>(null);
  const cats = categoryMap(categories);
  const manual = manualOrder;
  const ordered = tasks;
  const matching = arrange(applyTaskView(ordered, view, manual), view);
  const visible = all ? matching : matching.slice(0, LIMIT);
  const groups = groupsOf(visible, matching);
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
        // Celular: tira que se corre de costado (llega al borde). Compu: si no entran, bajan de renglón.
        className="-mx-4 flex gap-1.5 overflow-x-auto px-4 py-3 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden"
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
              <span className={cx("font-mono text-[11px] tabular", on ? "text-on-ink" : "text-muted")}>{n}</span>
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
          <TaskTable groups={groups} fresh={fresh} cats={cats} today={today} onOpen={(t) => sheet.current?.open(t)} onMenu={taskMenu} widths={widths} onResize={resize} />
          {/* Celular: la misma agrupación, con la fecha a la izquierda. */}
          <ul className="grid border-t border-line lg:hidden">
            {groups.map((g) => (
              <Fragment key={g.status}>
                <li>
                  <GroupLabel status={g.status} total={g.total} className="border-b border-line px-1 py-2.5" />
                </li>
                {g.tasks.map((t) => (
                  <TaskRow
                    key={t.id}
                    fresh={fresh.has(t.id)}
                    task={t}
                    category={t.categoryId ? cats.get(t.categoryId) : null}
                    today={today}
                    onOpen={() => sheet.current?.open(t)}
                  />
                ))}
              </Fragment>
            ))}
          </ul>
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
  fresh,
}: {
  task: TaskDTO;
  category?: CategoryDTO | null;
  today: string;
  onOpen: () => void;
  /** Recién aparecida ("Ver todas", nueva): entra con un fundido. */
  fresh?: boolean;
}) {
  const left = daysLeft(t.deadline, today);
  const done = t.status === "done";
  return (
    <li className={cx("border-b border-line", fresh && "reveal")}>
      <button type="button" onClick={onOpen} className="flex w-full items-start gap-3 px-1 py-3 text-left">
        <DateBlock deadline={t.deadline} left={left} done={done} />
        <span className="grid min-w-0 flex-1 gap-1">
          <span className={cx("text-[15.5px] leading-snug font-medium", done && "text-muted line-through decoration-faint")}>{t.title}</span>
          <TaskMeta t={t} done={done} />
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <CategoryTag category={category} />
            <PriorityTag n={t.priority} />
            <DueLabel left={left} done={done} />
          </span>
        </span>
      </button>
      {t.subtasks.length > 0 && (
        <div className="flex items-center gap-2 pr-1 pb-3 pl-[3.75rem]">
          <Steps task={t} />
        </div>
      )}
    </li>
  );
}

/** Encabezado de un grupo de estado: cuadradito del color del estado, nombre y cuántas hay. */
function GroupLabel({ status, total, className }: { status: TaskStatus; total: number; className?: string }) {
  const st = TASK_STATUS[status];
  return (
    <span className={cx("flex items-center gap-2 text-[12.5px] font-semibold", className)}>
      <span aria-hidden style={tone(st.tone)} className="size-2 rounded-[3px] bg-[var(--tone-chip)]" />
      {st.label}
      <span className="font-mono text-[12px] font-normal text-muted tabular">{total}</span>
    </span>
  );
}

/**
 * La fecha del deadline como un calendario chico (día grande, mes abajo):
 * en rojo si venció, en amarillo si vence en 2 días o menos.
 */
function DateBlock({ deadline, left, done }: { deadline: string | null; left: number | null; done: boolean }) {
  if (!deadline) {
    return (
      <span className="grid h-[42px] w-11 shrink-0 place-items-center rounded-lg bg-surface-2 text-[13px] text-faint" aria-label="Sin deadline">
        –
      </span>
    );
  }
  const [day, month] = formatShort(deadline).split(" ");
  const late = !done && left !== null && left < 0;
  const near = !done && left !== null && left >= 0 && left <= 2;
  return (
    <span
      title={`${formatShort(deadline)} ${deadline.slice(0, 4)}`}
      className={cx(
        "grid h-[42px] w-11 shrink-0 content-center justify-items-center gap-0.5 rounded-lg leading-none",
        late ? "bg-[var(--st-fail-bg)] text-[var(--st-fail-fg)]" : near ? "bg-[var(--st-skip-bg)] text-[var(--st-skip-fg)]" : "bg-surface-2",
      )}
    >
      <span className="text-[16px] font-semibold tracking-[-0.02em] tabular">{day}</span>
      <span className={cx("font-mono text-[9.5px] tracking-[0.06em] uppercase", !late && !near && "text-muted")}>{month}</span>
    </span>
  );
}

/** Cuánto falta o cuánto pasó ("ayer", "en 16 días"), en rojo si venció. */
function DueLabel({ left, done }: { left: number | null; done: boolean }) {
  if (done || left === null) return null;
  return (
    <span className={cx("inline-block font-mono text-[12px] tabular first-letter:lowercase", left < 0 ? "text-danger" : left <= 2 ? "text-[var(--st-skip-fg)]" : "text-muted")}>
      {daysLeftLabel(left)}
    </span>
  );
}

/** Progreso = pasos tildados de la tarea, en segmentos (uno por paso; con más de 10, barra). */
function Steps({ task }: { task: TaskDTO }) {
  const goal = task.subtasks.length;
  const n = task.subtasks.filter((s) => s.done).length;
  const full = n >= goal;
  // Ocupa todo el ancho de la columna (Facu: sobraba espacio); hasta 10 pasos, un segmento por paso.
  return (
    <span className="flex w-full min-w-0 items-center gap-2.5" aria-label={`Avance: ${n} de ${goal} pasos`}>
      {goal > 10 ? (
        <span className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
          <span className={cx("bar-anim block h-full rounded-full", full ? "bg-[var(--st-done-line)]" : "bg-accent")} style={{ width: `${progressPct(n, goal) ?? 0}%` }} />
        </span>
      ) : (
        <span className="flex min-w-0 flex-1 gap-1" aria-hidden>
          {Array.from({ length: goal }, (_, i) => (
            <span key={i} className={cx("h-3 min-w-0 flex-1 rounded-[3px] transition-colors", i < n ? (full ? "bg-[var(--st-done-line)]" : "bg-accent") : "bg-surface-3")} />
          ))}
        </span>
      )}
      <span className="shrink-0 font-mono text-[12.5px] text-muted tabular" aria-hidden>
        {n}/{goal}
      </span>
    </span>
  );
}

/** Celdas de la planilla: líneas finas entre columnas. */
const CELL = "border-l border-line first:border-l-0";
/**
 * Columnas que en la tabla compacta (menos de 1440 px) pasan debajo del nombre.
 * Se achican a 0 en vez de ocultarse: una celda con display:none corre a las de al lado de columna.
 */
const WIDE_ONLY = "max-[90rem]:invisible max-[90rem]:overflow-hidden max-[90rem]:border-l-0 max-[90rem]:px-0";
/** Anchos de la tabla compacta (pisan los guardados): la tarea toma lo que sobra. */
const COMPACT_COL: Record<TaskColumnKey, string> = {
  date: "max-[90rem]:w-[4.5rem]!",
  title: "max-[90rem]:w-auto!",
  category: "max-[90rem]:w-0!",
  priority: "max-[90rem]:w-0!",
  deadline: "max-[90rem]:w-[7.5rem]!",
  progress: "max-[90rem]:w-[10.5rem]!",
  scheduled: "max-[90rem]:w-[6rem]!",
};
const COMPACT_HIDDEN = new Set<TaskColumnKey>(["category", "priority"]);

/**
 * En la computadora, una planilla agrupada por estado (como los grupos de
 * Notion): la fecha del deadline adelante, filas bajas con rayado suave y
 * líneas finas. Hasta 1440 px, Categoría y Prioridad van debajo del nombre.
 */
function TaskTable({
  groups,
  cats,
  today,
  onOpen,
  onMenu,
  fresh,
  widths,
  onResize: resize,
}: {
  groups: ReturnType<typeof groupsOf>;
  /** Anchos guardados (los mismos en todas las vistas); se cambian arrastrando el borde del encabezado. */
  widths: TaskColumnWidths;
  onResize: (k: TaskColumnKey, w: number | null, save: boolean) => void;
  /** Filas recién aparecidas: entran con un fundido. */
  fresh?: Set<string>;
  cats: Map<string, CategoryDTO>;
  today: string;
  onOpen: (t: TaskDTO) => void;
  onMenu: (e: React.MouseEvent, t: TaskDTO) => void;
}) {
  const widthOf = (k: TaskColumnKey) => widths[k] ?? TASK_COLUMNS.find((c) => c.key === k)!.width;
  // Tarea toma lo que sobra (su ancho es el mínimo); el resto, incluido Progreso, se cambia arrastrando.
  const flexMin = TASK_COLUMNS.find((c) => c.key === TASK_FLEX_COLUMN)!.width;
  const total = TASK_COLUMNS.reduce((a, c) => a + (c.key === TASK_FLEX_COLUMN ? flexMin : widthOf(c.key)), 0);
  const cols = TASK_COLUMNS.map((c) => c.key);
  const head = (k: TaskColumnKey) => ({ label: TASK_COLUMNS.find((c) => c.key === k)!.label });
  return (
    // Si los anchos guardados suman más que la pantalla, la tabla se corre de costado.
    <div className="hidden overflow-x-auto overflow-y-hidden rounded-xl border border-line-strong bg-surface lg:block">
      <table className="w-full table-fixed border-collapse text-left text-[13.5px] max-[90rem]:min-w-0!" style={{ minWidth: total }}>
        <colgroup>
          {cols.map((k) =>
            k === TASK_FLEX_COLUMN ? (
              <col key={k} className={COMPACT_COL[k]} />
            ) : (
              <col key={k} style={{ width: widthOf(k) }} className={COMPACT_COL[k]} />
            ),
          )}
        </colgroup>
        <thead>
          <tr className="border-b border-line-strong bg-surface-2 text-[11px] tracking-[0.06em] text-muted uppercase">
            {cols.map((k) => (
              <th
                key={k}
                className={cx(
                  CELL,
                  "relative py-2.5 font-medium",
                  k === "scheduled" ? "px-2 text-center" : "px-3",
                  COMPACT_HIDDEN.has(k) && WIDE_ONLY,
                )}
              >
                <span className="block truncate">{head(k).label}</span>
                {k !== TASK_FLEX_COLUMN && <ColumnResizer label={head(k).label} width={widthOf(k)} onResize={(w, save) => resize(k, w, save)} />}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <Fragment key={g.status}>
              <tr className="border-b border-line-strong bg-surface-2">
                <td colSpan={7} className="px-4 py-2">
                  <GroupLabel status={g.status} total={g.total} />
                </td>
              </tr>
              {g.tasks.map((t, i) => {
                const left = daysLeft(t.deadline, today);
                const done = t.status === "done";
                return (
                  <tr
                    key={t.id}
                    onContextMenu={(e) => onMenu(e, t)}
                    className={cx(
                      "group border-b border-line transition-colors last:border-b-0 hover:bg-surface-2",
                      i % 2 === 1 && "bg-[color-mix(in_oklab,var(--surface-2)_45%,var(--surface))]",
                      fresh?.has(t.id) && "reveal",
                    )}
                  >
                    <td className={cx(CELL, "px-3 py-1.5")}>
                      <DateBlock deadline={t.deadline} left={left} done={done} />
                    </td>
                    <td className={cx(CELL, "py-1 pr-3 pl-1.5")}>
                      <div className="flex items-center">
                        {!done && (
                          // Arrastrar esta agarradera a un día de la semana agenda la tarea.
                          <span
                            draggable
                            role="button"
                            tabIndex={-1}
                            aria-label={`Arrastrar "${t.title}" a un día de la semana para agendarla`}
                            title="Arrastrala a un día de la semana para agendarla"
                            onDragStart={(e) => {
                              e.dataTransfer.setData(TASK_DRAG, t.id);
                              e.dataTransfer.effectAllowed = "copy";
                            }}
                            className="inline-flex size-8 shrink-0 cursor-grab items-center justify-center rounded-md text-faint transition-colors group-hover:text-muted hover:bg-surface-2 hover:text-fg active:cursor-grabbing"
                          >
                            <CalendarPlus size={16} aria-hidden />
                          </span>
                        )}
                        <button type="button" onClick={() => onOpen(t)} className={cx("grid min-h-11 w-full min-w-0 content-center gap-0.5 rounded-lg px-2 text-left", done && "pl-10")}>
                          <span className={cx("leading-snug font-medium", done && "text-muted line-through decoration-faint")}>{t.title}</span>
                          <TaskMeta t={t} done={done} hideScheduled />
                          {/* Tabla compacta: categoría y prioridad debajo del nombre. */}
                          {(t.categoryId || t.priority > 0) && (
                            <span className="mt-1 flex flex-wrap items-center gap-1.5 min-[90rem]:hidden">
                              <CategoryTag category={t.categoryId ? cats.get(t.categoryId) : null} />
                              <PriorityTag n={t.priority} />
                            </span>
                          )}
                        </button>
                      </div>
                    </td>
                    <td className={cx(CELL, "px-3", WIDE_ONLY)}>
                      <CategoryTag category={t.categoryId ? cats.get(t.categoryId) : null} />
                    </td>
                    <td className={cx(CELL, "px-3", WIDE_ONLY)}>
                      <PriorityTag n={t.priority} />
                    </td>
                    <td className={cx(CELL, "px-3")}>
                      {done || left === null ? <span className="text-faint" aria-label="Sin deadline">–</span> : <DueLabel left={left} done={done} />}
                    </td>
                    <td className={cx(CELL, "px-3")}>
                      {t.subtasks.length > 0 ? (
                        <Steps task={t} />
                      ) : (
                        <span className="text-faint" aria-label="Sin progreso">–</span>
                      )}
                    </td>
                    <td className={cx(CELL, "px-2 text-center")}>
                      <ScheduledBox task={t} />
                    </td>
                  </tr>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
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
      className="group/res absolute inset-y-0 right-0 z-10 flex w-3 cursor-col-resize touch-none justify-end outline-none max-[90rem]:hidden"
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

/** Debajo del título: si se repite, cuántos links y si está agendada (en la tabla, eso va en su columna). */
function TaskMeta({ t, done, hideScheduled }: { t: TaskDTO; done: boolean; hideScheduled?: boolean }) {
  const rep = repeatLabel(t.repeat, t.repeatEvery);
  const links = t.links.length ? (t.links.length === 1 ? "1 link" : `${t.links.length} links`) : null;
  const parts = [rep && `se repite ${rep.toLowerCase()}`, links, t.scheduled && !done && !hideScheduled ? "agendada" : null].filter(Boolean);
  if (!parts.length) return null;
  return <span className="text-[12px] text-muted first-letter:uppercase">{parts.join(" · ")}</span>;
}
