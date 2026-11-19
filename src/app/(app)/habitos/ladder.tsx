"use client";

import { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CaretRight, Minus, Plus, Stairs } from "@phosphor-icons/react";
import { addDays, diffDays, formatShort } from "@/lib/dates";
import { dayState, isDone, type LogMap } from "@/lib/habit-logic";
import {
  advance,
  daysShort,
  habitNeverTwice,
  LADDER_WEEKS_MAX,
  ladderDoneFn,
  ladderPlan,
  ladderWeeks,
  replanLadder,
  replanSteps,
  snoozeWeek,
  spanWeeks,
  stepBack,
  stepLabels,
  stepProgress,
  stepRuleText,
  stepShort,
  stepTitle,
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
  setNeverTwice as setNeverTwiceAction,
  startLadder,
  stayLadder,
  stepBackLadder,
} from "@/lib/offline/habit";
import { useSafeTransition } from "@/components/safe-action";
import { notifyError } from "@/components/undo-toast";
import { haptic } from "@/components/haptics";
import { Button, cx, Sheet, type SheetHandle } from "@/components/ui";
import { TintedCard } from "@/components/tinted-card";
import { CheckButton, tapHabit, WeekCount } from "./day-rows";
import { partsCircle } from "./parts";
import { HabitBadge, type MarkFn } from "./habit-ui";
import "./habits.css";

/*
 * Hábitos en construcción ("de a poco"): el hábito sube de a un paso hasta la meta.
 * Cada paso pide unos días por semana y se sube después de cumplirlo unas semanas
 * seguidas; la app pregunta, nunca sube sola. Acá van las piezas de pantalla: la
 * escalera, el recuadro "En construcción" de Hoy e Inicio, la hoja "El camino", los
 * selectores del plan y la línea de "Nunca dos seguidos". Las reglas viven en
 * lib/habit-ladder.ts.
 */

type Result = { ok: boolean; error?: string };
type Over = { ladder?: Ladder | null; neverTwice?: boolean };

const sigOf = (h: HabitDTO) => JSON.stringify([h.ladder ?? null, !!h.neverTwice]);

export type LadderActions = {
  advance: (h: HabitDTO) => void;
  stay: (h: HabitDTO) => void;
  back: (h: HabitDTO) => void;
  end: (h: HabitDTO) => void;
  saveSteps: (h: HabitDTO, steps: LadderStep[]) => void;
  setNeverTwice: (h: HabitDTO, on: boolean) => void;
  start: (h: HabitDTO, plan: { goal: string; steps: LadderStep[]; neverTwice: boolean }) => void;
};

/**
 * Los cambios de paso se ven al instante: cada acción deja un parche sobre el
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

/** ¿Ese día está hecho? Con la meta del paso si la tiene (si no, la del hábito). */
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
type Prog = ReturnType<typeof stepProgress>;

/** Sostuvo el último paso las semanas que pide: llegó a la meta. */
const reachedGoal = (p: Prog) => p.atGoal && p.streak >= p.weeksNeeded;

/**
 * ¿Espera una respuesta? (subir, o pasar a sus hábitos.) Esos van en el recuadro aunque
 * hoy no toquen: si no, el pedido quedaría escondido el resto de la semana.
 */
export function ladderAsks(h: HabitDTO, logs: LogMap, today: string) {
  if (!h.ladder) return false;
  const p = stepProgress(h.ladder, doneFn(h, logs), today, optsOf(h));
  return p.ready || reachedGoal(p);
}

/** Número de la semana en curso dentro de las seguidas que pide ("Semana 2 de 2"). */
function weekNumber(p: Prog) {
  const curMet = p.weeks.at(-1)?.met === true;
  return Math.max(1, Math.min(p.weeksNeeded, curMet ? p.streak : p.streak + 1));
}

