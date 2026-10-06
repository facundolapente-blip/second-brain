"use client";

import Link from "next/link";
import { CreditCard } from "@phosphor-icons/react";
import type { CardSummary } from "@/lib/card-logic";
import { diffDays, formatShort } from "@/lib/dates";
import { moneyCents } from "@/lib/format";
import { cx } from "@/components/ui";

/** Una tarjeta de crédito: deuda, disponible, el resumen a pagar, el que está corriendo y las cuotas. */
export function CardPanel({ card, today }: { card: CardSummary; today: string }) {
  const m = (c: number) => moneyCents(c, card.currency);
  const used = card.limitCents ? Math.min(1, card.debtCents / card.limitCents) : null;
  const last = card.last;
  const dueIn = last ? diffDays(last.due, today) : null;
  const urgent = last && last.leftCents > 0 && dueIn !== null && dueIn >= 0 && dueIn <= 7;
  const overdue = last && last.leftCents > 0 && dueIn !== null && dueIn < 0;
  const payHref = `/gastos?nuevo=1&pagar=${card.accountId}${last && last.leftCents > 0 ? `&monto=${last.leftCents}` : ""}`;

  return (
    <section className="grid gap-4 rounded-[20px] border border-line bg-surface p-4 lg:p-5">
      <header className="flex items-center gap-2.5">
        <span className="inline-flex size-9 items-center justify-center rounded-xl bg-[var(--c-gastos)] text-white">
          <CreditCard size={18} weight="fill" aria-hidden />
        </span>
        <span className="grid min-w-0 flex-1">
          <span className="truncate text-[15px] font-semibold">{card.name}</span>
          <span className="text-[12.5px] text-muted">
            Debés <span className="font-medium text-fg tabular">{m(card.debtCents)}</span>
            {card.limitCents !== null && <> · disponible {m(Math.max(0, card.limitCents - card.debtCents))}</>}
          </span>
        </span>
        <Link
          href={payHref}
          className="inline-flex h-9 items-center rounded-full bg-ink px-4 text-[13px] font-medium text-on-ink transition-[opacity,transform] hover:opacity-90 active:scale-[0.98]"
        >
          Pagar
        </Link>
      </header>

      {used !== null && (
        <div className="grid gap-1">
          <span className="h-2 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`Usaste el ${Math.round(used * 100)}% del límite`}>
            <span
              className={cx("block h-full rounded-full", used > 0.9 ? "bg-danger" : "bg-[var(--c-gastos)]")}
              style={{ width: `${used * 100}%` }}
            />
          </span>
          <span className="text-[11.5px] text-muted">
            {Math.round(used * 100)}% del límite de {m(card.limitCents!)}
          </span>
        </div>
      )}

      {last || card.current ? (
        <dl className="grid gap-2 sm:grid-cols-2">
          {last && (
            <div
              className={cx(
                "grid gap-0.5 rounded-xl px-3 py-2.5",
                overdue
                  ? "bg-[var(--st-fail-bg)] text-[var(--st-fail-fg)]"
                  : urgent
                    ? "bg-[var(--st-skip-bg)] text-[var(--st-skip-fg)]"
                    : "bg-surface-2",
              )}
            >
              <dt className="text-[11.5px] opacity-80">Resumen que cerró el {formatShort(last.closing)}</dt>
              <dd className="figure text-[22px]">{m(last.leftCents)}</dd>
              <dd className="text-[11.5px] opacity-80">
                {last.leftCents === 0
                  ? last.amountCents > 0
                    ? "Pago hecho"
                    : "Sin consumos"
                  : `${dueIn !== null && dueIn < 0 ? "Venció" : "Vence"} el ${formatShort(last.due)}${last.paidCents > 0 ? ` · pagaste ${m(last.paidCents)} de ${m(last.amountCents)}` : ""}`}
              </dd>
            </div>
          )}
          {card.current && (
            <div className="grid gap-0.5 rounded-xl bg-surface-2 px-3 py-2.5">
              <dt className="text-[11.5px] text-muted">En curso · cierra el {formatShort(card.current.closing)}</dt>
              <dd className="figure text-[22px]">{m(card.current.amountCents)}</dd>
              <dd className="text-[11.5px] text-muted">Vence el {formatShort(card.current.due)}</dd>
            </div>
          )}
        </dl>
      ) : (
        <p className="text-[12.5px] text-muted">Poné el día de cierre y de vencimiento (editando la cuenta) para ver cuánto viene en cada resumen.</p>
      )}

      {card.pending.count > 0 && (
        <p className="text-[13px] text-muted">
          Cuotas que vienen después: <span className="font-medium text-fg">{m(card.pending.cents)}</span> en {card.pending.count}{" "}
          {card.pending.count === 1 ? "cuota" : "cuotas"}
          {card.pending.lastDate && <> (la última, {formatShort(card.pending.lastDate)})</>}.
        </p>
      )}
    </section>
  );
}
