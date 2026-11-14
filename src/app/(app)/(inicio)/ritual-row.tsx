"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import {
  ArrowRight,
  CalendarCheck,
  CalendarPlus,
  Check,
  Flag,
  ListChecks,
  PencilSimple,
  Timer,
} from "@phosphor-icons/react";
import { useSafeTransition } from "@/components/safe-action";
import { notifyError, notifyInfo } from "@/components/undo-toast";
import { haptic } from "@/components/haptics";
import { cx } from "@/components/ui";
import { TintedCard } from "@/components/tinted-card";
import { MenuButton } from "@/components/shell";
import { tone } from "@/lib/palette";
import { formatLong } from "@/lib/dates";
import type { Dashboard } from "@/lib/dashboard";
import { isFreeBlock } from "@/lib/plan-logic";
import { greeting } from "@/lib/journal-logic";
import {
  applyRitualPatch,
  emptyRitual,
  NIGHT_HOUR,
  ritualStage,
  type FrogCandidate,
  type RitualDTO,
  type RitualPatch,
} from "@/lib/ritual-logic";
import type { RitualData } from "@/lib/ritual";
import { saveRitual } from "@/lib/offline/ritual";
import { scheduleTask } from "@/lib/offline/plan";
import { CategoryTag } from "../plan/plan-ui";

type Progress = { done: number; total: number };
export type ProgressSource = { get: () => Progress; subscribe: (f: () => void) => () => void };

const hhmm = new Intl.DateTimeFormat("es-UY", { timeZone: "America/Montevideo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });


/**
 * Ritual matutino (diseño 3 "Tablero del día", 2026-11-14): la fila de arriba de Inicio.
 * A la izquierda el saludo y "¿Cómo estás?" (el check-in, que reemplazó a la misión del día);
 * a la derecha la tarea prioritaria; debajo un vistazo a hoy. Elegida (o con "Listo"), se
 * pliega: la tarea queda como tarjeta chica con "La hice" y el vistazo a hoy pasa debajo de
 * ella. A la noche pregunta si se hizo.
 */
export function RitualRow({
  d,
  data,
  checkin,
  summary,
  links,
  habits,
}: {
  d: Dashboard;
  data: RitualData;
  /** La tarjeta "¿Cómo estás?" (va debajo del saludo, siempre en el mismo lugar del árbol). */
  checkin: React.ReactNode;
  /** La frase del resumen de siempre ("Llevás 2 de 6 hábitos…"). */
  summary: React.ReactNode;
  /** Las píldoras Revisión semanal / Análisis. */
  links: React.ReactNode;
  /** El avance de hábitos de hoy (sigue los toques de la tarjeta de Hábitos). */
  habits: ProgressSource;
}) {
  const [ritual, setRitual] = useState<RitualDTO>(() => data.ritual ?? emptyRitual(d.today));
  // Se está eligiendo (o se tocó "Cambiar"): no se pliega solo mientras tanto.
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

  // La tarea que se ve: la elegida o, si no hay, la primera candidata (propuesta).
  const chosen = ritual.frogTitle ? { id: ritual.frogTaskId, title: ritual.frogTitle } : null;
  const proposal = data.candidates[0] ?? null;
  const frogPatch = (c: { id: string | null; title: string }): RitualPatch => ({ frogTaskId: c.id, frogTitle: c.title });

  // Desde las 19 h ya es "Buenas noches" (la pregunta de la noche arranca ahí).
  const title = `${d.hour >= NIGHT_HOUR ? "Buenas noches" : greeting(d.hour)}, Facu`;
  const morning = stage === "morning";

  let side: React.ReactNode;
  if (morning) {
    side = (
      <FrogCard
        d={d}
        candidates={data.candidates}
        chosen={chosen}
        onChoose={(c) => {
          setEditing(true);
          haptic("select");
          save(frogPatch(c));
        }}
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
    );
  } else if (stage === "skipped") {
    side = (
      <NoFrog
        text="Hoy salteaste el ritual."
        action="Armarlo igual"
        onAction={() => {
          setEditing(true);
          save({ skipped: false });
        }}
      />
    );
  } else if (chosen) {
    side = (
      <SmallFrog
        ritual={ritual}
        ask={stage === "night"}
        nextBlock={nextBlock(d)}
        onEat={(eaten) => save({ frogDoneAt: eaten ? new Date().toISOString() : null })}
        onChange={() => setEditing(true)}
      />
    );
  } else {
    side = <NoFrog text="Hoy sin tarea prioritaria." action="Elegir una" onAction={() => setEditing(true)} />;
  }

  // Mismo árbol en todos los estados (saludo y "¿Cómo estás?" a la izquierda, siempre en el
  // mismo lugar): cambiar de estado no vuelve a montar el check-in ni pierde lo que se guarda.
  return (
    <section aria-label="Ritual de la mañana" className="grid gap-3.5 max-lg:order-1 lg:col-span-12 lg:grid-cols-12 lg:gap-5">
      <div className="grid min-w-0 content-start gap-3.5 lg:col-span-7">
        <div className="flex min-w-0 flex-col gap-1.5 lg:gap-2 lg:px-1 lg:pt-1.5">
          <div className="flex items-center gap-2 max-lg:-ml-0.5">
            <MenuButton />
            <p className="kicker truncate">{formatLong(d.today)}</p>
          </div>
          <h1 className="display text-[32px] leading-[1.02] font-[750] tracking-[-0.04em] lg:text-[36px] xl:text-[44px]">{title}</h1>
          <p className="max-w-[34rem] text-[15px] leading-normal text-pretty text-muted lg:text-[16px]">
            {summary}
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5 lg:mt-2">{links}</div>
        </div>
        {checkin}
      </div>
      {/* A la mañana la tarjeta para elegir ocupa todo el alto; plegado, la tarjeta chica y
          debajo el vistazo a hoy (así la columna no queda con un hueco). */}
      <div className="flex min-w-0 flex-col gap-3.5 lg:col-span-5 lg:gap-5 lg:[&>*:last-child]:flex-1">
        {side}
        {!morning && <TodayStrip d={d} habits={habits} compact />}
      </div>
      {morning && <TodayStrip d={d} habits={habits} />}
    </section>
  );
}

/** El próximo bloque de hoy con hora que todavía no se hizo (desde la hora de la página). */
function nextBlock(d: Dashboard) {
  const now = `${String(d.hour).padStart(2, "0")}:00`;
  return d.plan.today.find((b) => b.startTime && b.startTime >= now && !b.done && !isFreeBlock(b)) ?? null;
}

// ─── La tarea prioritaria (el "sapo" en el código) ───────────────────────────

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
  onDone,
  onSkip,
}: {
  d: Dashboard;
  candidates: FrogCandidate[];
  chosen: { id: string | null; title: string } | null;
  onChoose: (c: { id: string | null; title: string }) => void;
  /** "Listo": queda armado (con la propuesta si no se eligió otra). */
  onDone: () => void;
  onSkip: () => void;
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
      <div className="mt-auto flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={onSkip}
          className="press inline-flex h-10 items-center rounded-full px-3.5 text-[13px] font-medium text-muted hover:bg-surface-2 hover:text-fg"
        >
          Saltar hoy
        </button>
        <button
          type="button"
          onClick={onDone}
          className="press inline-flex h-10 items-center gap-1.5 rounded-full bg-ink px-4 text-[13.5px] font-medium text-on-ink hover:opacity-90"
        >
          <Check size={14} weight="bold" aria-hidden /> Listo
        </button>
      </div>
    </TintedCard>
  );
}

