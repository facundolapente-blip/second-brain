"use client";

import { forwardRef, useActionState, useEffect, useEffectEvent, useImperativeHandle, useRef, useState } from "react";
import { Flag } from "@phosphor-icons/react";
import { saveHabit } from "@/lib/habit-actions";
import { WEEKDAY_SHORT, type Frequency } from "@/lib/habit-logic";
import { HabitIcon } from "@/lib/habit-icons";
import { tone } from "@/lib/palette";
import type { CategoryDTO, HabitDTO } from "@/lib/habits";
import { Button, cx, Field, Input, inputClass, Segmented, Sheet, ToneSquare, type SheetHandle } from "@/components/ui";

export type HabitFormHandle = { create: () => void; edit: (h: HabitDTO) => void };

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export type Draft = {
  id?: string;
  name: string;
  description: string;
  categoryId: string;
  frequency: Frequency;
  weekdays: number[];
  timesPerWeek: number;
  weekStart: number;
  kind: "check" | "count";
  target: number;
  unit: string;
  priority: number;
  startDate: string;
};

function emptyDraft(today: string): Draft {
  return {
    name: "",
    description: "",
    categoryId: "",
    frequency: "daily",
    weekdays: [],
    timesPerWeek: 3,
    weekStart: 1,
    kind: "check",
    target: 1,
    unit: "",
    priority: 1,
    startDate: today,
  };
}

export function fromHabit(h: HabitDTO): Draft {
  return {
    id: h.id,
    name: h.name,
    description: h.description ?? "",
    categoryId: h.categoryId ?? "",
    frequency: h.frequency,
    weekdays: h.weekdays,
    timesPerWeek: h.timesPerWeek,
    weekStart: h.weekStart,
    kind: h.target > 1 || h.unit ? "count" : "check",
    target: h.target,
    unit: h.unit ?? "",
    priority: h.priority,
    startDate: h.startDate,
  };
}

export const HabitForm = forwardRef<HabitFormHandle, { categories: CategoryDTO[]; today: string }>(
  function HabitForm({ categories, today }, ref) {
    const sheet = useRef<SheetHandle>(null);
    const [initial, setInitial] = useState<Draft>(() => emptyDraft(today));
    const [formKey, setFormKey] = useState(0);

    useImperativeHandle(ref, () => ({
      create() {
        setInitial(emptyDraft(today));
        setFormKey((k) => k + 1);
        sheet.current?.open();
      },
      edit(h) {
        setInitial(fromHabit(h));
        setFormKey((k) => k + 1);
        sheet.current?.open();
      },
    }));

    return (
      <Sheet ref={sheet} title={initial.id ? "Editar hábito" : "Nuevo hábito"}>
        <HabitFormBody
          key={formKey}
          initial={initial}
          categories={categories}
          onSaved={() => sheet.current?.close()}
        />
      </Sheet>
    );
  },
);

