"use client";

import { safeForm } from "@/components/safe-action";
import { forwardRef, useActionState, useEffect, useEffectEvent, useImperativeHandle, useRef, useState } from "react";
import { Flag } from "@phosphor-icons/react";
import { saveHabit } from "@/lib/offline/habit";
import { WEEKDAY_SHORT, type Frequency, type LogMap } from "@/lib/habit-logic";
import { HabitAvatar } from "@/lib/habit-icons";
import { tone } from "@/lib/palette";
import type { CategoryDTO, HabitDTO } from "@/lib/habits";
import { Button, cx, Field, Input, inputClass, Segmented, Sheet, type SheetHandle } from "@/components/ui";

/** `hasHistory`: si el hábito ya tiene marcas (cambiar la meta ofrece empezar una pista nueva). */
export type HabitFormHandle = { create: () => void; edit: (h: HabitDTO, hasHistory?: boolean) => void };

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export type Draft = {
  id?: string;
  name: string;
  description: string;
  isQuit: boolean;
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
    isQuit: false,
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

/** ¿Tiene marcas en la pista actual? (Para ofrecer una pista nueva al cambiar la meta.) */
export function hasMarks(logs: LogMap | undefined, startDate: string) {
  return Object.entries(logs ?? {}).some(([d, l]) => d >= startDate && l.s !== "none");
}

export function fromHabit(h: HabitDTO): Draft {
  return {
    id: h.id,
    name: h.name,
    description: h.description ?? "",
    isQuit: h.isQuit,
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
    const [hasHistory, setHasHistory] = useState(false);

    useImperativeHandle(ref, () => ({
      create() {
        setInitial(emptyDraft(today));
        setHasHistory(false);
        setFormKey((k) => k + 1);
        sheet.current?.open();
      },
      edit(h, history = true) {
        setInitial(fromHabit(h));
        setHasHistory(history);
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
          today={today}
          hasHistory={hasHistory}
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
  today,
  hasHistory = false,
  onSaved,
}: {
  initial: Draft;
  categories: CategoryDTO[];
  today: string;
  /** El hábito ya tiene marcas en la pista actual. */
  hasHistory?: boolean;
  onSaved?: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const [state, action, pending] = useActionState(safeForm(saveHabit), null);

  // Solo cuando llega una respuesta nueva, no cada vez que cambia onSaved.
  const notifySaved = useEffectEvent(() => onSaved?.());
  useEffect(() => {
    if (state?.ok) notifySaved();
  }, [state]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  // Cambiar cuándo toca o la meta reescribiría cómo se leen los días ya marcados
  // (un "hecho" pasaría a "a medias"): antes de guardar se elige desde cuándo vale.
  const askTrack = !!draft.id && hasHistory && initial.startDate < today && rulesDiffer(initial, draft);

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
                <HabitAvatar icon={c.icon} color={c.color} size={26} />
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
          <div className="reveal grid grid-cols-7 gap-1.5 pt-1">
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
          <div className="reveal flex items-center gap-3 pt-1">
            <Stepper
              name="timesPerWeek"
              value={draft.timesPerWeek}
              min={1}
              max={7}
              onChange={(v) => set("timesPerWeek", v)}
            />
            <span className="text-sm text-muted">{draft.timesPerWeek === 1 ? "vez" : "veces"} por semana</span>
          </div>
        )}
        {/* Va siempre, con lo que tenía el hábito: sin esto, al guardar un diario las veces
            por semana pasaban a 1. */}
        {draft.frequency !== "weekly" && <input type="hidden" name="timesPerWeek" value={draft.timesPerWeek} />}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 pt-1">
          <span className="text-[13px] text-muted">La semana empieza el</span>
          <Segmented
            name="weekStart"
            value={String(draft.weekStart) as "1" | "0"}
            onChange={(v) => set("weekStart", Number(v))}
            options={[
              { value: "1", label: "Lunes" },
              { value: "0", label: "Domingo" },
            ]}
          />
        </div>
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
          <div className="reveal grid grid-cols-[auto_1fr] items-center gap-3 pt-1">
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

      <label className="flex min-h-11 items-center gap-2.5 text-[14px]">
          <input
            type="checkbox"
            name="isQuit"
            checked={draft.isQuit}
            onChange={(e) => set("isQuit", e.target.checked)}
            className="size-4 accent-[var(--accent)]"
          />
          Es para dejar algo (muestra los días limpios)
        </label>

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

      {state && !state.ok && <p className="reveal text-sm text-danger">{state.error}</p>}

      {askTrack ? (
        <div role="group" aria-labelledby="pista-titulo" className="reveal grid gap-3 rounded-2xl border border-line-strong bg-surface-2 p-4">
          <div className="grid gap-1">
            <p id="pista-titulo" className="text-[14.5px] font-medium">Cambiaste cuándo toca o la meta. ¿Desde cuándo vale?</p>
            <p className="text-[13px] leading-relaxed text-muted">
              Aplicado al historial, los días ya marcados se leen con la regla nueva (un hecho puede pasar a &quot;a medias&quot;
              y cambiar la racha).
            </p>
          </div>
          <Button type="submit" name="desde" value="hoy" variant="accent" disabled={pending} className="h-auto min-h-11 py-2 whitespace-normal">
            <span className="grid text-center leading-tight">
              Empezar una pista nueva desde hoy
              <span className="text-[12px] font-normal opacity-75">Recomendado: el historial queda como estaba</span>
            </span>
          </Button>
          <Button type="submit" name="desde" value="siempre" variant="outline" disabled={pending}>
            Aplicar también al historial
          </Button>
        </div>
      ) : (
        <Button type="submit" variant="accent" disabled={pending} className="w-full">
          {pending ? "Guardando..." : draft.id ? "Guardar cambios" : "Crear hábito"}
        </Button>
      )}
    </form>
  );
}

function effectiveTarget(d: Draft) {
  return d.kind === "count" ? d.target : 1;
}

/** ¿Cambió algo que hace leer distinto los días ya marcados? (Lo mismo que mira el servidor.) */
function rulesDiffer(a: Draft, b: Draft) {
  const days = (d: Draft) => [...d.weekdays].sort().join();
  return (
    a.frequency !== b.frequency ||
    effectiveTarget(a) !== effectiveTarget(b) ||
    (b.frequency === "weekdays" && days(a) !== days(b)) ||
    (b.frequency === "weekly" && (a.timesPerWeek !== b.timesPerWeek || a.weekStart !== b.weekStart))
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
