"use client";

import { notifyInfo } from "@/components/undo-toast";
import { safeForm, useSafeTransition } from "@/components/safe-action";
import { forwardRef, useActionState, useEffect, useEffectEvent, useImperativeHandle, useRef, useState } from "react";
import { deleteBlock, passToNextWeek, saveBlock, duplicateBlock } from "@/lib/offline/plan";
import { ArrowArcRight, CopySimple } from "@phosphor-icons/react";
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

      {/* Columnas que se pueden achicar: los campos de fecha y hora del celular no lo hacen solos. */}
      <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 sm:gap-3">
        <Field label="Día" className="min-w-0">
          <Input type="date" name="date" defaultValue={initial.date} required className="min-w-0 !px-2 sm:!px-3" />
        </Field>
        <Field label="Desde" className="min-w-0">
          <Input type="time" name="startTime" defaultValue={initial.startTime ?? ""} className="min-w-0 !px-2 sm:!px-3" />
        </Field>
        <Field label="Hasta" className="min-w-0">
          <Input type="time" name="endTime" defaultValue={initial.endTime ?? ""} className="min-w-0 !px-2 sm:!px-3" />
        </Field>
      </div>
      <p className="-mt-3 text-xs text-muted">Sin hora de inicio, queda para todo el día.</p>

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
          <Button
            type="button"
            variant="outline"
            disabled={deleting}
            className="h-11"
            onClick={() =>
              startDelete(async () => {
                await duplicateBlock(initial.id!);
                onDone();
                notifyInfo("Bloque duplicado");
              })
            }
          >
            <CopySimple size={16} /> Duplicar
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
