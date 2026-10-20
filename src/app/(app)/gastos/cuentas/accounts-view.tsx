"use client";

import { useGastosNew } from "../new-action";
import { safeForm, useSafeTransition } from "@/components/safe-action";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Bank, CaretRight, Coins, CurrencyDollar, Plus } from "@phosphor-icons/react";
import { StatTile, TintedCard } from "@/components/tinted-card";
import { ACCOUNT_TYPES, CURRENCIES, currencySymbol } from "@/lib/format";
import { PALETTE, tone } from "@/lib/palette";
import { archiveAccount, deleteAccount, reorderAccounts, saveAccount } from "@/lib/offline/finance";
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
import { BalanceAdjuster } from "./balance-adjuster";
import { CardPanel } from "./card-panel";
import type { CardSummary } from "@/lib/card-logic";
import { NetWorth } from "./net-worth";
import { ReserveCard, type ReserveData } from "./reserve-card";
import { AccountAvatar, Balance, EmptyBlock } from "../shared";
import { Tick } from "../motion";

type Draft = {
  id?: string;
  name: string;
  type: string;
  currency: string;
  initial: string;
  color: string;
  archived: boolean;
  txCount: number;
  closingDay: string;
  dueDay: string;
  limit: string;
  business: boolean;
};

const CURRENCY_NAME: Record<string, string> = { UYU: "pesos", USD: "dólares", ARS: "pesos arg.", EUR: "euros", BRL: "reales" };

