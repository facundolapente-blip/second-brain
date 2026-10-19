"use client";

import { safeForm, useSafeTransition } from "@/components/safe-action";
import { useOnNew } from "@/components/nav-add";
import { forwardRef, useActionState, useEffect, useEffectEvent, useImperativeHandle, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowsClockwise, CalendarPlus, CaretDown, Check, Lightning, Minus, PencilSimple, Plus, X } from "@phosphor-icons/react";
import {
  bumpObjective,
  carryOverKrs,
  copyToYear,
  deleteKeyResult,
  deleteObjective,
  dismissQuarterReview,
  saveKeyResult,
  saveObjective,
  writeQuarterReview,
} from "@/lib/offline/plan";
import { formatShort } from "@/lib/dates";
import {
  avgPct,
  daysLeft,
  daysLeftLabel,
  isFinishedKr,
  KR_STATUS,
  krPct,
  krQuarters,
  effectiveKr,
  nextQuarter,
  OBJECTIVES_VIEW_COOKIE,
  objectivePct,
  previousQuarter,
  QUARTERS,
  quarterOf,
  quarterRange,
  quarterReviewQuestions,
  reviewQuarter,
  type KeyResultDTO,
  type KrLinkOption,
  type KrStatus,
  type ObjectiveDTO,
  type Quarter,
} from "@/lib/plan-logic";
import { PageHeader } from "@/components/page-header";
import { useSlide, useTick } from "@/components/motion";
import { PillSwitch } from "@/components/pill-switch";
import { notifyInfo } from "@/components/undo-toast";
import { Button, ConfirmButton, cx, Field, Input, inputClass, Segmented, Sheet, type SheetHandle } from "@/components/ui";
import { PriorityDots, PriorityPicker, ProgressBar, StatusPill } from "../plan-ui";
import { PlanTabs } from "../plan-nav";

export type ObjectivesLayout = "mapa" | "rol";

const fmtNum = (n: number) => n.toLocaleString("es-UY", { maximumFractionDigits: 2 });
/** "1 Generar constancia produciendo" → sin el número con el que Notion los ordenaba. */
const cleanTitle = (t: string) => t.replace(/^\d+\s+/, "");
const QUARTER_MONTHS: Record<Quarter, string> = { Q1: "ene–mar", Q2: "abr–jun", Q3: "jul–set", Q4: "oct–dic" };

/** Color del punto de un resultado clave según su estado (la palabra va en el título). */
const DOT: Record<KrStatus, string> = {
  done: "bg-[var(--p-green-chip)]",
  doing: "bg-[var(--p-blue-chip)]",
  closed: "bg-[var(--p-yellow-chip)]",
  todo: "bg-[var(--faint)]",
};

/** Lo que se ve al lado del nombre: "4/4", "15k/120k", "61%". */
function krFigure(raw: KeyResultDTO): string | null {
  const k = effectiveKr(raw);
  if (raw.auto && raw.kind === "habit") return `${Math.round(k.progress ?? 0)}%`;
  if (k.goal === null) return null;
  const short = (n: number) => (n >= 10000 ? `${fmtNum(Math.round(n / 1000))}k` : fmtNum(n));
  return `${short(k.progress ?? 0)}/${short(k.goal)}`;
}

/** "31 dic", con el año si no es el de hoy ("31 dic 2025"). */
const shortDate = (iso: string, today: string) => (iso.slice(0, 4) === today.slice(0, 4) ? formatShort(iso) : `${formatShort(iso)} ${iso.slice(0, 4)}`);

const isLate = (k: KeyResultDTO, today: string) => !isFinishedKr(k) && k.deadline !== null && k.deadline < today;

/** Grupos para dibujar: los objetivos y, si hay, "Sin objetivo" con los sueltos. */
type Group = ObjectiveDTO & { loose?: boolean };