/** "Semana 1 de 2 para pasar a 4 días". */
function weekLine(p: Prog, ladder: Ladder) {
  if (p.atGoal) return `Semana ${weekNumber(p)} de ${p.weeksNeeded} en la meta`;
  // Dijo "Todavía no": cumplió, pero se le vuelve a preguntar más adelante.
  if (p.streak >= p.weeksNeeded && ladder.snoozeUntil) return `Te volvemos a preguntar el ${formatShort(addDays(ladder.snoozeUntil, 1))}`;
  return `Semana ${weekNumber(p)} de ${p.weeksNeeded} para pasar a ${stepShort(ladder, p.step + 1)}`;
}

/** "3 días por semana · llevás 2" (la primera semana, si arrancó a mitad, lo que toca en esos días). */
function subLine(p: Prog, ladder: Ladder) {
  const plan = ladderPlan(ladder);
  const base = plan ? stepTitle(p.perWeek) : ladder.steps[p.step].title;
  if (p.ready || reachedGoal(p)) return `${base} · cumplido`;
  if (plan && p.thisWeek.need !== p.perWeek) return `Esta semana: ${daysShort(p.thisWeek.need)} · llevás ${p.thisWeek.done}`;
  return `${base} · llevás ${p.thisWeek.done}`;
}

/** "2 semanas seguidas cumplidas" / "1 semana cumplida". */
const weeksDone = (n: number) => `${weeksText(n)} ${n === 1 ? "cumplida" : "cumplidas"}`;

/** "Volver a 2 días" (sin plan, "Volver al paso anterior"). */
const backText = (ladder: Ladder, cur: number) => (ladderPlan(ladder) ? `Volver a ${stepShort(ladder, cur - 1)}` : "Volver al paso anterior");

/** "Subir a 4 días" (sin plan, "Subir al paso 3"). */
const upText = (ladder: Ladder, cur: number) => (ladderPlan(ladder) ? `Subir a ${stepShort(ladder, cur + 1)}` : `Subir al paso ${cur + 2}`);

// ─── La escalera ────────────────────────────────────────────────────────────

