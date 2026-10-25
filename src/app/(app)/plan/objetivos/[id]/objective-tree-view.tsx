"use client";

import { forwardRef, useImperativeHandle, useOptimistic, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarBlank, CaretDown, CalendarPlus, Check, DotsThree, PencilSimple, Plus, Target, X } from "@phosphor-icons/react";
import { useSafeTransition } from "@/components/safe-action";
import { useOnNew } from "@/components/nav-add";
import { PageHeader } from "@/components/page-header";
import { TintedCard } from "@/components/tinted-card";
import { TimeInput } from "@/components/time-input";
import { notifyDeleted } from "@/components/undo-toast";
import { Button, cx, Input, Sheet, type SheetHandle } from "@/components/ui";
import { addDays, formatShort, startOfWeek } from "@/lib/dates";
import { addStep, addSubgoal, deleteStep, renameKeyResult, renameStep, scheduleStep, toggleStep, unscheduleStep } from "@/lib/offline/plan";
import { byStepOrder, childrenOf, nodePct, rootsOf, splitPast, stepCount, treePct, whenLabel } from "@/lib/objective-tree";
import { newClientId, type KeyResultDTO, type KrLinkOption, type ObjectiveDTO, type StepDTO } from "@/lib/plan-logic";
import { ProgressBar } from "../../plan-ui";
import { PlanTabs } from "../../plan-nav";
import { KrSheet, ObjectiveForm, type KrSheetHandle } from "../objective-forms";

const cleanTitle = (t: string) => t.replace(/^\d+\s+/, "");

type Op =
  | { type: "addKr"; kr: KeyResultDTO }
  | { type: "renameKr"; id: string; title: string }
  | { type: "addStep"; step: StepDTO }
  | { type: "step"; id: string; patch: Partial<StepDTO> }
  | { type: "removeStep"; id: string };

function reduce(krs: KeyResultDTO[], op: Op): KeyResultDTO[] {
  switch (op.type) {
    case "addKr":
      return [...krs.filter((k) => k.id !== op.kr.id), op.kr];
    case "renameKr":
      return krs.map((k) => (k.id === op.id ? { ...k, title: op.title } : k));
    case "addStep":
      return krs.map((k) => (k.id === op.step.keyResultId ? { ...k, steps: [...k.steps.filter((s) => s.id !== op.step.id), op.step] } : k));
    case "step":
      return krs.map((k) => ({ ...k, steps: k.steps.map((s) => (s.id === op.id ? { ...s, ...op.patch } : s)) }));
    case "removeStep":
      return krs.map((k) => ({ ...k, steps: k.steps.filter((s) => s.id !== op.id) }));
  }
}

/** Lo que pueden hacer las filas del árbol (todo se ve al instante; el servidor lo confirma). */
type Ctx = {
  today: string;
  addKr: (parentId: string | null, title: string) => void;
  renameKr: (k: KeyResultDTO, title: string) => void;
  openKr: (k: KeyResultDTO) => void;
  addStep: (krId: string, title: string) => void;
  toggle: (s: StepDTO) => void;
  renameStep: (s: StepDTO, title: string) => void;
  removeStep: (s: StepDTO) => void;
  schedule: (s: StepDTO) => void;
};

/**
 * El árbol de un objetivo (2026-10-25): el objetivo escrito como venga, partido en objetivos
 * más chicos (que se pueden volver a partir) y cada uno en tareas simples. Una tarea con día
 * es un bloque del Plan: tildarla acá o allá es lo mismo.
 */
