"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { CaretDown, Check, MagnifyingGlass, X } from "@phosphor-icons/react";
import { flowOf, type AccountDTO, type CategoryDTO, type TemplateDTO, type TxDTO } from "@/lib/finance-logic";
import { formatMonth, formatShort } from "@/lib/dates";
import { moneyCents } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Button, cx, Input, inputClass, Sheet, type SheetHandle } from "@/components/ui";
import { useNewIds } from "@/components/motion";
import { haptic } from "@/components/haptics";
import { GastosTabs } from "../gastos-nav";
import { TxRow, useLookups, type Lookups } from "../shared";
import { TxSheet, type TxOptimistic, type TxSheetHandle } from "../tx-sheet";
import { TxGestures, useTxActions, type TxActions } from "../tx-actions";
import { useGastosNew } from "../new-action";

type Params = { q: string; cuenta: string; cat: string; tipo: string; desde: string; hasta: string; min: string; max: string };
type FilterKind = "cuenta" | "tipo" | "cat" | "fechas" | "montos";

const KIND_LABEL: Record<string, string> = { expense: "Solo gastos", income: "Solo ingresos", transfer: "Solo transferencias" };

function hrefOf(p: Partial<Params>): string {
  const sp = new URLSearchParams(Object.entries(p).filter(([, v]) => v) as [string, string][]);
  return sp.size ? `/gastos/buscar?${sp}` : "/gastos/buscar";
}

function applyChange(list: TxDTO[], c: TxOptimistic): TxDTO[] {
  if (c.type === "remove") return list.filter((t) => (c.id ? t.id !== c.id : t.installment?.group !== c.group));
  // Lo duplicado o creado aparece al subir (puede no cumplir los filtros); lo editado, al instante.
  return list.some((t) => t.id === c.tx.id) ? list.map((t) => (t.id === c.tx.id ? c.tx : t)) : list;
}

/**
 * Todos los movimientos, de todos los meses. La búsqueda va en vivo (250 ms
 * después de dejar de escribir, sin volver arriba) y los filtros son etiquetas que
 * abren una hoja. Todo queda en la URL. Sin JavaScript sigue andando el formulario.
 */
