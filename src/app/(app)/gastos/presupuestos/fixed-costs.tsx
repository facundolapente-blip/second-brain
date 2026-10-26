"use client";

import {
  useActionState,
  useEffect,
  useOptimistic,
  useRef,
  useState,
} from "react";
import {
  ArrowsClockwise,
  Check,
  CopySimple,
  House,
  NotePencil,
  PencilSimple,
  Plus,
  Receipt,
  Tag,
  Trash,
} from "@phosphor-icons/react";
import { ColumnResizers } from "@/components/column-resizers";
import {
  showContextMenu,
  type ContextMenuItem,
} from "@/components/context-menu";
import { notifyDeleted, notifyInfo } from "@/components/undo-toast";
import { quiet, safeForm, useSafeTransition } from "@/components/safe-action";
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
  addBudgetCategory,
  deleteBudgetCategory,
  deleteBudgetLine,
  duplicateBudgetLine,
  renameBudgetCategory,
  renameBudgetLine,
  reorderBudgetLines,
  saveBudgetColumns,
  saveBudgetLine,
  setBudgetCategoryColor,
  setBudgetLineCategory,
  setBudgetLineFreq,
  setBudgetLinePayer,
  type ActionResult,
} from "@/lib/offline/finance";
import {
  byLineOrder,
  CATEGORY_COLORS,
  FIXED_COLUMN_MAX,
  FIXED_COLUMN_MIN,
  FIXED_COLUMNS,
  type FixedColumnKey,
  type FixedColumnWidths,
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

type Op =
  | { id: string; list: BudgetList }
  | { order: string[] }
  | { patch: Partial<BudgetLineDTO>; id: string }
  | { remove: string };

function reduceLines(ls: BudgetLineDTO[], op: Op): BudgetLineDTO[] {
  if ("order" in op) {
    const pos = new Map(op.order.map((id, i) => [id, i + 1]));
    return ls.map((l) => (pos.has(l.id) ? { ...l, order: pos.get(l.id)! } : l));
  }
  if ("remove" in op) return ls.filter((l) => l.id !== op.remove);
  if ("patch" in op)
    return ls.map((l) => (l.id === op.id ? { ...l, ...op.patch } : l));
  return ls.map((l) => (l.id === op.id ? { ...l, list: op.list } : l));
}

/**
 * Gastos fijos (2026-10-25, de su página "Presupuesto" de Notion): una tabla con lo que se
 * paga todos los meses, su frecuencia, lo que sale por mes y una etiqueta de quién lo paga;
 * debajo, el plan "Si vivo solo". En la compu, las columnas se ensanchan arrastrando el borde
 * (como en Tareas), la categoría y la frecuencia se cambian tocándolas y el clic derecho de
 * una fila edita, duplica o borra.
 */
export function FixedCosts({
  lines,
  categoryColors,
  columns,
  toUyu,
}: {
  lines: BudgetLineDTO[];
  categoryColors: Record<string, string>;
  columns: FixedColumnWidths;
  toUyu: Record<string, number>;
}) {
  // Lo optimista: etiqueta, orden, categoría, frecuencia, nombre y borrar se ven al toque.
  const [list, apply] = useOptimistic(lines, reduceLines);
  const [, start] = useSafeTransition();
  const sheet = useRef<SheetHandle>(null);
  const catSheet = useRef<SheetHandle>(null);
  const [editing, setEditing] = useState<{
    line?: BudgetLineDTO;
    list: BudgetList;
    key: number;
  }>({ list: "mine", key: 0 });
  const open = (line: BudgetLineDTO | undefined, l: BudgetList) => {
    setEditing((e) => ({ line, list: l, key: e.key + 1 }));
    sheet.current?.open();
  };
  const reorder = (group: "fixed" | "solo", ids: string[]) =>
    start(async () => {
      apply({ order: ids });
      await reorderBudgetLines(group, ids);
    });

  // Anchos de las columnas (compu): cada una el suyo, la tabla mide la suma (como en Tareas).
  const [widths, setWidths] = useState<FixedColumnWidths>(columns);
  const widthOf = (k: FixedColumnKey) =>
    widths[k] ?? FIXED_COLUMNS.find((c) => c.key === k)!.width;
  // Mover un borde cambia solo las dos columnas que lo tocan: lo que gana una lo pierde la de al
  // lado y el resto de la tabla no se mueve (pedido de Facu). El último borde agranda la última.
  const dragStart = useRef<Record<FixedColumnKey, number> | null>(null);
  const resize = (k: FixedColumnKey, w: number, save: boolean) => {
    const base =
      dragStart.current ??
      (dragStart.current = Object.fromEntries(
        FIXED_COLUMNS.map((c) => [c.key, widthOf(c.key)]),
      ) as Record<FixedColumnKey, number>);
    const i = FIXED_COLUMNS.findIndex((c) => c.key === k);
    const nb = FIXED_COLUMNS[i + 1]?.key;
    const next: Record<FixedColumnKey, number> = { ...base };
    if (nb) {
      const lo = Math.max(FIXED_COLUMN_MIN - base[k], base[nb] - FIXED_COLUMN_MAX);
      const hi = Math.min(FIXED_COLUMN_MAX - base[k], base[nb] - FIXED_COLUMN_MIN);
      const delta = Math.round(Math.min(hi, Math.max(lo, w - base[k])));
      next[k] = base[k] + delta;
      next[nb] = base[nb] - delta;
    } else {
      next[k] = Math.round(Math.min(FIXED_COLUMN_MAX, Math.max(FIXED_COLUMN_MIN, w)));
    }
    setWidths(next);
    if (save) {
      dragStart.current = null;
      quiet(saveBudgetColumns(next));
    }
  };
  const colsVar = FIXED_COLUMNS.map((c) => `${widthOf(c.key)}px`).join(" ");

  const fixed = list.filter((l) => l.list !== "solo").sort(byLineOrder);
  const solo = list.filter((l) => l.list === "solo").sort(byLineOrder);
  // Lo pausado no entra en ninguna cuenta.
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
  // Todas las categorías: las que tienen color guardado (también las creadas sin gastos) y las de los gastos.
  const categories = [
    ...new Set([
      ...Object.keys(categoryColors),
      ...list.map((l) => l.category).filter((c): c is string => !!c),
    ]),
  ].sort((a, b) => a.localeCompare(b, "es"));

  const toggle = (l: BudgetLineDTO) => {
    const next: BudgetList = NEXT[payerOf(l)];
    start(async () => {
      apply({ id: l.id, list: next });
      await setBudgetLinePayer(l.id, next);
    });
  };
  const setCategory = (l: BudgetLineDTO, category: string | null) =>
    start(async () => {
      apply({ id: l.id, patch: { category } });
      await setBudgetLineCategory(l.id, category);
    });
  const setFreq = (l: BudgetLineDTO, freq: Freq) =>
    start(async () => {
      apply({ id: l.id, patch: { freq } });
      await setBudgetLineFreq(l.id, freq);
    });
  const remove = (l: BudgetLineDTO) =>
    start(async () => {
      apply({ remove: l.id });
      await deleteBudgetLine(l.id);
      notifyDeleted(`${l.name} borrado`);
    });
  const duplicate = (l: BudgetLineDTO) =>
    start(async () => {
      await duplicateBudgetLine(l.id);
      notifyInfo(`${l.name} duplicado`);
    });

  /** Clic derecho en una fila: editar, cambiar el nombre, duplicar o borrar. */
  const rowMenu = (e: React.MouseEvent, l: BudgetLineDTO) =>
    showContextMenu(
      e,
      [
        {
          label: "Editar",
          icon: <NotePencil size={15} />,
          onSelect: () => open(l, l.list),
        },
        {
          label: "Cambiar nombre",
          icon: <PencilSimple size={15} />,
          rename: {
            value: l.name,
            onSave: (name) => {
              const n = name.trim();
              if (!n) return;
              start(async () => {
                apply({ id: l.id, patch: { name: n } });
                await renameBudgetLine(l.id, n);
              });
            },
          },
        },
        {
          label: "Duplicar",
          icon: <CopySimple size={15} />,
          onSelect: () => duplicate(l),
        },
        {
          label: "Borrar",
          icon: <Trash size={15} />,
          danger: true,
          onSelect: () => remove(l),
        },
      ],
      l.name,
    );

  /** Tocar la categoría: elegir otra, sacarla, crear una nueva o editar las categorías. */
  const categoryMenu = (e: React.MouseEvent, l: BudgetLineDTO) => {
    const items: ContextMenuItem[] = categories.map((c) => ({
      label: c,
      icon:
        l.category === c ? (
          <Check size={15} weight="bold" />
        ) : (
          <span
            aria-hidden
            style={tone(categoryColors[c] ?? "stone")}
            className="chip-solid inline-block size-3 rounded-full"
          />
        ),
      onSelect: () => setCategory(l, c),
    }));
    if (l.category)
      items.push({
        label: "Sin categoría",
        icon: <Tag size={15} />,
        onSelect: () => setCategory(l, null),
      });
    items.push({
      label: "Nueva categoría…",
      icon: <Plus size={15} />,
      rename: {
        value: "",
        onSave: (name) => name.trim() && setCategory(l, name.trim()),
      },
    });
    items.push({
      label: "Editar categorías…",
      icon: <PencilSimple size={15} />,
      onSelect: () => catSheet.current?.open(),
    });
    showContextMenu(e, items, "Categoría");
  };

  /** Tocar la frecuencia: cada cuánto (las veces se cambian en la hoja). */
  const freqMenu = (e: React.MouseEvent, l: BudgetLineDTO) =>
    showContextMenu(
      e,
      [
        ...FREQS.map((f) => ({
          label: FREQ_LABEL[f],
          icon:
            l.freq === f ? (
              <Check size={15} weight="bold" />
            ) : (
              <span className="inline-block size-[15px]" aria-hidden />
            ),
          onSelect: () => setFreq(l, f),
        })),
        {
          label: "Cuántas veces…",
          icon: <ArrowsClockwise size={15} />,
          onSelect: () => open(l, l.list),
        },
      ],
      "Cada cuánto",
    );

  const cell = "lg:px-2";
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
          <span className="flex items-center gap-1.5">
            <button
              type="button"
              className="tcard-pill press"
              onClick={() => catSheet.current?.open()}
            >
              <Tag size={14} aria-hidden />{" "}
              <span className="max-sm:sr-only">Categorías</span>
            </button>
            <button
              type="button"
              className="tcard-pill press"
              onClick={() => open(undefined, "mine")}
            >
              <Plus size={14} weight="bold" aria-hidden /> Gasto
            </button>
          </span>
        }
      >
        {fixed.length === 0 ? (
          <p className="text-[14px] text-muted">
            Anotá lo que pagás todos los meses (alquiler, celular,
            suscripciones) y quién lo paga.
          </p>
        ) : (
          // Si los anchos suman más que la tarjeta, la tabla se corre de costado.
          <div className="lg:-mx-2 lg:overflow-x-auto">
            <div
              role="table"
              aria-label="Gastos fijos"
              className="relative grid lg:w-max"
              style={{ "--fc-cols": colsVar } as React.CSSProperties}
            >
              <div
                role="row"
                className="hidden border-b border-line pb-1.5 font-mono text-[11px] tracking-wide text-muted uppercase lg:grid lg:grid-cols-[var(--fc-cols)]"
              >
                {FIXED_COLUMNS.map((c) => (
                  <span
                    key={c.key}
                    role="columnheader"
                    className={cx(
                      cell,
                      "truncate",
                      (c.key === "amount" || c.key === "monthly") &&
                        "text-right",
                    )}
                  >
                    {c.label}
                  </span>
                ))}
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
                      onContextMenu={(e) => rowMenu(e, l)}
                      draggingClass="rounded-lg bg-surface shadow-[0_12px_32px_-12px_rgba(0,0,0,0.35)]"
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-line bg-surface py-2 last:border-b-0 lg:cursor-grab lg:grid-cols-[var(--fc-cols)] lg:gap-x-0 lg:py-1.5 lg:active:cursor-grabbing"
                    >
                      <span
                        role="cell"
                        className={cx(cell, "min-w-0 max-lg:row-span-2")}
                      >
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
                      <span
                        role="cell"
                        className={cx(cell, "min-w-0 max-lg:hidden")}
                      >
                        <button
                          type="button"
                          onClick={(e) => categoryMenu(e, l)}
                          title="Cambiar la categoría"
                          className="group/cat inline-flex min-h-9 max-w-full items-center rounded-md"
                        >
                          {l.category ? (
                            <CategoryTag
                              name={l.category}
                              color={categoryColors[l.category]}
                            />
                          ) : (
                            <span className="text-[12.5px] text-faint opacity-0 transition-opacity group-hover/cat:opacity-100 group-focus-visible/cat:opacity-100">
                              + Categoría
                            </span>
                          )}
                        </button>
                      </span>
                      <span
                        role="cell"
                        className={cx(
                          cell,
                          "text-right tabular text-[13.5px] text-muted max-lg:hidden",
                          l.list === "paused" &&
                            "line-through decoration-faint",
                        )}
                      >
                        {l.amountCents === null
                          ? "—"
                          : moneyCents(l.amountCents, l.currency)}
                      </span>
                      <span
                        role="cell"
                        className={cx(cell, "min-w-0 max-lg:hidden")}
                      >
                        <button
                          type="button"
                          onClick={(e) => freqMenu(e, l)}
                          title="Cambiar cada cuánto se paga"
                          className="-mx-1.5 inline-flex min-h-9 max-w-full items-center truncate rounded-md px-1.5 text-[13px] text-muted hover:bg-surface-2 hover:text-fg"
                        >
                          {freqText(l)}
                        </button>
                      </span>
                      <span
                        role="cell"
                        className={cx(
                          cell,
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
                        className={cx(
                          cell,
                          "max-lg:col-start-2 max-lg:row-start-2 max-lg:justify-self-end",
                        )}
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
              {/* Bordes para cambiar el ancho, como en Tareas. */}
              <ColumnResizers
                cols={FIXED_COLUMNS.map((c) => ({
                  key: c.key,
                  label: c.label,
                  width: widthOf(c.key),
                }))}
                onResize={resize}
                className="max-lg:hidden"
              />
            </div>
          </div>
        )}
        {fixed.length > 0 && (
          <p className="border-t border-line pt-3 text-[13px] text-muted">
            Todo junto:{" "}
            <b className="font-semibold text-fg tabular">
              {moneyWhole(mine.uyuCents + paid.uyuCents)}
            </b>{" "}
            por mes · pago yo{" "}
            <b className="font-semibold text-fg tabular">
              {moneyWhole(mine.uyuCents)}
            </b>{" "}
            · me pagan{" "}
            <b className="font-semibold text-fg tabular">
              {moneyWhole(paid.uyuCents)}
            </b>
            {hasUsd && usd
              ? ` · todo en pesos (los dólares a $ ${fmtRate(usd)})`
              : ""}
            {pausedCount
              ? ` · sin contar ${pausedCount === 1 ? "el pausado" : `los ${pausedCount} pausados`}`
              : ""}
          </p>
        )}
      </TintedCard>

      <TintedCard
        icon={House}
        title="Si vivo solo"
        className="lg:col-span-6 lg:self-start"
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
          <div>
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
                        <span className="text-[14px] break-words">
                          {l.name}
                        </span>
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
          </div>
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
          onDuplicate={duplicate}
        />
      </Sheet>
      <Sheet ref={catSheet} title="Categorías">
        <CategoriesEditor
          categories={categories}
          colors={categoryColors}
          counts={countBy(fixed)}
        />
      </Sheet>
    </>
  );
}

function LineForm({
  line,
  list,
  categories,
  categoryColors,
  onDone,
  onDuplicate,
}: {
  line?: BudgetLineDTO;
  list: BudgetList;
  categories: string[];
  categoryColors: Record<string, string>;
  onDone: () => void;
  onDuplicate: (l: BudgetLineDTO) => void;
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
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onDone();
              onDuplicate(line);
            }}
          >
            <CopySimple size={15} aria-hidden /> Duplicar
          </Button>
        )}
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

