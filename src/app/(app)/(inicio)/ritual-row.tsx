"use client";

import Link from "next/link";
import { useState } from "react";
import {
  CalendarCheck,
  CalendarPlus,
  Check,
  Flag,
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
  plan,
  summary,
  links,
}: {
  d: Dashboard;
  data: RitualData;
  /** La tarjeta "¿Cómo estás?" (va debajo del saludo, siempre en el mismo lugar del árbol). */
  checkin: React.ReactNode;
  /** "Plan de hoy" (va a la derecha, debajo de la tarea prioritaria; pedido de Facu 2026-11-14). */
  plan: React.ReactNode;
  /** La frase del resumen de siempre ("Llevás 2 de 6 hábitos…"). */
  summary: React.ReactNode;
  /** Las píldoras Revisión semanal / Análisis. */
  links: React.ReactNode;
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
      {/* A la derecha la tarea prioritaria y debajo "Plan de hoy", que se estira hasta el alto de
          la columna de la izquierda (el "Hoy" propio del ritual se sacó: repetía el Plan de hoy). */}
      <div className="flex min-w-0 flex-col gap-3.5 lg:col-span-5 lg:gap-5">
        {side}
        {plan}
      </div>
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
