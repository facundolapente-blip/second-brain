"use client";

import Link from "next/link";
import { forwardRef, useActionState, useEffect, useImperativeHandle, useRef, useState, useTransition } from "react";
import { ArrowsDownUp, Check } from "@phosphor-icons/react";
import { addDays, todayISO } from "@/lib/dates";
import { currencySymbol, money } from "@/lib/format";
import { deleteTransaction, saveTransaction } from "@/lib/finance-actions";
import {
  centsToInput,
  parseAmount,
  type AccountDTO,
  type CategoryDTO,
  type Selection,
  type TemplateDTO,
  type TxDTO,
  type TxKind,
} from "@/lib/finance-logic";
import { Button, ConfirmButton, cx, Field, Input, inputClass, Segmented, Sheet, type SheetHandle } from "@/components/ui";
import { AccountAvatar, CategoryAvatar } from "./shared";

type Draft = {
  id?: string;
  kind: TxKind;
  amount: string;
  title: string;
  accountId: string;
  toAccountId: string;
  toAmount: string;
  categoryId: string | null;
  date: string;
  note: string;
};

export type TxSheetHandle = {
  create: (preset?: Partial<Draft>) => void;
  edit: (tx: TxDTO) => void;
  fromTemplate: (t: TemplateDTO) => void;
};

const KIND_OPTIONS: { value: TxKind; label: string }[] = [
  { value: "expense", label: "Gasto" },
  { value: "income", label: "Ingreso" },
  { value: "transfer", label: "Transferencia" },
];

const SAVE_LABEL: Record<TxKind, string> = {
  expense: "Guardar gasto",
  income: "Guardar ingreso",
  transfer: "Guardar transferencia",
};

export const TxSheet = forwardRef<
  TxSheetHandle,
  { accounts: AccountDTO[]; categories: CategoryDTO[]; templates: TemplateDTO[]; selection: Selection }