export function HistoryView({
  accounts,
  categories,
  templates,
  txs,
  total,
  hasMore,
  params,
  limit,
}: {
  accounts: AccountDTO[];
  categories: CategoryDTO[];
  templates: TemplateDTO[];
  txs: TxDTO[];
  total: number;
  hasMore: boolean;
  params: Params;
  limit: number;
}) {
  const router = useRouter();
  const lk = useLookups(accounts, categories);
  const form = useRef<TxSheetHandle>(null);
  const filterSheet = useRef<SheetHandle>(null);
  const [filter, setFilter] = useState<FilterKind | null>(null);
  const [searching, startSearch] = useTransition();
  const [list, applyOptimistic] = useOptimistic(txs, applyChange);
  const actions = useTxActions({ edit: (t) => form.current?.edit(t), onOptimistic: applyOptimistic });
  useGastosNew(() => form.current?.create());

  // Búsqueda en vivo: el texto es local y la URL lo sigue con un respiro.
  const [q, setQ] = useState(params.q);
  const [sentQ, setSentQ] = useState(params.q);
  if (params.q !== sentQ) {
    // Cambió desde afuera (Limpiar, Atrás del navegador): el campo lo sigue.
    setSentQ(params.q);
    setQ(params.q);
  }
  const go = (p: Partial<Params>) => {
    const href = hrefOf({ ...params, q, ...p });
    if (p.q !== undefined) setSentQ(p.q);
    startSearch(() => router.replace(href, { scroll: false }));
  };
  const goRef = useRef(go);
  useEffect(() => {
    goRef.current = go;
  });
  useEffect(() => {
    if (q.trim() === params.q.trim()) return;
    const t = setTimeout(() => goRef.current({ q: q.trim() }), 250);
    return () => clearTimeout(t);
  }, [q, params.q]);

  const filtered = Object.values(params).some(Boolean);

  // Totales de lo que se ve, por moneda (sin transferencias ni ajustes).
  const totals = useMemo(() => {
    const out = { exp: new Map<string, number>(), inc: new Map<string, number>() };
    for (const t of list) {
      const f = flowOf(t, lk.category);
      if (!f) continue;
      const m = f.kind === "expense" ? out.exp : out.inc;
      const cur = lk.currencyOf(t.accountId);
      m.set(cur, (m.get(cur) ?? 0) + f.cents);
    }
    return out;
  }, [list, lk]);
  const fmt = (m: Map<string, number>) => [...m].map(([c, v]) => moneyCents(v, c)).join(" + ") || "$ 0";

  // Agrupado por mes.
  const months = new Map<string, TxDTO[]>();
  for (const t of list) months.set(t.date.slice(0, 7), [...(months.get(t.date.slice(0, 7)) ?? []), t]);
  const more = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).filter(([, v]) => v)), n: String(limit + 300) });

  const account = accounts.find((a) => a.id === params.cuenta);
  const category = params.cat === "none" ? "Sin clasificar" : categories.find((c) => c.id === params.cat)?.name;
  const dates =
    params.desde || params.hasta
      ? `${params.desde ? formatShort(params.desde) : "…"} – ${params.hasta ? formatShort(params.hasta) : "hoy"}`
      : "";
  const amounts = params.min || params.max ? `${params.min ? `$ ${params.min}` : "0"} – ${params.max ? `$ ${params.max}` : "…"}` : "";

  function openFilter(k: FilterKind) {
    haptic("tap");
    setFilter(k);
    filterSheet.current?.open();
  }
  function pick(p: Partial<Params>) {
    haptic("tap");
    filterSheet.current?.close();
    go(p);
  }

  return (
    <>
      <PageHeader title="Buscar movimientos" wide tabs={<GastosTabs />} />
      <main className="mx-auto grid max-w-3xl gap-4 px-4 pt-2 pb-10 lg:max-w-6xl lg:gap-5 lg:px-10 lg:pt-6">
        {/* Sin JavaScript: formulario GET de siempre (Enter busca, mantiene los filtros). */}
        <form
          action="/gastos/buscar"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            go({ q: q.trim() });
            (document.activeElement as HTMLElement | null)?.blur();
          }}
          className="grid gap-3"
        >
          <label className="flex h-12 items-center gap-2 rounded-full border border-line-strong bg-surface px-4 transition-[border-color,box-shadow] focus-within:border-accent focus-within:ring-3 focus-within:ring-[color-mix(in_oklab,var(--accent)_20%,transparent)] lg:max-w-xl">
            <MagnifyingGlass size={17} className="shrink-0 text-muted" aria-hidden />
            <input
              name="q"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar: mc, nafta, alquiler…"
              aria-label="Buscar en título y nota"
              enterKeyHint="search"
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent text-[15px] outline-none! placeholder:text-faint [&::-webkit-search-cancel-button]:hidden"
            />
            {q && (
              <button
                type="button"
                aria-label="Borrar la búsqueda"
                onClick={() => {
                  setQ("");
                  go({ q: "" });
                }}
                className="tap-target inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
              >
                <X size={14} weight="bold" />
              </button>
            )}
          </label>
          {(["cuenta", "tipo", "cat", "desde", "hasta", "min", "max"] as const).map((k) =>
            params[k] ? <input key={k} type="hidden" name={k} value={params[k]} /> : null,
          )}

          {/* Filtros: etiquetas que abren una hoja (fila deslizable en el celular). */}
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 fin-scroll lg:mx-0 lg:flex-wrap lg:px-0" role="group" aria-label="Filtros">
            <FilterChip label="Cuenta" value={account?.name} onClick={() => openFilter("cuenta")} />
            <FilterChip label="Tipo" value={params.tipo ? KIND_LABEL[params.tipo] : undefined} onClick={() => openFilter("tipo")} />
            <FilterChip label="Categoría" value={category} onClick={() => openFilter("cat")} />
            <FilterChip label="Fechas" value={dates || undefined} onClick={() => openFilter("fechas")} />
            <FilterChip label="Montos" value={amounts || undefined} onClick={() => openFilter("montos")} />
            {filtered && (
              <Link
                href="/gastos/buscar"
                scroll={false}
                onClick={() => haptic("tap")}
                className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full px-3 text-[13px] text-muted transition-colors hover:bg-surface-2 hover:text-fg"
              >
                <X size={13} aria-hidden /> Limpiar
              </Link>
            )}
          </div>
        </form>

        <section
          data-nav-pending={searching || undefined}
          aria-busy={searching || undefined}
          className="grid content-start gap-3 transition-opacity duration-150 data-[nav-pending]:opacity-55 data-[nav-pending]:delay-150"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-2xl bg-surface-2 px-4 py-3 text-[13.5px]" aria-live="polite">
            <span>
              <strong className="font-semibold">{total.toLocaleString("es-UY")}</strong> {total === 1 ? "movimiento" : "movimientos"}
            </span>
            <span className="text-muted">
              Gastos <span className="tabular font-medium text-fg">{fmt(totals.exp)}</span> · Ingresos{" "}
              <span className="tabular font-medium text-fg">{fmt(totals.inc)}</span>
              {hasMore && " (de lo que se ve)"}
            </span>
          </div>
          {list.length === 0 ? (
            <p className="py-10 text-center text-[14px] text-muted">No hay movimientos con esos filtros.</p>
          ) : (
            <MonthGroups months={[...months]} lk={lk} onOpen={(t) => form.current?.edit(t)} actions={actions} />
          )}
          {hasMore && (
            <Link
              href={`/gastos/buscar?${more.toString()}`}
              scroll={false}
              className="inline-flex h-11 items-center justify-center rounded-full border border-line-strong text-[14px] font-medium hover:bg-surface-2"
            >
              Cargar más
            </Link>
          )}
        </section>
      </main>

      <Sheet
        ref={filterSheet}
        title={filter === "cuenta" ? "Cuenta" : filter === "tipo" ? "Tipo" : filter === "cat" ? "Categoría" : filter === "fechas" ? "Fechas" : "Montos"}
      >
        {filter === "cuenta" && (
          <OptionList
            value={params.cuenta}
            options={[{ value: "", label: "Todas las cuentas" }, ...accounts.map((a) => ({ value: a.id, label: a.name, hint: a.archived ? "archivada" : a.currency }))]}
            onPick={(v) => pick({ cuenta: v })}
          />
        )}
        {filter === "tipo" && (
          <OptionList
            value={params.tipo}
            options={[
              { value: "", label: "Gastos, ingresos y transferencias" },
              { value: "expense", label: KIND_LABEL.expense },
              { value: "income", label: KIND_LABEL.income },
              { value: "transfer", label: KIND_LABEL.transfer },
            ]}
            onPick={(v) => pick({ tipo: v })}
          />
        )}
        {filter === "cat" && (
          <OptionList
            value={params.cat}
            options={[
              { value: "", label: "Todas las categorías" },
              { value: "none", label: "Sin clasificar" },
              ...categories.map((c) => ({ value: c.id, label: c.name, hint: c.kind === "income" ? "ingreso" : undefined })),
            ]}
            onPick={(v) => pick({ cat: v })}
          />
        )}
        {filter === "fechas" && (
          <RangeForm
            key={`${params.desde}|${params.hasta}`}
            type="date"
            from={params.desde}
            to={params.hasta}
            labels={["Desde", "Hasta"]}
            onApply={(desde, hasta) => pick({ desde, hasta })}
          />
        )}
        {filter === "montos" && (
          <RangeForm
            key={`${params.min}|${params.max}`}
            type="amount"
            from={params.min}
            to={params.max}
            labels={["Monto mínimo", "Monto máximo"]}
            onApply={(min, max) => pick({ min, max })}
          />
        )}
      </Sheet>

      <TxSheet ref={form} accounts={accounts} categories={categories} templates={templates} selection={null} onOptimistic={applyOptimistic} />
    </>
  );
}

