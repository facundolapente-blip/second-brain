"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { CaretLeft, CaretRight, Check, LinkSimple, Plus, Star, X } from "@phosphor-icons/react";
import { addDays, formatShort, weekday } from "@/lib/dates";
import {
  effectiveKr,
  executionPct,
  FOCUS_SUGGESTED,
  inFocus,
  krPace,
  krPct,
  krQuarters,
  quarterWeeks,
  splitByFocus,
  weekMarks,
  type KeyResultDTO,
  type KrPace,
  type ObjectiveAction,
  type ObjectiveDTO,
  type Quarter,
  type QuarterWeek,
  type WeekMark,
} from "@/lib/plan-logic";
import { setObjectiveFocus } from "@/lib/offline/plan";
import { useSafeTransition } from "@/components/safe-action";
import { TimeInput } from "@/components/time-input";
import { Button, cx, Field, Input, Sheet, type SheetHandle } from "@/components/ui";
import { ProgressBar, StatusPill } from "../plan-ui";

/**
 * Objetivos en tres niveles (diseño unificado, 2026-10-25): el año (mapa, en objectives-view),
 * el trimestre (cómo venís semana a semana y las metas) y la semana (las acciones, que son
 * bloques del Plan atados a una meta del trimestre).
 */

export type ObjGroup = ObjectiveDTO & { loose?: boolean };
export type UnlinkedBlock = { id: string; title: string; date: string; startTime: string | null; done: boolean };

const DAY = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const dayLabel = (iso: string) => DAY[weekday(iso)];
const cleanTitle = (t: string) => t.replace(/^\d+\s+/, "");
export const quarterKrs = (g: ObjGroup, q: Quarter) => g.keyResults.filter((k) => krQuarters(k).includes(q));

/** La semana del trimestre que tiene un día (o la primera / la última si cae afuera). */
export function weekIndexOf(weeks: QuarterWeek[], day: string): number {
  const i = weeks.findIndex((w) => w.from <= day && day <= w.to);
  if (i >= 0) return i;
  return day < weeks[0].from ? 0 : weeks.length - 1;
}

export const weekRange = (w: QuarterWeek) => `${formatShort(w.from)} al ${formatShort(w.to)}`;

// ─── Piezas ─────────────────────────────────────────────────────────────────

const MARK: Record<WeekMark, string> = {
  full: "bg-[var(--st-done-line)]",
  most: "bg-[color-mix(in_oklab,var(--st-done-line)_45%,var(--surface-3))]",
  few: "bg-[color-mix(in_oklab,var(--p-red-chip)_55%,var(--surface-3))]",
  empty: "bg-surface-3",
  future: "ring-1 ring-inset ring-line",
};

/** Una casilla por semana del trimestre: lo planeado contra lo hecho. */
export function WeekStrip({ marks, className }: { marks: ReturnType<typeof weekMarks>; className?: string }) {
  const past = marks.filter((m) => m.mark !== "future" && m.planned > 0);
  const full = past.filter((m) => m.mark === "full").length;
  return (
    <div
      role="img"
      aria-label={past.length ? `${full} de ${past.length} semanas con todo lo planeado hecho` : "Todavía no hay acciones planeadas"}
      className={cx("grid gap-[3px]", className)}
      style={{ gridTemplateColumns: `repeat(${marks.length}, minmax(0, 1fr))` }}
    >
      {marks.map((m) => (
        <span
          key={m.week.n}
          title={`Semana ${m.week.n} (${formatShort(m.week.from)}): ${m.planned ? `${m.done} de ${m.planned}` : m.mark === "future" ? "todavía no llegó" : "nada planeado"}`}
          className={cx("h-3 rounded-[3px]", MARK[m.mark], m.current && "outline outline-[1.5px] outline-offset-1 outline-accent")}
        />
      ))}
    </div>
  );
}

