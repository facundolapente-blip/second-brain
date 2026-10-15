"use client";

import { notifyInfo } from "@/components/undo-toast";
import { safeForm, useSafeTransition } from "@/components/safe-action";
import { useSaveOnDismiss } from "@/components/save-on-dismiss";
import { forwardRef, useActionState, useEffect, useEffectEvent, useImperativeHandle, useRef, useState } from "react";
import { deleteBlock, passToNextWeek, saveBlock, duplicateBlock } from "@/lib/offline/plan";
import { ArrowArcRight, CopySimple } from "@phosphor-icons/react";
import type { BlockDTO, CategoryDTO, TaskDTO } from "@/lib/plan-logic";
import { tone } from "@/lib/palette";
import { Button, ConfirmButton, cx, Field, Input, inputClass, Sheet, type SheetHandle } from "@/components/ui";
import { PriorityPicker } from "./plan-ui";
import { TimeInput } from "@/components/time-input";

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
  // Cerrar la hoja (afuera, X, Escape, arrastrar) guarda lo cambiado: lo registra el formulario.
  const dismiss = useRef<(() => void) | null>(null);

  useImperativeHandle(ref, () => ({
    open(d) {
      setDraft(d);
      setKey((k) => k + 1);
      sheet.current?.open();
    },
  }));

  return (
    <Sheet ref={sheet} title={draft.id ? "Editar bloque" : "Nuevo bloque"} onDismiss={() => dismiss.current?.()}>
      <BlockForm
        key={key}
        registerDismiss={(fn) => {
          dismiss.current = fn;
        }}
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
  registerDismiss,
}: {
  initial: BlockDraft;
  categories: CategoryDTO[];
  tasks: Pick<TaskDTO, "id" | "title" | "status">[];
  onDone: () => void;
  registerDismiss: (fn: () => void) => void;
}) {
  const [state, action, pending] = useActionState(safeForm(saveBlock), null);
  const { form, onDismiss } = useSaveOnDismiss(state);
  useEffect(() => registerDismiss(onDismiss));
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
    <form ref={form} action={action} className="grid gap-5">
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

      {/* Columnas que se pueden achicar: los campos de fecha y hora del celular no lo hacen solos.
          En el celular el día va en su propio renglón (en tres columnas la fecha no entraba entera). */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] sm:gap-3">
        <Field label="Día" className="col-span-2 min-w-0 sm:col-span-1">
          <Input type="date" name="date" defaultValue={initial.date} required className="min-w-0 !px-2 sm:!px-3" />
        </Field>
        <Field label="Desde" className="min-w-0">
          <TimeInput name="startTime" defaultValue={initial.startTime} className="min-w-0 !px-3" />
        </Field>
        <Field label="Hasta" className="min-w-0">
          <TimeInput name="endTime" defaultValue={initial.endTime} className="min-w-0 !px-3" />
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
        <p role="alert" className="reveal text-sm text-danger">
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
