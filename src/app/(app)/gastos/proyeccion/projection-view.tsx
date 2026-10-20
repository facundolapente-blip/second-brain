"use client";

import { useState } from "react";
import { ArrowDownRight, ArrowUpRight, CalendarBlank, CalendarCheck, ChartLineUp, ChartPieSlice, Receipt, TrendUp, Wallet, type Icon } from "@phosphor-icons/react";
import { StatTile, TintedCard } from "@/components/tinted-card";
import type { Projection } from "@/lib/projection";
import type { CategoryDTO } from "@/lib/finance-logic";
import { formatMonth } from "@/lib/dates";
import { moneyCents } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { cx } from "@/components/ui";
import { GastosTabs } from "../gastos-nav";
import { CategoryAvatar, MiniBars } from "../shared";

const pct = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 100) : null);
const monthName = (m: string) => formatMonth(m).split(" ")[0];

/** "+12%" en rojo si sube el gasto, verde si baja. */
function Trend({ value, invert }: { value: number | null; invert?: boolean }) {
  if (value === null) return <span className="text-[12px] text-muted">sin historia</span>;
  if (Math.abs(value) < 3) return <span className="text-[12px] text-muted">igual</span>;
  const up = value > 0;
  const bad = invert ? !up : up;
  return (
    <span
      className={cx(
        "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11.5px] font-medium",
        bad ? "bg-[var(--st-fail-bg)] text-[var(--st-fail-fg)]" : "bg-[var(--st-done-bg)] text-[var(--st-done-fg)]",
      )}
    >
      {up ? <ArrowUpRight size={11} weight="bold" aria-hidden /> : <ArrowDownRight size={11} weight="bold" aria-hidden />}
      {Math.abs(value)}%
    </span>
  );
}

