"use client";

import { useOptimistic, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, CaretDown, CaretRight, Check, DotsThree, Minus, NotePencil, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import { showContextMenu } from "@/components/context-menu";
import { useSafeTransition } from "@/components/safe-action";
import { notifyDeleted } from "@/components/undo-toast";
import { useTick } from "@/components/motion";
import { cx, Sheet, type SheetHandle } from "@/components/ui";
import { formatShort } from "@/lib/dates";
import { addStep, addSubgoal, bumpObjective, deleteKeyResult, deleteObjective, deleteStep, renameKeyResult, renameStep, scheduleStep, toggleStep, unscheduleStep } from "@/lib/offline/plan";
import { ancestorsOf, byStepOrder, childrenOf, descendantsOf, groupGoals, isAchieved, nodePct, quarterPath, stepCount, treePct, type QuarterStop } from "@/lib/objective-tree";
import { effectiveKr, newClientId, type KeyResultDTO, type KrLinkOption, type ObjectiveDTO } from "@/lib/plan-logic";
import { ProgressBar } from "../plan-ui";
import { KrSheet, ObjectiveForm, type KrSheetHandle } from "./objective-forms";
import { InlineAdd, InlineEdit, reduce, ScheduleSheet, StepRow, type Ctx, type ScheduleHandle } from "./tree-parts";

const cleanTitle = (t: string) => t.replace(/^\d+\s+/, "");
const fmtNum = (n: number) => n.toLocaleString("es-UY", { maximumFractionDigits: 2 });

/**
 * Objetivos en tres columnas (pedido de Facu el 2026-10-25, mezcla de "columnas" y "camino por
 * trimestres"): a la izquierda los objetivos, al medio el elegido con su línea Q1 → Q4 y sus
 * objetivos chicos (ahora, logrados, sin terminar), a la derecha las tareas del objetivo chico
 * elegido. En el celular se entra de a una columna (Atrás vuelve). La elección va en la dirección
 * (`?o=` y `?k=`) sin volver a pedir la página.
 */
export function ObjectivesBoard({
  objectives,
  loose,
  links,
  today,
  year,
  onNew,
}: {
  objectives: ObjectiveDTO[];
  loose: KeyResultDTO[];
  links: KrLinkOption[];
  today: string;
  year: number;
  onNew: () => void;
}) {
  const sp = useSearchParams();
  const [all, apply] = useOptimistic([...objectives.flatMap((o) => o.keyResults), ...loose], reduce);
  // Objetivos grandes borrados con el clic derecho: desaparecen al toque (la papelera los guarda).
  const [gone, hide] = useOptimistic<string[], string>([], (ids, id) => [...ids, id]);
  const [, start] = useSafeTransition();
  const krSheet = useRef<KrSheetHandle>(null);
  const scheduleSheet = useRef<ScheduleHandle>(null);
  const editSheet = useRef<SheetHandle>(null);
  const [editKey, setEditKey] = useState(0);

  // Lo elegido: en la compu, sin nada elegido se ve el primero; en el celular, la lista.
  const LOOSE = "sueltos";
  const groups: ObjectiveDTO[] = [
    ...objectives.filter((o) => !gone.includes(o.id)).map((o) => ({ ...o, keyResults: all.filter((k) => k.objectiveId === o.id) })),
    ...(all.some((k) => !k.objectiveId)
      ? [{ id: LOOSE, title: "Sin objetivo grande", year, role: null, area: null, priority: 0, deadline: null, status: "doing" as const, progress: null, goal: null, focus: [], keyResults: all.filter((k) => !k.objectiveId) }]
      : []),
  ];
  const oParam = sp.get("o");
  const kParam = sp.get("k");
  const shown = groups.find((g) => g.id === oParam) ?? groups[0] ?? null;
  const krs = shown?.keyResults ?? [];
  const grouped = shown ? groupGoals(krs, shown.year, today) : { now: [], achieved: [], unfinished: [] };
  const kr = krs.find((k) => k.id === kParam) ?? grouped.now[0] ?? null;
  const pane: "list" | "objective" | "goal" = kParam && kr ? "goal" : oParam && shown ? "objective" : "list";

  const go = (o: string | null, k: string | null) => {
    const p = new URLSearchParams(window.location.search);
    if (o) p.set("o", o);
    else p.delete("o");
    if (k) p.set("k", k);
    else p.delete("k");
    window.history.pushState(null, "", `?${p}`);
  };

  const ctx: Ctx = {
    today,
    addKr(parentId, title) {
      if (!shown || shown.id === LOOSE) return;
      const id = newClientId();
      start(async () => {
        apply({
          type: "addKr",
          kr: { id, objectiveId: shown.id, title, kind: "activity", status: "todo", quarters: [], deadline: null, progress: null, goal: null, link: null, auto: null, parentId, steps: [] },
        });
        await addSubgoal({ objectiveId: shown.id, parentId, title, clientId: id });
      });
    },
    renameKr(k, title) {
      start(async () => {
        apply({ type: "renameKr", id: k.id, title });
        await renameKeyResult(k.id, title);
      });
    },
    openKr: (k) => krSheet.current?.open(k),
    addStep(krId, title) {
      const id = newClientId();
      const order = Math.max(0, ...(all.find((k) => k.id === krId)?.steps.map((s) => s.order) ?? [])) + 1;
      start(async () => {
        apply({ type: "addStep", step: { id, keyResultId: krId, title, done: false, order, blockId: null, date: null, startTime: null } });
        await addStep({ keyResultId: krId, title, clientId: id });
      });
    },
    toggle(s) {
      start(async () => {
        apply({ type: "step", id: s.id, patch: { done: !s.done } });
        await toggleStep(s.id, !s.done);
      });
    },
    renameStep(s, title) {
      start(async () => {
        apply({ type: "step", id: s.id, patch: { title } });
        await renameStep(s.id, title);
      });
    },
    removeStep(s) {
      start(async () => {
        apply({ type: "removeStep", id: s.id });
        await deleteStep(s.id);
        notifyDeleted("Tarea borrada");
      });
    },
    schedule: (s) => scheduleSheet.current?.open(s),
  };

  const realObjectives = groups.filter((g) => g.id !== LOOSE);

  /** Clic derecho en un objetivo chico: abrir, cambiar el nombre, editar o borrar (con lo que sale de él). */
  const krMenu = (e: React.MouseEvent, k: KeyResultDTO) => {
    const below = descendantsOf(all, k.id);
    showContextMenu(
      e,
      [
        { label: "Abrir", icon: <ArrowRight size={15} />, onSelect: () => go(k.objectiveId ?? LOOSE, k.id) },
        { label: "Cambiar nombre", icon: <PencilSimple size={15} />, rename: { value: k.title, onSave: (t) => t.trim() && ctx.renameKr(k, t.trim()) } },
        { label: "Editar", icon: <NotePencil size={15} />, onSelect: () => krSheet.current?.open(k) },
        {
          label: below.length ? `Borrar (y ${below.length} más chicos)` : "Borrar",
          icon: <Trash size={15} />,
          danger: true,
          onSelect: () => {
            const ids = [k.id, ...below.map((b) => b.id)];
            if (kr && ids.includes(kr.id) && shown) go(shown.id, null);
            start(async () => {
              apply({ type: "removeKr", ids });
              await deleteKeyResult(k.id);
              notifyDeleted(`"${k.title}" borrado`);
            });
          },
        },
      ],
      k.title,
    );
  };

  /** Clic derecho en un objetivo grande: abrir, editar o borrar (a la papelera con todo lo suyo). */
  const objectiveMenu = (e: React.MouseEvent, g: ObjectiveDTO) => {
    if (g.id === LOOSE) return;
    showContextMenu(
      e,
      [
        { label: "Abrir", icon: <ArrowRight size={15} />, onSelect: () => go(g.id, null) },
        {
          label: "Editar",
          icon: <NotePencil size={15} />,
          onSelect: () => {
            go(g.id, null);
            setEditKey((n) => n + 1);
            editSheet.current?.open();
          },
        },
        {
          label: "Borrar",
          icon: <Trash size={15} />,
          danger: true,
          onSelect: () => {
            if (shown?.id === g.id) go(null, null);
            start(async () => {
              hide(g.id);
              await deleteObjective(g.id);
              notifyDeleted(`"${cleanTitle(g.title)}" borrado`);
            });
          },
        },
      ],
      cleanTitle(g.title),
    );
  };

  return (
    <>
      <div className="grid lg:min-h-[32rem] lg:grid-cols-[minmax(14rem,0.75fr)_minmax(0,1.25fr)_minmax(0,1.1fr)]">
        {/* ── 1 · Los objetivos ── */}
        <section aria-label="Objetivos" className={cx("grid content-start gap-1 lg:border-r lg:border-line lg:p-3", pane !== "list" && "max-lg:hidden")}>
          <ul className="grid gap-1">
            {groups.map((g) => {
              const pct = treePct(g);
              const achieved = groupGoals(g.keyResults, g.year, today).achieved.length;
              const on = shown?.id === g.id;
              return (
                <li key={g.id}>
                  <button
                    type="button"
                    onClick={() => go(g.id, null)}
                    onContextMenu={(e) => objectiveMenu(e, g)}
                    aria-current={on ? "true" : undefined}
                    className={cx(
                      "tap-tint grid w-full gap-1.5 rounded-xl px-3 py-2.5 text-left transition-colors",
                      on ? "lg:bg-accent-soft" : "hover:bg-surface-2",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span className="kicker min-w-0 flex-1 truncate">{g.role ?? g.area ?? (g.id === LOOSE ? "Sueltos" : "Objetivo")}</span>
                      {achieved > 0 && (
                        <span className="inline-flex shrink-0 items-center gap-0.5 font-mono text-[11px] text-[var(--st-done-fg)]">
                          <Check size={11} weight="bold" aria-hidden />
                          {achieved}
                          <span className="sr-only"> logrados</span>
                        </span>
                      )}
                      <CaretRight size={13} className="shrink-0 text-faint lg:hidden" aria-hidden />
                    </span>
                    <span className={cx("line-clamp-2 text-[14.5px] leading-snug", on ? "font-semibold" : "font-medium")}>{cleanTitle(g.title)}</span>
                    {pct !== null && <ProgressBar pct={pct} label={`${pct}%`} />}
                  </button>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            onClick={onNew}
            className="press mt-1 inline-flex min-h-11 items-center gap-1.5 justify-self-start rounded-full border border-dashed border-line-strong px-4 text-[13.5px] font-medium hover:bg-surface-2"
          >
            <Plus size={15} weight="bold" aria-hidden /> Nuevo objetivo
          </button>
        </section>

        {/* ── 2 · El objetivo elegido: su camino y sus objetivos chicos ── */}
        <section aria-label="Objetivo" className={cx("grid content-start gap-4 lg:border-r lg:border-line lg:p-4", pane !== "objective" && "max-lg:hidden")}>
          {shown ? (
            <>
              <button type="button" onClick={() => go(null, null)} className="inline-flex min-h-10 items-center gap-1.5 justify-self-start text-[13px] text-muted hover:text-fg lg:hidden">
                <ArrowLeft size={14} aria-hidden /> Objetivos
              </button>
              <div className="grid gap-2">
                <div className="flex items-start gap-2">
                  <div className="grid min-w-0 flex-1 gap-0.5">
                    <span className="kicker">
                      {shown.role ?? shown.area ?? "Objetivo"}
                      {shown.deadline && ` · hasta ${formatShort(shown.deadline)}`}
                    </span>
                    <h2 className="text-[19px] leading-snug font-semibold text-balance">{cleanTitle(shown.title)}</h2>
                  </div>
                  {shown.id !== LOOSE && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditKey((n) => n + 1);
                        editSheet.current?.open();
                      }}
                      className="press inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-line-strong px-3 text-[13px] hover:bg-surface-2"
                    >
                      <PencilSimple size={14} aria-hidden /> Editar
                    </button>
                  )}
                </div>
                {treePct(shown) !== null && <ProgressBar pct={treePct(shown)} label={`${treePct(shown)}%`} />}
              </div>

              {shown.id !== LOOSE && krs.some((k) => k.quarters.length > 0) && <QuarterLine stops={quarterPath(krs, shown.year, today)} />}

              {shown.goal && krs.length === 0 && (
                <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3 text-[14px]">
                  <span>
                    Llevás <b className="font-semibold">{fmtNum(shown.progress ?? 0)}</b> de {fmtNum(shown.goal)}
                  </span>
                  <GoalStepper o={shown} />
                </div>
              )}

              {/* En un año que ya pasó, sin nada pendiente, el grupo vacío no dice nada. */}
              {(shown.year >= Number(today.slice(0, 4)) || grouped.now.length > 0 || krs.length === 0) && (
                <GoalGroup
                  title={shown.year === Number(today.slice(0, 4)) ? `Ahora · Q${Math.floor((Number(today.slice(5, 7)) - 1) / 3) + 1}` : "Por hacer"}
                  list={grouped.now}
                  all={krs}
                  selected={kr?.id ?? null}
                  onPick={(k) => go(shown.id, k.id)}
                  onMenu={krMenu}
                  empty={krs.length === 0 ? "¿Qué tiene que pasar para lograrlo? Partilo en objetivos más chicos." : "Nada pendiente ahora."}
                />
              )}
              {shown.id !== LOOSE && <AddGoal ctx={ctx} parentId={null} label="Objetivo más chico" placeholder="Un objetivo más chico: terminar 4 temas…" open={krs.length === 0} />}

              {grouped.achieved.length > 0 && (
                <GoalGroup title={`Logrados · ${grouped.achieved.length}`} tone="done" list={grouped.achieved} all={krs} selected={kr?.id ?? null} onPick={(k) => go(shown.id, k.id)} onMenu={krMenu} />
              )}
              {grouped.unfinished.length > 0 && (
                <GoalGroup
                  title={`Quedaron sin terminar · ${grouped.unfinished.length}`}
                  foldable
                  list={grouped.unfinished}
                  all={krs}
                  selected={kr?.id ?? null}
                  onPick={(k) => go(shown.id, k.id)}
                  onMenu={krMenu}
                />
              )}
            </>
          ) : (
            <p className="text-[14px] text-muted">Todavía no hay objetivos para {year}.</p>
          )}
        </section>

        {/* ── 3 · El objetivo chico elegido: sus tareas y lo que sale de él ── */}
        <section aria-label="Tareas" className={cx("grid content-start gap-3 lg:p-4", pane !== "goal" && "max-lg:hidden")}>
          {kr && shown ? (
            <GoalPane key={kr.id} kr={kr} all={krs} ctx={ctx} objective={shown} onBack={() => go(shown.id, null)} onPick={(k) => go(shown.id, k.id)} />
          ) : (
            <div className="hidden content-center justify-items-center gap-2 py-10 text-center lg:grid">
              <p className="text-[14px] text-muted">{krs.length ? "Elegí un objetivo chico para ver sus tareas." : "Cuando lo partas, acá vas a ver las tareas de cada pedazo."}</p>
            </div>
          )}
        </section>
      </div>

      <KrSheet ref={krSheet} objectives={realObjectives} links={links} year={year} onDeleted={() => shown && go(shown.id, null)} />
      <ScheduleSheet
        ref={scheduleSheet}
        today={today}
        onSchedule={(s, date, startTime) => {
          const id = newClientId();
          start(async () => {
            apply({ type: "step", id: s.id, patch: { date, startTime, blockId: s.blockId ?? id } });
            await scheduleStep({ stepId: s.id, date, startTime, clientId: id });
          });
        }}
        onUnschedule={(s) =>
          start(async () => {
            apply({ type: "step", id: s.id, patch: { date: null, startTime: null, blockId: null } });
            await unscheduleStep(s.id);
          })
        }
      />
      <Sheet ref={editSheet} title="Editar objetivo">
        {shown && shown.id !== LOOSE && (
          <ObjectiveForm
            key={editKey}
            objective={objectives.find((o) => o.id === shown.id) ?? null}
            year={shown.year}
            roles={[...new Set(objectives.map((x) => x.role).filter((r): r is string => !!r))]}
            areas={[...new Set(objectives.map((x) => x.area).filter((r): r is string => !!r))]}
            onDone={() => editSheet.current?.close()}
            onDeleted={() => go(null, null)}
          />
        )}
      </Sheet>
    </>
  );
}

// ─── La línea Q1 → Q4 ───────────────────────────────────────────────────────

/** Cada trimestre como una parada: verde si se logró todo lo que tenía, a medias en ámbar, el de ahora con aro. */
function QuarterLine({ stops }: { stops: QuarterStop[] }) {
  return (
    <ol className="grid grid-cols-4" aria-label="Trimestres">
      {stops.map((s, i) => {
        const all = s.total > 0 && s.done === s.total;
        const some = s.done > 0 && !all;
        return (
          <li key={s.q} className="relative grid justify-items-center gap-1">
            {i > 0 && (
              <span
                aria-hidden
                className={cx("absolute top-[13px] right-1/2 h-0.5 w-full", stops[i - 1].done > 0 && s.when !== "future" ? "bg-[var(--st-done-line)]" : "bg-line")}
              />
            )}
            <span
              className={cx(
                "relative z-[1] inline-flex size-7 items-center justify-center rounded-full font-mono text-[11px] font-semibold",
                all
                  ? "bg-[var(--st-done-line)] text-white"
                  : some
                    ? "bg-[var(--p-yellow-chip)] text-[var(--p-yellow-chip-fg)]"
                    : s.when === "now"
                      ? "bg-surface text-accent-fg ring-2 ring-accent"
                      : "bg-surface-2 text-muted ring-1 ring-line",
              )}
            >
              {all ? <Check size={13} weight="bold" aria-hidden /> : s.q}
              <span className="sr-only">{all ? `${s.q}: todo logrado` : ""}</span>
            </span>
            <span className={cx("font-mono text-[11px] tabular", s.when === "now" ? "text-fg" : "text-muted")}>
              {s.total ? `${s.done}/${s.total}` : s.when === "now" ? "ahora" : "–"}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// ─── Objetivos chicos ───────────────────────────────────────────────────────

/** "3/10" o "4/4 tareas" o "57%": lo que mejor dice cómo va. */
function figureOf(all: KeyResultDTO[], k: KeyResultDTO): string {
  const { done, total } = stepCount(all, k);
  if (total) return `${done}/${total}`;
  const e = effectiveKr(k);
  if (e.goal) return `${fmtNum(e.progress ?? 0)}/${fmtNum(e.goal)}`;
  const p = nodePct(all, k);
  return p !== null && childrenOf(all, k.id).length ? `${p}%` : "";
}

function StateDot({ all, k }: { all: KeyResultDTO[]; k: KeyResultDTO }) {
  if (isAchieved(all, k))
    return (
      <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-[var(--st-done-line)] text-white" aria-label="Logrado">
        <Check size={9} weight="bold" aria-hidden />
      </span>
    );
  if (k.status === "closed")
    return (
      <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-surface-3 text-muted" aria-label="Sin terminar">
        <Minus size={9} weight="bold" aria-hidden />
      </span>
    );
  const p = nodePct(all, k);
  return p && p > 0 ? (
    <span className="size-4 shrink-0 rounded-full border-[1.5px] border-accent bg-accent-soft" aria-label="En camino" />
  ) : (
    <span className="size-4 shrink-0 rounded-full border-[1.5px] border-line-strong" aria-label="Sin empezar" />
  );
}

function GoalGroup({
  title,
  list,
  all,
  selected,
  onPick,
  onMenu,
  empty,
  tone,
  foldable,
}: {
  title: string;
  list: KeyResultDTO[];
  all: KeyResultDTO[];
  selected: string | null;
  onPick: (k: KeyResultDTO) => void;
  /** Clic derecho en una fila. */
  onMenu?: (e: React.MouseEvent, k: KeyResultDTO) => void;
  empty?: string;
  tone?: "done";
  foldable?: boolean;
}) {
  const [open, setOpen] = useState(!foldable);
  const row = (k: KeyResultDTO, depth: number) => (
    <li key={k.id}>
      <button
        type="button"
        onClick={() => onPick(k)}
        onContextMenu={onMenu ? (e) => onMenu(e, k) : undefined}
        aria-current={selected === k.id ? "true" : undefined}
        className={cx(
          "tap-tint flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2 text-left text-[14px] transition-colors",
          selected === k.id ? "lg:bg-accent-soft" : "hover:bg-surface-2",
        )}
        style={depth ? { paddingLeft: `${0.5 + depth * 1.25}rem` } : undefined}
      >
        <StateDot all={all} k={k} />
        <span className={cx("min-w-0 flex-1 leading-snug", tone === "done" && "text-muted")}>{k.title}</span>
        {k.quarters.length > 0 && <span className="shrink-0 font-mono text-[11px] text-muted">{k.quarters.join(" ")}</span>}
        <span className="shrink-0 font-mono text-[12px] text-muted tabular">{figureOf(all, k)}</span>
        <CaretRight size={13} className="shrink-0 text-faint lg:hidden" aria-hidden />
      </button>
      {childrenOf(all, k.id).length > 0 && <ul>{childrenOf(all, k.id).map((c) => row(c, depth + 1))}</ul>}
    </li>
  );
  return (
    <div className="grid gap-1">
      {foldable ? (
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="kicker inline-flex min-h-8 items-center gap-1 justify-self-start hover:text-fg">
          <CaretDown size={11} aria-hidden className={cx("transition-transform", !open && "-rotate-90")} />
          {title}
        </button>
      ) : (
        <h3 className={cx("kicker", tone === "done" && "text-[var(--st-done-fg)]!")}>{title}</h3>
      )}
      {open && (list.length ? <ul className="grid">{list.map((k) => row(k, 0))}</ul> : empty ? <p className="px-2 text-[13.5px] text-muted">{empty}</p> : null)}
    </div>
  );
}

function AddGoal({ ctx, parentId, label, placeholder, open: startOpen = false }: { ctx: Ctx; parentId: string | null; label: string; placeholder: string; open?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [touched, setTouched] = useState(false);
  return open ? (
    <InlineAdd placeholder={placeholder} onAdd={(t) => ctx.addKr(parentId, t)} onClose={() => setOpen(false)} autoFocus={touched} />
  ) : (
    <button
      type="button"
      onClick={() => {
        setTouched(true);
        setOpen(true);
      }}
      className="inline-flex min-h-10 items-center gap-1.5 justify-self-start px-2 text-[13px] text-muted hover:text-fg"
    >
      <Plus size={14} weight="bold" aria-hidden /> {label}
    </button>
  );
}

// ─── El objetivo chico: sus tareas ──────────────────────────────────────────

function GoalPane({
  kr,
  all,
  ctx,
  objective,
  onBack,
  onPick,
}: {
  kr: KeyResultDTO;
  all: KeyResultDTO[];
  ctx: Ctx;
  objective: ObjectiveDTO;
  onBack: () => void;
  onPick: (k: KeyResultDTO) => void;
}) {
  const steps = [...kr.steps].sort(byStepOrder);
  const kids = childrenOf(all, kr.id);
  const pct = nodePct(all, kr);
  const parents = ancestorsOf(all, kr);
  const e = effectiveKr(kr);
  const [adding, setAdding] = useState(steps.length === 0 && kids.length === 0 && !e.goal);
  const [touched, setTouched] = useState(false);
  return (
    <>
      <button type="button" onClick={onBack} className="inline-flex min-h-10 items-center gap-1.5 justify-self-start text-[13px] text-muted hover:text-fg lg:hidden">
        <ArrowLeft size={14} aria-hidden /> <span className="truncate">{cleanTitle(objective.title)}</span>
      </button>
      {parents.length > 0 && (
        <nav aria-label="Viene de" className="flex flex-wrap items-center gap-1 text-[12.5px] text-muted">
          {parents.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1">
              <button type="button" onClick={() => onPick(p)} className="hover:text-fg hover:underline">
                {p.title}
              </button>
              <CaretRight size={11} aria-hidden />
            </span>
          ))}
        </nav>
      )}
      <div className="flex items-start gap-2">
        <span className="mt-1.5 flex">
          <StateDot all={all} k={kr} />
        </span>
        <InlineEdit value={kr.title} onSave={(t) => ctx.renameKr(kr, t)} className="text-[17px] font-semibold" label="el objetivo chico" />
        {kr.quarters.length > 0 && <span className="mt-1.5 shrink-0 font-mono text-[11px] text-muted">{kr.quarters.join(" ")}</span>}
        <button
          type="button"
          onClick={() => ctx.openKr(kr)}
          aria-label={`Más opciones de ${kr.title}`}
          title="Trimestres, fecha, estado, si se mide solo, borrar"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
        >
          <DotsThree size={18} weight="bold" aria-hidden />
        </button>
      </div>
      {pct !== null && <ProgressBar pct={pct} label={figureOf(all, kr) || `${pct}%`} />}
      {steps.length === 0 && kids.length === 0 && (kr.auto || e.goal) && (
        <p className="rounded-xl bg-surface-2 px-3 py-2 text-[13px] text-muted">
          {kr.auto ? `Se mide solo: ${kr.auto.label}.` : `Se mide a mano: ${fmtNum(e.progress ?? 0)} de ${fmtNum(e.goal ?? 0)}.`}{" "}
          <button type="button" onClick={() => ctx.openKr(kr)} className="text-accent-fg underline underline-offset-2">
            Cambiar
          </button>
        </p>
      )}

      <div className="grid gap-0.5">
        <h3 className="kicker">Tareas</h3>
        {steps.length > 0 && (
          <ul className="grid">
            {steps.map((s) => (
              <StepRow key={s.id} s={s} ctx={ctx} />
            ))}
          </ul>
        )}
        {adding ? (
          <InlineAdd placeholder="Una tarea simple…" onAdd={(t) => ctx.addStep(kr.id, t)} onClose={() => setAdding(false)} autoFocus={touched} />
        ) : (
          <button
            type="button"
            onClick={() => {
              setTouched(true);
              setAdding(true);
            }} className="inline-flex min-h-10 items-center gap-1.5 justify-self-start text-[13px] text-muted hover:text-fg">
            <Plus size={14} weight="bold" aria-hidden /> Tarea
          </button>
        )}
      </div>

      <div className="grid gap-0.5 border-t border-line pt-3">
        <h3 className="kicker">Objetivos más chicos</h3>
        {kids.length > 0 && (
          <ul className="grid">
            {kids.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => onPick(c)} className="tap-tint flex min-h-11 w-full items-center gap-2.5 rounded-lg px-1 text-left text-[14px] hover:bg-surface-2">
                  <StateDot all={all} k={c} />
                  <span className="min-w-0 flex-1 leading-snug">{c.title}</span>
                  <span className="shrink-0 font-mono text-[12px] text-muted tabular">{figureOf(all, c)}</span>
                  <CaretRight size={13} className="shrink-0 text-faint" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        <AddGoal ctx={ctx} parentId={kr.id} label="Partirlo en más chicos" placeholder="Un objetivo todavía más chico…" />
      </div>
      <p className="text-[12px] text-muted">Con el calendario mandás una tarea a un día: aparece en tu Plan semanal y se tilda en los dos lados.</p>
    </>
  );
}

/** −1 / +1 de la meta propia de un objetivo sin objetivos chicos ("1 de 4"). */
function GoalStepper({ o }: { o: ObjectiveDTO }) {
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
    <span className="inline-flex shrink-0 items-center rounded-full border border-line-strong">
      <button type="button" onClick={() => bump(-1)} aria-label="Restar uno" className="inline-flex size-10 items-center justify-center rounded-full text-muted hover:text-fg">
        <Minus size={14} />
      </button>
      <span className="min-w-6 overflow-hidden text-center font-mono text-[13px] tabular" aria-live="polite">
        <span key={tick.key} className={tick.className}>
          {fmtNum(value)}
        </span>
      </span>
      <button type="button" onClick={() => bump(1)} aria-label="Sumar uno" className="inline-flex size-10 items-center justify-center rounded-full text-muted hover:text-fg">
        <Plus size={14} />
      </button>
    </span>
  );
}

