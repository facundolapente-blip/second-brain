"use client";

import { useSafeTransition } from "@/components/safe-action";
import { useOptimistic, useRef, useState } from "react";
import { CheckCircle } from "@phosphor-icons/react";
import { formatMonth, formatShort } from "@/lib/dates";
import { applySuggestions, setTransactionCategory } from "@/lib/offline/finance";
import { dayLabel, type AccountDTO, type CategoryDTO, type TxDTO } from "@/lib/finance-logic";
import { PageHeader } from "@/components/page-header";
import { Button, Sheet, type SheetHandle } from "@/components/ui";
import { GastosTabs } from "../gastos-nav";
import { AdjustAssistant } from "./adjust-assistant";
import { Amount, CategoryAvatar, useLookups } from "../shared";

/**
 * Gastos e ingresos que quedaron sin categoría. Tocar uno abre las categorías
 * de su tipo; elegir una lo clasifica y lo saca de la lista al instante.
 */
export function UncategorizedView({
  accounts,
  categories,
  txs,
  suggestions,
  today,
}: {
  accounts: AccountDTO[];
  categories: CategoryDTO[];
  txs: TxDTO[];
  suggestions: Record<string, { categoryId: string; confidence: "alta" | "media" }>;
  today: string;
}) {
  const lk = useLookups(accounts, categories);
  const sheet = useRef<SheetHandle>(null);
  const [current, setCurrent] = useState<TxDTO | null>(null);
  const [list, removeOptimistic] = useOptimistic(txs, (state, ids: string | string[]) =>
    state.filter((t) => !(Array.isArray(ids) ? ids : [ids]).includes(t.id)),
  );
  const untitled = list.filter((t) => !t.title);
  const titled = list.filter((t) => t.title);
  const withSuggestion = titled.filter((t) => suggestions[t.id]);

  function acceptAll() {
    const pairs = withSuggestion.map((t) => ({ id: t.id, categoryId: suggestions[t.id].categoryId }));
    startTransition(async () => {
      removeOptimistic(pairs.map((p) => p.id));
      await applySuggestions(pairs);
    });
  }
  function acceptOne(t: TxDTO) {
    const s = suggestions[t.id];
    startTransition(async () => {
      removeOptimistic(t.id);
      await setTransactionCategory(t.id, s.categoryId);
    });
  }
  const [, startTransition] = useSafeTransition();

  function assign(categoryId: string) {
    if (!current) return;
    const id = current.id;
    sheet.current?.close();
    startTransition(async () => {
      removeOptimistic(id);
      await setTransactionCategory(id, categoryId);
    });
  }

  const options = current ? categories.filter((c) => c.kind === current.kind && !c.adjustment) : [];

  return (
    <>
      <PageHeader title="Sin clasificar" tabs={<GastosTabs />} />

      <main className="mx-auto max-w-3xl px-4 pt-2 lg:px-8 lg:pt-6">
        {list.length === 0 ? (
          <div className="mt-6 flex items-center gap-3 border-y border-line py-8">
            <CheckCircle size={28} weight="fill" className="text-accent" />
            <div className="grid gap-0.5">
              <h2 className="display text-[24px]">Todo clasificado</h2>
              <p className="text-sm text-muted">Los movimientos que cargues sin categoría van a aparecer acá.</p>
            </div>
          </div>
        ) : (
          <>
            <AdjustAssistant txs={untitled} accounts={accounts} lk={lk} onDone={(ids) => removeOptimistic(ids)} />
            {withSuggestion.length > 0 && (
              <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[20px] border border-line bg-surface p-4">
                <p className="min-w-0 flex-1 text-[13.5px] leading-relaxed text-muted">
                  <strong className="font-medium text-fg">{withSuggestion.length}</strong> se pueden clasificar solos:
                  se parecen a otros que ya clasificaste (por el título).
                </p>
                <Button size="sm" onClick={acceptAll}>
                  Aplicar las {withSuggestion.length} sugerencias
                </Button>
              </div>
            )}
            <p className="pb-4 text-[15px] text-muted">
              {titled.length === 1 ? "1 movimiento" : `${titled.length} movimientos`} con título y sin categoría. Tocá uno para clasificarlo.
            </p>
            <ul className="grid">
              {titled.map((t, i) => {
                const acc = lk.account(t.accountId);
                // Separador de mes cuando cambia (la lista viene de la más nueva a la más vieja).
                const newMonth = i === 0 || titled[i - 1].date.slice(0, 7) !== t.date.slice(0, 7);
                return (
                  <li key={t.id}>
                    {newMonth && (
                      <h2 className="display z-10 -mx-4 border-b border-fg/80 bg-bg/92 px-4 pt-4 pb-2 text-[20px] backdrop-blur-md first-letter:uppercase max-lg:sticky max-lg:top-[calc(4rem+env(safe-area-inset-top))] lg:mx-0 lg:px-0">
                        {formatMonth(t.date.slice(0, 7))}
                      </h2>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setCurrent(t);
                        sheet.current?.open();
                      }}
                      className="flex min-h-16 w-full items-center gap-3.5 border-b border-line px-1 py-2.5 text-left transition-colors hover:bg-surface-2/70"
                    >
                      <CategoryAvatar />
                      <span className="grid min-w-0 flex-1 gap-0.5">
                        <span className={t.title ? "truncate text-[15px] font-medium" : "truncate text-[15px] text-muted"}>
                          {t.title || "Sin título"}
                        </span>
                        <span className="truncate text-[13px] text-muted">
                          {dayLabel(t.date, today).relative ? `${dayLabel(t.date, today).label}, ${formatShort(t.date)}` : formatShort(t.date)}
                          {acc ? ` · ${acc.name}` : ""}
                        </span>
                      </span>
                      <Amount
                        cents={t.kind === "income" ? t.amountCents : -t.amountCents}
                        currency={acc?.currency ?? "UYU"}
                        className="font-mono text-[14px] font-medium"
                      />
                    </button>
                    {suggestions[t.id] && lk.category(suggestions[t.id].categoryId) && (
                      <div className="-mt-1 flex items-center gap-2 border-b border-line px-1 pb-2.5 pl-[3.6rem]">
                        <span className="text-[12.5px] text-muted">¿Es</span>
                        <button
                          type="button"
                          onClick={() => acceptOne(t)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-accent-soft px-3 text-[12.5px] font-medium text-accent-fg transition-colors hover:bg-accent hover:text-on-accent"
                        >
                          {lk.category(suggestions[t.id].categoryId)!.name}?
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </main>

      <Sheet ref={sheet} title={current?.title || "Elegí una categoría"}>
        <div className="grid grid-cols-3 gap-1.5 pb-1 sm:grid-cols-4">
          {options.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => assign(c.id)}
              className="flex flex-col items-center gap-1.5 rounded-[6px] px-1 py-3 text-center transition-colors hover:bg-surface-2 active:bg-surface-2"
            >
              <CategoryAvatar category={c} size={40} />
              <span className="line-clamp-2 text-[12.5px] leading-tight">{c.name}</span>
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}
