"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import Link from "next/link";
import { CalendarBlank, CalendarPlus, Check, X } from "@phosphor-icons/react";
import { TimeInput } from "@/components/time-input";
import { Button, cx, Input, Sheet, type SheetHandle } from "@/components/ui";
import { addDays, startOfWeek } from "@/lib/dates";
import { whenLabel } from "@/lib/objective-tree";
import type { KeyResultDTO, StepDTO } from "@/lib/plan-logic";

/** Piezas de Objetivos: filas de tareas, campos en el lugar y la hoja para agendar (2026-10-25). */

export type Op =
  | { type: "addKr"; kr: KeyResultDTO }
  | { type: "renameKr"; id: string; title: string }
  | { type: "removeKr"; ids: string[] }
  | { type: "addStep"; step: StepDTO }
  | { type: "step"; id: string; patch: Partial<StepDTO> }
  | { type: "removeStep"; id: string };

export function reduce(krs: KeyResultDTO[], op: Op): KeyResultDTO[] {
  switch (op.type) {
    case "addKr":
      return [...krs.filter((k) => k.id !== op.kr.id), op.kr];
    case "renameKr":
      return krs.map((k) => (k.id === op.id ? { ...k, title: op.title } : k));
    case "removeKr":
      return krs.filter((k) => !op.ids.includes(k.id));
    case "addStep":
      return krs.map((k) => (k.id === op.step.keyResultId ? { ...k, steps: [...k.steps.filter((s) => s.id !== op.step.id), op.step] } : k));
    case "step":
      return krs.map((k) => ({ ...k, steps: k.steps.map((s) => (s.id === op.id ? { ...s, ...op.patch } : s)) }));
    case "removeStep":
      return krs.map((k) => ({ ...k, steps: k.steps.filter((s) => s.id !== op.id) }));
  }
}

/** Lo que pueden hacer las filas del árbol (todo se ve al instante; el servidor lo confirma). */
export type Ctx = {
  today: string;
  addKr: (parentId: string | null, title: string) => void;
  renameKr: (k: KeyResultDTO, title: string) => void;
  openKr: (k: KeyResultDTO) => void;
  addStep: (krId: string, title: string) => void;
  toggle: (s: StepDTO) => void;
  renameStep: (s: StepDTO, title: string) => void;
  removeStep: (s: StepDTO) => void;
  schedule: (s: StepDTO) => void;
};

export function StepRow({ s, ctx }: { s: StepDTO; ctx: Ctx }) {
  return (
    <li className="group flex min-h-11 items-center gap-2">
      <button
        type="button"
        onClick={() => ctx.toggle(s)}
        aria-pressed={s.done}
        aria-label={s.done ? `Destildar ${s.title}` : `Tildar ${s.title}`}
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-full"
      >
        <span
          aria-hidden
          className={cx(
            "inline-flex size-[18px] items-center justify-center rounded-full border-2 transition-colors",
            s.done ? "border-[var(--c-plan)] bg-[var(--c-plan)] text-white" : "border-line-strong bg-surface",
          )}
        >
          {s.done && <Check size={10} weight="bold" />}
        </span>
      </button>
      <InlineEdit value={s.title} onSave={(t) => ctx.renameStep(s, t)} done={s.done} className="text-[14px]" label="la tarea" />
      {s.date ? (
        <button
          type="button"
          onClick={() => ctx.schedule(s)}
          title="Cambiar el día"
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-surface-2 px-2.5 font-mono text-[11.5px] text-fg hover:bg-surface-3"
        >
          <CalendarBlank size={12} aria-hidden />
          {whenLabel(s.date, s.startTime, ctx.today)}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => ctx.schedule(s)}
          aria-label={`Agendar ${s.title}`}
          title="Mandarla a un día del Plan"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
        >
          <CalendarPlus size={17} aria-hidden />
        </button>
      )}
      <button
        type="button"
        onClick={() => ctx.removeStep(s)}
        aria-label={`Borrar ${s.title}`}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-faint hover:bg-surface-2 hover:text-fg lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
      >
        <X size={13} aria-hidden />
      </button>
    </li>
  );
}

// ─── Campos en el lugar ─────────────────────────────────────────────────────

/** Un nombre que se cambia tocándolo: Enter o salir del campo guarda, Escape lo deja como estaba. */
export function InlineEdit({ value, onSave, className, done, label }: { value: string; onSave: (v: string) => void; className?: string; done?: boolean; label: string }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  if (!editing)
    return (
      <button
        type="button"
        onClick={() => {
          setText(value);
          setEditing(true);
        }}
        title={`Cambiar ${label}`}
        className={cx("min-w-0 flex-1 text-left leading-snug break-words", done && "text-muted line-through decoration-faint", className)}
      >
        {value}
      </button>
    );
  const save = () => {
    const t = text.trim().replace(/\s+/g, " ");
    setEditing(false);
    if (t && t !== value) onSave(t);
  };
  return (
    <Input
      autoFocus
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          save();
        }
        if (e.key === "Escape") setEditing(false);
      }}
      maxLength={160}
      aria-label={`Nombre de ${label}`}
      className="h-9 min-w-0 flex-1"
    />
  );
}

