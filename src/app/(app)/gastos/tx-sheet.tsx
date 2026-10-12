"use client";

import { useSwap } from "@/components/motion";
import { notifyInfo } from "@/components/undo-toast";
import { safeForm, useSafeTransition } from "@/components/safe-action";
import Link from "next/link";
import { forwardRef, useActionState, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ArrowsDownUp, Check, Camera, X, CopySimple } from "@phosphor-icons/react";
import { addDays, todayISO } from "@/lib/dates";
import { currencySymbol, money } from "@/lib/format";
import { deleteInstallments, deleteTransaction, saveTransaction, suggestCategory, duplicateTransaction } from "@/lib/offline/finance";
import { splitInstallments } from "@/lib/card-logic";
import { moneyCents } from "@/lib/format";
import {
  centsToInput,
  isAmountExpr,
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
import { useProjects } from "./projects";
import { PhotoStrip, sendPhoto, type Photo } from "@/components/photos";

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
  projectId: string | null;
  /** La categoría la eligió a mano (la sugerencia ya no la pisa). */
  byHand?: boolean;
  /** Comprobantes ya guardados (al editar). */
  photos?: Photo[];
  /** Compra en cuotas (al cargar con tarjeta) y, al editar, de qué compra es. */
  installments?: string;
  installment?: TxDTO["installment"];
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
  const projects = useProjects();
  // Los archivados no se ofrecen, salvo el que ya tiene el movimiento.
  const activeProjects = projects.filter((p) => !p.archived || p.id === d.projectId);
  const [formKey, setFormKey] = useState(0);
  const [state, action, pending] = useActionState(safeForm(saveTransaction), null);
  const [, startTransition] = useSafeTransition();

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
      projectId: null,
    };
  };
  const [d, setD] = useState<Draft>(blank);
  const kindSwap = useSwap(d.kind);
  // Comprobantes elegidos antes de guardar un movimiento nuevo: se suben al guardarlo.
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([]);
  const photoInput = useRef<HTMLInputElement>(null);
  // Categoría sugerida a partir del título (lo que ya clasificaste antes).
  const [suggested, setSuggested] = useState<string | null>(null);
  const [byHand, setByHand] = useState(false);
  const suggestTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  function open(next: Draft) {
    setD({ ...next, byHand: !!next.categoryId });
    setPendingPhotos([]);
    setByHand(!!next.categoryId);
    setSuggested(null);
    setFormKey((k) => k + 1);
    sheet.current?.open();
    // En el celular el teclado numérico sale directo al abrir.
    // Si viene precargado (plantilla), queda seleccionado para pisarlo al tipear.
    // Se reintenta un par de veces: abierta apenas carga la página (atajo "Cargar
    // gasto"), la hoja todavía no terminó de abrir al primer intento.
    if (!next.id) {
      for (const ms of [60, 250, 600]) {
        setTimeout(() => {
          const el = amountRef.current;
          if (!el || document.activeElement === el) return;
          el.focus();
          el.select();
        }, ms);
      }
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
        projectId: tx.projectId,
        photos: tx.photos,
        installment: tx.installment,
      }),
    fromTemplate: (t) => open(applyTemplate(blank(), t)),
  }));

  // Las fotos pendientes se leen al guardar, sin que elegir una dispare el efecto.
  const pendingRef = useRef<File[]>([]);
  useEffect(() => {
    pendingRef.current = pendingPhotos;
  }, [pendingPhotos]);

  useEffect(() => {
    if (!state?.ok) return;
    sheet.current?.close();
    // Los comprobantes de un movimiento nuevo se suben ahora que tiene id.
    const files = pendingRef.current;
    if (state.id && files.length) {
      pendingRef.current = [];
      const owner = { transactionId: state.id };
      void Promise.all(files.map((f) => sendPhoto(f, owner).catch(() => null)));
    }
  }, [state]);

  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }));

  function onTitle(title: string) {
    set({ title });
    clearTimeout(suggestTimer.current);
    if (byHand || d.kind === "transfer" || title.trim().length < 2) return;
    const kind = d.kind;
    suggestTimer.current = setTimeout(async () => {
      const id = await suggestCategory(title, kind);
      if (!id) return;
      setD((prev) => (prev.kind === kind && !prev.byHand ? { ...prev, categoryId: id } : prev));
      setSuggested(id);
    }, 350);
  }
  function pickCategory(categoryId: string | null) {
    setByHand(true);
    set({ categoryId, byHand: true });
  }

  const from = accounts.find((a) => a.id === d.accountId);
  const to = accounts.find((a) => a.id === d.toAccountId);
  const crossCurrency = d.kind === "transfer" && !!from && !!to && from.currency !== to.currency;
  const kindCats = categories.filter((c) => c.kind === (d.kind === "income" ? "income" : "expense") && !c.adjustment);
  // Un ingreso puede ser el reintegro de un gasto: resta de esa categoría.
  const refundCats = d.kind === "income" ? categories.filter((c) => c.kind === "expense" && !c.adjustment) : [];
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
          <Link href="/gastos/cuentas?nueva=1" className="inline-flex h-11 items-center justify-center rounded-[4px] bg-ink px-4 text-sm font-medium text-on-ink">
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
        <input type="hidden" name="projectId" value={d.kind === "transfer" ? "" : (d.projectId ?? "")} />

        {!d.id && templates.length > 0 && (
          <div className="-mx-5 flex gap-2 overflow-x-auto px-5 fin-scroll">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setD((prev) => applyTemplate(prev, t))}
                className="h-9 shrink-0 rounded-full border border-line-strong px-3 text-[13px] text-muted transition-colors hover:bg-surface-2 hover:text-fg"
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
          <span className="kicker">
            {d.kind === "transfer" && crossCurrency ? `Sale de ${from?.name}` : "Monto"}
          </span>
          <span className="flex h-16 items-center gap-2.5 rounded-[6px] border border-line-strong bg-surface px-3.5 transition-[border-color,box-shadow] focus-within:border-accent focus-within:ring-3 focus-within:ring-[color-mix(in_oklab,var(--accent)_22%,transparent)]">
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
              // "500+20" escrito a mano: al salir del campo queda el resultado.
              onBlur={() => {
                if (!isAmountExpr(d.amount)) return;
                const c = parseAmount(d.amount);
                if (c !== null) set({ amount: centsToInput(c) });
              }}
              placeholder="0"
              required
              aria-describedby={state && !state.ok ? "tx-error" : undefined}
              className="figure h-full w-0 min-w-0 flex-1 bg-transparent text-[38px] outline-none placeholder:text-faint"
            />
            {d.kind !== "transfer" && (
              <span
                aria-hidden
                className={cx(
                  "shrink-0 rounded-full px-2 py-0.5 text-[12px] font-medium transition-colors duration-[var(--dur-quick)]",
                  d.kind === "income" ? "bg-[var(--st-done-bg)] text-[var(--st-done-fg)]" : "bg-surface-2 text-muted",
                )}
              >
                {d.kind === "income" ? "+ ingreso" : "− gasto"}
              </span>
            )}
          </span>
        </label>
        <AmountMath
          amount={d.amount}
          currency={from?.currency ?? "UYU"}
          onChange={(v) => set({ amount: v })}
        />

        {/* Lo que depende del tipo (gasto, ingreso, transferencia) cambia con un fundido. */}
        <div key={d.kind} className={cx("grid grid-cols-[minmax(0,1fr)] gap-5", kindSwap)}>
        {d.kind !== "transfer" && (
          <Field label="Título">
            <Input
              name="title"
              value={d.title}
              onChange={(e) => onTitle(e.target.value)}
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
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line-strong px-3 text-[13px] text-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-40"
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
                <span className="kicker">Llega a {to?.name}</span>
                <span className="flex h-12 items-center gap-2 rounded-[4px] border border-line-strong bg-surface px-3 focus-within:border-fg/40 focus-within:ring-2 focus-within:ring-[var(--focus)]">
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
                    className="figure h-full w-0 min-w-0 flex-1 bg-transparent text-[24px] outline-none placeholder:text-faint"
                  />
                </span>
                <span className="text-xs text-muted">{rate ? `Cotización ${rate}` : "Monto en la moneda de destino."}</span>
              </label>
            )}
            <Field label="Título">
              <Input
                name="title"
                value={d.title}
                onChange={(e) => onTitle(e.target.value)}
                maxLength={120}
                placeholder="Opcional"
              />
            </Field>
          </>
        )}

        {d.kind !== "transfer" && (
          <div className="grid gap-2">
            <div className="flex items-baseline justify-between">
              <span className="kicker">
                Categoría
                {suggested && d.categoryId === suggested && !byHand && (
                  <span className="ml-2 tracking-normal normal-case text-accent-fg">· sugerida por el título</span>
                )}
              </span>
              <Link href="/gastos/categorias" className="inline-flex min-h-11 items-center text-[13px] text-accent-fg hover:underline">
                Editar categorías
              </Link>
            </div>
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
              <CategoryChip
                label="Sin clasificar"
                selected={d.categoryId === null}
                onClick={() => pickCategory(null)}
              >
                <CategoryAvatar size={34} />
              </CategoryChip>
              {kindCats.map((c) => (
                <CategoryChip key={c.id} label={c.name} selected={d.categoryId === c.id} onClick={() => pickCategory(c.id)}>
                  <CategoryAvatar category={c} size={34} />
                </CategoryChip>
              ))}
            </div>
            {refundCats.length > 0 && (
              <details className="group" open={refundCats.some((c) => c.id === d.categoryId)}>
                <summary className="inline-flex min-h-10 cursor-pointer items-center text-[13px] text-muted select-none hover:text-fg">
                  ¿Es un reintegro? Elegí de qué gasto (resta de esa categoría)
                </summary>
                <div className="mt-1.5 grid grid-cols-4 gap-1.5 sm:grid-cols-5">
                  {refundCats.map((c) => (
                    <CategoryChip key={c.id} label={c.name} selected={d.categoryId === c.id} onClick={() => pickCategory(c.id)}>
                      <CategoryAvatar category={c} size={34} />
                    </CategoryChip>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        <div className="grid gap-2">
          <span className="kicker">Fecha</span>
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
                  "h-10 rounded-[4px] border px-3.5 text-sm transition-colors",
                  d.date === o.value ? "border-fg bg-ink text-on-ink" : "border-line-strong text-fg hover:bg-surface-2",
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

        {d.kind !== "transfer" && (activeProjects.length > 0 || d.projectId) && (
          <div className="grid gap-2">
            <span className="kicker">Presupuesto puntual</span>
            <div className="flex flex-wrap gap-1.5">
              {[{ id: null as string | null, name: "Ninguno" }, ...activeProjects].map((p) => (
                <button
                  key={p.id ?? "none"}
                  type="button"
                  aria-pressed={d.projectId === p.id}
                  onClick={() => set({ projectId: p.id })}
                  className={cx(
                    "h-10 rounded-full border px-3.5 text-[13px] transition-colors",
                    d.projectId === p.id ? "border-fg bg-ink text-on-ink" : "border-line-strong text-muted hover:bg-surface-2 hover:text-fg",
                  )}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}

        </div>

        {!d.id && d.kind === "expense" && accounts.find((a) => a.id === d.accountId)?.type === "card" && (
          <div className="reveal">
          <Field label="Cuotas" hint={installmentHint(d, accounts.find((a) => a.id === d.accountId)?.currency ?? "UYU")}>
            <select
              name="installments"
              value={d.installments ?? "1"}
              onChange={(e) => set({ installments: e.target.value })}
              className={inputClass}
            >
              {[1, 2, 3, 4, 5, 6, 8, 9, 10, 12, 18, 24].map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? "Un pago" : `${n} cuotas`}
                </option>
              ))}
            </select>
          </Field>
          </div>
        )}

        {d.id && d.installment && (
          <p className="rounded-xl bg-surface-2 px-3 py-2.5 text-[13px] text-muted">
            Cuota {d.installment.no} de {d.installment.count} de una compra en cuotas. Lo que cambies acá vale solo para esta cuota.
          </p>
        )}

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

        <Field label="Comprobante">
          {d.id ? (
            <PhotoStrip key={d.id} photos={d.photos ?? []} owner={{ transactionId: d.id }} label="Agregar comprobante" />
          ) : (
            <div className="grid gap-2">
              {pendingPhotos.length > 0 && (
                <ul className="flex flex-wrap gap-1.5">
                  {pendingPhotos.map((f, i) => (
                    <li key={i} className="reveal inline-flex h-9 items-center gap-1.5 rounded-full bg-surface-2 pr-1 pl-3 text-[13px]">
                      <Camera size={14} aria-hidden />
                      Foto {i + 1}
                      <button
                        type="button"
                        aria-label={`Sacar foto ${i + 1}`}
                        onClick={() => setPendingPhotos((x) => x.filter((_, j) => j !== i))}
                        className="inline-flex size-7 items-center justify-center rounded-full text-muted hover:bg-surface-3 hover:text-fg"
                      >
                        <X size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                onClick={() => photoInput.current?.click()}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong text-[13px] text-muted transition-colors hover:bg-surface-2 hover:text-fg"
              >
                <Camera size={18} aria-hidden /> Agregar comprobante
              </button>
              <input
                ref={photoInput}
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(e) => {
                  const files = [...(e.target.files ?? [])];
                  setPendingPhotos((x) => [...x, ...files].slice(0, 10));
                  e.target.value = "";
                }}
              />
            </div>
          )}
        </Field>

        {!d.id && (
          <label className="flex items-center gap-2.5 text-sm text-muted">
            <input type="checkbox" name="saveTemplate" className="size-4 accent-[var(--accent)]" />
            Guardar también como plantilla
          </label>
        )}

        {d.id && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const id = d.id!;
              startTransition(async () => {
                await duplicateTransaction(id);
                notifyInfo("Movimiento duplicado");
              });
              sheet.current?.close();
            }}
          >
            <CopySimple size={16} /> Duplicar movimiento
          </Button>
        )}

        {d.id && (
          <ConfirmButton
            undo="Movimiento borrado"
            onConfirm={() => {
              const id = d.id!;
              startTransition(() => deleteTransaction(id));
              sheet.current?.close();
            }}
          >
            Eliminar movimiento
          </ConfirmButton>
        )}

        {d.id && d.installment && (
          <ConfirmButton
            undo="Cuotas borradas"
            onConfirm={() => {
              const group = d.installment!.group;
              startTransition(() => deleteInstallments(group));
              sheet.current?.close();
            }}
          >
            Eliminar las {d.installment.count} cuotas
          </ConfirmButton>
        )}

        {/* Guardar queda siempre a mano, pegado abajo de la hoja, aunque la lista de categorías sea larga. */}
        <div className="sticky bottom-[calc(max(1.25rem,env(safe-area-inset-bottom))*-1)] z-10 -mx-5 -mb-5 grid gap-2 border-t border-line bg-surface/95 px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] backdrop-blur-md">
          {state && !state.ok && (
            <p id="tx-error" role="alert" className="reveal text-sm text-danger">
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
      <span className="kicker">{label}</span>
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
                "flex h-11 shrink-0 items-center gap-2 rounded-[6px] border pr-3 pl-1.5 text-sm transition-colors",
                on ? "border-fg bg-surface-2 font-medium" : "border-line-strong hover:bg-surface-2",
              )}
            >
              <AccountAvatar account={a} size={30} />
              {a.name}
              {a.currency !== "UYU" && <span className="text-xs text-muted">{a.currency}</span>}
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
        "relative flex flex-col items-center gap-1.5 rounded-[6px] px-1 py-2 text-center transition-colors",
        selected ? "bg-surface-2 ring-1 ring-fg" : "hover:bg-surface-2",
      )}
    >
      {children}
      <span className="line-clamp-2 text-[11.5px] leading-tight">{label}</span>
      {selected && (
        <span className="mark-pop absolute top-1 right-1 inline-flex size-4 items-center justify-center rounded-full bg-ink text-on-ink">
          <Check size={10} weight="bold" />
        </span>
      )}
    </button>
  );
}

/** "6 cuotas de $ 1.250" debajo del selector. */
function installmentHint(d: Draft, currency: string): string | undefined {
  const n = Number(d.installments ?? "1");
  const total = parseAmount(d.amount);
  if (n < 2 || total === null) return "Cada cuota cae en su mes, en el resumen que le toca.";
  const parts = splitInstallments(total, n);
  return `${n} cuotas de ${moneyCents(parts[1], currency)}${parts[0] !== parts[1] ? ` (la primera ${moneyCents(parts[0], currency)})` : ""}, una por mes.`;
}

const MATH_OPS = [
  { op: "+", label: "Sumar" },
  { op: "-", sign: "−", label: "Restar" },
  { op: "*", sign: "×", label: "Multiplicar" },
  { op: "/", sign: "÷", label: "Dividir" },
] as const;

/**
 * Corregir el monto sin borrarlo: cuatro signos chicos debajo (+ − × ÷). Al tocar
 * uno aparece un campo para el otro número con la cuenta a la vista ("500 + 20 =
 * $ 520"). Lo que se escribe ya va al monto como cuenta ("500+20"): Guardar
 * guarda el resultado (sin botón de aplicar, pedido de Facu). Enter deja el
 * número final; cerrar el cartel (el mismo signo o Escape) vuelve al monto de antes.
 */
function AmountMath({ amount, currency, onChange }: { amount: string; currency: string; onChange: (v: string) => void }) {
  const [op, setOp] = useState<(typeof MATH_OPS)[number] | null>(null);
  const [value, setValue] = useState("");
  // El monto al abrir el cartel (después el campo pasa a tener la cuenta).
  const [baseText, setBaseText] = useState("");
  const base = op ? parseAmount(baseText) : parseAmount(amount);
  const result = op && base !== null && value.trim() ? parseAmount(`${baseText}${op.op}${value}`) : null;
  const sign = op ? ("sign" in op ? op.sign : op.op) : "";
  function open(o: (typeof MATH_OPS)[number]) {
    const start = op ? baseText : centsToInput(parseAmount(amount));
    if (!start) return;
    setBaseText(start);
    setOp(o);
    setValue("");
    onChange(start);
  }
  function cancel() {
    if (op) onChange(baseText);
    setOp(null);
    setValue("");
  }
  function apply() {
    if (result === null) return;
    onChange(centsToInput(result));
    setOp(null);
    setValue("");
  }
  return (
    <div
      className="-mt-3 grid min-w-0 gap-2"
      onKeyDown={(e) => {
        // Con el cartel abierto, Escape lo cierra a él (no a toda la hoja).
        if (e.key === "Escape" && op) {
          e.preventDefault();
          e.stopPropagation();
          cancel();
        }
      }}
    >
      <div className="flex gap-1.5" role="group" aria-label="Corregir el monto con una cuenta">
        {MATH_OPS.map((o) => {
          const s = "sign" in o ? o.sign : o.op;
          const on = op?.op === o.op;
          return (
            <button
              key={o.op}
              type="button"
              aria-label={o.label}
              aria-pressed={on}
              title={o.label}
              disabled={base === null}
              onClick={() => (on ? cancel() : open(o))}
              className={cx(
                "inline-flex size-9 items-center justify-center rounded-full border font-mono text-[17px] leading-none transition-colors disabled:opacity-35",
                on ? "border-ink bg-ink text-on-ink" : "border-line-strong text-muted hover:bg-surface-2 hover:text-fg",
              )}
            >
              {s}
            </button>
          );
        })}
      </div>
      {op && base !== null && (
        <div className="reveal grid min-w-0 gap-1.5 rounded-xl border border-accent bg-surface p-2.5 ring-3 ring-[color-mix(in_oklab,var(--accent)_18%,transparent)]">
          <div className="flex min-w-0 items-center gap-2">
            <span className="w-5 shrink-0 text-center font-mono text-[20px] font-medium text-accent-fg" aria-hidden>
              {sign}
            </span>
            <input
              autoFocus
              inputMode="decimal"
              enterKeyHint="done"
              autoComplete="off"
              aria-label={`${op.label} al monto`}
              style={{ outline: "none" }}
              value={value}
              onChange={(e) => {
                const v = e.target.value;
                setValue(v);
                onChange(v.trim() ? `${baseText}${op.op}${v.trim()}` : baseText);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  apply();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  cancel();
                }
              }}
              placeholder="0"
              className="figure h-10 w-0 min-w-0 flex-1 bg-transparent text-[24px] outline-none placeholder:text-faint"
            />
          </div>
          <p className="font-mono text-[12.5px] text-muted tabular" aria-live="polite">
            {!value.trim()
              ? `${baseText} ${sign} …`
              : result === null
                ? "El resultado tiene que ser mayor que cero."
                : `${baseText} ${sign} ${value.trim()} = ${moneyCents(result, currency)}`}
          </p>
        </div>
      )}
    </div>
  );
}