>(function TxSheet({ accounts, categories, templates, selection }, ref) {
  const sheet = useRef<SheetHandle>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const [formKey, setFormKey] = useState(0);
  const [state, action, pending] = useActionState(saveTransaction, null);
  const [, startTransition] = useTransition();

  const active = accounts.filter((a) => !a.archived);
  const defaultAccount = () =>
    active.find((a) => selection?.includes(a.id))?.id ?? active[0]?.id ?? "";

  const blank = (): Draft => {
    const from = defaultAccount();
    return {
      kind: "expense",
      amount: "",
      title: "",
      accountId: from,
      toAccountId: active.find((a) => a.id !== from)?.id ?? "",
      toAmount: "",
      categoryId: null,
      date: todayISO(),
      note: "",
    };
  };
  const [d, setD] = useState<Draft>(blank);

  function open(next: Draft) {
    setD(next);
    setFormKey((k) => k + 1);
    sheet.current?.open();
    // En el celular el teclado numérico sale directo al abrir.
    // Si viene precargado (plantilla), queda seleccionado para pisarlo al tipear.
    if (!next.id) {
      setTimeout(() => {
        amountRef.current?.focus();
        amountRef.current?.select();
      }, 60);
    }
  }

  useImperativeHandle(ref, () => ({
    create: (preset) => open({ ...blank(), ...preset }),
    edit: (tx) =>
      open({
        id: tx.id,
        kind: tx.kind,
        amount: centsToInput(tx.amountCents),
        title: tx.title ?? "",
        accountId: tx.accountId,
        toAccountId: tx.toAccountId ?? "",
        toAmount: centsToInput(tx.toAmountCents),
        categoryId: tx.categoryId,
        date: tx.date,
        note: tx.note ?? "",
      }),
    fromTemplate: (t) => open(applyTemplate(blank(), t)),
  }));

  useEffect(() => {
    if (state?.ok) sheet.current?.close();
  }, [state]);

  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }));

  const from = accounts.find((a) => a.id === d.accountId);
  const to = accounts.find((a) => a.id === d.toAccountId);
  const crossCurrency = d.kind === "transfer" && !!from && !!to && from.currency !== to.currency;
  const kindCats = categories.filter((c) => c.kind === (d.kind === "income" ? "income" : "expense"));
  // Las cuentas archivadas solo aparecen si el movimiento que se edita ya las usa.
  const pickable = (selected: string) => accounts.filter((a) => !a.archived || a.id === selected);

  const rate = (() => {
    if (!crossCurrency) return null;
    const a = parseAmount(d.amount);
    const b = parseAmount(d.toAmount);
    if (!a || !b) return null;
    // Cotización expresada como "1 moneda fuerte = X pesos".
    const [hi, lo, hiCur, loCur] = a > b ? [a, b, from!.currency, to!.currency] : [b, a, to!.currency, from!.currency];
    return `1 ${currencySymbol(loCur)} = ${money(hi / lo, hiCur)}`;
  })();

  if (active.length === 0) {
    return (
      <Sheet ref={sheet} title="Nuevo movimiento">
        <div className="grid gap-4 pb-2">
          <p className="text-sm leading-relaxed text-muted">
            Todo movimiento sale de una cuenta. Creá la primera (Efectivo, tu banco, una tarjeta) y volvé.
          </p>
          <Link href="/gastos/cuentas?nueva=1" className="label-mono inline-flex h-11 items-center justify-center rounded-md border border-rule bg-accent px-4 text-on-accent shadow-[2px_2px_0_var(--rule)]">
            Crear cuenta
          </Link>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet ref={sheet} title={d.id ? "Editar movimiento" : "Nuevo movimiento"}>
      <form
        key={formKey}
        action={action}
        aria-keyshortcuts="Control+Enter"
        onKeyDown={(e) => {
          // Ctrl/Cmd + Enter guarda desde cualquier campo (también desde la nota).
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            e.currentTarget.requestSubmit();
          }
        }}
        className="grid grid-cols-[minmax(0,1fr)] gap-5"
      >
        {d.id && <input type="hidden" name="id" value={d.id} />}
        <input type="hidden" name="accountId" value={d.accountId} />
        <input type="hidden" name="toAccountId" value={d.kind === "transfer" ? d.toAccountId : ""} />
        <input type="hidden" name="categoryId" value={d.kind === "transfer" ? "" : (d.categoryId ?? "")} />

        {!d.id && templates.length > 0 && (
          <div className="-mx-5 flex gap-2 overflow-x-auto px-5 fin-scroll">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setD((prev) => applyTemplate(prev, t))}
                className="h-10 shrink-0 rounded-[2px] border border-dashed border-line-strong px-3 text-[13px] text-muted transition-colors hover:border-solid hover:border-rule hover:text-fg"
              >
                {t.name}
              </button>
            ))}
          </div>
        )}

        <Segmented
          name="kind"
          value={d.kind}
          onChange={(kind) => set({ kind, categoryId: kind === d.kind ? d.categoryId : null })}
          options={KIND_OPTIONS}
        />

        <label className="grid gap-1.5">
          <span className="label-mono text-muted">
            {d.kind === "transfer" && crossCurrency ? `Sale de ${from?.name}` : "Monto"}
          </span>
          <span className="flex h-16 items-center gap-2.5 rounded-[2px] border border-rule bg-surface px-3.5 transition-[border-color,box-shadow] focus-within:border-accent focus-within:ring-3 focus-within:ring-[color-mix(in_oklab,var(--accent)_22%,transparent)]">
            <span className="text-xl font-medium text-muted">{currencySymbol(from?.currency ?? "UYU")}</span>
            <input
              ref={amountRef}
              name="amount"
              inputMode="decimal"
              enterKeyHint="done"
              autoComplete="off"
              style={{ outline: "none" }}
              value={d.amount}
              onChange={(e) => set({ amount: e.target.value })}
              placeholder="0"
              required
              aria-describedby={state && !state.ok ? "tx-error" : undefined}
              className="tabular h-full w-0 min-w-0 flex-1 bg-transparent text-[32px] font-semibold tracking-[-0.03em] outline-none placeholder:text-faint"
            />
            {d.kind !== "transfer" && (
              <span
                aria-hidden
                className={cx(
                  "label-mono shrink-0 px-2 py-1 text-[10.5px]",
                  d.kind === "income" ? "bg-[var(--st-done-bg)] text-[var(--st-done-fg)]" : "bg-surface-2 text-muted",
                )}
              >
                {d.kind === "income" ? "+ ingreso" : "− gasto"}
              </span>
            )}
          </span>
        </label>

        {d.kind !== "transfer" && (
          <Field label="Título">
            <Input
              name="title"
              value={d.title}
              onChange={(e) => set({ title: e.target.value })}
              maxLength={120}
              placeholder={d.kind === "income" ? "Sueldo, venta…" : "Dominos, alquiler…"}
            />
          </Field>
        )}

        <AccountPicker
          label={d.kind === "transfer" ? "Desde" : "Cuenta"}
          accounts={pickable(d.accountId)}
          value={d.accountId}
          onChange={(id) => set({ accountId: id, toAccountId: id === d.toAccountId ? d.accountId : d.toAccountId })}
        />

        {d.kind === "transfer" && (
          <>
            <div className="-my-2 flex justify-center">
              <button
                type="button"
                onClick={() => set({ accountId: d.toAccountId, toAccountId: d.accountId, amount: d.toAmount || d.amount, toAmount: d.toAmount ? d.amount : "" })}
                disabled={!d.toAccountId}
                className="label-mono inline-flex h-10 items-center gap-1.5 rounded-[2px] border border-line-strong bg-surface px-3 text-[10.5px] text-muted transition-colors hover:border-rule hover:text-fg disabled:opacity-40"
              >
                <ArrowsDownUp size={15} weight="bold" aria-hidden /> Invertir
              </button>
            </div>
            <AccountPicker
              label="Hacia"
              accounts={pickable(d.toAccountId).filter((a) => a.id !== d.accountId)}
              value={d.toAccountId}
              onChange={(id) => set({ toAccountId: id })}
            />
            {crossCurrency && (
              <label className="grid gap-1.5">
                <span className="label-mono text-muted">Llega a {to?.name}</span>
                <span className="flex h-12 items-center gap-2 rounded-md border border-line-strong bg-surface px-3 focus-within:border-rule focus-within:ring-2 focus-within:ring-[var(--focus)]">
                  <span className="text-muted">{currencySymbol(to?.currency ?? "")}</span>
                  <input
                    name="toAmount"
                    inputMode="decimal"
                    autoComplete="off"
                    style={{ outline: "none" }}
                    value={d.toAmount}
                    onChange={(e) => set({ toAmount: e.target.value })}
                    placeholder="0"
                    required
                    className="tabular h-full w-0 min-w-0 flex-1 bg-transparent text-lg font-semibold outline-none placeholder:text-faint"
                  />
                </span>
                <span className="text-xs text-muted">{rate ? `Cotización ${rate}` : "Monto en la moneda de destino."}</span>
              </label>
            )}
            <Field label="Título">
              <Input
                name="title"
                value={d.title}
                onChange={(e) => set({ title: e.target.value })}
                maxLength={120}
                placeholder="Opcional"
              />
            </Field>
          </>
        )}

        {d.kind !== "transfer" && (
          <div className="grid gap-2">
            <div className="flex items-baseline justify-between">
              <span className="label-mono text-muted">Categoría</span>
              <Link href="/gastos/categorias" className="label-mono inline-flex min-h-11 items-center text-accent-fg hover:underline">
                Editar categorías
              </Link>
            </div>
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
              <CategoryChip
                label="Sin clasificar"
                selected={d.categoryId === null}
                onClick={() => set({ categoryId: null })}
              >
                <CategoryAvatar size={34} />
              </CategoryChip>
              {kindCats.map((c) => (
                <CategoryChip key={c.id} label={c.name} selected={d.categoryId === c.id} onClick={() => set({ categoryId: c.id })}>
                  <CategoryAvatar category={c} size={34} />
                </CategoryChip>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-2">
          <span className="label-mono text-muted">Fecha</span>
          <div className="flex gap-2">
            {[
              { label: "Hoy", value: todayISO() },
              { label: "Ayer", value: addDays(todayISO(), -1) },
            ].map((o) => (
              <button
                key={o.label}
                type="button"
                onClick={() => set({ date: o.value })}
                className={cx(
                  "label-mono h-11 rounded-md border px-3.5 text-[11px] transition-colors",
                  d.date === o.value ? "border-rule bg-ink font-bold text-on-ink" : "border-line-strong text-fg hover:bg-surface-2",
                )}
              >
                {o.label}
              </button>
            ))}
            <input
              type="date"
              name="date"
              value={d.date}
              onChange={(e) => e.target.value && set({ date: e.target.value })}
              required
              className={cx(inputClass, "min-w-0 flex-1")}
            />
          </div>
        </div>

        <Field label="Nota">
          <textarea
            name="note"
            value={d.note}
            onChange={(e) => set({ note: e.target.value })}
            maxLength={2000}
            rows={2}
            placeholder="Opcional"
            className={cx(inputClass, "autogrow h-auto min-h-16 py-2 leading-relaxed")}
          />
        </Field>

        {!d.id && (
          <label className="flex items-center gap-2.5 text-sm text-muted">
            <input type="checkbox" name="saveTemplate" className="size-4 accent-[var(--accent)]" />
            Guardar también como plantilla
          </label>
        )}

        {d.id && (
          <ConfirmButton
            onConfirm={() => {
              const id = d.id!;
              startTransition(() => deleteTransaction(id));
              sheet.current?.close();
            }}
          >
            Eliminar movimiento
          </ConfirmButton>
        )}

        {/* Guardar queda siempre a mano, pegado abajo de la hoja, aunque la lista de categorías sea larga. */}
        <div className="sticky bottom-[calc(max(1.25rem,env(safe-area-inset-bottom))*-1)] z-10 -mx-5 -mb-5 grid gap-2 border-t border-rule bg-surface px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {state && !state.ok && (
            <p id="tx-error" role="alert" className="text-sm text-danger">
              {state.error}
            </p>
          )}
          <Button type="submit" variant="accent" disabled={pending} className="h-12 text-[15px]">
            {pending ? "Guardando…" : d.id ? "Guardar cambios" : SAVE_LABEL[d.kind]}
          </Button>
        </div>
      </form>
    </Sheet>
  );
});

