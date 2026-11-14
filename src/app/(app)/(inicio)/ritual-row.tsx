"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  ArrowRight,
  CalendarCheck,
  CalendarPlus,
  ChartPolar,
  Check,
  CheckCircle,
  Fire,
  Flag,
  ListChecks,
  Medal,
  Moon,
  PencilSimple,
  SunHorizon,
  Target,
  Timer,
  type Icon,
} from "@phosphor-icons/react";
import { useSafeTransition } from "@/components/safe-action";
import { notifyError, notifyInfo } from "@/components/undo-toast";
import { haptic } from "@/components/haptics";
import { cx } from "@/components/ui";
import { TintedCard } from "@/components/tinted-card";
import { MenuButton } from "@/components/shell";
import { tone } from "@/lib/palette";
import { formatLong } from "@/lib/dates";
import { pickForSlot, quoteSlot } from "@/lib/quotes";
import type { ValueNote } from "@/lib/values";
import type { Dashboard } from "@/lib/dashboard";
import { isFreeBlock } from "@/lib/plan-logic";
import { sleepText } from "@/lib/health-logic";
import { ENERGY_LABELS, type CheckinPatch } from "@/lib/checkin-logic";
import { greeting, MOODS } from "@/lib/journal-logic";
import {
  applyRitualPatch,
  emptyRitual,
  MISSION_MAX,
  MISSION_RESULTS,
  NIGHT_HOUR,
  recentWins,
  ritualStage,
  type FrogCandidate,
  type MissionResult,
  type RitualDTO,
  type RitualPatch,
  type Win,
} from "@/lib/ritual-logic";
import type { RitualData } from "@/lib/ritual";
import { saveRitual } from "@/lib/offline/ritual";
import { saveCheckin } from "@/lib/offline/checkin";
import { scheduleTask } from "@/lib/offline/plan";
import { CategoryTag } from "../plan/plan-ui";
import { MoodIcon } from "../journal/journal-ui";
import { Scale } from "./checkin-card";
import { emitCheckin, useCheckinSync } from "./checkin-sync";

type Progress = { done: number; total: number };
export type ProgressSource = { get: () => Progress; subscribe: (f: () => void) => () => void };