/** Sin tarea prioritaria (salteado, o "Listo" sin ninguna): una línea y para elegir igual. */
function NoFrog({ text, action, onAction }: { text: string; action: string; onAction: () => void }) {
  return (
    <TintedCard tone="plan" icon={Flag} title="Tarea prioritaria" meta="Lo primero del día" bodyClassName="gap-2.5!">
      <p className="text-[13.5px] text-muted">{text}</p>
      <button
        type="button"
        onClick={onAction}
        className="press inline-flex h-10 w-fit items-center rounded-full border border-line-strong bg-surface px-4 text-[13.5px] font-semibold text-fg hover:bg-surface-2"
      >
        {action}
      </button>
    </TintedCard>
  );
}

/** La tarea prioritaria plegada (y a la noche, la pregunta): "La hice" la pasa a verde con la hora. */
function SmallFrog({
  ritual,
  ask,
  nextBlock,
  onEat,
  onChange,
}: {
  ritual: RitualDTO;
  ask: boolean;
  nextBlock: Dashboard["plan"]["today"][number] | null;
  onEat: (eaten: boolean) => void;
  /** "Cambiar": vuelve a la tarjeta para elegir otra. */
  onChange: () => void;
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
      <TintedCard tone="plan" icon={Flag} title="¿Hiciste la tarea prioritaria?" bodyClassName="gap-2.5!">
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
      className={cx(justAte && eaten && "ini-glow")}
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
      ) : (
        <div className="-mb-1.5 flex flex-wrap items-center gap-x-4">
          {ritual.frogTaskId && (
            <Link href={`/enfoque?tarea=${ritual.frogTaskId}`} className="inline-flex min-h-11 items-center gap-1.5 text-[13px] font-medium text-muted hover:text-fg">
              <Timer size={15} aria-hidden /> Enfocarme
            </Link>
          )}
          <button type="button" onClick={onChange} className="inline-flex min-h-11 items-center gap-1.5 text-[13px] font-medium text-muted hover:text-fg">
            <PencilSimple size={15} aria-hidden /> Cambiar
          </button>
        </div>
      )}
    </TintedCard>
  );
}

// ─── Hoy ────────────────────────────────────────────────────────────────────

const TL_FROM = 8;
const TL_TO = 20;

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/**
 * Un vistazo a hoy: los bloques de 8 a 20 en una línea (lista en el celular) y los hábitos que
 * tocan. Solo para leer. `compact`: en la columna angosta (ritual plegado), siempre la lista.
 */
function TodayStrip({ d, habits, compact = false }: { d: Dashboard; habits: ProgressSource; compact?: boolean }) {
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
      className={compact ? undefined : "lg:col-span-12"}
    >
      <div className={cx("grid gap-4", compact ? "flex-1 content-between" : "lg:grid-cols-[minmax(0,1fr)_200px] lg:items-center lg:gap-5")}>
        {blocks.length === 0 ? (
          <p className="text-[13.5px] text-muted">Nada planificado para hoy.</p>
        ) : (
          <>
            {/* Compu: la línea de 8 a 20. */}
            <div className={cx("hidden min-w-0 gap-1.5", !compact && "lg:grid")}>
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
            <ul className={cx("grid gap-1.5", !compact && "lg:hidden")}>
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

