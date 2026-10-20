"use client";

import Link from "next/link";
import { memo, useState } from "react";
import { ChartBar, Fire } from "@phosphor-icons/react";
import { addDays, formatLong, startOfWeek, weekday } from "@/lib/dates";
import { currentStreak, dayProgress, habitScore, hasScore, WEEKDAY_SHORT, type LogMap } from "@/lib/habit-logic";
import { HabitAvatar } from "@/lib/habit-icons";
import type { HabitDTO } from "@/lib/habits";
import { cx } from "@/components/ui";
import { useTick } from "@/components/motion";
import { TintedCard } from "@/components/tinted-card";

export { dayProgress };

/**
 * Racha, puntaje y si tiene puntaje, guardados por objeto de marcas: `useHabitLogs`
 * conserva el mismo objeto mientras las marcas de ese hábito no cambian, así que al
 * tildar uno solo se recalcula ese (antes, ~140 ms por toque recalculando todos).
 */
const statCache = new WeakMap<LogMap, Map<string, { streak: number; score: number | null }>>();
function habitStats(h: HabitDTO, logs: LogMap, today: string) {
  let byKey = statCache.get(logs);
  if (!byKey) statCache.set(logs, (byKey = new Map()));
  const key = `${today}|${h.id}|${h.frequency}|${h.weekdays}|${h.timesPerWeek}|${h.weekStart}|${h.target}|${h.startDate}|${h.archivedOn ?? ""}`;
  let hit = byKey.get(key);
  if (!hit) {
    hit = { streak: currentStreak(h, logs, today), score: hasScore(h, logs, today) ? habitScore(h, logs, today) : null };
    byKey.set(key, hit);
  }
  return hit;
}

const NO_LOGS: LogMap = {};

export type TodayStats = {
  streaks: { h: HabitDTO; n: number }[];
  avgScore: number;
  week: { d: string; p: { done: number; total: number } | null; pct: number }[];
  weekPct: number;
};

/**
 * Lo que depende de todos los hábitos (rachas, puntaje promedio y la semana día por
 * día): Hoy lo calcula con las marcas diferidas (`useDeferredValue`), nunca en el
 * render urgente de un toque. Lo usan las píldoras de la tarjeta de arriba y el panel.
 */
export function todayStats(habits: HabitDTO[], logs: Record<string, LogMap>, today: string): TodayStats {
  const stats = habits.map((h) => ({ h, ...habitStats(h, logs[h.id] ?? NO_LOGS, today) }));
  const streaks = stats
    .map(({ h, streak }) => ({ h, n: streak }))
    .filter((s) => s.n > 0)
    .sort((a, b) => b.n - a.n || a.h.name.localeCompare(b.h.name, "es"))
    .slice(0, 5);
  // Solo los que ya tienen días (o semanas) que cuenten: uno creado hoy no baja el promedio.
  const scores = stats.flatMap((s) => (s.score === null ? [] : [s.score]));
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const monday = startOfWeek(today, 1);
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(monday, i);
    const p = d > today ? null : dayProgress(habits, logs, d, today);
    return { d, p, pct: p && p.total ? Math.round((p.done / p.total) * 100) : 0 };
  });
  const past = week.filter((r) => r.p && r.p.total);
  const weekPct = past.length ? Math.round(past.reduce((a, r) => a + r.pct, 0) / past.length) : 0;
  return { streaks, avgScore, week, weekPct };
}

/** Píldoras de la tarjeta de arriba de Hoy (celular): la semana, el puntaje y la racha más larga. */
export const TodayFacts = memo(function TodayFacts({ stats }: { stats: TodayStats }) {
  const top = stats.streaks[0];
  return (
    <ul className="hh-facts" aria-label="Resumen">
      <li>
        <b className="font-mono">{stats.weekPct}%</b> esta semana
      </li>
      <li>
        <b className="font-mono">{stats.avgScore}%</b> puntaje promedio
      </li>
      <li className="min-w-0">
        {top ? (
          <span className="block truncate">
            Racha: {top.h.name} <b className="font-mono">{top.n}</b> {top.h.frequency === "weekly" ? "sem" : top.n === 1 ? "día" : "días"}
          </span>
        ) : (
          "Sin rachas abiertas"
        )}
      </li>
    </ul>
  );
});

/**
 * Panel lateral de Hoy en la computadora: la semana día por día con el puntaje
 * promedio y las rachas más largas, en tarjetas con cabecera teñida (el avance del
 * día está en la tarjeta de arriba de la lista). Memorizado: Hoy le pasa lo calculado
 * con las marcas diferidas, así el toque en un círculo se dibuja primero.
 */
