"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Bank, CaretRight, Plus } from "@phosphor-icons/react";
import { ACCOUNT_TYPES, CURRENCIES, currencySymbol } from "@/lib/format";
import { PALETTE, tone } from "@/lib/palette";
import { archiveAccount, deleteAccount, reorderAccounts, saveAccount } from "@/lib/finance-actions";
import {
  ACCOUNT_TYPE_ICON,
  balanceByCurrency,
  centsToInput,
  type AccountDTO,
} from "@/lib/finance-logic";
import { PageHeader } from "@/components/page-header";
import { Button, ConfirmButton, cx, Field, Input, Sheet, type SheetHandle } from "@/components/ui";
import { GastosTabs } from "../gastos-nav";
import { useSelection } from "../selection";
import { AccountAvatar, Balance, EmptyBlock, Fab } from "../shared";

type Draft = {
  id?: string;
  name: string;
  type: string;
  currency: string;
  initial: string;
  color: string;
  archived: boolean;
  txCount: number;
};

const CURRENCY_NAME: Record<string, string> = { UYU: "pesos", USD: "dólares", ARS: "pesos arg.", EUR: "euros", BRL: "reales" };

export function AccountsView({ accounts, openNew }: { accounts: AccountDTO[]; openNew: boolean }) {
  const router = useRouter();
  const { setSelection } = useSelection(accounts);
  const sheet = useRef<SheetHandle>(null);
  const [draft, setDraft] = useState<Draft>(blank());
  const [formKey, setFormKey] = useState(0);
  const [state, action, pending] = useActionState(saveAccount, null);
  const [, startTransition] = useTransition();
  const [sorting, setSorting] = useState(false);
  const [order, setOrder] = useState<string[] | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const active = accounts.filter((a) => !a.archived);
  const archived = accounts.filter((a) => a.archived);
  // Orden optimista mientras se guarda; las cuentas nuevas van al final.
  const sorted = order
    ? [
        ...order.map((id) => active.find((a) => a.id === id)).filter((a): a is AccountDTO => !!a),
        ...active.filter((a) => !order.includes(a.id)),
      ]
    : active;
  const totals = balanceByCurrency(active, null);

  useEffect(() => {
    if (state?.ok) sheet.current?.close();
  }, [state]);

  useEffect(() => {
    if (openNew) {
      open(blank());
      router.replace("/gastos/cuentas");
    }
    // Solo al entrar con ?nueva=1.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openNew]);

  function open(d: Draft) {
    setDraft(d);
    setDeleteError(null);
    setFormKey((k) => k + 1);
    sheet.current?.open();
  }

  function edit(a: AccountDTO) {
    open({
      id: a.id,
      name: a.name,
      type: a.type,
      currency: a.currency,
      initial: a.initialCents < 0 ? `-${centsToInput(a.initialCents)}` : centsToInput(a.initialCents),
      color: a.color,
      archived: a.archived,
      txCount: a.txCount,
    });
  }

  function move(id: string, dir: -1 | 1) {
    const ids = sorted.map((a) => a.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setOrder(ids);
    startTransition(() => reorderAccounts(ids));
  }

  return (
    <>
      <PageHeader
        title="Cuentas"
        tabs={<GastosTabs />}
        actions={
          <>
            {active.length > 1 && (
              <Button variant="ghost" size="sm" onClick={() => setSorting((s) => !s)}>
                {sorting ? "Listo" : "Ordenar"}
              </Button>
            )}
            <Button variant="accent" size="sm" className="max-lg:hidden" onClick={() => open(blank())}>
              <Plus size={16} weight="bold" /> Nueva cuenta
            </Button>
          </>
        }
      />

      <main className="mx-auto max-w-3xl px-4 lg:px-8">
        {active.length === 0 ? (
          <EmptyBlock title="Todavía no hay cuentas" icon={<Bank size={22} aria-hidden />}>
            <p className="max-w-[46ch] text-sm leading-relaxed text-muted">
              Creá una por cada lugar donde tengas plata: efectivo, cada banco, Mercado Pago, la cuenta en dólares.
            </p>
            <Button variant="accent" onClick={() => open(blank())}>
              <Plus size={16} weight="bold" /> Crear cuenta
            </Button>
          </EmptyBlock>
        ) : (
          <>
            <section className="grid gap-3 pt-2 pb-5 lg:pt-6">
              {Object.keys(totals).length > 0 && (
                <dl className="grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-2">
                  {Object.keys(totals)
                    .sort((a, b) => (a === "UYU" ? -1 : b === "UYU" ? 1 : a.localeCompare(b)))
                    .map((c) => {
                      const n = active.filter((a) => a.currency === c).length;
                      return (
                        <div key={c} className="grid gap-1 card card-sm px-3.5 py-3">
                          <dt className="flex items-center justify-between gap-2 text-[13px] text-muted">
                            Total en {CURRENCY_NAME[c] ?? c}
                            <span className="rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[11px]">{c}</span>
                          </dt>
                          <dd className="num text-[clamp(1.5rem,6.4vw,2rem)] leading-tight font-semibold">
                            <Balance cents={totals[c]} currency={c} hero />
                          </dd>
                          <dd className="text-[12px] text-muted">{n === 1 ? "1 cuenta" : `${n} cuentas`}</dd>
                        </div>
                      );
                    })}
                </dl>
              )}
            </section>

            <ul className="card grid gap-0.5 p-1.5">
              {sorted.map((a, i) => (
                <li key={a.id} className="rise flex items-center gap-1" style={{ "--i": i } as React.CSSProperties}>
                  <button
                    type="button"
                    onClick={() => (sorting ? undefined : edit(a))}
                    className="flex min-w-0 flex-1 items-center gap-3.5 rounded-[16px] px-2.5 py-3 text-left transition-colors hover:bg-surface-2"
                  >
                    <AccountAvatar account={a} size={40} />
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="truncate text-[15px] font-medium">{a.name}</span>
                      <span className="text-[13px] text-muted">
                        {ACCOUNT_TYPES[a.type] ?? a.type} · {a.currency}
                      </span>
                    </span>
                    <Balance cents={a.balanceCents} currency={a.currency} className="num text-[17px] font-semibold" />
                    {!sorting && <CaretRight size={14} className="text-muted" aria-hidden />}
                  </button>
                  {sorting && (
                    <span className="flex">
                      <IconBtn label="Subir" disabled={i === 0} onClick={() => move(a.id, -1)}>
                        <ArrowUp size={16} weight="bold" />
                      </IconBtn>
                      <IconBtn label="Bajar" disabled={i === sorted.length - 1} onClick={() => move(a.id, 1)}>
                        <ArrowDown size={16} weight="bold" />
                      </IconBtn>
                    </span>
                  )}
                </li>
              ))}
            </ul>

            {archived.length > 0 && (
              <details className="mt-6 border-t border-line pt-3">
                <summary className="cursor-pointer px-2 py-1 text-sm text-muted select-none">
                  Archivadas ({archived.length})
                </summary>
                <ul className="mt-1 grid gap-0.5">
                  {archived.map((a) => (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => edit(a)}
                        className="flex w-full items-center gap-3.5 rounded-[12px] px-2 py-2.5 text-left opacity-70 transition-colors hover:bg-surface-2"
                      >
                        <AccountAvatar account={a} size={34} />
                        <span className="min-w-0 flex-1 truncate text-[15px]">{a.name}</span>
                        <Balance cents={a.balanceCents} currency={a.currency} className="text-sm text-muted" />
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </main>

      <Fab onClick={() => open(blank())} label="Nueva cuenta" />

      <Sheet ref={sheet} title={draft.id ? "Editar cuenta" : "Nueva cuenta"}>
        <form key={formKey} action={action} className="grid grid-cols-[minmax(0,1fr)] gap-5">
          {draft.id && <input type="hidden" name="id" value={draft.id} />}
          <input type="hidden" name="type" value={draft.type} />
          <input type="hidden" name="currency" value={draft.currency} />
          <input type="hidden" name="color" value={draft.color} />

          <div className="flex items-end gap-3">
            <AccountAvatar account={{ icon: ACCOUNT_TYPE_ICON[draft.type] ?? "Wallet", color: draft.color }} size={40} />
            <Field label="Nombre" className="flex-1">
              <Input
                name="name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                required
                maxLength={60}
                placeholder="Itaú, Efectivo, Dólares…"
              />
            </Field>
          </div>

          <ChipGroup
            label="Tipo"
            value={draft.type}
            options={Object.entries(ACCOUNT_TYPES).map(([value, label]) => ({ value, label }))}
            onChange={(type) => setDraft({ ...draft, type })}
          />

          <ChipGroup
            label="Moneda"
            value={draft.currency}
            options={CURRENCIES.map((c) => ({ value: c, label: c }))}
            onChange={(currency) => setDraft({ ...draft, currency })}
            disabled={!!draft.id && draft.txCount > 0}
            hint={draft.id && draft.txCount > 0 ? "No se cambia en una cuenta con movimientos." : undefined}
          />

          <Field label="Saldo inicial" hint="Lo que tenía la cuenta antes del primer movimiento que cargues. Puede ser negativo.">
            <span className="flex h-11 items-center gap-2 rounded-[12px] border border-line-strong bg-surface-2/60 px-3.5 focus-within:border-accent focus-within:bg-surface focus-within:ring-4 focus-within:ring-[var(--focus)]">
              <span className="text-sm text-muted">{currencySymbol(draft.currency)}</span>
              <input
                name="initialBalance"
                inputMode="decimal"
                autoComplete="off"
                style={{ outline: "none" }}
                value={draft.initial}
                onChange={(e) => setDraft({ ...draft, initial: e.target.value })}
                placeholder="0"
                className="tabular h-full w-0 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
              />
            </span>
          </Field>

          <div className="grid gap-2">
            <span className="text-[13px] font-medium text-muted">Color</span>
            <div className="flex flex-wrap gap-2">
              {PALETTE.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setDraft({ ...draft, color: p })}
                  aria-label={p}
                  style={tone(p)}
                  className={cx(
                    "size-10 rounded-full bg-tone-solid shadow-[inset_0_1px_0_rgba(255,255,255,0.3)] transition-transform duration-300 ease-spring active:scale-90",
                    draft.color === p && "ring-2 ring-fg ring-offset-2 ring-offset-surface",
                  )}
                />
              ))}
            </div>
          </div>

          {state && !state.ok && <p className="text-sm text-danger">{state.error}</p>}
          {deleteError && <p className="text-sm text-danger">{deleteError}</p>}

          <div className="grid gap-2">
            <Button type="submit" variant="accent" disabled={pending} className="h-11">
              {pending ? "Guardando…" : draft.id ? "Guardar cambios" : "Crear cuenta"}
            </Button>
            {draft.id && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSelection([draft.id!]);
                    router.push("/gastos");
                  }}
                >
                  Ver sus movimientos
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    const id = draft.id!;
                    startTransition(() => archiveAccount(id, !draft.archived));
                    sheet.current?.close();
                  }}
                >
                  {draft.archived ? "Desarchivar" : "Archivar cuenta"}
                </Button>
                {draft.txCount === 0 && (
                  <ConfirmButton
                    confirmLabel={`Tocá de nuevo para eliminar "${draft.name}"`}
                    onConfirm={() => {
                      const id = draft.id!;
                      startTransition(async () => {
                        const r = await deleteAccount(id);
                        if (r.ok) sheet.current?.close();
                        else setDeleteError(r.error);
                      });
                    }}
                  >
                    Eliminar cuenta
                  </ConfirmButton>
                )}
              </>
            )}
          </div>
        </form>
      </Sheet>
    </>
  );
}

function blank(): Draft {
  return { name: "", type: "bank", currency: "UYU", initial: "", color: "blue", archived: false, txCount: 0 };
}

function ChipGroup({
  label,
  value,
  options,
  onChange,
  disabled,
  hint,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div className="grid gap-2">
      <span className="text-[13px] font-medium text-muted">{label}</span>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            disabled={disabled && value !== o.value}
            onClick={() => onChange(o.value)}
            className={cx(
              "h-10 rounded-full border px-3.5 text-[13px] transition-colors disabled:opacity-40",
              value === o.value ? "border-fg bg-ink font-medium text-on-ink" : "border-line-strong hover:bg-surface-2",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

function IconBtn({
  label,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...props}
      className="inline-flex size-10 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-30"
    >
      {children}
    </button>
  );
}
