"use client";

import { useSlide } from "@/components/motion";
import { useSafeTransition } from "@/components/safe-action";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useOptimistic, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { dropPending, enqueue, flushQueue, isNetworkError, pendingOps, subscribeQueue } from "@/lib/offline-queue";
import { isSessionExpired, isStaleDeploy, reloadForNewVersion } from "@/lib/offline/queue";
import { notifyError } from "@/components/undo-toast";
import { ArrowBendUpRight, CaretLeft, CaretRight, Check, Flag, Minus, Plus, X } from "@phosphor-icons/react";
import { reorderHabits, setHabitLog } from "@/lib/offline/habit";
import {
  dayState,
  frequencyLabel,
  isDone,
  nextStatus,
  unpackAll,
  type DayLog,
  type DayState,
  type LogMap,
  type LogStatus,
  type PackedLogMap,
} from "@/lib/habit-logic";
import { addDays, formatLong, monthBounds, shiftMonth, weekday } from "@/lib/dates";
import { tone } from "@/lib/palette";
import type { HabitDTO } from "@/lib/habits";
import { Button, cx, inputClass, Sheet, type SheetHandle } from "@/components/ui";
import { mergeOrder } from "@/components/sortable";

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
function withMark(state: Record<string, LogMap>, m: Mark): Record<string, LogMap> {
  const next = { ...(state[m.habitId] ?? {}) };
  const log = applyMark(next[m.date], m);
  if (log) next[m.date] = log;
  else delete next[m.date];
  return { ...state, [m.habitId]: next };
}

/** Marcas de la cola sin señal (las de hábitos), como `Mark`. */
function queuedMarks(): Mark[] {
  return pendingOps()
    .filter((o) => o.type === "habit")
    .map((o) => ({ habitId: o.habitId, date: o.date, status: o.status, value: o.value, note: o.note }));
}

export function useHabitLogs(packed: PackedLogMap) {
  const router = useRouter();
  // Marcas hechas sin señal que todavía no llegaron al servidor (ver offline-queue),
  // y las que acaban de subir: siguen encima de `packed` hasta que llega la versión
  // nueva del servidor (si no, por un momento se vería el estado de antes).
  const [queue, setQueue] = useState<{ ops: Mark[]; sent: Mark[]; sentFor: PackedLogMap | null }>({
    ops: [],
    sent: [],
    sentFor: null,
  });
  useEffect(() => {
    // Se relee cada vez que la cola cambia, también cuando la sube el Shell: si no,
    // una marca vieja ya subida tapaba a la nueva hasta recargar.
    const load = (sent: Mark[] = []) =>
      setQueue((q) => ({
        ops: queuedMarks(),
        sent: sent.length ? [...(q.sentFor === packed ? q.sent : []), ...sent] : q.sent,
        sentFor: sent.length ? packed : q.sentFor,
      }));
    load();
    const unsub = subscribeQueue((c) => load(c.sent));
    const online = async () => {
      if ((await flushQueue()) > 0) router.refresh();
    };
    window.addEventListener("online", online);
    return () => {
      unsub();
      window.removeEventListener("online", online);
    };
  }, [router, packed]);
  const sent = queue.sentFor === packed ? queue.sent : EMPTY;
  // Llegan compactas (ver packLogs); se abren una vez por cada versión del servidor.
  const initial = useMemo(() => [...sent, ...queue.ops].reduce(withMark, unpackAll(packed)), [packed, sent, queue.ops]);
  const [logs, apply] = useOptimistic(initial, withMark);
  const [, startTransition] = useSafeTransition();

  const mark: MarkFn = (habitId, date, status, value = 1, note) => {
    // Una marca nueva reemplaza a las que seguían en la cola para ese día (si no, al
    // subir después pisarían a esta); se queda con la nota que traían.
    const keptNote = dropPending(habitId, date);
    const m: Mark = { habitId, date, status, value, note: note === undefined ? keptNote : note };
    if (!navigator.onLine) return enqueue({ type: "habit", ...m });
    startTransition(async () => {
      apply(m);
      try {
        await setHabitLog(habitId, date, status, value, m.note);
      } catch (e) {
        // Se cortó la señal en el medio: queda en la cola (y se sigue viendo).
        if (isNetworkError(e)) return enqueue({ type: "habit", ...m });
        // Versión nueva publicada con la pantalla abierta: se guarda y se recarga.
        if (isStaleDeploy(e)) {
          enqueue({ type: "habit", ...m });
          return reloadForNewVersion();
        }
        // Sesión vencida: queda guardada hasta que se vuelva a entrar.
        if (isSessionExpired(e)) {
          enqueue({ type: "habit", ...m });
          return notifyError("Sesión vencida: la marca quedó guardada en este aparato. Entrá de nuevo para subirla.");
        }
        // El servidor la rechazó: la marca vuelve a como estaba, con aviso.
        notifyError("No se pudo guardar la marca. Volvió a como estaba.");
        router.refresh();
      }
    });
  };

  return { logs, mark };
}