export function ObjectiveTreeView({
  objective,
  objectives,
  links,
  today,
}: {
  objective: ObjectiveDTO;
  objectives: ObjectiveDTO[];
  links: KrLinkOption[];
  today: string;
}) {
  const router = useRouter();
  const [krs, apply] = useOptimistic(objective.keyResults, reduce);
  const [, start] = useSafeTransition();
  const o: ObjectiveDTO = { ...objective, keyResults: krs };
  const pct = treePct(o);
  const allRoots = rootsOf(krs);
  // Lo de trimestres que ya pasaron va plegado al final (antes se planificaba de a trimestre).
  const { now: roots, past } = splitPast(allRoots, o.year, today);
  const [showPast, setShowPast] = useState(false);
  const allSteps = krs.flatMap((k) => k.steps);
  const doneSteps = allSteps.filter((s) => s.done).length;
  const editSheet = useRef<SheetHandle>(null);
  const krSheet = useRef<KrSheetHandle>(null);
  const scheduleSheet = useRef<ScheduleHandle>(null);
  const [editKey, setEditKey] = useState(0);
  const [rootAdding, setRootAdding] = useState(objective.keyResults.length === 0);
  useOnNew(() => setRootAdding(true));

  const ctx: Ctx = {
    today,
    addKr(parentId, title) {
      const id = newClientId();
      const kr: KeyResultDTO = {
        id,
        objectiveId: o.id,
        title,
        kind: "activity",
        status: "todo",
        quarters: [],
        deadline: null,
        progress: null,
        goal: null,
        link: null,
        auto: null,
        parentId,
        steps: [],
      };
      start(async () => {
        apply({ type: "addKr", kr });
        await addSubgoal({ objectiveId: o.id, parentId, title, clientId: id });
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
      const order = Math.max(0, ...(krs.find((k) => k.id === krId)?.steps.map((s) => s.order) ?? [])) + 1;
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

  const meta = [
    pct !== null ? `${pct}%` : null,
    allRoots.length ? `${allRoots.length} ${allRoots.length === 1 ? "objetivo chico" : "objetivos chicos"}` : null,
    allSteps.length ? `${doneSteps}/${allSteps.length} tareas` : null,
    o.deadline ? `hasta ${formatShort(o.deadline)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <div className="plan-head contents" data-w="96">
        <PageHeader title="Objetivo" wide tabs={<PlanTabs />} />
      </div>
      <main className="mx-auto grid max-w-3xl gap-4 px-4 pt-3 pb-10 lg:px-10">
        <Link href={`/plan/objetivos?anio=${o.year}`} className="inline-flex min-h-10 items-center gap-1.5 justify-self-start text-[13px] text-muted hover:text-fg">
          <ArrowLeft size={14} aria-hidden /> Todos los objetivos de {o.year}
        </Link>

        <TintedCard
          icon={Target}
          title={o.role ?? o.area ?? "Objetivo"}
          meta={meta || "Todavía sin partir"}
          progress={pct !== null ? pct / 100 : undefined}
          action={
            <button
              type="button"
              className="tcard-pill press"
              onClick={() => {
                setEditKey((n) => n + 1);
                editSheet.current?.open();
              }}
            >
              <PencilSimple size={14} aria-hidden /> Editar
            </button>
          }
        >
          <p className="text-[19px] leading-snug font-semibold text-balance">{cleanTitle(o.title)}</p>

          {allRoots.length === 0 && !rootAdding ? null : (
            <div className="mt-2 grid gap-1">
              <h2 className="kicker">{allRoots.length ? "Objetivos más chicos" : "¿Qué tiene que pasar para lograrlo?"}</h2>
              {allRoots.length === 0 && (
                <p className="text-[13.5px] text-muted">Partilo en objetivos más chicos. Después, cada uno en tareas simples.</p>
              )}
            </div>
          )}

          <ul className="grid gap-2.5">
            {roots.map((k) => (
              <GoalNode key={k.id} k={k} all={krs} ctx={ctx} />
            ))}
          </ul>

          {rootAdding ? (
            <InlineAdd placeholder="Un objetivo más chico: terminar 4 temas…" onAdd={(t) => ctx.addKr(null, t)} onClose={() => setRootAdding(false)} />
          ) : (
            <button
              type="button"
              onClick={() => setRootAdding(true)}
              className="press inline-flex h-10 items-center gap-1.5 justify-self-start rounded-full border border-dashed border-line-strong px-4 text-[13.5px] font-medium hover:bg-surface-2"
            >
              <Plus size={15} weight="bold" aria-hidden /> Objetivo más chico
            </button>
          )}

          {past.length > 0 && (
            <div className="grid gap-2.5 border-t border-line pt-3">
              <button
                type="button"
                onClick={() => setShowPast(!showPast)}
                aria-expanded={showPast}
                className="inline-flex min-h-10 items-center gap-1.5 justify-self-start text-[13px] text-muted hover:text-fg"
              >
                <CaretDown size={13} aria-hidden className={cx("transition-transform", !showPast && "-rotate-90")} />
                De trimestres anteriores ({past.length})
              </button>
              {showPast && (
                <ul className="grid gap-2.5 opacity-85">
                  {past.map((k) => (
                    <GoalNode key={k.id} k={k} all={krs} ctx={ctx} />
                  ))}
                </ul>
              )}
            </div>
          )}
        </TintedCard>
        <p className="text-[12.5px] text-muted">
          Tocá un nombre para cambiarlo. Con el calendario mandás una tarea a un día: aparece en tu Plan semanal y se tilda en los dos lados.
        </p>
      </main>

      <Sheet ref={editSheet} title="Editar objetivo">
        <ObjectiveForm
          key={editKey}
          objective={objective}
          year={objective.year}
          roles={[...new Set(objectives.map((x) => x.role).filter((r): r is string => !!r))]}
          areas={[...new Set(objectives.map((x) => x.area).filter((r): r is string => !!r))]}
          onDone={() => editSheet.current?.close()}
          onDeleted={() => router.push(`/plan/objetivos?anio=${objective.year}`)}
        />
      </Sheet>
      <KrSheet ref={krSheet} objectives={objectives} links={links} year={objective.year} />
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
    </>
  );
}

// ─── Un objetivo chico, sus tareas y lo que sale de él ──────────────────────

function GoalNode({ k, all, ctx, nested = false }: { k: KeyResultDTO; all: KeyResultDTO[]; ctx: Ctx; nested?: boolean }) {
  const kids = childrenOf(all, k.id);
  const steps = [...k.steps].sort(byStepOrder);
  const pct = nodePct(all, k);
  const { done, total } = stepCount(all, k);
  const [adding, setAdding] = useState<"step" | "kr" | null>(null);
  return (
    <li className={cx("grid gap-1.5", nested ? "pt-1" : "rounded-xl border border-line px-3 pt-2.5 pb-1.5")}>
      <div className="flex items-start gap-2">
        <InlineEdit value={k.title} onSave={(t) => ctx.renameKr(k, t)} className={cx("text-[15px] font-semibold", nested && "text-[14.5px]")} label="el objetivo" />
        {k.quarters.length > 0 && <span className="mt-0.5 shrink-0 font-mono text-[11px] text-muted">{k.quarters.join(" ")}</span>}
        <span className="mt-0.5 shrink-0 font-mono text-[12px] text-muted tabular">{total ? `${done}/${total}` : pct !== null ? `${pct}%` : ""}</span>
        <button
          type="button"
          onClick={() => ctx.openKr(k)}
          aria-label={`Más opciones de ${k.title}`}
          title="Trimestres, fecha, si se mide solo, borrar"
          className="-mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
        >
          <DotsThree size={18} weight="bold" aria-hidden />
        </button>
      </div>
      {pct !== null && (total > 0 || kids.length > 0) && <ProgressBar pct={pct} />}

      {steps.length > 0 && (
        <ul className="grid">
          {steps.map((s) => (
            <StepRow key={s.id} s={s} ctx={ctx} />
          ))}
        </ul>
      )}
      {adding === "step" && <InlineAdd placeholder="Una tarea simple…" onAdd={(t) => ctx.addStep(k.id, t)} onClose={() => setAdding(null)} />}

      {kids.length > 0 && (
        <ul className="grid gap-2 border-l-2 border-[color-mix(in_oklab,var(--accent)_30%,transparent)] pl-3">
          {kids.map((c) => (
            <GoalNode key={c.id} k={c} all={all} ctx={ctx} nested />
          ))}
        </ul>
      )}
      {adding === "kr" && <InlineAdd placeholder="Un objetivo todavía más chico…" onAdd={(t) => ctx.addKr(k.id, t)} onClose={() => setAdding(null)} />}

      {adding === null && (
        <div className="flex flex-wrap items-center gap-x-4">
          <button type="button" onClick={() => setAdding("step")} className="inline-flex min-h-10 items-center gap-1.5 text-[13px] text-muted hover:text-fg">
            <Plus size={14} weight="bold" aria-hidden /> Tarea
          </button>
          <button type="button" onClick={() => setAdding("kr")} className="inline-flex min-h-10 items-center gap-1.5 text-[13px] text-muted hover:text-fg">
            <Plus size={14} weight="bold" aria-hidden /> Partirlo en más chicos
          </button>
        </div>
      )}
    </li>
  );
}

function StepRow({ s, ctx }: { s: StepDTO; ctx: Ctx }) {
  return (
    <li className="group flex min-h-11 items-center gap-2">
      <button
        type="button"
        onClick={() => ctx.toggle(s)}
        aria-pressed={s.done}
        aria-label={s.done ? `Destildar ${s.title}` : `Tildar ${s.title}`}
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-full"
      >
        <span
          aria-hidden
          className={cx(
            "inline-flex size-[18px] items-center justify-center rounded-full border-2 transition-colors",
            s.done ? "border-[var(--c-plan)] bg-[var(--c-plan)] text-white" : "border-line-strong bg-surface",
          )}
        >
          {s.done && <Check size={10} weight="bold" />}
        </span>
      </button>
      <InlineEdit value={s.title} onSave={(t) => ctx.renameStep(s, t)} done={s.done} className="text-[14px]" label="la tarea" />
      {s.date ? (
        <button
          type="button"
          onClick={() => ctx.schedule(s)}
          title="Cambiar el día"
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-surface-2 px-2.5 font-mono text-[11.5px] text-fg hover:bg-surface-3"
        >
          <CalendarBlank size={12} aria-hidden />
          {whenLabel(s.date, s.startTime, ctx.today)}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => ctx.schedule(s)}
          aria-label={`Agendar ${s.title}`}
          title="Mandarla a un día del Plan"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
        >
          <CalendarPlus size={17} aria-hidden />
        </button>
      )}
      <button
        type="button"
        onClick={() => ctx.removeStep(s)}
        aria-label={`Borrar ${s.title}`}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-faint hover:bg-surface-2 hover:text-fg lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
      >
        <X size={13} aria-hidden />
      </button>
    </li>
  );
}

// ─── Campos en el lugar ─────────────────────────────────────────────────────

/** Un nombre que se cambia tocándolo: Enter o salir del campo guarda, Escape lo deja como estaba. */
function InlineEdit({ value, onSave, className, done, label }: { value: string; onSave: (v: string) => void; className?: string; done?: boolean; label: string }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  if (!editing)
    return (
      <button
        type="button"
        onClick={() => {
          setText(value);
          setEditing(true);
        }}
        title={`Cambiar ${label}`}
        className={cx("min-w-0 flex-1 text-left leading-snug break-words", done && "text-muted line-through decoration-faint", className)}
      >
        {value}
      </button>
    );
  const save = () => {
    const t = text.trim().replace(/\s+/g, " ");
    setEditing(false);
    if (t && t !== value) onSave(t);
  };
  return (
    <Input
      autoFocus
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          save();
        }
        if (e.key === "Escape") setEditing(false);
      }}
      maxLength={160}
      aria-label={`Nombre de ${label}`}
      className="h-9 min-w-0 flex-1"
    />
  );
}

/** Para sumar varios seguidos: Enter agrega y deja el campo listo para el próximo. */
function InlineAdd({ placeholder, onAdd, onClose }: { placeholder: string; onAdd: (t: string) => void; onClose: () => void }) {
  const [text, setText] = useState("");
  const add = () => {
    const t = text.trim().replace(/\s+/g, " ");
    if (!t) return;
    onAdd(t);
    setText("");
  };
  return (
    <div className="flex items-center gap-2">
      <Input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => !text.trim() && onClose()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
          if (e.key === "Escape") onClose();
        }}
        maxLength={160}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-10 min-w-0 flex-1"
      />
      <Button type="button" size="sm" variant="accent" onMouseDown={(e) => e.preventDefault()} onClick={add}>
        Agregar
      </Button>
    </div>
  );
}

// ─── Hoja: mandar una tarea a un día ────────────────────────────────────────

type ScheduleHandle = { open: (s: StepDTO) => void };

const DAY = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

const ScheduleSheet = forwardRef<
  ScheduleHandle,
  { today: string; onSchedule: (s: StepDTO, date: string, startTime: string | null) => void; onUnschedule: (s: StepDTO) => void }
>(function ScheduleSheet({ today, onSchedule, onUnschedule }, ref) {
  const sheet = useRef<SheetHandle>(null);
  const [step, setStep] = useState<StepDTO | null>(null);
  const [day, setDay] = useState(today);
  const [key, setKey] = useState(0);
  useImperativeHandle(ref, () => ({
    open(s) {
      setStep(s);
      setDay(s.date ?? today);
      setKey((n) => n + 1);
      sheet.current?.open();
    },
  }));
  // Dos semanas desde hoy, de lunes a domingo (así se ve la semana como en el Plan).
  const monday = startOfWeek(today);
  const days = Array.from({ length: 14 }, (_, i) => addDays(monday, i));
  return (
    <Sheet ref={sheet} title={step ? `Agendar · ${step.title}` : "Agendar"}>
      {step && (
        <form
          key={key}
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            onSchedule(step, day, String(fd.get("startTime") ?? "").trim() || null);
            sheet.current?.close();
          }}
        >
          <div className="grid gap-1.5">
            <span className="kicker">Día</span>
            <div className="grid grid-cols-7 gap-1">
              {days.map((d) => {
                const past = d < today;
                return (
                  <button
                    key={d}
                    type="button"
                    disabled={past}
                    aria-pressed={d === day}
                    onClick={() => setDay(d)}
                    className={cx(
                      "grid min-h-12 place-items-center rounded-xl border text-[12px] leading-tight transition-colors disabled:opacity-35",
                      d === day ? "border-accent bg-accent text-on-accent" : d === today ? "border-accent/60 hover:bg-surface-2" : "border-line-strong hover:bg-surface-2",
                    )}
                  >
                    <span>{DAY[new Date(`${d}T00:00:00Z`).getUTCDay()]}</span>
                    <span className="font-mono text-[13px] font-semibold">{Number(d.slice(8))}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5">
              <span className="kicker">Otro día</span>
              <Input type="date" value={day} min={today} onChange={(e) => e.target.value && setDay(e.target.value)} className="min-w-0" />
            </label>
            <label className="grid gap-1.5">
              <span className="kicker">Hora (opcional)</span>
              <TimeInput name="startTime" defaultValue={step.startTime} aria-label="Hora" />
            </label>
          </div>
          <Button type="submit" variant="accent">
            {step.date ? "Cambiar el día" : "Agendar en el Plan"}
          </Button>
          {step.date && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
              <Link href={`/plan?semana=${step.date}`} className="text-[13px] text-accent-fg underline underline-offset-2">
                Ver en el Plan
              </Link>
              <button
                type="button"
                onClick={() => {
                  onUnschedule(step);
                  sheet.current?.close();
                }}
                className="inline-flex min-h-10 items-center rounded-full px-3 text-[13px] text-muted hover:bg-surface-2 hover:text-fg"
              >
                Sacarle el día
              </button>
            </div>
          )}
        </form>
      )}
    </Sheet>
  );
});