const hhmm = new Intl.DateTimeFormat("es-UY", { timeZone: "America/Montevideo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });


/**
 * Ritual matutino (diseño 3 "Tablero del día", 2026-11-14): la fila de arriba de Inicio.
 * A la izquierda el saludo y la misión del día con energía y ánimo (los del check-in); a la
 * derecha el sapo; debajo un vistazo a hoy y los logros recientes. Hecho, se pliega: la misión
 * queda de titular y el sapo como tarjeta chica con "Me lo comí". A la noche pregunta cómo fue.
 */
export function RitualRow({
  d,
  data,
  notes,
  summary,
  links,
  habits,
}: {
  d: Dashboard;
  data: RitualData;
  notes: ValueNote[];
  /** La frase del resumen de siempre ("Llevás 2 de 6 hábitos…"). */
  summary: React.ReactNode;
  /** Las píldoras Revisión semanal / Análisis. */
  links: React.ReactNode;
  /** El avance de hábitos de hoy (sigue los toques de la tarjeta de Hábitos). */
  habits: ProgressSource;
}) {
  const [ritual, setRitual] = useState<RitualDTO>(() => data.ritual ?? emptyRitual(d.today));
  // Se está armando (o se tocó "Editar"): no se pliega solo mientras tanto.
  const [editing, setEditing] = useState(false);
  const [, start] = useSafeTransition();
  const stage = ritualStage(ritual, d.hour, editing);

  function save(patch: RitualPatch) {
    const before = ritual;
    setRitual((r) => applyRitualPatch(r, patch));
    start(
      async () => {
        const res = await saveRitual(d.today, patch);
        if (res && !res.ok) {
          notifyError(res.error);
          setRitual(before);
        }
      },
      { onError: () => setRitual(before) },
    );
  }

  // El sapo que se ve: el elegido o, si no hay, la primera candidata (propuesta).
  const chosen = ritual.frogTitle ? { id: ritual.frogTaskId, title: ritual.frogTitle } : null;
  const proposal = data.candidates[0] ?? null;
  const frogPatch = (c: { id: string | null; title: string }): RitualPatch => ({ frogTaskId: c.id, frogTitle: c.title });

  const night = stage === "night";
  // Desde las 19 h ya es "Buenas noches" (la pregunta de la noche arranca ahí).
  const title = `${d.hour >= NIGHT_HOUR ? "Buenas noches" : greeting(d.hour)}, Facu`;
  const wins = recentWins({
    today: d.today,
    journalStreak: d.journal.streak,
    habitDaysComplete: d.week.filter((w) => w.date <= d.today && w.habitsDue > 0 && w.habitsDone >= w.habitsDue).length,
    goals: data.goals,
    wheel: data.wheel,
    ritualStreak: data.streak,
  });
  const sleep = d.checkin.today.sleepMin;

  const hello = (
    <div className="flex min-w-0 flex-col gap-1.5 lg:gap-2 lg:px-1 lg:pt-1.5">
      <div className="flex items-center gap-2 max-lg:-ml-0.5">
        <MenuButton />
        <p className="kicker truncate">{formatLong(d.today)}</p>
      </div>
      <h1 className="display text-[32px] leading-[1.02] font-[750] tracking-[-0.04em] lg:text-[36px] xl:text-[44px]">{title}</h1>
      <p className="max-w-[34rem] text-[15px] leading-normal text-pretty text-muted lg:text-[16px]">
        {sleep !== null && (
          <span className="mr-1.5 inline-flex items-center gap-1.5 whitespace-nowrap">
            <Moon size={15} aria-hidden className="shrink-0" />
            Dormiste <b className="font-mono text-[14px] font-semibold text-fg">{sleepText(sleep)}</b>.
          </span>
        )}
        {summary}
      </p>
      <div className="mt-1 flex flex-wrap gap-1.5 lg:mt-2">{links}</div>
    </div>
  );

  if (stage === "skipped") {
    return (
      <section aria-label="Ritual de la mañana" className="grid gap-3.5 max-lg:order-1 lg:col-span-12 lg:grid-cols-12 lg:gap-5">
        <div className="grid gap-3 lg:col-span-12">
          {hello}
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] text-muted lg:px-1">
            <SunHorizon size={16} aria-hidden />
            Hoy salteaste el ritual.
            <button
              type="button"
              onClick={() => {
                setEditing(true);
                save({ skipped: false });
              }}
              className="inline-flex min-h-11 items-center font-medium text-fg underline underline-offset-4"
            >
              Armarlo igual
            </button>
          </p>
        </div>
        <Wins wins={wins} />
      </section>
    );
  }

  if (stage === "night" || stage === "done") {
    const hasFrog = !!chosen;
    return (
      <section aria-label="Ritual de la mañana" className="grid gap-3.5 max-lg:order-1 lg:col-span-12 lg:grid-cols-12 lg:gap-5">
        <div className={cx("grid content-start gap-3.5", hasFrog ? "lg:col-span-7" : "lg:col-span-12")}>
          {hello}
          {night ? (
            <NightMission mission={ritual.mission!} onAnswer={(v) => save({ missionResult: v })} />
          ) : (
            <DoneMission ritual={ritual} onEdit={() => setEditing(true)} />
          )}
        </div>
        {hasFrog && (
          <div className="lg:col-span-5">
            <SmallFrog
              ritual={ritual}
              ask={night}
              nextBlock={nextBlock(d)}
              onEat={(eaten) => save({ frogDoneAt: eaten ? new Date().toISOString() : null })}
            />
          </div>
        )}
        <Wins wins={wins} />
      </section>
    );
  }

  return (
    <section aria-label="Ritual de la mañana" className="grid gap-3.5 max-lg:order-1 lg:col-span-12 lg:grid-cols-12 lg:gap-5">
      <div className="grid min-w-0 content-start gap-3.5 lg:col-span-7">
        {hello}
        <MissionCard
          d={d}
          ritual={ritual}
          note={pickForSlot(notes, quoteSlot(d.today, d.hour))}
          onTouch={() => setEditing(true)}
          onMission={(mission) => save({ mission })}
          onDone={() => {
            haptic("success");
            setEditing(false);
            save({ completed: true, ...(!chosen && proposal ? frogPatch(proposal) : {}) });
          }}
          onSkip={() => {
            setEditing(false);
            save({ skipped: true });
          }}
        />
      </div>
      <div className="min-w-0 lg:col-span-5">
        <FrogCard
          d={d}
          candidates={data.candidates}
          chosen={chosen}
          onChoose={(c) => {
            setEditing(true);
            haptic("select");
            save(frogPatch(c));
          }}
        />
      </div>
      <TodayStrip d={d} habits={habits} />
      <Wins wins={wins} />
    </section>
  );
}

/** El próximo bloque de hoy con hora que todavía no se hizo (desde la hora de la página). */
function nextBlock(d: Dashboard) {
  const now = `${String(d.hour).padStart(2, "0")}:00`;
  return d.plan.today.find((b) => b.startTime && b.startTime >= now && !b.done && !isFreeBlock(b)) ?? null;
}

// ─── La misión ──────────────────────────────────────────────────────────────

function MissionCard({
  d,
  ritual,
  note,
  onTouch,
  onMission,
  onDone,
  onSkip,
}: {
  d: Dashboard;
  ritual: RitualDTO;
  note: ValueNote | null;
  onTouch: () => void;
  onMission: (m: string | null) => void;
  onDone: () => void;
  onSkip: () => void;
}) {
  const [text, setText] = useState(ritual.mission ?? "");
  const [status, setStatus] = useState<"idle" | "dirty" | "saved">("idle");
  // Autoguardado como el resto de la app: a los 900 ms de dejar de escribir, al salir del
  // campo y al ocultar la página.
  const pending = useRef<{ text: string; timer?: ReturnType<typeof setTimeout> } | null>(null);
  const saveRef = useRef(onMission);
  useEffect(() => {
    saveRef.current = onMission;
  });
  const flush = () => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    clearTimeout(p.timer);
    saveRef.current(p.text.trim() || null);
    setStatus("saved");
  };
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  });
  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && flushRef.current();
    const onLeave = () => flushRef.current();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onLeave);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onLeave);
      flushRef.current();
    };
  }, []);

  return (
    <div className="grid gap-3.5 rounded-[18px] border border-line bg-surface p-4 lg:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="kicker flex items-center gap-1.5 text-[var(--accent)]!">
          <Flag size={13} weight="fill" aria-hidden />
          La misión del día
        </p>
        <span className="grid font-mono text-[11px] text-muted" aria-live="polite">
          <span className={cx("col-start-1 row-start-1 transition-opacity duration-150", status !== "dirty" && "opacity-0")}>Guardando…</span>
          <span className={cx("col-start-1 row-start-1 inline-flex items-center gap-1 transition-opacity duration-150", status !== "saved" && "opacity-0")}>
            <Check size={11} weight="bold" aria-hidden className={status === "saved" ? "check-draw" : undefined} /> Guardado
          </span>
        </span>
      </div>
      <label className="grid gap-0.5">
        <span className="text-[15px] font-semibold text-[var(--accent)] lg:text-[16px]">Hoy gano si…</span>
        <textarea
          rows={1}
          value={text}
          maxLength={MISSION_MAX}
          lang="es"
          spellCheck
          placeholder="Escribí una frase"
          onChange={(e) => {
            const v = e.target.value.replace(/\n/g, " ");
            setText(v);
            onTouch();
            setStatus("dirty");
            const p = (pending.current ??= { text: v });
            p.text = v;
            clearTimeout(p.timer);
            p.timer = setTimeout(() => flushRef.current(), 900);
          }}
          onBlur={() => flushRef.current()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          className="w-full resize-none bg-transparent text-[23px] leading-[1.2] font-[680] tracking-[-0.03em] text-fg outline-none [field-sizing:content] placeholder:text-faint lg:text-[28px]"
        />
      </label>
      {note && (
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2.5 rounded-xl border border-line bg-surface-2 px-3 py-2.5">
          <span aria-hidden className="w-[3px] rounded-full bg-[var(--accent)] opacity-55" />
          <div className="min-w-0">
            <Link href="/valores" className="kicker block hover:underline">
              De tus Valores
            </Link>
            <p className="line-clamp-3 text-[13.5px] leading-snug text-fg">{note.text}</p>
          </div>
        </div>
      )}
      <HowYouStart d={d} onTouch={onTouch} />
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            flushRef.current();
            onSkip();
          }}
          className="press inline-flex h-10 items-center rounded-full px-3.5 text-[13px] font-medium text-muted hover:bg-surface-2 hover:text-fg"
        >
          Saltar hoy
        </button>
        <button
          type="button"
          onClick={() => {
            flushRef.current();
            onDone();
          }}
          className="press inline-flex h-10 items-center gap-1.5 rounded-full bg-ink px-4 text-[13.5px] font-medium text-on-ink hover:opacity-90"
        >
          <Check size={14} weight="bold" aria-hidden /> Listo
        </button>
      </div>
      {/* El resultado de la noche, si ya se contestó (se ve solo al editar después). */}
      {ritual.missionResult && <p className="text-[12.5px] text-muted">{MISSION_RESULTS.find((r) => r.value === ritual.missionResult)?.done}</p>}
    </div>
  );
}