export function AccountsView({
  accounts,
  cards,
  today,
  openNew,
  netWorth,
  reserve,
}: {
  accounts: AccountDTO[];
  cards: CardSummary[];
  today: string;
  openNew: boolean;
  netWorth: { series: { month: string; cents: number }[]; business: { month: string; cents: number }[] | null; usdRate: number | null };
  reserve: ReserveData;
}) {
  const router = useRouter();
  const { setSelection } = useSelection(accounts);
  const sheet = useRef<SheetHandle>(null);
  const [draft, setDraft] = useState<Draft>(blank());
  const [formKey, setFormKey] = useState(0);
  const [state, action, pending] = useActionState(safeForm(saveAccount), null);
  const [, startTransition] = useSafeTransition();
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
  // Los totales son personales: las cuentas de trabajo (la empresa) van aparte.
  const personal = active.filter((a) => !a.business);
  const totals = balanceByCurrency(personal, null);
  const hasBusiness = active.some((a) => a.business);

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

  // El "+" de la barra de abajo crea acá.
  useGastosNew(() => open(blank()));
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
      closingDay: a.closingDay ? String(a.closingDay) : "",
      dueDay: a.dueDay ? String(a.dueDay) : "",
      limit: a.limitCents ? centsToInput(a.limitCents) : "",
      business: a.business,
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
        wide
        tabs={<GastosTabs />}
        actions={
          <Button variant="accent" size="sm" className="max-lg:hidden" onClick={() => open(blank())}>
            <Plus size={16} weight="bold" /> Nueva cuenta
          </Button>
        }
      />

      <main className="mx-auto max-w-3xl px-4 pb-6 lg:max-w-6xl lg:px-10 lg:pb-10">
        {active.length === 0 ? (
          <EmptyBlock title="Todavía no hay cuentas" icon={<Bank size={22} weight="fill" />} className="mt-2 lg:mt-6">
            <p className="max-w-[46ch] text-sm leading-relaxed text-muted">
              Creá una por cada lugar donde tengas plata: efectivo, cada banco, Mercado Pago, la cuenta en dólares.
            </p>
            <Button variant="accent" onClick={() => open(blank())}>
              <Plus size={16} weight="bold" /> Crear cuenta
            </Button>
          </EmptyBlock>
        ) : (
          <div className="grid gap-4 pt-2 lg:pt-6">
            {/* Totales personales por moneda: tarjetas de cifra con cómo se reparte entre las cuentas. */}
            {Object.keys(totals).length > 0 && (
              <div className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] lg:gap-4">
                {Object.keys(totals)
                  .sort((a, b) => (a === "UYU" ? -1 : b === "UYU" ? 1 : a.localeCompare(b)))
                  .map((c) => {
                    const mine = personal.filter((a) => a.currency === c);
                    return (
                      <StatTile
                        key={c}
                        icon={c === "UYU" ? Coins : CurrencyDollar}
                        label={`Total en ${CURRENCY_NAME[c] ?? c}`}
                        figure={
                          // Un ajuste de saldo o una cuenta nueva: el total cambia con un tic.
                          <Tick value={totals[c]} className="text-[clamp(1.9rem,8vw,2.5rem)]">
                            <Balance cents={totals[c]} currency={c} hero />
                          </Tick>
                        }
                        sub={`${mine.length === 1 ? "1 cuenta" : `${mine.length} cuentas`}${hasBusiness ? ", sin las de trabajo" : ""}`}
                      >
                        <AccountMix accounts={mine} />
                      </StatTile>
                    );
                  })}
              </div>
            )}

            <div className={cx("grid gap-4", netWorth.business && "lg:grid-cols-2")}>
              <NetWorth series={netWorth.series} usdRate={netWorth.usdRate} title={netWorth.business ? "Patrimonio personal" : undefined} />
              {netWorth.business && (
                <NetWorth
                  business
                  series={netWorth.business}
                  usdRate={null}
                  title="Patrimonio de la empresa"
                  note={`Las cuentas de trabajo: ${accounts.filter((a) => a.business && !a.archived).map((a) => a.name).join(", ")}.`}
                />
              )}
            </div>
            <ReserveCard data={reserve} />

            {cards.length > 0 && (
              <div className="grid gap-4 lg:grid-cols-2">
                {cards.map((c) => (
                  <CardPanel key={c.accountId} card={c} today={today} />
                ))}
              </div>
            )}

            <TintedCard
              icon={Bank}
              title="Cuentas"
              meta={`${active.length === 1 ? "1 cuenta" : `${active.length} cuentas`}${hasBusiness ? ` · ${active.length - personal.length} de trabajo` : ""}`}
              action={
                active.length > 1 ? (
                  <button type="button" onClick={() => setSorting((s) => !s)} aria-pressed={sorting} className="tcard-pill press">
                    {sorting ? "Listo" : "Ordenar"}
                  </button>
                ) : undefined
              }
              bodyClassName="gap-0! px-4! pt-1! pb-2! lg:gap-4! lg:p-5!"
            >
              <ul className="grid divide-y divide-line lg:grid-cols-3 lg:gap-3 lg:divide-y-0">
                {sorted.map((a, i) => (
                  <li
                    key={a.id}
                    className={cx(
                      "rise fin-hover-lg flex min-w-0 items-center gap-1 lg:rounded-2xl lg:border lg:border-line lg:bg-surface lg:pr-2",
                      // La última fila de la grilla de tres se estira: sin huecos.
                      i === sorted.length - 1 && (sorted.length % 3 === 1 ? "lg:col-span-3" : sorted.length % 3 === 2 && "lg:col-span-2"),
                    )}
                    style={{ "--i": i } as React.CSSProperties}
                  >
                    <button
                      type="button"
                      onClick={() => (sorting ? undefined : edit(a))}
                      className="flex min-h-16 min-w-0 flex-1 items-center gap-3.5 px-1 py-3 text-left transition-colors hover:bg-surface-2/70 lg:grid lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-x-3 lg:gap-y-5 lg:rounded-2xl lg:p-4"
                    >
                      <AccountAvatar account={a} size={40} />
                      <span className="grid min-w-0 flex-1 gap-0.5">
                        <span className="truncate text-[15px] font-medium">{a.name}</span>
                        {a.business && <span className="w-fit shrink-0 justify-self-start rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted">Trabajo</span>}
                        <span className="text-[13px] text-muted">
                          {ACCOUNT_TYPES[a.type] ?? a.type} · {a.currency}
                        </span>
                      </span>
                      <span className="lg:col-span-2 lg:flex lg:min-w-0 lg:flex-wrap lg:items-baseline lg:justify-between lg:gap-x-3 lg:gap-y-1">
                        <Balance
                          cents={a.balanceCents}
                          currency={a.currency}
                          className="font-mono text-[14px] font-medium lg:font-sans lg:text-[26px] lg:font-semibold lg:tracking-[-0.035em]"
                        />
                        <span className="hidden font-mono text-[11.5px] whitespace-nowrap text-muted tabular lg:inline">
                          {a.txCount === 1 ? "1 movimiento" : `${a.txCount.toLocaleString("es-UY")} movimientos`}
                        </span>
                      </span>
                      {!sorting && <CaretRight size={14} className="text-muted lg:hidden" aria-hidden />}
                    </button>
                    {sorting && (
                      <span className="reveal flex">
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
                <details className="border-t border-line pt-1 lg:pt-2">
                  <summary className="kicker inline-flex min-h-11 cursor-pointer items-center px-1 select-none hover:text-fg">
                    Archivadas ({archived.length})
                  </summary>
                  <ul className="mt-1 grid gap-0.5">
                    {archived.map((a) => (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => edit(a)}
                          className="flex w-full items-center gap-3.5 px-1 py-2.5 text-left opacity-70 transition-colors hover:bg-surface-2"
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
            </TintedCard>
          </div>
        )}
      </main>

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

          {draft.type === "card" && (
            <div className="grid gap-3 rounded-xl bg-surface-2 p-3">
              <p className="text-[12.5px] text-muted">
                Con el día de cierre y de vencimiento la app calcula cuánto viene en cada resumen. Los pagos son transferencias
                desde tu cuenta a la tarjeta.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Día de cierre">
                  <Input
                    name="closingDay"
                    type="number"
                    min={1}
                    max={31}
                    inputMode="numeric"
                    value={draft.closingDay}
                    onChange={(e) => setDraft({ ...draft, closingDay: e.target.value })}
                    placeholder="Ej. 25"
                  />
                </Field>
                <Field label="Día de vencimiento">
                  <Input
                    name="dueDay"
                    type="number"
                    min={1}
                    max={31}
                    inputMode="numeric"
                    value={draft.dueDay}
                    onChange={(e) => setDraft({ ...draft, dueDay: e.target.value })}
                    placeholder="Ej. 5"
                  />
                </Field>
              </div>
              <Field label="Límite (opcional)">
                <Input
                  name="creditLimit"
                  inputMode="decimal"
                  value={draft.limit}
                  onChange={(e) => setDraft({ ...draft, limit: e.target.value })}
                  placeholder="0"
                />
              </Field>
            </div>
          )}

          <label className="flex min-h-11 items-start gap-3 rounded-xl border border-line px-3 py-2.5 text-sm">
            <input
              type="checkbox"
              name="business"
              checked={draft.business}
              onChange={(e) => setDraft({ ...draft, business: e.target.checked })}
              className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
            />
            <span className="grid gap-0.5">
              <span className="font-medium">Cuenta de trabajo</span>
              <span className="text-[12.5px] text-muted">No suma a tu patrimonio personal: va en el patrimonio de la empresa.</span>
            </span>
          </label>

          <Field label="Saldo inicial" hint="Lo que tenía la cuenta antes del primer movimiento. Para corregir el saldo de hoy (o de un día pasado) usá Ajustar saldo, abajo.">
            <span className="flex h-10 items-center gap-2 rounded-[4px] border border-line-strong bg-surface px-3 focus-within:border-fg/40 focus-within:ring-2 focus-within:ring-[var(--focus)]">
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
            <span className="kicker">Color</span>
            <div className="flex flex-wrap gap-2">
              {PALETTE.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setDraft({ ...draft, color: p })}
                  aria-label={p}
                  style={tone(p)}
                  className={cx(
                    "chip-solid size-8 rounded-full transition-transform active:scale-90",
                    draft.color === p && "ring-2 ring-fg ring-offset-2 ring-offset-surface",
                  )}
                />
              ))}
            </div>
          </div>

          {state && !state.ok && <p className="reveal text-sm text-danger">{state.error}</p>}
          {deleteError && <p className="reveal text-sm text-danger">{deleteError}</p>}

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
        {draft.id && (
          <div className="mt-4 border-t border-line pt-4">
            <BalanceAdjuster
              key={`adj-${formKey}`}
              accountId={draft.id}
              currency={draft.currency}
              balanceCents={accounts.find((a) => a.id === draft.id)?.balanceCents ?? 0}
              onDone={() => sheet.current?.close()}
            />
          </div>
        )}
      </Sheet>
    </>
  );
}

/**
 * Cómo se reparte el total de una moneda entre las cuentas: barra partida (cada cuenta
 * en su color, las de saldo 0 o negativo no cuentan) y la que más tiene escrita debajo.
 */
function AccountMix({ accounts }: { accounts: AccountDTO[] }) {
  const rows = accounts.filter((a) => a.balanceCents > 0).sort((a, b) => b.balanceCents - a.balanceCents);
  const total = rows.reduce((n, a) => n + a.balanceCents, 0);
  if (!total || rows.length === 0) return null;
  const pct = (c: number) => Math.round((c / total) * 100);
  return (
    <div className="grid gap-1.5">
      <span
        className="flex h-2 gap-[2px] overflow-hidden rounded-full"
        role="img"
        aria-label={`Reparto: ${rows.map((a) => `${a.name} ${pct(a.balanceCents)}%`).join(", ")}`}
      >
        {rows.map((a) => (
          <span key={a.id} style={{ ...tone(a.color), width: `${(a.balanceCents / total) * 100}%` }} className="bar-anim h-full min-w-[3px] bg-tone-solid" />
        ))}
      </span>
      <span className="tmini-cap">
        <span className="truncate">{rows[0].name}</span>
        <span>{pct(rows[0].balanceCents)}%</span>
      </span>
    </div>
  );
}

function blank(): Draft {
  return { name: "", type: "bank", currency: "UYU", initial: "", color: "blue", archived: false, txCount: 0, closingDay: "", dueDay: "", limit: "", business: false };
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
      <span className="kicker">{label}</span>
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
              "h-9 rounded-[4px] border px-3 text-[13px] transition-colors disabled:opacity-40",
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
      className="inline-flex size-10 items-center justify-center rounded-[4px] text-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-30"
    >
      {children}
    </button>
  );
}
