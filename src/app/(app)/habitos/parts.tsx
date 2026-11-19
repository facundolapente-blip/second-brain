"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ChartBar, Check, ListChecks, Moon, Plus, Sun, Trash } from "@phosphor-icons/react";
import type { DayLog, DayState, LogMap } from "@/lib/habit-logic";
import { advance, LADDER_DEFAULT_WEEKS, LADDER_WEEKS_MAX, snoozeWeek } from "@/lib/habit-ladder";
import {
  amountLong,
  amountText,
  doneParts,
  MOMENT_LABEL,
  MOMENTS,
  PART_NAME_MAX,
  PART_UNITS,
  partLabels,
  partNumbers,
  partPlanError,
  partPlanOf,
  partProgress,
  partsStats,
  partStepAt,
  partStepLine,
  partWeekLine,
  PARTS_MAX,
  type HabitPart,
  type PartLadder,
  type PartMoment,
} from "@/lib/habit-parts";
import type { HabitDTO } from "@/lib/habits";
import { advancePart, stayPart } from "@/lib/offline/habit";
import { useSafeTransition } from "@/components/safe-action";
import { notifyError } from "@/components/undo-toast";
import { Button, cx, IconButton, Input, inputClass, Segmented } from "@/components/ui";
import { TintedCard } from "@/components/tinted-card";
import { CheckButton } from "./day-rows";
import { LadderBars, PlanStepper } from "./ladder";
import type { MarkFn } from "./habit-ui";
import "./habits.css";

/*
 * Hábitos por partes: las piezas de pantalla (el círculo a medias de Hoy e Inicio, el
 * sol y la luna de cada parte, la hoja del día, las partes en el formulario y la tarjeta
 * "Por parte" del detalle). Las reglas viven en lib/habit-parts.ts y lib/habit-logic.ts.
 */

const MOMENT_ICON = { morning: Sun, night: Moon } as const;

// ─── El círculo y la fila ───────────────────────────────────────────────────

/**
 * Lo que muestra la fila de un hábito por partes ese día: cuántas partes van, cuáles, y
 * el círculo (hecho, "parts" = medio lleno desde abajo, o el estado de siempre).
 */
export function partsCircle(parts: HabitPart[], log: DayLog | undefined, base: DayState | "skipped") {
  const doneIds = doneParts(log, parts);
  // Un día pasado guarda cuántas partes había; hoy, las de ahora.
  const total = log?.p ? log.p.t : parts.length;
  const done = Math.min(doneIds.length, total);
  const partial = base === "partial" && !!log?.p && done > 0 && done < total;
  return {
    doneIds,
    done,
    total,
    partial,
    state: partial ? "parts" : base,
    fill: partial ? done / total : undefined,
    label: partial ? `A medias: ${done} de ${total}` : undefined,
  };
}

/** Un sol o una luna chicos por parte (llenos los hechos). */
export function PartIcons({ parts, done }: { parts: HabitPart[]; done: string[] }) {
  return (
    <span className="flex min-w-0 shrink-0 items-center gap-1" aria-hidden>
      {parts.map((p) => {
        const Ico = MOMENT_ICON[p.moment];
        const on = done.includes(p.id);
        return <Ico key={p.id} size={13} weight={on ? "fill" : "regular"} className={on ? "text-[var(--st-done-line)]" : "text-faint"} />;
      })}
    </span>
  );
}

// ─── La hoja del día ────────────────────────────────────────────────────────

/**
 * El cuerpo de la hoja del día de un hábito por partes: cuántas van, una barra con un
 * tramo por parte, las partes por momento con su círculo, la escalera de la parte (y
 * "¿Pasás a…?" cuando cumplió), "Completar todas", "Saltear el día" y la nota. Cada
 * toque se guarda solo (como tildar en Hoy, con la cola sin señal de Hábitos).
 */
