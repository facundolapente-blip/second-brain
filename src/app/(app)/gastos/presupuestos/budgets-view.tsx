"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { CaretRight, PiggyBank, Plus } from "@phosphor-icons/react";
import { saveCategoryBudget, saveProject, type ActionResult } from "@/lib/finance-actions";
import { centsToInput, type CategoryDTO } from "@/lib/finance-logic";
import {
  budgetState,
  monthShare,
  STATE_LABEL,
  type BudgetState,
  type CategoryBudgetDTO,
  type ProjectDTO,
} from "@/lib/budget-logic";
import { formatShort } from "@/lib/dates";
import { CURRENCIES, moneyCents } from "@/lib/format";
import { PALETTE, tone } from "@/lib/palette";
import { FinanceIcon } from "@/lib/finance-icons";
import { PageHeader } from "@/components/page-header";
import { Button, ConfirmButton, cx, Field, Input, inputClass, Sheet, type SheetHandle } from "@/components/ui";
import { GastosTabs } from "../gastos-nav";
import { CategoryAvatar, MonthNav } from "../shared";

const STATE_TONE: Record<BudgetState, { bar: string; text: string }> = {
  ok: { bar: "var(--st-done-line)", text: "text-[var(--st-done-fg)]" },
  ahead: { bar: "var(--st-skip-line)", text: "text-[var(--st-skip-fg)]" },
  near: { bar: "var(--st-skip-line)", text: "text-[var(--st-skip-fg)]" },
  over: { bar: "var(--st-fail-line)", text: "text-[var(--st-fail-fg)]" },
};

