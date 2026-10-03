"use client";

import { forwardRef, useImperativeHandle, useOptimistic, useRef, useState, useTransition } from "react";
import { ArrowBendUpRight, CaretLeft, CaretRight, Check, Flag, Minus, Plus, X } from "@phosphor-icons/react";
import { setHabitLog } from "@/lib/habit-actions";
import {
  dayState,
  frequencyLabel,
  isDone,
  nextStatus,
  type DayLog,
  type DayState,
  type LogMap,
  type LogStatus,
} from "@/lib/habit-logic";
import { addDays, formatLong, monthBounds, shiftMonth, weekday } from "@/lib/dates";
import { tone } from "@/lib/palette";
import type { HabitDTO } from "@/lib/habits";
import { motion } from "motion/react";
import { Button, cx, inputClass, Sheet, type SheetHandle } from "@/components/ui";
import { Burst, useHasChanged, useJustDone } from "@/components/celebrate";

// ─── Estado optimista de las marcas ─────────────────────────────────────────

export type MarkFn = (
  habitId: string,
  date: string,
  status: LogStatus | null,
  value?: number,
  note?: string | null,
) => void;

type Mark = { habitId: string; date: string; status: LogStatus | null; value: number; note?: string | null };

/** Aplica una marca a un log, con las mismas reglas que la server action. */
function applyMark(prev: DayLog | undefined, m: Mark): DayLog | null {
  const n = m.note === undefined ? prev?.n : m.note?.trim() || undefined;
  let s: DayLog["s"] | null = m.status;
  let v = m.value;
  if (s === "done" && v <= 0) s = null;
  if (s === null) {
    if (!n) return null;
    s = "none";
    v = 0;
  }
  return n ? { s, v, n } : { s, v };
}

/**
 * Las marcas se ven al instante y la server action confirma por detrás. Cuando
 * vuelve, la página se revalida y los datos reales reemplazan a los optimistas.
 */
export function useHabitLogs(initial: Record<string, LogMap>) {
  const [logs, apply] = useOptimistic(initial, (state, m: Mark) => {
    const next = { ...(state[m.habitId] ?? {}) };
    const log = applyMark(next[m.date], m);
    if (log) next[m.date] = log;
    else delete next[m.date];
    return { ...state, [m.habitId]: next };
  });
  const [, startTransition] = useTransition();

  const mark: MarkFn = (habitId, date, status, value = 1, note) => {
    startTransition(async () => {
      apply({ habitId, date, status, value, note });
      await setHabitLog(habitId, date, status, value, note);
    });
  };

  return { logs, mark };
}

export function isCountHabit(h: Pick<HabitDTO, "target" | "unit">) {
  return h.target > 1 || !!h.unit;
}

/** Lo que pasa al tocar un día: en sí/no rota el estado, en cantidad abre la hoja. */
export function useDayTap(
  habit: HabitDTO,
  logs: LogMap,
  mark: MarkFn,
  openDetail: (habit: HabitDTO, date: string) => void,
) {
  return (date: string) => {
    if (isCountHabit(habit)) {
      openDetail(habit, date);
      return;
    }
    mark(habit.id, date, nextStatus(logs[date]), 1);
  };
}

// ─── Círculo de un día ──────────────────────────────────────────────────────

const STATE_CLASS: Record<DayState, string> = {
  done: "bg-[var(--st-done-solid)] text-[var(--st-done-on)]",
  partial: "bg-[var(--st-done-bg)] text-[var(--st-done-fg)] outline-2 outline-dashed -outline-offset-2 outline-[var(--st-done-line)]",
  failed: "bg-[var(--st-fail-solid)] text-[var(--st-fail-on)]",
  skipped: "bg-[var(--st-skip-solid)] text-[var(--st-skip-on)]",
  missed: "bg-[var(--st-fail-bg)] text-[var(--st-fail-fg)]",
  pending: "bg-surface text-fg ring-2 ring-inset ring-accent",
  idle: "bg-[var(--st-idle-bg)] text-[var(--st-idle-fg)]",
  before: "bg-transparent text-faint",
};

const STATE_LABEL: Record<DayState, string> = {
  done: "hecho",
  partial: "a medias",
  failed: "fallado",
  skipped: "salteado",
  missed: "sin marcar",
  pending: "pendiente",
  idle: "",
  before: "antes de empezar",
};

