"use client";

import { useEffect, useRef, useState } from "react";
import type { DayMetrics } from "@/lib/daily-metrics";
import { addDays, formatShort, startOfWeek, weekday } from "@/lib/dates";
import { MOODS, moodInfo } from "@/lib/journal-logic";
import { dec1 } from "@/lib/format";
import { PillSwitch } from "@/components/pill-switch";
import { cx } from "@/components/ui";
import { SquaresFour } from "@phosphor-icons/react";
import { Card } from "../summary-ui";

type View = "habitos" | "journal" | "animo";

const VIEWS: { value: View; label: string }[] = [
  { value: "habitos", label: "Hábitos" },
  { value: "journal", label: "Journal" },
  { value: "animo", label: "Ánimo" },
];

const COLOR: Record<View, string> = {
  habitos: "var(--c-habitos)",
  journal: "var(--c-journal)",
  animo: "var(--mod-inicio)",
};

/** Mismos escalones que la Constancia de Inicio. */
const RAMP = [0, 22, 45, 70, 100];
const ROWS = ["L", "M", "X", "J", "V", "S", "D"];
const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"];
const WD = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

const mix = (color: string, pct: number) => `color-mix(in oklab, ${color} ${pct}%, var(--surface-2))`;

/**
 * Constancia del año, tipo GitHub: una columna por semana (lunes a domingo) y una
 * fila por día. Hábitos (% del día, la misma cuenta que Hoy e Inicio), journal
 * (escribiste o no) y ánimo (color de cada cara). Los días que no llegaron, vacíos.
 */
