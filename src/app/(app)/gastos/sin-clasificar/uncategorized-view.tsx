"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import { CheckCircle } from "@phosphor-icons/react";
import { formatMonth, formatShort } from "@/lib/dates";
import { setTransactionCategory } from "@/lib/finance-actions";
import { dayLabel, type AccountDTO, type CategoryDTO, type TxDTO } from "@/lib/finance-logic";
import { PageHeader } from "@/components/page-header";
import { Sheet, type SheetHandle } from "@/components/ui";
import { GastosTabs } from "../gastos-nav";
import { Amount, CategoryAvatar, useLookups } from "../shared";

/**
 * Gastos e ingresos que quedaron sin categoría. Tocar uno abre las categorías
 * de su tipo; elegir una lo clasifica y lo saca de la lista al instante.
 */
export function UncategorizedView({
  accounts,
  categories,
  txs,
  today,
}: {
  accounts: AccountDTO[];
  categories: CategoryDTO[];
  txs: TxDTO[];
  today: string;
}) {
  const lk = useLookups(accounts, categories);
  const sheet = useRef<SheetHandle>(null);
  const [current, setCurrent] = useState<TxDTO | null>(null);
  const [list, removeOptimistic] = useOptimistic(txs, (state, id: string) => state.filter((t) => t.id !== id));
  const [, startTransition] = useTransition();

  function assign(categoryId: string) {
    if (!current) return;
    const id = current.id;
    sheet.current?.close();
    startTransition(async () => {
      removeOptimistic(id);
      await setTransactionCategory(id, categoryId);
    });
  }

  const options = current ? categories.filter((c) => c.kind === current.kind) : [];

  return (
    <>
      <PageHeader title="Sin clasificar" tabs={<GastosTabs />} />

      <main className="mx-auto max-w-3xl px-4 pt-2 lg:px-8 lg:pt-6">
        {list.length === 0 ? (
          <div className="mt-6 flex items-center gap-3 rounded-none border border-line p-6">
            <CheckCircle size={28} weight="fill" className="text-accent" />
            <div className="grid gap-0.5">
              <h2 className="text-[15px] font-semibold">Todo clasificado</h2>
              <p className="text-sm text-muted">Los movimientos que cargues sin categoría van a aparecer acá.</p>
            </div>
          </div>
        ) : (
          <>
            <p className="px-2 pb-3 text-sm text-muted">
              {list.length === 1 ? "1 movimiento" : `${list.length} movimientos`} sin categoría. Tocá uno para clasificarlo.
            </p>
            <ul className="grid gap-0.5 border-t border-line pt-2">
              {list.map((t, i) => {
                const acc = lk.account(t.accountId);
                // Separador de mes cuando cambia (la lista viene de la más nueva a la más vieja).
                const newMonth = i === 0 || list[i - 1].date.slice(0, 7) !== t.date.slice(0, 7);
                return (
                  <li key={t.id}>
                    {newMonth && (
                      <h2 className="z-10 -mx-2 bg-bg/90 px-4 pt-3 pb-1.5 text-[13px] font-semibold backdrop-blur-md first-letter:uppercase max-lg:sticky max-lg:top-[calc(3.5rem+env(safe-area-inset-top))]">
                        {formatMonth(t.date.slice(0, 7))}
                      </h2>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setCurrent(t);
                        sheet.current?.open();
                      }}
                      className="flex w-full items-center gap-3.5 rounded-none px-2 py-2.5 text-left transition-colors hover:bg-surface-2"
                    >
                      <CategoryAvatar />
                      <span className="grid min-w-0 flex-1 gap-0.5">
                        <span className={t.title ? "truncate text-[15px] font-medium" : "truncate text-[15px] text-muted italic"}>
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
                        className="text-[15px] font-medium"
                      />
                    </button>
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
              className="flex flex-col items-center gap-1.5 rounded-[2px] px-1 py-3 text-center transition-colors hover:bg-surface-2 active:bg-surface-2"
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
