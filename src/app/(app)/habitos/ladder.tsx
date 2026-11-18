"use client";

import { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, CaretRight, Check, Clock, PencilSimple, Plus, X } from "@phosphor-icons/react";
import { diffDays, formatShort, weekday } from "@/lib/dates";
import { dayState, isDone, type LogMap } from "@/lib/habit-logic";
import {
  advance,
  habitNeverTwice,
  habitPerWeek,
  LADDER_DEFAULT_WEEKS,
  LADDER_GOAL_MAX,
  LADDER_MAX_STEPS,
  LADDER_NOTE_MAX,
  LADDER_WEEKS_MAX,
  ladderDoneFn,
  ladderWeeks,
  snoozeWeek,
  spanWeeks,
  stepBack,
  stepProgress,
  stepRuleText,
  weeksText,
  type Ladder,
  type LadderStep,
  type LadderWeek,
  type ProgressOpts,
} from "@/lib/habit-ladder";
import { HabitAvatar } from "@/lib/habit-icons";
import type { HabitDTO } from "@/lib/habits";
import {
  advanceLadder,
  endLadder,
  saveLadderSteps,
  setLadderNotes,
  setNeverTwice as setNeverTwiceAction,
  startLadder,
  stayLadder,
  stepBackLadder,
} from "@/lib/offline/habit";
import { useSafeTransition } from "@/components/safe-action";
import { notifyError } from "@/components/undo-toast";
import { haptic } from "@/components/haptics";
import { Button, cx, inputClass, Sheet, type SheetHandle } from "@/components/ui";
import { CheckButton, tapHabit } from "./day-rows";
import type { MarkFn } from "./habit-ui";
import "./habits.css";

/*
 * Hábitos en construcción ("de a poco"): el hábito sube por escalones hasta la meta.
 * Todo va por semanas: cada escalón pide unos días por semana y se sube después de
 * cumplirlo unas semanas seguidas. Acá van las piezas de pantalla: el recuadro
 * "En construcción" de Hoy e Inicio, la hoja "El camino" (con el gráfico semana a
 * semana), el editor de escalones y la línea de "Nunca dos seguidos". Las reglas
 * viven en lib/habit-ladder.ts.
 */

type Result = { ok: boolean; error?: string };
type Over = { ladder?: Ladder | null; neverTwice?: boolean };
type Notes = { why: string | null; cue: string | null };

const sigOf = (h: HabitDTO) => JSON.stringify([h.ladder ?? null, !!h.neverTwice]);

export type LadderActions = {
  advance: (h: HabitDTO) => void;
  stay: (h: HabitDTO) => void;
  back: (h: HabitDTO) => void;
  end: (h: HabitDTO) => void;
  saveSteps: (h: HabitDTO, steps: LadderStep[]) => void;
  setNeverTwice: (h: HabitDTO, on: boolean) => void;
  setNotes: (h: HabitDTO, notes: Notes) => void;
  start: (h: HabitDTO, plan: { goal: string; steps: LadderStep[]; neverTwice: boolean; why?: string | null; cue?: string | null }) => void;
};

/**
 * Los cambios de escalón se ven al instante: cada acción deja un parche sobre el
 * hábito hasta que llega la versión nueva del servidor (o, sin señal, mientras la
 * pantalla siga abierta). Si el servidor la rechaza, el parche se va con aviso.
 */
export function useLadders(habits: HabitDTO[], today: string): { habits: HabitDTO[]; actions: LadderActions } {
  const [over, setOver] = useState<Record<string, { patch: Over; sig: string }>>({});
  const [, start] = useSafeTransition();
  const merged = useMemo(() => {
    if (!Object.keys(over).length) return habits;
    return habits.map((h) => {
      const o = over[h.id];
      // Si el servidor ya cambió este hábito, manda lo del servidor.
      return o && o.sig === sigOf(h) ? { ...h, ...o.patch } : h;
    });
  }, [habits, over]);

  // Lo último que se ve de cada hábito (con los parches), para encadenar acciones.
  const latest = useRef(merged);
  const server = useRef(habits);
  useLayoutEffect(() => {
    latest.current = merged;
    server.current = habits;
  });

  const actions = useMemo<LadderActions>(() => {
    const drop = (id: string) =>
      setOver((o) => {
        const next = { ...o };
        delete next[id];
        return next;
      });
    const run = (h: HabitDTO, patch: (cur: HabitDTO) => Over, call: () => Promise<Result>) => {
      const cur = latest.current.find((x) => x.id === h.id) ?? h;
      const base = server.current.find((x) => x.id === h.id) ?? h;
      setOver((o) => ({ ...o, [h.id]: { patch: { ...(o[h.id]?.patch ?? {}), ...patch(cur) }, sig: sigOf(base) } }));
      start(
        async () => {
          const r = await call();
          if (!r.ok) {
            drop(h.id);
            notifyError(r.error || "No se pudo guardar. Volvió a como estaba.");
          }
        },
        { onError: () => drop(h.id) },
      );
    };
    return {
      advance: (h) => {
        haptic("success");
        run(h, (c) => ({ ladder: c.ladder ? advance(c.ladder, today) : c.ladder }), () => advanceLadder(h.id));
      },
      stay: (h) => run(h, (c) => ({ ladder: c.ladder ? snoozeWeek(c.ladder, today) : c.ladder }), () => stayLadder(h.id)),
      back: (h) => run(h, (c) => ({ ladder: c.ladder ? stepBack(c.ladder, today) : c.ladder }), () => stepBackLadder(h.id)),
      end: (h) => {
        haptic("success");
        run(h, () => ({ ladder: null }), () => endLadder(h.id));
      },
      saveSteps: (h, steps) =>
        run(
          h,
          (c) => ({ ladder: c.ladder ? { ...c.ladder, steps, current: Math.min(c.ladder.current, steps.length - 1) } : c.ladder }),
          () => saveLadderSteps(h.id, steps),
        ),
      setNeverTwice: (h, on) => run(h, () => ({ neverTwice: on }), () => setNeverTwiceAction(h.id, on)),
      setNotes: (h, notes) =>
        run(h, (c) => ({ ladder: c.ladder ? { ...c.ladder, why: notes.why, cue: notes.cue } : c.ladder }), () => setLadderNotes(h.id, notes)),
      start: (h, plan) =>
        run(
          h,
          () => ({
            ladder: {
              goal: plan.goal,
              steps: plan.steps,
              current: 0,
              stepStart: today,
              snoozeUntil: null,
              history: [],
              why: plan.why ?? null,
              cue: plan.cue ?? null,
            },
            neverTwice: plan.neverTwice,
          }),
          () => startLadder(h.id, plan),
        ),
    };
  }, [start, today]);

  return { habits: merged, actions };
}

