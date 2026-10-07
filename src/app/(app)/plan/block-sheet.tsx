"use client";

import { safeForm, useSafeTransition } from "@/components/safe-action";
import { forwardRef, useActionState, useEffect, useEffectEvent, useImperativeHandle, useRef, useState } from "react";
import { deleteBlock, passToNextWeek, saveBlock } from "@/lib/plan-actions";
import { ArrowArcRight } from "@phosphor-icons/react";
import type { BlockDTO, CategoryDTO, TaskDTO } from "@/lib/plan-logic";
import { tone } from "@/lib/palette";
import { Button, ConfirmButton, cx, Field, Input, inputClass, Sheet, type SheetHandle } from "@/components/ui";
import { PriorityPicker } from "./plan-ui";

export type BlockDraft = Partial<BlockDTO> & { date: string };
export type BlockSheetHandle = { open: (draft: BlockDraft) => void };

/** Hoja para crear o editar un bloque de la semana. */
export const BlockSheet = forwardRef<
  BlockSheetHandle,
  { categories: CategoryDTO[]; tasks: Pick<TaskDTO, "id" | "title" | "status">[] }
>(function BlockSheet({ categories, tasks }, ref) {
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
        tasks={tasks}
        onDone={() => sheet.current?.close()}
      />
    </Sheet>
  );
});

function BlockForm({
  initial,
  categories,
  tasks,
  onDone,
}: {
  initial: BlockDraft;
  categories: CategoryDTO[];
  tasks: Pick<TaskDTO, "id" | "title" | "status">[];
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(safeForm(saveBlock), null);
  const [title, setTitle] = useState(initial.title ?? "");
  const [categoryId, setCategoryId] = useState(initial.categoryId ?? "");
  const [priority, setPriority] = useState(initial.priority ?? 0);
  const [deleting, startDelete] = useSafeTransition();
  const notify = useEffectEvent(onDone);
  useEffect(() => {
    if (state?.ok) notify();
  }, [state]);

  const openTasks = tasks.filter((t) => t.status !== "done" || t.id === initial.taskId);

  return (
    <form action={action} className="grid gap-5">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="categoryId" value={categoryId} />

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

      <div className="grid gap-1.5">
        <span className="kicker">Prioridad</span>
        <PriorityPicker value={priority} onChange={setPriority} name="priority" />
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
          <Button
            type="button"
            variant="outline"
            disabled={deleting}
            className="h-11"
            onClick={() =>
              startDelete(async () => {
                await passToNextWeek(initial.id!);
                onDone();
              })
            }
          >
            <ArrowArcRight size={16} /> Pasar a la semana que viene
          </Button>
        )}
        {initial.id && (
          <ConfirmButton
            undo="Bloque borrado"
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