export const TodayPanel = memo(function TodayPanel({ stats, today }: { stats: TodayStats; today: string }) {
  const { streaks } = stats;
  return (
    <aside aria-label="Resumen de la semana" className="grid content-start gap-4">
      <WeekCard stats={stats} today={today} />

      <TintedCard
        icon={Fire}
        title="Rachas en curso"
        bodyClassName="py-2!"
      >
        {streaks.length === 0 ? (
          <p className="py-3 text-[14px] leading-relaxed text-muted">Ninguna racha abierta todavía. Marcá un hábito hoy para empezar una.</p>
        ) : (
          <ul>
            {streaks.map(({ h, n }) => (
              <li key={h.id} className="border-t border-line first:border-t-0">
                <Link
                  href={`/habitos/${h.id}?tab=estadisticas`}
                  className="-mx-2 flex min-h-12 items-center gap-3 rounded-[6px] px-2 transition-colors hover:bg-surface-2"
                >
                  <HabitAvatar icon={h.icon} color={h.color} size={28} />
                  <span className="min-w-0 flex-1 truncate text-[14.5px]">{h.name}</span>
                  <span className="font-mono text-[13px] text-muted tabular">
                    <span className="text-fg">{n}</span> {h.frequency === "weekly" ? "sem" : n === 1 ? "día" : "días"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </TintedCard>
    </aside>
  );
});

/**
 * La semana en curso: una columna por día con la proporción de hábitos hechos.
 * Una sola serie; hoy en el acento y el resto en un tono suave. El valor se lee
 * al pasar o enfocar, y en la tabla.
 */
function WeekCard({ stats, today }: { stats: TodayStats; today: string }) {
  const { week: rows, weekPct, avgScore } = stats;
  const days = rows.map((r) => r.d);
  const [hover, setHover] = useState<number | null>(null);
  const shownIdx = hover ?? days.indexOf(today);
  const shown = rows[shownIdx];
  const H = 84;
  const scoreTick = useTick(avgScore);

  return (
    <TintedCard icon={ChartBar} title="Esta semana" meta={`${weekPct}% cumplido`} bodyClassName="gap-0! pb-2!">
      <p className="tabular min-h-5 text-[12.5px] text-muted" aria-live="polite">
        {shown &&
          (shown.p
            ? `${WEEKDAY_SHORT[weekday(shown.d)]} ${Number(shown.d.slice(8))}: ${shown.p.done} de ${shown.p.total} hechos`
            : `${WEEKDAY_SHORT[weekday(shown.d)]} ${Number(shown.d.slice(8))}: todavía no llegó`)}
      </p>
      <div className="relative mt-2" style={{ height: H }}>
        <span className="absolute inset-x-0 bottom-0 h-px bg-line-strong" />
        <div className="absolute inset-0 grid grid-cols-7 gap-1.5">
          {rows.map((r, i) => (
            <button
              key={r.d}
              type="button"
              aria-label={r.p ? `${formatLong(r.d)}: ${r.p.done} de ${r.p.total} hechos` : `${formatLong(r.d)}: todavía no llegó`}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover((x) => (x === i ? null : x))}
              onFocus={() => setHover(i)}
              onBlur={() => setHover((x) => (x === i ? null : x))}
              className={cx("group relative flex items-end justify-center overflow-hidden rounded-t-[4px]", hover === i && "bg-surface-2/70")}
            >
              {r.p ? (
                // La barra mide siempre lo mismo y sube o baja corriéndose (transform, no el alto):
                // al tildar un hábito, la de hoy crece sin recalcular el layout.
                <span
                  className={cx(
                    "block w-full max-w-5 rounded-t-[4px] transition-[transform,background-color] duration-[var(--dur-state)] ease-[var(--ease-out)] motion-reduce:transition-[background-color]",
                    r.d === today ? "bg-accent" : "bg-[color-mix(in_oklab,var(--accent)_38%,var(--surface))] group-hover:bg-[color-mix(in_oklab,var(--accent)_60%,var(--surface))]",
                  )}
                  style={{ height: H - 4, transform: `translateY(${H - 4 - (r.pct ? Math.max(3, (r.pct / 100) * (H - 4)) : 2)}px)` }}
                />
              ) : (
                <span className="block h-[2px] w-full max-w-5 rounded-full bg-line-strong" />
              )}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-1.5 grid grid-cols-7 gap-1.5" aria-hidden>
        {days.map((d) => (
          <span key={d} className={cx("text-center font-mono text-[10.5px] uppercase", d === today ? "font-semibold text-fg" : "text-muted")}>
            {WEEKDAY_SHORT[weekday(d)]}
          </span>
        ))}
      </div>

      <div className="mt-4 flex items-baseline justify-between border-t border-line pt-3">
        <span className="text-[13.5px] text-muted">Puntaje promedio</span>
        <span className="figure text-[24px]">
          <span key={scoreTick.key} className={scoreTick.className}>
            {avgScore}
          </span>
          <span className="text-[15px] text-muted">%</span>
        </span>
      </div>

      <details className="text-sm">
        <summary className="kicker inline-flex min-h-11 cursor-pointer items-center select-none hover:text-fg">Ver como tabla</summary>
        <table className="mb-2 w-full text-[13px]">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-1.5 font-normal">Día</th>
              <th className="py-1.5 text-right font-normal">Hechos</th>
              <th className="py-1.5 text-right font-normal">%</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {rows.map((r) => (
              <tr key={r.d} className="border-t border-line">
                <td className="py-1.5">
                  {WEEKDAY_SHORT[weekday(r.d)]} {Number(r.d.slice(8))}
                </td>
                <td className="py-1.5 text-right">{r.p ? `${r.p.done} de ${r.p.total}` : "Sin datos"}</td>
                <td className="py-1.5 text-right">{r.p ? `${r.pct}%` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </TintedCard>
  );
}