export function YearHeat({ year, days, today }: { year: string; days: DayMetrics[]; today: string }) {
  const [view, setView] = useState<View>("habitos");
  const [focus, setFocus] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const byDate = new Map(days.map((d) => [d.date, d]));
  const first = `${year}-01-01`;
  const last = `${year}-12-31`;
  const start = startOfWeek(first);
  const cols = Math.ceil((Math.round((Date.parse(last) - Date.parse(start)) / 86_400_000) + 1) / 7);
  const cells = Array.from({ length: cols * 7 }, (_, i) => addDays(start, i));
  const inYear = (iso: string) => iso >= first && iso <= last;
  const passed = (iso: string) => iso <= today && byDate.has(iso);

  // Rótulo de mes arriba de la columna donde empieza (la que tiene su día 1).
  const monthAt = Array.from({ length: cols }, (_, c) => {
    for (let r = 0; r < 7; r++) {
      const iso = cells[c * 7 + r];
      if (inYear(iso) && iso.endsWith("-01")) return MONTHS[Number(iso.slice(5, 7)) - 1];
    }
    return "";
  });

  // En el celular arranca mostrando hasta hoy (el mapa se desliza a lo ancho solo, sin mover la página).
  useEffect(() => {
    const el = scroller.current;
    const mark = el?.querySelector<HTMLElement>("[data-hoy]");
    if (el && mark) el.scrollLeft = Math.max(0, mark.offsetLeft - el.clientWidth + 48);
    else if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  function level(iso: string): { bg: string; text: string; none?: boolean } {
    const d = byDate.get(iso);
    if (!d) return { bg: "var(--surface-2)", text: "sin datos" };
    if (view === "habitos") {
      if (!d.habitsDue) return { bg: "transparent", text: "no tocaba ningún hábito", none: true };
      const p = d.habitsDone / d.habitsDue;
      const l = p === 0 ? 0 : p < 0.34 ? 1 : p < 0.67 ? 2 : p < 1 ? 3 : 4;
      return {
        bg: l === 0 ? "var(--surface-2)" : mix(COLOR.habitos, RAMP[l]),
        text: `${d.habitsDone} de ${d.habitsDue} hábitos (${Math.round(p * 100)}%)`,
      };
    }
    if (view === "journal") return d.wrote ? { bg: COLOR.journal, text: "escribiste" } : { bg: "var(--surface-2)", text: "sin escribir" };
    const info = moodInfo(d.mood);
    return info ? { bg: `var(--p-${info.color}-solid)`, text: `ánimo: ${info.label.toLowerCase()}` } : { bg: "var(--surface-2)", text: "sin ánimo" };
  }

  // Resumen de la vista (hoy, si no está completo, no baja el promedio de hábitos).
  const past = days.filter((d) => d.date <= today);
  const habitDays = past.filter((d) => d.habitsDue > 0 && (d.date < today || d.habitsDone >= d.habitsDue));
  const habitAvg = habitDays.length ? Math.round((habitDays.reduce((n, d) => n + d.habitsDone / d.habitsDue, 0) / habitDays.length) * 100) : null;
  const wrote = past.filter((d) => d.wrote).length;
  const moods = past.filter((d) => d.mood !== null);
  const moodAvg = moods.length ? moods.reduce((n, d) => n + (d.mood ?? 0), 0) / moods.length : null;
  const summary =
    view === "habitos"
      ? habitAvg === null
        ? "Sin hábitos en el año"
        : `${habitAvg}% de cumplimiento promedio`
      : view === "journal"
        ? `Escribiste ${wrote} de ${past.length} ${past.length === 1 ? "día" : "días"}`
        : moodAvg === null
          ? "Sin ánimo cargado"
          : `Ánimo promedio ${dec1(moodAvg)} en ${moods.length} ${moods.length === 1 ? "día" : "días"}`;
  const dayLabel = (iso: string) => `${WD[weekday(iso)]} ${formatShort(iso)}`;

  // Con el teclado: el mapa es un solo lugar de foco y las flechas recorren los días.
  function onKey(e: React.KeyboardEvent) {
    const step = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    const cur = focus ?? (today >= first && today <= last ? today : last);
    let next = addDays(cur, step);
    if (next < first) next = first;
    if (next > last) next = last;
    setFocus(next);
  }

  return (
    <Card title="Constancia del año" tone="inicio" icon={SquaresFour} meta={`Cada cuadrito es un día · ${year}`} className="lg:col-span-12 print:col-span-2 print:break-inside-avoid">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <PillSwitch label="Qué mostrar" value={view} options={VIEWS} onChange={setView} item="h-8 px-3 text-[12.5px]" />
        <p className="tabular min-h-5 text-[12.5px] text-muted" aria-live="polite">
          {focus ? `${dayLabel(focus)}: ${focus > today ? "todavía no llegó" : level(focus).text}` : summary}
        </p>
      </div>

      <div ref={scroller} className="overflow-x-auto pb-1">
        <div className="grid min-w-[44rem] grid-cols-[1.25rem_minmax(0,1fr)] gap-x-1.5 gap-y-1">
          {/* Los días de la semana quedan fijos a la izquierda al deslizar. */}
          <span aria-hidden className="sticky left-0 z-[1] -mr-1.5 bg-surface pr-1.5" />
          <div className="grid gap-[3px] text-[10px] text-muted" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }} aria-hidden>
            {monthAt.map((m, i) => (
              <span key={i} className="overflow-visible leading-none whitespace-nowrap">
                {m}
              </span>
            ))}
          </div>
          <div className="sticky left-0 z-[1] -mr-1.5 grid grid-rows-7 gap-[3px] bg-surface pr-1.5 text-[10px] text-muted" aria-hidden>
            {ROWS.map((l, i) => (
              <span key={i} className="flex items-center leading-none">
                {i % 2 === 0 ? l : ""}
              </span>
            ))}
          </div>
          <div
            role="img"
            tabIndex={0}
            aria-label={`Constancia de ${year}, ${VIEWS.find((v) => v.value === view)!.label.toLowerCase()}: ${summary}. Usá las flechas para recorrer los días.`}
            onKeyDown={onKey}
            onBlur={() => setFocus(null)}
            className="grid grid-flow-col grid-rows-7 gap-[3px] rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          >
            {cells.map((iso) => {
              if (!inYear(iso)) return <span key={iso} aria-hidden className="aspect-square" />;
              if (!passed(iso)) {
                return (
                  <span
                    key={iso}
                    title={`${dayLabel(iso)}: todavía no llegó`}
                    className={cx("aspect-square rounded-[3px] border border-line", focus === iso && "shadow-[0_0_0_2px_var(--text)]")}
                    onPointerEnter={() => setFocus(iso)}
                    onPointerLeave={() => setFocus((f) => (f === iso ? null : f))}
                  />
                );
              }
              const { bg, text, none } = level(iso);
              return (
                <span
                  key={iso}
                  data-hoy={iso === today ? "" : undefined}
                  title={`${dayLabel(iso)}: ${text}`}
                  onPointerEnter={() => setFocus(iso)}
                  onPointerLeave={() => setFocus((f) => (f === iso ? null : f))}
                  className={cx(
                    "aspect-square rounded-[3px]",
                    none && "border border-dashed border-line",
                    focus === iso ? "shadow-[0_0_0_2px_var(--text)]" : iso === today && "shadow-[0_0_0_1.5px_var(--text)]",
                  )}
                  style={{ background: bg }}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-muted">
        {view === "habitos" && (
          <span className="inline-flex items-center gap-1.5">
            0%
            {RAMP.map((p, i) => (
              <span key={i} aria-hidden className="size-3 rounded-[3px]" style={{ background: i === 0 ? "var(--surface-2)" : mix(COLOR.habitos, p) }} />
            ))}
            100% de los hábitos del día
          </span>
        )}
        {view === "journal" && (
          <>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-3 rounded-[3px] bg-surface-2" /> Sin escribir
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-3 rounded-[3px]" style={{ background: COLOR.journal }} /> Escribiste
            </span>
          </>
        )}
        {view === "animo" &&
          MOODS.map((m) => (
            <span key={m.value} className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-3 rounded-[3px]" style={{ background: `var(--p-${m.color}-solid)` }} /> {m.label}
            </span>
          ))}
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-3 rounded-[3px] border border-line" /> Todavía no llegó
        </span>
      </div>

      <details className="print:hidden">
        <summary className="kicker inline-flex min-h-11 cursor-pointer items-center select-none hover:text-fg">Ver como tabla</summary>
        <div className="mt-1 max-h-72 overflow-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-1.5 font-normal">Día</th>
                <th className="py-1.5 text-right font-normal">Hábitos</th>
                <th className="py-1.5 text-right font-normal">Journal</th>
                <th className="py-1.5 text-right font-normal">Ánimo</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {[...past].reverse().map((d) => (
                <tr key={d.date} className="border-t border-line">
                  <td className="py-1">{dayLabel(d.date)}</td>
                  <td className="py-1 text-right">
                    {d.habitsDue ? `${d.habitsDone} de ${d.habitsDue} (${Math.round((d.habitsDone / d.habitsDue) * 100)}%)` : "–"}
                  </td>
                  <td className="py-1 text-right">{d.wrote ? "Escribiste" : "–"}</td>
                  <td className="py-1 text-right">{moodInfo(d.mood)?.label ?? "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Card>
  );
}
