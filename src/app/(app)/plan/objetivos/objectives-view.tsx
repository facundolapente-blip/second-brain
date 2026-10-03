"use client";

import { forwardRef, useActionState, useEffect, useEffectEvent, useImperativeHandle, useRef, useState, useTransition } from "react";
import { ArrowsClockwise, Lightning, Plus } from "@phosphor-icons/react";
import { deleteKeyResult, saveKeyResult } from "@/lib/plan-actions";
import { formatShort } from "@/lib/dates";
import {
  daysLeft,
  daysLeftLabel,
  KR_STATUS,
  progressPct,
  QUARTERS,
  type KeyResultDTO,
  type KrStatus,
  type ObjectiveDTO,
} from "@/lib/plan-logic";
import { PageHeader } from "@/components/page-header";
import { Button, ConfirmButton, cx, Field, Input, inputClass, Segmented, Sheet, type SheetHandle } from "@/components/ui";
import { ProgressSquares, StatusPill } from "../plan-ui";
import { PlanTabs } from "../plan-nav";

type Quarter = "all" | (typeof QUARTERS)[number];

/** Avance de un resultado clave: completado = 100; si no, progreso sobre meta. */
function krPct(k: KeyResultDTO): number | null {
  if (k.status === "done") return 100;
  return progressPct(k.progress, k.goal);
}

function objectivePct(o: ObjectiveDTO): number | null {
  const ps = o.keyResults.map(krPct).filter((p): p is number => p !== null);
  return ps.length ? Math.round(ps.reduce((a, b) => a + b, 0) / ps.length) : null;
}

const fmtNum = (n: number) => n.toLocaleString("es-UY", { maximumFractionDigits: 2 });

