"use client";

import { forwardRef, useActionState, useEffect, useEffectEvent, useImperativeHandle, useRef, useState, useTransition } from "react";
import { CalendarPlus } from "@phosphor-icons/react";
import { deleteTask, saveTask } from "@/lib/plan-actions";
import { TASK_STATUS, type CategoryDTO, type TaskDTO, type TaskStatus } from "@/lib/plan-logic";
import { tone } from "@/lib/palette";
import { Button, ConfirmButton, cx, Field, Input, inputClass, Segmented, Sheet, type SheetHandle } from "@/components/ui";
import { FirePicker } from "../plan-ui";

export type TaskSheetHandle = { open: (task?: TaskDTO) => void };

/** Hoja para crear o editar una tarea. "Agendar" la lleva a la semana como bloque. */
export const TaskSheet = forwardRef<
  TaskSheetHandle,
  { categories: CategoryDTO[]; onSchedule: (task: TaskDTO) => void }
>(function TaskSheet({ categories, onSchedule }, ref) {
  const sheet = useRef<SheetHandle>(null);
  const [task, setTask] = useState<TaskDTO | undefined>();
  const [key, setKey] = useState(0);
  useImperativeHandle(ref, () => ({
    open(t) {
      setTask(t);
      setKey((k) => k + 1);
      sheet.current?.open();
    },
  }));
  return (
    <Sheet ref={sheet} title={task ? "Editar tarea" : "Nueva tarea"}>
      <TaskForm
        key={key}
        task={task}
        categories={categories}
        onDone={() => sheet.current?.close()}
        onSchedule={(t) => {
          sheet.current?.close();
          onSchedule(t);
        }}
      />
    </Sheet>
  );
});

function TaskForm({
  task,
  categories,
  onDone,
  onSchedule,
}: {
  task?: TaskDTO;
  categories: CategoryDTO[];
  onDone: () => void;
  onSchedule: (t: TaskDTO) => void;
}) {
  const [state, action, pending] = useActionState(saveTask, null);
  const [categoryId, setCategoryId] = useState(task?.categoryId ?? "");
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? "todo");
  const [priority, setPriority] = useState(task?.priority ?? 1);
  const [deleting, startDelete] = useTransition();
  const notify = useEffectEvent(onDone);
  useEffect(() => {
    if (state?.ok) notify();
  }, [state]);

  return (
    <form action={action} className="grid gap-5">
      {task && <input type="hidden" name="id" value={task.id} />}
      <input type="hidden" name="categoryId" value={categoryId} />

      <Field label="Nombre">
        <Input name="title" defaultValue={task?.title} required maxLength={160} autoFocus={!task} placeholder="Obligatorio, Post Arcano..." />
      </Field>

      <div className="grid gap-1.5">
        <span className="text-[13px] font-medium text-muted">Estado</span>
        <Segmented
          name="status"
          value={status}
          onChange={setStatus}
          options={(["backlog", "todo", "doing", "done"] as TaskStatus[]).map((s) => ({ value: s, label: TASK_STATUS[s].label }))}
        />
      </div>

      <div className="grid gap-1.5">
        <span className="text-[13px] font-medium text-muted">Categoría</span>
        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => {
            const on = categoryId === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoryId(on ? "" : c.id)}
                style={tone(c.color)}
                aria-pressed={on}
                className={cx(
                  "h-10 rounded-full border px-3.5 text-[13px] transition-colors",
                  on ? "border-tone-solid bg-tone font-medium text-tone-fg" : "border-line text-muted hover:bg-surface-2",
                )}
              >
                {c.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-[auto_1fr] items-end gap-4">
        <div className="grid gap-1.5">
          <span className="text-[13px] font-medium text-muted">Prioridad</span>
          <FirePicker value={priority} onChange={setPriority} name="priority" />
        </div>
        <Field label="Deadline">
          <Input type="date" name="deadline" defaultValue={task?.deadline ?? ""} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Progreso" hint="Opcional, por ejemplo 2">
          <Input name="progress" inputMode="numeric" defaultValue={task?.progress ?? ""} />
        </Field>
        <Field label="Meta" hint="Opcional, por ejemplo 3">
          <Input name="goal" inputMode="numeric" defaultValue={task?.goal ?? ""} />
        </Field>
      </div>

      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" name="scheduled" defaultChecked={task?.scheduled} className="size-5 accent-[var(--accent)]" />
        Agendada (ya tiene lugar en la semana)
      </label>

      <Field label="Notas (opcional)">
        <textarea name="notes" defaultValue={task?.notes ?? ""} rows={3} maxLength={4000} className={cx(inputClass, "h-auto py-2")} />
      </Field>

      {state && !state.ok && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}

      <div className="grid gap-2">
        <Button type="submit" variant="accent" disabled={pending}>
          {pending ? "Guardando..." : task ? "Guardar cambios" : "Crear tarea"}
        </Button>
        {task && task.status !== "done" && (
          <Button type="button" variant="outline" onClick={() => onSchedule(task)}>
            <CalendarPlus size={17} /> Agendar en la semana
          </Button>
        )}
        {task && (
          <ConfirmButton
            disabled={deleting}
            onConfirm={() =>
              startDelete(async () => {
                await deleteTask(task.id);
                onDone();
              })
            }
          >
            Borrar tarea
          </ConfirmButton>
        )}
      </div>
    </form>
  );
}