export function DayCircle({
  date,
  state,
  onTap,
  size = "md",
  future,
  hasNote,
}: {
  date: string;
  state: DayState;
  onTap?: () => void;
  size?: "sm" | "md";
  future?: boolean;
  hasNote?: boolean;
}) {
  const day = Number(date.slice(8));
  const shot = useJustDone(state === "done");
  const changed = useHasChanged(state);
  const settled = (state === "done" || state === "failed" || state === "skipped") && changed;
  const off = future || state === "before";
  return (
    <span className="relative inline-flex">
      <Burst shot={shot} />
      <motion.button
        type="button"
        onClick={onTap}
        disabled={off}
        whileTap={off ? undefined : { scale: 0.84 }}
        aria-label={`${formatLong(date)}${STATE_LABEL[state] ? `, ${STATE_LABEL[state]}` : ""}${hasNote ? ", con nota" : ""}`}
        className={cx(
          "tabular relative inline-flex items-center justify-center rounded-full font-extrabold transition-[background-color,color,box-shadow] duration-200",
          size === "md" ? "size-10 text-[15px] sm:size-11" : "size-9 text-sm sm:size-10",
          future ? "bg-transparent text-fg/70 ring-1 ring-inset ring-line-strong" : STATE_CLASS[state],
        )}
      >
        <motion.span
          key={settled ? state : "plain"}
          initial={settled ? { scale: 0.5 } : false}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 600, damping: 15 }}
        >
          {day}
        </motion.span>
        {hasNote && <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-accent ring-2 ring-surface" />}
      </motion.button>
    </span>
  );
}

// ─── Etiqueta de frecuencia + prioridad ─────────────────────────────────────

export function HabitBadge({ habit, text }: { habit: HabitDTO; text?: string }) {
  return (
    <span
      style={tone(habit.color)}
      className="inline-flex items-center gap-1 rounded-full bg-tone px-2 py-1 text-[12px] leading-none font-bold text-tone-fg"
    >
      {text ?? frequencyLabel(habit)}
      {habit.priority > 1 && (
        <>
          <span className="opacity-50">|</span>
          {habit.priority}
          <Flag size={11} weight="bold" />
        </>
      )}
    </span>
  );
}

// ─── Navegador de mes / año ─────────────────────────────────────────────────

export function PeriodNav({
  title,
  subtitle,
  onPrev,
  onNext,
  nextDisabled,
}: {
  title: string;
  subtitle?: string;
  onPrev: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <button
        type="button"
        onClick={onPrev}
        className="inline-flex size-10 items-center justify-center rounded-full bg-accent-soft text-accent-fg transition-transform active:scale-90"
        aria-label="Anterior"
      >
        <CaretLeft size={18} weight="bold" />
      </button>
      <div className="grid text-center leading-tight" aria-live="polite">
        <span className="text-[17px] font-extrabold first-letter:uppercase">{title}</span>
        {subtitle && <span className="tabular text-[13px] text-muted">{subtitle}</span>}
      </div>
      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled}
        className="inline-flex size-10 items-center justify-center rounded-full bg-accent-soft text-accent-fg transition-transform active:scale-90 disabled:opacity-30"
        aria-label="Siguiente"
      >
        <CaretRight size={18} weight="bold" />
      </button>
    </div>
  );
}

export function monthName(month: string) {
  return new Intl.DateTimeFormat("es-UY", { month: "long", timeZone: "UTC" }).format(
    new Date(`${month}-01T00:00:00Z`),
  );
}

// ─── Calendario mensual ─────────────────────────────────────────────────────

const WEEK_HEAD = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export function CalendarMonth({
  habit,
  logs,
  today,
  onTap,
  month: controlled,
  onMonthChange,
  stateOf,
}: {
  habit: HabitDTO;
  logs: LogMap;
  today: string;
  onTap: (date: string) => void;
  month?: string;
  onMonthChange?: (m: string) => void;
  /** Estado de cada día; por defecto, según la pista actual. */
  stateOf?: (iso: string) => DayState;
}) {
  const [own, setOwn] = useState(today.slice(0, 7));
  const month = controlled ?? own;
  const setMonth = onMonthChange ?? setOwn;
  const { from, to } = monthBounds(month);
  const lead = (weekday(from) + 6) % 7; // lunes primero
  const cells: { date: string; inMonth: boolean }[] = [];
  for (let i = lead; i > 0; i--) cells.push({ date: addDays(from, -i), inMonth: false });
  for (let d = from; d <= to; d = addDays(d, 1)) cells.push({ date: d, inMonth: true });
  while (cells.length % 7 !== 0) cells.push({ date: addDays(cells[cells.length - 1].date, 1), inMonth: false });

  return (
    <div className="grid gap-4">
      <PeriodNav
        title={monthName(month)}
        subtitle={month.slice(0, 4)}
        onPrev={() => setMonth(shiftMonth(month, -1))}
        onNext={() => setMonth(shiftMonth(month, 1))}
      />
      <div className="grid grid-cols-7 justify-items-center gap-y-2">
        {WEEK_HEAD.map((w, i) => (
          <span key={w} className={cx("pb-1 text-[12px] font-bold", i >= 5 ? "text-accent-fg" : "text-muted")}>
            {w}
          </span>
        ))}
        {cells.map(({ date, inMonth }) =>
          inMonth ? (
            <DayCircle
              key={date}
              size="sm"
              date={date}
              state={stateOf ? stateOf(date) : dayState(habit, logs, date, today)}
              future={date > today}
              hasNote={!!logs[date]?.n}
              onTap={() => onTap(date)}
            />
          ) : (
            <span
              key={date}
              className="tabular inline-flex size-9 items-center justify-center text-sm text-faint sm:size-10"
            >
              {Number(date.slice(8))}
            </span>
          ),
        )}
      </div>
    </div>
  );
}

