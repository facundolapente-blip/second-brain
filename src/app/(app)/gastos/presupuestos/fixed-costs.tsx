"use client";

import {
  useActionState,
  useEffect,
  useOptimistic,
  useRef,
  useState,
} from "react";
import { House, Plus, Receipt } from "@phosphor-icons/react";
import { safeForm, useSafeTransition } from "@/components/safe-action";
import { TintedCard } from "@/components/tinted-card";
import {
  Button,
  ConfirmButton,
  cx,
  Field,
  Input,
  inputClass,
  Sheet,
  type SheetHandle,
} from "@/components/ui";
import {
  deleteBudgetLine,
  saveBudgetLine,
  setBudgetLinePayer,
  type ActionResult,
} from "@/lib/offline/finance";
import {
  byLineOrder,
  lineTotal,
  type BudgetLineDTO,
  type BudgetList,
  type LineTotal,
} from "@/lib/budget-lines";
import { centsToInput } from "@/lib/finance-logic";
import { CURRENCIES, moneyCents, moneyWhole } from "@/lib/format";
import { tone } from "@/lib/palette";

/** La etiqueta de quién paga: se toca para cambiarla. */
const PAYER: Record<"mine" | "paid", { label: string; color: string }> = {
  mine: { label: "Lo pago yo", color: "teal" },
  paid: { label: "Me lo pagan", color: "purple" },
};

const fmtRate = (n: number) =>
  n.toLocaleString("es-UY", { maximumFractionDigits: 2 });

/** "$ 44.750 + US$ 115" (cada moneda tal cual; sin nada, "$ 0"). */
function currencies(t: LineTotal): string {
  const parts = Object.entries(t.byCurrency)
    .sort(([a], [b]) =>
      a === "UYU" ? -1 : b === "UYU" ? 1 : a.localeCompare(b),
    )
    .map(([cur, cents]) => moneyWhole(cents, cur));
  return parts.length ? parts.join(" + ") : moneyCents(0);
}

/**
 * Gastos fijos (2026-10-25, de su página "Presupuesto" de Notion): una tabla con lo que se
 * paga todos los meses y una etiqueta de quién lo paga; al lado, el plan "Si vivo solo"
 * comparado con lo de hoy y con lo que gasta en promedio.
 */
