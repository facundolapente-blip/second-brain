"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowsLeftRight, CheckCircle, ClockCounterClockwise, Tag } from "@phosphor-icons/react";
import { PageHeader } from "@/components/page-header";
import { TintedCard } from "@/components/tinted-card";
import { cx } from "@/components/ui";
import { formatShort } from "@/lib/dates";
import { moneyCents } from "@/lib/format";
import type { ReviewHistoryItem } from "@/lib/gastos-review";
import { GastosTabs } from "../../gastos-nav";
import { EmptyBlock } from "../../shared";

type Filter = "todo" | "transfer" | "category" | "kept";
type Tx = NonNullable<Extract<ReviewHistoryItem, { type: "category" }>["tx"]>;

const time = (at: string) =>
  new Date(at).toLocaleString("es-UY", { timeZone: "America/Montevideo", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).replace(".", "");

/**
 * Todo lo aplicado en "Revisar movimientos" (lo que no se deshizo), para chequear: los
 * cambios de moneda unidos, los cambios de categoría (antes → ahora) y lo que quedó
 * como estaba. Filtros por tipo y, en las categorías, por a dónde fueron.
 */
export function HistoryList({ items }: { items: ReviewHistoryItem[] }) {
  const [filter, setFilter] = useState<Filter>("todo");
  const [target, setTarget] = useState<string | null>(null);
  const counts = useMemo(() => {
    const c = { transfer: 0, category: 0, kept: 0 };
    for (const i of items) c[i.type]++;
    return c;
  }, [items]);
  // A dónde fueron los cambios de categoría (Negocio, Gastos mamá…), con cuántos.
  const targets = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) if (i.type === "category") m.set(i.to, (m.get(i.to) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [items]);
  const shown = items.filter((i) => (filter === "todo" || i.type === filter) && (!target || (i.type === "category" && i.to === target)));

  return (
    <>
      <PageHeader title="Lo que aplicaste" tabs={<GastosTabs />} />
      <main className="mx-auto grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-4 px-4 pt-2 pb-10 lg:max-w-4xl lg:px-8 lg:pt-6">
        <Link href="/gastos/revisar" className="inline-flex min-h-11 w-fit items-center gap-1.5 text-[13px] text-muted hover:text-fg">
          <ArrowLeft size={14} aria-hidden /> Volver a Revisar movimientos
        </Link>

        <TintedCard icon={ClockCounterClockwise} title="Resumen" meta={`${items.length} ${items.length === 1 ? "movimiento revisado" : "movimientos revisados"}`} bodyClassName="gap-3!">
          <p className="text-[13px] leading-relaxed text-muted">
            Todo lo que aplicaste y no deshiciste. Los saldos de las cuentas no cambiaron con nada de esto: unir un cambio de moneda deja el mismo saldo
            y cambiar la categoría no lo toca.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["transfer", "Cambios unidos", counts.transfer, ArrowsLeftRight],
                ["category", "Cambios de categoría", counts.category, Tag],
                ["kept", "Quedaron como estaban", counts.kept, CheckCircle],
              ] as const
            ).map(([k, label, n, Icon]) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setFilter(filter === k ? "todo" : k);
                  setTarget(null);
                }}
                aria-pressed={filter === k}
                className={cx(
                  "press grid gap-0.5 rounded-xl border p-3 text-left transition-colors",
                  filter === k ? "border-ink bg-ink text-on-ink" : "border-line bg-surface hover:bg-surface-2",
                )}
              >
                <Icon size={16} weight="fill" aria-hidden className={filter === k ? "" : "text-muted"} />
                <span className="figure text-[24px] leading-tight">{n}</span>
                <span className={cx("text-[12px] leading-tight", filter === k ? "" : "text-muted")}>{label}</span>
              </button>
            ))}
          </div>
          {targets.length > 0 && (filter === "todo" || filter === "category") && (
            <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
              <span className="text-muted">Categoría nueva:</span>
              {targets.map(([name, n]) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    setTarget(target === name ? null : name);
                    setFilter("category");
                  }}
                  aria-pressed={target === name}
                  className={cx(
                    "press inline-flex h-8 items-center gap-1 rounded-full border px-3",
                    target === name ? "border-ink bg-ink font-medium text-on-ink" : "border-line-strong bg-surface hover:bg-surface-2",
                  )}
                >
                  {name} <span className="font-mono opacity-70">{n}</span>
                </button>
              ))}
            </div>
          )}
        </TintedCard>

        {shown.length === 0 ? (
          <EmptyBlock title={items.length ? "Nada con ese filtro" : "Todavía no aplicaste nada"} icon={<ClockCounterClockwise size={22} weight="fill" />}>
            <p className="text-sm text-muted">Lo que apliques en Revisar movimientos va a aparecer acá.</p>
          </EmptyBlock>
        ) : (
          <ul className="grid gap-2">
            {shown.map((i, n) => (
              <li key={`${i.type}-${n}`} className="grid gap-2 rounded-2xl border bg-surface p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className={cx("inline-flex items-center gap-1.5 text-[12.5px] font-semibold", i.type === "kept" ? "text-muted" : "text-accent-fg")}>
                    {i.type === "transfer" ? (
                      <>
                        <ArrowsLeftRight size={14} weight="bold" aria-hidden /> Unido en una transferencia
                      </>
                    ) : i.type === "category" ? (
                      <>
                        <Tag size={14} weight="bold" aria-hidden /> Cambio de categoría
                      </>
                    ) : (
                      <>
                        <CheckCircle size={14} weight="bold" aria-hidden /> Quedó como estaba
                      </>
                    )}
                  </span>
                  <span className="font-mono text-[11px] text-muted">{time(i.at)}</span>
                </div>
                {i.type === "transfer" ? (
                  <>
                    <Line t={i.out} sign={-1} note={i.out.categoryName ? `era gasto en ${i.out.categoryName}` : "era gasto"} />
                    {i.in ? (
                      <Line t={i.in} sign={1} note={`era ingreso${i.in.categoryName ? ` en ${i.in.categoryName}` : ""} · está en la papelera`} />
                    ) : (
                      <p className="text-[12.5px] text-muted">El ingreso de este par ya no está en la papelera.</p>
                    )}
                    {i.rate !== null && <span className="font-mono text-[11.5px] text-muted">$ {i.rate.toFixed(2).replace(".", ",")} por dólar</span>}
                  </>
                ) : i.type === "category" ? (
                  <>
                    {i.tx ? <Line t={i.tx} sign={i.tx.kind === "income" ? 1 : -1} /> : <p className="text-[12.5px] text-muted">Este movimiento ya no existe.</p>}
                    <span className="flex flex-wrap items-center gap-1.5 text-[13px]">
                      <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-muted line-through decoration-1">{i.from}</span>
                      <ArrowRight size={13} aria-hidden className="text-muted" />
                      <span className="rounded-full bg-accent-soft px-2.5 py-0.5 font-medium text-accent-fg">{i.to}</span>
                    </span>
                  </>
                ) : i.tx ? (
                  <Line t={i.tx} sign={i.tx.kind === "income" ? 1 : -1} note={i.tx.categoryName ?? "Sin clasificar"} />
                ) : (
                  <p className="text-[12.5px] text-muted">Este movimiento ya no existe.</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}

/** Fecha, título, cuenta y monto (con un dato aparte si hace falta). */
function Line({ t, sign, note }: { t: Tx; sign: 1 | -1; note?: string }) {
  return (
    <div className="flex min-w-0 items-baseline gap-3">
      <span className="w-12 shrink-0 font-mono text-[11.5px] text-muted tabular">{formatShort(t.date)}</span>
      <span className="grid min-w-0 flex-1">
        <span className="truncate text-[14px] font-medium">{t.title ?? <span className="text-muted">Sin título</span>}</span>
        <span className="truncate text-[12px] text-muted">
          {t.accountName}
          {note ? ` · ${note}` : ""}
        </span>
      </span>
      <span className={cx("shrink-0 font-mono text-[14px] tabular", sign > 0 && "fin-income")}>
        {sign > 0 ? "+" : "−"} {moneyCents(t.cents, t.currency)}
      </span>
    </div>
  );
}
