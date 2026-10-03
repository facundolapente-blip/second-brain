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
import { PageHeader } from "@/components/page-header";
import { Button, cx } from "@/components/ui";
import { BlockSheet, type BlockSheetHandle } from "../block-sheet";
import { CategoryTag, categoryMap, Fires, ProgressSquares, StatusPill } from "../plan-ui";
import { PlanTabs } from "../plan-nav";
import { TaskSheet, type TaskSheetHandle } from "./task-sheet";

export function TasksView({
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
  const sheet = useRef<TaskSheetHandle>(null);
  const blockSheet = useRef<BlockSheetHandle>(null);
  const cats = categoryMap(categories);
  const visible = applyTaskView(tasks, view);
  const schedule = (t: TaskDTO) =>
    blockSheet.current?.open({
      date: today,
      title: t.title,
      categoryId: t.categoryId,
      priority: t.priority,
      taskId: t.id,
    });

  return (
    <>
      <PageHeader
        title="Tareas"
        tabs={<PlanTabs />}
        actions={
          <Button variant="accent" size="sm" className="max-lg:hidden" onClick={() => sheet.current?.open()}>
            <Plus size={16} weight="bold" /> Nueva tarea
          </Button>
        }
      />
      <main className="mx-auto max-w-3xl px-4 lg:px-10">
        <div
          role="tablist"
          aria-label="Vistas"
          className="-mx-4 flex gap-1.5 overflow-x-auto px-4 py-3 [scrollbar-width:none] lg:mx-0 lg:px-0 lg:pt-5 [&::-webkit-scrollbar]:hidden"
        >
          {TASK_VIEWS.map((v) => {
            const n = applyTaskView(tasks, v.id).length;
            const on = v.id === view;
            return (
              <button
                key={v.id}
                role="tab"
                aria-selected={on}
                onClick={() => setView(v.id)}
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
          <div className="mt-2 grid justify-items-start gap-3 border-y border-line py-8">
            <p className="display text-[20px] text-muted italic">
              {view === "done" ? "Todavía no terminaste ninguna tarea." : "No hay tareas en esta vista."}
            </p>
            <Button variant="outline" size="sm" onClick={() => sheet.current?.open()}>
              <Plus size={15} /> Nueva tarea
            </Button>
          </div>
        ) : (
          <ul className="grid border-t border-line">
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
        )}
      </main>

      <button
        type="button"
        onClick={() => sheet.current?.open()}
        aria-label="Nueva tarea"
        className="lift fixed right-4 bottom-[calc(84px+env(safe-area-inset-bottom))] z-20 inline-flex size-14 items-center justify-center rounded-full bg-ink text-on-ink transition-transform active:scale-95 lg:hidden"
      >
        <Plus size={24} />
      </button>

      <TaskSheet ref={sheet} categories={categories} onSchedule={schedule} />
      <BlockSheet
        ref={blockSheet}
        categories={categories}
        habits={habits}
        tasks={tasks.map((t) => ({ id: t.id, title: t.title, status: t.status }))}
      />
    </>
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
            <span className="tabular text-[12px] text-faint">
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
