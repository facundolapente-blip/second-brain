"use client";

import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "@phosphor-icons/react";
import { cx } from "@/components/ui";

/** Piezas compartidas por la revisión semanal y el resumen del mes. */

/** Diferencia contra el período anterior: "+12%" en verde o rojo según convenga. */
export function Delta({ now, before, goodUp = true, unit = "%" }: { now: number | null; before: number | null; goodUp?: boolean; unit?: "%" | "pts" }) {
  if (now === null || before === null) return null;
  let diff: number;
  if (unit === "pts") diff = Math.round(now - before);
  else if (before === 0) return null;
  else diff = Math.round(((now - before) / before) * 100);
  if (diff === 0) return <span className="hero-sub text-[12px]">igual que antes</span>;
  const good = diff > 0 === goodUp;
  return (
    <span
      className={cx(
        "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11.5px] font-medium",
        good ? "bg-[var(--st-done-bg)] text-[var(--st-done-fg)]" : "bg-[var(--st-fail-bg)] text-[var(--st-fail-fg)]",
      )}
    >
      {diff > 0 ? <ArrowUpRight size={11} weight="bold" aria-hidden /> : <ArrowDownRight size={11} weight="bold" aria-hidden />}
      {Math.abs(diff)}
      {unit === "pts" ? " pts" : "%"}
    </span>
  );
}

export function Kpi({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div className="grid content-start gap-1.5 rounded-2xl bg-white/10 p-3.5 ring-1 ring-white/10 lg:p-4">
      <span className="text-[12px] font-medium opacity-85">{label}</span>
      <span className="figure text-[26px] lg:text-[30px]">{value}</span>
      <span className="min-h-5">{children}</span>
    </div>
  );
}

export function Mini({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="grid gap-0.5 rounded-xl bg-surface-2 px-3 py-2.5">
      <dt className="text-[11.5px] text-muted">{label}</dt>
      <dd className="figure text-[22px] whitespace-nowrap print:text-[17px]">{value}</dd>
      {sub && <dd className="text-[11.5px] text-muted">{sub}</dd>}
    </div>
  );
}

export function Card({
  title,
  color,
  href,
  className,
  children,
}: {
  title: string;
  color: string;
  href?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className={cx("rise grid min-w-0 content-start gap-4 rounded-[20px] border border-line bg-surface p-4 lg:p-5", className)}>
      <header className="flex items-center gap-2">
        <span aria-hidden className="size-2 rounded-full" style={{ background: color }} />
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        {href && (
          <Link href={href} className="-my-2 -mr-2 ml-auto inline-flex min-h-11 items-center px-2 text-[13px] text-muted hover:text-fg">
            Abrir
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}