/** Cuántos gastos tiene cada categoría. */
function countBy(lines: BudgetLineDTO[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of lines)
    if (l.category) out[l.category] = (out[l.category] ?? 0) + 1;
  return out;
}

/** Crear, cambiar el nombre, el color o borrar las categorías de los gastos fijos. */
function CategoriesEditor({
  categories,
  colors,
  counts,
}: {
  categories: string[];
  colors: Record<string, string>;
  counts: Record<string, number>;
}) {
  const [, start] = useSafeTransition();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const add = () => {
    const n = name.trim();
    if (!n) return;
    start(async () => {
      const r = await addBudgetCategory(n);
      if (!r.ok) return setError(r.error);
      setError(null);
      setName("");
    });
  };
  return (
    <div className="grid gap-4">
      {categories.length === 0 ? (
        <p className="text-[13.5px] text-muted">Todavía no hay categorías.</p>
      ) : (
        <ul className="grid">
          {categories.map((c) => (
            <CategoryRow
              key={c}
              name={c}
              color={colors[c]}
              count={counts[c] ?? 0}
            />
          ))}
        </ul>
      )}
      {categories.length > 0 && (
        <p className="text-[12px] text-muted">
          Borrar una categoría deja sus gastos sin categoría (los gastos no se
          borran).
        </p>
      )}
      <div className="grid gap-1.5">
        <span className="kicker">Nueva categoría</span>
        <div className="flex items-center gap-2">
          <Input
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder="Transporte, Suscripciones…"
            aria-label="Nombre de la categoría nueva"
            className="h-10 min-w-0 flex-1"
          />
          <Button type="button" size="sm" variant="accent" onClick={add}>
            Agregar
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function CategoryRow({
  name,
  color,
  count,
}: {
  name: string;
  color?: string;
  count: number;
}) {
  const [, start] = useSafeTransition();
  const [text, setText] = useState(name);
  const save = () => {
    const t = text.trim();
    if (!t || t === name) return setText(name);
    start(() => renameBudgetCategory(name, t));
  };
  return (
    <li className="grid gap-2 border-b border-line py-3 last:border-b-0">
      <div className="flex items-center gap-2">
        <Input
          value={text}
          maxLength={40}
          onChange={(e) => setText(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
            if (e.key === "Escape") setText(name);
          }}
          aria-label={`Nombre de ${name}`}
          className="h-9 min-w-0 flex-1"
        />
        <span className="shrink-0 text-[12px] text-muted tabular">
          {count === 1 ? "1 gasto" : `${count} gastos`}
        </span>
        <ConfirmButton
          undo={undefined}
          confirmLabel="¿Borrar?"
          onConfirm={() => start(() => deleteBudgetCategory(name))}
          className="h-9 shrink-0 px-3 text-[13px]"
        >
          <Trash size={14} aria-hidden />
          <span className="sr-only">Borrar {name}</span>
        </ConfirmButton>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {CATEGORY_COLORS.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={color === k}
            aria-label={`${name} en ${k}`}
            onClick={() => start(() => setBudgetCategoryColor(name, k))}
            style={tone(k)}
            className={cx(
              "chip-solid size-7 rounded-full",
              color === k &&
                "ring-2 ring-fg ring-offset-2 ring-offset-[var(--surface)]",
            )}
          />
        ))}
        <span className="ml-1">
          <CategoryTag name={name} color={color} />
        </span>
      </div>
    </li>
  );
}
