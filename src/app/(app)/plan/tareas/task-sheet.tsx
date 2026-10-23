"use client";

import { leaveThen, useNewIds, useTick } from "@/components/motion";
import { notifyInfo } from "@/components/undo-toast";
import { safeForm, useSafeTransition } from "@/components/safe-action";
import { useSaveOnDismiss } from "@/components/save-on-dismiss";
import { forwardRef, useActionState, useEffect, useEffectEvent, useImperativeHandle, useRef, useState } from "react";
import { CalendarPlus, Check, Link as LinkIcon, PencilSimple, Plus, X, CopySimple } from "@phosphor-icons/react";
import { addSubtask, deleteSubtask, deleteTask, saveTask, toggleSubtask, duplicateTask } from "@/lib/offline/plan";
import { linkLabel, normalizeLink, TASK_STATUS, type CategoryDTO, type TaskDTO, type TaskLink, type TaskStatus } from "@/lib/plan-logic";
import { Button, ConfirmButton, cx, Field, IconButton, Input, inputClass, Segmented, Sheet, type SheetHandle } from "@/components/ui";
import { CategoryChoice, PriorityPicker } from "../plan-ui";

export type TaskSheetHandle = { open: (task?: TaskDTO, preset?: { status?: TaskStatus }) => void };

/**
 * Lo que hacen las tareas con la hoja, al instante: guardar cierra la hoja y la
 * tarea ya se ve cambiada (o nueva); si el servidor falla, vuelve sola y avisa.
 */
export type TaskSheetActions = {
  save: (fd: FormData, task?: TaskDTO) => void;
  duplicate: (task: TaskDTO) => void;
  remove: (task: TaskDTO) => void;
};

/** Hoja para crear o editar una tarea. "Agendar" la lleva a la semana como bloque. */
export const TaskSheet = forwardRef<
  TaskSheetHandle,
  { categories: CategoryDTO[]; onSchedule: (task: TaskDTO) => void; actions?: TaskSheetActions }
