"use client";

import Link from "next/link";
import { useState } from "react";
import { addDays, formatLong, startOfWeek, weekday } from "@/lib/dates";
import { currentStreak, dayState, habitScore, isScheduled, WEEKDAY_SHORT, type LogMap } from "@/lib/habit-logic";
import { HabitIcon } from "@/lib/habit-icons";
import { tone } from "@/lib/palette";
import type { HabitDTO } from "@/lib/habits";
import { cx, ToneSquare } from "@/components/ui";

/** Hábitos que tocan un día y cuántos ya están hechos (misma regla que la lista de Hoy). */
export function dayProgress(habits: HabitDTO[], logs: Record<string, LogMap>, iso: string, today: string) {
  const due = habits.filter((h) => iso >= h.startDate && isScheduled(h, iso));
  const done = due.filter((h) => dayState(h, logs[h.id] ?? {}, iso, today) === "done").length;
  return { done, total: due.length };
}

/**
 * Panel lateral de Hoy en la computadora: el avance del día en el bloque
 * destacado, la semana día por día, el puntaje promedio y las rachas más largas.
 */
export function TodayPanel({
  habits,
  logs,
  selected,
  today,
}: {
  habits: HabitDTO[];
  logs: Record<string, LogMap>;
  selected: string;
  today: string;
}) {
  const { done, total } = dayProgress(habits, logs, selected, today);
  const pct = total ? Math.round((done / total) * 100) : 0;
  const isToday = selected === today;

  const streaks = habits
    .map((h) => ({ h, n: currentStreak(h, logs[h.id] ?? {}, today) }))
    .filter((s) => s.n > 0)
    .sort((a, b) => b.n - a.n || a.h.name.localeCompare(b.h.name, "es"))
    .slice(0, 5);

  const scores = habits.map((h) => habitScore(h, logs[h.id] ?? {}, today));
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

  return (
    <aside aria-label="Resumen del día" className="grid content-start gap-4">
      <section className="hero rise overflow-hidden rounded-2xl px-6 pt-5 pb-6">
        <div className="flex items-baseline justify-between gap-3">
          <p className="hero-sub font-mono text-[11px] tracking-[0.08em] uppercase">
            {isToday ? "Hoy" : "Día elegido"}
          </p>
          <p className="hero-sub truncate font-mono text-[11px] tracking-[0.04em]">{formatLong(selected)}</p>
        </div>
        <p className="mt-4 flex items-baseline gap-2">
          <span className="figure text-[64px]">{done}</span>
          <span className="figure hero-sub text-[26px]">de {total}</span>
          <span className="ml-auto font-mono text-[13px] tabular">{pct}%</span>
        </p>
        <div
          role="progressbar"
          aria-label="Hábitos hechos"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          className="mt-4 h-2 overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--hero-fg)_18%,transparent)]"
        >
          <span
            className="block h-full rounded-full bg-[var(--hero-fg)] transition-[width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="hero-sub mt-3 text-[13px]">
          {total === 0
            ? "Nada programado para este día."
            : done === total
              ? "Completaste todo lo del día."
              : `${total - done === 1 ? "Falta 1" : `Faltan ${total - done}`} para cerrar el día.`}
        </p>
      </section>

      <WeekCard habits={habits} logs={logs} today={today} avgScore={avgScore} />

      <section className="rise rounded-2xl border border-line bg-surface px-5 pt-4 pb-2" style={{ "--i": 2 } as React.CSSProperties}>
        <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Rachas en curso</h2>
        {streaks.length === 0 ? (
          <p className="py-4 text-[14px] text-muted">Ninguna racha abierta todavía. Marcá un hábito hoy para empezar una.</p>
        ) : (
          <ul className="mt-2">
            {streaks.map(({ h, n }) => (
              <li key={h.id} className="border-t border-line first:border-t-0">
                <Link
                  href={`/habitos/${h.id}?tab=estadisticas`}
                  className="-mx-2 flex min-h-12 items-center gap-3 rounded-[6px] px-2 transition-colors hover:bg-surface-2"
                >
                  <ToneSquare size={28} style={tone(h.color)}>
                    <HabitIcon name={h.icon} size={15} weight="fill" />
                  </ToneSquare>
                  <span className="min-w-0 flex-1 truncate text-[14.5px]">{h.name}</span>
                  <span className="font-mono text-[13px] text-muted tabular">
                    <span className="text-fg">{n}</span> {h.frequency === "weekly" ? "sem" : n === 1 ? "día" : "días"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}

/**
 * La semana en curso: una columna por día con la proporción de hábitos hechos.
 * Una sola serie; hoy en el acento y el resto en un tono suave. El valor se lee
 * al pasar o enfocar, y en la tabla.
 */
function WeekCard({
  habits,
  logs,
  today,
  avgScore,
}: {
  habits: HabitDTO[];
  logs: Record<string, LogMap>;
  today: string;
  avgScore: number;
}) {
  const monday = startOfWeek(today, 1);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const rows = days.map((d) => {
    const p = d > today ? null : dayProgress(habits, logs, d, today);
    return { d, p, pct: p && p.total ? Math.round((p.done / p.total) * 100) : 0 };
  });
  const past = rows.filter((r) => r.p && r.p.total);
  const weekPct = past.length ? Math.round(past.reduce((a, r) => a + r.pct, 0) / past.length) : 0;
  const [hover, setHover] = useState<number | null>(null);
  const shownIdx = hover ?? days.indexOf(today);
  const shown = rows[shownIdx];
  const H = 84;

  return (
    <section className="rise rounded-2xl border border-line bg-surface px-5 pt-4 pb-3" style={{ "--i": 1 } as React.CSSProperties}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Esta semana</h2>
        <span className="font-mono text-[12px] text-muted tabular">{weekPct}% cumplido</span>
      </div>
      <p className="tabular mt-1 min-h-5 text-[12.5px] text-muted" aria-live="polite">
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
              tabIndex={0}
              aria-label={r.p ? `${formatLong(r.d)}: ${r.p.done} de ${r.p.total} hechos` : `${formatLong(r.d)}: todavía no llegó`}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover((x) => (x === i ? null : x))}
              onFocus={() => setHover(i)}
              onBlur={() => setHover((x) => (x === i ? null : x))}
              className={cx("group flex items-end justify-center rounded-t-[4px]", hover === i && "bg-surface-2/70")}
            >
              {r.p ? (
                <span
                  className={cx(
                    "block w-full max-w-5 rounded-t-[4px] transition-colors",
                    r.d === today ? "bg-accent" : "bg-[color-mix(in_oklab,var(--accent)_38%,var(--surface))] group-hover:bg-[color-mix(in_oklab,var(--accent)_60%,var(--surface))]",
                  )}
                  style={{ height: r.pct ? Math.max(3, (r.pct / 100) * (H - 4)) : 2 }}
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
          {avgScore}
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
    </section>
  );
}
