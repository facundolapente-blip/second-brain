"use client";

import { forwardRef, useActionState, useEffect, useEffectEvent, useImperativeHandle, useRef, useState, useTransition } from "react";
import { CalendarPlus, Check, Link as LinkIcon, Plus, X } from "@phosphor-icons/react";
import { addSubtask, deleteSubtask, deleteTask, saveTask, toggleSubtask } from "@/lib/plan-actions";
import { linkLabel, normalizeLink, TASK_STATUS, type CategoryDTO, type TaskDTO, type TaskStatus } from "@/lib/plan-logic";
import { tone } from "@/lib/palette";
import { Button, ConfirmButton, cx, Field, IconButton, Input, inputClass, Segmented, Sheet, type SheetHandle } from "@/components/ui";
import { PriorityPicker } from "../plan-ui";

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
        <span className="kicker">Estado</span>
        <Segmented
          name="status"
          value={status}
          onChange={setStatus}
          options={(["backlog", "todo", "doing", "done"] as TaskStatus[]).map((s) => ({ value: s, label: TASK_STATUS[s].label }))}
        />
      </div>

      <div className="grid gap-1.5">
        <span className="kicker">Categoría</span>
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
                  "h-9 rounded-[4px] border px-3 text-[13px] transition-colors",
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
          <span className="kicker">Prioridad</span>
          <PriorityPicker value={priority} onChange={setPriority} name="priority" />
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

      <div className="grid grid-cols-[1fr_6rem] gap-3">
        <Field label="Se repite" hint="Al terminarla aparece la siguiente.">
          <select name="repeat" defaultValue={task?.repeat ?? ""} className={inputClass}>
            <option value="">No</option>
            <option value="daily">Cada día</option>
            <option value="weekly">Cada semana</option>
            <option value="monthly">Cada mes</option>
          </select>
        </Field>
        <Field label="Cada">
          <Input name="repeatEvery" type="number" min={1} max={60} defaultValue={task?.repeatEvery ?? 1} />
        </Field>
      </div>

      {task ? (
        <Subtasks task={task} />
      ) : (
        <Field label="Pasos (opcional)" hint="Uno por renglón: después los vas tildando.">
          <textarea name="subtasks" rows={3} maxLength={4000} className={cx(inputClass, "h-auto py-2")} placeholder={"Escribir el guion\nGrabar\nEditar"} />
        </Field>
      )}

      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" name="scheduled" defaultChecked={task?.scheduled} className="size-5 accent-[var(--accent)]" />
        Agendada (ya tiene lugar en la semana)
      </label>

      <Field label="Notas (opcional)">
        <textarea name="notes" defaultValue={task?.notes ?? ""} rows={3} maxLength={4000} className={cx(inputClass, "h-auto py-2")} />
      </Field>

      <LinksField key={task?.id ?? "nueva"} initial={task?.links ?? []} />

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
            undo="Tarea borrada"
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

/** Pasos de una tarea: se tildan, se agregan y se sacan al instante. */
function Subtasks({ task }: { task: TaskDTO }) {
  const [items, setItems] = useState(task.subtasks);
  const [text, setText] = useState("");
  const [, start] = useTransition();
  const done = items.filter((s) => s.done).length;

  function add() {
    const t = text.trim();
    if (!t) return;
    setItems((x) => [...x, { id: `tmp-${x.length}`, title: t, done: false }]);
    setText("");
    start(() => addSubtask(task.id, t));
  }

  return (
    <div className="grid gap-2">
      <span className="kicker">
        Pasos {items.length > 0 && <span className="tracking-normal normal-case">· {done} de {items.length}</span>}
      </span>
      {items.length > 0 && (
        <ul className="grid divide-y divide-line rounded-xl border border-line">
          {items.map((s) => (
            <li key={s.id} className="flex items-center gap-2 px-2">
              <button
                type="button"
                aria-pressed={s.done}
                onClick={() => {
                  setItems((x) => x.map((y) => (y.id === s.id ? { ...y, done: !y.done } : y)));
                  if (!s.id.startsWith("tmp-")) start(() => toggleSubtask(s.id, !s.done));
                }}
                className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 text-left"
              >
                <span
                  className={cx(
                    "inline-flex size-5 shrink-0 items-center justify-center rounded-[5px] border",
                    s.done ? "border-accent bg-accent text-on-accent" : "border-line-strong",
                  )}
                >
                  {s.done && <Check size={12} weight="bold" />}
                </span>
                <span className={cx("truncate text-[14px]", s.done && "text-muted line-through")}>{s.title}</span>
              </button>
              <button
                type="button"
                aria-label={`Sacar ${s.title}`}
                onClick={() => {
                  setItems((x) => x.filter((y) => y.id !== s.id));
                  if (!s.id.startsWith("tmp-")) start(() => deleteSubtask(s.id));
                }}
                className="inline-flex size-9 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Agregar un paso"
          maxLength={200}
        />
        <Button type="button" variant="outline" onClick={add} aria-label="Agregar paso">
          <Plus size={15} />
        </Button>
      </div>
    </div>
  );
}

/**
 * Links de la tarea: se agregan de a uno (Enter o "Agregar") y viajan con el
 * formulario como campos ocultos `links`. Se abren en otra pestaña.
 */
function LinksField({ initial }: { initial: string[] }) {
  const [links, setLinks] = useState(initial);
  const [text, setText] = useState("");
  const [bad, setBad] = useState(false);
  function add() {
    const url = normalizeLink(text);
    if (!url) {
      setBad(text.trim() !== "");
      return;
    }
    if (!links.includes(url)) setLinks([...links, url]);
    setText("");
    setBad(false);
  }
  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium">Links (opcional)</span>
      {links.map((l) => (
        <input key={l} type="hidden" name="links" value={l} />
      ))}
      {links.length > 0 && (
        <ul className="grid gap-1.5">
          {links.map((l) => (
            <li key={l} className="flex min-h-11 items-center gap-2 rounded-xl bg-surface-2 pr-1 pl-3">
              <LinkIcon size={15} className="shrink-0 text-muted" aria-hidden />
              <a href={l} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-[14px] text-accent-fg underline-offset-4 hover:underline">
                {linkLabel(l)}
              </a>
              <IconButton label={`Sacar ${linkLabel(l)}`} type="button" onClick={() => setLinks(links.filter((x) => x !== l))}>
                <X size={15} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setBad(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          onBlur={() => text.trim() && add()}
          inputMode="url"
          autoComplete="off"
          placeholder="Pegá un link"
          aria-label="Link nuevo"
          aria-invalid={bad}
          className={cx("min-w-0 flex-1", bad && "border-danger")}
        />
        <Button type="button" variant="outline" onClick={add} disabled={!text.trim()}>
          Agregar
        </Button>
      </div>
      {bad && <p className="text-[12.5px] text-danger">Eso no parece un link.</p>}
    </div>
  );
}