>(function TaskSheet({ categories, onSchedule, actions }, ref) {
  const sheet = useRef<SheetHandle>(null);
  const [task, setTask] = useState<TaskDTO | undefined>();
  const [presetStatus, setPresetStatus] = useState<TaskStatus | undefined>();
  const [key, setKey] = useState(0);
  // Cerrar la hoja (afuera, X, Escape, arrastrar) guarda lo cambiado: lo registra el formulario.
  const dismiss = useRef<(() => void) | null>(null);
  useImperativeHandle(ref, () => ({
    open(t, preset) {
      setTask(t);
      setPresetStatus(preset?.status);
      setKey((k) => k + 1);
      sheet.current?.open();
    },
  }));
  return (
    <Sheet ref={sheet} wide title={task ? "Editar tarea" : "Nueva tarea"} onDismiss={() => dismiss.current?.()}>
      <TaskForm
        key={key}
        task={task}
        initialStatus={presetStatus}
        registerDismiss={(fn) => {
          dismiss.current = fn;
        }}
        categories={categories}
        actions={actions}
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
  registerDismiss,
  initialStatus,
  actions,
}: {
  actions?: TaskSheetActions;
  task?: TaskDTO;
  /** Estado con el que arranca una tarea nueva (el "+" de una columna del tablero). */
  initialStatus?: TaskStatus;
  categories: CategoryDTO[];
  onDone: () => void;
  onSchedule: (t: TaskDTO) => void;
  registerDismiss: (fn: () => void) => void;
}) {
  const [state, action, pending] = useActionState(safeForm(saveTask), null);
  const { form, onDismiss } = useSaveOnDismiss(state);
  useEffect(() => registerDismiss(onDismiss));
  const [categoryId, setCategoryId] = useState(task?.categoryId ?? "");
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? initialStatus ?? "todo");
  const [priority, setPriority] = useState(task?.priority ?? 1);
  const [deleting, startDelete] = useSafeTransition();
  const notify = useEffectEvent(onDone);
  useEffect(() => {
    if (state?.ok) notify();
  }, [state]);
  // Editar en la compu: el foco va al nombre (en el celular no, así no salta el teclado).
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (task && window.matchMedia("(min-width: 1024px) and (pointer: fine)").matches) nameRef.current?.focus();
  }, [task]);
  /** Con las tareas a mano: se cierra enseguida y el cambio ya se ve (sin "Guardando..."). */
  function instant(e: React.FormEvent<HTMLFormElement>) {
    if (!actions) return;
    e.preventDefault();
    actions.save(new FormData(e.currentTarget), task);
    onDone();
  }

  return (
    <form ref={form} action={actions ? undefined : action} onSubmit={actions ? instant : undefined} className="grid gap-5">
      {task && <input type="hidden" name="id" value={task.id} />}
      <input type="hidden" name="categoryId" value={categoryId} />

      <Field label="Nombre">
        <Input ref={nameRef} name="title" defaultValue={task?.title} required maxLength={160} autoFocus={!task} placeholder="Obligatorio, Post Arcano..." />
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
            return <CategoryChoice key={c.id} category={c} on={on} onClick={() => setCategoryId(on ? "" : c.id)} />;
          })}
        </div>
      </div>

      <div className="grid items-end gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
        <div className="grid gap-1.5">
          <span className="kicker">Prioridad</span>
          <PriorityPicker value={priority} onChange={setPriority} name="priority" />
        </div>
        <Field label="Deadline">
          <Input type="date" name="deadline" defaultValue={task?.deadline ?? ""} className="min-w-0" />
        </Field>
      </div>

      <div className="grid grid-cols-[1fr_6rem] items-start gap-3">
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
        <Field label="Pasos (opcional)" hint="Uno por renglón: después los vas tildando y son el progreso de la tarea.">
          <textarea spellCheck lang="es" name="subtasks" rows={3} maxLength={4000} className={cx(inputClass, "h-auto py-2")} placeholder={"Escribir el guion\nGrabar\nEditar"} />
        </Field>
      )}

      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" name="scheduled" defaultChecked={task?.scheduled} className="size-5 accent-[var(--accent)]" />
        Agendada (ya tiene lugar en la semana)
      </label>

      <Field label="Notas (opcional)">
        <textarea spellCheck lang="es" name="notes" defaultValue={task?.notes ?? ""} rows={3} maxLength={4000} className={cx(inputClass, "h-auto py-2")} />
      </Field>

      <LinksField key={task?.id ?? "nueva"} initial={task?.links ?? []} />

      {state && !state.ok && (
        <p role="alert" className="reveal text-sm text-danger">
          {state.error}
        </p>
      )}

      {task && (
        <div className="grid gap-2">
          {task.status !== "done" && (
            <Button type="button" variant="outline" onClick={() => onSchedule(task)}>
              <CalendarPlus size={17} /> Agendar en la semana
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={deleting}
            onClick={() => {
              if (actions) {
                actions.duplicate(task);
                onDone();
                return notifyInfo("Tarea duplicada");
              }
              startDelete(async () => {
                await duplicateTask(task.id);
                onDone();
                notifyInfo("Tarea duplicada");
              });
            }}
          >
            <CopySimple size={17} /> Duplicar
          </Button>
          <ConfirmButton
            undo="Tarea borrada"
            disabled={deleting}
            onConfirm={() => {
              if (actions) {
                actions.remove(task);
                return onDone();
              }
              startDelete(async () => {
                await deleteTask(task.id);
                onDone();
              });
            }}
          >
            Borrar tarea
          </ConfirmButton>
        </div>
      )}

      {/* Guardar queda pegado abajo de la hoja (el formulario es largo). */}
      <div className="plan-sticky-save">
        <Button type="submit" variant="accent" disabled={pending && !actions} className="w-full">
          {pending && !actions ? "Guardando..." : task ? "Guardar cambios" : "Crear tarea"}
        </Button>
      </div>
    </form>
  );
}

