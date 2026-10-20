"use client";

import { useState } from "react";
import { PencilSimple, PiggyBank } from "@phosphor-icons/react";
import { TintedCard } from "@/components/tinted-card";
import { useSafeTransition } from "@/components/safe-action";
import { saveReserveGoal } from "@/lib/offline/finance";
import { formatMonth } from "@/lib/dates";
import { dec1, moneyWhole } from "@/lib/format";
import { Button, Input } from "@/components/ui";

export type ReserveData = {
  balanceCents: number;
  spendCents: number | null;
  months: number | null;
  goal: number;
  series: { month: string; months: number | null }[];
};

/** "4 meses y medio", "1 mes", "casi 3 meses": la cifra dicha como se diría. */
function spoken(m: number): string {
  const whole = Math.floor(m);
  const frac = m - whole;
  if (frac >= 0.8) return `casi ${whole + 1} meses`;
  if (frac >= 0.4 && frac < 0.6) return whole === 0 ? "medio mes" : `${whole} ${whole === 1 ? "mes" : "meses"} y medio`;
  return whole === 1 ? "1 mes" : `${whole} meses`;
}

/**
 * Meses de reserva: cuánto durarían los ahorros sin ingresos (saldo personal en
 * pesos / gasto promedio de los últimos 3 meses), contra una meta, y cómo
 * evolucionó al cierre de cada uno de los últimos 12 meses.
 */