export function ProjectionView({
  p,
  balance,
  categories,
  usdRate,
}: {
  p: Projection;
  balance: number;
  categories: CategoryDTO[];
  usdRate: number | null;
}) {
  const cat = new Map(categories.map((c) => [c.id, c]));
  const vsAvg = pct(p.projected, p.avgMonth);
  const remaining = p.projected - p.spent;
  const incomeLeft = Math.max(p.incomeLeft, p.upcoming.income);
  const endBalance = balance - Math.max(remaining, p.upcoming.expense) + incomeLeft;
  const growing = p.categories.filter((c) => c.avg > 0 && c.projected > c.avg * 1.15).sort((a, b) => b.projected / b.avg - a.projected / a.avg)[0];
  const name = monthName(p.month);

  return (
    <>
      <PageHeader title="Proyección" wide tabs={<GastosTabs />} />
      <main className="mx-auto grid max-w-3xl grid-cols-1 gap-5 px-4 pt-2 pb-10 lg:max-w-6xl lg:grid-cols-12 lg:gap-6 lg:px-10 lg:pt-6">
        <section className="grid gap-3 lg:col-span-12 lg:gap-4" aria-label="Cierre del mes">
          <p className="max-w-3xl text-[15px] leading-relaxed text-muted lg:text-[17px]">
            Si seguís a este ritmo, en {name} vas a gastar alrededor de{" "}
            <strong className="font-semibold text-fg">{moneyCents(p.projected)}</strong>
            {vsAvg !== null && (
              <>
                , {Math.abs(vsAvg) < 3 ? "parecido a" : vsAvg > 0 ? `un ${vsAvg}% más que` : `un ${-vsAvg}% menos que`} tu promedio
              </>
            )}
            .{growing && cat.get(growing.categoryId ?? "") && ` La que más sube: ${cat.get(growing.categoryId ?? "")!.name}.`}
          </p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            <Tile icon={Receipt} label="Gastado" value={moneyCents(p.spent)} sub={`Hasta hoy, día ${p.elapsed} de ${p.days}`}>
              {/* El mes que pasó, en segmentos (un tramo por cada 5 días aprox.). */}
              <span className="tmini-seg" style={{ gridTemplateColumns: `repeat(${Math.ceil(p.days / 5)}, 1fr)` }} role="img" aria-label={`Pasaron ${p.elapsed} de ${p.days} días`}>
                {Array.from({ length: Math.ceil(p.days / 5) }, (_, i) => (
                  <span key={i} data-on={i * 5 < p.elapsed ? "" : undefined} />
                ))}
              </span>
            </Tile>
            <Tile icon={ChartLineUp} label="Al cierre" value={moneyCents(p.projected)} sub={`Falta gastar ~${moneyCents(remaining)}`}>
              <MiniBars
                label={`Proyección ${moneyCents(p.projected)} contra el promedio de ${moneyCents(p.avgMonth)}`}
                rows={[
                  { label: monthName(p.month).slice(0, 3), cents: p.projected },
                  { label: "prom.", cents: p.avgMonth, muted: true },
                ]}
              />
            </Tile>
            <Tile icon={CalendarCheck} label="Promedio" value={moneyCents(p.avgMonth)} sub="De los últimos 3 meses">
              {p.hist.length > 0 && (
                <MiniBars
                  label={`Gasto de los últimos meses: ${p.hist.slice(-3).map((h) => `${monthName(h.month)} ${moneyCents(h.expense)}`).join(", ")}`}
                  rows={p.hist.slice(-3).reverse().map((h, i) => ({ label: monthName(h.month).slice(0, 3), cents: h.expense, muted: i > 0 }))}
                />
              )}
            </Tile>
            <Tile
              icon={Wallet}
              label="Saldo a fin de mes"
              value={`${endBalance < 0 ? "−" : ""}${moneyCents(Math.abs(endBalance))}`}
              sub={`Entran ~${moneyCents(incomeLeft)}, salen ~${moneyCents(Math.max(remaining, p.upcoming.expense))}`}
            >
              <MiniBars
                label={`Hoy ${moneyCents(balance)}, a fin de mes ${moneyCents(endBalance)}`}
                rows={[
                  { label: "hoy", cents: balance, muted: true },
                  { label: "fin", cents: endBalance, color: endBalance < 0 ? "var(--st-fail-line)" : undefined },
                ]}
              />
            </Tile>
          </div>
        </section>

        <Card icon={ChartLineUp} title={`Cómo viene ${name}`} meta="Gasto acumulado del mes" className="lg:col-span-7">
          <MonthChart p={p} />
        </Card>

        <Card icon={CalendarBlank} title="Próximos meses" meta="Según tus últimos 6 meses" className="lg:col-span-5">
          {Math.abs(p.trendPct) >= 0.05 && (
            <p className="-mt-1 flex items-center gap-1.5 text-[13px] leading-relaxed text-muted">
              <TrendUp size={14} aria-hidden className={p.trendPct > 0 ? undefined : "-scale-y-100"} /> El gasto viene {p.trendPct > 0 ? "subiendo" : "bajando"}.
            </p>
          )}
          <ul className="grid gap-2">
            {p.next.map((n) => (
              <li key={n.month} className="grid gap-1.5 rounded-xl bg-surface-2 p-3">
                <span className="flex items-baseline justify-between">
                  <span className="text-[14px] font-medium first-letter:uppercase">{monthName(n.month)}</span>
                  <span className="tabular text-[14px]">gasto ~{moneyCents(n.expense)}</span>
                </span>
                <span className="flex items-baseline justify-between text-[12.5px] text-muted">
                  <span>ingresos ~{moneyCents(n.income)}</span>
                  <span className={cx("tabular font-medium", n.saving >= 0 ? "text-[var(--st-done-fg)]" : "text-[var(--st-fail-fg)]")}>
                    {n.saving >= 0 ? "ahorrás" : "te falta"} ~{moneyCents(Math.abs(n.saving))}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <details className="text-sm">
            <summary className="kicker inline-flex min-h-11 cursor-pointer items-center select-none hover:text-fg">Ver los 6 meses anteriores</summary>
            <table className="mt-1 w-full text-[13px]">
              <thead>
                <tr className="text-left text-muted">
                  <th className="py-1.5 font-normal">Mes</th>
                  <th className="py-1.5 text-right font-normal">Gastos</th>
                  <th className="py-1.5 text-right font-normal">Ingresos</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {[...p.hist].reverse().map((h) => (
                  <tr key={h.month} className="border-t border-line">
                    <td className="py-1 first-letter:uppercase">{formatMonth(h.month)}</td>
                    <td className="py-1 text-right">{moneyCents(h.expense)}</td>
                    <td className="py-1 text-right">{moneyCents(h.income)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </Card>

        <Card icon={ChartPieSlice} title="Por categoría, al cierre del mes" meta={`${p.categories.length} categorías`} className="lg:col-span-12">
          {p.categories.length === 0 ? (
            <p className="text-[14px] text-muted">Todavía no hay gastos para proyectar.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-left text-[14px]">
                <thead>
                  <tr className="border-b border-line text-[12px] text-muted">
                    <th className="py-2.5 pr-3 font-medium">Categoría</th>
                    <th className="px-3 py-2.5 text-right font-medium">Gastado</th>
                    <th className="px-3 py-2.5 text-right font-medium">Proyección</th>
                    <th className="px-3 py-2.5 text-right font-medium">Promedio</th>
                    <th className="py-2.5 pl-3 text-right font-medium">Contra el promedio</th>
                  </tr>
                </thead>
                <tbody className="tabular">
                  {p.categories.map((c) => {
                    const k = c.categoryId ? cat.get(c.categoryId) : undefined;
                    return (
                      <tr key={c.categoryId ?? "none"} className="border-b border-line last:border-b-0">
                        <td className="py-2.5 pr-3">
                          <span className="flex items-center gap-2.5">
                            <CategoryAvatar category={k} size={28} />
                            <span className="truncate">{k?.name ?? "Sin clasificar"}</span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right">{moneyCents(c.spent)}</td>
                        <td className="px-3 py-2.5 text-right font-medium">{moneyCents(c.projected)}</td>
                        <td className="px-3 py-2.5 text-right text-muted">{moneyCents(c.avg)}</td>
                        <td className="py-2.5 pl-3 text-right">
                          <Trend value={pct(c.projected, c.avg)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[12px] text-muted">
            Todo en pesos{usdRate ? ` (los dólares a ${moneyCents(Math.round(usdRate * 100))} por US$ 1)` : ""}; los ajustes de saldo no cuentan y los reintegros restan. La proyección mezcla tu ritmo de este mes con tu promedio: cuanto más avanza el mes, más
            pesa lo de este mes. Es una estimación, no una predicción.
          </p>
        </Card>
      </main>
    </>
  );
}

function Card({ icon, title, meta, className, children }: { icon: Icon; title: string; meta?: string; className?: string; children: React.ReactNode }) {
  return (
    <TintedCard icon={icon} title={title} meta={meta} className={className}>
      {children}
    </TintedCard>
  );
}

function Tile({ icon, label, value, sub, children }: { icon: Icon; label: string; value: string; sub?: string; children?: React.ReactNode }) {
  return (
    <StatTile icon={icon} label={label} figure={<span className={value.length > 8 ? "text-[22px] sm:text-[28px]" : "text-[26px] sm:text-[30px]"}>{value}</span>} sub={sub}>
      {children}
    </StatTile>
  );
}

/** Gasto acumulado: lo real hasta hoy, la proyección hasta fin de mes y el promedio de referencia. */
function MonthChart({ p }: { p: Projection }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 600;
  const H = 180;
  const max = Math.max(1, ...p.actual, ...p.avgLine, ...p.projectedLine.map((v) => v ?? 0));
  const x = (i: number) => (i / (p.days - 1)) * W;
  const y = (v: number) => H - 6 - (v / max) * (H - 16);
  const path = (vals: (number | null)[]) =>
    vals
      .map((v, i) => (v === null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`))
      .filter(Boolean)
      .map((pt, i) => `${i ? "L" : "M"}${pt}`)
      .join("");
  const focus = hover ?? p.elapsed - 1;
  const readout = `Día ${focus + 1}: ${
    p.actual[focus] !== undefined ? `real ${moneyCents(p.actual[focus])}` : `proyección ${moneyCents(p.projectedLine[focus] ?? 0)}`
  } · promedio ${moneyCents(p.avgLine[focus] ?? 0)}`;

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-4 rounded-full bg-[var(--fin-out)]" /> Real
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="w-4 border-t-2 border-dashed border-[var(--fin-out)]" /> Proyección
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="w-4 border-t-2 border-dotted border-faint" /> Promedio 3 meses
        </span>
        <span className="tabular ml-auto" aria-live="polite">
          {readout}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-44 w-full touch-none outline-none focus-visible:rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]"
        role="img"
        aria-label="Gasto acumulado del mes, real y proyectado. Usá las flechas para recorrer los días."
        tabIndex={0}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setHover(Math.max(0, Math.min(p.days - 1, Math.round(((e.clientX - r.left) / r.width) * (p.days - 1)))));
        }}
        onPointerLeave={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          setHover((h) => Math.max(0, Math.min(p.days - 1, (h ?? p.elapsed - 1) + (e.key === "ArrowRight" ? 1 : -1))));
        }}
      >
        {[0.5, 1].map((f) => (
          <line key={f} x1="0" x2={W} y1={y(max * f)} y2={y(max * f)} stroke="var(--border)" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={path(p.avgLine)} fill="none" stroke="var(--faint)" strokeWidth="1.5" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
        <path d={path(p.projectedLine)} fill="none" stroke="var(--fin-out)" strokeWidth="2" strokeDasharray="6 5" vectorEffect="non-scaling-stroke" />
        <path d={path(p.actual)} fill="none" stroke="var(--fin-out)" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {/* Se corre con translate (unidades del gráfico): se desliza de un día a otro en vez de saltar. */}
        <line x1={0} x2={0} y1="0" y2={H} stroke="var(--border-strong)" vectorEffect="non-scaling-stroke" className="fin-track" style={{ translate: `${x(focus).toFixed(1)}px 0` }} />
      </svg>
      <details className="text-sm">
        <summary className="kicker inline-flex min-h-11 cursor-pointer items-center select-none hover:text-fg">Ver como tabla</summary>
        <div className="mt-1 max-h-64 overflow-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-1.5 font-normal">Día</th>
                <th className="py-1.5 text-right font-normal">Real</th>
                <th className="py-1.5 text-right font-normal">Proyección</th>
                <th className="py-1.5 text-right font-normal">Promedio</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {Array.from({ length: p.days }, (_, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="py-1">{i + 1}</td>
                  <td className="py-1 text-right">{p.actual[i] !== undefined ? moneyCents(p.actual[i]) : ""}</td>
                  <td className="py-1 text-right">{i >= p.elapsed && p.projectedLine[i] !== null ? moneyCents(p.projectedLine[i]!) : ""}</td>
                  <td className="py-1 text-right">{moneyCents(p.avgLine[i] ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