/** ¿Cómo arrancás?: energía y ánimo, los mismos del check-in de hoy (se guardan ahí). */
function HowYouStart({ d, onTouch }: { d: Dashboard; onTouch: () => void }) {
  const date = d.checkin.today.date;
  const [v, setV] = useState({ energy: d.checkin.today.energy, mood: d.checkin.today.mood });
  const [, start] = useSafeTransition();
  // Lo que se cargue en "¿Cómo estás?" se ve acá también.
  useCheckinSync("ritual", (day, patch) => {
    if (day !== date) return;
    setV((cur) => ({
      energy: "energy" in patch ? (patch.energy ?? null) : cur.energy,
      mood: "mood" in patch ? (patch.mood ?? null) : cur.mood,
    }));
  });
  function set(patch: CheckinPatch & { energy?: number | null; mood?: number | null }) {
    const before = v;
    onTouch();
    setV((cur) => ({ ...cur, ...patch }));
    emitCheckin(date, patch, "ritual");
    start(
      async () => {
        await saveCheckin(date, patch);
      },
      {
        onError: () => {
          setV(before);
          emitCheckin(date, { energy: before.energy, mood: before.mood }, "ritual");
        },
      },
    );
  }
  return (
    <div className="grid gap-2.5 border-t border-line pt-3">
      <span className="kicker text-fg!">¿Cómo arrancás?</span>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <div className="flex items-center gap-2.5">
        <span className="kicker">Energía</span>
        <div className="w-[140px]">
          <Scale value={v.energy} labels={ENERGY_LABELS} color="var(--c-habitos)" caps={false} onChange={(e) => set({ energy: e })} />
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        <span className="kicker">Ánimo</span>
        <div className="flex gap-1">
          {MOODS.map((m) => {
            const on = v.mood === m.value;
            return (
              <button
                key={m.value}
                type="button"
                aria-pressed={on}
                aria-label={m.label}
                title={m.label}
                onClick={() => {
                  haptic("select");
                  set({ mood: on ? null : m.value });
                }}
                style={tone(m.color)}
                className={cx(
                  "inline-flex size-10 items-center justify-center rounded-full transition-[background-color,color,scale] duration-200 active:scale-95",
                  on ? "bg-tone text-tone-fg ring-2 ring-[var(--tone-solid)]" : "bg-surface-2 text-muted hover:text-fg",
                )}
              >
                <MoodIcon mood={m.value} size={21} weight={on ? "fill" : "regular"} />
              </button>
            );
          })}
        </div>
      </div>
      </div>
    </div>
  );
}

