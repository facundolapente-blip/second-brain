"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Plus, Target } from "@phosphor-icons/react";
import { addToGoal, archiveGoal, deleteGoal, saveGoal, type ActionResult } from "@/lib/finance-actions";
import type { GoalDTO } from "@/lib/finance";
import { centsToInput, type AccountDTO } from "@/lib/finance-logic";
import { diffDays, formatShort } from "@/lib/dates";
import { CURRENCIES, moneyCents } from "@/lib/format";
import { PALETTE, tone } from "@/lib/palette";
import { FinanceIcon } from "@/lib/finance-icons";
import { PageHeader } from "@/components/page-header";
import { Button, ConfirmButton, cx, Field, Input, inputClass, Sheet, type SheetHandle } from "@/components/ui";
import { GastosTabs } from "../gastos-nav";
import { Fab } from "../shared";

/** Cuánto hay que juntar por mes para llegar a la fecha. */
function perMonth(g: GoalDTO, today: string) {
  if (!g.deadline || g.savedCents >= g.targetCents) return null;
  const months = Math.max(1, diffDays(g.deadline, today) / 30.4);
  return Math.ceil((g.targetCents - g.savedCents) / months / 100) * 100;
}

export function GoalsView({ goals, accounts, today }: { goals: GoalDTO[]; accounts: AccountDTO[]; today: string }) {
  const sheet = useRef<SheetHandle>(null);
  const addSheet = useRef<SheetHandle>(null);
  const [editing, setEditing] = useState<GoalDTO | null>(null);
  const [adding, setAdding] = useState<GoalDTO | null>(null);
  const [key, setKey] = useState(0);
  const active = goals.filter((g) => !g.archived);
  const archived = goals.filter((g) => g.archived);

  function edit(g: GoalDTO | null) {
    setEditing(g);
    setKey((k) => k + 1);
    sheet.current?.open();
  }

  return (
    <>
      <PageHeader
        title="Metas de ahorro"
        tabs={<GastosTabs />}
        actions={
          <Button size="sm" className="max-lg:hidden" onClick={() => edit(null)}>
            <Plus size={15} weight="bold" aria-hidden /> Nueva meta
          </Button>
        }
      />
      <main className="mx-auto grid max-w-3xl gap-4 px-4 pt-2 pb-10 lg:max-w-6xl lg:px-10 lg:pt-6">
        {active.length === 0 ? (
          <div className="grid justify-items-start gap-2 rounded-[20px] border border-dashed border-line-strong p-5">
            <Target size={24} className="text-accent-fg" aria-hidden />
            <p className="text-[15px] font-medium">Ninguna meta todavía</p>
            <p className="max-w-[56ch] text-[13.5px] leading-relaxed text-muted">
              Por ejemplo &ldquo;US$ 2.000 para el viaje antes de marzo&rdquo;. Vinculala a una cuenta (Inversiones prex) y el
              avance es su saldo, o sumá a mano lo que vas guardando. Te dice cuánto juntar por mes.
            </p>
            <Button size="sm" onClick={() => edit(null)}>
              <Plus size={14} weight="bold" aria-hidden /> Nueva meta
            </Button>
          </div>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {active.map((g, i) => {
              const pct = g.targetCents ? Math.min(100, Math.round((g.savedCents / g.targetCents) * 100)) : 0;
              const monthly = perMonth(g, today);
              const acc = g.accountId ? accounts.find((a) => a.id === g.accountId) : null;
              const left = g.deadline ? diffDays(g.deadline, today) : null;
              return (
                <li key={g.id} className="rise grid gap-3 rounded-[20px] border border-line bg-surface p-4 lg:p-5" style={{ "--i": i } as React.CSSProperties}>
                  <button type="button" onClick={() => edit(g)} className="flex items-center gap-3 text-left">
                    <span style={tone(g.color)} className="chip-solid inline-flex size-11 shrink-0 items-center justify-center rounded-xl">
                      <FinanceIcon name={g.icon} size={20} weight="fill" aria-hidden />
                    </span>
                    <span className="grid min-w-0 flex-1">
                      <span className="truncate text-[16px] font-semibold">{g.name}</span>
                      <span className="text-[12.5px] text-muted">
                        {acc ? `Saldo de ${acc.name}` : "Cargado a mano"}
                        {g.deadline && ` · para el ${formatShort(g.deadline)}`}
                        {left !== null && left < 0 && " (vencida)"}
                      </span>
                    </span>
                  </button>
                  <div className="grid gap-1.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="figure text-[26px]">{moneyCents(g.savedCents, g.currency)}</span>
                      <span className="tabular text-[13px] text-muted">
                        de {moneyCents(g.targetCents, g.currency)} · {pct}%
                      </span>
                    </div>
                    <span className="h-2.5 overflow-hidden rounded-full bg-surface-3">
                      <span
                        className="block h-full rounded-full transition-[width] duration-700"
                        style={{ width: `${pct}%`, background: pct >= 100 ? "var(--st-done-line)" : "var(--accent)" }}
                      />
                    </span>
                    <p className={cx("text-[13px]", pct >= 100 ? "text-[var(--st-done-fg)]" : "text-muted")}>
                      {pct >= 100
                        ? "¡Llegaste!"
                        : monthly
                          ? `Te faltan ${moneyCents(g.targetCents - g.savedCents, g.currency)}: juntá ${moneyCents(monthly, g.currency)} por mes.`
                          : `Te faltan ${moneyCents(g.targetCents - g.savedCents, g.currency)}.`}
                    </p>
                  </div>
                  {!g.accountId && pct < 100 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="justify-self-start"
                      onClick={() => {
                        setAdding(g);
                        setKey((k) => k + 1);
                        addSheet.current?.open();
                      }}
                    >
                      <Plus size={14} weight="bold" aria-hidden /> Sumar lo que guardé
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {archived.length > 0 && (
          <p className="text-[13px] text-muted">
            Archivadas: {archived.map((g) => g.name).join(", ")}.{" "}
            {archived.map((g) => (
              <button key={g.id} type="button" onClick={() => edit(g)} className="underline underline-offset-4">
                Editar {g.name}
              </button>
            ))}
          </p>
        )}
      </main>

      <Fab onClick={() => edit(null)} label="Nueva meta" />

      <Sheet ref={sheet} title={editing ? "Editar meta" : "Nueva meta"}>
        <GoalForm key={key} goal={editing} accounts={accounts} onDone={() => sheet.current?.close()} />
      </Sheet>
      <Sheet ref={addSheet} title={adding ? `Sumar a ${adding.name}` : "Sumar"}>
        {adding && <AddForm key={key} goal={adding} onDone={() => addSheet.current?.close()} />}
      </Sheet>
    </>
  );
}

const ICONS = ["PiggyBank", "Airplane", "House", "Car", "Laptop", "GraduationCap", "Gift", "Heartbeat"];

function GoalForm({ goal, accounts, onDone }: { goal: GoalDTO | null; accounts: AccountDTO[]; onDone: () => void }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(saveGoal, null);
  const [icon, setIcon] = useState(goal?.icon ?? "PiggyBank");
  const [color, setColor] = useState(goal?.color ?? "green");
  const [, start] = useTransition();
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
  return (
    <form action={action} className="grid gap-4">
      {goal && <input type="hidden" name="id" value={goal.id} />}
      <input type="hidden" name="icon" value={icon} />
      <input type="hidden" name="color" value={color} />
      <Field label="Nombre">
        <Input name="name" required maxLength={80} defaultValue={goal?.name} placeholder="Viaje a Europa" autoFocus={!goal} />
      </Field>
      <div className="grid grid-cols-[1fr_6.5rem] gap-3">
        <Field label="Cuánto querés juntar">
          <Input name="target" inputMode="decimal" required defaultValue={centsToInput(goal?.targetCents)} placeholder="0" />
        </Field>
        <Field label="Moneda">
          <select name="currency" defaultValue={goal?.currency ?? "UYU"} className={inputClass}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Para cuándo (opcional)">
        <Input name="deadline" type="date" defaultValue={goal?.deadline ?? ""} />
      </Field>
      <Field label="¿Dónde lo juntás?" hint="Con una cuenta, el avance es su saldo. Sin cuenta, lo sumás a mano.">
        <select name="accountId" defaultValue={goal?.accountId ?? ""} className={inputClass}>
          <option value="">A mano</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.currency})
            </option>
          ))}
        </select>
      </Field>
      <div className="grid gap-2">
        <span className="kicker">Ícono y color</span>
        <div className="flex flex-wrap gap-1.5">
          {ICONS.map((ic) => (
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
      {state && !state.ok && <p className="text-[13px] text-danger">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Guardar"}
      </Button>
      {goal && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              start(async () => {
                await archiveGoal(goal.id, !goal.archived);
                onDone();
              })
            }
          >
            {goal.archived ? "Desarchivar" : "Archivar"}
          </Button>
          <ConfirmButton
            onConfirm={() =>
              start(async () => {
                await deleteGoal(goal.id);
                onDone();
              })
            }
          >
            Borrar meta
          </ConfirmButton>
        </div>
      )}
    </form>
  );
}

function AddForm({ goal, onDone }: { goal: GoalDTO; onDone: () => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await addToGoal(goal.id, value);
          if (r.ok) onDone();
          else setError(r.error);
        });
      }}
    >
      <Field label="Cuánto guardaste" hint="Con un menos adelante lo resta (si sacaste plata).">
        <Input inputMode="decimal" autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder="0" />
      </Field>
      {error && <p className="text-[13px] text-danger">{error}</p>}
      <Button type="submit" disabled={pending || !value.trim()}>
        {pending ? "Sumando…" : "Sumar"}
      </Button>
    </form>
  );
}