// ─── Hoja para marcar un día en detalle ─────────────────────────────────────

export type DaySheetHandle = { show: (habit: HabitDTO, date: string) => void };

/**
 * Marca un día con todas las opciones: cantidad (con +/-), hecho, fallado,
 * salteado, nota o borrar. Se abre en hábitos de cantidad y al tocar un hábito
 * en Hoy.
 */
export const DaySheet = forwardRef<DaySheetHandle, { logs: Record<string, LogMap>; mark: MarkFn }>(
  function DaySheet({ logs, mark }, ref) {
    const sheet = useRef<SheetHandle>(null);
    const [target, setTarget] = useState<{ habit: HabitDTO; date: string } | null>(null);
    const [value, setValue] = useState(0);
    const [note, setNote] = useState("");

    useImperativeHandle(ref, () => ({
      show(habit, date) {
        const log = logs[habit.id]?.[date];
        setTarget({ habit, date });
        setValue(log?.s === "done" ? log.v : 0);
        setNote(log?.n ?? "");
        sheet.current?.open();
      },
    }));

    const habit = target?.habit;
    const isCount = !!habit && isCountHabit(habit);
    const current = habit && target ? logs[habit.id]?.[target.date] : undefined;
    const marked = current && current.s !== "none" ? (current.s as LogStatus) : null;
    const noteChanged = note.trim() !== (current?.n ?? "");

    function apply(status: LogStatus | null, v = 1) {
      if (!habit || !target) return;
      mark(habit.id, target.date, status, v, note);
      sheet.current?.close();
    }

    return (
      <Sheet ref={sheet} title={habit?.name ?? ""}>
        {habit && target && (
          <div className="grid gap-5">
            <p className="text-sm text-muted first-letter:uppercase">{formatLong(target.date)}</p>

            {isCount && (
              <div className="grid gap-3">
                <div className="flex items-center justify-center gap-5">
                  <button
                    type="button"
                    onClick={() => setValue((v) => Math.max(0, v - 1))}
                    className="inline-flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent-fg transition-transform active:scale-90"
                    aria-label="Restar uno"
                  >
                    <Minus size={20} weight="bold" />
                  </button>
                  <div className="min-w-24 text-center">
                    <input
                      type="number"
                      inputMode="numeric"
                      value={value}
                      min={0}
                      onChange={(e) => setValue(Math.max(0, Number(e.target.value) || 0))}
                      className="tabular w-24 bg-transparent text-center text-5xl font-black tracking-tight outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                      aria-label="Cantidad"
                    />
                    <p className="text-xs text-muted">
                      de {habit.target} {habit.unit ?? ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setValue((v) => v + 1)}
                    className="inline-flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent-fg transition-transform active:scale-90"
                    aria-label="Sumar uno"
                  >
                    <Plus size={20} weight="bold" />
                  </button>
                </div>
                <Button variant="accent" onClick={() => apply(value > 0 ? "done" : null, value)}>
                  Guardar
                </Button>
              </div>
            )}

            <div className={cx("grid gap-2", isCount ? "grid-cols-2" : "grid-cols-3")}>
              {!isCount && (
                <StatusOption
                  active={isDone(habit, current)}
                  onClick={() => apply("done", habit.target)}
                  icon={<Check size={18} weight="bold" />}
                  label="Hecho"
                  cls="text-[var(--st-done-on)] bg-[var(--st-done-solid)]"
                />
              )}
              <StatusOption
                active={marked === "failed"}
                onClick={() => apply("failed")}
                icon={<X size={18} weight="bold" />}
                label="Fallado"
                cls="text-[var(--st-fail-on)] bg-[var(--st-fail-solid)]"
              />
              <StatusOption
                active={marked === "skipped"}
                onClick={() => apply("skipped")}
                icon={<ArrowBendUpRight size={18} weight="bold" />}
                label="Saltear"
                cls="text-[var(--st-skip-on)] bg-[var(--st-skip-solid)]"
              />
            </div>

            <label className="grid gap-1.5">
              <span className="pl-1 text-[13px] font-semibold text-muted">Nota del día</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={2000}
                placeholder="Cómo te fue, qué pasó..."
                className={cx(inputClass, "h-auto py-2")}
              />
            </label>

            {(noteChanged || marked) && (
              <div className="grid gap-2">
                {noteChanged && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      mark(habit.id, target.date, marked, current?.v ?? 1, note);
                      sheet.current?.close();
                    }}
                  >
                    Guardar nota
                  </Button>
                )}
                {marked && (
                  <Button variant="ghost" onClick={() => apply(null)}>
                    Borrar marca
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </Sheet>
    );
  },
);

function StatusOption({
  active,
  onClick,
  icon,
  label,
  cls,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  cls: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "flex h-[72px] flex-col items-center justify-center gap-1 rounded-[18px] text-sm font-extrabold transition-[transform,opacity] duration-200 active:scale-95",
        cls,
        active ? "ring-[3px] ring-fg/80 ring-offset-2 ring-offset-surface" : "opacity-90 hover:opacity-100",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