/** Una barra por paso, cada una más alta: las hechas y la actual llenas, la actual con aro, las que faltan punteadas. */
export function LadderBars({ labels, current }: { labels: number[]; current: number }) {
  const n = Math.max(1, labels.length);
  return (
    <div
      role="img"
      aria-label={`Paso ${current + 1} de ${n}`}
      className="lad-bars"
      style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
    >
      {labels.map((label, i) => (
        <span
          key={i}
          className="figure"
          data-on={i <= current || undefined}
          data-now={i === current || undefined}
          style={{ height: `${n === 1 ? 100 : 30 + (70 * i) / (n - 1)}%` }}
        >
          {label}
        </span>
      ))}
    </div>
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
  const prog = stepProgress(ladder, doneFn(h, logs), today, optsOf(h));
  const nt = h.neverTwice ? neverTwiceOf(h, logs, today) : null;
  const alert = !!nt?.failedYesterday && day === today;
  const goalMet = reachedGoal(prog);
  const log = logs[day];
  const baseState = log?.s === "skipped" ? "skipped" : dayState(h, logs, day, today);
  const pc = h.parts?.length ? partsCircle(h.parts, log, baseState) : null;
  const state = pc?.state ?? baseState;
  const [confirmBack, setConfirmBack] = useState(false);
  const labels = stepLabels(ladder);
  const sub = subLine(prog, ladder);

  return (
    <li className="lad-item" data-alert={alert || undefined}>
      {alert && nt && (
        <div className="grid gap-2 px-3.5 pt-3 lg:px-4">
          <p className="lad-alert-kicker">Hoy es el que importa</p>
          <p className="text-[14px] leading-snug font-medium text-fg">Ayer no salió. Que no sean dos seguidos.</p>
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
          aria-label={`${h.name}: ${sub}. Ver el camino`}
          className="tap-tint -my-1 -ml-1.5 flex min-w-0 flex-1 items-center gap-3 rounded-lg py-1 pl-1.5 text-left lg:gap-4"
        >
          <HabitAvatar icon={h.icon} color={h.color} className="size-9 lg:size-[42px]" />
          <span className="grid min-w-0 gap-0.5">
            <span className="line-clamp-2 text-[16px] leading-tight font-medium tracking-[-0.01em] lg:text-[16.5px]">{h.name}</span>
            {/* Como las filas comunes: la frecuencia del paso y "1/3 esta semana". */}
            <span className="flex min-w-0 items-center gap-2">
              <HabitBadge habit={h} compact />
              <WeekCount habit={h} logs={logs} day={day} today={today} />
            </span>
          </span>
        </button>
        <CheckButton state={state} fill={pc?.fill} label={pc?.label} disabled={day > today} onTap={() => tapHabit(h, log, day, mark, onOpenDay)} />
      </div>

      {goalMet ? (
        <div className="lad-ready">
          <p className="lad-kicker">Llegaste a la meta</p>
          <LadderBars labels={labels} current={cur} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="accent" onClick={() => actions.end(h)}>
              Pasar a mis hábitos
            </Button>
          </div>
        </div>
      ) : prog.ready ? (
        <div className="lad-ready">
          <p className="lad-kicker">{weeksDone(prog.streak)}</p>
          <LadderBars labels={labels} current={cur} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="accent" onClick={() => actions.advance(h)}>
              {upText(ladder, cur)}
            </Button>
            <Button size="sm" variant="outline" onClick={() => actions.stay(h)}>
              Todavía no
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-2 px-3.5 pb-2 lg:px-4">
          <LadderBars labels={labels} current={cur} />
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 text-[12.5px] leading-snug text-muted">{weekLine(prog, ladder)}</p>
            <button type="button" onClick={onPath} className="lad-link shrink-0">
              Ver el camino <CaretRight size={12} weight="bold" aria-hidden />
            </button>
          </div>
        </div>
      )}

      {prog.struggling && cur > 0 && !prog.ready && !goalMet && (
        <div className="lad-struggle">
          {confirmBack ? (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>¿{backText(ladder, cur)}? No se pierde lo hecho.</span>
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
              <span>Este paso está costando ·</span>
              <button type="button" className="lad-link" onClick={() => setConfirmBack(true)}>
                {backText(ladder, cur)}
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
  const goalMet = reachedGoal(prog);
  const plan = ladderPlan(ladder);
  const labels = stepLabels(ladder);
  const since = ladder.history?.[0]?.from ?? ladder.stepStart;
  const ago = Math.max(0, diffDays(today, since));
  const doneDays = useMemo(() => Object.keys(logs).filter((d) => d >= since && d <= today && isDone(h, logs[d])).length, [logs, since, today, h]);
  const [editing, setEditing] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const goal = plan ? stepTitle(plan.to) : ladder.goal;

  return (
    <div className="grid gap-5" data-tone="habitos">
      <div className="flex items-center gap-3">
        <HabitAvatar icon={h.icon} color={h.color} size={42} />
        <div className="grid min-w-0 gap-0.5">
          <p className="truncate text-[17px] font-semibold tracking-[-0.01em]">{h.name}</p>
          <p className="text-[13px] leading-snug text-muted">
            {goal ? `Meta: ${goal}` : "Sin meta escrita"} ·{" "}
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

      <div className="grid gap-2">
        <LadderBars labels={labels} current={cur} />
        <p className="text-[13px] leading-snug text-muted">
          {goalMet ? "Llegaste a la meta" : prog.ready ? weeksDone(prog.streak) : weekLine(prog, ladder)}
        </p>
      </div>

      {prog.ready && (
        <div className="flex flex-wrap gap-2">
          <Button variant="accent" onClick={() => actions.advance(h)}>
            {upText(ladder, cur)}
          </Button>
          <Button variant="outline" onClick={() => actions.stay(h)}>
            Todavía no
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

      {cur > 0 && (
        <div className="grid gap-1.5">
          <p className="lad-kicker">Ya lograste</p>
          <ul className="grid gap-1 text-[14px] leading-snug">
            {steps.slice(0, cur).map((s, i) => {
              const hist = ladder.history?.filter((x) => x.step === i).at(-1);
              return (
                <li key={i}>
                  {plan ? stepTitle(s.perWeek as number) : s.title}
                  <span className="text-muted"> · logrado{hist ? ` en ${plural(spanWeeks(hist.from, hist.to), "semana", "semanas")}` : ""}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {allWeeks.length > 1 && <WeekChart weeks={allWeeks} labels={labels} />}

      <div className="grid grid-cols-3 gap-2">
        <PathFig value={nt.daysWithoutTwo} label="sin fallar dos seguidos" />
        <PathFig value={nt.recoveries} label={nt.recoveries === 1 ? "vez que volviste" : "veces que volviste"} />
        <PathFig value={doneDays} label={doneDays === 1 ? "día hecho" : "días hechos"} />
      </div>

      {plan && editing && (
        <PlanEditor
          min={prog.perWeek}
          to={plan.to}
          weeks={plan.weeks}
          onCancel={() => setEditing(false)}
          onSave={(to, weeks) => {
            actions.saveSteps(h, replanSteps(ladder, to, weeks));
            setEditing(false);
          }}
        />
      )}

      {((plan && !editing) || cur > 0) && (
        <div className="grid gap-2 sm:grid-cols-2">
          {plan && !editing && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              Cambiar el plan
            </Button>
          )}
          {cur > 0 && (
            <Button variant="outline" onClick={() => actions.back(h)}>
              {backText(ladder, cur)}
            </Button>
          )}
        </div>
      )}

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
    </div>
  );
}

/** "Cambiar el plan": hasta dónde llegar (nunca menos que el paso actual) y cada cuántas semanas subir. */
function PlanEditor({
  min,
  to: initialTo,
  weeks: initialWeeks,
  onSave,
  onCancel,
}: {
  min: number;
  to: number;
  weeks: number;
  onSave: (to: number, weeks: number) => void;
  onCancel: () => void;
}) {
  const [to, setTo] = useState(initialTo);
  const [weeks, setWeeks] = useState(initialWeeks);
  return (
    <div className="lad-propose reveal">
      <p className="lad-kicker">Cambiar el plan</p>
      <div className="grid divide-y divide-line">
        <PlanStepper label="Querés llegar a" unit={to === 1 ? "día por semana" : "días por semana"} value={to} min={min} max={7} onChange={setTo} />
        <PlanStepper label="Subís después de" unit={weeksUnit(weeks)} value={weeks} min={1} max={LADDER_WEEKS_MAX} onChange={setWeeks} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="accent" onClick={() => onSave(to, weeks)}>
          Guardar
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
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

// ─── Gráfico semana a semana ────────────────────────────────────────────────

const CHART_WEEKS = 12;
const dm = (iso: string) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;

/**
 * Una barra por semana con los días hechos (de 0 a 7) y una raya con lo que pedía el
 * paso de esa semana. Verde lleno si se cumplió, suave si no, la en curso punteada.
 * Donde cambia el paso, una línea y sus días. Las últimas 12 semanas.
 */
function WeekChart({ weeks, labels }: { weeks: (LadderWeek & { step: number })[]; labels: number[] }) {
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
              title={`Semana del ${formatShort(w.start)}: ${ofDays(w.done, w.need)} · paso ${w.step + 1}`}
            >
              <span
                className="lad-chart-bar"
                data-met={w.met === true || undefined}
                data-current={w.met === null || undefined}
                style={{ height: `${(Math.min(7, w.done) / 7) * 100}%` }}
              />
              <span className="lad-chart-need" style={{ bottom: `${(Math.min(7, w.need) / 7) * 100}%` }} />
              {change && <span className="lad-chart-step">{labels[w.step]}</span>}
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
      <p className="text-[12px] leading-snug text-muted">La barra son los días hechos; la raya, lo que pedía el paso esa semana.</p>
      <details className="text-[13px]">
        <summary className="min-h-11 cursor-pointer content-center text-muted">Ver como tabla</summary>
        <table className="w-full text-left tabular">
          <thead className="text-[11.5px] text-muted">
            <tr>
              <th className="py-1 font-medium">Semana</th>
              <th className="py-1 font-medium">Días hechos</th>
              <th className="py-1 font-medium">Pedía</th>
              <th className="py-1 font-medium">Paso</th>
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

// ─── Empezar a construir un hábito ──────────────────────────────────────────

const weeksUnit = (n: number) => (n === 1 ? "semana cumplida" : "semanas seguidas cumplidas");

/** Un número con − y +: los selectores del plan (`step`: de a cuánto, 1 si no se dice). */
export function PlanStepper({
  label,
  unit,
  value,
  min,
  max,
  onChange,
  step = 1,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <div role="group" aria-label={label} className="flex items-center justify-between gap-3 py-1.5">
      <span className="grid min-w-0 gap-0.5">
        <span className="text-[15px] font-medium">{label}</span>
        <span className="text-[12.5px] leading-snug text-muted">{unit}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          aria-label={`${label}: menos`}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - step))}
          className="lad-icon-btn border border-line-strong"
        >
          <Minus size={15} aria-hidden />
        </button>
        <span aria-live="polite" className="figure min-w-8 text-center text-[22px] font-[750]">
          {value}
        </span>
        <button
          type="button"
          aria-label={`${label}: más`}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + step))}
          className="lad-icon-btn border border-line-strong"
        >
          <Plus size={15} aria-hidden />
        </button>
      </span>
    </div>
  );
}

/** De cuántos días por semana a cuántos, cada cuántas semanas se sube, y "Nunca dos seguidos": alta y editar. */
export function LadderPlanner({
  name,
  from,
  to,
  weeks,
  onFrom,
  onTo,
  onWeeks,
  neverTwice,
  onNeverTwice,
}: {
  name: string;
  from: number;
  to: number;
  weeks: number;
  onFrom: (v: number) => void;
  onTo: (v: number) => void;
  onWeeks: (v: number) => void;
  neverTwice: boolean;
  onNeverTwice: (v: boolean) => void;
}) {
  const total = (to - from) * weeks;
  const labels = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  return (
    <div data-tone="habitos">
      <TintedCard as="div" tone="habitos" icon={Stairs} title="Construir de a poco" meta={name.trim() || undefined}>
        <div className="grid gap-3">
          <div className="grid divide-y divide-line">
            <PlanStepper label="Empezás con" unit={from === 1 ? "día por semana" : "días por semana"} value={from} min={1} max={to - 1} onChange={onFrom} />
            <PlanStepper label="Querés llegar a" unit="días por semana" value={to} min={from + 1} max={7} onChange={onTo} />
            <PlanStepper label="Subís después de" unit={weeksUnit(weeks)} value={weeks} min={1} max={LADDER_WEEKS_MAX} onChange={onWeeks} />
          </div>
          <div className="lad-propose">
            <p className="lad-kicker">Tu camino</p>
            <LadderBars labels={labels} current={0} />
            <p className="text-[12.5px] leading-snug text-muted">
              Si cumplís todas las semanas, llegás en {total === 1 ? "1 semana" : `unas ${total} semanas`}.
            </p>
          </div>
          <label className="flex min-h-11 items-center gap-2.5 text-[14px]">
            <input type="checkbox" checked={neverTwice} onChange={(e) => onNeverTwice(e.target.checked)} className="size-4 accent-[var(--accent)]" />
            Nunca dos seguidos: avisarme el día después de fallar
          </label>
        </div>
      </TintedCard>
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
          <p className="grid gap-0.5 text-[14px] leading-snug">
            <span className="lad-kicker">
              Paso {cur + 1} de {ladder.steps.length}
            </span>
            {!ladderPlan(ladder) && <span>{ladder.steps[cur]?.title}</span>}
            {ladder.steps[cur] && <span className="text-[13px] text-muted">{stepRuleText(ladder.steps[cur], h, cur === ladder.steps.length - 1)}</span>}
          </p>
          <LadderBars labels={stepLabels(ladder)} current={cur} />
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
          Para armarlo paso a paso, elegí &quot;Construir de a poco&quot; en Editar.
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

/**
 * En "Editar hábito", si ya está en construcción: el paso en el que está, la escalera
 * con el plan nuevo y los selectores (si la escalera tiene plan): desde cuántos días
 * arranca, en qué paso está, hasta cuántos y cada cuántas semanas sube; y "Sacar la
 * construcción". Todo se manda con el formulario (campos ocultos `ladderPlan` y
 * `ladderEnd`, ver `saveHabit` y `replanLadder`).
 */
export type LadderEdit = { from: number; current: number; to: number; weeks: number };

/** El plan como está, para arrancar el formulario (null en las escaleras viejas sin plan). */
export function ladderEditOf(ladder: Ladder): LadderEdit | null {
  const plan = ladderPlan(ladder);
  if (!plan) return null;
  const cur = Math.min(ladder.current, ladder.steps.length - 1);
  return { from: plan.from, current: ladder.steps[cur].perWeek as number, to: plan.to, weeks: plan.weeks };
}

/** ¿Cambió algo del plan? */
export function ladderEditChanged(ladder: Ladder, e: LadderEdit): boolean {
  const o = ladderEditOf(ladder);
  return !!o && (o.from !== e.from || o.current !== e.current || o.to !== e.to || o.weeks !== e.weeks);
}

export function LadderEditSection({
  ladder,
  edit,
  onEdit,
  today,
  ending,
  onEnding,
}: {
  ladder: Ladder;
  edit: LadderEdit;
  onEdit: (e: LadderEdit) => void;
  today: string;
  ending: boolean;
  onEnding: (v: boolean) => void;
}) {
  const plan = ladderPlan(ladder);
  const changed = !!plan && ladderEditChanged(ladder, edit);
  const shown = plan && !ending && changed ? replanLadder(ladder, edit, today) : ladder;
  const cur = Math.min(shown.current, shown.steps.length - 1);
  const total = shown.steps.length;
  const stepText = plan ? stepTitle(shown.steps[cur].perWeek as number) : shown.steps[cur].title;
  const { from, current, to, weeks } = edit;
  const days = (n: number) => (n === 1 ? "día por semana" : "días por semana");
  return (
    <div data-tone="habitos">
      {changed && !ending && <input type="hidden" name="ladderPlan" value={JSON.stringify(edit)} />}
      {ending && <input type="hidden" name="ladderEnd" value="1" />}
      <TintedCard as="div" tone="habitos" icon={Stairs} title="En construcción">
        <div className="grid gap-3">
          <p className="grid gap-0.5 text-[14px] leading-snug">
            <span className="font-medium">
              Paso {cur + 1} de {total} · {stepText}
            </span>
            {!ending && <span className="text-[13px] text-muted">{cur === total - 1 ? "Es la meta" : `${weeksText(shown.steps[cur].weeks)} para subir`}</span>}
          </p>
          <div className={cx("lad-propose", ending && "opacity-50")}>
            <p className="lad-kicker">{changed && !ending ? "Tu camino con el cambio" : "Tu camino"}</p>
            <LadderBars labels={stepLabels(shown)} current={cur} />
          </div>
          {plan && !ending && (
            <div className="grid divide-y divide-line">
              <PlanStepper label="Empezás con" unit={days(from)} value={from} min={1} max={to} onChange={(v) => onEdit({ ...edit, from: v, current: Math.max(current, v) })} />
              <PlanStepper label="Estás en" unit={days(current)} value={current} min={from} max={to} onChange={(v) => onEdit({ ...edit, current: v })} />
              <PlanStepper label="Querés llegar a" unit={days(to)} value={to} min={current} max={7} onChange={(v) => onEdit({ ...edit, to: v })} />
              <PlanStepper label="Subís después de" unit={weeksUnit(weeks)} value={weeks} min={1} max={LADDER_WEEKS_MAX} onChange={(v) => onEdit({ ...edit, weeks: v })} />
            </div>
          )}
          {ending ? (
            <div className="reveal grid gap-2 rounded-[12px] bg-surface-2 p-3">
              <p className="text-[13.5px] leading-snug">
                Al guardar, vuelve a ser un hábito común, con la meta y la frecuencia que tiene hoy. Las marcas no cambian.
              </p>
              <div>
                <Button type="button" variant="outline" size="sm" onClick={() => onEnding(false)}>
                  Mantener la construcción
                </Button>
              </div>
            </div>
          ) : (
            <Button type="button" variant="ghost" onClick={() => onEnding(true)}>
              Sacar la construcción
            </Button>
          )}
        </div>
      </TintedCard>
    </div>
  );
}
