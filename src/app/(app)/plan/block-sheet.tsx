"use client";

import { forwardRef, useActionState, useEffect, useEffectEvent, useImperativeHandle, useRef, useState, useTransition } from "react";
import { Medal } from "@phosphor-icons/react";
import { deleteBlock, saveBlock } from "@/lib/plan-actions";
import type { BlockDTO, CategoryDTO, TaskDTO } from "@/lib/plan-logic";
import type { LinkableHabit } from "@/lib/plan";
import { tone } from "@/lib/palette";
import { Button, ConfirmButton, cx, Field, Input, inputClass, Sheet, type SheetHandle } from "@/components/ui";
import { FirePicker } from "./plan-ui";

export type BlockDraft = Partial<BlockDTO> & { date: string };
export type BlockSheetHandle = { open: (draft: BlockDraft) => void };

/** Hoja para crear o editar un bloque de la semana. */
export const BlockSheet = forwardRef<
  BlockSheetHandle,
  { categories: CategoryDTO[]; habits: LinkableHabit[]; tasks: Pick<TaskDTO, "id" | "title" | "status">[] }
>(function BlockSheet({ categories, habits, tasks }, ref) {
  const sheet = useRef<SheetHandle>(null);
  const [draft, setDraft] = useState<BlockDraft>({ date: "" });
  const [key, setKey] = useState(0);

  useImperativeHandle(ref, () => ({
    open(d) {
      setDraft(d);
      setKey((k) => k + 1);
      sheet.current?.open();
    },
  }));

  return (
    <Sheet ref={sheet} title={draft.id ? "Editar bloque" : "Nuevo bloque"}>
      <BlockForm
        key={key}
        initial={draft}
        categories={categories}
        habits={habits}
        tasks={tasks}
        onDone={() => sheet.current?.close()}
      />
    </Sheet>
  );
});

function BlockForm({
  initial,
  categories,
  habits,
  tasks,
  onDone,
}: {
  initial: BlockDraft;
  categories: CategoryDTO[];
  habits: LinkableHabit[];
  tasks: Pick<TaskDTO, "id" | "title" | "status">[];
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(saveBlock, null);
  const [title, setTitle] = useState(initial.title ?? "");
  const [categoryId, setCategoryId] = useState(initial.categoryId ?? "");
  const [priority, setPriority] = useState(initial.priority ?? 0);
  const [habitId, setHabitId] = useState(initial.habitId ?? "");
  const [deleting, startDelete] = useTransition();
  const notify = useEffectEvent(onDone);
  useEffect(() => {
    if (state?.ok) notify();
  }, [state]);

  // Si el nombre coincide con un hábito (Gym), se sugiere vincularlo.
  const suggested = !habitId && habits.find((h) => h.name.toLowerCase() === title.trim().toLowerCase());
  const openTasks = tasks.filter((t) => t.status !== "done" || t.id === initial.taskId);

  return (
    <form action={action} className="grid gap-5">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="categoryId" value={categoryId} />
      <input type="hidden" name="habitId" value={habitId} />

      <Field label="Nombre">
        <Input
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Gym, Obligatorio, Libre..."
          autoFocus={!initial.id}
          required
          maxLength={120}
        />
      </Field>

      <div className="grid grid-cols-[1.3fr_1fr_1fr] gap-3">
        <Field label="Día">
          <Input type="date" name="date" defaultValue={initial.date} required />
        </Field>
        <Field label="Desde">
          <Input type="time" name="startTime" defaultValue={initial.startTime ?? ""} />
        </Field>
        <Field label="Hasta">
          <Input type="time" name="endTime" defaultValue={initial.endTime ?? ""} />
        </Field>
      </div>
      <p className="-mt-3 text-xs text-muted">Sin hora, el bloque queda para todo el día.</p>

      <div className="grid gap-1.5">
        <span className="label-mono text-muted">Categoría</span>
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
                  "h-9 rounded-md border px-3 text-[13px] transition-colors",
                  on ? "border-tone-solid bg-tone font-medium text-tone-fg" : "border-line text-muted hover:bg-surface-2",
                )}
              >
                {c.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-1.5">
        <span className="label-mono text-muted">Prioridad</span>
        <FirePicker value={priority} onChange={setPriority} name="priority" />
      </div>

      <div className="grid gap-1.5">
        <span className="label-mono text-muted">Hábito vinculado</span>
        <select
          value={habitId}
          onChange={(e) => setHabitId(e.target.value)}
          className={cx(inputClass, "pr-8")}
          aria-label="Hábito vinculado"
        >
          <option value="">Ninguno</option>
          {habits.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </select>
        {suggested ? (
          <button
            type="button"
            onClick={() => setHabitId(suggested.id)}
            className="inline-flex items-center gap-1.5 justify-self-start rounded-md text-[13px] font-medium text-accent-fg hover:underline"
          >
            <Medal size={15} weight="fill" /> Vincular con el hábito {suggested.name}
          </button>
        ) : (
          <span className="text-xs text-muted">Al marcar el bloque como hecho, se marca el hábito ese día.</span>
        )}
      </div>

      {openTasks.length > 0 && (
        <Field label="Tarea (opcional)">
          <select name="taskId" defaultValue={initial.taskId ?? ""} className={cx(inputClass, "pr-8")}>
            <option value="">Ninguna</option>
            {openTasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Lugar (opcional)">
          <Input name="place" defaultValue={initial.place ?? ""} maxLength={120} placeholder="ORT, casa..." />
        </Field>
        <Field label="Nota (opcional)">
          <Input name="notes" defaultValue={initial.notes ?? ""} maxLength={2000} />
        </Field>
      </div>

      {state && !state.ok && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}

      <div className="grid gap-2">
        <Button type="submit" variant="accent" disabled={pending}>
          {pending ? "Guardando..." : initial.id ? "Guardar cambios" : "Crear bloque"}
        </Button>
        {initial.id && (
          <ConfirmButton
            disabled={deleting}
            onConfirm={() =>
              startDelete(async () => {
                await deleteBlock(initial.id!);
                onDone();
              })
            }
          >
            Borrar bloque
          </ConfirmButton>
        )}
      </div>
    </form>
  );
}
