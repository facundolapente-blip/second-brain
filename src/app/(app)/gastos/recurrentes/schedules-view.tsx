"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { ArrowsClockwise, Pause, Play, Plus } from "@phosphor-icons/react";
import { deleteSchedule, saveSchedule, setScheduleActive, type ActionResult } from "@/lib/finance-actions";
import { centsToInput, type AccountDTO, type CategoryDTO } from "@/lib/finance-logic";
import { formatShort, monthBounds } from "@/lib/dates";
import { moneyCents } from "@/lib/format";
import { FREQUENCIES, frequencyLabel, occurrencesBetween, type ScheduleDTO, type ScheduleFrequency } from "@/lib/schedule-logic";
import { PageHeader } from "@/components/page-header";
import { Button, ConfirmButton, cx, Field, Input, inputClass, Segmented, Sheet, type SheetHandle } from "@/components/ui";
import { GastosTabs } from "../gastos-nav";
import { CategoryAvatar, EmptyBlock, Fab, useLookups } from "../shared";

type Kind = ScheduleDTO["kind"];
const KIND_OPTIONS: { value: Kind; label: string }[] = [
  { value: "expense", label: "Gasto" },
  { value: "income", label: "Ingreso" },
  { value: "transfer", label: "Transferencia" },
];

/** Alquiler, sueldo, suscripciones: se cargan solos cuando toca. */
export function SchedulesView({
  accounts,
  categories,
  schedules,
  today,
}: {
  accounts: AccountDTO[];
  categories: CategoryDTO[];
  schedules: ScheduleDTO[];
  today: string;
}) {
  const lk = useLookups(accounts, categories);
  const sheet = useRef<SheetHandle>(null);
  const [editing, setEditing] = useState<ScheduleDTO | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [, start] = useTransition();

  function open(s: ScheduleDTO | null) {
    setEditing(s);
    setFormKey((k) => k + 1);
    sheet.current?.open();
  }

  // Lo que falta cargarse este mes, por moneda (gastos e ingresos).
  const monthEnd = monthBounds(today.slice(0, 7)).to;
  const pending = { expense: new Map<string, number>(), income: new Map<string, number>() };
  for (const s of schedules) {
    if (!s.active || !s.nextDate || s.kind === "transfer") continue;
    const n = occurrencesBetween(s, s.nextDate, monthEnd).length;
    if (!n) continue;
    const cur = lk.currencyOf(s.accountId);
    pending[s.kind].set(cur, (pending[s.kind].get(cur) ?? 0) + n * s.amountCents);
  }
  const fmt = (m: Map<string, number>) => [...m].map(([c, v]) => moneyCents(v, c)).join(" + ") || "$ 0";

  return (
    <>
      <PageHeader
        title="Recurrentes"
        tabs={<GastosTabs />}
        actions={
          <Button size="sm" onClick={() => open(null)} className="hidden lg:inline-flex">
            <Plus size={15} weight="bold" aria-hidden /> Nuevo recurrente
          </Button>
        }
      />
      <main className="mx-auto grid max-w-3xl gap-5 px-4 pt-2 lg:px-10 lg:pt-6">
        {schedules.length === 0 ? (
          <EmptyBlock title="Sin recurrentes todavía" icon={<ArrowsClockwise size={22} aria-hidden />}>
            <p className="max-w-[48ch] text-sm leading-relaxed text-muted">
              El alquiler, el sueldo, Spotify, la cuota del gimnasio: lo que se repite se carga solo el día que toca.
              Arranca desde hoy, así no se duplica lo que ya cargaste.
            </p>
            <Button onClick={() => open(null)}>
              <Plus size={15} weight="bold" aria-hidden /> Nuevo recurrente
            </Button>
          </EmptyBlock>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-3">
              <div className="grid gap-1 rounded-2xl border border-line bg-surface p-4">
                <dt className="kicker">Falta pagar este mes</dt>
                <dd className="figure text-[24px]">{fmt(pending.expense)}</dd>
              </div>
              <div className="grid gap-1 rounded-2xl border border-line bg-surface p-4">
                <dt className="kicker">Falta cobrar este mes</dt>
                <dd className="figure text-[24px]">{fmt(pending.income)}</dd>
              </div>
            </dl>
            <ul className="grid divide-y divide-line border-y border-line">
              {schedules.map((s, i) => {
                const acc = lk.account(s.accountId);
                const cur = acc?.currency ?? "UYU";
                const title =
                  s.title ||
                  (s.kind === "transfer"
                    ? `${acc?.name ?? "?"} a ${lk.account(s.toAccountId)?.name ?? "?"}`
                    : (lk.category(s.categoryId)?.name ?? "Sin título"));
                return (
                  <li key={s.id} className="rise" style={{ "--i": i } as React.CSSProperties}>
                    <button
                      type="button"
                      onClick={() => open(s)}
                      className={cx(
                        "flex min-h-16 w-full items-center gap-3 py-2.5 text-left transition-colors hover:bg-surface-2",
                        !s.active && "opacity-60",
                      )}
                    >
                      <CategoryAvatar category={lk.category(s.categoryId)} transfer={s.kind === "transfer"} />
                      <span className="grid min-w-0 flex-1 gap-0.5">
                        <span className="truncate text-[15px] font-medium">{title}</span>
                        <span className="truncate text-[12.5px] text-muted">
                          {frequencyLabel(s.frequency, s.interval)} · {acc?.name ?? "?"}
                          {s.active ? (s.nextDate ? ` · próximo ${formatShort(s.nextDate)}` : " · terminado") : " · en pausa"}
                        </span>
                      </span>
                      <span
                        className={cx(
                          "tabular text-[15px] font-medium",
                          s.kind === "income" && "fin-income",
                        )}
                      >
                        {s.kind === "income" ? "+" : s.kind === "expense" ? "−" : ""} {moneyCents(s.amountCents, cur)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </main>

      <Fab onClick={() => open(null)} label="Nuevo recurrente" />

      <Sheet ref={sheet} title={editing ? "Editar recurrente" : "Nuevo recurrente"}>
        <ScheduleForm
          key={formKey}
          schedule={editing}
          accounts={accounts.filter((a) => !a.archived || a.id === editing?.accountId || a.id === editing?.toAccountId)}
          categories={categories}
          today={today}
          onDone={() => sheet.current?.close()}
          onToggle={(s) =>
            start(async () => {
              await setScheduleActive(s.id, !s.active);
              sheet.current?.close();
            })
          }
          onDelete={(s) =>
            start(async () => {
              await deleteSchedule(s.id);
              sheet.current?.close();
            })
          }
        />
      </Sheet>
    </>
  );
}

function ScheduleForm({
  schedule: s,
  accounts,
  categories,
  today,
  onDone,
  onToggle,
  onDelete,
}: {
  schedule: ScheduleDTO | null;
  accounts: AccountDTO[];
  categories: CategoryDTO[];
  today: string;
  onDone: () => void;
  onToggle: (s: ScheduleDTO) => void;
  onDelete: (s: ScheduleDTO) => void;
}) {
  const [kind, setKind] = useState<Kind>(s?.kind ?? "expense");
  const [accountId, setAccountId] = useState(s?.accountId ?? accounts[0]?.id ?? "");
  const [toAccountId, setToAccountId] = useState(s?.toAccountId ?? accounts.find((a) => a.id !== accountId)?.id ?? "");
  const [frequency, setFrequency] = useState<ScheduleFrequency>(s?.frequency ?? "monthly");
  const [state, action, saving] = useActionState<ActionResult | null, FormData>(saveSchedule, null);

  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);

  const from = accounts.find((a) => a.id === accountId);
  const to = accounts.find((a) => a.id === toAccountId);
  const cats = categories.filter((c) => c.kind === kind && !c.adjustment);

  return (
    <form action={action} className="grid gap-4">
      {s && <input type="hidden" name="id" value={s.id} />}
      <Segmented name="kind" value={kind} onChange={setKind} options={KIND_OPTIONS} />

      <div className="grid grid-cols-2 gap-3">
        <Field label={kind === "transfer" ? "Monto que sale" : "Monto"}>
          <Input name="amount" inputMode="decimal" required defaultValue={centsToInput(s?.amountCents)} placeholder="0" autoFocus={!s} />
        </Field>
        <Field label="Título">
          <Input name="title" defaultValue={s?.title ?? ""} placeholder={kind === "income" ? "Sueldo" : "Alquiler"} maxLength={120} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label={kind === "transfer" ? "Desde" : "Cuenta"}>
          <select name="accountId" value={accountId} onChange={(e) => setAccountId(e.target.value)} className={inputClass}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.currency})
              </option>
            ))}
          </select>
        </Field>
        {kind === "transfer" ? (
          <Field label="Hacia">
            <select name="toAccountId" value={toAccountId} onChange={(e) => setToAccountId(e.target.value)} className={inputClass}>
              {accounts
                .filter((a) => a.id !== accountId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </option>
                ))}
            </select>
          </Field>
        ) : (
          <Field label="Categoría">
            <select name="categoryId" defaultValue={s?.categoryId ?? ""} className={inputClass}>
              <option value="">Sin clasificar</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>

      {kind === "transfer" && from && to && from.currency !== to.currency && (
        <Field label={`Monto que llega (${to.currency})`}>
          <Input name="toAmount" inputMode="decimal" required defaultValue={centsToInput(s?.toAmountCents)} />
        </Field>
      )}

      <div className="grid grid-cols-[1fr_6rem] gap-3">
        <Field label="Se repite">
          <select
            name="frequency"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as ScheduleFrequency)}
            className={inputClass}
          >
            {FREQUENCIES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Cada">
          <Input name="interval" type="number" min={1} max={60} defaultValue={s?.interval ?? 1} disabled={frequency === "once"} />
        </Field>
      </div>

      <div className="grid grid-cols-2 items-start gap-3">
        <Field label={frequency === "once" ? "Día" : "Primera vez"} hint={s ? undefined : "Arranca desde hoy; no carga los que ya pasaron."}>
          <Input name="startDate" type="date" required defaultValue={s?.startDate ?? today} />
        </Field>
        {frequency !== "once" && (
          <Field label="Hasta (opcional)">
            <Input name="endDate" type="date" defaultValue={s?.endDate ?? ""} />
          </Field>
        )}
      </div>

      <Field label="Nota">
        <Input name="note" defaultValue={s?.note ?? ""} maxLength={2000} />
      </Field>

      {state && !state.ok && (
        <p role="alert" className="text-[13px] text-danger">
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button type="submit" disabled={saving} className="flex-1">
          {saving ? "Guardando…" : "Guardar"}
        </Button>
        {s && (
          <>
            <Button type="button" variant="outline" onClick={() => onToggle(s)}>
              {s.active ? <Pause size={15} aria-hidden /> : <Play size={15} aria-hidden />}
              {s.active ? "Pausar" : "Reanudar"}
            </Button>
            <ConfirmButton onConfirm={() => onDelete(s)}>Borrar</ConfirmButton>
          </>
        )}
      </div>
      {s && s.generated > 0 && (
        <p className="text-[12.5px] text-muted">
          Ya cargó {s.generated === 1 ? "1 movimiento" : `${s.generated} movimientos`}. Si lo borrás, esos quedan.
        </p>
      )}
    </form>
  );
}