const EMPTY: Mark[] = [];

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
  done: "bg-[var(--st-done-bg)] border-[var(--st-done-line)] text-[var(--st-done-fg)]",
  partial: "bg-[var(--st-done-bg)] border-[var(--st-done-line)] border-dashed text-[var(--st-done-fg)]",
  failed: "bg-[var(--st-fail-bg)] border-[var(--st-fail-line)] text-[var(--st-fail-fg)]",
  skipped: "bg-[var(--st-skip-bg)] border-[var(--st-skip-line)] text-[var(--st-skip-fg)]",
  unmarked: "bg-[var(--st-skip-bg)] border-transparent text-[var(--st-skip-fg)]",
  missed: "bg-[var(--st-fail-bg)] border-transparent text-[var(--st-fail-fg)]",
  pending: "bg-transparent border-fg/75 text-fg",
  idle: "bg-[var(--st-idle-bg)] border-transparent text-[var(--st-idle-fg)]",
  before: "bg-transparent border-transparent text-faint",
};

const STATE_LABEL: Record<DayState, string> = {
  done: "hecho",
  partial: "a medias",
  failed: "fallado",
  skipped: "salteado",
  unmarked: "sin marcar",
  missed: "fallado (la semana igual se cumplió)",
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
  return (
    <button
      type="button"
      onClick={onTap}
      disabled={future || state === "before"}
      aria-label={`${formatLong(date)}${STATE_LABEL[state] ? `, ${STATE_LABEL[state]}` : ""}${hasNote ? ", con nota" : ""}`}
      className={cx(
        "tabular relative inline-flex items-center justify-center rounded-full border-[1.5px] font-medium transition-[transform,background-color,border-color] duration-200 active:scale-90 disabled:active:scale-100 motion-reduce:transition-none motion-reduce:active:scale-100",
        size === "md"
          ? "size-9 text-[14px] sm:size-11 sm:text-[15px]"
          : "size-9 text-sm sm:size-10",
        future ? "border-line border-dotted bg-transparent text-fg/70" : STATE_CLASS[state],
      )}
    >
      {day}
      {hasNote && <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 border-bg bg-accent" />}
    </button>
  );
}

// ─── Etiqueta de frecuencia + prioridad ─────────────────────────────────────

export function HabitBadge({ habit, text, compact }: { habit: HabitDTO; text?: string; compact?: boolean }) {
  return (
    <span
      style={tone(habit.color)}
      className={cx(
        "inline-flex items-center gap-1 rounded-[3px] bg-tone px-1.5 leading-none font-medium text-tone-fg",
        // En la lista de Hoy del celular, más chica para que entren más hábitos.
        compact ? "py-[2px] text-[11px] lg:py-[3px] lg:text-[12px]" : "py-[3px] text-[12px]",
      )}
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
        className="inline-flex size-11 items-center justify-center rounded-[4px] text-fg hover:bg-surface-2"
        aria-label="Anterior"
      >
        <CaretLeft size={18} weight="bold" />
      </button>
      <div className="grid text-center leading-tight" aria-live="polite">
        <span className="display text-[22px] first-letter:uppercase">{title}</span>
        {subtitle && <span className="kicker tabular mt-0.5">{subtitle}</span>}
      </div>
      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled}
        className="inline-flex size-11 items-center justify-center rounded-[4px] text-fg hover:bg-surface-2 disabled:opacity-30"
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
  const monthSlide = useSlide(month);

  return (
    <div className="grid gap-4">
      <PeriodNav
        title={monthName(month)}
        subtitle={month.slice(0, 4)}
        onPrev={() => setMonth(shiftMonth(month, -1))}
        onNext={() => setMonth(shiftMonth(month, 1))}
      />
      <div key={month} className={cx("grid grid-cols-7 justify-items-center gap-y-2", monthSlide)}>
        {WEEK_HEAD.map((w, i) => (
          <span key={w} className={cx("kicker pb-1", i >= 5 && "text-accent-fg!")}>
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
    // Si ya se guardó al tocar un botón, cerrar no vuelve a guardar.
    const handled = useRef(false);
    const valueRef = useRef<HTMLInputElement>(null);

    /** Cambio desde los botones: la cifra se corre apenas hacia donde fue (sube desde abajo, baja desde arriba). */
    function change(next: number) {
      const dir = Math.sign(next - value);
      setValue(next);
      const el = valueRef.current;
      if (!dir || !el || typeof el.animate !== "function") return;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.animate(
        reduce
          ? [{ opacity: 0.4 }, { opacity: 1 }]
          : [
              { opacity: 0.35, transform: `translateY(${dir * 0.22}em)` },
              { opacity: 1, transform: "none" },
            ],
        { duration: reduce ? 120 : 220, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
      );
    }

    useImperativeHandle(ref, () => ({
      show(habit, date) {
        handled.current = false;
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
    const valueChanged = isCount && value !== (current?.s === "done" ? current.v : 0);

    function apply(status: LogStatus | null, v = 1) {
      if (!habit || !target) return;
      handled.current = true;
      mark(habit.id, target.date, status, v, note);
      sheet.current?.close();
    }

    return (
      <Sheet
        ref={sheet}
        title={habit?.name ?? ""}
        // Una nota escrita o una cantidad cambiada no se pierden al cerrar con la X,
        // Escape o arrastrando: se guardan igual (la cantidad, como con "Guardar").
        onClose={() => {
          if (handled.current || !habit || !target || (!noteChanged && !valueChanged)) return;
          handled.current = true;
          if (valueChanged) mark(habit.id, target.date, value > 0 ? "done" : null, value, note);
          else mark(habit.id, target.date, marked, current?.v ?? 1, note);
        }}
      >
        {habit && target && (
          <div className="grid gap-5">
            <p className="kicker">{formatLong(target.date)}</p>

            {isCount && (
              <div className="grid gap-3">
                <div className="flex items-center justify-center gap-5">
                  <button
                    type="button"
                    onClick={() => change(Math.max(0, value - 1))}
                    className="inline-flex size-12 items-center justify-center rounded-full border border-line-strong text-fg hover:bg-surface-2 active:scale-90 motion-reduce:active:scale-100"
                    aria-label="Restar uno"
                  >
                    <Minus size={20} weight="bold" />
                  </button>
                  <div className="min-w-24 text-center">
                    <input
                      ref={valueRef}
                      type="number"
                      inputMode="numeric"
                      value={value}
                      min={0}
                      onChange={(e) => setValue(Math.max(0, Number(e.target.value) || 0))}
                      className="figure w-24 bg-transparent text-center text-5xl outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                      aria-label="Cantidad"
                    />
                    <p className="kicker mt-1">
                      de {habit.target} {habit.unit ?? ""}
                    </p>
                    {/* Cuánto falta para la meta: avanza al sumar (se vuelve a montar al abrir otro día, así no arranca moviéndose). */}
                    <div key={`${habit.id}|${target.date}`} aria-hidden className="mx-auto mt-2.5 h-1 w-20 overflow-hidden rounded-full bg-surface-3">
                      <div
                        className="h-full rounded-full bg-[var(--st-done-line)] transition-transform duration-300 ease-[var(--ease-out)] motion-reduce:transition-none"
                        style={{ transform: `translateX(${Math.min(100, habit.target > 0 ? (value / habit.target) * 100 : 0) - 100}%)` }}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => change(value + 1)}
                    className="inline-flex size-12 items-center justify-center rounded-full border border-line-strong text-fg hover:bg-surface-2 active:scale-90 motion-reduce:active:scale-100"
                    aria-label="Sumar uno"
                  >
                    <Plus size={20} weight="bold" />
                  </button>
                </div>
                {/* Atajos: solo cambian el número (se guarda con Guardar o al cerrar la hoja). */}
                <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Atajos de cantidad">
                  {stepOf(habit.target) > 1 && (
                    <Button variant="outline" size="sm" onClick={() => change(value + stepOf(habit.target))}>
                      +{stepOf(habit.target)}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" disabled={value >= habit.target} onClick={() => change(habit.target)}>
                    <Check size={14} weight="bold" aria-hidden />
                    Completar
                  </Button>
                  <Button variant="outline" size="sm" disabled={value === 0} onClick={() => change(0)}>
                    Poner en 0
                  </Button>
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
                  cls="text-[var(--st-done-fg)] bg-[var(--st-done-bg)]"
                />
              )}
              <StatusOption
                active={marked === "failed"}
                onClick={() => apply("failed")}
                icon={<X size={18} weight="bold" />}
                label="Fallado"
                cls="text-[var(--st-fail-fg)] bg-[var(--st-fail-bg)]"
              />
              <StatusOption
                active={marked === "skipped"}
                onClick={() => apply("skipped")}
                icon={<ArrowBendUpRight size={18} weight="bold" />}
                label="Saltear"
                cls="text-[var(--st-skip-fg)] bg-[var(--st-skip-bg)]"
              />
            </div>

            <label className="grid gap-1.5">
              <span className="kicker">Nota del día</span>
              <textarea spellCheck lang="es"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={2000}
                placeholder="Cómo te fue, qué pasó..."
                className={cx(inputClass, "h-auto py-2")}
              />
            </label>

            {(noteChanged || marked) && (
              <div className="reveal grid gap-2">
                {noteChanged && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      handled.current = true;
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

/**
 * Paso del atajo "+N" de la hoja: con metas chicas ya están el + y el − (paso 1);
 * con metas grandes, un cuarto de la meta redondeado a 1, 2 o 5 por potencia de 10
 * (2000 ml → +500, 30 páginas → +5, 8 vasos → sin atajo).
 */
function stepOf(target: number): number {
  if (target <= 10) return 1;
  const raw = target / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const nice = [1, 2, 5, 10].map((m) => m * pow).filter((n) => n <= raw);
  return Math.max(1, nice.at(-1) ?? pow);
}

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
        "flex h-16 flex-col items-center justify-center gap-1 rounded-[6px] text-[13px] font-medium transition-transform active:scale-95 motion-reduce:active:scale-100",
        cls,
        active && "ring-[1.5px] ring-current ring-inset",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

/**
 * Orden de los hábitos, el mismo en Hoy y en la Lista: el que se armó arrastrando
 * (si se usó alguna vez) o prioridad y nombre. `reorder` recibe los visibles en su
 * orden nuevo; los que no se ven (filtrados, o que no tocan ese día) no se mueven.
 */
export function useHabitOrder(habits: HabitDTO[], manualOrder: boolean) {
  const [local, setLocal] = useState<string[] | null>(null);
  const [, start] = useSafeTransition();
  const base = [...habits]
    .sort((a, b) =>
      manualOrder ? a.order - b.order || a.name.localeCompare(b.name, "es") : b.priority - a.priority || a.name.localeCompare(b.name, "es"),
    )
    .map((h) => h.id);
  const ids = local ? [...local.filter((id) => base.includes(id)), ...base.filter((id) => !local.includes(id))] : base;
  const byId = new Map(habits.map((h) => [h.id, h]));
  const sorted = ids.map((id) => byId.get(id)!).filter(Boolean);
  function reorder(visibleNew: string[]) {
    const full = mergeOrder(ids, visibleNew);
    setLocal(full);
    start(() => reorderHabits(full));
  }
  return { sorted, reorder };
}