export function WeekLegend({ className }: { className?: string }) {
  const items: [WeekMark, string][] = [
    ["full", "todo hecho"],
    ["most", "más de la mitad"],
    ["few", "menos"],
    ["empty", "nada planeado"],
  ];
  return (
    <ul className={cx("flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted", className)}>
      {items.map(([m, l]) => (
        <li key={m} className="flex items-center gap-1.5">
          <span aria-hidden className={cx("size-2.5 rounded-[3px]", MARK[m])} />
          {l}
        </li>
      ))}
    </ul>
  );
}

const PACE: Record<KrPace, { label: string; tone: string }> = {
  done: { label: "Lograda", tone: "green" },
  ontrack: { label: "Al día", tone: "teal" },
  behind: { label: "Atrasada", tone: "orange" },
};

export function PacePill({ pace }: { pace: KrPace | null }) {
  if (!pace) return null;
  return <StatusPill label={PACE[pace].label} toneKey={PACE[pace].tone} />;
}

/** La estrella de foco de un objetivo en un trimestre (se pueden marcar más de 3: es una sugerencia). */
export function FocusStar({ objective, quarter, count }: { objective: ObjGroup; quarter: Quarter; count: number }) {
  const [, start] = useSafeTransition();
  const real = inFocus(objective, quarter);
  const [on, setOn] = useState(real);
  const [from, setFrom] = useState(real);
  if (from !== real) {
    setFrom(real);
    setOn(real);
  }
  if (objective.loose) return null;
  const over = !on && count >= FOCUS_SUGGESTED;
  return (
    <button
      type="button"
      aria-pressed={on}
      title={on ? `En foco el ${quarter} (tocá para pausarlo)` : over ? `Ya tenés ${count} en foco: se sugieren ${FOCUS_SUGGESTED}` : `Poner en foco el ${quarter}`}
      aria-label={on ? `Sacar ${cleanTitle(objective.title)} del foco del ${quarter}` : `Poner ${cleanTitle(objective.title)} en foco el ${quarter}`}
      onClick={(e) => {
        e.stopPropagation();
        setOn(!on);
        start(() => setObjectiveFocus(objective.id, quarter, !on));
      }}
      className={cx(
        "press inline-flex size-9 shrink-0 items-center justify-center rounded-full transition-colors",
        on ? "text-accent" : "text-faint hover:bg-surface-2 hover:text-fg",
      )}
    >
      <Star size={18} weight={on ? "fill" : "regular"} aria-hidden />
    </button>
  );
}

/** Una acción de la semana: se tilda acá o en el Plan (es el mismo bloque). */
function ActionRow({ a, onToggle, onUnlink }: { a: ObjectiveAction; onToggle: () => void; onUnlink: () => void }) {
  const log = a.blockId === null;
  return (
    <li className="group flex min-h-11 items-center gap-2.5">
      <button
        type="button"
        disabled={log}
        onClick={onToggle}
        aria-pressed={a.done}
        title={log ? "De una semana que ya pasó (la tarjeta siguió a otra semana)" : undefined}
        className="tap-tint flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1 text-left disabled:cursor-default"
      >
        <span
          aria-hidden
          className={cx(
            "inline-flex size-[18px] shrink-0 items-center justify-center rounded-full border-2 transition-colors",
            a.done ? "border-[var(--c-plan)] bg-[var(--c-plan)] text-white" : "border-line-strong bg-surface",
            log && "opacity-60",
          )}
        >
          {a.done && <Check size={10} weight="bold" />}
        </span>
        <span className={cx("min-w-0 flex-1 truncate text-[14px]", a.done && "text-muted line-through decoration-faint")}>{a.title}</span>
        <span className="shrink-0 font-mono text-[11.5px] text-muted tabular">
          {dayLabel(a.date)}
          {a.startTime ? ` ${a.startTime}` : ""}
        </span>
      </button>
      {!log && (
        <button
          type="button"
          onClick={onUnlink}
          aria-label={`Desatar ${a.title} de la meta`}
          title="Desatar de la meta (el bloque sigue en el Plan)"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-faint hover:bg-surface-2 hover:text-fg lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
        >
          <X size={13} aria-hidden />
        </button>
      )}
    </li>
  );
}

