"use client";

import { safeForm, useSafeTransition } from "@/components/safe-action";
import { useOnNew } from "@/components/nav-add";
import { forwardRef, useActionState, useEffect, useEffectEvent, useImperativeHandle, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowsClockwise, CalendarPlus, Lightning, PencilSimple, Plus } from "@phosphor-icons/react";
import { copyToYear, deleteKeyResult, deleteObjective, saveKeyResult, saveObjective } from "@/lib/offline/plan";
import { formatShort } from "@/lib/dates";
import {
  daysLeft,
  daysLeftLabel,
  KR_STATUS,
  progressPct,
  QUARTERS,
  type KeyResultDTO,
  type KrLinkOption,
  type KrStatus,
  type ObjectiveDTO,
} from "@/lib/plan-logic";
import { PageHeader } from "@/components/page-header";
import { Button, ConfirmButton, cx, Field, Input, inputClass, Segmented, Sheet, type SheetHandle } from "@/components/ui";
import { ProgressBar, StatusPill } from "../plan-ui";
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
  links,
  today,
  year,
  years,
}: {
  objectives: ObjectiveDTO[];
  loose: KeyResultDTO[];
  links: KrLinkOption[];
  today: string;
  year: number;
  years: number[];
}) {
  const [quarter, setQuarter] = useState<Quarter>("all");
  const [showClosed, setShowClosed] = useState(true);
  const sheet = useRef<KrSheetHandle>(null);
  useOnNew(() => sheet.current?.open());
  const objSheet = useRef<SheetHandle>(null);
  const planSheet = useRef<SheetHandle>(null);
  const [editingObj, setEditingObj] = useState<ObjectiveDTO | null>(null);
  const [objKey, setObjKey] = useState(0);
  const nextYear = Math.max(...years) + 1;
  const match = (k: KeyResultDTO) =>
    (quarter === "all" || k.quarters.includes(quarter)) && (showClosed || (k.status !== "done" && k.status !== "closed"));
  const groups = [
    ...objectives.map((o) => ({ ...o, keyResults: o.keyResults.filter(match), empty: o.keyResults.length === 0 })),
    ...(loose.length ? [{ id: "", title: "Sin objetivo", year, keyResults: loose.filter(match), empty: false }] : []),
  ].filter((g) => g.keyResults.length > 0 || (g.empty && quarter === "all"));

  function openObjective(o: ObjectiveDTO | null) {
    setEditingObj(o);
    setObjKey((k) => k + 1);
    objSheet.current?.open();
  }

  return (
    <>
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
      <main className="mx-auto max-w-3xl px-4 lg:max-w-6xl lg:px-10">
        {/* Un año por pestaña, como las hojas de Notion. */}
        <nav aria-label="Año" className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pt-3 pb-1">
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
        <ObjectivesSummary krs={groups.flatMap((g) => g.keyResults)} today={today} />
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
          <div className="mt-2 grid justify-items-start gap-3 border-y border-line py-8">
            <p className="display text-[20px] text-muted">
              {objectives.length || loose.length ? "No hay resultados clave para este filtro." : `Todavía no hay objetivos para ${year}.`}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => openObjective(null)}>
                <Plus size={15} /> Nuevo objetivo
              </Button>
              {!objectives.length && !loose.length && years.some((y) => y < year) && (
                <Button variant="outline" size="sm" onClick={() => planSheet.current?.open()}>
                  <CalendarPlus size={15} /> Traer de {Math.max(...years.filter((y) => y < year))}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="grid gap-12 pt-2 pb-4 lg:grid-cols-2 lg:items-start lg:gap-5">
            {groups.map((g, gi) => {
              const pct = objectivePct(g);
              return (
                <section
                  key={g.id || "loose"}
                  className="rise grid gap-3 lg:rounded-2xl lg:border lg:border-[var(--card-ring)] lg:bg-surface lg:px-6 lg:pt-5 lg:pb-2 lg:shadow-[var(--card-shadow)]"
                  style={{ "--i": gi } as React.CSSProperties}
                >
                  <header className="flex items-end justify-between gap-3">
                    <h2 className="display min-w-0 text-[28px] lg:text-[24px]">{g.title.replace(/^\d+\s+/, "")}</h2>
                    <span className="flex shrink-0 items-center gap-1">
                      {pct !== null && <span className="figure pb-1 text-[26px] text-muted">{pct}%</span>}
                      {g.id && (
                        <button
                          type="button"
                          onClick={() => openObjective(objectives.find((o) => o.id === g.id) ?? null)}
                          aria-label={`Editar ${g.title}`}
                          className="inline-flex size-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-fg"
                        >
                          <PencilSimple size={17} />
                        </button>
                      )}
                    </span>
                  </header>
                  {g.empty && (
                    <button
                      type="button"
                      onClick={() => sheet.current?.open()}
                      className="flex h-11 items-center gap-1.5 border-t border-line text-[13.5px] text-muted hover:text-fg"
                    >
                      <Plus size={14} /> Agregar un resultado clave
                    </button>
                  )}
                  {pct !== null && (
                    <div className="h-[3px] overflow-hidden bg-line" aria-hidden>
                      <div className="h-full bg-[var(--st-done-line)]" style={{ width: `${pct}%` }} />
                    </div>
                  )}
                  <ul className="grid border-t border-line lg:[&>li:last-child>button]:border-b-0">
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


      <KrSheet ref={sheet} objectives={objectives} links={links} year={year} />

      <Sheet ref={objSheet} title={editingObj ? "Editar objetivo" : `Nuevo objetivo ${year}`}>
        <ObjectiveForm key={objKey} objective={editingObj} year={year} onDone={() => objSheet.current?.close()} />
      </Sheet>

      <Sheet ref={planSheet} title={`Planificar ${nextYear}`}>
        <PlanYearForm objectives={objectives} loose={loose} from={year} to={nextYear} onDone={() => planSheet.current?.close()} />
      </Sheet>
    </>
  );
}

/** Crear o renombrar un objetivo; borrarlo manda también sus resultados clave a la papelera. */
function ObjectiveForm({ objective, year, onDone }: { objective: ObjectiveDTO | null; year: number; onDone: () => void }) {
  const [state, action, pending] = useActionState(safeForm(saveObjective), null);
  const [, startDelete] = useSafeTransition();
  const notify = useEffectEvent(onDone);
  useEffect(() => {
    if (state?.ok) notify();
  }, [state]);
  return (
    <form action={action} className="grid gap-5">
      {objective && <input type="hidden" name="id" value={objective.id} />}
      <input type="hidden" name="year" value={objective?.year ?? year} />
      <Field label="Objetivo">
        <Input name="title" defaultValue={objective?.title} required maxLength={120} autoFocus placeholder="Salud, Carrera, Finanzas…" />
      </Field>
      {state && !state.ok && <p className="text-sm text-danger">{state.error}</p>}
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
  const groups = [...objectives, ...(loose.length ? [{ id: "", title: "Sin objetivo", year: from, keyResults: loose }] : [])];
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
                  <input type="checkbox" checked={objs.has(o.id)} onChange={() => toggleObjective(o)} className="size-4 accent-[var(--accent)]" />
                  {o.title}
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
      {error && <p className="text-sm text-danger">{error}</p>}
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
        <Button variant="ghost" className="h-11" onClick={() => {
          onDone();
          router.push(`/plan/objetivos?anio=${to}`);
        }}>
          Empezar {to} de cero
        </Button>
      </div>
    </div>
  );
}

function KrRow({ kr: raw, today, onOpen }: { kr: KeyResultDTO; today: string; onOpen: () => void }) {
  // Si se mide solo, el progreso sale del vínculo.
  const k = raw.auto ? { ...raw, progress: raw.auto.progress, goal: raw.auto.goal ?? raw.goal } : raw;
  const pct = krPct(k);
  const st = KR_STATUS[k.status];
  const left = k.status === "todo" || k.status === "doing" ? daysLeft(k.deadline, today) : null;
  const finished = k.status === "done" || k.status === "closed";
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="grid w-full gap-2 border-b border-line px-1 py-4 text-left transition-colors hover:bg-surface-2/50"
      >
        <span className="flex items-start gap-3">
          <span className={cx("min-w-0 flex-1 text-[16px] leading-snug font-medium", finished && "text-muted")}>
            {k.title}
          </span>
          {left !== null && (
            <span className={cx("shrink-0 font-mono text-[11px] font-medium tabular", left < 0 ? "text-danger" : "text-muted")}>
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
          {k.quarters.length > 0 && <span className="font-mono text-[11px] text-muted">{k.quarters.join(", ")}</span>}
          {k.deadline && <span className="font-mono text-[11px] text-muted tabular">{formatShort(k.deadline)}</span>}
          {raw.auto && <span className="text-[12px] text-accent-fg">· se mide solo: {raw.auto.label}</span>}
        </span>
        {pct !== null && (
          <ProgressBar
            pct={pct}
            label={k.goal ? `${fmtNum(k.progress ?? 0)} de ${fmtNum(k.goal)}` : undefined}
          />
        )}
      </button>
    </li>
  );
}

type KrSheetHandle = { open: (kr?: KeyResultDTO) => void };

const KrSheet = forwardRef<KrSheetHandle, { objectives: ObjectiveDTO[]; links: KrLinkOption[]; year: number }>(function KrSheet({ objectives, links, year }, ref) {
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
      <KrForm key={key} kr={kr} objectives={objectives} links={links} year={year} onDone={() => sheet.current?.close()} />
    </Sheet>
  );
});

function KrForm({
  kr,
  objectives,
  links,
  year,
  onDone,
}: {
  kr?: KeyResultDTO;
  objectives: ObjectiveDTO[];
  links: KrLinkOption[];
  year: number;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(safeForm(saveKeyResult), null);
  const [kind, setKind] = useState<"activity" | "habit">(kr?.kind ?? "activity");
  const [status, setStatus] = useState<KrStatus>(kr?.status ?? "todo");
  const [objectiveId, setObjectiveId] = useState(kr?.objectiveId ?? objectives[0]?.id ?? "");
  const [deleting, startDelete] = useSafeTransition();
  const notify = useEffectEvent(onDone);
  useEffect(() => {
    if (state?.ok) notify();
  }, [state]);

  return (
    <form action={action} className="grid gap-5">
      {kr && <input type="hidden" name="id" value={kr.id} />}
      <input type="hidden" name="year" value={year} />
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
              <input type="checkbox" name="quarters" value={q} defaultChecked={kr?.quarters.includes(q)} className="sr-only" />
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

/**
 * Resumen de la computadora (sobre lo filtrado): avance promedio en el bloque
 * destacado, terminados, en curso y vencidos.
 */
function ObjectivesSummary({ krs, today }: { krs: KeyResultDTO[]; today: string }) {
  if (krs.length === 0) return null;
  const pcts = krs.map(krPct).filter((p): p is number => p !== null);
  const avg = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0;
  const done = krs.filter((k) => k.status === "done").length;
  const doing = krs.filter((k) => k.status === "doing").length;
  const late = krs.filter((k) => (k.status === "todo" || k.status === "doing") && (daysLeft(k.deadline, today) ?? 0) < 0).length;
  const tiles = [
    { label: "Terminados", value: String(done), hint: `de ${krs.length} resultados clave` },
    { label: "En curso", value: String(doing), hint: "arrancados" },
    { label: "Vencidos", value: String(late), hint: late ? "con el deadline pasado" : "nada atrasado" },
  ];
  return (
    <dl className="hidden grid-cols-4 gap-4 pt-6 pb-2 lg:grid">
      <div className="hero grid content-start gap-1 rounded-2xl px-5 pt-4 pb-4">
        <dt className="hero-sub font-mono text-[11px] tracking-[0.08em] uppercase">Avance promedio</dt>
        <dd className="figure pt-1 text-[36px]">{avg}%</dd>
        <dd className="mt-1 h-1.5 overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--hero-fg)_18%,transparent)]" aria-hidden>
          <span className="block h-full rounded-full bg-[var(--hero-fg)]" style={{ width: `${avg}%` }} />
        </dd>
      </div>
      {tiles.map((t) => (
        <div key={t.label} className="grid content-start gap-1 rounded-2xl border border-line bg-surface px-5 pt-4 pb-4">
          <dt className="font-mono text-[11px] tracking-[0.08em] text-muted uppercase">{t.label}</dt>
          <dd className="figure pt-1 text-[36px]">{t.value}</dd>
          <dd className="text-[12.5px] text-muted">{t.hint}</dd>
        </div>
      ))}
    </dl>
  );
}