export function ObjectivesView({
  objectives,
  loose,
  links,
  today,
  year,
  years,
  initialLayout,
  reviewDismissed,
}: {
  objectives: ObjectiveDTO[];
  loose: KeyResultDTO[];
  links: KrLinkOption[];
  today: string;
  year: number;
  years: number[];
  initialLayout: ObjectivesLayout;
  reviewDismissed: string | null;
}) {
  const [layout, setLayoutState] = useState<ObjectivesLayout>(initialLayout);
  const [swapped, setSwapped] = useState(false);
  const setLayout = (v: ObjectivesLayout) => {
    setSwapped(true);
    setLayoutState(v);
    document.cookie = `${OBJECTIVES_VIEW_COOKIE}=${v}; path=/plan; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  };
  const sheet = useRef<KrSheetHandle>(null);
  useOnNew(() => sheet.current?.open());
  const objSheet = useRef<SheetHandle>(null);
  const planSheet = useRef<SheetHandle>(null);
  const detailSheet = useRef<SheetHandle>(null);
  const [editingObj, setEditingObj] = useState<ObjectiveDTO | null>(null);
  const [objKey, setObjKey] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(null);
  const nextYear = year + 1;

  const groups: Group[] = [
    ...objectives,
    ...(loose.length
      ? [{ id: "", title: "Sin objetivo", year, role: null, area: null, priority: 0, deadline: null, status: "doing" as KrStatus, progress: null, goal: null, keyResults: loose, loose: true }]
      : []),
  ];
  const currentYear = Number(today.slice(0, 4));
  const nowQ = year === currentYear ? quarterOf(today) : null;

  // Revisión del trimestre: sola en su ventana (fin del trimestre y el mes siguiente) o a pedido.
  const auto = reviewQuarter(today);
  const autoKey = auto ? `${auto.year}-${auto.quarter}` : null;
  const [forcedReview, setForcedReview] = useState<{ year: number; quarter: Quarter } | null>(null);
  const review = forcedReview ?? (auto && auto.year === year && autoKey !== reviewDismissed ? auto : null);
  const prevQ = previousQuarter(today);
  const canAskReview = !review && prevQ.year === year;

  function openObjective(o: ObjectiveDTO | null) {
    detailSheet.current?.close();
    setEditingObj(o);
    setObjKey((k) => k + 1);
    objSheet.current?.open();
  }
  function openDetail(id: string) {
    setDetailId(id);
    detailSheet.current?.open();
  }
  function planKr(objectiveId: string, quarter?: Quarter) {
    detailSheet.current?.close();
    sheet.current?.open(undefined, { objectiveId, quarter });
  }
  function openKr(k: KeyResultDTO) {
    detailSheet.current?.close();
    sheet.current?.open(k);
  }
  const detail = groups.find((g) => (g.id || "loose") === detailId) ?? null;

  return (
    <>
      <div className="plan-head contents" data-w="96">
      <PageHeader
        title="Objetivos"
        wide
        tabs={<PlanTabs />}
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => openObjective(null)}>
              <Plus size={16} weight="bold" /> Objetivo
            </Button>
            <Button variant="accent" size="sm" className="max-lg:hidden" onClick={() => sheet.current?.open()}>
              <Plus size={16} weight="bold" /> Nuevo resultado
            </Button>
          </>
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
          <div className="flex items-center gap-2">
            {canAskReview && (
              <button
                type="button"
                onClick={() => {
                  setSwapped(true);
                  setForcedReview(prevQ);
                }}
                className="inline-flex h-9 items-center rounded-full px-3.5 text-[13px] text-muted transition-colors hover:bg-surface-2 hover:text-fg"
              >
                Revisar el {prevQ.quarter}
              </button>
            )}
            <PillSwitch
              label="Cómo ver los objetivos"
              value={layout}
              onChange={setLayout}
              options={[
                { value: "mapa", label: "Mapa del año" },
                { value: "rol", label: "Por rol" },
              ]}
            />
          </div>
        </div>

        {review && (
          <QuarterReview
            key={`${review.year}-${review.quarter}`}
            year={review.year}
            quarter={review.quarter}
            opened={forcedReview !== null}
            groups={groups}
            today={today}
            onOpen={openKr}
            onClose={() => {
              const key = `${review.year}-${review.quarter}`;
              setForcedReview(null);
              if (key === autoKey) dismissQuarterReview(key);
            }}
          />
        )}

        {groups.length === 0 ? (
          <div className="mt-4 grid justify-items-start gap-3 border-y border-line py-8">
            <p className="display text-[20px] text-muted">Todavía no hay objetivos para {year}.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => openObjective(null)}>
                <Plus size={15} /> Nuevo objetivo
              </Button>
              {/* "Planificar" copia del año que se mira al siguiente: para traer algo, se va al año anterior. */}
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
          <div key={layout} className={cx("pt-4", swapped && "swap")}>
            {layout === "mapa" ? (
              <YearMap groups={groups} today={today} year={year} nowQ={nowQ} onOpenObjective={openDetail} onOpenKr={openKr} onPlan={planKr} />
            ) : (
              <RoleCards groups={groups} today={today} nowQ={nowQ} onOpenObjective={openDetail} onPlan={planKr} />
            )}
          </div>
        )}
      </main>

      <KrSheet ref={sheet} objectives={objectives} links={links} year={year} />

      <Sheet ref={detailSheet} title={detail ? cleanTitle(detail.title) : "Objetivo"} wide>
        {detail && (
          <ObjectiveDetail
            objective={detail}
            today={today}
            onOpenKr={openKr}
            onEdit={() => !detail.loose && openObjective(objectives.find((o) => o.id === detail.id) ?? null)}
            onAdd={() => planKr(detail.id, nowQ ?? undefined)}
          />
        )}
      </Sheet>

      <Sheet ref={objSheet} title={editingObj ? "Editar objetivo" : `Nuevo objetivo ${year}`}>
        <ObjectiveForm
          key={objKey}
          objective={editingObj}
          year={year}
          roles={[...new Set(objectives.map((o) => o.role).filter((r): r is string => !!r))]}
          areas={[...new Set(objectives.map((o) => o.area).filter((r): r is string => !!r))]}
          onDone={() => objSheet.current?.close()}
        />
      </Sheet>

      <Sheet ref={planSheet} title={`Planificar ${nextYear}`}>
        <PlanYearForm objectives={objectives} loose={loose} from={year} to={nextYear} onDone={() => planSheet.current?.close()} />
      </Sheet>
    </>
  );
}

// ─── Encabezado de un objetivo (rol, nombre, avance) ────────────────────────

function ObjectiveHead({ o, onOpen }: { o: Group; onOpen: () => void }) {
  const pct = objectivePct(o);
  const label = o.goal ? `${fmtNum(o.progress ?? 0)}/${fmtNum(o.goal)}` : pct !== null ? `${pct}%` : null;
  return (
    <button type="button" onClick={onOpen} className="grid w-full min-w-0 gap-1 text-left">
      <span className="kicker truncate">{o.loose ? "Sueltos" : (o.role ?? o.area ?? "Objetivo")}</span>
      <span className="text-[15px] leading-snug font-semibold text-fg">{cleanTitle(o.title)}</span>
      {pct !== null && (
        <span className="flex items-center gap-2 pt-1.5">
          <ProgressBar pct={pct} />
          <span className="shrink-0 font-mono text-[11.5px] text-muted tabular">{label}</span>
        </span>
      )}
    </button>
  );
}

/** Un resultado clave en una celda: punto de estado, nombre y cifra. */
function KrItem({ kr, today, onOpen }: { kr: KeyResultDTO; today: string; onOpen: () => void }) {
  const fig = krFigure(kr);
  const late = isLate(kr, today);
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        title={`${KR_STATUS[kr.status].label}${kr.auto ? ` · se mide solo: ${kr.auto.label}` : ""}`}
        className="-mx-1.5 flex w-[calc(100%+0.75rem)] items-start gap-2 rounded-md px-1.5 py-1 text-left text-[13.5px] leading-snug transition-colors hover:bg-surface-2"
      >
        <span aria-hidden className={cx("mt-[0.4em] size-2 shrink-0 rounded-full", DOT[kr.status])} />
        <span className="min-w-0">
          <span className={cx(kr.status === "done" && "text-muted")}>{kr.title}</span>
          <span className="sr-only">, {KR_STATUS[kr.status].label}</span>
          {fig && <span className="ml-1.5 font-mono text-[12px] text-muted tabular">{fig}</span>}
          {late && <span className="ml-1.5 text-[12px] text-danger">vencido</span>}
          {kr.auto && <ArrowsClockwise size={12} aria-hidden className="ml-1 inline text-muted" />}
        </span>
      </button>
    </li>
  );
}

function Legend() {
  const items: [KrStatus, string][] = [
    ["done", "terminado"],
    ["doing", "haciendo"],
    ["closed", "sin completar"],
    ["todo", "sin empezar"],
  ];
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-muted">
      {items.map(([s, l]) => (
        <li key={s} className="flex items-center gap-1.5">
          <span aria-hidden className={cx("size-2 rounded-full", DOT[s])} />
          {l}
        </li>
      ))}
    </ul>
  );
}

// ─── B · Mapa del año ───────────────────────────────────────────────────────

/**
 * Una grilla: cada fila un objetivo y cada columna un trimestre, con sus
 * resultados clave. La columna del trimestre en curso va resaltada. En el
 * celular, el mismo mapa de a un trimestre (se elige arriba).
 */
function YearMap({
  groups,
  today,
  year,
  nowQ,
  onOpenObjective,
  onOpenKr,
  onPlan,
}: {
  groups: Group[];
  today: string;
  year: number;
  nowQ: Quarter | null;
  onOpenObjective: (id: string) => void;
  onOpenKr: (k: KeyResultDTO) => void;
  onPlan: (objectiveId: string, quarter: Quarter) => void;
}) {
  const [mobileQ, setMobileQ] = useState<Quarter>(nowQ ?? "Q1");
  // Otro trimestre en el celular: entra desde ese lado (Q1 → Q2 desde la derecha).
  const qSlide = useSlide(mobileQ);
  const currentYear = Number(today.slice(0, 4));
  // Se planifica en el trimestre en curso y los que vienen (o todo un año futuro).
  const plannable = (q: Quarter) => year > currentYear || (year === currentYear && nowQ !== null && QUARTERS.indexOf(q) >= QUARTERS.indexOf(nowQ));
  const inQ = (g: Group, q: Quarter) => g.keyResults.filter((k) => krQuarters(k).includes(q));
  const unplaced = (g: Group) => g.keyResults.filter((k) => krQuarters(k).length === 0);
  const ownGoalOnly = (g: Group) => !!g.goal && g.keyResults.length === 0;

  const cell = (g: Group, q: Quarter) => {
    const krs = inQ(g, q);
    if (krs.length)
      return (
        <ul className="grid gap-0.5">
          {krs.map((k) => (
            <KrItem key={k.id} kr={k} today={today} onOpen={() => onOpenKr(k)} />
          ))}
        </ul>
      );
    if (g.loose || !plannable(q)) return null;
    return (
      <p className="text-[13px] text-muted">
        Vacío ·{" "}
        <button type="button" onClick={() => onPlan(g.id, q)} className="underline decoration-line-strong underline-offset-2 hover:text-fg">
          planificar
        </button>
      </p>
    );
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
        <h2 className="display text-[26px] lg:text-[30px]">Objetivos {year}</h2>
        <Legend />
      </div>

      {/* Compu: la grilla entera. */}
      <div className="hidden overflow-hidden rounded-2xl border border-line bg-surface lg:block">
        <div role="table" aria-label={`Objetivos ${year} por trimestre`} className="grid grid-cols-[minmax(15rem,1.15fr)_repeat(4,minmax(0,1fr))]">
          <div role="row" className="contents">
            <span role="columnheader" className="border-b border-line bg-surface-2 px-4 py-3 font-mono text-[11px] tracking-[0.08em] text-muted uppercase">
              Objetivo
            </span>
            {QUARTERS.map((q) => (
              <span
                key={q}
                role="columnheader"
                className={cx(
                  "border-b border-l border-line px-4 py-3 font-mono text-[11px] tracking-[0.08em] uppercase",
                  q === nowQ ? "bg-[color-mix(in_oklab,var(--accent)_14%,var(--surface))] text-fg" : "bg-surface-2 text-muted",
                )}
              >
                {q} · {q === nowQ ? "ahora" : QUARTER_MONTHS[q]}
              </span>
            ))}
          </div>
          {groups.map((g) => (
            <div role="row" key={g.id || "loose"} className="contents">
              <div role="rowheader" className="grid content-start gap-2 border-b border-line px-4 py-3.5">
                <ObjectiveHead o={g} onOpen={() => onOpenObjective(g.id || "loose")} />
                {unplaced(g).length > 0 && (
                  <details className="text-[12.5px] text-muted">
                    <summary className="cursor-pointer select-none hover:text-fg">{unplaced(g).length} sin trimestre</summary>
                    <ul className="grid gap-0.5 pt-1">
                      {unplaced(g).map((k) => (
                        <KrItem key={k.id} kr={k} today={today} onOpen={() => onOpenKr(k)} />
                      ))}
                    </ul>
                  </details>
                )}
              </div>
              {ownGoalOnly(g) ? (
                <div role="cell" className="col-span-4 flex items-center gap-4 border-b border-l border-line px-4 py-3.5 text-[13px] text-muted">
                  <span>
                    Se mide con su propia meta ({fmtNum(g.progress ?? 0)} de {fmtNum(g.goal ?? 0)}), sin resultados clave por trimestre.
                  </span>
                  <GoalStepper o={g} />
                </div>
              ) : (
                QUARTERS.map((q) => (
                  <div
                    role="cell"
                    key={q}
                    className={cx("min-w-0 border-b border-l border-line px-4 py-3", q === nowQ && "bg-[color-mix(in_oklab,var(--accent)_6%,var(--surface))]")}
                  >
                    {cell(g, q)}
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Celular: el mapa de a un trimestre. */}
      <div className="grid gap-3 lg:hidden">
        <PillSwitch
          label="Trimestre"
          value={mobileQ}
          onChange={setMobileQ}
          className="w-full"
          options={QUARTERS.map((q) => ({ value: q, label: q === nowQ ? `${q} · ahora` : q }))}
        />
        <ul key={mobileQ} className={cx("grid gap-2.5", qSlide)}>
          {groups.map((g) => (
            <li key={g.id || "loose"} className="grid gap-2.5 rounded-2xl border border-line bg-surface px-4 py-3.5">
              <ObjectiveHead o={g} onOpen={() => onOpenObjective(g.id || "loose")} />
              <div className="border-t border-line pt-2.5">
                {ownGoalOnly(g) ? (
                  <div className="flex items-center justify-between gap-3 text-[13px] text-muted">
                    <span>Se mide con su propia meta.</span>
                    <GoalStepper o={g} />
                  </div>
                ) : (
                  (cell(g, mobileQ) ?? <p className="text-[13px] text-muted">Nada en el {mobileQ}.</p>)
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </>
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

// ─── C · Por rol ────────────────────────────────────────────────────────────

/** Tarjeta por rol: el avance grande, una tira de 4 trimestres y lo que toca este trimestre. */
function RoleCards({
  groups,
  today,
  nowQ,
  onOpenObjective,
  onPlan,
}: {
  groups: Group[];
  today: string;
  nowQ: Quarter | null;
  onOpenObjective: (id: string) => void;
  onPlan: (objectiveId: string, quarter: Quarter) => void;
}) {
  return (
    <>
      <h2 className="display pb-3 text-[26px] lg:text-[30px]">Objetivos {groups[0]?.year}</h2>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {groups.map((g) => (
          <li key={g.id || "loose"}>
            <RoleCard o={g} today={today} nowQ={nowQ} onOpen={() => onOpenObjective(g.id || "loose")} onPlan={onPlan} />
          </li>
        ))}
      </ul>
    </>
  );
}

function RoleCard({
  o,
  today,
  nowQ,
  onOpen,
  onPlan,
}: {
  o: Group;
  today: string;
  nowQ: Quarter | null;
  onOpen: () => void;
  onPlan: (objectiveId: string, quarter: Quarter) => void;
}) {
  const pct = objectivePct(o);
  const own = !!o.goal;
  const late = o.deadline !== null && o.deadline < today && o.status !== "done";
  const nowKrs = nowQ ? o.keyResults.filter((k) => krQuarters(k).includes(nowQ)) : [];
  const allDone = o.keyResults.length > 0 && o.keyResults.every((k) => k.status === "done");
  const note = late ? `deadline vencido (${shortDate(o.deadline!, today)})` : o.status === "todo" ? "sin empezar" : null;

  return (
    <article className="lift plan-hover relative grid h-full content-start gap-3 rounded-2xl border border-line bg-surface px-5 pt-4 pb-4">
      <div className="grid gap-1">
        <span className="kicker">{o.loose ? "Sueltos" : (o.role ?? o.area ?? "Objetivo")}</span>
        <h3 className="text-[17px] leading-snug font-semibold">
          <button type="button" onClick={onOpen} className="text-left after:absolute after:inset-0 after:rounded-2xl after:content-['']">
            {cleanTitle(o.title)}
          </button>
        </h3>
      </div>
      <p className="flex flex-wrap items-baseline gap-x-2">
        {own ? (
          <>
            <span className="figure text-[40px] leading-none">{fmtNum(o.progress ?? 0)}</span>
            <span className="text-[13px] text-muted">
              de {fmtNum(o.goal ?? 0)}
              {o.deadline && ` · ${shortDate(o.deadline, today)}`}
            </span>
          </>
        ) : (
          <span className={cx("figure text-[40px] leading-none", pct === 100 && "text-[var(--st-done-fg)]")}>{pct ?? 0}%</span>
        )}
        {note && <span className={cx("text-[13px]", late ? "text-danger" : "text-muted")}>{note}</span>}
      </p>

      {own && o.keyResults.length === 0 ? (
        <div className="flex items-center gap-3">
          <ProgressBar pct={pct} />
          <GoalStepper o={o} />
        </div>
      ) : (
        <QuarterStrip krs={o.keyResults} nowQ={nowQ} />
      )}

      <p className="text-[13px] text-muted">
        {own && o.keyResults.length === 0 ? (
          "Se mide con su propia meta"
        ) : nowQ && nowKrs.length ? (
          <>
            Este trimestre: <span className="text-fg">{nowKrs.map((k) => k.title).join(", ")}</span> · {nowKrs.filter((k) => k.status === "done").length} de {nowKrs.length}
          </>
        ) : allDone ? (
          "Todo hecho"
        ) : nowQ && !o.loose ? (
          <>
            Nada para este trimestre ·{" "}
            <button type="button" onClick={() => onPlan(o.id, nowQ)} className="relative z-10 underline decoration-line-strong underline-offset-2 hover:text-fg">
              planificar
            </button>
          </>
        ) : (
          `${o.keyResults.length} resultados clave · ${o.keyResults.filter((k) => k.status === "done").length} terminados`
        )}
      </p>
    </article>
  );
}

/** Cuatro segmentos: el relleno es el avance de ese trimestre; verde si se terminó todo. */
function QuarterStrip({ krs, nowQ }: { krs: KeyResultDTO[]; nowQ: Quarter | null }) {
  return (
    <div className="grid gap-1.5">
      <div className="grid grid-cols-4 gap-1.5" aria-hidden>
        {QUARTERS.map((q) => {
          const list = krs.filter((k) => krQuarters(k).includes(q));
          const pct = list.length ? (avgPct(list) ?? (list.every((k) => k.status === "done") ? 100 : 0)) : 0;
          const done = list.length > 0 && list.every((k) => k.status === "done");
          const past = nowQ !== null && QUARTERS.indexOf(q) < QUARTERS.indexOf(nowQ);
          const color = done ? "bg-[var(--st-done-line)]" : past ? "bg-[var(--p-yellow-chip)]" : "bg-accent";
          return (
            <span key={q} className={cx("h-2 overflow-hidden rounded-full bg-surface-3", q === nowQ && "ring-1 ring-accent ring-offset-1 ring-offset-surface")}>
              <span className={cx("bar-anim block h-full rounded-full", color)} style={{ width: `${pct}%` }} />
            </span>
          );
        })}
      </div>
      <div className="grid grid-cols-4 gap-1.5 font-mono text-[11px] text-muted">
        {QUARTERS.map((q) => {
          const list = krs.filter((k) => krQuarters(k).includes(q));
          return (
            <span key={q} className={cx(q === nowQ && "text-fg")}>
              {q}
              <span className="sr-only">: {list.length ? `${list.filter((k) => k.status === "done").length} de ${list.length} terminados` : "nada"}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ─── Detalle de un objetivo ─────────────────────────────────────────────────

function ObjectiveDetail({
  objective: o,
  today,
  onOpenKr,
  onEdit,
  onAdd,
}: {
  objective: Group;
  today: string;
  onOpenKr: (k: KeyResultDTO) => void;
  onEdit: () => void;
  onAdd: () => void;
}) {
  const pct = objectivePct(o);
  const sections = [
    ...QUARTERS.map((q) => ({ label: q, krs: o.keyResults.filter((k) => krQuarters(k).includes(q)) })),
    { label: "Sin trimestre", krs: o.keyResults.filter((k) => krQuarters(k).length === 0) },
  ].filter((s) => s.krs.length);
  return (
    <div className="grid gap-5">
      {!o.loose && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-muted">
          {o.role && <span className="kicker">{o.role}</span>}
          {o.area && <span>{o.area}</span>}
          {o.priority > 0 && <PriorityDots n={o.priority} />}
          {o.deadline && <span className="font-mono text-[12px] tabular">vence {shortDate(o.deadline, today)}</span>}
          <StatusPill label={KR_STATUS[o.status].label} toneKey={KR_STATUS[o.status].tone} />
        </div>
      )}
      {pct !== null && <ProgressBar pct={pct} label={o.goal ? `${fmtNum(o.progress ?? 0)} de ${fmtNum(o.goal)}` : `${pct}%`} />}
      {sections.length === 0 ? (
        <p className="text-[13.5px] text-muted">{o.goal ? "Se mide con su propia meta, sin resultados clave." : "Todavía no tiene resultados clave."}</p>
      ) : (
        sections.map((s) => (
          <section key={s.label} className="grid gap-1">
            <h3 className="kicker">{s.label}</h3>
            <ul className="grid border-t border-line">
              {s.krs.map((k) => (
                <KrRow key={`${s.label}-${k.id}`} kr={k} today={today} onOpen={() => onOpenKr(k)} />
              ))}
            </ul>
          </section>
        ))
      )}
      <div className="flex flex-wrap gap-2">
        {!o.loose && (
          <Button variant="accent" size="sm" onClick={onAdd}>
            <Plus size={15} weight="bold" /> Resultado clave
          </Button>
        )}
        {!o.loose && (
          <Button variant="outline" size="sm" onClick={onEdit}>
            <PencilSimple size={15} /> Editar objetivo
          </Button>
        )}
      </div>
    </div>
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
    {/* Celular: una línea que la abre. */}
    <button
      type="button"
      onClick={() => setUnfolded((u) => !u)}
      aria-expanded={unfolded}
      aria-controls="revision-trimestre"
      className={cx("tap-tint mt-4 flex min-h-12 w-full items-center gap-2 rounded-2xl border border-line bg-surface px-4 text-left lg:hidden", opened && "reveal")}
    >
      <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">
        Revisión del {quarter}
        {all.length > 0 && <span className="font-normal text-muted"> · {unfinished.length === 0 ? "todo terminado" : `${unfinished.length} sin terminar`}</span>}
      </span>
      <CaretDown size={15} weight="bold" aria-hidden className={cx("shrink-0 text-muted transition-transform duration-[var(--dur-state)] ease-[var(--ease-out)]", !unfolded && "-rotate-90")} />
    </button>
    <div id="revision-trimestre" className="fold fold-mobile" data-closed={!unfolded || undefined}>
    <div className="plan-fold-shadow">
    <section aria-label={`Revisión del ${quarter} ${year}`} className={cx(opened && "reveal", "relative mt-4 grid gap-5 rounded-2xl border border-line bg-surface px-5 pt-5 pb-5 max-lg:mt-2 lg:px-7")}>
      <button
        type="button"
        onClick={close}
        aria-label="Cerrar la revisión"
        className="absolute top-3 right-3 inline-flex size-11 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-fg"
      >
        <X size={17} />
      </button>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 pr-10">
        <div className="grid gap-1">
          <span className="kicker">{ended ? `Cerró el ${formatShort(to)}` : `Cierra el ${formatShort(to)}`}</span>
          <h2 className="display text-[26px] lg:text-[30px]">
            Revisión del {quarter} {year}
          </h2>
        </div>
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
      </div>

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
    </section>
    </div>
    </div>
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

// ─── Formularios ────────────────────────────────────────────────────────────

/** Crear o editar un objetivo; borrarlo manda también sus resultados clave a la papelera. */
function ObjectiveForm({
  objective,
  year,
  roles,
  areas,
  onDone,
}: {
  objective: ObjectiveDTO | null;
  year: number;
  roles: string[];
  areas: string[];
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(safeForm(saveObjective), null);
  const [, startDelete] = useSafeTransition();
  const [priority, setPriority] = useState(objective?.priority ?? 0);
  const [status, setStatus] = useState<KrStatus>(objective?.status ?? "doing");
  const notify = useEffectEvent(onDone);
  useEffect(() => {
    if (state?.ok) notify();
  }, [state]);
  return (
    <form action={action} className="grid gap-5">
      {objective && <input type="hidden" name="id" value={objective.id} />}
      <input type="hidden" name="year" value={objective?.year ?? year} />
      <Field label="Objetivo">
        <Input name="title" defaultValue={objective?.title} required maxLength={120} autoFocus={!objective} placeholder="Mejorar mi salud, Cursar 7 materias…" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Rol">
          <Input name="role" defaultValue={objective?.role ?? ""} maxLength={60} list="obj-roles" placeholder="Deportista" />
        </Field>
        <Field label="Categoría">
          <Input name="area" defaultValue={objective?.area ?? ""} maxLength={60} list="obj-areas" placeholder="Salud" />
        </Field>
      </div>
      <datalist id="obj-roles">
        {roles.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>
      <datalist id="obj-areas">
        {areas.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>
      <div className="grid gap-1.5">
        <span className="kicker">Prioridad</span>
        <PriorityPicker value={priority} onChange={setPriority} name="priority" />
      </div>
      <div className="grid gap-1.5">
        <span className="kicker">Estado</span>
        <Segmented
          name="status"
          value={status}
          onChange={setStatus}
          options={(["todo", "doing", "done", "closed"] as KrStatus[]).map((s) => ({ value: s, label: KR_STATUS[s].label }))}
        />
      </div>
      <div className="grid grid-cols-2 items-start gap-3 sm:grid-cols-3">
        <Field label="Meta propia" hint="Opcional" className="min-w-0">
          <Input name="goal" inputMode="decimal" defaultValue={objective?.goal ?? ""} placeholder="4" className="min-w-0" />
        </Field>
        <Field label="Llevo" className="min-w-0">
          <Input name="progress" inputMode="decimal" defaultValue={objective?.progress ?? ""} className="min-w-0" />
        </Field>
        <Field label="Deadline" className="col-span-2 min-w-0 sm:col-span-1">
          <Input type="date" name="deadline" defaultValue={objective?.deadline ?? ""} className="min-w-0" />
        </Field>
      </div>
      <p className="-mt-2 text-[12.5px] text-muted">Con meta propia el avance es lo que llevás sobre la meta; sin meta, el promedio de sus resultados clave.</p>
      {state && !state.ok && <p className="reveal text-sm text-danger">{state.error}</p>}
      <Button type="submit" variant="accent" disabled={pending} className="h-11">
        {pending ? "Guardando…" : objective ? "Guardar" : "Crear objetivo"}
      </Button>
      {objective && (
        <ConfirmButton
          undo="Objetivo borrado"
          onConfirm={() => {
            startDelete(() => deleteObjective(objective.id));
            onDone();
          }}
        >
          Borrar el objetivo{objective.keyResults.length ? ` y sus ${objective.keyResults.length} resultados clave` : ""}
        </ConfirmButton>
      )}
    </form>
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

function KrRow({ kr: raw, today, onOpen }: { kr: KeyResultDTO; today: string; onOpen: () => void }) {
  // Si se mide solo, el progreso sale del vínculo.
  const k = effectiveKr(raw);
  const pct = krPct(raw);
  const st = KR_STATUS[k.status];
  const left = k.status === "todo" || k.status === "doing" ? daysLeft(k.deadline, today) : null;
  return (
    <li>
      <button type="button" onClick={onOpen} className="grid w-full gap-2 border-b border-line px-1 py-3.5 text-left transition-colors hover:bg-surface-2/50">
        <span className="flex items-start gap-3">
          <span className={cx("min-w-0 flex-1 text-[15px] leading-snug font-medium", isFinishedKr(k) && "text-muted")}>{k.title}</span>
          {left !== null && (
            <span className={cx("shrink-0 font-mono text-[11px] font-medium tabular", left < 0 ? "text-danger" : "text-muted")}>{daysLeftLabel(left)}</span>
          )}
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          <StatusPill label={st.label} toneKey={st.tone} />
          <span className="inline-flex items-center gap-1 text-[12px] text-muted">
            {k.kind === "habit" ? <ArrowsClockwise size={13} aria-hidden /> : <Lightning size={13} aria-hidden />}
            {k.kind === "habit" ? "Hábito" : "Actividad"}
          </span>
          {k.deadline && <span className="font-mono text-[11px] text-muted tabular">{formatShort(k.deadline)}</span>}
          {raw.auto && <span className="text-[12px] text-accent-fg">· se mide solo: {raw.auto.label}</span>}
        </span>
        {pct !== null && <ProgressBar pct={pct} label={k.goal ? `${fmtNum(k.progress ?? 0)} de ${fmtNum(k.goal)}` : undefined} />}
      </button>
    </li>
  );
}

type KrPreset = { objectiveId?: string; quarter?: Quarter };
type KrSheetHandle = { open: (kr?: KeyResultDTO, preset?: KrPreset) => void };

const KrSheet = forwardRef<KrSheetHandle, { objectives: ObjectiveDTO[]; links: KrLinkOption[]; year: number }>(function KrSheet({ objectives, links, year }, ref) {
  const sheet = useRef<SheetHandle>(null);
  const [kr, setKr] = useState<KeyResultDTO | undefined>();
  const [preset, setPreset] = useState<KrPreset>({});
  const [key, setKey] = useState(0);
  useImperativeHandle(ref, () => ({
    open(k, p) {
      setKr(k);
      setPreset(p ?? {});
      setKey((n) => n + 1);
      sheet.current?.open();
    },
  }));
  return (
    <Sheet ref={sheet} title={kr ? "Editar resultado clave" : "Nuevo resultado clave"}>
      <KrForm key={key} kr={kr} preset={preset} objectives={objectives} links={links} year={year} onDone={() => sheet.current?.close()} />
    </Sheet>
  );
});

function KrForm({
  kr,
  preset,
  objectives,
  links,
  year,
  onDone,
}: {
  kr?: KeyResultDTO;
  preset: KrPreset;
  objectives: ObjectiveDTO[];
  links: KrLinkOption[];
  year: number;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(safeForm(saveKeyResult), null);
  const [kind, setKind] = useState<"activity" | "habit">(kr?.kind ?? "activity");
  const [status, setStatus] = useState<KrStatus>(kr?.status ?? "todo");
  const [objectiveId, setObjectiveId] = useState(kr?.objectiveId ?? preset.objectiveId ?? objectives[0]?.id ?? "");
  const [deleting, startDelete] = useSafeTransition();
  const notify = useEffectEvent(onDone);
  useEffect(() => {
    if (state?.ok) notify();
  }, [state]);
  const quarters = kr?.quarters ?? (preset.quarter ? [preset.quarter] : []);

  return (
    <form action={action} className="grid gap-5">
      {kr && <input type="hidden" name="id" value={kr.id} />}
      <input type="hidden" name="year" value={year} />
      <Field label="Nombre">
        <Input name="title" defaultValue={kr?.title} required maxLength={160} autoFocus={!kr} placeholder="Producir 3 tracks, Leer 3 por semana..." />
      </Field>

      <Field label="Objetivo">
        <select name="objectiveId" value={objectiveId} onChange={(e) => setObjectiveId(e.target.value)} className={cx(inputClass, "pr-8")}>
          {objectives.map((o) => (
            <option key={o.id} value={o.id}>
              {cleanTitle(o.title)}
            </option>
          ))}
          <option value="">Sin objetivo</option>
          <option value="__new">Nuevo objetivo...</option>
        </select>
      </Field>
      {objectiveId === "__new" && (
        <Field label="Nombre del objetivo nuevo">
          <Input name="newObjective" required maxLength={120} placeholder="Aprender de inversiones" />
        </Field>
      )}

      <div className="grid gap-1.5">
        <span className="kicker">Tipo</span>
        <Segmented
          name="kind"
          value={kind}
          onChange={setKind}
          options={[
            { value: "activity", label: "Actividad" },
            { value: "habit", label: "Hábito" },
          ]}
        />
      </div>

      <div className="grid gap-1.5">
        <span className="kicker">Estado</span>
        <Segmented
          name="status"
          value={status}
          onChange={setStatus}
          options={(["todo", "doing", "done", "closed"] as KrStatus[]).map((s) => ({ value: s, label: KR_STATUS[s].label }))}
        />
      </div>

      <div className="grid gap-1.5">
        <span className="kicker">Trimestres</span>
        <div className="grid grid-cols-4 gap-1.5">
          {QUARTERS.map((q) => (
            <label
              key={q}
              className="flex h-11 cursor-pointer items-center justify-center rounded-[4px] border border-line text-[13px] font-medium text-muted transition-colors select-none has-checked:border-accent has-checked:bg-accent-soft has-checked:text-accent-fg"
            >
              <input type="checkbox" name="quarters" value={q} defaultChecked={quarters.includes(q)} className="sr-only" />
              {q}
            </label>
          ))}
        </div>
      </div>

      <Field label="Se mide solo con (opcional)" hint="Vinculado, el progreso se calcula solo: el % de un hábito, el saldo de una cuenta o lo juntado en una meta.">
        <select name="link" defaultValue={kr?.link ?? ""} className={inputClass}>
          <option value="">A mano</option>
          {(["Hábitos", "Cuentas", "Metas de ahorro"] as const).map((g) => {
            const opts = links.filter((l) => l.group === g);
            return opts.length ? (
              <optgroup key={g} label={g}>
                {opts.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </optgroup>
            ) : null;
          })}
        </select>
      </Field>

      {/* En el celular la fecha va en su propio renglón (en tres columnas se cortaba). */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Progreso" className="min-w-0">
          <Input name="progress" inputMode="decimal" defaultValue={kr?.progress ?? ""} className="min-w-0" />
        </Field>
        <Field label="Meta" className="min-w-0">
          <Input name="goal" inputMode="decimal" defaultValue={kr?.goal ?? ""} className="min-w-0" />
        </Field>
        <Field label="Deadline" className="col-span-2 min-w-0 sm:col-span-1">
          <Input type="date" name="deadline" defaultValue={kr?.deadline ?? ""} className="min-w-0" />
        </Field>
      </div>

      {state && !state.ok && (
        <p role="alert" className="reveal text-sm text-danger">
          {state.error}
        </p>
      )}
      <div className="grid gap-2">
        <Button type="submit" variant="accent" disabled={pending}>
          {pending ? "Guardando..." : kr ? "Guardar cambios" : "Crear resultado"}
        </Button>
        {kr && (
          <ConfirmButton
            undo="Resultado clave borrado"
            disabled={deleting}
            onConfirm={() =>
              startDelete(async () => {
                await deleteKeyResult(kr.id);
                onDone();
              })
            }
          >
            Borrar resultado
          </ConfirmButton>
        )}
      </div>
    </form>
  );
}