export function ObjectivesView({
  objectives,
  loose,
  today,
}: {
  objectives: ObjectiveDTO[];
  loose: KeyResultDTO[];
  today: string;
}) {
  const [quarter, setQuarter] = useState<Quarter>("all");
  const [showClosed, setShowClosed] = useState(true);
  const sheet = useRef<KrSheetHandle>(null);
  const match = (k: KeyResultDTO) =>
    (quarter === "all" || k.quarters.includes(quarter)) && (showClosed || (k.status !== "done" && k.status !== "closed"));
  const groups = [
    ...objectives.map((o) => ({ ...o, keyResults: o.keyResults.filter(match) })),
    ...(loose.length ? [{ id: "", title: "Sin objetivo", keyResults: loose.filter(match) }] : []),
  ].filter((g) => g.keyResults.length > 0);

  return (
    <>
      <PageHeader
        title="Objetivos"
        tabs={<PlanTabs />}
        actions={
          <Button variant="accent" size="sm" className="max-lg:hidden" onClick={() => sheet.current?.open()}>
            <Plus size={16} weight="bold" /> Nuevo resultado
          </Button>
        }
      />
      <main className="mx-auto max-w-3xl px-4 lg:px-8">
        <div className="flex flex-wrap items-center gap-3 py-3 lg:pt-5">
          <div className="w-full max-w-sm">
            <Segmented
              value={quarter}
              onChange={setQuarter}
              options={[{ value: "all", label: "Todo" }, ...QUARTERS.map((q) => ({ value: q, label: q }))]}
            />
          </div>
          <label className="flex min-h-11 items-center gap-2 text-[13px] text-muted">
            <input
              type="checkbox"
              checked={showClosed}
              onChange={(e) => setShowClosed(e.target.checked)}
              className="size-4 accent-[var(--accent)]"
            />
            Mostrar terminados
          </label>
        </div>

        {groups.length === 0 ? (
          <div className="mt-2 grid justify-items-start gap-3 rounded-[14px] border border-dashed border-line-strong p-6">
            <p className="text-sm text-muted">No hay resultados clave para este filtro.</p>
            <Button variant="outline" size="sm" onClick={() => sheet.current?.open()}>
              <Plus size={15} /> Nuevo resultado
            </Button>
          </div>
        ) : (
          <div className="grid gap-6 pb-4">
            {groups.map((g, gi) => {
              const pct = objectivePct(g);
              return (
                <section key={g.id || "loose"} className="rise grid gap-2" style={{ "--i": gi } as React.CSSProperties}>
                  <header className="flex items-end justify-between gap-3 px-1">
                    <h2 className="text-[17px] font-semibold tracking-tight">{g.title.replace(/^\d+\s+/, "")}</h2>
                    {pct !== null && <span className="tabular text-[13px] font-medium text-muted">{pct}%</span>}
                  </header>
                  {pct !== null && (
                    <div className="mx-1 h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                      <div className="h-full rounded-full bg-[var(--st-done-line)]" style={{ width: `${pct}%` }} />
                    </div>
                  )}
                  <ul className="grid gap-2 pt-1">
                    {g.keyResults.map((k) => (
                      <KrRow key={k.id} kr={k} today={today} onOpen={() => sheet.current?.open(k)} />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </main>

      <button
        type="button"
        onClick={() => sheet.current?.open()}
        aria-label="Nuevo resultado clave"
        className="fixed right-5 bottom-[calc(92px+env(safe-area-inset-bottom))] z-20 inline-flex size-14 items-center justify-center rounded-[18px] bg-accent text-on-accent shadow-[0_6px_20px_-6px_var(--shadow-tint)] transition-transform active:scale-95 lg:hidden"
      >
        <Plus size={26} weight="bold" />
      </button>

      <KrSheet ref={sheet} objectives={objectives} />
    </>
  );
}

function KrRow({ kr: k, today, onOpen }: { kr: KeyResultDTO; today: string; onOpen: () => void }) {
  const pct = krPct(k);
  const st = KR_STATUS[k.status];
  const left = k.status === "todo" || k.status === "doing" ? daysLeft(k.deadline, today) : null;
  const finished = k.status === "done" || k.status === "closed";
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="grid w-full gap-2 rounded-[14px] border border-line bg-surface p-3.5 text-left transition-colors hover:border-line-strong"
      >
        <span className="flex items-start gap-3">
          <span className={cx("min-w-0 flex-1 text-[15px] leading-snug font-medium", finished && "text-muted")}>
            {k.title}
          </span>
          {left !== null && (
            <span className={cx("tabular shrink-0 text-[12px] font-medium", left < 0 ? "text-danger" : "text-muted")}>
              {daysLeftLabel(left)}
            </span>
          )}
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          <StatusPill label={st.label} toneKey={st.tone} />
          <span className="inline-flex items-center gap-1 text-[12px] text-muted">
            {k.kind === "habit" ? <ArrowsClockwise size={13} aria-hidden /> : <Lightning size={13} aria-hidden />}
            {k.kind === "habit" ? "Hábito" : "Actividad"}
          </span>
          {k.quarters.length > 0 && <span className="text-[12px] text-faint">{k.quarters.join(", ")}</span>}
          {k.deadline && <span className="tabular text-[12px] text-faint">{formatShort(k.deadline)}</span>}
        </span>
        {pct !== null && (
          <ProgressSquares
            pct={pct}
            label={k.goal ? `${fmtNum(k.progress ?? 0)} de ${fmtNum(k.goal)}` : undefined}
          />
        )}
      </button>
    </li>
  );
}

type KrSheetHandle = { open: (kr?: KeyResultDTO) => void };

const KrSheet = forwardRef<KrSheetHandle, { objectives: ObjectiveDTO[] }>(function KrSheet({ objectives }, ref) {
  const sheet = useRef<SheetHandle>(null);
  const [kr, setKr] = useState<KeyResultDTO | undefined>();
  const [key, setKey] = useState(0);
  useImperativeHandle(ref, () => ({
    open(k) {
      setKr(k);
      setKey((n) => n + 1);
      sheet.current?.open();
    },
  }));
  return (
    <Sheet ref={sheet} title={kr ? "Editar resultado clave" : "Nuevo resultado clave"}>
      <KrForm key={key} kr={kr} objectives={objectives} onDone={() => sheet.current?.close()} />
    </Sheet>
  );
});

function KrForm({ kr, objectives, onDone }: { kr?: KeyResultDTO; objectives: ObjectiveDTO[]; onDone: () => void }) {
  const [state, action, pending] = useActionState(saveKeyResult, null);
  const [kind, setKind] = useState<"activity" | "habit">(kr?.kind ?? "activity");
  const [status, setStatus] = useState<KrStatus>(kr?.status ?? "todo");
  const [objectiveId, setObjectiveId] = useState(kr?.objectiveId ?? objectives[0]?.id ?? "");
  const [deleting, startDelete] = useTransition();
  const notify = useEffectEvent(onDone);
  useEffect(() => {
    if (state?.ok) notify();
  }, [state]);

  return (
    <form action={action} className="grid gap-5">
      {kr && <input type="hidden" name="id" value={kr.id} />}
      <Field label="Nombre">
        <Input name="title" defaultValue={kr?.title} required maxLength={160} autoFocus={!kr} placeholder="Producir 3 tracks, Leer 3 por semana..." />
      </Field>

      <Field label="Objetivo">
        <select
          name="objectiveId"
          value={objectiveId}
          onChange={(e) => setObjectiveId(e.target.value)}
          className={cx(inputClass, "pr-8")}
        >
          {objectives.map((o) => (
            <option key={o.id} value={o.id}>
              {o.title}
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
        <span className="text-[13px] font-medium text-muted">Tipo</span>
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
        <span className="text-[13px] font-medium text-muted">Estado</span>
        <Segmented
          name="status"
          value={status}
          onChange={setStatus}
          options={(["todo", "doing", "done", "closed"] as KrStatus[]).map((s) => ({ value: s, label: KR_STATUS[s].label }))}
        />
      </div>

      <div className="grid gap-1.5">
        <span className="text-[13px] font-medium text-muted">Trimestres</span>
        <div className="grid grid-cols-4 gap-1.5">
          {QUARTERS.map((q) => (
            <label
              key={q}
              className="flex h-10 cursor-pointer items-center justify-center rounded-[10px] border border-line text-[13px] font-medium text-muted transition-colors select-none has-checked:border-accent has-checked:bg-accent-soft has-checked:text-accent-fg"
            >
              <input type="checkbox" name="quarters" value={q} defaultChecked={kr?.quarters.includes(q)} className="sr-only" />
              {q}
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Progreso">
          <Input name="progress" inputMode="decimal" defaultValue={kr?.progress ?? ""} />
        </Field>
        <Field label="Meta">
          <Input name="goal" inputMode="decimal" defaultValue={kr?.goal ?? ""} />
        </Field>
        <Field label="Deadline">
          <Input type="date" name="deadline" defaultValue={kr?.deadline ?? ""} />
        </Field>
      </div>

      {state && !state.ok && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      <div className="grid gap-2">
        <Button type="submit" variant="accent" disabled={pending}>
          {pending ? "Guardando..." : kr ? "Guardar cambios" : "Crear resultado"}
        </Button>
        {kr && (
          <ConfirmButton
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