function FilterChip({ label, value, onClick }: { label: string; value?: string; onClick: () => void }) {
  const on = !!value;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      className={cx(
        "inline-flex h-9 max-w-[16rem] shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] transition-colors",
        on ? "border-ink bg-ink text-on-ink" : "border-line-strong text-muted hover:bg-surface-2 hover:text-fg",
      )}
    >
      <span className="truncate">{on ? value : label}</span>
      <CaretDown size={11} weight="bold" aria-hidden className="shrink-0 opacity-70" />
    </button>
  );
}

function OptionList({
  value,
  options,
  onPick,
}: {
  value: string;
  options: { value: string; label: string; hint?: string }[];
  onPick: (v: string) => void;
}) {
  return (
    <ul className="-mx-2 grid pb-1" role="listbox" aria-label="Opciones">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <li key={o.value || "todas"}>
            <button
              type="button"
              role="option"
              aria-selected={on}
              onClick={() => onPick(o.value)}
              className="tap-tint flex min-h-12 w-full items-center gap-3 rounded-[6px] px-2 text-left text-[15px] hover:bg-surface-2"
            >
              <span className={cx("min-w-0 flex-1 truncate", on && "font-medium")}>{o.label}</span>
              {o.hint && <span className="text-[12.5px] text-muted">{o.hint}</span>}
              <Check size={16} weight="bold" aria-hidden className={cx("shrink-0 text-accent-fg", !on && "invisible")} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function RangeForm({
  type,
  from,
  to,
  labels,
  onApply,
}: {
  type: "date" | "amount";
  from: string;
  to: string;
  labels: [string, string];
  onApply: (from: string, to: string) => void;
}) {
  const [a, setA] = useState(from);
  const [b, setB] = useState(to);
  const field = (v: string, set: (v: string) => void, label: string) => (
    <label className="grid min-w-0 gap-1.5">
      <span className="kicker">{label}</span>
      {type === "date" ? (
        <input type="date" value={v} onChange={(e) => set(e.target.value)} className={`${inputClass} min-w-0`} />
      ) : (
        <Input inputMode="decimal" value={v} onChange={(e) => set(e.target.value)} placeholder={label.endsWith("mínimo") ? "0" : "—"} className="min-w-0" />
      )}
    </label>
  );
  return (
    <form
      className="grid gap-4 pb-1"
      onSubmit={(e) => {
        e.preventDefault();
        onApply(a.trim(), b.trim());
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        {field(a, setA, labels[0])}
        {field(b, setB, labels[1])}
      </div>
      <div className="flex gap-2">
        <Button type="submit" variant="accent" className="flex-1">
          Aplicar
        </Button>
        {(from || to) && (
          <Button type="button" variant="ghost" onClick={() => onApply("", "")}>
            Quitar
          </Button>
        )}
      </div>
    </form>
  );
}

function MonthGroups({
  months,
  lk,
  onOpen,
  actions,
}: {
  months: [string, TxDTO[]][];
  lk: Lookups;
  onOpen: (t: TxDTO) => void;
  actions: TxActions;
}) {
  // "Cargar más" o un movimiento restaurado: lo que no estaba entra suave (al cargar, nada).
  const fresh = useNewIds(months.flatMap(([, list]) => list.map((t) => t.id)));
  return months.map(([m, list]) => (
    <div key={m}>
      <h2 className="display z-10 -mx-4 border-b border-fg/80 bg-bg/92 px-4 pt-3 pb-2 text-[19px] backdrop-blur-md first-letter:uppercase max-lg:sticky max-lg:top-[calc(4rem+env(safe-area-inset-top))] lg:mx-0 lg:px-0">
        {formatMonth(m)}
      </h2>
      <ul>
        {list.map((t) => (
          <li key={t.id} data-leave={t.id} data-leave-group={t.installment?.group} className={cx("relative", fresh.has(t.id) && "reveal")}>
            <TxGestures tx={t} actions={actions}>
              {(g) => (
                <div className="relative">
                  <TxRow tx={t} lk={lk} selection={null} showAccount onClick={() => onOpen(t)} gestures={g} />
                  <span className="pointer-events-none absolute top-1.5 right-1 font-mono text-[10.5px] text-muted">{formatShort(t.date)}</span>
                </div>
              )}
            </TxGestures>
          </li>
        ))}
      </ul>
    </div>
  ));
}
