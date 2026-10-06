"use client";

import { useRef, useState, useTransition } from "react";
import { Minus, Plus } from "@phosphor-icons/react";
import { bumpTaskProgress } from "@/lib/plan-actions";
import { formatShort } from "@/lib/dates";
import {
  applyTaskView,
  daysLeft,
  daysLeftLabel,
  progressPct,
  repeatLabel,
  TASK_STATUS,
  TASK_VIEWS,
  type CategoryDTO,
  type TaskDTO,
  type TaskView,
} from "@/lib/plan-logic";
import { Button, cx } from "@/components/ui";
import { BlockSheet, type BlockSheetHandle } from "../block-sheet";
import { CategoryTag, categoryMap, PriorityTag, ProgressBar, StatusPill } from "../plan-ui";
import { TaskSheet, type TaskSheetHandle } from "./task-sheet";

const LIMIT = 6;

/**
 * Tareas arriba de la semana, en la misma página (como el Plan Semanal de
 * Notion): vistas guardadas, tabla en la computadora y lista en el celular.
 * Muestra las primeras 6 y el resto con "Ver todas".
 */
export function TasksBoard({
  tasks,
  categories,
  today,
}: {
  tasks: TaskDTO[];
  categories: CategoryDTO[];
  today: string;
}) {
  const [view, setView] = useState<TaskView>("todo");
  const [all, setAll] = useState(false);
  const sheet = useRef<TaskSheetHandle>(null);
  const blockSheet = useRef<BlockSheetHandle>(null);
  const cats = categoryMap(categories);
  const matching = applyTaskView(tasks, view);
  const visible = all ? matching : matching.slice(0, LIMIT);
  const hidden = matching.length - visible.length;
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
        <h2 className="display text-[22px] lg:text-[26px]">Tareas</h2>
        <span className="font-mono text-[12px] text-muted tabular">
          {tasks.filter((t) => t.status !== "done").length} abiertas
        </span>
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => sheet.current?.open()}>
          <Plus size={15} weight="bold" /> Nueva tarea
        </Button>
      </div>
      <div
        role="tablist"
        aria-label="Vistas"
        className="-mx-4 flex gap-1.5 overflow-x-auto px-4 py-3 [scrollbar-width:none] lg:mx-0 lg:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {TASK_VIEWS.map((v) => {
          const n = applyTaskView(tasks, v.id).length;
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
              <span className={cx("font-mono text-[11px] tabular", on ? "text-on-ink/70" : "text-faint")}>{n}</span>
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <div className="grid justify-items-start gap-3 border-y border-line py-6">
          <p className="text-[15px] text-muted">
            {view === "done" ? "Todavía no terminaste ninguna tarea." : "No hay tareas en esta vista."}
          </p>
        </div>
      ) : (
        <>
          <TaskTable tasks={visible} cats={cats} today={today} onOpen={(t) => sheet.current?.open(t)} />
          <ul className="grid border-t border-line lg:hidden">
            {visible.map((t, i) => (
              <TaskRow
                key={t.id}
                index={i}
                task={t}
                category={t.categoryId ? cats.get(t.categoryId) : null}
                today={today}
                onOpen={() => sheet.current?.open(t)}
              />
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
  index,
}: {
  task: TaskDTO;
  category?: CategoryDTO | null;
  today: string;
  onOpen: () => void;
  index: number;
}) {
  const left = daysLeft(t.deadline, today);
  const pct = progressPct(t.progress, t.goal);
  const st = TASK_STATUS[t.status];
  const done = t.status === "done";
  return (
    <li className="rise border-b border-line" style={{ "--i": Math.min(index, 8) } as React.CSSProperties}>
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
    </li>
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
  const [, start] = useTransition();
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
}: {
  tasks: TaskDTO[];
  cats: Map<string, CategoryDTO>;
  today: string;
  onOpen: (t: TaskDTO) => void;
}) {
  return (
    <div className="hidden overflow-x-auto overflow-y-hidden rounded-2xl border border-line bg-surface lg:block">
      <table className="w-full min-w-[56rem] table-fixed text-left text-[14px]">
        <thead>
          <tr className="border-b border-line text-[12px] text-muted">
            <th className="w-[31%] py-3 pr-3 pl-5 font-medium">Tarea</th>
            <th className="w-[14%] px-3 py-3 font-medium">Estado</th>
            <th className="w-[14%] px-3 py-3 font-medium">Categoría</th>
            <th className="w-[11%] px-3 py-3 font-medium">Prioridad</th>
            <th className="w-[12%] px-3 py-3 font-medium">Deadline</th>
            <th className="py-3 pr-5 pl-3 font-medium">Progreso</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t, i) => {
            const left = daysLeft(t.deadline, today);
            const pct = progressPct(t.progress, t.goal);
            const st = TASK_STATUS[t.status];
            const done = t.status === "done";
            return (
              <tr
                key={t.id}
                className="group rise border-b border-line transition-colors last:border-b-0 hover:bg-surface-2/60"
                style={{ "--i": Math.min(i, 8) } as React.CSSProperties}
              >
                <td className="py-2 pr-3 pl-3">
                  <button type="button" onClick={() => onOpen(t)} className="grid min-h-12 w-full content-center gap-0.5 rounded-lg px-2 text-left">
                    <span className={cx("leading-snug font-medium", done && "text-muted line-through decoration-faint")}>{t.title}</span>
                    <TaskMeta t={t} done={done} />
                  </button>
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
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Debajo del título: pasos, si se repite y si está agendada. */
function TaskMeta({ t, done }: { t: TaskDTO; done: boolean }) {
  const steps = t.subtasks.length ? `${t.subtasks.filter((s) => s.done).length}/${t.subtasks.length} pasos` : null;
  const rep = repeatLabel(t.repeat, t.repeatEvery);
  const parts = [steps, rep && `se repite ${rep.toLowerCase()}`, t.scheduled && !done ? "agendada" : null].filter(Boolean);
  if (!parts.length) return null;
  return <span className="text-[12px] text-muted first-letter:uppercase">{parts.join(" · ")}</span>;
}