/** El formulario en sí: va dentro de la hoja o directo en la pestaña Editar. */
export function HabitFormBody({
  initial,
  categories,
  onSaved,
}: {
  initial: Draft;
  categories: CategoryDTO[];
  onSaved?: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const [state, action, pending] = useActionState(saveHabit, null);

  // Solo cuando llega una respuesta nueva, no cada vez que cambia onSaved.
  const notifySaved = useEffectEvent(() => onSaved?.());
  useEffect(() => {
    if (state?.ok) notifySaved();
  }, [state]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <form action={action} className="grid gap-5">
      {draft.id && <input type="hidden" name="id" value={draft.id} />}

      <Field label="Nombre">
        <Input
          name="name"
          value={draft.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="Leer, meditar, no fumar..."
          autoFocus={!draft.id}
          required
          maxLength={80}
        />
      </Field>

      <div className="grid gap-1.5">
        <span className="kicker">Categoría</span>
        <input type="hidden" name="categoryId" value={draft.categoryId} />
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => {
            const active = draft.categoryId === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => set("categoryId", active ? "" : c.id)}
                style={tone(c.color)}
                className={cx(
                  "inline-flex h-9 items-center gap-2 rounded-[4px] border pr-3 pl-1 text-[13px] transition-colors",
                  active ? "border-tone-solid bg-tone font-medium text-tone-fg" : "border-line text-muted hover:bg-surface-2",
                )}
              >
                <ToneSquare size={26} style={tone(c.color)}>
                  <HabitIcon name={c.icon} size={15} weight="fill" />
                </ToneSquare>
                {c.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-2">
        <span className="kicker">Frecuencia</span>
        <Segmented
          name="frequency"
          value={draft.frequency}
          onChange={(v) => set("frequency", v)}
          options={[
            { value: "daily", label: "Todos los días" },
            { value: "weekdays", label: "Días" },
            { value: "weekly", label: "Por semana" },
          ]}
        />
        {draft.frequency === "weekdays" && (
          <div className="grid grid-cols-7 gap-1.5 pt-1">
            {WEEK_ORDER.map((d) => {
              const on = draft.weekdays.includes(d);
              return (
                <label
                  key={d}
                  className={cx(
                    "flex aspect-square cursor-pointer items-center justify-center rounded-full border text-[12px] font-medium transition-colors select-none",
                    on ? "border-accent bg-accent-soft text-accent-fg" : "border-line text-muted hover:bg-surface-2",
                  )}
                >
                  <input
                    type="checkbox"
                    name="weekdays"
                    value={d}
                    checked={on}
                    onChange={() =>
                      set("weekdays", on ? draft.weekdays.filter((x) => x !== d) : [...draft.weekdays, d])
                    }
                    className="sr-only"
                  />
                  {WEEKDAY_SHORT[d]}
                </label>
              );
            })}
          </div>
        )}
        {draft.frequency === "weekly" && (
          <div className="flex items-center gap-3 pt-1">
            <Stepper
              name="timesPerWeek"
              value={draft.timesPerWeek}
              min={1}
              max={7}
              onChange={(v) => set("timesPerWeek", v)}
            />
            <span className="text-sm text-muted">{draft.timesPerWeek === 1 ? "vez" : "veces"} por semana</span>
            <input type="hidden" name="weekStart" value={draft.weekStart} />
          </div>
        )}
      </div>

      <div className="grid gap-2">
        <span className="kicker">Cómo se mide</span>
        <Segmented
          name="kind"
          value={draft.kind}
          onChange={(v) => set("kind", v)}
          options={[
            { value: "check", label: "Sí o no" },
            { value: "count", label: "Cantidad" },
          ]}
        />
        {draft.kind === "count" && (
          <div className="grid grid-cols-[auto_1fr] items-center gap-3 pt-1">
            <Stepper name="target" value={draft.target} min={1} max={100000} onChange={(v) => set("target", v)} />
            <Input
              name="unit"
              value={draft.unit}
              onChange={(e) => set("unit", e.target.value)}
              placeholder="Unidad (frutas, páginas, vasos)"
              aria-label="Unidad"
              maxLength={30}
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-1.5">
          <span className="kicker">Prioridad</span>
          <input type="hidden" name="priority" value={draft.priority} />
          <div className="flex h-11 items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => set("priority", p)}
                aria-label={`Prioridad ${p}`}
                className={cx(
                  "inline-flex h-11 w-8 items-center justify-center rounded-[4px] transition-colors",
                  p <= draft.priority ? "text-accent" : "text-faint hover:text-muted",
                )}
              >
                <Flag size={17} weight={p <= draft.priority ? "fill" : "regular"} />
              </button>
            ))}
          </div>
        </div>
        <Field label="Empieza el">
          <Input
            type="date"
            name="startDate"
            value={draft.startDate}
            onChange={(e) => set("startDate", e.target.value)}
            required
          />
        </Field>
      </div>

      <Field label="Nota (opcional)">
        <textarea
          name="description"
          value={draft.description}
          onChange={(e) => set("description", e.target.value)}
          rows={2}
          maxLength={500}
          className={cx(inputClass, "h-auto py-2")}
          placeholder="Por qué lo hacés, cómo, cuándo..."
        />
      </Field>

      {state && !state.ok && <p className="text-sm text-danger">{state.error}</p>}

      <Button type="submit" variant="accent" disabled={pending} className="w-full">
        {pending ? "Guardando..." : draft.id ? "Guardar cambios" : "Crear hábito"}
      </Button>
    </form>
  );
}

function Stepper({
  name,
  value,
  min,
  max,
  onChange,
}: {
  name: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex h-11 items-center rounded-[4px] border border-line-strong">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="h-full w-10 text-lg text-muted hover:text-fg"
        aria-label="Menos"
      >
        −
      </button>
      <input
        name={name}
        type="number"
        inputMode="numeric"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))}
        className="tabular h-full w-12 bg-transparent text-center text-sm font-medium outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        className="h-full w-10 text-lg text-muted hover:text-fg"
        aria-label="Más"
      >
        +
      </button>
    </div>
  );
}