export function ReserveCard({ data }: { data: ReserveData }) {
  const [focus, setFocus] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [goal, setGoal] = useState(data.goal);
  const [draft, setDraft] = useState(String(data.goal).replace(".", ","));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useSafeTransition();
  const { months, spendCents, balanceCents, series } = data;
  const pct = months === null ? 0 : Math.max(0, Math.min(100, Math.round((months / goal) * 100)));
  const missing = spendCents && months !== null && months < goal ? Math.round(goal * spendCents - balanceCents) : 0;

  // Gráfico: una línea de 12 cierres con la meta punteada (un solo eje, en meses).
  const pts = series.map((p, i) => ({ ...p, i })).filter((p): p is { month: string; months: number; i: number } => p.months !== null);
  const W = 560;
  const H = 150;
  const PAD = { l: 8, r: 8, t: 22, b: 10 };
  const top = Math.max(goal * 1.15, ...pts.map((p) => p.months), 1);
  const bottom = Math.min(0, ...pts.map((p) => p.months));
  const x = (i: number) => PAD.l + (series.length > 1 ? (i / (series.length - 1)) * (W - PAD.l - PAD.r) : 0);
  const y = (v: number) => PAD.t + (1 - (v - bottom) / (top - bottom)) * (H - PAD.t - PAD.b);
  const line = pts.map((p, k) => `${k ? "L" : "M"}${x(p.i).toFixed(1)},${y(p.months).toFixed(1)}`).join(" ");
  const shown = focus ?? series.length - 1;
  const label = (m: string) => formatMonth(m).split(" ")[0].slice(0, 3);

  function save() {
    const n = Number(draft.replace(",", "."));
    start(async () => {
      const r = await saveReserveGoal(n);
      if (!r.ok) return setError(r.error);
      setError(null);
      setGoal(Math.round(n * 10) / 10);
      setEditing(false);
    });
  }

  return (
    <TintedCard
      id="reserva"
      icon={PiggyBank}
      title="Meses de reserva"
      meta={`Meta ${dec1(goal)} meses · ${pct}%`}
      progress={pct / 100}
      className="scroll-mt-24"
      bodyClassName="grid! gap-6! lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:p-6!"
    >
      <div className="grid content-start gap-3">
        <p className="flex items-baseline gap-2">
          <span className="figure text-[48px] leading-none">{months === null ? "–" : dec1(months)}</span>
          <span className="text-[16px] text-muted">{months === 1 ? "mes" : "meses"}</span>
        </p>
        <p className="max-w-[44ch] text-[14px] leading-relaxed text-muted">
          {months === null || !spendCents ? (
            "Hace falta al menos un mes con gastos para calcularlo."
          ) : (
            <>
              Con <span className="font-semibold text-fg">{moneyWhole(balanceCents)}</span> de saldo personal y un gasto de{" "}
              <span className="font-semibold text-fg">{moneyWhole(spendCents)} por mes</span> (promedio de los últimos 3), {months <= 0 ? "no te alcanzaría para un mes sin ingresos" : `podrías vivir ${spoken(months)} sin ingresos`}.
            </>
          )}
        </p>
        <div className="grid gap-1.5 pt-1">
          <div className="flex items-center justify-between gap-3 text-[13px]">
            {editing ? (
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  save();
                }}
              >
                <label htmlFor="reserva-meta" className="text-muted">
                  Meta
                </label>
                <Input id="reserva-meta" inputMode="decimal" value={draft} onChange={(e) => setDraft(e.target.value)} className="h-9 w-20" autoFocus />
                <span className="text-muted">meses</span>
                <Button type="submit" size="sm" variant="accent" disabled={pending}>
                  Guardar
                </Button>
              </form>
            ) : (
              <button type="button" onClick={() => setEditing(true)} className="inline-flex min-h-11 items-center gap-1.5 text-muted hover:text-fg">
                Meta: {dec1(goal)} meses <PencilSimple size={13} aria-label="Cambiar la meta" />
              </button>
            )}
            <span className="font-mono text-muted tabular">{pct}%</span>
          </div>
          {error && <p className="reveal text-[13px] text-danger">{error}</p>}
          <p className="text-[12.5px] text-muted">{months !== null && months >= goal ? "Llegaste a la meta." : missing > 0 ? `Te faltan ${moneyWhole(missing)} para llegar.` : ""}</p>
        </div>
      </div>

      <div className="grid content-start gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <p className="kicker">Últimos 12 meses</p>
          <p className="tabular text-[12.5px] text-muted first-letter:uppercase" aria-live="polite">
            {series[shown] && `${formatMonth(series[shown].month)}: ${series[shown].months === null ? "sin datos" : `${dec1(series[shown].months!)} meses`}`}
          </p>
        </div>
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible" aria-hidden>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(goal)} y2={y(goal)} stroke="var(--accent)" strokeDasharray="4 4" strokeOpacity="0.6" />
            <text x={W - PAD.r} y={y(goal) - 6} textAnchor="end" className="fill-[var(--muted)] font-mono text-[11px]">
              meta {dec1(goal)}
            </text>
            {bottom < 0 && <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} stroke="var(--line-strong)" />}
            <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
            {pts.map((p) => (
              <circle key={p.month} cx={x(p.i)} cy={y(p.months)} r={p.i === shown ? 4.5 : p.i === series.length - 1 ? 4 : 0} fill="var(--accent)" />
            ))}
          </svg>
          {/* Una franja por mes para el puntero y el teclado. */}
          <div className="absolute inset-0 flex" role="list" aria-label="Meses de reserva al cierre de cada mes">
            {series.map((p, i) => (
              <button
                key={p.month}
                type="button"
                role="listitem"
                aria-label={`${formatMonth(p.month)}: ${p.months === null ? "sin datos" : `${dec1(p.months)} meses`}`}
                onPointerEnter={() => setFocus(i)}
                onPointerLeave={() => setFocus(null)}
                onFocus={() => setFocus(i)}
                onBlur={() => setFocus(null)}
                className="h-full flex-1 outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              />
            ))}
          </div>
        </div>
        <div className="flex justify-between font-mono text-[11px] text-muted">
          <span>{series[0] && label(series[0].month)}</span>
          <span>{series.at(-1) && label(series.at(-1)!.month)}</span>
        </div>
        <details className="text-sm">
          <summary className="kicker inline-flex min-h-11 cursor-pointer items-center select-none hover:text-fg">Ver como tabla</summary>
          <table className="mt-1 w-full text-[13px]">
            <tbody className="tabular">
              {[...series].reverse().map((p) => (
                <tr key={p.month} className="border-t border-line">
                  <td className="py-1 first-letter:uppercase">{formatMonth(p.month)}</td>
                  <td className="py-1 text-right">{p.months === null ? "–" : `${dec1(p.months)} meses`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
        <p className="text-[11.5px] text-muted">Sin cuentas de trabajo, transferencias ni ajustes; los dólares con la cotización de hoy.</p>
      </div>
    </TintedCard>
  );
}