/** Para sumar varios seguidos: Enter agrega y deja el campo listo para el próximo. */
export function InlineAdd({
  placeholder,
  onAdd,
  onClose,
  autoFocus = true,
}: {
  placeholder: string;
  onAdd: (t: string) => void;
  onClose: () => void;
  /** Abierto al cargar la pantalla no toma el foco (si no, la página salta hasta el campo). */
  autoFocus?: boolean;
}) {
  const [text, setText] = useState("");
  const add = () => {
    const t = text.trim().replace(/\s+/g, " ");
    if (!t) return;
    onAdd(t);
    setText("");
  };
  return (
    <div className="flex items-center gap-2">
      <Input
        autoFocus={autoFocus}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => !text.trim() && onClose()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
          if (e.key === "Escape") onClose();
        }}
        maxLength={160}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-10 min-w-0 flex-1"
      />
      <Button type="button" size="sm" variant="accent" onMouseDown={(e) => e.preventDefault()} onClick={add}>
        Agregar
      </Button>
    </div>
  );
}

// ─── Hoja: mandar una tarea a un día ────────────────────────────────────────

export type ScheduleHandle = { open: (s: StepDTO) => void };

const DAY = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

export const ScheduleSheet = forwardRef<
  ScheduleHandle,
  { today: string; onSchedule: (s: StepDTO, date: string, startTime: string | null) => void; onUnschedule: (s: StepDTO) => void }
>(function ScheduleSheet({ today, onSchedule, onUnschedule }, ref) {
  const sheet = useRef<SheetHandle>(null);
  const [step, setStep] = useState<StepDTO | null>(null);
  const [day, setDay] = useState(today);
  const [key, setKey] = useState(0);
  useImperativeHandle(ref, () => ({
    open(s) {
      setStep(s);
      setDay(s.date ?? today);
      setKey((n) => n + 1);
      sheet.current?.open();
    },
  }));
  // Dos semanas desde hoy, de lunes a domingo (así se ve la semana como en el Plan).
  const monday = startOfWeek(today);
  const days = Array.from({ length: 14 }, (_, i) => addDays(monday, i));
  return (
    <Sheet ref={sheet} title={step ? `Agendar · ${step.title}` : "Agendar"}>
      {step && (
        <form
          key={key}
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            onSchedule(step, day, String(fd.get("startTime") ?? "").trim() || null);
            sheet.current?.close();
          }}
        >
          <div className="grid gap-1.5">
            <span className="kicker">Día</span>
            <div className="grid grid-cols-7 gap-1">
              {days.map((d) => {
                const past = d < today;
                return (
                  <button
                    key={d}
                    type="button"
                    disabled={past}
                    aria-pressed={d === day}
                    onClick={() => setDay(d)}
                    className={cx(
                      "grid min-h-12 place-items-center rounded-xl border text-[12px] leading-tight transition-colors disabled:opacity-35",
                      d === day ? "border-accent bg-accent text-on-accent" : d === today ? "border-accent/60 hover:bg-surface-2" : "border-line-strong hover:bg-surface-2",
                    )}
                  >
                    <span>{DAY[new Date(`${d}T00:00:00Z`).getUTCDay()]}</span>
                    <span className="font-mono text-[13px] font-semibold">{Number(d.slice(8))}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5">
              <span className="kicker">Otro día</span>
              <Input type="date" value={day} min={today} onChange={(e) => e.target.value && setDay(e.target.value)} className="min-w-0" />
            </label>
            <label className="grid gap-1.5">
              <span className="kicker">Hora (opcional)</span>
              <TimeInput name="startTime" defaultValue={step.startTime} aria-label="Hora" />
            </label>
          </div>
          <Button type="submit" variant="accent">
            {step.date ? "Cambiar el día" : "Agendar en el Plan"}
          </Button>
          {step.date && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
              <Link href={`/plan?semana=${step.date}`} className="text-[13px] text-accent-fg underline underline-offset-2">
                Ver en el Plan
              </Link>
              <button
                type="button"
                onClick={() => {
                  onUnschedule(step);
                  sheet.current?.close();
                }}
                className="inline-flex min-h-10 items-center rounded-full px-3 text-[13px] text-muted hover:bg-surface-2 hover:text-fg"
              >
                Sacarle el día
              </button>
            </div>
          )}
        </form>
      )}
    </Sheet>
  );
});
