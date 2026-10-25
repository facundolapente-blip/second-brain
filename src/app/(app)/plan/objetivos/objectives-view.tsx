"use client";

import { useSafeTransition } from "@/components/safe-action";
import { useOnNew } from "@/components/nav-add";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowsClockwise, CalendarBlank, CalendarPlus, CaretDown, Check, ClipboardText, Minus, Plus, Target, X } from "@phosphor-icons/react";
import { bumpObjective, carryOverKrs, copyToYear, dismissQuarterReview, writeQuarterReview } from "@/lib/offline/plan";
import { formatShort } from "@/lib/dates";
import {
  avgPct,
  krPct,
  krQuarters,
  effectiveKr,
  nextQuarter,
  previousQuarter,
  quarterRange,
  quarterReviewQuestions,
  reviewQuarter,
  type KeyResultDTO,
  type KrLinkOption,
  type KrStatus,
  type ObjectiveDTO,
  type Quarter,
} from "@/lib/plan-logic";
import { nextStep, rootsOf, splitPast, treePct, whenLabel } from "@/lib/objective-tree";
import { PageHeader } from "@/components/page-header";
import { useTick } from "@/components/motion";
import { notifyInfo } from "@/components/undo-toast";
import { Button, cx, Sheet, type SheetHandle } from "@/components/ui";
import { ProgressBar } from "../plan-ui";
import { TintedCard } from "@/components/tinted-card";
import { PlanTabs } from "../plan-nav";
import { KrSheet, ObjectiveForm, type KrSheetHandle } from "./objective-forms";

const fmtNum = (n: number) => n.toLocaleString("es-UY", { maximumFractionDigits: 2 });
/** Los objetivos importados de Notion traían un número adelante ("2 Mejorar mi salud"). */
const cleanTitle = (t: string) => t.replace(/^\d+\s+/, "");
const DOT: Record<KrStatus, string> = {
  done: "bg-[var(--st-done-line)]",
  doing: "bg-[var(--p-blue-chip)]",
  closed: "bg-[var(--p-yellow-chip)]",
  todo: "bg-line-strong",
};

/** "3/10" de un objetivo chico (si se mide solo, el valor del vínculo). */
function krFigure(raw: KeyResultDTO): string | null {
  const k = effectiveKr(raw);
  if (k.goal === null || k.goal === undefined) return null;
  return `${fmtNum(k.progress ?? 0)}/${fmtNum(k.goal)}`;
}

type Group = ObjectiveDTO & { loose?: boolean };

/**
 * Objetivos como árbol (2026-10-25): una tarjeta por objetivo grande con su avance y la
 * próxima tarea; tocarla abre su árbol (`/plan/objetivos/[id]`), donde se parte en objetivos
 * más chicos y tareas simples. Año y trimestre son datos opcionales, no pestañas.
 */