export function BudgetsView({
  month,
  today,
  categories,
  budgets,
  unbudgeted,
  projects,
}: {
  month: string;
  today: string;
  categories: CategoryDTO[];
  budgets: CategoryBudgetDTO[];
  unbudgeted: { categoryId: string | null; spentCents: number }[];
  projects: ProjectDTO[];
}) {
  const catById = new Map(categories.map((c) => [c.id, c]));
  const share = monthShare(month, today);
  const editSheet = useRef<SheetHandle>(null);
  const projectSheet = useRef<SheetHandle>(null);
  const [editing, setEditing] = useState<{ category: CategoryDTO; budget?: CategoryBudgetDTO } | null>(null);
  const [projectKey, setProjectKey] = useState(0);

  const uyu = budgets.filter((b) => b.currency === "UYU");
  const totalBudget = uyu.reduce((n, b) => n + b.amountCents, 0);
  const totalSpent = uyu.reduce((n, b) => n + b.spentCents, 0);
  const total = budgetState(totalSpent, totalBudget, share);
  const sorted = [...budgets].sort((a, b) => b.spentCents / b.amountCents - a.spentCents / a.amountCents);
  const without = categories.filter((c) => !budgets.some((b) => b.categoryId === c.id));
  const spentWithout = new Map(unbudgeted.map((u) => [u.categoryId, u.spentCents]));

  function edit(category: CategoryDTO, budget?: CategoryBudgetDTO) {
    setEditing({ category, budget });
    editSheet.current?.open();
  }

  return (
    <>
      <PageHeader
        title="Presupuestos"
        wide
        tabs={<GastosTabs />}
        actions={
          <Button
            size="sm"
            className="max-lg:hidden"
            onClick={() => {
              setProjectKey((k) => k + 1);
              projectSheet.current?.open();
            }}
          >
            <Plus size={15} weight="bold" aria-hidden /> Presupuesto puntual
          </Button>
        }
      />
      <main className="mx-auto grid max-w-3xl grid-cols-1 gap-6 px-4 pt-2 pb-10 lg:max-w-6xl lg:grid-cols-12 lg:gap-8 lg:px-10 lg:pt-6">
        {/* Mensual por categoría */}
        <section aria-label="Presupuesto mensual por categoría" className="grid content-start gap-4 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="display text-[22px]">Mensual por categoría</h2>
            <div className="-mr-2">
              <MonthNav month={month} basePath="/gastos/presupuestos" current={today.slice(0, 7)} />
            </div>
          </div>

          {budgets.length > 0 && (
            <div className="hero grid gap-3 rounded-[20px] p-5">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p className="hero-sub text-[12.5px]">Gastado en categorías con presupuesto</p>
                  <p className="figure mt-1 text-[34px]">
                    {moneyCents(totalSpent)} <span className="hero-sub text-[18px]">de {moneyCents(totalBudget)}</span>
                  </p>
                </div>
                <p className="hero-sub text-[13px]">
                  {totalSpent <= totalBudget
                    ? `Quedan ${moneyCents(totalBudget - totalSpent)}`
                    : `Te pasaste ${moneyCents(totalSpent - totalBudget)}`}
                </p>
              </div>
              <Meter spent={totalSpent} budget={totalBudget} share={share} state={total} onHero />
              {share !== null && (
                <p className="hero-sub text-[12.5px]">
                  Pasó el {Math.round(share * 100)}% del mes: a esta altura &ldquo;tocaba&rdquo; haber gastado{" "}
                  {moneyCents(Math.round((totalBudget * share) / 100) * 100)}. {STATE_LABEL[total]}.
                </p>
              )}
            </div>
          )}

          {sorted.length === 0 ? (
            <div className="grid justify-items-start gap-2 rounded-[20px] border border-dashed border-line-strong p-5">
              <PiggyBank size={24} className="text-accent-fg" aria-hidden />
              <p className="text-[15px] font-medium">Todavía no hay presupuestos</p>
              <p className="max-w-[52ch] text-[13.5px] leading-relaxed text-muted">
                Elegí una categoría de abajo y poné cuánto querés gastar por mes. Se repite todos los meses y vas
                viendo cuánto te queda.
              </p>
            </div>
          ) : (
            <ul className="grid gap-2.5">
              {sorted.map((b, i) => {
                const c = catById.get(b.categoryId);
                if (!c) return null;
                const st = budgetState(b.spentCents, b.amountCents, share);
                return (
                  <li key={b.categoryId} className="rise" style={{ "--i": i } as React.CSSProperties}>
                    <button
                      type="button"
                      onClick={() => edit(c, b)}
                      className="grid w-full gap-2.5 rounded-2xl border border-line bg-surface p-4 text-left transition-colors hover:bg-surface-2/60"
                    >
                      <span className="flex items-center gap-3">
                        <CategoryAvatar category={c} size={34} />
                        <span className="grid min-w-0 flex-1">
                          <span className="truncate text-[15px] font-medium">{c.name}</span>
                          <span className={cx("text-[12.5px]", STATE_TONE[st].text)}>{STATE_LABEL[st]}</span>
                        </span>
                        <span className="grid justify-items-end">
                          <span className="tabular text-[15px] font-medium">
                            {moneyCents(b.spentCents, b.currency)}
                            <span className="text-muted"> / {moneyCents(b.amountCents, b.currency)}</span>
                          </span>
                          <span className="text-[12.5px] text-muted">
                            {b.spentCents <= b.amountCents
                              ? `Quedan ${moneyCents(b.amountCents - b.spentCents, b.currency)}`
                              : `${moneyCents(b.spentCents - b.amountCents, b.currency)} de más`}
                          </span>
                        </span>
                      </span>
                      <Meter spent={b.spentCents} budget={b.amountCents} share={share} state={st} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {without.length > 0 && (
            <div className="grid gap-2">
              <p className="kicker">Sin presupuesto</p>
              <ul className="grid divide-y divide-line rounded-2xl border border-line bg-surface">
                {without.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => edit(c)}
                      className="flex min-h-14 w-full items-center gap-3 px-4 text-left transition-colors hover:bg-surface-2/60"
                    >
                      <CategoryAvatar category={c} size={30} />
                      <span className="min-w-0 flex-1 truncate text-[14px]">{c.name}</span>
                      {(spentWithout.get(c.id) ?? 0) > 0 && (
                        <span className="tabular text-[13px] text-muted">{moneyCents(spentWithout.get(c.id)!)} este mes</span>
                      )}
                      <span className="inline-flex items-center gap-1 text-[13px] font-medium text-accent-fg">
                        <Plus size={13} weight="bold" aria-hidden /> Poner
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {(spentWithout.get(null) ?? 0) > 0 && (
                <p className="text-[12.5px] text-muted">
                  Además hay {moneyCents(spentWithout.get(null)!)} sin clasificar este mes.{" "}
                  <Link href="/gastos/sin-clasificar" className="underline underline-offset-4">
                    Clasificarlos
                  </Link>
                </p>
              )}
            </div>
          )}
        </section>

        {/* Puntuales */}
        <section aria-label="Presupuestos puntuales" className="grid content-start gap-4 lg:col-span-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="display text-[22px]">Puntuales</h2>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setProjectKey((k) => k + 1);
                projectSheet.current?.open();
              }}
            >
              <Plus size={14} weight="bold" aria-hidden /> Nuevo
            </Button>
          </div>
          <p className="-mt-2 text-[13.5px] leading-relaxed text-muted">
            Para un viaje, las vacaciones, una mudanza: un monto total y los gastos que le vas asignando.
          </p>
          {projects.length === 0 ? (
            <div className="rounded-[20px] border border-dashed border-line-strong p-5 text-[13.5px] text-muted">
              Todavía no hay ninguno. Creá uno con &ldquo;Nuevo&rdquo; y después, al cargar un gasto, elegí a qué
              presupuesto va.
            </div>
          ) : (
            <ul className="grid gap-2.5">
              {projects.map((p, i) => {
                const st = budgetState(p.spentCents, p.amountCents, null);
                const pct = p.amountCents ? Math.min(100, Math.round((p.spentCents / p.amountCents) * 100)) : 0;
                return (
                  <li key={p.id} className="rise" style={{ "--i": i } as React.CSSProperties}>
                    <Link
                      href={`/gastos/presupuestos/${p.id}`}
                      className={cx(
                        "grid gap-3 rounded-2xl border border-line bg-surface p-4 transition-colors hover:bg-surface-2/60",
                        p.archived && "opacity-60",
                      )}
                    >
                      <span className="flex items-center gap-3">
                        <span
                          style={tone(p.color)}
                          className="chip-solid inline-flex size-10 shrink-0 items-center justify-center rounded-xl"
                        >
                          <FinanceIcon name={p.icon} size={19} weight="fill" aria-hidden />
                        </span>
                        <span className="grid min-w-0 flex-1">
                          <span className="truncate text-[15px] font-medium">{p.name}</span>
                          <span className="text-[12.5px] text-muted">
                            {p.archived
                              ? "Archivado"
                              : p.startDate || p.endDate
                                ? [p.startDate && formatShort(p.startDate), p.endDate && formatShort(p.endDate)].filter(Boolean).join(" al ")
                                : `${p.txCount} ${p.txCount === 1 ? "movimiento" : "movimientos"}`}
                          </span>
                        </span>
                        <CaretRight size={14} className="text-muted" aria-hidden />
                      </span>
                      <span className="grid gap-1.5">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="figure text-[22px]">{moneyCents(p.spentCents, p.currency)}</span>
                          <span className="tabular text-[13px] text-muted">de {moneyCents(p.amountCents, p.currency)}</span>
                        </span>
                        <span className="h-2 overflow-hidden rounded-full bg-surface-3">
                          <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: STATE_TONE[st].bar }} />
                        </span>
                        <span className={cx("text-[12.5px]", STATE_TONE[st].text)}>
                          {p.spentCents <= p.amountCents
                            ? `Quedan ${moneyCents(p.amountCents - p.spentCents, p.currency)}`
                            : `Te pasaste ${moneyCents(p.spentCents - p.amountCents, p.currency)}`}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>

      <button
        type="button"
        onClick={() => {
          setProjectKey((k) => k + 1);
          projectSheet.current?.open();
        }}
        aria-label="Nuevo presupuesto puntual"
        className="lift fixed right-4 bottom-[calc(84px+env(safe-area-inset-bottom))] z-20 inline-flex size-14 items-center justify-center rounded-full bg-ink text-on-ink transition-transform active:scale-95 lg:hidden"
      >
        <Plus size={24} />
      </button>

      <Sheet ref={editSheet} title={editing ? `Presupuesto de ${editing.category.name}` : "Presupuesto"}>
        {editing && (
          <BudgetForm
            key={`${editing.category.id}-${editing.budget?.amountCents ?? 0}`}
            category={editing.category}
            budget={editing.budget}
            onDone={() => editSheet.current?.close()}
          />
        )}
      </Sheet>

      <Sheet ref={projectSheet} title="Nuevo presupuesto puntual">
        <ProjectForm key={projectKey} onDone={() => projectSheet.current?.close()} />
      </Sheet>
    </>
  );
}

/** Barra de lo gastado contra el presupuesto, con una marca de dónde "tocaría" estar hoy. */
function Meter({
  spent,
  budget,
  share,
  state,
  onHero,
}: {
  spent: number;
  budget: number;
  share: number | null;
  state: BudgetState;
  onHero?: boolean;
}) {
  const pct = budget ? Math.min(100, (spent / budget) * 100) : 0;
  return (
    <span className={cx("relative block h-2.5 rounded-full", onHero ? "bg-white/20" : "bg-surface-3")}>
      <span
        className="block h-full rounded-full transition-[width] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{ width: `${pct}%`, background: onHero ? "white" : STATE_TONE[state].bar }}
      />
      {share !== null && (
        <span
          aria-hidden
          title="Lo esperado a esta altura del mes"
          className={cx("absolute -top-1 h-[18px] w-0.5 rounded-full", onHero ? "bg-white/70" : "bg-fg/50")}
          style={{ left: `calc(${share * 100}% - 1px)` }}
        />
      )}
    </span>
  );
}

function BudgetForm({ category, budget, onDone }: { category: CategoryDTO; budget?: CategoryBudgetDTO; onDone: () => void }) {
  const [value, setValue] = useState(centsToInput(budget?.amountCents));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function save(raw: string) {
    start(async () => {
      const r = await saveCategoryBudget(category.id, raw);
      if (r.ok) onDone();
      else setError(r.error);
    });
  }
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        save(value);
      }}
    >
      <Field label="Por mes, en pesos" hint="Se repite todos los meses. Cuentan los gastos de tus cuentas en pesos.">
        <Input inputMode="decimal" autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder="0" />
      </Field>
      {error && (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending} className="flex-1">
          {pending ? "Guardando…" : "Guardar"}
        </Button>
        {budget && <ConfirmButton onConfirm={() => save("")}>Sacar presupuesto</ConfirmButton>}
      </div>
    </form>
  );
}

const PROJECT_ICONS = ["Airplane", "Suitcase", "House", "Gift", "Car", "GraduationCap", "Confetti", "Heartbeat"];

/** Formulario de presupuesto puntual (también lo usa el detalle para editar). */
export function ProjectForm({ project, onDone }: { project?: ProjectDTO; onDone: () => void }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(saveProject, null);
  const [icon, setIcon] = useState(project?.icon ?? "Airplane");
  const [color, setColor] = useState(project?.color ?? "teal");
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
  return (
    <form action={action} className="grid gap-4">
      {project && <input type="hidden" name="id" value={project.id} />}
      <input type="hidden" name="icon" value={icon} />
      <input type="hidden" name="color" value={color} />
      <Field label="Nombre">
        <Input name="name" required maxLength={80} defaultValue={project?.name} placeholder="Viaje a Brasil" autoFocus={!project} />
      </Field>
      <div className="grid grid-cols-[1fr_6.5rem] gap-3">
        <Field label="Monto total">
          <Input name="amount" inputMode="decimal" required defaultValue={centsToInput(project?.amountCents)} placeholder="0" />
        </Field>
        <Field label="Moneda">
          <select name="currency" defaultValue={project?.currency ?? "UYU"} className={inputClass}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Desde (opcional)">
          <Input name="startDate" type="date" defaultValue={project?.startDate ?? ""} />
        </Field>
        <Field label="Hasta (opcional)">
          <Input name="endDate" type="date" defaultValue={project?.endDate ?? ""} />
        </Field>
      </div>
      <div className="grid gap-2">
        <span className="kicker">Ícono y color</span>
        <div className="flex flex-wrap gap-1.5">
          {PROJECT_ICONS.map((ic) => (
            <button
              key={ic}
              type="button"
              aria-pressed={icon === ic}
              aria-label={ic}
              onClick={() => setIcon(ic)}
              style={tone(color)}
              className={cx(
                "inline-flex size-10 items-center justify-center rounded-xl border transition-colors",
                icon === ic ? "chip-solid border-transparent" : "border-line-strong text-muted hover:text-fg",
              )}
            >
              <FinanceIcon name={ic} size={18} weight="fill" />
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PALETTE.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={color === p}
              aria-label={p}
              onClick={() => setColor(p)}
              style={tone(p)}
              className={cx("chip-solid size-8 rounded-full", color === p && "ring-2 ring-fg ring-offset-2 ring-offset-[var(--surface)]")}
            />
          ))}
        </div>
      </div>
      <Field label="Nota">
        <Input name="note" maxLength={2000} defaultValue={project?.note ?? ""} placeholder="Opcional" />
      </Field>
      {state && !state.ok && (
        <p role="alert" className="text-[13px] text-danger">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Guardar"}
      </Button>
    </form>
  );
}