function applyTemplate(base: Draft, t: TemplateDTO): Draft {
  return {
    ...base,
    kind: t.kind,
    title: t.title ?? "",
    amount: t.amountCents ? centsToInput(t.amountCents) : base.amount,
    accountId: t.accountId ?? base.accountId,
    toAccountId: t.toAccountId ?? base.toAccountId,
    toAmount: t.toAmountCents ? centsToInput(t.toAmountCents) : "",
    categoryId: t.categoryId,
    note: t.note ?? "",
  };
}

function AccountPicker({
  label,
  accounts,
  value,
  onChange,
}: {
  label: string;
  accounts: AccountDTO[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <span className="label-mono text-muted">{label}</span>
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-0.5 fin-scroll" role="radiogroup" aria-label={label}>
        {accounts.map((a) => {
          const on = a.id === value;
          return (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(a.id)}
              className={cx(
                "flex h-11 shrink-0 items-center gap-2 rounded-[2px] border pr-3 pl-1.5 text-sm transition-colors",
                on ? "border-rule bg-surface-2 font-semibold shadow-[inset_0_0_0_1px_var(--rule)]" : "border-line-strong hover:bg-surface-2",
              )}
            >
              <AccountAvatar account={a} size={30} />
              {a.name}
              {a.currency !== "UYU" && <span className="label-mono text-[10px] text-muted">{a.currency}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CategoryChip({
  label,
  selected,
  onClick,
  children,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cx(
        "relative flex flex-col items-center gap-1.5 rounded-[2px] border px-1 py-2 text-center transition-colors",
        selected ? "border-rule bg-surface-2 shadow-[inset_0_0_0_1px_var(--rule)]" : "border-transparent hover:bg-surface-2",
      )}
    >
      {children}
      <span className="line-clamp-2 text-[11.5px] leading-tight">{label}</span>
      {selected && (
        <span className="absolute top-0 right-0 inline-flex size-4 items-center justify-center bg-accent text-on-accent">
          <Check size={10} weight="bold" />
        </span>
      )}
    </button>
  );
}