export function PartsDayBody({
  habit,
  date,
  today,
  logs,
  mark,
  note,
  onNote,
  onDone,
}: {
  habit: HabitDTO;
  date: string;
  today: string;
  logs: LogMap;
  mark: MarkFn;
  note: string;
  onNote: (v: string) => void;
  /** Cierra la hoja (después de saltear el día). */
  onDone: () => void;
}) {
  const parts = habit.parts ?? [];
  const log = logs[date];
  const doneIds = doneParts(log, parts);
  const done = parts.filter((p) => doneIds.includes(p.id)).length;
  const total = parts.length;
  const skipped = log?.s === "skipped";
  const [showNote, setShowNote] = useState(!!log?.n);
  // Escaleras que se subieron o pospusieron desde esta hoja (hasta que llegue lo del servidor).
  const [over, setOver] = useState<Record<string, PartLadder>>({});
  const [, start] = useSafeTransition();

  function save(ids: string[]) {
    const ordered = parts.map((p) => p.id).filter((id) => ids.includes(id));
    // La nota se guarda al cerrar la hoja (o con su botón); acá no se toca.
    mark(habit.id, date, null, ordered.length, undefined, { d: ordered, t: total });
  }
  const toggle = (id: string) => save(doneIds.includes(id) ? doneIds.filter((x) => x !== id) : [...doneIds, id]);

  function ladderAction(part: HabitPart, kind: "up" | "stay") {
    const l = part.ladder!;
    const next: PartLadder = kind === "up" ? { ...advance(l, today), unit: l.unit } : { ...snoozeWeek(l, today), unit: l.unit };
    setOver((o) => ({ ...o, [part.id]: next }));
    const drop = () =>
      setOver((o) => {
        const n = { ...o };
        delete n[part.id];
        return n;
      });
    start(
      async () => {
        const r = kind === "up" ? await advancePart(habit.id, part.id) : await stayPart(habit.id, part.id);
        if (!r.ok) {
          drop();
          notifyError(r.error || "No se pudo guardar. Volvió a como estaba.");
        }
      },
      { onError: drop },
    );
  }

  const shown = parts.map((p) => (over[p.id] ? { ...p, ladder: over[p.id] } : p));

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[17px] font-semibold tracking-[-0.01em]">
            <span className="figure text-[26px]">{done}</span> de {total} {total === 1 ? "hecha" : "hechas"}
          </p>
          {skipped ? (
            <span className="rounded-full bg-[var(--st-skip-bg)] px-2.5 py-1 text-[12px] font-medium text-[var(--st-skip-fg)]">Salteado</span>
          ) : done > 0 ? (
            <span className="rounded-full bg-[var(--st-done-bg)] px-2.5 py-1 text-[12px] font-medium text-[var(--st-done-fg)]">{done >= total ? "Completo" : "A medias"}</span>
          ) : null}
        </div>
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.max(1, total)}, minmax(0, 1fr))` }} aria-hidden>
          {parts.map((p) => (
            <span key={p.id} className={cx("h-1.5 rounded-full transition-colors duration-200", doneIds.includes(p.id) ? "bg-[var(--st-done-line)]" : "bg-surface-3")} />
          ))}
        </div>
      </div>

      {MOMENTS.map((m) => {
        const list = shown.filter((p) => p.moment === m);
        if (!list.length) return null;
        const Ico = MOMENT_ICON[m];
        return (
          <div key={m} className="grid gap-0.5">
            <p className="kicker flex items-center gap-1.5">
              <Ico size={14} weight="fill" aria-hidden /> {MOMENT_LABEL[m]}
            </p>
            <ul className="divide-y divide-line">
              {list.map((p) => (
                <PartLine
                  key={p.id}
                  part={p}
                  done={doneIds.includes(p.id)}
                  habit={habit}
                  logs={logs}
                  today={today}
                  ask={date === today}
                  onToggle={() => toggle(p.id)}
                  onUp={() => ladderAction(p, "up")}
                  onStay={() => ladderAction(p, "stay")}
                />
              ))}
            </ul>
          </div>
        );
      })}

      {showNote && (
        <label className="reveal grid gap-1.5">
          <span className="kicker">Nota del día</span>
          <textarea
            spellCheck
            lang="es"
            value={note}
            onChange={(e) => onNote(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="Cómo te fue, qué pasó..."
            className={cx(inputClass, "h-auto py-2")}
          />
        </label>
      )}

      <div className="grid gap-2">
        <Button variant="accent" disabled={done >= total} onClick={() => save(parts.map((p) => p.id))}>
          <Check size={16} weight="bold" aria-hidden /> Completar todas
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            onClick={() => {
              if (skipped) save([]);
              else {
                mark(habit.id, date, "skipped", 1, note);
                onDone();
              }
            }}
          >
            {skipped ? "Quitar el salteado" : "Saltear el día"}
          </Button>
          <Button variant="outline" onClick={() => setShowNote((v) => !v)} aria-expanded={showNote}>
            {showNote ? "Ocultar nota" : log?.n ? "Ver nota" : "Agregar nota"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function PartLine({
  part,
  done,
  habit,
  logs,
  today,
  ask,
  onToggle,
  onUp,
  onStay,
}: {
  part: HabitPart;
  done: boolean;
  habit: HabitDTO;
  logs: LogMap;
  today: string;
  ask: boolean;
  onToggle: () => void;
  onUp: () => void;
  onStay: () => void;
}) {
  const l = part.ladder;
  const prog = l ? partProgress(part, habit, logs, today) : null;
  const labels = l ? partLabels(l) : [];
  const ready = !!(ask && l && prog?.ready);
  return (
    <li className="grid gap-2 py-2.5">
      <div className="flex items-center gap-3">
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="text-[15px] leading-snug text-fg">{part.name}</span>
          {l && <span className="font-mono text-[11.5px] text-muted tabular">{partStepLine(l)}</span>}
        </span>
        <CheckButton state={done ? "done" : ""} label={`${part.name}: ${done ? "hecha" : "marcar como hecha"}`} onTap={onToggle} />
      </div>
      {ready && l && prog && (
        <div data-tone="habitos" className="lad-ready mx-0! mb-0!">
          <p className="lad-kicker">
            {prog.streak === 1 ? "1 semana cumplida" : `${prog.streak} semanas seguidas cumplidas`}
          </p>
          <p className="text-[14.5px] leading-snug font-medium text-fg">¿Pasás a {amountLong(labels[prog.step + 1], l.unit)}?</p>
          <LadderBars labels={labels} current={prog.step} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="accent" onClick={onUp}>
              Subir a {amountText(labels[prog.step + 1], l.unit)}
            </Button>
            <Button size="sm" variant="outline" onClick={onStay}>
              Todavía no
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

// ─── Las partes en el formulario ────────────────────────────────────────────

export type PartDraft = {
  /** Clave en la pantalla (las nuevas no tienen id todavía). */
  key: string;
  id?: string;
  name: string;
  moment: PartMoment;
  build: boolean;
  from: number;
  to: number;
  by: number;
  unit: string;
  weeks: number;
  /** Paso en el que va (si ya se estaba construyendo). */
  current?: number;
  /** "Estás en": el número de ese paso (con otro plan, el más alto que no lo pase). */
  at?: number;
};

let seq = 0;
const nextKey = () => `n${++seq}`;

export function newPartDraft(moment: PartMoment = "morning"): PartDraft {
  return { key: nextKey(), name: "", moment, build: false, from: 15, to: 60, by: 15, unit: "min", weeks: LADDER_DEFAULT_WEEKS };
}

export function draftsOf(parts: HabitPart[] | null | undefined): PartDraft[] {
  return (parts ?? []).map((p) => {
    const plan = p.ladder ? partPlanOf(p.ladder) : null;
    return {
      key: p.id,
      id: p.id,
      name: p.name,
      moment: p.moment,
      build: !!plan,
      from: plan?.from ?? 15,
      to: plan?.to ?? 60,
      by: plan?.by ?? 15,
      unit: plan?.unit ?? "min",
      weeks: plan?.weeks ?? LADDER_DEFAULT_WEEKS,
      current: p.ladder ? p.ladder.current : undefined,
      at: p.ladder ? partLabels(p.ladder)[Math.min(p.ladder.current, p.ladder.steps.length - 1)] : undefined,
    };
  });
}

/** Lo que va en el campo oculto `parts` (ver `partsFromForm` en habit-actions.ts). */
export function partsPayload(drafts: PartDraft[]): string {
  return JSON.stringify(
    drafts.map((d) => ({
      id: d.id,
      name: d.name.trim(),
      moment: d.moment,
      build: d.build ? { from: d.from, to: d.to, by: d.by, unit: d.unit, weeks: d.weeks, ...(d.at !== undefined && !partPlanError(d) ? { current: partStepAt(partNumbers(d.from, d.to, d.by), d.at) } : {}) } : null,
    })),
  );
}

/** La tarjeta "Partes" de crear y editar: cada parte con su nombre, momento y escalera opcional. */
export function PartsEditor({ drafts, onChange }: { drafts: PartDraft[]; onChange: (d: PartDraft[]) => void }) {
  const set = (key: string, patch: Partial<PartDraft>) => onChange(drafts.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= drafts.length) return;
    const next = [...drafts];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div data-tone="habitos" className="reveal">
      <TintedCard
        as="div"
        tone="habitos"
        icon={ListChecks}
        title="Partes"
        meta={`${drafts.length} ${drafts.length === 1 ? "parte" : "partes"} · en el orden del día`}
      >
        <div className="grid gap-3">
          <p className="text-[13px] leading-snug text-muted">
            <b className="font-medium text-fg">Completo con todas; con algunas, a medias</b> (ni hecho ni fallado). Cada parte puede subir de a poco
            por su cuenta.
          </p>
          <ul className="grid gap-2">
            {drafts.map((d, i) => (
              <PartEditor
                key={d.key}
                n={i + 1}
                draft={d}
                first={i === 0}
                last={i === drafts.length - 1}
                onChange={(patch) => set(d.key, patch)}
                onUp={() => move(i, -1)}
                onDown={() => move(i, 1)}
                onRemove={drafts.length > 1 ? () => onChange(drafts.filter((x) => x.key !== d.key)) : undefined}
              />
            ))}
          </ul>
          {drafts.length < PARTS_MAX && (
            <button
              type="button"
              onClick={() => onChange([...drafts, newPartDraft(drafts.at(-1)?.moment ?? "morning")])}
              className="press flex min-h-11 items-center justify-center gap-2 rounded-[16px] border border-dashed border-line-strong text-[14px] font-medium text-muted hover:bg-surface-2"
            >
              <Plus size={15} weight="bold" aria-hidden /> Agregar parte
            </button>
          )}
          <p className="text-[12.5px] leading-snug text-muted">Podés sumar una parte más adelante: los días anteriores quedan como estaban.</p>
        </div>
      </TintedCard>
    </div>
  );
}

function PartEditor({
  n,
  draft: d,
  first,
  last,
  onChange,
  onUp,
  onDown,
  onRemove,
}: {
  n: number;
  draft: PartDraft;
  first: boolean;
  last: boolean;
  onChange: (patch: Partial<PartDraft>) => void;
  onUp: () => void;
  onDown: () => void;
  onRemove?: () => void;
}) {
  const unitStep = d.unit === "min" ? 5 : 1;
  const plan = { from: d.from, to: d.to, by: d.by, unit: d.unit, weeks: d.weeks };
  const error = d.build ? partPlanError(plan) : null;
  const labels = d.build && !error ? partNumbers(d.from, d.to, d.by) : [];
  const weeksTotal = Math.max(0, labels.length - 1) * d.weeks;
  // Ya se estaba construyendo: en qué paso está (con el plan de ahora).
  const at = d.at !== undefined && labels.length ? partStepAt(labels, d.at) : undefined;
  const atIndex = at !== undefined ? labels.indexOf(at) : -1;
  const units = PART_UNITS.includes(d.unit) ? PART_UNITS : [...PART_UNITS, d.unit];
  const unitWord = d.unit === "min" ? "minutos" : d.unit;
  return (
    <li className="lad-item grid gap-3 p-3">
      <div className="flex items-center gap-2">
        <span className="w-4 shrink-0 text-center font-mono text-[12px] text-muted tabular">{n}</span>
        <Input
          value={d.name}
          onChange={(e) => onChange({ name: e.target.value })}
          aria-label={`Parte ${n}`}
          placeholder={n === 1 ? "Sin celular la primera hora" : "Qué hacés en esta parte"}
          maxLength={PART_NAME_MAX}
          className="min-w-0 flex-1"
        />
        {onRemove && (
          <IconButton label="Sacar la parte" type="button" onClick={onRemove}>
            <Trash size={17} />
          </IconButton>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 sm:pl-6">
        <Segmented
          value={d.moment}
          onChange={(v) => onChange({ moment: v })}
          options={[
            { value: "morning", label: "Mañana" },
            { value: "night", label: "Noche" },
          ]}
        />
        <span className="flex shrink-0 items-center">
          <IconButton label="Subir la parte" type="button" disabled={first} onClick={onUp}>
            <ArrowUp size={16} />
          </IconButton>
          <IconButton label="Bajar la parte" type="button" disabled={last} onClick={onDown}>
            <ArrowDown size={16} />
          </IconButton>
        </span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={d.build}
        onClick={() => onChange({ build: !d.build })}
        className="flex min-h-11 items-center justify-between gap-3 text-left sm:ml-6"
      >
        <span className="grid gap-0.5">
          <span className="text-[14.5px] font-medium">Construir de a poco</span>
          <span className="text-[12.5px] leading-snug text-muted">{d.build ? "Sube de a un número" : "Opcional: minutos, páginas…"}</span>
        </span>
        <span className="lad-switch" data-on={d.build || undefined} aria-hidden>
          <span />
        </span>
      </button>
      {d.build && (
        <div className="reveal grid gap-3 sm:pl-6">
          <div className="grid divide-y divide-line">
            <PlanStepper
              label="Empezás con"
              unit={unitWord}
              value={d.from}
              min={1}
              max={Math.max(1, d.to - 1)}
              step={unitStep}
              onChange={(v) => onChange({ from: v })}
            />
            <PlanStepper label="Querés llegar a" unit={unitWord} value={d.to} min={d.from + 1} max={100_000} step={Math.max(1, d.by)} onChange={(v) => onChange({ to: v })} />
            <PlanStepper
              label="De a cuánto sube"
              unit={`${unitWord} por paso`}
              value={d.by}
              min={1}
              max={Math.max(1, d.to - d.from)}
              step={unitStep}
              onChange={(v) => onChange({ by: v })}
            />
            <div className="grid gap-2 py-2">
              <span className="text-[15px] font-medium">Unidad</span>
              <span className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Unidad">
                {units.map((u) => (
                  <button
                    key={u}
                    type="button"
                    role="radio"
                    aria-checked={d.unit === u}
                    onClick={() => onChange({ unit: u })}
                    className={cx(
                      "press inline-flex h-8 items-center rounded-full border px-3 text-[13px]",
                      d.unit === u ? "border-accent bg-accent-soft font-medium text-accent-fg" : "border-line text-muted hover:bg-surface-2",
                    )}
                  >
                    {u}
                  </button>
                ))}
              </span>
            </div>
            {at !== undefined && (
              <PlanStepper
                label="Estás en"
                unit={unitWord}
                value={at}
                min={labels[0]}
                max={labels[labels.length - 1]}
                onChange={(v) => {
                  // De paso en paso: − va al número de antes y + al de después.
                  const i = labels.indexOf(at) + (v < at ? -1 : 1);
                  onChange({ at: labels[Math.max(0, Math.min(labels.length - 1, i))] });
                }}
              />
            )}
            <PlanStepper
              label="Subís después de"
              unit={d.weeks === 1 ? "semana cumplida" : "semanas seguidas cumplidas"}
              value={d.weeks}
              min={1}
              max={LADDER_WEEKS_MAX}
              onChange={(v) => onChange({ weeks: v })}
            />
          </div>
          {error ? (
            <p className="text-[13px] text-danger">{error}</p>
          ) : (
            <div className="lad-propose">
              <p className="lad-kicker">El camino de esta parte</p>
              <LadderBars labels={labels} current={atIndex >= 0 ? atIndex : 0} />
              <p className="text-[12.5px] leading-snug text-muted">
                {labels.join(" → ")} {d.unit}.
                {atIndex > 0 ? ` Vas por el paso ${atIndex + 1}.` : atIndex === 0 ? "" : ` Si cumplís todas las semanas, llegás en ${weeksTotal === 1 ? "1 semana" : `unas ${weeksTotal} semanas`}.`}
              </p>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

// ─── Detalle: por parte ─────────────────────────────────────────────────────

function Fig({ value, label }: { value: number; label: string }) {
  return (
    <div className="grid content-start gap-0.5 rounded-[14px] bg-surface-2 px-3 py-2.5">
      <span className="figure text-[22px] font-[750]">{value}</span>
      <span className="text-[12px] leading-snug text-muted">{label}</span>
    </div>
  );
}

/** "Por parte · Últimos 30 días": días completos, a medias y sin ninguna, y cada parte con su %. */
export function PartsStatsCard({ habit, logs, today, className }: { habit: HabitDTO; logs: LogMap; today: string; className?: string }) {
  const parts = habit.parts ?? [];
  const st = partsStats(habit, logs, today, 30);
  return (
    <div data-tone="habitos" className={className}>
      <TintedCard as="div" tone="habitos" icon={ChartBar} title="Por parte" meta="Últimos 30 días" className="h-full">
        <div className="grid gap-4">
          <div className="grid grid-cols-3 gap-2">
            <Fig value={st.complete} label={st.complete === 1 ? "día completo" : "días completos"} />
            <Fig value={st.partial} label="a medias" />
            <Fig value={st.none} label="sin ninguna" />
          </div>
          <ul className="grid gap-2">
            {parts.map((p, i) => {
              const s = st.parts[i];
              const hardest = st.hardest === p.id;
              const Ico = MOMENT_ICON[p.moment];
              const prog = p.ladder ? partProgress(p, habit, logs, today) : null;
              return (
                <li key={p.id} className="lad-item grid gap-2 px-3.5 py-3" data-alert={hardest || undefined}>
                  {hardest && <p className="lad-alert-kicker">La que más te cuesta</p>}
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="grid min-w-0 gap-0.5">
                      <span className="kicker flex items-center gap-1.5">
                        <Ico size={13} weight="fill" aria-hidden /> {MOMENT_LABEL[p.moment]}
                      </span>
                      <span className="text-[15px] leading-snug font-medium">{p.name}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="figure text-[22px] font-[750]">{s.days ? Math.round(s.pct * 100) : "–"}</span>
                      {s.days > 0 && <span className="text-[13px] font-semibold text-muted">%</span>}
                    </span>
                  </div>
                  <span className="h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                    <span className={cx("block h-full rounded-full", hardest ? "bg-[var(--st-skip-line)]" : "bg-[var(--st-done-line)]")} style={{ width: `${s.pct * 100}%` }} />
                  </span>
                  <p className="lad-sub">
                    {s.done} de {s.days} {s.days === 1 ? "día" : "días"}
                    {hardest ? " · es la que más queda sin hacer" : ""}
                  </p>
                  {p.ladder && prog && (
                    <div className="grid gap-1.5 pt-1">
                      <LadderBars labels={partLabels(p.ladder)} current={prog.step} />
                      <p className="text-[12.5px] leading-snug text-muted">
                        {partStepLine(p.ladder)} · {partWeekLine(p.ladder, prog)}
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </TintedCard>
    </div>
  );
}
