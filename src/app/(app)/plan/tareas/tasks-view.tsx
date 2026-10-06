"use client";

import { useRef, useState, useTransition } from "react";
import { CalendarCheck, Minus, Plus } from "@phosphor-icons/react";
import { bumpTaskProgress } from "@/lib/plan-actions";
import { formatShort } from "@/lib/dates";
import {
  applyTaskView,
  daysLeft,
  daysLeftLabel,
  progressPct,
  TASK_STATUS,
  TASK_VIEWS,
  type CategoryDTO,
  type TaskDTO,
  type TaskView,
} from "@/lib/plan-logic";
import type { LinkableHabit } from "@/lib/plan";
import { Button, cx } from "@/components/ui";
import { BlockSheet, type BlockSheetHandle } from "../block-sheet";
import { CategoryTag, categoryMap, Fires, ProgressSquares, StatusPill } from "../plan-ui";
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
  habits,
  today,
}: {
  tasks: TaskDTO[];
  categories: CategoryDTO[];
  habits: LinkableHabit[];
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
        habits={habits}
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
  const [, start] = useTransition();
  const left = daysLeft(t.deadline, today);
  const pct = progressPct(t.progress, t.goal);
  const st = TASK_STATUS[t.status];
  const urgent = left !== null && left <= 2 && t.status !== "done";
  return (
    <li
      className="rise border-b border-line transition-colors hover:bg-surface-2/50"
      style={{ "--i": Math.min(index, 8) } as React.CSSProperties}
    >
      <button type="button" onClick={onOpen} className="grid w-full gap-2 px-1 py-4 text-left">
        <span className="flex items-start gap-3">
          <span className={cx("min-w-0 flex-1 text-[16px] leading-snug font-medium", t.status === "done" && "text-muted line-through decoration-faint")}>
            {t.title}
          </span>
          {left !== null && t.status !== "done" && (
            <span
              className={cx(
                "shrink-0 font-mono text-[11px] font-medium tabular",
                left < 0 ? "text-danger" : urgent ? "text-[var(--p-orange-fg)]" : "text-muted",
              )}
            >
              {daysLeftLabel(left)}
            </span>
          )}
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          <CategoryTag category={category} />
          <StatusPill label={st.label} toneKey={st.tone} />
          <Fires n={t.priority} />
          {t.scheduled && (
            <span className="inline-flex items-center gap-1 text-[12px] text-accent-fg">
              <CalendarCheck size={14} weight="fill" aria-hidden /> Agendada
            </span>
          )}
          {t.deadline && (
            <span className="font-mono text-[11px] text-muted tabular">
              {formatShort(t.deadline)}
            </span>
          )}
        </span>
      </button>
      {pct !== null && (
        <div className="flex items-center gap-2 border-t border-dashed border-line px-1 py-1.5">
          <ProgressSquares pct={pct} label={`${t.progress ?? 0} de ${t.goal}`} />
          {t.status !== "done" && (
            <span className="ml-auto flex">
              <button
                type="button"
                onClick={() => start(() => bumpTaskProgress(t.id, -1))}
                aria-label="Restar uno al progreso"
                className="inline-flex size-11 items-center justify-center rounded-[4px] text-muted hover:bg-surface-2 hover:text-fg"
              >
                <Minus size={16} weight="bold" />
              </button>
              <button
                type="button"
                onClick={() => start(() => bumpTaskProgress(t.id, 1))}
                aria-label="Sumar uno al progreso"
                className="inline-flex size-11 items-center justify-center rounded-[4px] text-muted hover:bg-surface-2 hover:text-fg"
              >
                <Plus size={16} weight="bold" />
              </button>
            </span>
          )}
        </div>
      )}
    </li>
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
  const [, start] = useTransition();
  return (
    <div className="hidden overflow-x-auto overflow-y-hidden rounded-2xl border border-line bg-surface lg:block">
      <table className="w-full min-w-[56rem] table-fixed text-left text-[14px]">
        <thead>
          <tr className="border-b border-line bg-surface-2/60 font-mono text-[11px] tracking-[0.06em] text-muted uppercase">
            <th className="w-[30%] py-2.5 pr-3 pl-5 font-medium">Tarea</th>
            <th className="w-[13%] px-3 py-2.5 font-medium">Estado</th>
            <th className="w-[13%] px-3 py-2.5 font-medium">Categoría</th>
            <th className="w-[10%] px-3 py-2.5 font-medium">Prioridad</th>
            <th className="w-[11%] px-3 py-2.5 font-medium">Deadline</th>
            <th className="py-2.5 pr-5 pl-3 font-medium">Progreso</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t, i) => {
            const left = daysLeft(t.deadline, today);
            const pct = progressPct(t.progress, t.goal);
            const st = TASK_STATUS[t.status];
            const urgent = left !== null && left <= 2 && t.status !== "done";
            return (
              <tr
                key={t.id}
                className="rise border-b border-line transition-colors last:border-b-0 hover:bg-surface-2/60"
                style={{ "--i": Math.min(i, 8) } as React.CSSProperties}
              >
                <td className="py-1 pr-3 pl-3">
                  <button type="button" onClick={() => onOpen(t)} className="flex min-h-11 w-full items-center gap-2 rounded-[6px] px-2 text-left">
                    <span
                      className={cx(
                        "min-w-0 flex-1 leading-snug font-medium",
                        t.status === "done" && "text-muted line-through decoration-faint",
                      )}
                    >
                      {t.title}
                    </span>
                    {t.scheduled && <CalendarCheck size={15} weight="fill" className="shrink-0 text-accent-fg" aria-label="Agendada" />}
                  </button>
                </td>
                <td className="px-3 py-1">
                  <StatusPill label={st.label} toneKey={st.tone} />
                </td>
                <td className="px-3 py-1">
                  <CategoryTag category={t.categoryId ? cats.get(t.categoryId) : null} />
                </td>
                <td className="px-3 py-1">
                  <Fires n={t.priority} />
                </td>
                <td className="px-3 py-1 font-mono text-[12px] whitespace-nowrap tabular">
                  {t.deadline ? (
                    <span className="grid">
                      <span>{formatShort(t.deadline)}</span>
                      {left !== null && t.status !== "done" && (
                        <span className={cx("text-[11px]", left < 0 ? "text-danger" : urgent ? "text-[var(--p-orange-fg)]" : "text-muted")}>
                          {daysLeftLabel(left)}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-faint" aria-label="Sin deadline">
                      -
                    </span>
                  )}
                </td>
                <td className="py-1 pr-3 pl-3">
                  {pct !== null ? (
                    <span className="flex items-center gap-1">
                      <ProgressSquares pct={pct} label={`${t.progress ?? 0}/${t.goal}`} />
                      {t.status !== "done" && (
                        <span className="ml-auto flex">
                          <button
                            type="button"
                            onClick={() => start(() => bumpTaskProgress(t.id, -1))}
                            aria-label={`Restar uno al progreso de ${t.title}`}
                            className="relative inline-flex size-9 items-center justify-center rounded-full text-muted before:absolute before:-inset-1 hover:bg-surface-2 hover:text-fg"
                          >
                            <Minus size={14} weight="bold" />
                          </button>
                          <button
                            type="button"
                            onClick={() => start(() => bumpTaskProgress(t.id, 1))}
                            aria-label={`Sumar uno al progreso de ${t.title}`}
                            className="relative inline-flex size-9 items-center justify-center rounded-full text-muted before:absolute before:-inset-1 hover:bg-surface-2 hover:text-fg"
                          >
                            <Plus size={14} weight="bold" />
                          </button>
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-faint" aria-label="Sin progreso">
                      -
                    </span>
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