export function FixedCosts({
  lines,
  toUyu,
  avgSpendCents,
}: {
  lines: BudgetLineDTO[];
  toUyu: Record<string, number>;
  avgSpendCents: number | null;
}) {
  const [list, setPayer] = useOptimistic(
    lines,
    (ls: BudgetLineDTO[], p: { id: string; list: BudgetList }) =>
      ls.map((l) => (l.id === p.id ? { ...l, list: p.list } : l)),
  );
  const [, start] = useSafeTransition();
  const sheet = useRef<SheetHandle>(null);
  const [editing, setEditing] = useState<{
    line?: BudgetLineDTO;
    list: BudgetList;
    key: number;
  }>({ list: "mine", key: 0 });
  const open = (line: BudgetLineDTO | undefined, l: BudgetList) => {
    setEditing((e) => ({ line, list: l, key: e.key + 1 }));
    sheet.current?.open();
  };

  const fixed = list.filter((l) => l.list !== "solo").sort(byLineOrder);
  const solo = list.filter((l) => l.list === "solo").sort(byLineOrder);
  const mine = lineTotal(
    fixed.filter((l) => l.list === "mine"),
    toUyu,
  );
  const paid = lineTotal(
    fixed.filter((l) => l.list === "paid"),
    toUyu,
  );
  const plan = lineTotal(solo, toUyu);
  const usd = toUyu.USD;
  const hasUsd = fixed.some((l) => l.currency !== "UYU" && l.amountCents);
  const categories = [
    ...new Set(list.map((l) => l.category).filter((c): c is string => !!c)),
  ].sort((a, b) => a.localeCompare(b, "es"));

  const toggle = (l: BudgetLineDTO) => {
    const next: BudgetList = l.list === "mine" ? "paid" : "mine";
    start(async () => {
      setPayer({ id: l.id, list: next });
      await setBudgetLinePayer(l.id, next);
    });
  };

  return (
    <>
      <TintedCard
        icon={Receipt}
        title="Gastos fijos"
        className="lg:col-span-7"
        meta={
          fixed.length
            ? `${currencies(mine)} vos · ${currencies(paid)} te pagan`
            : "Lo que se paga todos los meses"
        }
        bodyClassName="gap-3!"
        action={
          <button
            type="button"
            className="tcard-pill press"
            onClick={() => open(undefined, "mine")}
          >
            <Plus size={14} weight="bold" aria-hidden /> Gasto
          </button>
        }
      >
        {fixed.length === 0 ? (
          <p className="text-[14px] text-muted">
            Anotá lo que pagás todos los meses (alquiler, celular,
            suscripciones) y quién lo paga.
          </p>
        ) : (
          <div role="table" aria-label="Gastos fijos" className="grid">
            <div
              role="row"
              className="hidden border-b border-line pb-1.5 font-mono text-[11px] tracking-wide text-muted uppercase sm:grid sm:grid-cols-[minmax(0,1fr)_7rem_7.5rem_8.5rem] sm:gap-3"
            >
              <span role="columnheader">Gasto</span>
              <span role="columnheader">Categoría</span>
              <span role="columnheader" className="text-right">
                Por mes
              </span>
              <span role="columnheader">Quién paga</span>
            </div>
            {fixed.map((l) => {
              const p = PAYER[l.list === "paid" ? "paid" : "mine"];
              return (
                <div
                  key={l.id}
                  role="row"
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-line py-2 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_7rem_7.5rem_8.5rem] sm:py-1.5"
                >
                  <span role="cell" className="min-w-0 max-sm:row-span-2">
                    <button
                      type="button"
                      onClick={() => open(l, l.list)}
                      className="grid min-h-10 w-full min-w-0 content-center text-left hover:text-accent-fg"
                    >
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[14.5px] leading-snug">
                        <span className="break-words">{l.name}</span>
                        {l.wouldCut && (
                          <span className="rounded-full bg-[var(--st-skip-bg)] px-2 py-px text-[11px] font-medium text-[var(--st-skip-fg)]">
                            Lo sacaría
                          </span>
                        )}
                        {l.variable && (
                          <span className="text-[11.5px] text-muted">
                            variable
                          </span>
                        )}
                      </span>
                      {(l.note || l.category) && (
                        <span className="text-[12px] text-muted">
                          <span className="sm:hidden">
                            {[l.category, l.note].filter(Boolean).join(" · ")}
                          </span>
                          <span className="max-sm:hidden">{l.note}</span>
                        </span>
                      )}
                    </button>
                  </span>
                  <span
                    role="cell"
                    className="truncate text-[13px] text-muted max-sm:hidden"
                  >
                    {l.category ?? ""}
                  </span>
                  <span
                    role="cell"
                    className={cx(
                      "text-right tabular text-[14px] max-sm:col-start-2 max-sm:row-start-1",
                      l.amountCents === null && "text-faint",
                    )}
                  >
                    {l.amountCents === null
                      ? "—"
                      : moneyCents(l.amountCents, l.currency)}
                  </span>
                  <span
                    role="cell"
                    className="max-sm:col-start-2 max-sm:row-start-2 max-sm:justify-self-end"
                  >
                    <button
                      type="button"
                      onClick={() => toggle(l)}
                      title="Tocá para cambiar quién lo paga"
                      aria-label={`${l.name}: ${p.label}. Tocá para cambiarlo.`}
                      style={tone(p.color)}
                      className="chip-solid press inline-flex h-7 items-center rounded-full px-2.5 text-[12px] font-medium whitespace-nowrap"
                    >
                      {p.label}
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {fixed.length > 0 && (
          <p className="border-t border-line pt-3 text-[13px] text-muted">
            Todo junto:{" "}
            <b className="font-semibold text-fg tabular">
              {moneyWhole(mine.uyuCents + paid.uyuCents)}
            </b>{" "}
            por mes
            {" · "}vos{" "}
            <span className="tabular">{moneyWhole(mine.uyuCents)}</span>
            {hasUsd && usd ? ` (los dólares a $ ${fmtRate(usd)})` : ""}
          </p>
        )}
      </TintedCard>

      <TintedCard
        icon={House}
        title="Si vivo solo"
        className="lg:col-span-5 lg:self-start"
        meta={
          solo.length
            ? `${moneyWhole(plan.uyuCents)} por mes`
            : "Un plan para comparar"
        }
        bodyClassName="gap-3!"
        action={
          <button
            type="button"
            className="tcard-pill press"
            onClick={() => open(undefined, "solo")}
          >
            <Plus size={14} weight="bold" aria-hidden /> Rubro
          </button>
        }
      >
        {solo.length === 0 ? (
          <p className="text-[14px] text-muted">
            Armá cuánto te costaría vivir solo, rubro por rubro, y comparalo con
            lo de hoy.
          </p>
        ) : (
          <ul className="grid">
            {solo.map((l) => (
              <li key={l.id} className="border-b border-line last:border-b-0">
                <button
                  type="button"
                  onClick={() => open(l, "solo")}
                  className="flex min-h-10 w-full items-center gap-3 py-1 text-left hover:text-accent-fg"
                >
                  <span className="grid min-w-0 flex-1">
                    <span className="text-[14px] break-words">{l.name}</span>
                    {l.note && (
                      <span className="text-[12px] text-muted">{l.note}</span>
                    )}
                  </span>
                  <span
                    className={cx(
                      "tabular text-[14px]",
                      l.amountCents === null && "text-faint",
                    )}
                  >
                    {l.amountCents === null
                      ? "—"
                      : moneyCents(l.amountCents, l.currency)}
                  </span>
                </button>
              </li>
            ))}
            <li className="flex items-center justify-between gap-3 pt-2 text-[14px] font-semibold">
              <span>Total</span>
              <span className="tabular">{moneyWhole(plan.uyuCents)}</span>
            </li>
          </ul>
        )}
        {solo.length > 0 && (
          <dl className="grid gap-1.5 rounded-xl bg-surface-2 p-3.5 text-[13px]">
            <Compare
              label="Fijos de hoy (todos)"
              value={mine.uyuCents + paid.uyuCents}
              plan={plan.uyuCents}
            />
            <Compare
              label="Fijos que pagás vos"
              value={mine.uyuCents}
              plan={plan.uyuCents}
            />
            {avgSpendCents !== null && (
              <Compare
                label="Lo que gastás por mes (promedio de 3 meses)"
                value={avgSpendCents}
                plan={plan.uyuCents}
              />
            )}
          </dl>
        )}
      </TintedCard>

      <Sheet
        ref={sheet}
        title={
          editing.line
            ? editing.line.name
            : editing.list === "solo"
              ? "Nuevo rubro"
              : "Nuevo gasto fijo"
        }
      >
        <LineForm
          key={editing.key}
          line={editing.line}
          list={editing.list}
          categories={categories}
          onDone={() => sheet.current?.close()}
        />
      </Sheet>
    </>
  );
}

/** "Fijos que pagás vos  $ 44.750 · viviendo solo, $ 43.850 más". */
function Compare({
  label,
  value,
  plan,
}: {
  label: string;
  value: number;
  plan: number;
}) {
  const diff = plan - value;
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
      <dt className="text-muted">{label}</dt>
      <dd className="tabular">
        {moneyWhole(value)}
        <span className="text-muted">
          {" "}
          ·{" "}
          {diff === 0
            ? "igual"
            : `${moneyWhole(Math.abs(diff))} ${diff > 0 ? "más" : "menos"} viviendo solo`}
        </span>
      </dd>
    </div>
  );
}

function LineForm({
  line,
  list,
  categories,
  onDone,
}: {
  line?: BudgetLineDTO;
  list: BudgetList;
  categories: string[];
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState<
    ActionResult | null,
    FormData
  >(safeForm(saveBudgetLine), null);
  const [payer, setPayer] = useState<BudgetList>(line?.list ?? list);
  const [, start] = useSafeTransition();
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
  const isPlan = payer === "solo";
  return (
    <form action={action} className="grid gap-4">
      {line && <input type="hidden" name="id" value={line.id} />}
      <input type="hidden" name="list" value={payer} />
      <Field label={isPlan ? "Rubro" : "Gasto"}>
        <Input
          name="name"
          required
          maxLength={80}
          defaultValue={line?.name}
          placeholder={isPlan ? "Alquiler + gastos comunes" : "Alquiler"}
          autoFocus={!line}
        />
      </Field>
      <div className="grid grid-cols-[1fr_6.5rem] gap-3">
        <Field label="Por mes (opcional)">
          <Input
            name="amount"
            inputMode="decimal"
            defaultValue={centsToInput(line?.amountCents ?? undefined)}
            placeholder="Sin monto"
          />
        </Field>
        <Field label="Moneda">
          <select
            name="currency"
            defaultValue={line?.currency ?? "UYU"}
            className={inputClass}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {!isPlan && (
        <div className="grid gap-1.5">
          <span className="kicker">Quién paga</span>
          <div className="flex flex-wrap gap-2">
            {(["mine", "paid"] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={payer === k}
                onClick={() => setPayer(k)}
                style={tone(PAYER[k].color)}
                className={cx(
                  "inline-flex h-9 items-center rounded-full border px-3.5 text-[13px] font-medium transition-colors",
                  payer === k
                    ? "chip-solid border-transparent"
                    : "border-line-strong text-muted hover:text-fg",
                )}
              >
                {PAYER[k].label}
              </button>
            ))}
          </div>
        </div>
      )}
      {!isPlan && (
        <Field label="Categoría (opcional)">
          <Input
            name="category"
            maxLength={40}
            defaultValue={line?.category ?? ""}
            list="gastos-fijos-categorias"
            placeholder="Casa, Salud…"
          />
          <datalist id="gastos-fijos-categorias">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
      )}
      <Field label="Nota (opcional)">
        <Input
          name="note"
          maxLength={500}
          defaultValue={line?.note ?? ""}
          placeholder="Opcional"
        />
      </Field>
      {!isPlan && (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex min-h-11 items-center gap-3 rounded-xl border border-line px-3 text-sm">
            <input
              type="checkbox"
              name="variable"
              defaultChecked={line?.variable}
              className="size-5 shrink-0 accent-[var(--accent)]"
            />
            Cambia de un mes a otro
          </label>
          <label className="flex min-h-11 items-center gap-3 rounded-xl border border-line px-3 text-sm">
            <input
              type="checkbox"
              name="wouldCut"
              defaultChecked={line?.wouldCut}
              className="size-5 shrink-0 accent-[var(--accent)]"
            />
            Lo sacaría
          </label>
        </div>
      )}
      {state && !state.ok && (
        <p role="alert" className="reveal text-[13px] text-danger">
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending} className="flex-1">
          {pending ? "Guardando…" : "Guardar"}
        </Button>
        {line && (
          <ConfirmButton
            undo={`${line.name} borrado`}
            onConfirm={() => {
              onDone();
              start(() => deleteBudgetLine(line.id));
            }}
          >
            Borrar
          </ConfirmButton>
        )}
      </div>
    </form>
  );
}
