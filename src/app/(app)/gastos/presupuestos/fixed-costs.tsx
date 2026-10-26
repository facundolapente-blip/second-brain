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
import { Sortable, SortableItem } from "@/components/sortable";
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
  reorderBudgetLines,
  saveBudgetLine,
  setBudgetLinePayer,
  type ActionResult,
} from "@/lib/offline/finance";
import {
  byLineOrder,
  CATEGORY_COLORS,
  FREQ_LABEL,
  FREQS,
  freqText,
  isPlainMonthly,
  lineTotal,
  MAX_TIMES,
  monthlyCents,
  type Freq,
  type BudgetLineDTO,
  type BudgetList,
  type LineTotal,
} from "@/lib/budget-lines";
import { centsToInput, parseAmount } from "@/lib/finance-logic";
import { CURRENCIES, moneyCents, moneyWhole } from "@/lib/format";
import { tone } from "@/lib/palette";

/** La etiqueta de quién paga: se toca para cambiarla. */
type Payer = "mine" | "paid" | "paused";
const PAYER: Record<Payer, { label: string; color: string }> = {
  mine: { label: "Lo pago yo", color: "teal" },
  paid: { label: "Me lo pagan", color: "purple" },
  paused: { label: "Pausado", color: "stone" },
};
/** Tocar la etiqueta la pasa a la siguiente: lo pago yo → me lo pagan → pausado → lo pago yo. */
const NEXT: Record<Payer, Payer> = {
  mine: "paid",
  paid: "paused",
  paused: "mine",
};
const payerOf = (l: BudgetLineDTO): Payer =>
  l.list === "paid" || l.list === "paused" ? l.list : "mine";

const fmtRate = (n: number) =>
  n.toLocaleString("es-UY", { maximumFractionDigits: 2 });

/** Debajo del nombre cuando no es "mensual, una vez": "$ 12.000 anual", "$ 1.500 · 4× por mes". */
function unitText(l: BudgetLineDTO): string | null {
  if (isPlainMonthly(l)) return null;
  const f = freqText(l);
  return l.amountCents === null
    ? f
    : `${moneyCents(l.amountCents, l.currency)} ${l.times > 1 ? `· ${f}` : f.toLowerCase()}`;
}

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
/** La categoría como etiqueta llena de su color. */
function CategoryTag({
  name,
  color,
  small,
}: {
  name: string;
  color?: string;
  small?: boolean;
}) {
  return (
    <span
      style={tone(color ?? "stone")}
      className={cx(
        "chip-solid inline-flex max-w-full items-center truncate rounded-full font-medium",
        small ? "h-5 px-2 text-[11px]" : "h-6 px-2.5 text-[12px]",
      )}
    >
      {name}
    </span>
  );
}