/** "3/10" con lo que cuenta (si se mide solo, el valor del vínculo). */
function krFig(kr: KeyResultDTO): string | null {
  const e = effectiveKr(kr);
  if (e.goal === null || e.goal === undefined) return null;
  const f = (n: number) => n.toLocaleString("es-UY", { maximumFractionDigits: 1 });
  return `${f(e.progress ?? 0)}/${f(e.goal)}`;
}

// ─── Trimestre ──────────────────────────────────────────────────────────────

export function QuarterTab({
  groups,
  actions,
  year,
  quarter,
  today,
  onOpenKr,
  onAddAction,
  onPlan,
}: {
  groups: ObjGroup[];
  actions: ObjectiveAction[];
  year: number;
  quarter: Quarter;
  today: string;
  onOpenKr: (k: KeyResultDTO) => void;
  onAddAction: (k: KeyResultDTO) => void;
  onPlan: () => void;
}) {
  const weeks = quarterWeeks(year, quarter);
  const { active, paused } = splitByFocus(groups, quarter);
  const [showPaused, setShowPaused] = useState(false);

  if (!active.length && !paused.length)
    return (
      <div className="grid justify-items-start gap-3 py-2">
        <p className="text-[15px] text-muted">No hay metas para el {quarter}. Cada objetivo del año baja a una o dos metas por trimestre.</p>
        <Button variant="outline" size="sm" onClick={onPlan}>
          <Plus size={15} /> Meta del {quarter}
        </Button>
      </div>
    );

  const row = (g: ObjGroup) => {
    const ids = new Set(quarterKrs(g, quarter).map((k) => k.id));
    const pct = executionPct(actions, ids, weeks[0].from, today);
    return (
      <li key={g.id || "loose"} className="grid gap-1.5 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_3rem] sm:items-center sm:gap-3">
        <span className="truncate text-[14px] font-medium">{cleanTitle(g.title)}</span>
        <WeekStrip marks={weekMarks(actions, ids, weeks, today)} />
        <span className="font-mono text-[12px] text-muted tabular sm:text-right">{pct === null ? "–" : `${pct}%`}</span>
      </li>
    );
  };

  const goals = (g: ObjGroup) => (
    <section key={g.id || "loose"} className="grid gap-1.5">
      <h3 className="kicker">{cleanTitle(g.title)}</h3>
      <ul className="grid gap-1.5 xl:grid-cols-2">
        {quarterKrs(g, quarter).map((k) => (
          <li key={k.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 rounded-xl border border-line px-3 py-2.5">
            <button type="button" onClick={() => onOpenKr(k)} className="min-w-0 text-left text-[14px] leading-snug hover:underline">
              {k.title}
            </button>
            <PacePill pace={krPace(k, year, quarter, today)} />
            <div className="flex min-w-0 items-center gap-2.5">
              <ProgressBar pct={krPct(k)} />
              {krFig(k) && <span className="shrink-0 font-mono text-[11.5px] text-muted tabular">{krFig(k)}</span>}
            </div>
            <button
              type="button"
              onClick={() => onAddAction(k)}
              className="press inline-flex h-8 shrink-0 items-center gap-1 justify-self-end rounded-full border border-line-strong px-3 text-[12.5px] text-fg hover:bg-surface-2"
            >
              <Plus size={13} weight="bold" aria-hidden /> Acción
            </button>
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <div className="grid gap-6">
      <section className="grid gap-3">
        <h3 className="kicker">Cómo venís semana a semana</h3>
        <ul className="grid gap-3">{active.map(row)}</ul>
        <WeekLegend />
      </section>
      <section className="grid gap-4">
        <h3 className="kicker">Metas del {quarter}</h3>
        {active.map(goals)}
        {paused.length > 0 && (
          <div className="grid gap-3">
            <button type="button" onClick={() => setShowPaused(!showPaused)} className="justify-self-start text-[13px] text-muted underline decoration-line-strong underline-offset-2 hover:text-fg">
              {showPaused ? "Ocultar" : "Ver"} {paused.length} en pausa este trimestre
            </button>
            {showPaused && <div className="grid gap-4 opacity-80">{paused.map(goals)}</div>}
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Semana ─────────────────────────────────────────────────────────────────

export function WeekTab({
  groups,
  actions,
  year,
  quarter,
  today,
  week,
  onWeek,
  onToggle,
  onUnlink,
  onAddAction,
}: {
  groups: ObjGroup[];
  actions: ObjectiveAction[];
  year: number;
  quarter: Quarter;
  today: string;
  week: number;
  onWeek: (i: number) => void;
  onToggle: (a: ObjectiveAction) => void;
  onUnlink: (a: ObjectiveAction) => void;
  onAddAction: (k: KeyResultDTO, weekFrom: string) => void;
}) {
  const weeks = quarterWeeks(year, quarter);
  const w = weeks[week];
  const { active, paused } = splitByFocus(groups, quarter);
  const inWeek = actions.filter((a) => a.date >= w.from && a.date <= w.to);
  const shown = [...active, ...paused.filter((g) => quarterKrs(g, quarter).some((k) => inWeek.some((a) => a.keyResultId === k.id)))];

  return (
    <div className="grid gap-5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onWeek(week - 1)}
          disabled={week === 0}
          aria-label="Semana anterior"
          className="inline-flex size-10 items-center justify-center rounded-full border border-line-strong text-muted hover:text-fg disabled:opacity-40"
        >
          <CaretLeft size={16} aria-hidden />
        </button>
        <div className="grid min-w-0 flex-1 text-center">
          <span className="text-[15px] font-semibold">{weekRange(w)}</span>
          <span className="font-mono text-[11.5px] text-muted">
            Semana {w.n} de {weeks.length}
            {w.from <= today && today <= w.to ? " · esta semana" : ""}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onWeek(week + 1)}
          disabled={week === weeks.length - 1}
          aria-label="Semana siguiente"
          className="inline-flex size-10 items-center justify-center rounded-full border border-line-strong text-muted hover:text-fg disabled:opacity-40"
        >
          <CaretRight size={16} aria-hidden />
        </button>
      </div>

      {shown.length === 0 && <p className="text-[14px] text-muted">No hay metas para el {quarter}: planteá una en la pestaña del trimestre.</p>}

      {shown.map((g) => (
        <section key={g.id || "loose"} className="grid gap-2">
          <h3 className="kicker">{cleanTitle(g.title)}</h3>
          {quarterKrs(g, quarter).map((k) => {
            const list = inWeek.filter((a) => a.keyResultId === k.id);
            return (
              <div key={k.id} className="grid gap-0.5 rounded-xl border border-line px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{k.title}</span>
                  <span className="font-mono text-[11.5px] text-muted tabular">
                    {list.length ? `${list.filter((a) => a.done).length}/${list.length}` : ""}
                  </span>
                </div>
                {list.length ? (
                  <ul className="grid">
                    {list.map((a) => (
                      <ActionRow key={a.id} a={a} onToggle={() => onToggle(a)} onUnlink={() => onUnlink(a)} />
                    ))}
                  </ul>
                ) : (
                  <p className="py-1 text-[13px] text-muted">Nada planeado esta semana.</p>
                )}
                <button
                  type="button"
                  onClick={() => onAddAction(k, w.from)}
                  className="inline-flex min-h-10 items-center gap-1.5 justify-self-start rounded-full px-1 text-[13px] text-muted hover:text-fg"
                >
                  <Plus size={14} weight="bold" aria-hidden /> Acción para esta semana
                </button>
              </div>
            );
          })}
        </section>
      ))}
      <p className="text-[12.5px] text-muted">Cada acción es un bloque del Plan: tildarla acá o allá es lo mismo.</p>
    </div>
  );
}

// ─── Hoja: una acción para una meta ─────────────────────────────────────────

export type AddActionHandle = { open: (kr: KeyResultDTO, weekFrom: string) => void };

export const AddActionSheet = forwardRef<
  AddActionHandle,
  {
    today: string;
    unlinked: UnlinkedBlock[];
    onAdd: (kr: KeyResultDTO, input: { title: string; date: string; startTime: string | null }) => void;
    onLink: (kr: KeyResultDTO, block: UnlinkedBlock) => void;
  }
>(function AddActionSheet({ today, unlinked, onAdd, onLink }, ref) {
  const sheet = useRef<SheetHandle>(null);
  const [kr, setKr] = useState<KeyResultDTO | null>(null);
  const [weekFrom, setWeekFrom] = useState(today);
  const [day, setDay] = useState(today);
  const [key, setKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  useImperativeHandle(ref, () => ({
    open(k, from) {
      setKr(k);
      setWeekFrom(from);
      const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
      setDay(days.includes(today) ? today : from);
      setError(null);
      setKey((n) => n + 1);
      sheet.current?.open();
    },
  }));
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekFrom, i));
  const loose = unlinked.filter((b) => days.includes(b.date));

  return (
    <Sheet ref={sheet} title={kr ? `Acción · ${kr.title}` : "Acción"}>
      {kr && (
        <form
          key={key}
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const title = String(fd.get("title") ?? "").trim();
            if (!title) {
              setError("Ponele un nombre.");
              return;
            }
            onAdd(kr, { title, date: day, startTime: String(fd.get("startTime") ?? "").trim() || null });
            sheet.current?.close();
          }}
        >
          <Field label="Qué vas a hacer">
            <Input name="title" autoFocus maxLength={120} placeholder="Trote 3 km, mezclar el tema 2…" onChange={() => setError(null)} />
          </Field>
          {error && <p className="-mt-2 text-[13px] text-danger">{error}</p>}
          <div className="grid gap-1.5">
            <span className="kicker">Día</span>
            <div className="grid grid-cols-7 gap-1">
              {days.map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={d === day}
                  onClick={() => setDay(d)}
                  className={cx(
                    "grid min-h-12 place-items-center rounded-xl border text-[12px] leading-tight transition-colors",
                    d === day ? "border-accent bg-accent text-on-accent" : "border-line-strong hover:bg-surface-2",
                  )}
                >
                  <span>{dayLabel(d)}</span>
                  <span className="font-mono text-[13px] font-semibold">{Number(d.slice(8))}</span>
                </button>
              ))}
            </div>
          </div>
          <Field label="Hora (opcional)" hint="Sin hora queda para todo el día.">
            <TimeInput name="startTime" aria-label="Hora de inicio" />
          </Field>
          <Button type="submit" variant="accent">
            Agregar al Plan
          </Button>

          {loose.length > 0 && (
            <div className="grid gap-1.5 border-t border-line pt-4">
              <span className="kicker">O uno que ya está en el Plan esta semana</span>
              <ul className="grid">
                {loose.map((b) => (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onLink(kr, b);
                        sheet.current?.close();
                      }}
                      className="tap-tint flex min-h-11 w-full items-center gap-2.5 rounded-lg px-1 text-left text-[14px]"
                    >
                      <LinkSimple size={15} className="shrink-0 text-muted" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{b.title}</span>
                      <span className="shrink-0 font-mono text-[11.5px] text-muted">
                        {dayLabel(b.date)}
                        {b.startTime ? ` ${b.startTime}` : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </form>
      )}
    </Sheet>
  );
});