export function ObjectivesView({
  objectives,
  loose,
  links,
  today,
  year,
  years,
  reviewDismissed,
}: {
  objectives: ObjectiveDTO[];
  loose: KeyResultDTO[];
  links: KrLinkOption[];
  today: string;
  year: number;
  years: number[];
  reviewDismissed: string | null;
}) {
  const router = useRouter();
  const newSheet = useRef<SheetHandle>(null);
  const planSheet = useRef<SheetHandle>(null);
  const krSheet = useRef<KrSheetHandle>(null);
  const [newKey, setNewKey] = useState(0);
  const openNew = () => {
    setNewKey((k) => k + 1);
    newSheet.current?.open();
  };
  useOnNew(openNew);
  const nextYear = year + 1;

  const groups: Group[] = [
    ...objectives,
    ...(loose.length
      ? [{ id: "", title: "Sin objetivo", year, role: null, area: null, priority: 0, deadline: null, status: "doing" as KrStatus, progress: null, goal: null, focus: [], keyResults: loose, loose: true }]
      : []),
  ];

  // Revisión del trimestre: sola en su ventana (fin del trimestre y el mes siguiente) o a pedido.
  const auto = reviewQuarter(today);
  const autoKey = auto ? `${auto.year}-${auto.quarter}` : null;
  const [forcedReview, setForcedReview] = useState<{ year: number; quarter: Quarter } | null>(null);
  const review = forcedReview ?? (auto && auto.year === year && autoKey !== reviewDismissed ? auto : null);
  const prevQ = previousQuarter(today);
  const canAskReview = !review && prevQ.year === year;

  const pcts = objectives.map(treePct).filter((n): n is number => n !== null);
  const avg = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
  const roles = [...new Set(objectives.map((o) => o.role).filter((r): r is string => !!r))];
  const areas = [...new Set(objectives.map((o) => o.area).filter((r): r is string => !!r))];

  return (
    <>
      <div className="plan-head contents" data-w="96">
        <PageHeader
          title="Objetivos"
          wide
          tabs={<PlanTabs />}
          actions={
            <Button variant="accent" size="sm" className="max-lg:hidden" onClick={openNew}>
              <Plus size={16} weight="bold" /> Nuevo objetivo
            </Button>
          }
        />
      </div>
      <main className="mx-auto max-w-3xl px-4 pb-8 lg:max-w-[96rem] lg:px-10">
        {/* Un año por pestaña, como las hojas de Notion. */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-3 pb-1">
          <nav aria-label="Año" className="-mx-1 flex min-w-0 items-center gap-1.5 overflow-x-auto px-1">
            {years.map((y) => (
              <Link
                key={y}
                href={`/plan/objetivos?anio=${y}`}
                aria-current={y === year ? "page" : undefined}
                className={cx(
                  "inline-flex h-9 shrink-0 items-center rounded-full px-4 font-mono text-[13px] transition-colors",
                  y === year ? "bg-ink text-on-ink" : "text-muted hover:bg-surface-2 hover:text-fg",
                )}
              >
                {y}
              </Link>
            ))}
            <button
              type="button"
              onClick={() => planSheet.current?.open()}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-dashed border-line-strong px-3.5 text-[13px] text-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              <CalendarPlus size={15} aria-hidden /> Planificar {nextYear}
            </button>
          </nav>
          {canAskReview && (
            <button
              type="button"
              onClick={() => setForcedReview(prevQ)}
              className="inline-flex h-9 items-center rounded-full px-3.5 text-[13px] text-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              Revisar el {prevQ.quarter}
            </button>
          )}
        </div>

        {review && (
          <QuarterReview
            key={`${review.year}-${review.quarter}`}
            year={review.year}
            quarter={review.quarter}
            opened={forcedReview !== null}
            groups={groups}
            today={today}
            onOpen={(k) => krSheet.current?.open(k)}
            onClose={() => {
              const key = `${review.year}-${review.quarter}`;
              setForcedReview(null);
              if (key === autoKey) dismissQuarterReview(key);
            }}
          />
        )}

        <TintedCard
          icon={Target}
          title={`Objetivos ${year}`}
          className="mt-4"
          meta={objectives.length ? `${objectives.length} ${objectives.length === 1 ? "objetivo" : "objetivos"}${avg !== null ? ` · ${avg}% de avance` : ""}` : "Todavía ninguno"}
          progress={avg !== null ? avg / 100 : undefined}
          action={
            <button type="button" className="tcard-pill press" onClick={openNew}>
              <Plus size={14} weight="bold" aria-hidden /> Objetivo
            </button>
          }
        >
          {objectives.length === 0 ? (
            <div className="grid justify-items-start gap-3 py-3">
              <p className="max-w-[48ch] text-[15px] text-muted">
                Escribí lo que querés lograr en {year}, como te salga. Después lo partís en objetivos más chicos y en tareas simples.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="accent" size="sm" onClick={openNew}>
                  <Plus size={15} /> Nuevo objetivo
                </Button>
                {years.some((y) => y < year) && (
                  <Link
                    href={`/plan/objetivos?anio=${Math.max(...years.filter((y) => y < year))}`}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line-strong px-3.5 text-[13px] font-medium text-fg transition-colors hover:bg-surface-2"
                  >
                    <CalendarPlus size={15} aria-hidden /> Traer de {Math.max(...years.filter((y) => y < year))}
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {objectives.map((o) => (
                <li key={o.id}>
                  <ObjectiveCard o={o} today={today} />
                </li>
              ))}
              <li>
                <button
                  type="button"
                  onClick={openNew}
                  className="press grid h-full min-h-32 w-full content-center justify-items-start gap-1 rounded-2xl border border-dashed border-line-strong px-5 py-4 text-left transition-colors hover:bg-surface-2"
                >
                  <span className="inline-flex items-center gap-1.5 text-[15px] font-medium">
                    <Plus size={16} weight="bold" aria-hidden /> Nuevo objetivo
                  </span>
                  <span className="text-[13px] text-muted">Escribilo como quieras</span>
                </button>
              </li>
            </ul>
          )}

          {loose.length > 0 && (
            <section className="mt-5 grid gap-1.5 border-t border-line pt-4">
              <h3 className="kicker">Objetivos chicos sin objetivo grande</h3>
              <ul className="grid">
                {loose.map((k) => (
                  <li key={k.id}>
                    <button
                      type="button"
                      onClick={() => krSheet.current?.open(k)}
                      className="flex min-h-11 w-full items-center gap-2 rounded-lg px-1 text-left text-[14px] hover:bg-surface-2"
                    >
                      <span aria-hidden className={cx("size-2 shrink-0 rounded-full", DOT[k.status])} />
                      <span className="min-w-0 flex-1 truncate">{k.title}</span>
                      {krFigure(k) && <span className="font-mono text-[12px] text-muted tabular">{krFigure(k)}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </TintedCard>
      </main>

      <Sheet ref={newSheet} title={`Nuevo objetivo ${year}`}>
        <ObjectiveForm
          key={newKey}
          objective={null}
          year={year}
          roles={roles}
          areas={areas}
          onDone={() => newSheet.current?.close()}
          onCreated={(id) => router.push(`/plan/objetivos/${id}`)}
        />
      </Sheet>
      <KrSheet ref={krSheet} objectives={objectives} links={links} year={year} />
      <Sheet ref={planSheet} title={`Planificar ${nextYear}`}>
        <PlanYearForm objectives={objectives} loose={loose} from={year} to={nextYear} onDone={() => planSheet.current?.close()} />
      </Sheet>
    </>
  );
}

/** Una tarjeta por objetivo grande: su avance, cuánto falta y la próxima tarea. Tocarla abre su árbol. */
function ObjectiveCard({ o, today }: { o: ObjectiveDTO; today: string }) {
  const pct = treePct(o);
  // Los de trimestres que ya pasaron no cuentan como "por hacer".
  const roots = splitPast(rootsOf(o.keyResults), o.year, today).now;
  const steps = o.keyResults.flatMap((k) => k.steps);
  const doneSteps = steps.filter((s) => s.done).length;
  const next = nextStep(o, today);
  const ownGoalOnly = !!o.goal && o.keyResults.length === 0;
  const late = o.deadline !== null && o.deadline < today && o.status !== "done";
  return (
    <article className="lift plan-hover relative grid h-full content-start gap-2.5 rounded-2xl border border-line px-5 py-4">
      <div className="flex items-center gap-2">
        <span className="kicker min-w-0 flex-1 truncate">{o.role ?? o.area ?? "Objetivo"}</span>
        {o.deadline && (
          <span className={cx("shrink-0 font-mono text-[11px] tabular", late ? "text-danger" : "text-muted")}>hasta {formatShort(o.deadline)}</span>
        )}
      </div>
      <h3 className="line-clamp-3 text-[16px] leading-snug font-semibold">
        <Link href={`/plan/objetivos/${o.id}`} className="after:absolute after:inset-0 after:rounded-2xl after:content-['']">
          {cleanTitle(o.title)}
        </Link>
      </h3>
      {pct !== null && <ProgressBar pct={pct} label={`${pct}%`} />}
      {ownGoalOnly ? (
        <div className="flex items-center justify-between gap-3 text-[13px] text-muted">
          <span>
            {fmtNum(o.progress ?? 0)} de {fmtNum(o.goal ?? 0)}
          </span>
          <GoalStepper o={o} />
        </div>
      ) : o.keyResults.length === 0 ? (
        <p className="inline-flex items-center gap-1 text-[13px] font-medium text-accent-fg">
          Partilo en objetivos más chicos <ArrowRight size={13} aria-hidden />
        </p>
      ) : (
        <p className="text-[13px] text-muted">
          {roots.length} {roots.length === 1 ? "objetivo chico" : "objetivos chicos"}
          {steps.length ? ` · ${doneSteps}/${steps.length} tareas` : " · sin tareas todavía"}
        </p>
      )}
      {next && (
        <p className="flex items-center gap-1.5 border-t border-line pt-2.5 text-[13px]">
          <span className="shrink-0 text-muted">Próximo:</span>
          <span className="min-w-0 flex-1 truncate">{next.title}</span>
          {next.date && (
            <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[11.5px] text-muted">
              <CalendarBlank size={12} aria-hidden />
              {whenLabel(next.date, next.startTime, today)}
            </span>
          )}
        </p>
      )}
    </article>
  );
}


/** −1 / +1 de la meta propia de un objetivo. */
function GoalStepper({ o }: { o: Group }) {
  const [, start] = useSafeTransition();
  const [value, setValue] = useState(o.progress ?? 0);
  const [from, setFrom] = useState(o.progress);
  if (from !== o.progress) {
    setFrom(o.progress);
    setValue(o.progress ?? 0);
  }
  const goal = o.goal ?? 0;
  const tick = useTick(value);
  const bump = (d: 1 | -1) => {
    const next = Math.max(0, Math.min(goal, value + d));
    if (next === value) return;
    setValue(next);
    start(() => bumpObjective(o.id, d));
  };
  return (
    <span className="relative z-10 ml-auto inline-flex shrink-0 items-center rounded-full border border-line-strong">
      <button type="button" onClick={() => bump(-1)} aria-label={`Restar uno a ${cleanTitle(o.title)}`} className="inline-flex size-11 items-center justify-center rounded-full text-muted hover:text-fg">
        <Minus size={14} />
      </button>
      <span className="min-w-6 overflow-hidden text-center font-mono text-[13px] tabular" aria-live="polite">
        <span key={tick.key} className={tick.className}>
          {fmtNum(value)}
        </span>
      </span>
      <button type="button" onClick={() => bump(1)} aria-label={`Sumar uno a ${cleanTitle(o.title)}`} className="inline-flex size-11 items-center justify-center rounded-full text-muted hover:text-fg">
        <Plus size={14} />
      </button>
    </span>
  );
}

// ─── Revisión del trimestre ─────────────────────────────────────────────────

/**
 * Al terminar un trimestre: qué resultados clave avanzaron, cuáles quedaron sin
 * terminar, el avance de cada objetivo y tres preguntas. "Llevar al Qn" copia lo
 * que no se terminó al trimestre siguiente; "Escribir la revisión" abre el journal.
 */
function QuarterReview({
  year,
  quarter,
  groups,
  today,
  opened,
  onOpen,
  onClose,
}: {
  year: number;
  quarter: Quarter;
  /** Abierta con "Revisar el Qn": entra desplegándose (la que aparece sola al cargar, no). */
  opened: boolean;
  groups: Group[];
  today: string;
  onOpen: (k: KeyResultDTO) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useSafeTransition();
  const [carried, setCarried] = useState<string | null>(null);
  // Al cerrarla se pliega (alto y opacidad) y recién después sale de la página.
  const [closing, setClosing] = useState(false);
  // En el celular arranca plegada en una línea (ocupaba toda la primera pantalla); abierta a pedido sí se ve.
  const [unfolded, setUnfolded] = useState(opened);
  function close() {
    setClosing(true);
    setTimeout(onClose, 220);
  }
  const rows = groups
    .map((g) => ({ g, krs: g.keyResults.filter((k) => krQuarters(k).includes(quarter)) }))
    .filter((r) => r.krs.length);
  const all = rows.flatMap((r) => r.krs);
  const unfinished = all.filter((k) => k.status !== "done");
  const avg = avgPct(all) ?? 0;
  const next = nextQuarter(year, quarter);
  const { to } = quarterRange(year, quarter);
  const ended = to < today;
  const questions = quarterReviewQuestions(unfinished.length, next.quarter);

  return (
    <div className="fold" data-closed={closing || undefined}>
    <div className="plan-fold-shadow">
    <TintedCard
      icon={ClipboardText}
      title={`Revisión del ${quarter} ${year}`}
      className={cx("mt-4 max-lg:mt-3", opened && "reveal")}
      meta={`${ended ? "Cerró" : "Cierra"} el ${formatShort(to)}${all.length > 0 ? ` · ${unfinished.length === 0 ? "todo terminado" : `${unfinished.length} sin terminar`}` : ""}`}
      progress={all.length > 0 ? avg / 100 : undefined}
      bodyClassName="p-0! gap-0!"
      action={
        <span className="flex items-center gap-1.5">
          {/* Celular: arranca plegada en la cabecera (ocupaba toda la primera pantalla); abierta a pedido sí se ve. */}
          <button
            type="button"
            onClick={() => setUnfolded((u) => !u)}
            aria-expanded={unfolded}
            aria-controls="revision-trimestre"
            aria-label={unfolded ? "Plegar la revisión" : "Ver la revisión"}
            className="tcard-pill press size-9 justify-center px-0! lg:hidden!"
          >
            <CaretDown size={15} weight="bold" aria-hidden className={cx("transition-transform duration-[var(--dur-state)] ease-[var(--ease-out)]", !unfolded && "-rotate-90")} />
          </button>
          <button type="button" onClick={close} aria-label="Cerrar la revisión" className="tcard-pill press size-9 justify-center px-0!">
            <X size={15} weight="bold" aria-hidden />
          </button>
        </span>
      }
    >
    <div id="revision-trimestre" className="fold fold-mobile" data-closed={!unfolded || undefined}>
    <div>
    <div className="grid gap-5 px-[18px] py-[18px] lg:px-7 lg:py-6">
      {all.length > 0 && (
        <dl className="flex gap-6">
          <div className="grid">
            <dd className="figure text-[28px] leading-none">{avg}%</dd>
            <dt className="text-[12.5px] text-muted">avance promedio</dt>
          </div>
          <div className="grid">
            <dd className="figure text-[28px] leading-none text-[var(--st-done-fg)]">{all.length - unfinished.length}</dd>
            <dt className="text-[12.5px] text-muted">terminados</dt>
          </div>
          <div className="grid">
            <dd className="figure text-[28px] leading-none text-accent-fg">{unfinished.length}</dd>
            <dt className="text-[12.5px] text-muted">sin terminar</dt>
          </div>
        </dl>
      )}

      {all.length === 0 ? (
        <p className="text-[13.5px] text-muted">El {quarter} no tuvo resultados clave.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start">
          <div className="grid gap-5">
            {rows.map(({ g, krs }) => {
              const pct = avgPct(krs);
              return (
                <div key={g.id || "loose"} className="grid gap-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-[15px] font-semibold">{cleanTitle(g.title)}</h3>
                    {pct !== null && <span className="font-mono text-[12px] text-muted tabular">{pct}%</span>}
                  </div>
                  {pct !== null && (
                    <span className="h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                      <span className="bar-anim block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                    </span>
                  )}
                  <ul className="grid">
                    {krs.map((k) => {
                      const p = krPct(k);
                      return (
                        <li key={k.id} className="border-b border-line last:border-b-0">
                          <button type="button" onClick={() => onOpen(k)} className="flex min-h-11 w-full items-center gap-3 py-1.5 text-left text-[14px] hover:bg-surface-2/50">
                            <ReviewIcon kr={k} />
                            <span className="min-w-0 flex-1">
                              {k.title}
                              {k.auto && <span className="text-[12px] text-muted"> · se mide solo, {k.auto.label}</span>}
                            </span>
                            {p !== null && (
                              <span className="flex w-36 shrink-0 items-center gap-2 max-sm:w-24">
                                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                                  <span
                                    className={cx("bar-anim block h-full rounded-full", k.status === "done" ? "bg-[var(--st-done-line)]" : "bg-accent")}
                                    style={{ width: `${p}%` }}
                                  />
                                </span>
                                <span className="w-10 text-right font-mono text-[11.5px] text-muted tabular">{krFigure(k) ?? `${p}%`}</span>
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
          <div className="grid gap-3 rounded-2xl bg-surface-2 p-5">
            <h3 className="kicker">Para pensar</h3>
            <ol className="grid list-decimal gap-2 pl-5 text-[14px] leading-snug">
              {questions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ol>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button variant="accent" size="sm" disabled={pending} onClick={() => start(() => writeQuarterReview(year, quarter, unfinished.length))}>
                Escribir la revisión
              </Button>
              {/* Lo llevado queda confirmado ahí mismo (la tilde se dibuja), además del aviso de abajo. */}
              {carried && (
                <span role="status" className="reveal inline-flex h-9 items-center gap-1.5 px-1 text-[13.5px] font-medium text-[var(--st-done-fg)]">
                  <Check size={15} weight="bold" aria-hidden className="check-draw" />
                  {carried}
                </span>
              )}
              {unfinished.length > 0 && !carried && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await carryOverKrs({ krIds: unfinished.map((k) => k.id), year: next.year, quarter: next.quarter });
                      if (!r.ok) return;
                      const n = "count" in r && typeof r.count === "number" ? r.count : unfinished.length;
                      const msg = n ? `${n} llevados al ${next.quarter}${next.year !== year ? ` ${next.year}` : ""}` : `Ya estaban en el ${next.quarter}`;
                      setCarried(msg);
                      notifyInfo(msg);
                      if (next.year !== year) router.refresh();
                    })
                  }
                >
                  Llevar {unfinished.length} al {next.quarter}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
    </div>
    </TintedCard>
    </div>
    </div>
  );
}

function ReviewIcon({ kr }: { kr: KeyResultDTO }) {
  const base = "inline-flex size-6 shrink-0 items-center justify-center rounded-md";
  if (kr.status === "done")
    return (
      <span className={cx(base, "bg-[var(--p-green-chip)] text-[var(--p-green-chip-fg)]")} title="Terminado">
        <Check size={14} weight="bold" aria-hidden />
        <span className="sr-only">Terminado</span>
      </span>
    );
  if (kr.auto)
    return (
      <span className={cx(base, "bg-[var(--p-blue-chip)] text-[var(--p-blue-chip-fg)]")} title="Se mide solo">
        <ArrowsClockwise size={13} weight="bold" aria-hidden />
        <span className="sr-only">Se mide solo</span>
      </span>
    );
  return (
    <span className={cx(base, "bg-[var(--p-orange-chip)] text-[var(--p-orange-chip-fg)] font-mono text-[13px] font-bold")} title="Sin terminar">
      <span aria-hidden>!</span>
      <span className="sr-only">Sin terminar</span>
    </span>
  );
}

/**
 * "Planificar el año que viene": se eligen los objetivos y resultados clave que se
 * repiten y se copian sin empezar, con la fecha corrida un año. Después se editan.
 */
function PlanYearForm({
  objectives,
  loose,
  from,
  to,
  onDone,
}: {
  objectives: ObjectiveDTO[];
  loose: KeyResultDTO[];
  from: number;
  to: number;
  onDone: () => void;
}) {
  const router = useRouter();
  const [objs, setObjs] = useState<Set<string>>(new Set());
  const [krs, setKrs] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useSafeTransition();
  const toggle = (set: Set<string>, id: string) => {
    const n = new Set(set);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  };
  const toggleObjective = (o: ObjectiveDTO) => {
    const on = !objs.has(o.id);
    setObjs((s) => toggle(s, o.id));
    // Marcar el objetivo marca sus resultados clave (después se pueden sacar).
    setKrs((s) => {
      const n = new Set(s);
      for (const k of o.keyResults) {
        if (on) n.add(k.id);
        else n.delete(k.id);
      }
      return n;
    });
  };
  const groups = [...objectives.map((o) => ({ id: o.id, title: o.title, keyResults: o.keyResults })), ...(loose.length ? [{ id: "", title: "Sin objetivo", keyResults: loose }] : [])];
  const count = objs.size + krs.size;

  return (
    <div className="grid gap-4">
      <p className="text-[13.5px] leading-relaxed text-muted">
        Elegí qué de {from} querés repetir en {to}. Se copia sin empezar y sin progreso, con las fechas corridas un año, y después lo
        editás. {from} queda como está.
      </p>
      {groups.length === 0 ? (
        <p className="rounded-xl bg-surface-2 p-3 text-[13px] text-muted">
          {from} no tiene objetivos. Podés arrancar {to} de cero con &quot;Objetivo&quot;.
        </p>
      ) : (
        <ul className="grid max-h-[55dvh] gap-3 overflow-y-auto">
          {groups.map((o) => (
            <li key={o.id || "loose"} className="grid gap-1 rounded-xl border border-line p-2">
              {o.id ? (
                <label className="flex min-h-10 cursor-pointer items-center gap-2.5 px-1 font-medium">
                  <input
                    type="checkbox"
                    checked={objs.has(o.id)}
                    onChange={() => toggleObjective(objectives.find((x) => x.id === o.id)!)}
                    className="size-4 accent-[var(--accent)]"
                  />
                  {cleanTitle(o.title)}
                </label>
              ) : (
                <span className="kicker px-1 pt-1">Sin objetivo</span>
              )}
              {o.keyResults.map((k) => (
                <label key={k.id} className="flex min-h-9 cursor-pointer items-center gap-2.5 pl-7 text-[13.5px] text-muted">
                  <input type="checkbox" checked={krs.has(k.id)} onChange={() => setKrs((s) => toggle(s, k.id))} className="size-4 accent-[var(--accent)]" />
                  <span className="min-w-0 truncate">{k.title}</span>
                  {k.quarters.length > 0 && <span className="ml-auto shrink-0 font-mono text-[11px]">{k.quarters.join(", ")}</span>}
                </label>
              ))}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="reveal text-sm text-danger">{error}</p>}
      <div className="grid gap-2">
        <Button
          variant="accent"
          className="h-11"
          disabled={pending || count === 0}
          onClick={() =>
            start(async () => {
              const r = await copyToYear({ to, objectiveIds: [...objs], krIds: [...krs] });
              if (!r.ok) return setError(r.error);
              onDone();
              router.push(`/plan/objetivos?anio=${to}`);
            })
          }
        >
          {pending ? "Copiando…" : count ? `Copiar a ${to}` : "Elegí qué copiar"}
        </Button>
        <Button
          variant="ghost"
          className="h-11"
          onClick={() => {
            onDone();
            router.push(`/plan/objetivos?anio=${to}`);
          }}
        >
          Empezar {to} de cero
        </Button>
      </div>
    </div>
  );
}