export function FixedCosts({
  lines,
  categoryColors,
  toUyu,
  avgSpendCents,
}: {
  lines: BudgetLineDTO[];
  categoryColors: Record<string, string>;
  toUyu: Record<string, number>;
  avgSpendCents: number | null;
}) {
  // Lo optimista: cambiar la etiqueta y el orden arrastrando se ven al toque.
  const [list, apply] = useOptimistic(
    lines,
    (
      ls: BudgetLineDTO[],
      op: { id: string; list: BudgetList } | { order: string[] },
    ) => {
      if ("order" in op) {
        const pos = new Map(op.order.map((id, i) => [id, i + 1]));
        return ls.map((l) =>
          pos.has(l.id) ? { ...l, order: pos.get(l.id)! } : l,
        );
      }
      return ls.map((l) => (l.id === op.id ? { ...l, list: op.list } : l));
    },
  );
  const reorder = (group: "fixed" | "solo", ids: string[]) =>
    start(async () => {
      apply({ order: ids });
      await reorderBudgetLines(group, ids);
    });
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
  const hasUsd = fixed.some(
    (l) => l.list !== "paused" && l.currency !== "UYU" && l.amountCents,
  );
  const pausedCount = fixed.filter((l) => l.list === "paused").length;
  const categories = [
    ...new Set(list.map((l) => l.category).filter((c): c is string => !!c)),
  ].sort((a, b) => a.localeCompare(b, "es"));

  const toggle = (l: BudgetLineDTO) => {
    const next: BudgetList = NEXT[payerOf(l)];
    start(async () => {
      apply({ id: l.id, list: next });
      await setBudgetLinePayer(l.id, next);
    });
  };

  return (
    <>
      <TintedCard
        icon={Receipt}
        title="Gastos fijos"
        className="lg:col-span-12"
        meta={
          fixed.length
            ? `${currencies(mine)} vos · ${currencies(paid)} te pagan${pausedCount ? ` · ${pausedCount} ${pausedCount === 1 ? "pausado" : "pausados"}` : ""}`
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
              className="hidden border-b border-line pb-1.5 font-mono text-[11px] tracking-wide text-muted uppercase lg:grid lg:grid-cols-[minmax(0,1fr)_8rem_7.5rem_8rem_7.5rem_8.5rem] lg:gap-3"
            >
              <span role="columnheader">Gasto</span>
              <span role="columnheader">Categoría</span>
              <span role="columnheader" className="text-right">
                Monto
              </span>
              <span role="columnheader">Frecuencia</span>
              <span role="columnheader" className="text-right">
                Por mes
              </span>
              <span role="columnheader">Quién paga</span>
            </div>
            {/* Arrastrar ordena (compu: clic y arrastrar; celular: mantener apretado). */}
            <Sortable
              ids={fixed.map((l) => l.id)}
              onReorder={(ids) => reorder("fixed", ids)}
              disabled={fixed.length < 2}
            >
              {fixed.map((l) => {
                const p = PAYER[payerOf(l)];
                return (
                  <SortableItem
                    key={l.id}
                    id={l.id}
                    as="div"
                    role="row"
                    draggingClass="rounded-lg bg-surface shadow-[0_12px_32px_-12px_rgba(0,0,0,0.35)]"
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-line bg-surface py-2 last:border-b-0 lg:grid-cols-[minmax(0,1fr)_8rem_7.5rem_8rem_7.5rem_8.5rem] lg:cursor-grab lg:py-1.5 lg:active:cursor-grabbing"
                  >
                    <span role="cell" className="min-w-0 max-lg:row-span-2">
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
                        {(l.note || l.category || !isPlainMonthly(l)) && (
                          <span className="text-[12px] text-muted">
                            <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 pt-0.5 lg:hidden">
                              {l.category && (
                                <CategoryTag
                                  name={l.category}
                                  color={categoryColors[l.category]}
                                  small
                                />
                              )}
                              <span>
                                {[unitText(l), l.note]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                            </span>
                            <span className="max-lg:hidden">{l.note}</span>
                          </span>
                        )}
                      </button>
                    </span>
                    <span role="cell" className="min-w-0 max-lg:hidden">
                      {l.category && (
                        <CategoryTag
                          name={l.category}
                          color={categoryColors[l.category]}
                        />
                      )}
                    </span>
                    <span
                      role="cell"
                      className={cx(
                        "text-right tabular text-[13.5px] text-muted max-lg:hidden",
                        l.list === "paused" && "line-through decoration-faint",
                      )}
                    >
                      {l.amountCents === null
                        ? "—"
                        : moneyCents(l.amountCents, l.currency)}
                    </span>
                    <span
                      role="cell"
                      className="truncate text-[13px] text-muted max-lg:hidden"
                    >
                      {freqText(l)}
                    </span>
                    <span
                      role="cell"
                      className={cx(
                        "text-right tabular text-[14px] font-medium max-lg:col-start-2 max-lg:row-start-1",
                        l.amountCents === null && "font-normal text-faint",
                        l.list === "paused" &&
                          "font-normal text-muted line-through decoration-faint",
                      )}
                    >
                      {l.amountCents === null
                        ? "—"
                        : moneyCents(monthlyCents(l)!, l.currency)}
                    </span>
                    <span
                      role="cell"
                      className="max-lg:col-start-2 max-lg:row-start-2 max-lg:justify-self-end"
                    >
                      <button
                        type="button"
                        onClick={() => toggle(l)}
                        title="Tocá para cambiarlo: lo pago yo, me lo pagan o pausado"
                        aria-label={`${l.name}: ${p.label}. Tocá para cambiarlo.`}
                        style={tone(p.color)}
                        className="chip-solid press inline-flex h-7 items-center rounded-full px-2.5 text-[12px] font-medium whitespace-nowrap"
                      >
                        {p.label}
                      </button>
                    </span>
                  </SortableItem>
                );
              })}
            </Sortable>
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
        className="lg:col-span-12"
        meta={
          solo.length
            ? `${moneyWhole(plan.uyuCents)} por mes`
            : "Un plan para comparar"
        }
        bodyClassName="gap-4! lg:grid! lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-start lg:gap-x-8!"
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
          <Sortable
            ids={solo.map((l) => l.id)}
            onReorder={(ids) => reorder("solo", ids)}
            disabled={solo.length < 2}
          >
            <ul className="grid">
              {solo.map((l) => (
                <SortableItem
                  key={l.id}
                  id={l.id}
                  draggingClass="rounded-lg bg-surface shadow-[0_12px_32px_-12px_rgba(0,0,0,0.35)]"
                  className="border-b border-line bg-surface last:border-b-0 lg:cursor-grab lg:active:cursor-grabbing"
                >
                  <button
                    type="button"
                    onClick={() => open(l, "solo")}
                    className="flex min-h-10 w-full items-center gap-3 py-1 text-left hover:text-accent-fg"
                  >
                    <span className="grid min-w-0 flex-1">
                      <span className="text-[14px] break-words">{l.name}</span>
                      {(l.note || !isPlainMonthly(l)) && (
                        <span className="text-[12px] text-muted">
                          {[unitText(l), l.note].filter(Boolean).join(" · ")}
                        </span>
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
                        : moneyCents(monthlyCents(l)!, l.currency)}
                    </span>
                  </button>
                </SortableItem>
              ))}
              <li className="flex items-center justify-between gap-3 pt-2 text-[14px] font-semibold">
                <span>Total</span>
                <span className="tabular">{moneyWhole(plan.uyuCents)}</span>
              </li>
            </ul>
          </Sortable>
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
          categoryColors={categoryColors}
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
  categoryColors,
  onDone,
}: {
  line?: BudgetLineDTO;
  list: BudgetList;
  categories: string[];
  categoryColors: Record<string, string>;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState<
    ActionResult | null,
    FormData
  >(safeForm(saveBudgetLine), null);
  const [payer, setPayer] = useState<BudgetList>(line?.list ?? list);
  const [amount, setAmount] = useState(
    centsToInput(line?.amountCents ?? undefined),
  );
  const [currency, setCurrency] = useState(line?.currency ?? "UYU");
  const [freq, setFreq] = useState<Freq>(line?.freq ?? "month");
  const [category, setCategory] = useState(line?.category ?? "");
  // El color se elige a mano; si no, el que ya tiene la categoría (una nueva toma uno libre al guardar).
  const [pickedColor, setPickedColor] = useState<string | null>(null);
  const catName = category.trim().replace(/\s+/g, " ");
  const color = pickedColor ?? categoryColors[catName] ?? null;
  const [times, setTimes] = useState(String(line?.times ?? 1));
  const [, start] = useSafeTransition();
  // "≈ $ 6.000 por mes": lo que va a contar en los totales con esta frecuencia.
  const cents = amount.trim() ? parseAmount(amount) : null;
  const n = Math.min(MAX_TIMES, Math.max(1, Math.round(Number(times) || 1)));
  const perMonth =
    cents === null
      ? null
      : monthlyCents({ amountCents: cents, freq, times: n });
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
        <Field label="Monto (opcional)">
          <Input
            name="amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Sin monto"
          />
        </Field>
        <Field label="Moneda">
          <select
            name="currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
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
      <div className="grid gap-1.5">
        <div className="grid grid-cols-[1fr_6.5rem] gap-3">
          <Field label="Cada cuánto">
            <select
              name="freq"
              value={freq}
              onChange={(e) => setFreq(e.target.value as Freq)}
              className={inputClass}
            >
              {FREQS.map((f) => (
                <option key={f} value={f}>
                  {FREQ_LABEL[f]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Veces">
            <Input
              name="times"
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_TIMES}
              value={times}
              onChange={(e) => setTimes(e.target.value)}
              onBlur={() => setTimes(String(n))}
            />
          </Field>
        </div>
        <p className="text-[12.5px] text-muted" aria-live="polite">
          {perMonth === null
            ? n > 1
              ? `${n} veces ${freq === "month" ? "por mes" : freq === "week" ? "por semana" : freq === "quarter" ? "por trimestre" : "por año"}`
              : "Sin monto todavía: no suma en los totales."
            : isPlainMonthly({ freq, times: n })
              ? `Cuenta ${moneyCents(perMonth, currency)} por mes.`
              : `Por mes son ${moneyCents(perMonth, currency)}.`}
        </p>
      </div>
      {!isPlan && (
        <div className="grid gap-1.5">
          <span className="kicker">Quién paga</span>
          <div className="flex flex-wrap gap-2">
            {(["mine", "paid", "paused"] as const).map((k) => (
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
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPickedColor(null);
            }}
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
      {!isPlan && catName && (
        <div className="grid gap-1.5">
          <span className="kicker">Color de {catName}</span>
          {pickedColor && (
            <input type="hidden" name="categoryColor" value={pickedColor} />
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            {CATEGORY_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={color === c}
                aria-label={c}
                onClick={() => setPickedColor(c)}
                style={tone(c)}
                className={cx(
                  "chip-solid size-8 rounded-full",
                  color === c &&
                    "ring-2 ring-fg ring-offset-2 ring-offset-[var(--surface)]",
                )}
              />
            ))}
            <span className="ml-1">
              <CategoryTag name={catName} color={color ?? undefined} />
            </span>
          </div>
          <span className="text-[12px] text-muted">
            Vale para todos los gastos de esta categoría.
          </span>
        </div>
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