/** Pasos de una tarea: se tildan, se agregan y se sacan al instante. */
function Subtasks({ task }: { task: TaskDTO }) {
  const [items, setItems] = useState<(TaskDTO["subtasks"][number] & { k?: string })[]>(task.subtasks);
  // Lo agregado entra con un fundido; la tilde aparece con un golpe tras tocarla.
  const fresh = useNewIds(items.map((s) => s.k ?? s.id));
  const [tappedStep, setTappedStep] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [, start] = useSafeTransition();
  const done = items.filter((s) => s.done).length;
  const doneTick = useTick(done);
  // Un paso recién agregado tiene un id provisional hasta que el servidor da el
  // suyo. Si se tilda o se saca antes, el cambio espera ese id y se manda después.
  const tmpSeq = useRef(0);
  const realId = useRef(new Map<string, string>());
  const waiting = useRef(new Map<string, { done?: boolean; deleted?: boolean }>());

  function add() {
    const t = text.trim();
    if (!t) return;
    const tmp = `tmp-${task.id}-${tmpSeq.current++}`;
    setItems((x) => [...x, { id: tmp, title: t, done: false }]);
    setText("");
    start(async () => {
      const r = await addSubtask(task.id, t);
      const id = r && "id" in r ? r.id : null;
      if (!id) return; // sin señal: quedó en la cola, se ve igual
      realId.current.set(tmp, id);
      // Se queda con su clave provisional (`k`): así no se vuelve a montar (ni a animar) al llegar el id real.
      setItems((x) => x.map((y) => (y.id === tmp ? { ...y, id, k: tmp } : y)));
      const w = waiting.current.get(tmp);
      waiting.current.delete(tmp);
      if (w?.deleted) await deleteSubtask(id);
      else if (w?.done !== undefined) await toggleSubtask(id, w.done);
    });
  }

  /** Tilda o saca un paso; si todavía no tiene id del servidor, lo deja esperando. */
  function sync(s: { id: string }, change: { done?: boolean; deleted?: boolean }) {
    const id = realId.current.get(s.id) ?? s.id;
    if (id.startsWith("tmp-")) {
      waiting.current.set(id, { ...waiting.current.get(id), ...change });
      return;
    }
    start(() => (change.deleted ? deleteSubtask(id) : toggleSubtask(id, !!change.done)));
  }

  return (
    <div className="grid gap-2">
      <span className="kicker">
        Pasos{" "}
        {items.length > 0 && (
          <span className="tracking-normal normal-case">
            ·{" "}
            <span key={doneTick.key} className={doneTick.className}>
              {done}
            </span>{" "}
            de {items.length}
          </span>
        )}
      </span>
      {items.length > 0 && (
        <ul className="grid divide-y divide-line rounded-xl border border-line">
          {items.map((s) => (
            <li key={s.k ?? s.id} data-paso={s.k ?? s.id} className={cx("flex items-center gap-2 px-2", fresh.has(s.k ?? s.id) && "reveal")}>
              <button
                type="button"
                aria-pressed={s.done}
                onClick={() => {
                  setItems((x) => x.map((y) => (y.id === s.id ? { ...y, done: !y.done } : y)));
                  setTappedStep(s.k ?? s.id);
                  sync(s, { done: !s.done });
                }}
                className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 text-left"
              >
                <span
                  className={cx(
                    "inline-flex size-5 shrink-0 items-center justify-center rounded-[5px] border transition-colors duration-[var(--dur-quick)]",
                    s.done ? "border-accent bg-accent text-on-accent" : "border-line-strong",
                  )}
                >
                  {s.done && <Check size={12} weight="bold" className={tappedStep === (s.k ?? s.id) ? "mark-pop" : undefined} />}
                </span>
                <span className={cx("truncate text-[14px]", s.done && "text-muted line-through")}>{s.title}</span>
              </button>
              <button
                type="button"
                aria-label={`Sacar ${s.title}`}
                onClick={() => {
                  // Se va con una salida corta y recién después se saca de la lista (un segundo toque mientras sale no cuenta).
                  if (document.querySelector(`[data-paso="${s.k ?? s.id}"]`)?.classList.contains("leave")) return;
                  sync(s, { deleted: true });
                  leaveThen(`[data-paso="${s.k ?? s.id}"]`, () => setItems((x) => x.filter((y) => y.id !== s.id)));
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
 * Links de la tarea, cada uno con nombre opcional (si no, se ve el dominio). Se
 * agregan de a uno (Enter o "Agregar"); el lápiz cambia el nombre. Viajan con el
 * formulario en un campo oculto `links` (JSON); un link escrito y sin agregar
 * también se guarda. Se abren en otra pestaña.
 */
function LinksField({ initial }: { initial: TaskLink[] }) {
  const [links, setLinks] = useState(initial);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [bad, setBad] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const pending = normalizeLink(url);
  const all = pending && !links.some((l) => l.url === pending) ? [...links, { url: pending, name: name.trim() }] : links;
  function add() {
    if (!pending) {
      setBad(url.trim() !== "");
      return;
    }
    setLinks(all);
    setUrl("");
    setName("");
    setBad(false);
  }
  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    }
  };
  const rename = (u: string, n: string) => setLinks(links.map((l) => (l.url === u ? { ...l, name: n.trim().slice(0, 80) } : l)));
  const freshLinks = useNewIds(links.map((l) => l.url));
  return (
    <div className="grid gap-2">
      <span className="kicker">Links (opcional)</span>
      <input type="hidden" name="links" value={JSON.stringify(all)} />
      {links.length > 0 && (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
          {links.map((l) => (
            <li key={l.url} className={cx("flex min-h-12 min-w-0 items-center gap-2.5 rounded-xl bg-surface-2 py-1.5 pr-1 pl-3", freshLinks.has(l.url) && "reveal")}>
              <LinkIcon size={16} className="shrink-0 text-muted" aria-hidden />
              {editing === l.url ? (
                <Input
                  autoFocus
                  defaultValue={l.name}
                  placeholder={linkLabel(l.url)}
                  aria-label="Nombre del link"
                  maxLength={80}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === "Escape") {
                      e.preventDefault();
                      if (e.key === "Enter") rename(l.url, e.currentTarget.value);
                      setEditing(null);
                    }
                  }}
                  onBlur={(e) => {
                    rename(l.url, e.currentTarget.value);
                    setEditing(null);
                  }}
                  className="h-9 min-w-0 flex-1"
                />
              ) : (
                <a href={l.url} target="_blank" rel="noopener noreferrer" className="grid min-w-0 flex-1 underline-offset-4 hover:underline">
                  <span className="truncate text-[14px] font-medium text-accent-fg">{l.name || linkLabel(l.url)}</span>
                  {l.name && <span className="truncate text-[12px] text-muted">{linkLabel(l.url)}</span>}
                </a>
              )}
              <IconButton label={`Ponerle nombre a ${l.name || linkLabel(l.url)}`} type="button" onClick={() => setEditing(l.url)}>
                <PencilSimple size={15} />
              </IconButton>
              <IconButton label={`Sacar ${l.name || linkLabel(l.url)}`} type="button" onClick={() => setLinks(links.filter((x) => x.url !== l.url))}>
                <X size={15} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-2 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto]">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={onEnter}
          maxLength={80}
          autoComplete="off"
          placeholder="Nombre (opcional)"
          aria-label="Nombre del link nuevo"
        />
        <Input
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setBad(false);
          }}
          onKeyDown={onEnter}
          inputMode="url"
          autoComplete="off"
          placeholder="Pegá un link"
          aria-label="Link nuevo"
          aria-invalid={bad}
          className={cx("min-w-0", bad && "border-danger")}
        />
        <Button type="button" variant="outline" onClick={add} disabled={!url.trim()}>
          Agregar
        </Button>
      </div>
      {bad && <p className="text-[12.5px] text-danger">Eso no parece un link.</p>}
    </div>
  );
}