// ─── Cuentas de un hábito en construcción ──────────────────────────────────

/** ¿Ese día está hecho? Con la meta del escalón si la tiene (si no, la del hábito). */
function doneFn(h: HabitDTO, logs: LogMap) {
  const step = h.ladder?.steps[Math.min(h.ladder.current, h.ladder.steps.length - 1)];
  return ladderDoneFn({ target: step?.target ?? h.target }, logs);
}

/** Lo que el progreso necesita saber del hábito (semana, frecuencia). */
const optsOf = (h: HabitDTO): ProgressOpts => ({ weekStart: h.weekStart, frequency: h.frequency, weekdays: h.weekdays, timesPerWeek: h.timesPerWeek });

/** "Nunca dos seguidos" de un hábito (la regla está en habit-ladder.ts). */
export function neverTwiceOf(h: HabitDTO, logs: LogMap, today: string) {
  return habitNeverTwice(h, logs, today);
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** "2 de 3 días" (o "1 de 1 día"). */
const ofDays = (done: number, need: number) => `${done} de ${need} ${need === 1 ? "día" : "días"}`;
/** Iniciales de los días: L M M J V S D (sin la X de miércoles). */
const INITIAL = ["D", "L", "M", "M", "J", "V", "S"];

type Prog = ReturnType<typeof stepProgress>;

/** Número de la semana en curso dentro de las seguidas que pide ("Semana 2 de 2"). */
function weekNumber(p: Prog) {
  const curMet = p.weeks.at(-1)?.met === true;
  return Math.max(1, Math.min(p.weeksNeeded, curMet ? p.streak : p.streak + 1));
}

/** La línea chica debajo de los días: cómo van las semanas seguidas. */
function weekLine(p: Prog) {
  if (p.atGoal) {
    return p.streak > 0
      ? `Semana ${Math.min(p.streak, p.weeksNeeded)} de ${p.weeksNeeded} en la meta`
      : `Es la meta: ${weeksText(p.weeksNeeded)} y pasa a tus hábitos`;
  }
  if (p.streak > 0) return `Semana ${Math.min(p.streak, p.weeksNeeded)} de ${p.weeksNeeded} cumplida`;
  return `Cumplí ${weeksText(p.weeksNeeded)} para subir`;
}

// ─── Escalerita y días de la semana ─────────────────────────────────────────

/** Barras de alto creciente, una por escalón: las de abajo y la actual llenas; la próxima, punteada si toca subir. */
export function Stairs({ total, current, nextDashed, className }: { total: number; current: number; nextDashed?: boolean; className?: string }) {
  const n = Math.max(1, total);
  return (
    <span role="img" aria-label={`Escalón ${current + 1} de ${n}`} className={cx("lad-stairs", className)}>
      {Array.from({ length: n }, (_, i) => (
        <span
          key={i}
          data-on={i <= current || undefined}
          data-now={i === current || undefined}
          data-next={nextDashed && i === current + 1 ? "" : undefined}
          style={{ height: `${n === 1 ? 100 : 34 + (66 * i) / (n - 1)}%` }}
        />
      ))}
    </span>
  );
}

/** Los 7 días de la semana en curso: hecho lleno, pasado sin hacer vacío, futuro tenue. */
function WeekDots({ days, today, done, need }: { days: Prog["thisWeek"]["days"]; today: string; done: number; need: number }) {
  return (
    <span role="img" aria-label={`Esta semana: ${ofDays(done, need)}`} className="lad-week">
      {days.map((d) => (
        <span key={d.date} data-on={d.done || undefined} data-future={d.future || undefined} data-today={d.date === today || undefined}>
          <i />
          {INITIAL[weekday(d.date)]}
        </span>
      ))}
    </span>
  );
}

// ─── Recuadro "En construcción" ─────────────────────────────────────────────

export type LadderPathHandle = { show: (habitId: string) => void };

/**
 * Los hábitos en construcción de un día, arriba de la lista común (Hoy e Inicio).
 * El círculo marca igual que en las filas comunes (`CheckButton` + `tapHabit`,
 * misma cola sin señal); tocar el resto abre "El camino".
 */
export function LadderBox({
  habits,
  all,
  logs,
  day,
  today,
  mark,
  onOpenDay,
  actions,
  className,
}: {
  /** Los hábitos en construcción que van ese día. */
  habits: HabitDTO[];
  /** Todos (con los parches), para que la hoja siga al hábito aunque cambie. */
  all: HabitDTO[];
  logs: Record<string, LogMap>;
  day: string;
  today: string;
  mark: MarkFn;
  onOpenDay: (h: HabitDTO) => void;
  actions: LadderActions;
  className?: string;
}) {
  const path = useRef<LadderPathHandle>(null);
  if (!habits.length) return null;
  return (
    <section data-tone="habitos" aria-labelledby="lad-box-title" className={cx("lad-box", className)}>
      <h2 id="lad-box-title" className="lad-kicker px-1">
        En construcción · {habits.length}
      </h2>
      <ul className="grid gap-2">
        {habits.map((h) => (
          <LadderItem
            key={h.id}
            habit={h}
            logs={logs[h.id] ?? NO_LOGS}
            day={day}
            today={today}
            mark={mark}
            onOpenDay={onOpenDay}
            onPath={() => path.current?.show(h.id)}
            actions={actions}
          />
        ))}
      </ul>
      <LadderPathSheet ref={path} habits={all} logs={logs} today={today} actions={actions} />
    </section>
  );
}

const NO_LOGS: LogMap = {};

function LadderItem({
  habit: h,
  logs,
  day,
  today,
  mark,
  onOpenDay,
  onPath,
  actions,
}: {
  habit: HabitDTO;
  logs: LogMap;
  day: string;
  today: string;
  mark: MarkFn;
  onOpenDay: (h: HabitDTO) => void;
  onPath: () => void;
  actions: LadderActions;
}) {
  const ladder = h.ladder!;
  const steps = ladder.steps;
  const cur = Math.min(ladder.current, steps.length - 1);
  const step = steps[cur];
  const prog = stepProgress(ladder, doneFn(h, logs), today, optsOf(h));
  const nt = h.neverTwice ? neverTwiceOf(h, logs, today) : null;
  const alert = !!nt?.failedYesterday && day === today;
  const isLast = cur >= steps.length - 1;
  // En el último escalón no hay "subir": sostenido las semanas que pide, llegó a la meta.
  const goalMet = prog.atGoal && prog.streak >= prog.weeksNeeded;
  const log = logs[day];
  const state = log?.s === "skipped" ? "skipped" : dayState(h, logs, day, today);
  const [confirmBack, setConfirmBack] = useState(false);
  const next = steps[cur + 1];

  return (
    <li className="lad-item" data-alert={alert || undefined}>
      {alert && nt && (
        <div className="grid gap-2 px-3.5 pt-3 lg:px-4">
          <p className="lad-alert-kicker">Hoy es el que importa</p>
          <p className="text-[14px] leading-snug font-medium text-fg">Ayer no salió. Que no sean dos seguidos.</p>
          {ladder.why && <p className="text-[13.5px] leading-snug text-fg">Acordate: {ladder.why}</p>}
          <div className="grid grid-cols-2 gap-2">
            <span className="lad-alert-fig">
              <b className="figure">{nt.daysWithoutTwo}</b>
              <span>{nt.daysWithoutTwo === 1 ? "día" : "días"} sin fallar dos seguidos</span>
            </span>
            <span className="lad-alert-fig">
              <b className="figure">{nt.recoveries}</b>
              <span>{nt.recoveries === 1 ? "vez que volviste" : "veces que volviste"} enseguida</span>
            </span>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 px-3.5 py-2.5 lg:gap-4 lg:px-4">
        <button
          type="button"
          onClick={onPath}
          aria-label={`${h.name}: ${step?.title ?? ""}. Ver el camino`}
          className="tap-tint -my-1 -ml-1.5 flex min-w-0 flex-1 items-center gap-3 rounded-lg py-1 pl-1.5 text-left lg:gap-4"
        >
          <HabitAvatar icon={h.icon} color={h.color} className="size-9 lg:size-[42px]" />
          <span className="grid min-w-0 gap-0.5">
            <span className="line-clamp-2 text-[16px] leading-tight font-medium tracking-[-0.01em] lg:text-[16.5px]">
              {step?.title || h.name}
            </span>
            {ladder.cue && (
              <span className="lad-cue">
                <Clock size={12} weight="bold" aria-hidden />
                <span className="truncate">{ladder.cue}</span>
              </span>
            )}
            <span className="lad-sub">
              {h.name !== step?.title && <span className="max-sm:hidden">{h.name} · </span>}
              Escalón {cur + 1} de {steps.length}
              {prog.ready || goalMet ? " · logrado" : ` · esta semana ${ofDays(prog.thisWeek.done, prog.thisWeek.need)}`}
            </span>
          </span>
        </button>
        <CheckButton state={state} disabled={day > today} onTap={() => tapHabit(h, log, day, mark, onOpenDay)} />
      </div>

      {goalMet ? (
        <div className="lad-ready">
          <p className="lad-kicker">Llegaste a la meta · {weeksText(prog.streak)}</p>
          <p className="text-[14px] leading-snug text-fg">
            {ladder.goal ? <>“{ladder.goal}” ya es parte de tus días.</> : "Ya es parte de tus días."} Puede pasar a tus hábitos de
            siempre.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="accent" onClick={() => actions.end(h)}>
              Pasar a mis hábitos
            </Button>
            <Button size="sm" variant="outline" onClick={onPath}>
              Ver el camino
            </Button>
          </div>
        </div>
      ) : prog.ready && !isLast && next ? (
        <div className="lad-ready">
          <p className="lad-kicker">
            Escalón {cur + 1} logrado · {weeksText(prog.streak)}
          </p>
          <div className="flex items-end gap-3">
            <Stairs total={steps.length} current={cur} nextDashed className="h-9" />
            <p className="grid min-w-0 gap-0.5 text-[14px] leading-snug text-fg">
              <span>
                ¿Subís al escalón {cur + 2}? <b className="font-medium">{next.title}</b>
              </span>
              <span className="text-[12.5px] text-muted">{stepRuleText(next, h, cur + 1 === steps.length - 1)}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="accent" onClick={() => actions.advance(h)}>
              Subir
            </Button>
            <Button size="sm" variant="outline" onClick={() => actions.stay(h)}>
              Una semana más
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-1 px-3.5 pb-2.5 lg:px-4">
          <div className="flex items-center justify-between gap-3">
            <WeekDots days={prog.thisWeek.days} today={today} done={prog.thisWeek.done} need={prog.thisWeek.need} />
            <span className="flex items-center gap-2.5">
              <Stairs total={steps.length} current={cur} className="h-6 max-[380px]:hidden" />
              <button type="button" onClick={onPath} className="lad-link">
                Ver el camino <CaretRight size={12} weight="bold" aria-hidden />
              </button>
            </span>
          </div>
          <p className="text-[12.5px] leading-snug text-muted">{weekLine(prog)}</p>
        </div>
      )}

      {prog.struggling && cur > 0 && !prog.ready && !goalMet && (
        <div className="lad-struggle">
          {confirmBack ? (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>¿Volver a “{steps[cur - 1]?.title}”? No se pierde lo hecho.</span>
              <button
                type="button"
                className="lad-link"
                onClick={() => {
                  setConfirmBack(false);
                  actions.back(h);
                }}
              >
                Sí, volver
              </button>
              <button type="button" className="lad-link" onClick={() => setConfirmBack(false)}>
                No
              </button>
            </span>
          ) : (
            <span className="flex flex-wrap items-center gap-x-2">
              <span>Este escalón está costando ·</span>
              <button type="button" className="lad-link" onClick={() => setConfirmBack(true)}>
                Volver al anterior
              </button>
            </span>
          )}
        </div>
      )}
    </li>
  );
}

// ─── "Nunca dos seguidos" en una fila común ─────────────────────────────────

/** La línea amarilla de una fila común con "Nunca dos seguidos" el día después de fallar. */
export function NeverTwiceLine({ habit, logs, today }: { habit: HabitDTO; logs: LogMap; today: string }) {
  const nt = useMemo(() => (habit.neverTwice ? neverTwiceOf(habit, logs, today) : null), [habit, logs, today]);
  if (!nt?.failedYesterday) return null;
  return (
    <span className="lad-warn">
      Ayer no salió: hoy es el que importa · {plural(nt.daysWithoutTwo, "día", "días")} sin fallar dos seguidos
    </span>
  );
}

// ─── El camino ──────────────────────────────────────────────────────────────

export const LadderPathSheet = forwardRef<
  LadderPathHandle,
  { habits: HabitDTO[]; logs: Record<string, LogMap>; today: string; actions: LadderActions }
>(function LadderPathSheet({ habits, logs, today, actions }, ref) {
  const sheet = useRef<SheetHandle>(null);
  const [id, setId] = useState<string | null>(null);
  const [editKey, setEditKey] = useState(0);
  useImperativeHandle(ref, () => ({
    show(habitId) {
      setId(habitId);
      setEditKey((k) => k + 1);
      sheet.current?.open();
    },
  }));
  const h = habits.find((x) => x.id === id);
  return (
    <Sheet ref={sheet} title="El camino">
      {h?.ladder ? (
        <LadderPath
          key={`${h.id}-${editKey}`}
          habit={h}
          logs={logs[h.id] ?? NO_LOGS}
          today={today}
          actions={actions}
          onClose={() => sheet.current?.close()}
        />
      ) : h ? (
        <div className="grid gap-3" data-tone="habitos">
          <p className="text-[15px] text-fg">“{h.name}” ya está en tus hábitos de siempre.</p>
          <Button variant="outline" onClick={() => sheet.current?.close()}>
            Cerrar
          </Button>
        </div>
      ) : null}
    </Sheet>
  );
});

function LadderPath({
  habit: h,
  logs,
  today,
  actions,
  onClose,
}: {
  habit: HabitDTO;
  logs: LogMap;
  today: string;
  actions: LadderActions;
  onClose: () => void;
}) {
  const ladder = h.ladder!;
  const steps = ladder.steps;
  const cur = Math.min(ladder.current, steps.length - 1);
  const isDoneDay = doneFn(h, logs);
  const opts = optsOf(h);
  const prog = stepProgress(ladder, isDoneDay, today, opts);
  const allWeeks = ladderWeeks(ladder, isDoneDay, today, opts);
  const nt = neverTwiceOf(h, logs, today);
  const goalMet = prog.atGoal && prog.streak >= prog.weeksNeeded;
  const since = ladder.history?.[0]?.from ?? ladder.stepStart;
  const ago = Math.max(0, diffDays(today, since));
  const doneDays = useMemo(() => Object.keys(logs).filter((d) => d >= since && d <= today && isDone(h, logs[d])).length, [logs, since, today, h]);
  const [editing, setEditing] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);

  return (
    <div className="grid gap-5" data-tone="habitos">
      <div className="flex items-center gap-3">
        <HabitAvatar icon={h.icon} color={h.color} size={42} />
        <div className="grid min-w-0 gap-0.5">
          <p className="truncate text-[17px] font-semibold tracking-[-0.01em]">{h.name}</p>
          <p className="text-[13px] leading-snug text-muted">
            {ladder.goal ? `Meta: ${ladder.goal}` : "Sin meta escrita"} ·{" "}
            {ago === 0
              ? "empezaste hoy"
              : ago === 1
                ? "empezaste ayer"
                : ago < 14
                  ? `empezaste hace ${ago} días`
                  : `empezaste hace ${spanWeeks(since, today)} semanas`}
          </p>
        </div>
      </div>

      <NotesBlock habit={h} actions={actions} />

      {editing ? (
        <StepsEditor
          initial={steps}
          habit={h}
          onCancel={() => setEditing(false)}
          onSave={(next) => {
            actions.saveSteps(h, next);
            setEditing(false);
          }}
        />
      ) : (
        <>
          <ol className="lad-path" aria-label="Escalones">
            {steps.map((s, i) => {
              const past = i < cur;
              const now = i === cur;
              const isLast = i === steps.length - 1;
              const hist = ladder.history?.filter((x) => x.step === i).at(-1);
              return (
                <li key={i} className="lad-path-step" data-state={past ? "past" : now ? "now" : "next"}>
                  <span className="lad-path-dot" aria-hidden>
                    {past ? <Check size={13} weight="bold" /> : i + 1}
                  </span>
                  <div className="grid min-w-0 gap-1 pb-4">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] leading-snug font-medium">
                      <span className="min-w-0">{s.title}</span>
                      {now && <span className="lad-chip">estás acá</span>}
                    </p>
                    <p className="text-[13px] leading-snug text-muted">
                      {past ? (hist ? `Logrado en ${plural(spanWeeks(hist.from, hist.to), "semana", "semanas")}` : "Logrado") : stepRuleText(s, h, isLast)}
                    </p>
                    {now && (
                      <div className="grid gap-1.5 pt-0.5">
                        <p className="text-[13px] leading-snug text-fg">
                          {prog.ready || goalMet
                            ? `Logrado · ${weeksText(prog.streak)}`
                            : `Semana ${weekNumber(prog)} de ${prog.weeksNeeded}${isLast ? " en la meta" : ""} · esta semana ${ofDays(prog.thisWeek.done, prog.thisWeek.need)}`}
                        </p>
                        <WeekDots days={prog.thisWeek.days} today={today} done={prog.thisWeek.done} need={prog.thisWeek.need} />
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>

          {allWeeks.length > 1 && <WeekChart weeks={allWeeks} />}

          <div className="grid grid-cols-3 gap-2">
            <PathFig value={nt.daysWithoutTwo} label="sin fallar dos seguidos" />
            <PathFig value={nt.recoveries} label={nt.recoveries === 1 ? "vez que volviste" : "veces que volviste"} />
            <PathFig value={doneDays} label={doneDays === 1 ? "día hecho" : "días hechos"} />
          </div>

          {prog.ready && cur < steps.length - 1 && (
            <div className="flex flex-wrap gap-2">
              <Button variant="accent" onClick={() => actions.advance(h)}>
                Subir al escalón {cur + 2}
              </Button>
              <Button variant="outline" onClick={() => actions.stay(h)}>
                Una semana más
              </Button>
            </div>
          )}
          {goalMet && (
            <Button
              variant="accent"
              onClick={() => {
                actions.end(h);
                onClose();
              }}
            >
              Pasar a mis hábitos
            </Button>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="outline" onClick={() => setEditing(true)}>
              Editar escalones
            </Button>
            <Button variant="outline" disabled={cur === 0} onClick={() => actions.back(h)}>
              Volver al escalón anterior
            </Button>
          </div>

          <div className="flex justify-center">
            {confirmEnd ? (
              <span className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[13px] text-muted">
                <span>Pasa a tus hábitos como está ahora.</span>
                <button
                  type="button"
                  className="lad-link"
                  onClick={() => {
                    actions.end(h);
                    onClose();
                  }}
                >
                  Sí, dejar de construirlo
                </button>
                <button type="button" className="lad-link" onClick={() => setConfirmEnd(false)}>
                  No
                </button>
              </span>
            ) : (
              <button type="button" className="min-h-11 text-[13px] text-muted underline-offset-2 hover:underline" onClick={() => setConfirmEnd(true)}>
                Dejar de construirlo
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function PathFig({ value, label }: { value: number; label: string }) {
  return (
    <div className="grid content-start gap-0.5 rounded-[14px] bg-surface-2 px-3 py-2.5">
      <span className="figure text-[22px] font-[750]">{value}</span>
      <span className="text-[12px] leading-snug text-muted">{label}</span>
    </div>
  );
}

/** "Para qué" y "Cuándo y dónde" del camino, con un lápiz para cambiarlos. */
function NotesBlock({ habit: h, actions }: { habit: HabitDTO; actions: LadderActions }) {
  const ladder = h.ladder!;
  const [editing, setEditing] = useState(false);
  const [why, setWhy] = useState(ladder.why ?? "");
  const [cue, setCue] = useState(ladder.cue ?? "");
  if (editing) {
    return (
      <div className="reveal grid gap-3 rounded-[14px] bg-surface-2 p-3">
        <NotesFields why={why} onWhy={setWhy} cue={cue} onCue={setCue} />
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="accent"
            onClick={() => {
              actions.setNotes(h, { why: why.trim() || null, cue: cue.trim() || null });
              setEditing(false);
            }}
          >
            Guardar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setWhy(ladder.why ?? "");
              setCue(ladder.cue ?? "");
              setEditing(false);
            }}
          >
            Cancelar
          </Button>
        </div>
      </div>
    );
  }
  if (!ladder.why && !ladder.cue) {
    return (
      <button type="button" className="lad-add" onClick={() => setEditing(true)}>
        <Plus size={14} weight="bold" aria-hidden /> Para qué lo hacés, cuándo y dónde
      </button>
    );
  }
  return (
    <div className="flex items-start gap-2 rounded-[14px] bg-surface-2 py-2.5 pr-1.5 pl-3">
      <dl className="grid min-w-0 flex-1 gap-1.5 text-[14px] leading-snug">
        {ladder.why && (
          <div>
            <dt className="lad-kicker">Para qué</dt>
            <dd>{ladder.why}</dd>
          </div>
        )}
        {ladder.cue && (
          <div>
            <dt className="lad-kicker">Cuándo y dónde</dt>
            <dd>{ladder.cue}</dd>
          </div>
        )}
      </dl>
      <button type="button" onClick={() => setEditing(true)} aria-label="Cambiar para qué, cuándo y dónde" className="lad-icon-btn">
        <PencilSimple size={16} />
      </button>
    </div>
  );
}

function NotesFields({ why, onWhy, cue, onCue }: { why: string; onWhy: (v: string) => void; cue: string; onCue: (v: string) => void }) {
  return (
    <>
      <label className="grid gap-1.5">
        <span className="kicker">¿Para qué lo hacés? (opcional)</span>
        <input
          value={why}
          onChange={(e) => onWhy(e.target.value)}
          placeholder="Para dormir mejor, para tener más energía..."
          maxLength={LADDER_NOTE_MAX}
          lang="es"
          spellCheck
          className={inputClass}
        />
      </label>
      <label className="grid gap-1.5">
        <span className="kicker">¿Cuándo y dónde? (opcional)</span>
        <input
          value={cue}
          onChange={(e) => onCue(e.target.value)}
          placeholder="Después de cenar, en el living"
          maxLength={LADDER_NOTE_MAX}
          lang="es"
          spellCheck
          className={inputClass}
        />
      </label>
    </>
  );
}

// ─── Gráfico semana a semana ────────────────────────────────────────────────

const CHART_WEEKS = 12;
const dm = (iso: string) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;

/**
 * Una barra por semana con los días hechos (de 0 a 7) y una raya con lo que pedía el
 * escalón de esa semana. Verde lleno si se cumplió, suave si no, la en curso punteada.
 * Donde cambia el escalón, una línea y "E2". Las últimas 12 semanas.
 */
function WeekChart({ weeks }: { weeks: (LadderWeek & { step: number })[] }) {
  const shown = weeks.slice(-CHART_WEEKS);
  const offset = weeks.length - shown.length;
  const n = shown.length;
  const cols = { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` };
  const met = shown.filter((w) => w.met === true).length;
  const ended = shown.filter((w) => w.met !== null).length;
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="lad-kicker">Semana a semana</p>
        <p className="text-[12px] text-muted tabular">
          {met} de {ended} {ended === 1 ? "cumplida" : "cumplidas"}
        </p>
      </div>
      <div className="lad-chart" style={cols} role="img" aria-label={`Días hechos por semana, las últimas ${n}: ${met} de ${ended} semanas cumplidas`}>
        {shown.map((w, i) => {
          const prev = weeks[offset + i - 1];
          const change = !!prev && prev.step !== w.step;
          return (
            <div
              key={w.start}
              className="lad-chart-col"
              data-change={change || undefined}
              title={`Semana del ${formatShort(w.start)}: ${ofDays(w.done, w.need)} · escalón ${w.step + 1}`}
            >
              <span
                className="lad-chart-bar"
                data-met={w.met === true || undefined}
                data-current={w.met === null || undefined}
                style={{ height: `${(Math.min(7, w.done) / 7) * 100}%` }}
              />
              <span className="lad-chart-need" style={{ bottom: `${(Math.min(7, w.need) / 7) * 100}%` }} />
              {change && <span className="lad-chart-step">E{w.step + 1}</span>}
            </div>
          );
        })}
      </div>
      <div className="grid gap-[3px]" style={cols} aria-hidden>
        {shown.map((w, i) => (
          <span key={w.start} className="lad-chart-label">
            {n <= 8 || (n - 1 - i) % 2 === 0 ? dm(w.start) : ""}
          </span>
        ))}
      </div>
      <p className="text-[12px] leading-snug text-muted">La barra son los días hechos; la raya, lo que pedía el escalón esa semana.</p>
      <details className="text-[13px]">
        <summary className="min-h-11 cursor-pointer content-center text-muted">Ver como tabla</summary>
        <table className="w-full text-left tabular">
          <thead className="text-[11.5px] text-muted">
            <tr>
              <th className="py-1 font-medium">Semana</th>
              <th className="py-1 font-medium">Días hechos</th>
              <th className="py-1 font-medium">Pedía</th>
              <th className="py-1 font-medium">Escalón</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((w) => (
              <tr key={w.start} className="border-t border-line">
                <td className="py-1">{formatShort(w.start)}</td>
                <td className="py-1">
                  {w.done}
                  {w.met === true ? " ✓" : ""}
                </td>
                <td className="py-1">{w.need}</td>
                <td className="py-1">{w.step + 1}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

// ─── Editor de escalones ────────────────────────────────────────────────────

/** Lo que el editor necesita del hábito: cuántos días pide hoy y si es de cantidad. */
export type StepsHabit = { frequency: string; weekdays?: number[]; timesPerWeek?: number | null; target: number; unit?: string | null };

const isQuantity = (h: StepsHabit) => h.target > 1 || !!h.unit;
const DAY_OPTIONS = [1, 2, 3, 4, 5, 6, 7];

/**
 * Lista de escalones para cambiar: título, días por semana, semanas seguidas para
 * subir (el último es la meta), la meta numérica en hábitos de cantidad, y
 * subir/bajar/quitar. Controlado (`steps` + `onChange`): lo usan el alta y "El camino".
 */
export function StepsList({ steps, onChange, habit }: { steps: LadderStep[]; onChange: (s: LadderStep[]) => void; habit: StepsHabit }) {
  const set = (i: number, patch: Partial<LadderStep>) => onChange(steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const qty = isQuantity(habit);
  const base = habitPerWeek(habit);
  const selectClass = cx(inputClass, "h-9! w-auto! px-2! pr-1!");
  return (
    <div className="grid gap-2">
      <ol className="grid gap-2">
        {steps.map((s, i) => {
          const isLast = i === steps.length - 1;
          return (
            <li key={i} className="grid gap-2 rounded-[14px] border border-line bg-surface p-2.5">
              <div className="flex items-center gap-2">
                <span className="lad-step-n" aria-hidden>
                  {i + 1}
                </span>
                <input
                  value={s.title}
                  onChange={(e) => set(i, { title: e.target.value })}
                  aria-label={`Escalón ${i + 1}: qué hacer`}
                  placeholder="Qué hacer en este escalón"
                  maxLength={80}
                  lang="es"
                  spellCheck
                  className={cx(inputClass, "h-10! min-w-0 flex-1")}
                />
              </div>
              <div className="flex flex-wrap items-end gap-x-3 gap-y-2 pl-9 text-[13px] text-muted">
                <label className="grid gap-1">
                  <span>Días por semana</span>
                  <select
                    value={s.perWeek ?? ""}
                    onChange={(e) => set(i, { perWeek: e.target.value ? Number(e.target.value) : null })}
                    className={selectClass}
                  >
                    <option value="">Como el hábito ({base >= 7 ? "todos" : base})</option>
                    {DAY_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n === 7 ? "Todos los días" : n}
                      </option>
                    ))}
                  </select>
                </label>
                {qty && (
                  <label className="grid gap-1">
                    <span>Meta{habit.unit ? ` (${habit.unit})` : ""}</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      value={s.target ?? ""}
                      placeholder={String(habit.target)}
                      onChange={(e) => {
                        const v = Math.round(Number(e.target.value));
                        set(i, { target: e.target.value && v >= 1 ? v : null });
                      }}
                      className={cx(inputClass, "tabular h-9! w-20! px-2! text-center")}
                    />
                  </label>
                )}
                {isLast ? (
                  <span className="pb-2 font-medium text-[var(--lad-fg)]">La meta</span>
                ) : (
                  <label className="grid gap-1">
                    <span>Semanas seguidas para subir</span>
                    <select value={s.weeks} onChange={(e) => set(i, { weeks: Number(e.target.value) })} className={selectClass}>
                      {Array.from({ length: LADDER_WEEKS_MAX }, (_, k) => k + 1).map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <span className="ml-auto flex items-center">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Subir el escalón ${i + 1}`} className="lad-icon-btn">
                    <ArrowUp size={16} />
                  </button>
                  <button type="button" onClick={() => move(i, 1)} disabled={isLast} aria-label={`Bajar el escalón ${i + 1}`} className="lad-icon-btn">
                    <ArrowDown size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange(steps.filter((_, j) => j !== i))}
                    disabled={steps.length <= 1}
                    aria-label={`Quitar el escalón ${i + 1}`}
                    className="lad-icon-btn"
                  >
                    <X size={16} />
                  </button>
                </span>
              </div>
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        onClick={() => {
          const last = steps.at(-1);
          onChange([...steps, { title: "", perWeek: last?.perWeek ?? null, weeks: LADDER_DEFAULT_WEEKS, target: last?.target ?? null }]);
        }}
        disabled={steps.length >= LADDER_MAX_STEPS}
        className="lad-add"
      >
        <Plus size={14} weight="bold" aria-hidden /> Agregar escalón
      </button>
    </div>
  );
}

/** Escalones con título: los vacíos no se guardan. */
export function cleanSteps(steps: LadderStep[]) {
  return steps.map((s) => ({ ...s, title: s.title.trim() })).filter((s) => s.title);
}

function StepsEditor({
  initial,
  habit,
  onSave,
  onCancel,
}: {
  initial: LadderStep[];
  habit: StepsHabit;
  onSave: (s: LadderStep[]) => void;
  onCancel: () => void;
}) {
  const [steps, setSteps] = useState(initial);
  const clean = cleanSteps(steps);
  return (
    <div className="grid gap-3">
      <StepsList steps={steps} onChange={setSteps} habit={habit} />
      <div className="flex flex-wrap gap-2">
        <Button variant="accent" disabled={!clean.length} onClick={() => onSave(clean)}>
          Guardar escalones
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

// ─── Empezar a construir un hábito ──────────────────────────────────────────

/** Meta + escalones propuestos (editables) + para qué / cuándo y dónde + "Nunca dos seguidos": alta y editar. */
export function LadderPlanner({
  goal,
  onGoal,
  steps,
  onSteps,
  habit,
  why,
  onWhy,
  cue,
  onCue,
  neverTwice,
  onNeverTwice,
}: {
  goal: string;
  onGoal: (v: string) => void;
  steps: LadderStep[];
  onSteps: (s: LadderStep[]) => void;
  habit: StepsHabit;
  why: string;
  onWhy: (v: string) => void;
  cue: string;
  onCue: (v: string) => void;
  neverTwice: boolean;
  onNeverTwice: (v: boolean) => void;
}) {
  return (
    <div className="grid gap-4" data-tone="habitos">
      <label className="grid gap-1.5">
        <span className="kicker">Tu meta</span>
        <input
          value={goal}
          onChange={(e) => onGoal(e.target.value)}
          placeholder="Dormir sin el celular, correr 5 km..."
          maxLength={LADDER_GOAL_MAX}
          required
          lang="es"
          spellCheck
          className={inputClass}
        />
      </label>
      <div className="lad-propose">
        <p className="lad-kicker">La app te propone</p>
        <p className="text-[13px] leading-snug text-muted">
          Cambiá lo que quieras. Subís de escalón cuando lo cumplís las semanas seguidas que pide. Mientras estés en un escalón, el
          hábito te pide lo de ese escalón: sus días por semana{isQuantity(habit) ? " y su meta" : ""}.
        </p>
        <StepsList steps={steps} onChange={onSteps} habit={habit} />
      </div>
      <NotesFields why={why} onWhy={onWhy} cue={cue} onCue={onCue} />
      <label className="flex min-h-11 items-center gap-2.5 text-[14px]">
        <input type="checkbox" checked={neverTwice} onChange={(e) => onNeverTwice(e.target.checked)} className="size-4 accent-[var(--accent)]" />
        Nunca dos seguidos: avisarme el día después de fallar
      </label>
    </div>
  );
}

/**
 * En el detalle de un hábito (Editar): construirlo de a poco (o ver su camino) y el
 * interruptor "Nunca dos seguidos", que vale para cualquier hábito.
 */
export function LadderSettings({
  habit: h,
  logs,
  today,
  actions,
}: {
  habit: HabitDTO;
  logs: Record<string, LogMap>;
  today: string;
  actions: LadderActions;
}) {
  const path = useRef<LadderPathHandle>(null);
  const ladder = h.ladder;
  const cur = ladder ? Math.min(ladder.current, ladder.steps.length - 1) : 0;
  const [confirmEnd, setConfirmEnd] = useState(false);

  return (
    <div className="grid gap-4" data-tone="habitos">
      {ladder ? (
        <div className="grid gap-3">
          <div className="flex items-center gap-3">
            <Stairs total={ladder.steps.length} current={cur} className="h-8" />
            <p className="min-w-0 text-[14px] leading-snug">
              <span className="lad-kicker block">
                Escalón {cur + 1} de {ladder.steps.length}
              </span>
              {ladder.steps[cur]?.title}
              {ladder.steps[cur] && (
                <span className="block text-[12.5px] text-muted">{stepRuleText(ladder.steps[cur], h, cur === ladder.steps.length - 1)}</span>
              )}
            </p>
          </div>
          <Button variant="outline" onClick={() => path.current?.show(h.id)}>
            Ver el camino <CaretRight size={14} aria-hidden />
          </Button>
          {confirmEnd ? (
            <div className="reveal grid gap-2 rounded-[12px] bg-surface-2 p-3">
              <p className="text-[13.5px] leading-snug">
                Vuelve a ser un hábito común, con la meta y la frecuencia que tiene hoy. Las marcas no cambian.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    actions.end(h);
                    setConfirmEnd(false);
                  }}
                >
                  Sí, sacar la construcción
                </Button>
                <Button variant="ghost" onClick={() => setConfirmEnd(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="ghost" onClick={() => setConfirmEnd(true)}>
              Sacar la construcción
            </Button>
          )}
        </div>
      ) : (
        <p className="text-[14px] leading-relaxed text-muted">
          Para armarlo por escalones, elegí &quot;Construir de a poco&quot; en Editar.
        </p>
      )}

      <button
        type="button"
        role="switch"
        aria-checked={!!h.neverTwice}
        onClick={() => actions.setNeverTwice(h, !h.neverTwice)}
        className="flex min-h-11 items-center justify-between gap-3 rounded-[12px] text-left"
      >
        <span className="grid gap-0.5">
          <span className="text-[14.5px] font-medium">Nunca dos seguidos</span>
          <span className="text-[12.5px] leading-snug text-muted">Te avisa el día después de fallar</span>
        </span>
        <span className="lad-switch" data-on={h.neverTwice || undefined} aria-hidden>
          <span />
        </span>
      </button>

      <LadderPathSheet ref={path} habits={[h]} logs={logs} today={today} actions={actions} />
    </div>
  );
}
