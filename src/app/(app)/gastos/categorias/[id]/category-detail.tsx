"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useOptimistic, useRef, useState } from "react";
import { ArrowLeft, CheckSquare, PencilSimple, Square, Tag, X } from "@phosphor-icons/react";
import { TintedCard } from "@/components/tinted-card";
import { PageHeader } from "@/components/page-header";
import { Button, cx } from "@/components/ui";
import { useSafeTransition } from "@/components/safe-action";
import { notifyError, notifyInfo } from "@/components/undo-toast";
import { haptic } from "@/components/haptics";
import { formatMonth, formatShort, todayISO } from "@/lib/dates";
import { moneyCents } from "@/lib/format";
import { FINANCE_ICONS } from "@/lib/finance-icons";
import { flowOf, type AccountDTO, type CategoryDTO, type TemplateDTO, type TxDTO } from "@/lib/finance-logic";
import { moveToCategory } from "@/lib/offline/finance";
import { GastosTabs } from "../../gastos-nav";
import { CategoryAvatar, EmptyBlock, TxRow, useLookups } from "../../shared";
import { TxSheet, type TxSheetHandle } from "../../tx-sheet";
import { useTxActions } from "../../tx-actions";
import { useGastosNew } from "../../new-action";
import { applyChange, MonthGroups } from "../../buscar/history-view";
import { CategorySheet, draftOf, type CategorySheetHandle } from "../category-sheet";

/**
 * Una categoría: editarla (nombre, color, ícono, de trabajo, plata de otra persona) y
 * ver todos sus movimientos. Tocar uno lo abre para cambiarlo; "Elegir varios" pasa
 * los elegidos a otra categoría de una vez (solo la categoría: los saldos no cambian).
 */