/** Plegado: la misión de titular (con el resultado de la noche, si ya se contestó). */
function DoneMission({ ritual, onEdit }: { ritual: RitualDTO; onEdit: () => void }) {
  const result = MISSION_RESULTS.find((r) => r.value === ritual.missionResult);
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2.5 rounded-[14px] border border-line bg-surface px-3.5 py-3 text-[15px] leading-snug">
      <Flag size={17} weight="fill" aria-hidden className="mt-0.5 text-[var(--accent)]" />
      <div className="grid gap-1.5">
        {ritual.mission ? (
          <p>
            <span className="font-semibold text-[var(--accent)]">Hoy gano si</span> {ritual.mission}
          </p>
        ) : (
          <p className="text-muted">Hoy sin misión.</p>
        )}
        {result && (
          <span
            style={tone(ritual.missionResult === "yes" ? "green" : ritual.missionResult === "partial" ? "yellow" : "red")}
            className="chip-solid inline-flex h-6 w-fit items-center rounded-md px-2 text-[12px] font-medium"
          >
            {result.done}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={onEdit}
        aria-label="Editar el ritual"
        title="Editar"
        className="-my-1.5 -mr-1.5 inline-flex size-10 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
      >
        <PencilSimple size={16} aria-hidden />
      </button>
    </div>
  );
}

const RESULT_TONE: Record<MissionResult, string> = { yes: "green", partial: "yellow", no: "red" };

/** A la noche: ¿Cumpliste la misión? Sí / A medias / No. */
function NightMission({ mission, onAnswer }: { mission: string; onAnswer: (v: MissionResult) => void }) {
  return (
    <div className="grid gap-3 rounded-[14px] border border-line bg-surface px-3.5 py-3.5">
      <div>
        <p className="text-[15px] font-semibold">¿Cumpliste la misión?</p>
        <p className="mt-0.5 text-[13.5px] text-muted">
          <span className="font-semibold text-[var(--accent)]">Hoy gano si</span> {mission}
        </p>
      </div>
      <div role="group" aria-label="¿Cumpliste la misión?" className="inline-flex w-fit flex-wrap gap-1 rounded-full border border-line bg-surface-2 p-1">
        {MISSION_RESULTS.map((r) => (
          <button
            key={r.value}
            type="button"
            style={tone(RESULT_TONE[r.value])}
            onClick={() => {
              haptic(r.value === "no" ? "tap" : "success");
              onAnswer(r.value);
            }}
            className="press inline-flex h-9 items-center rounded-full px-4 text-[13.5px] font-semibold text-muted transition-colors hover:bg-surface hover:text-[var(--tone-fg)]"
          >
            {r.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── El sapo ────────────────────────────────────────────────────────────────

function Reasons({ c }: { c: Pick<FrogCandidate, "reasons" | "category"> }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {c.reasons.map((r) => (
        <span key={r.text} style={tone(r.tone)} className="chip-solid inline-flex h-6 items-center rounded-md px-2 text-[12px] font-medium whitespace-nowrap">
          {r.text}
        </span>
      ))}
      <CategoryTag category={c.category} />
    </div>
  );
}

function FrogCard({
  d,
  candidates,
  chosen,
  onChoose,
}: {
  d: Dashboard;
  candidates: FrogCandidate[];
  chosen: { id: string | null; title: string } | null;
  onChoose: (c: { id: string | null; title: string }) => void;
}) {
  const [writing, setWriting] = useState(false);
  const [draft, setDraft] = useState("");
  const [scheduled, setScheduled] = useState<string[]>([]);
  const [, start] = useSafeTransition();
  const shownCand = chosen ? candidates.find((c) => c.id === chosen.id) : candidates[0];
  const frog = chosen ?? (shownCand ? { id: shownCand.id, title: shownCand.title } : null);
  const others = candidates.filter((c) => c.id !== frog?.id).slice(0, 2);
  const inPlan = !!frog?.id && (scheduled.includes(frog.id) || d.plan.today.some((b) => b.taskId === frog.id));

  function writeFrog() {
    const t = draft.trim();
    if (!t) return setWriting(false);
    onChoose({ id: null, title: t });
    setDraft("");
    setWriting(false);
  }

  return (
    <TintedCard
      tone="plan"
      icon={Flag}
      title="Tarea prioritaria"
      meta={chosen ? "Lo primero del día" : frog ? "Propuesto · lo primero del día" : "Lo primero del día"}
      action={{ href: "/plan#tareas", label: "Tareas" }}
      className="h-full"
      bodyClassName="gap-3.5!"
    >
      {frog ? (
        <>
          <div className="grid gap-2">
            <p className="text-[21px] leading-[1.2] font-bold tracking-[-0.025em] text-pretty">{frog.title}</p>
            {shownCand && shownCand.id === frog.id ? <Reasons c={shownCand} /> : !frog.id && <p className="text-[12.5px] text-muted">Escrito a mano</p>}
          </div>
          <div className={cx("grid gap-2", frog.id && "grid-cols-2")}>
            {frog.id && (
              <button
                type="button"
                disabled={inPlan}
                onClick={() => {
                  const id = frog.id!;
                  if (!chosen) onChoose(frog);
                  setScheduled((s) => [...s, id]);
                  start(
                    async () => {
                      await scheduleTask(id, d.today, null);
                      notifyInfo(`"${frog.title}" quedó en el plan de hoy`);
                    },
                    { onError: () => setScheduled((s) => s.filter((x) => x !== id)) },
                  );
                }}
                className="press inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-[var(--head-fg)] px-3 text-[13.5px] font-semibold text-[var(--head-chip-fg)] hover:opacity-90 disabled:bg-surface-2 disabled:text-muted disabled:opacity-100"
              >
                {inPlan ? <CalendarCheck size={16} aria-hidden /> : <CalendarPlus size={16} aria-hidden />}
                {inPlan ? "Ya está hoy" : "Agendar hoy"}
              </button>
            )}
            <Link
              href={frog.id ? `/enfoque?tarea=${frog.id}` : "/enfoque"}
              onClick={() => !chosen && onChoose(frog)}
              className="press inline-flex h-11 items-center justify-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 text-[13.5px] font-semibold text-fg hover:bg-surface-2"
            >
              <Timer size={16} aria-hidden /> Enfocarme
            </Link>
          </div>
        </>
      ) : (
        <p className="text-[13.5px] text-muted">No tenés tareas abiertas. Escribí cuál es la cosa difícil de hoy.</p>
      )}
      <div className="grid gap-0.5 border-t border-line pt-2.5">
        <span className="kicker mb-1">{frog ? "Otras candidatas" : "Tu tarea prioritaria"}</span>
        {others.map((c) => (
          <div key={c.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 py-0.5 text-[13.5px]">
            <span className="min-w-0 truncate">
              <b className="font-semibold">{c.title}</b> <span className="text-[12.5px] text-muted">· {c.reasons[0]?.text.toLowerCase()}</span>
            </span>
            <button
              type="button"
              onClick={() => onChoose({ id: c.id, title: c.title })}
              className="press inline-flex min-h-11 items-center rounded-full px-3 text-[12.5px] font-semibold text-[var(--head-fg)] hover:bg-surface-2"
            >
              Elegir
            </button>
          </div>
        ))}
        {writing ? (
          <form
            className="flex items-center gap-2 py-1"
            onSubmit={(e) => {
              e.preventDefault();
              writeFrog();
            }}
          >
            <input
              autoFocus
              value={draft}
              maxLength={120}
              lang="es"
              spellCheck
              aria-label="Tu tarea prioritaria de hoy"
              placeholder="La cosa difícil de hoy"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setWriting(false)}
              className="h-11 min-w-0 flex-1 rounded-full border border-line-strong bg-surface px-3.5 text-[16px] outline-none focus:border-fg/50 pointer-fine:text-[14px]"
            />
            <button type="submit" className="press inline-flex h-11 items-center rounded-full bg-ink px-4 text-[13px] font-medium text-on-ink">
              Elegir
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setWriting(true)}
            className="flex min-h-11 items-center justify-between gap-2 text-left text-[13.5px] text-muted hover:text-fg"
          >
            Escribir otra…
            <PencilSimple size={15} aria-hidden />
          </button>
        )}
      </div>
    </TintedCard>
  );
}

/** El sapo plegado (y a la noche, la pregunta): "Me lo comí" lo pasa a verde con la hora. */
function SmallFrog({
  ritual,
  ask,
  nextBlock,
  onEat,
}: {
  ritual: RitualDTO;
  ask: boolean;
  nextBlock: Dashboard["plan"]["today"][number] | null;
  onEat: (eaten: boolean) => void;
}) {
  const eaten = !!ritual.frogDoneAt;
  // El brillo y la tilde dibujada, solo tras el toque (al abrir la página ya comido, quieto).
  const [justAte, setJustAte] = useState(false);
  const [said, setSaid] = useState<"no" | null>(null);
  const eat = () => {
    if (!eaten) {
      haptic("complete");
      setJustAte(true);
    } else setJustAte(false);
    setSaid(null);
    onEat(!eaten);
  };
  if (ask && !eaten) {
    return (
      <TintedCard tone="plan" icon={Flag} title="¿Hiciste la tarea prioritaria?" className="h-full" bodyClassName="gap-2.5!">
        <p className="text-[16px] font-bold tracking-[-0.02em]">{ritual.frogTitle}</p>
        <div role="group" aria-label="¿Hiciste la tarea prioritaria?" className="inline-flex w-fit gap-1 rounded-full border border-line bg-surface-2 p-1">
          <button type="button" onClick={eat} className="press inline-flex h-9 items-center rounded-full px-4 text-[13.5px] font-semibold text-muted hover:bg-surface hover:text-fg">
            Sí
          </button>
          <button
            type="button"
            aria-pressed={said === "no"}
            onClick={() => setSaid("no")}
            className="press inline-flex h-9 items-center rounded-full px-4 text-[13.5px] font-semibold text-muted hover:bg-surface hover:text-fg aria-pressed:bg-surface aria-pressed:text-[var(--st-fail-fg)] aria-pressed:shadow-[0_0_0_1px_var(--line)]"
          >
            No
          </button>
        </div>
        {said === "no" && (
          <p className="reveal text-[12.5px] text-muted">{ritual.frogTaskId ? "Mañana vuelve como candidata." : "Mañana lo podés volver a elegir."}</p>
        )}
      </TintedCard>
    );
  }
  return (
    <TintedCard
      tone={eaten ? "habitos" : "plan"}
      icon={Flag}
      title={eaten ? "Tarea prioritaria hecha" : "Tarea prioritaria"}
      meta={eaten ? hhmm.format(new Date(ritual.frogDoneAt!)) : "Lo primero del día"}
      progress={eaten ? 1 : null}
      className={cx("h-full", justAte && eaten && "ini-glow")}
      bodyClassName="gap-1.5!"
      action={
        <button
          type="button"
          aria-pressed={eaten}
          onClick={eat}
          className="press inline-flex min-h-9 items-center gap-1.5 rounded-full bg-surface py-1 pr-3 pl-1.5 text-[12.5px] font-semibold whitespace-nowrap text-[var(--head-fg)] shadow-[0_0_0_1px_var(--head-line)]"
        >
          <span
            className={cx(
              "inline-flex size-5 items-center justify-center rounded-full border-[1.5px] transition-colors",
              eaten ? "border-transparent bg-[var(--st-done-line)] text-white" : "border-line-strong",
            )}
          >
            {eaten && <Check size={11} weight="bold" aria-hidden className={justAte ? "check-draw" : undefined} />}
          </span>
          {eaten ? "Hecha" : "La hice"}
        </button>
      }
    >
      <p className={cx("text-[16px] font-bold tracking-[-0.02em] transition-colors", eaten && "text-muted line-through decoration-faint")}>{ritual.frogTitle}</p>
      {eaten ? (
        nextBlock && (
          <p className="text-[12.5px] text-muted">
            Lo que sigue: {nextBlock.title} a las {nextBlock.startTime}
          </p>
        )
      ) : ritual.frogTaskId ? (
        <Link href={`/enfoque?tarea=${ritual.frogTaskId}`} className="inline-flex min-h-11 w-fit items-center gap-1.5 text-[13px] font-medium text-muted hover:text-fg">
          <Timer size={15} aria-hidden /> Enfocarme
        </Link>
      ) : null}
    </TintedCard>
  );
}

// ─── Hoy ────────────────────────────────────────────────────────────────────

const TL_FROM = 8;
const TL_TO = 20;

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Un vistazo a hoy: los bloques de 8 a 20 en una línea (lista en el celular) y los hábitos que tocan. Solo para leer. */
function TodayStrip({ d, habits }: { d: Dashboard; habits: ProgressSource }) {
  const { done, total } = useSyncExternalStore(habits.subscribe, habits.get, habits.get);
  const blocks = d.plan.today;
  const real = blocks.filter((b) => !isFreeBlock(b));
  const span = (TL_TO - TL_FROM) * 60;
  // En la línea: los que tienen hora y caen (aunque sea en parte) entre las 8 y las 20.
  const timed = blocks
    .filter((b) => b.startTime)
    .map((b) => {
      const s = toMin(b.startTime!);
      const e = b.endTime && toMin(b.endTime) > s ? toMin(b.endTime) : s + 60;
      return { b, s, e };
    })
    .filter(({ s, e }) => e > TL_FROM * 60 && s < TL_TO * 60);
  // Los que se pisan van en otra fila (hasta 3).
  const lanes: number[] = [];
  const placed = timed.map((x) => {
    let lane = lanes.findIndex((end) => end <= x.s);
    if (lane === -1) lane = lanes.length < 3 ? lanes.length : lanes.indexOf(Math.min(...lanes));
    lanes[lane] = x.e;
    return { ...x, lane };
  });
  const laneCount = Math.max(1, lanes.length);
  const onLine = new Set(placed.map((p) => p.b.id));
  const rest = blocks.filter((b) => !onLine.has(b.id));
  const color = (b: (typeof blocks)[number]) => (b.category ? `var(--p-${b.category.color}-chip)` : "var(--c-plan)");

  return (
    <TintedCard
      icon={CalendarCheck}
      title="Hoy"
      meta={`${real.length ? `${real.length} ${real.length === 1 ? "bloque" : "bloques"}` : "Sin bloques"} · ${total} ${total === 1 ? "hábito" : "hábitos"}`}
      action={{ href: "/plan", label: "Ver el plan" }}
      className="lg:col-span-12"
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_200px] lg:items-center lg:gap-5">
        {blocks.length === 0 ? (
          <p className="text-[13.5px] text-muted">Nada planificado para hoy.</p>
        ) : (
          <>
            {/* Compu: la línea de 8 a 20. */}
            <div className="hidden min-w-0 gap-1.5 lg:grid">
              <div className="rit-tl relative rounded-[10px]" style={{ height: 14 + laneCount * 34 }}>
                {placed.map(({ b, s, e, lane }) => {
                  const left = (Math.max(0, s - TL_FROM * 60) / span) * 100;
                  const right = (Math.min(span, e - TL_FROM * 60) / span) * 100;
                  const free = isFreeBlock(b);
                  return (
                    <span
                      key={b.id}
                      title={`${b.startTime}${b.endTime ? `–${b.endTime}` : ""} · ${b.title}`}
                      className={cx(
                        "absolute flex h-[28px] min-w-0 items-center gap-1.5 overflow-hidden rounded-lg border px-2 text-[12px] font-semibold whitespace-nowrap",
                        free ? "free-block border-transparent text-fg" : "border-line bg-surface",
                        b.done && "text-muted line-through decoration-faint",
                      )}
                      style={{
                        left: `${left}%`,
                        width: `calc(${right - left}% - 3px)`,
                        top: 7 + lane * 34,
                        boxShadow: free ? undefined : `inset 3px 0 0 ${color(b)}`,
                      }}
                    >
                      <span className="truncate">{b.title}</span>
                    </span>
                  );
                })}
              </div>
              <div className="relative h-4 font-mono text-[10.5px] text-muted">
                {[8, 10, 12, 14, 16, 18, 20].map((h) => (
                  <span key={h} className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full" style={{ left: `${((h - TL_FROM) / (TL_TO - TL_FROM)) * 100}%` }}>
                    {h}
                  </span>
                ))}
              </div>
              {rest.length > 0 && (
                <p className="truncate text-[12.5px] text-muted">
                  {rest.some((b) => b.startTime) ? "Fuera de la línea" : "Sin hora"}: {rest.map((b) => (b.startTime ? `${b.title} (${b.startTime})` : b.title)).join(" · ")}
                </p>
              )}
            </div>
            {/* Celular: una lista. */}
            <ul className="grid gap-1.5 lg:hidden">
              {blocks.map((b) => {
                const free = isFreeBlock(b);
                return (
                  <li
                    key={b.id}
                    className={cx(
                      "grid grid-cols-[3.25rem_8px_minmax(0,1fr)] items-center gap-2.5 rounded-[10px] border px-2.5 py-2 text-[14px]",
                      free ? "free-row border-transparent" : "border-line bg-surface",
                    )}
                  >
                    <span className={cx("font-mono text-[12px] tabular", free ? "text-fg" : "text-muted")}>{b.startTime ?? "—"}</span>
                    <span aria-hidden className={cx("size-2 rounded-full", free && "invisible")} style={{ background: color(b) }} />
                    <span className={cx("truncate", b.done && "text-muted line-through decoration-faint")}>
                      {free && b.endTime ? `Libre hasta las ${b.endTime.replace(/^0/, "")}` : b.title}
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <a
          href="#habitos-hoy"
          className="grid gap-2 rounded-xl border border-[color-mix(in_oklab,var(--c-habitos)_18%,transparent)] bg-[color-mix(in_oklab,var(--c-habitos)_8%,var(--surface))] px-3 py-2.5 transition-[filter] hover:brightness-[0.98]"
        >
          <span className="flex items-center gap-1.5 text-[13.5px] font-semibold text-fg">
            <ListChecks size={16} aria-hidden className="text-[var(--c-habitos)]" />
            {total} {total === 1 ? "hábito" : "hábitos"} para hoy
          </span>
          {total > 0 && (
            <span aria-hidden className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${Math.min(total, 24)}, minmax(0, 1fr))` }}>
              {Array.from({ length: Math.min(total, 24) }, (_, i) => (
                <span
                  key={i}
                  className="h-1.5 rounded-full"
                  style={{ background: i < Math.round((done / total) * Math.min(total, 24)) ? "var(--c-habitos)" : "color-mix(in oklab, var(--c-habitos) 22%, transparent)" }}
                />
              ))}
            </span>
          )}
          <span className="flex items-center justify-between gap-2 text-[12px] text-muted">
            {total === 0 ? "Hoy no toca ninguno" : done === 0 ? "Ninguno marcado todavía" : done >= total ? "Día completo" : `${done} de ${total} hechos`}
            <ArrowRight size={13} aria-hidden />
          </span>
        </a>
      </div>
    </TintedCard>
  );
}

// ─── Logros recientes ───────────────────────────────────────────────────────

const WIN_LOOK: Record<Win["kind"], { icon: Icon; color: string }> = {
  journal: { icon: Fire, color: "var(--c-journal)" },
  habits: { icon: CheckCircle, color: "var(--c-habitos)" },
  goal: { icon: Target, color: "var(--c-plan)" },
  wheel: { icon: ChartPolar, color: "var(--mod-inicio)" },
  ritual: { icon: SunHorizon, color: "var(--p-orange-chip)" },
};

/** Tira de logros (calculados, no se guardan): solo los que tienen algo que decir. */
function Wins({ wins }: { wins: Win[] }) {
  if (!wins.length) return null;
  return (
    <section aria-label="Logros recientes" className="grid gap-2.5 lg:col-span-12">
      <p className="flex items-center gap-2 text-[14.5px] font-semibold lg:px-1">
        <Medal size={17} weight="fill" aria-hidden className="text-[var(--accent)]" />
        Logros recientes
      </p>
      {/* Siempre de a quintos en la compu: con menos logros, los cuadritos no se estiran. */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-5 lg:gap-3">
        {wins.map((w, i) => {
          const L = WIN_LOOK[w.kind];
          return (
            <Link
              key={w.kind}
              href={w.href}
              className={cx(
                "lift grid min-w-0 content-start gap-1 rounded-[14px] border border-line bg-surface px-3 py-2.5",
                wins.length % 2 === 1 && i === wins.length - 1 && "max-lg:col-span-2",
              )}
            >
              <span aria-hidden className="mb-0.5 inline-flex size-6 items-center justify-center rounded-lg text-white" style={{ background: L.color }}>
                <L.icon size={14} weight="bold" />
              </span>
              <span className={cx("text-fg", w.text ? "line-clamp-2 text-[14.5px] leading-snug font-[650] tracking-[-0.01em]" : "truncate font-mono text-[19px] leading-tight font-semibold tracking-[-0.02em]")}>
                {w.value}
              </span>
              <span className="text-[12px] leading-snug text-muted">{w.label}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