export function CategoryDetail({
  category,
  accounts,
  categories,
  templates,
  txs,
  total,
  hasMore,
  limit,
}: {
  category: CategoryDTO;
  accounts: AccountDTO[];
  categories: CategoryDTO[];
  templates: TemplateDTO[];
  txs: TxDTO[];
  total: number;
  hasMore: boolean;
  limit: number;
}) {
  const router = useRouter();
  const lk = useLookups(accounts, categories);
  const form = useRef<TxSheetHandle>(null);
  const catSheet = useRef<CategorySheetHandle>(null);
  const [list, applyOptimistic] = useOptimistic(txs, applyChange);
  const actions = useTxActions({ edit: (t) => form.current?.edit(t), onOptimistic: applyOptimistic });
  useGastosNew(() => form.current?.create());

  // Elegir varios para pasarlos a otra categoría.
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState("");
  const [pending, startTransition] = useSafeTransition();
  const [moved, setMoved] = useState<Set<string>>(new Set());
  const shown = list.filter((t) => !moved.has(t.id));
  // Los que se pasaron dejan de contar ya (hasta que llegue la lista nueva del servidor).
  const count = total - txs.filter((t) => moved.has(t.id)).length;

  // Totales por moneda: este mes, este año y todo lo que se ve.
  const totals = useMemo(() => {
    const today = todayISO();
    const out = { month: new Map<string, number>(), year: new Map<string, number>(), all: new Map<string, number>() };
    for (const t of shown) {
      const f = flowOf(t, lk.category);
      if (!f) continue;
      // En una categoría de gasto, un reintegro resta; en una de ingreso, todo suma.
      const cents = category.kind === "expense" ? (f.kind === "expense" ? f.cents : -f.cents) : f.cents;
      const cur = lk.currencyOf(t.accountId);
      const add = (m: Map<string, number>) => m.set(cur, (m.get(cur) ?? 0) + cents);
      add(out.all);
      if (t.date.startsWith(today.slice(0, 4))) add(out.year);
      if (t.date.startsWith(today.slice(0, 7))) add(out.month);
    }
    return out;
  }, [shown, lk, category.kind]);
  // Cada moneda en su renglón, primero los pesos.
  const lines = (m: Map<string, number>) =>
    m.size ? [...m].sort(([a], [b]) => (a === "UYU" ? -1 : b === "UYU" ? 1 : a.localeCompare(b))).map(([c, v]) => moneyCents(v, c)) : ["$ 0"];

  const months = new Map<string, TxDTO[]>();
  for (const t of shown) months.set(t.date.slice(0, 7), [...(months.get(t.date.slice(0, 7)) ?? []), t]);

  // A dónde se pueden pasar: las del mismo tipo (sin reintegros: un ingreso no resta de un gasto).
  const targets = categories.filter((c) => !c.adjustment && c.id !== category.id && c.kind === category.kind);
  const Icon = FINANCE_ICONS[category.icon] ?? Tag;

  function toggle(id: string) {
    haptic("select");
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function stopPicking() {
    setPicking(false);
    setPicked(new Set());
    setTarget("");
  }
  function move() {
    const ids = [...picked];
    const to = target === "none" ? null : target;
    const name = to ? (categories.find((c) => c.id === to)?.name ?? "otra categoría") : "Sin clasificar";
    startTransition(async () => {
      const r = await moveToCategory(ids, to);
      if (!r.ok) return notifyError(r.error);
      setMoved((s) => new Set([...s, ...ids]));
      notifyInfo(`${ids.length} ${ids.length === 1 ? "movimiento pasó" : "movimientos pasaron"} a ${name}`);
      stopPicking();
      router.refresh();
    });
  }

  return (
    <>
      <PageHeader title={category.name} wide tabs={<GastosTabs />} />
      <main className="mx-auto grid max-w-3xl gap-4 px-4 pt-2 pb-10 lg:max-w-6xl lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-5 lg:px-10 lg:pt-6">
        <Link href="/gastos/categorias" className="inline-flex min-h-11 w-fit items-center gap-1.5 text-[13px] text-muted hover:text-fg max-lg:order-first lg:col-span-2">
          <ArrowLeft size={14} aria-hidden /> Todas las categorías
        </Link>

        <TintedCard
          icon={Icon}
          title="Movimientos"
          meta={`${count.toLocaleString("es-UY")} ${count === 1 ? "movimiento" : "movimientos"}`}
          className="fin-clip lg:row-span-2"
          action={
            picking ? (
              <button type="button" onClick={stopPicking} className="tcard-pill press">
                <X size={13} weight="bold" aria-hidden /> Listo
              </button>
            ) : (
              <button type="button" onClick={() => setPicking(true)} disabled={!shown.length} className="tcard-pill press disabled:opacity-50">
                <CheckSquare size={13} weight="bold" aria-hidden /> Elegir varios
              </button>
            )
          }
          bodyClassName="gap-3! px-4! pt-3! pb-3! lg:px-5!"
        >
          {picking && (
            <p className="text-[13px] text-muted">Tocá los movimientos que querés pasar a otra categoría. Cambia solo la categoría: los saldos no se tocan.</p>
          )}
          {shown.length === 0 ? (
            <EmptyBlock inline className="justify-items-center py-8 text-center" title="Esta categoría no tiene movimientos" icon={<Tag size={18} weight="bold" />}>
              <p className="text-[13.5px] text-muted">Los que cargues con esta categoría van a aparecer acá.</p>
            </EmptyBlock>
          ) : picking ? (
            [...months].map(([m, items]) => (
              <div key={m}>
                <h2 className="display border-b border-fg/80 pt-2 pb-2 text-[17px] first-letter:uppercase lg:text-[19px]">{formatMonth(m)}</h2>
                <ul>
                  {items.map((t) => {
                    const on = picked.has(t.id);
                    return (
                      <li key={t.id} className={cx("relative flex items-center gap-2 rounded-lg", on && "bg-accent-soft")}>
                        <span aria-hidden className={cx("shrink-0 pl-1", on ? "text-accent" : "text-faint")}>
                          {on ? <CheckSquare size={22} weight="fill" /> : <Square size={22} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <TxRow tx={t} lk={lk} selection={null} showAccount onClick={() => toggle(t.id)} />
                        </span>
                        <span className="pointer-events-none absolute top-1.5 right-1 font-mono text-[10.5px] text-muted">{formatShort(t.date)}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          ) : (
            <MonthGroups months={[...months]} lk={lk} onOpen={(t) => form.current?.edit(t)} actions={actions} />
          )}
          {hasMore && (
            <Link
              href={`/gastos/categorias/${category.id}?n=${limit + 400}`}
              scroll={false}
              className="inline-flex h-11 items-center justify-center rounded-full border border-line-strong text-[14px] font-medium hover:bg-surface-2"
            >
              Cargar más
            </Link>
          )}
        </TintedCard>

        <TintedCard
          icon={Icon}
          title={category.name}
          meta={category.kind === "income" ? "Ingreso" : "Gasto"}
          action={
            <button type="button" onClick={() => catSheet.current?.open(draftOf(category))} className="tcard-pill press">
              <PencilSimple size={13} weight="bold" aria-hidden /> Editar
            </button>
          }
          className="max-lg:order-first"
          bodyClassName="gap-3!"
        >
          <div className="flex items-center gap-3">
            <CategoryAvatar category={category} size={40} />
            <span className="grid min-w-0 gap-0.5">
              <span className="text-[13px] text-muted">
                {category.pass
                  ? "Plata de otra persona: cuenta solo la diferencia del mes"
                  : category.business
                    ? "De trabajo: no cuenta en lo personal"
                    : category.kind === "income"
                      ? "Categoría de ingresos"
                      : "Categoría de gastos"}
              </span>
            </span>
          </div>
          <dl className="grid grid-cols-3 gap-2 border-t border-line pt-3 text-[12px]">
            {(
              [
                ["Este mes", totals.month],
                ["Este año", totals.year],
                [hasMore ? "Lo que se ve" : "En total", totals.all],
              ] as const
            ).map(([label, m]) => (
              <div key={label} className="grid min-w-0 content-start gap-0.5">
                <dt className="text-muted">{label}</dt>
                {lines(m).map((l) => (
                  <dd key={l} className="truncate font-mono text-[13px] font-medium tabular">
                    {l}
                  </dd>
                ))}
              </div>
            ))}
          </dl>
        </TintedCard>

        {picking && (
          <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 grid gap-2 rounded-2xl border bg-surface px-4 py-3 shadow-[var(--card-shadow)] sm:flex sm:items-center lg:col-start-1 lg:bottom-6">
            <span className="min-w-0 flex-1 text-[13px] text-muted">
              {picked.size === 0 ? "Ninguno elegido" : picked.size === 1 ? "1 elegido" : `${picked.size} elegidos`}
            </span>
            <label htmlFor="pasar-a" className="sr-only">
              Pasar a
            </label>
            <select
              id="pasar-a"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="h-10 min-w-0 rounded-full border border-line-strong bg-surface px-3 text-[13.5px]"
            >
              <option value="">Pasar a…</option>
              {targets.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value="none">Sin clasificar</option>
            </select>
            <Button variant="accent" onClick={move} disabled={pending || !picked.size || !target}>
              {pending ? "Pasando…" : "Pasar"}
            </Button>
          </div>
        )}
      </main>

      <TxSheet ref={form} accounts={accounts} categories={categories} templates={templates} selection={null} onOptimistic={applyOptimistic} />
      <CategorySheet ref={catSheet} onDeleted={() => router.push("/gastos/categorias")} />
    </>
  );
}
