"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowDownRight, ArrowUpRight, Brain, CaretLeft, CaretRight, Fire, Footprints, Heartbeat, Moon, Path, Scales, Trophy, Watch, type Icon } from "@phosphor-icons/react";
import { PeriodArrow, usePeriodNav } from "../period-nav";
import type { HealthData } from "@/lib/health";
import {
  changeOf,
  emptyHealthDay,
  HEALTH_KEYS,
  healthHighlights,
  SLEEP_GOAL_MIN,
  STEPS_GOAL,
  kmText,
  niceCeil,
  PARTIAL_TODAY,
  sleepText,
  STRESS_LEVELS,
  stressLevel,
  type HealthDay,
  type HealthKey,
  type MonthHealth,
} from "@/lib/health-logic";
import { addDays, formatMonth, formatShort, monthBounds, shiftMonth, todayISO } from "@/lib/dates";
import { formatSleep, formatWeight } from "@/lib/checkin-logic";
import { dec1, shortNumber } from "@/lib/format";
import { tone } from "@/lib/palette";
import { PageHeader } from "@/components/page-header";
import { cx, ToneSquare } from "@/components/ui";

const nf = new Intl.NumberFormat("es-UY", { maximumFractionDigits: 0 });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** "setiembre" (sin el año). */
const monthWord = (m: string) => formatMonth(m).split(" ")[0].toLowerCase();

const navClass =
  "relative inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors before:absolute before:-inset-1 before:content-[''] hover:bg-surface-2 hover:text-fg";

type Values = Record<HealthKey, number | null>;

/** Color (de la paleta) e ícono de cada medida: se reconocen igual en las cifras y en los gráficos. */
const METRIC: Record<"steps" | "sleepMin" | "stress" | "hr" | "distanceM" | "activeKcal" | "weightG", { color: string; icon: Icon; id: string }> = {
  steps: { color: "green", icon: Footprints, id: "pasos" },
  sleepMin: { color: "purple", icon: Moon, id: "sueno" },
  stress: { color: "blue", icon: Brain, id: "estres" },
  hr: { color: "red", icon: Heartbeat, id: "pulso" },
  distanceM: { color: "teal", icon: Path, id: "distancia" },
  activeKcal: { color: "orange", icon: Fire, id: "calorias" },
  weightG: { color: "brown", icon: Scales, id: "peso" },
};
const chip = (c: string) => `var(--p-${c}-chip)`;
/** El color de la medida, más suave (días que no llegaron a la meta, el mini-gráfico). */
const soft = (c: string, pct = 38) => `color-mix(in oklab, var(--p-${c}-chip) ${pct}%, var(--surface-2))`;

/** El año en curso también: hasta diciembre, los meses que faltan vacíos. */
function withRestOfYear(months: MonthHealth[], year: string): MonthHealth[] {
  const out = [...months];
  for (let m = months.length ? shiftMonth(months.at(-1)!.month, 1) : `${year}-01`; m <= `${year}-12`; m = shiftMonth(m, 1)) {
    out.push({ month: m, ...(Object.fromEntries(HEALTH_KEYS.map((k) => [k, null])) as Values) });
  }
  return out;
}

/** El mes en curso se dibuja entero (los días que faltan, vacíos): el eje no cambia día a día. */
function withRestOfMonth(days: HealthDay[], month: string): HealthDay[] {
  const end = monthBounds(month).to;
  const out = [...days];
  for (let d = addDays(days.at(-1)?.date ?? `${month}-01`, days.length ? 1 : 0); d <= end; d = addDays(d, 1)) out.push(emptyHealthDay(d));
  return out;
}

export function HealthView({ data }: { data: HealthData }) {
  const { period, summary: s, today } = data;
  const isYear = period.kind === "year";
  const key = period.key;
  const vs = isYear ? `vs ${period.prevKey}` : `vs ${monthWord(period.prevKey)}`;

  // Flechas y "Mes/Año": el rótulo cambia al toque; varios toques se suman (usePeriodNav).
  const nav = usePeriodNav(key);
  const now = todayISO();
  const shownYear = /^\d{4}$/.test(nav.shown);
  const shownCurrent = nav.shown === now.slice(0, shownYear ? 4 : 7);
  const shift = (k: string, d: number) => (/^\d{4}$/.test(k) ? String(Number(k) + d) : shiftMonth(k, d));
  const hrefOf = (k: string) => (/^\d{4}$/.test(k) ? `/salud?anio=${k}` : `/salud?mes=${k}`);
  const goTo = (k: string) => nav.go(k, hrefOf(k));
  const shownWord = shownYear ? "año" : "mes";
  const lastMonth = period.to.slice(0, 7);
  const toggleKey = shownYear
    ? nav.shown === key
      ? lastMonth
      : `${nav.shown}-12` > now.slice(0, 7)
        ? now.slice(0, 7)
        : `${nav.shown}-12`
    : nav.shown.slice(0, 4);

  // Puntos de los gráficos: un día (vista del mes) o un mes (vista del año).
  const points: Point[] = isYear
    ? withRestOfYear(data.months, period.key).map((m) => ({ key: m.month, label: cap(formatMonth(m.month)), tick: formatMonth(m.month).charAt(0).toUpperCase(), partialToday: false, v: m }))
    : withRestOfMonth(data.days, period.key).map((d) => {
        const day = Number(d.date.slice(8));
        return { key: d.date, label: formatShort(d.date), tick: [1, 8, 15, 22, 29].includes(day) ? String(day) : null, partialToday: d.date === today, v: d };
      });
  const has = (k: HealthKey) => points.some((p) => p.v[k] !== null);

  const compare = period.isCurrent
    ? `${isYear ? "Año" : "Mes"} en curso, comparado con ${isYear ? period.prevKey : monthWord(period.prevKey)} hasta el mismo día.`
    : `Promedio por día con datos, comparado con ${isYear ? period.prevKey : monthWord(period.prevKey)}.`;

  const stressLvl = s.stress.avg === null ? null : stressLevel(s.stress.avg);
  const weightChange = s.weight.last && s.weight.prevLast ? changeOf(s.weight.last.value / 1000, s.weight.prevLast.value / 1000, "diff", 1) : null;

  return (
    <>
      <PageHeader
        title="Salud"
        kicker={shownYear ? nav.shown : cap(formatMonth(nav.shown))}
        wide
        actions={
          <>
            <PeriodArrow
              href={hrefOf(toggleKey)}
              onGo={() => goTo(toggleKey)}
              label={shownYear ? "Ver el mes" : "Ver el año"}
              className="mr-1 inline-flex h-9 shrink-0 items-center rounded-full border border-line-strong px-3 text-[13px] whitespace-nowrap text-muted transition-colors hover:bg-surface-2 hover:text-fg sm:px-3.5"
            >
              <span className="sm:hidden">{shownYear ? "Mes" : "Año"}</span>
              <span className="hidden sm:inline">{shownYear ? "Ver el mes" : "Ver el año"}</span>
            </PeriodArrow>
            <PeriodArrow href={hrefOf(shift(nav.shown, -1))} onGo={() => goTo(shift(nav.shown, -1))} label={`${cap(shownWord)} anterior`} className={navClass}>
              <CaretLeft size={18} weight="bold" />
            </PeriodArrow>
            {!shownCurrent && (
              <PeriodArrow href={hrefOf(shift(nav.shown, 1))} onGo={() => goTo(shift(nav.shown, 1))} label={`${cap(shownWord)} siguiente`} className={navClass}>
                <CaretRight size={18} weight="bold" />
              </PeriodArrow>
            )}
          </>
        }
      />
      <main {...nav.bodyProps} className="mx-auto grid max-w-6xl grid-cols-1 gap-4 px-4 pt-2 pb-16 lg:grid-cols-2 lg:gap-5 lg:px-10 lg:pt-4">
        {!data.hasData ? (
          <section aria-label="Sin datos" className="grid justify-items-start gap-3 rounded-[20px] border border-line bg-surface p-5 lg:col-span-2 lg:p-7">
            <span className="inline-flex size-10 items-center justify-center rounded-xl bg-[var(--mod-inicio)] text-white">
              <Watch size={20} weight="fill" aria-hidden />
            </span>
            <h2 className="text-[17px] font-semibold tracking-tight">Este {isYear ? "año" : "mes"} no hay datos del reloj</h2>
            <p className="max-w-[56ch] text-[14px] leading-relaxed text-muted">
              Los pasos, el sueño, el estrés, el pulso, la distancia, las calorías y el peso llegan solos desde el reloj Huawei (por intervals.icu) o se importan de
              Google Fit o Samsung Health.
            </p>
            <Link href="/datos" className="inline-flex min-h-11 items-center rounded-full bg-ink px-4 text-[13.5px] font-medium text-on-ink hover:opacity-90">
              Ir a Datos → Reloj Huawei
            </Link>
          </section>
        ) : (
          <>
            <Hero days={data.days} today={today} isYear={isYear} />

            <section aria-label={`El ${isYear ? "año" : "mes"} en números`} className="grid gap-3 lg:col-span-2">
              <p className="text-[13px] leading-relaxed text-muted">
                {compare}
                {period.isCurrent && " Hoy no entra en los promedios de pasos, estrés, pulso, distancia y calorías: el día no terminó."}
              </p>
              <div className={cx("grid grid-cols-2 gap-2.5 md:grid-cols-3 lg:gap-3", (s.weight.last || s.weight.prevLast) ? "lg:grid-cols-4" : "xl:grid-cols-6")}>
                <Tile metric="steps" label="Pasos por día" value={s.steps.avg === null ? "–" : nf.format(s.steps.avg)} spark={points.map((p) => p.v.steps)} goal={STEPS_GOAL}>
                  <Change value={changeOf(s.steps.avg, s.steps.prevAvg, "pct")} unit="%" good="up" vs={vs} />
                </Tile>
                <Tile metric="sleepMin" label="Sueño promedio" value={sleepText(s.sleepMin.avg)} spark={points.map((p) => p.v.sleepMin)} goal={SLEEP_GOAL_MIN}>
                  <Change value={changeOf(s.sleepMin.avg, s.sleepMin.prevAvg, "pct")} unit="%" good="up" vs={vs} />
                </Tile>
                <Tile
                  metric="stress"
                  color={stressLvl?.tone}
                  label="Estrés promedio"
                  value={s.stress.avg === null ? "–" : nf.format(s.stress.avg)}
                  badge={stressLvl && <span style={tone(stressLvl.tone)} className="chip-solid rounded-full px-2 py-0.5 text-[11.5px] font-medium">{stressLvl.label}</span>}
                  spark={points.map((p) => p.v.stress)}
                >
                  <Change value={changeOf(s.stress.avg, s.stress.prevAvg, "diff")} unit=" pts" good="down" vs={vs} />
                </Tile>
                <Tile
                  metric="hr"
                  label="Pulso mín. / máx."
                  value={s.hrMin.avg === null && s.hrMax.avg === null ? "–" : `${s.hrMin.avg === null ? "–" : nf.format(s.hrMin.avg)} / ${s.hrMax.avg === null ? "–" : nf.format(s.hrMax.avg)}`}
                  badge={<span className="text-[12px] text-muted">lpm</span>}
                  spark={points.map((p) => p.v.hrMin)}
                >
                  <Change value={changeOf(s.hrMin.avg, s.hrMin.prevAvg, "diff")} unit=" lpm" good="down" vs={`mín. ${vs}`} />
                </Tile>
                <Tile metric="distanceM" label="Distancia por día" value={kmText(s.distanceM.avg)} spark={points.map((p) => p.v.distanceM)}>
                  <Change value={changeOf(s.distanceM.avg, s.distanceM.prevAvg, "pct")} unit="%" good="up" vs={vs} />
                </Tile>
                <Tile
                  metric="activeKcal"
                  label="Calorías por día"
                  value={s.activeKcal.avg === null ? "–" : nf.format(s.activeKcal.avg)}
                  badge={<span className="text-[12px] text-muted">kcal</span>}
                  spark={points.map((p) => p.v.activeKcal)}
                >
                  <Change value={changeOf(s.activeKcal.avg, s.activeKcal.prevAvg, "pct")} unit="%" good="up" vs={vs} />
                </Tile>
                {(s.weight.last || s.weight.prevLast) && (
                  <Tile
                    metric="weightG"
                    label="Peso"
                    value={formatWeight(s.weight.last?.value ?? null)}
                    badge={s.weight.last && <span className="text-[12px] text-muted">al {formatShort(s.weight.last.date)}</span>}
                    spark={points.map((p) => p.v.weightG)}
                  >
                    <Change value={weightChange} unit=" kg" good={null} vs={vs} digits={1} />
                  </Tile>
                )}
              </div>
            </section>

            {has("steps") && (
              <Chart
                title="Pasos"
                metric="steps"
                goal={STEPS_GOAL}
                avg={s.steps.avg}
                points={points}
                isYear={isYear}
                series={[{ name: "Pasos", key: "steps", color: chip(METRIC.steps.color) }]}
                fmt={(v) => nf.format(v)}
                tickFmt={shortNumber}
                refLine={{ value: 8000, label: "8.000" }}
                note={isYear ? "Promedio por día de cada mes. La línea punteada marca 8.000 pasos." : "Los días de menos de 8.000 pasos, más suaves."}
              />
            )}
            {has("sleepMin") && (
              <Chart
                title="Sueño"
                metric="sleepMin"
                goal={SLEEP_GOAL_MIN}
                avg={s.sleepMin.avg}
                points={points}
                isYear={isYear}
                series={[{ name: "Sueño", key: "sleepMin", color: chip(METRIC.sleepMin.color) }]}
                fmt={(v) => formatSleep(Math.round(v / 5) * 5)}
                tickFmt={(v) => `${Math.round(v / 60)} h`}
                scale={(max) => ({ lo: 0, hi: 120 * Math.ceil(Math.max(max / 60, 8.5) / 2), ticks: [0, 60 * Math.ceil(Math.max(max / 60, 8.5) / 2)] })}
                refLine={{ value: SLEEP_GOAL_MIN, label: "7 h" }}
                note={isYear ? "Promedio por noche de cada mes. La línea punteada marca 7 horas." : "Cada barra es la noche que termina ese día. Las noches de menos de 7 horas, más suaves."}
              />
            )}
            {has("stress") && (
              <Chart
                title="Estrés"
                metric="stress"
                avg={s.stress.avg}
                points={points}
                isYear={isYear}
                series={[{ name: "Estrés", key: "stress", color: "var(--accent)" }]}
                fmt={(v) => `${nf.format(v)} · ${stressLevel(v).label}`}
                tickFmt={(v) => String(v)}
                // Con todo en "Bajo" o "Normal", hasta 60: si no, las barras quedan aplastadas abajo.
                scale={(max) => (max >= 60 ? { lo: 0, hi: 100, ticks: [0, 30, 60, 80] } : { lo: 0, hi: 60, ticks: [0, 30] })}
                barColor={(v) => `var(--p-${stressLevel(v).tone}-chip)`}
                legend={STRESS_LEVELS.map((l, i) => ({
                  name: `${l.label} ${i === STRESS_LEVELS.length - 1 ? `${l.min}+` : `${l.min}–${STRESS_LEVELS[i + 1].min - 1}`}`,
                  color: `var(--p-${l.tone}-chip)`,
                }))}
                note={isYear ? "Promedio de cada mes, en la escala de Huawei (1 a 99)." : "Promedio de cada día, en la escala de Huawei (1 a 99)."}
              />
            )}
            {(has("hrMin") || has("hrMax")) && (
              <Chart
                title="Pulso"
                metric="hr"
                kind="range"
                points={points}
                isYear={isYear}
                series={[
                  { name: "Mínimo", key: "hrMin", color: soft(METRIC.hr.color, 70) },
                  { name: "Máximo", key: "hrMax", color: chip(METRIC.hr.color) },
                ]}
                fmt={(v) => `${nf.format(v)} lpm`}
                tickFmt={(v) => String(v)}
                scale={(max, min) => {
                  const lo = Math.max(0, Math.floor((min - 5) / 10) * 10);
                  const hi = Math.ceil((max + 5) / 10) * 10;
                  return { lo, hi, ticks: [lo, Math.round((lo + hi) / 20) * 10] };
                }}
                note={isYear ? "Promedio del mínimo y del máximo de cada día, por mes." : "Pulso mínimo y máximo de cada día, en latidos por minuto."}
              />
            )}
            {has("distanceM") && (
              <Chart
                title="Distancia"
                metric="distanceM"
                avg={s.distanceM.avg}
                points={points}
                isYear={isYear}
                series={[{ name: "Distancia", key: "distanceM", color: chip(METRIC.distanceM.color) }]}
                fmt={(v) => kmText(v)}
                tickFmt={(v) => `${dec1(v / 1000).replace(/,0$/, "")} km`}
                note={isYear ? "Promedio por día de cada mes." : undefined}
              />
            )}
            {has("activeKcal") && (
              <Chart
                title="Calorías de actividad"
                metric="activeKcal"
                avg={s.activeKcal.avg}
                points={points}
                isYear={isYear}
                series={[{ name: "Calorías", key: "activeKcal", color: chip(METRIC.activeKcal.color) }]}
                fmt={(v) => `${nf.format(v)} kcal`}
                tickFmt={shortNumber}
                note={isYear ? "Promedio por día de cada mes." : undefined}
              />
            )}
            {has("weightG") && (
              <Chart
                title="Peso"
                metric="weightG"
                kind="range"
                points={points}
                isYear={isYear}
                series={[{ name: "Peso", key: "weightG", color: chip(METRIC.weightG.color) }]}
                fmt={(v) => formatWeight(Math.round(v))}
                tickFmt={(v) => `${nf.format(v / 1000)}`}
                scale={(max, min) => {
                  const lo = Math.floor(min / 1000 - 1) * 1000;
                  const hi = Math.ceil(max / 1000 + 1) * 1000;
                  return { lo, hi, ticks: [lo, Math.round((lo + hi) / 2000) * 1000] };
                }}
                note={isYear ? "El último peso de cada mes, en kilos." : "En kilos."}
              />
            )}
          </>
        )}
      </main>
    </>
  );
}

/** Una cifra del período: ícono y color de la medida, el número grande, una tira con cómo fue el período y el cambio. Lleva a su gráfico. */
function Tile({
  metric,
  color,
  label,
  value,
  badge,
  spark,
  goal,
  children,
}: {
  metric: keyof typeof METRIC;
  /** Otro color que el de la medida (el estrés va con el de su nivel). */
  color?: string;
  label: string;
  value: string;
  badge?: React.ReactNode;
  spark: (number | null)[];
  goal?: number;
  children?: React.ReactNode;
}) {
  const m = METRIC[metric];
  const c = color ?? m.color;
  const Ico = m.icon;
  const vals = spark.filter((v): v is number => v !== null);
  const hi = Math.max(...vals, goal ?? 0, 1);
  const lo = metric === "hr" || metric === "weightG" ? Math.min(...vals) * 0.9 : 0;
  return (
    <a
      href={`#${m.id}`}
      className="group grid min-w-0 content-start rounded-2xl border border-line bg-surface p-3.5 transition-[border-color] hover:border-line-strong lg:p-4"
    >
      <dl className="grid min-w-0 content-start gap-2">
      <dt className="flex items-center gap-2 text-[12px] font-medium text-muted">
        <ToneSquare solid size={24} style={tone(c)} className="rounded-[7px]">
          <Ico size={14} weight="fill" aria-hidden />
        </ToneSquare>
        <span className="truncate">{label}</span>
      </dt>
      <dd className="grid gap-2">
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="figure text-[24px] leading-tight whitespace-nowrap lg:text-[28px]">{value}</span>
          {badge}
        </span>
        {vals.length > 1 && (
          <span aria-hidden className="flex h-7 items-end gap-px">
            {spark.map((v, i) => (
              <span
                key={i}
                className="min-w-0 flex-1 rounded-t-[2px]"
                style={{
                  height: v === null ? "2px" : `${Math.max(8, ((v - lo) / (hi - lo)) * 100)}%`,
                  background: v === null ? "var(--line)" : goal !== undefined && v < goal ? soft(c, 32) : soft(c, 80),
                }}
              />
            ))}
          </span>
        )}
        <span className="min-h-5">{children}</span>
      </dd>
      </dl>
    </a>
  );
}

/** Arriba de todo: cuántos días llegaste a las metas (anillos) y los récords del período. */
function Hero({ days, today, isYear }: { days: HealthDay[]; today: string; isYear: boolean }) {
  const h = healthHighlights(days, today);
  const when = (d: string) => formatShort(d);
  const records = [
    h.bestSteps && { metric: "steps" as const, label: "Día más activo", value: `${nf.format(h.bestSteps.value)} pasos`, date: when(h.bestSteps.date) },
    h.longestSleep && { metric: "sleepMin" as const, label: "Noche más larga", value: sleepText(h.longestSleep.value), date: when(h.longestSleep.date) },
    h.calmest && { metric: "stress" as const, label: "Día más tranquilo", value: `estrés ${nf.format(h.calmest.value)}`, date: when(h.calmest.date) },
    h.farthest && { metric: "distanceM" as const, label: "Más lejos", value: kmText(h.farthest.value), date: when(h.farthest.date) },
  ].filter(Boolean) as { metric: keyof typeof METRIC; label: string; value: string; date: string }[];
  if (!h.stepsGoal.of && !h.sleepGoal.of && !records.length) return null;
  return (
    <section
      aria-label="Cómo te fue"
      className="grid gap-5 rounded-[22px] border border-line bg-surface p-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:gap-7 lg:col-span-2 lg:p-6"
    >
      <div className="flex justify-center gap-5 sm:justify-start sm:gap-7">
        {h.stepsGoal.of > 0 && <Ring color={METRIC.steps.color} hit={h.stepsGoal.hit} of={h.stepsGoal.of} label={`días con ${nf.format(STEPS_GOAL)} pasos`} />}
        {h.sleepGoal.of > 0 && <Ring color={METRIC.sleepMin.color} hit={h.sleepGoal.hit} of={h.sleepGoal.of} label="noches de 7 h o más" />}
      </div>
      {records.length > 0 && (
        <div className="grid min-w-0 gap-2.5">
          <h2 className="flex items-center gap-1.5 text-[13px] font-semibold tracking-tight">
            <Trophy size={15} weight="fill" className="text-[var(--p-yellow-chip)]" aria-hidden />
            Lo mejor del {isYear ? "año" : "mes"}
          </h2>
          <ul className="grid grid-cols-2 gap-2">
            {records.map((r) => {
              const M = METRIC[r.metric];
              const Ico = M.icon;
              return (
                <li key={r.label} className="flex min-w-0 items-center gap-2.5 rounded-xl bg-surface-2 px-3 py-2.5">
                  <Ico size={18} weight="fill" style={{ color: chip(M.color) }} className="shrink-0" aria-hidden />
                  <span className="grid min-w-0">
                    <span className="truncate text-[11.5px] leading-snug text-muted">{r.label}</span>
                    <span className="truncate text-[14px] font-semibold tabular">{r.value}</span>
                    <span className="truncate font-mono text-[11px] leading-snug text-muted">{r.date}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Anillo de cuántos días se llegó a la meta, con la cifra adentro. */
function Ring({ color, hit, of, label }: { color: string; hit: number; of: number; label: string }) {
  const pct = of ? (hit / of) * 100 : 0;
  return (
    <figure className="grid justify-items-center gap-1.5" aria-label={`${hit} de ${of} ${label}`}>
      <span className="relative inline-grid size-[104px] place-items-center lg:size-[116px]">
        <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden>
          <circle cx="50" cy="50" r="42" fill="none" stroke={soft(color, 18)} strokeWidth="10" />
          <circle cx="50" cy="50" r="42" fill="none" stroke={chip(color)} strokeWidth="10" strokeLinecap="round" pathLength={100} strokeDasharray={`${pct} 100`} />
        </svg>
        <span className="grid justify-items-center leading-none">
          <span className="figure text-[26px] lg:text-[30px]">{hit}</span>
          <span className="mt-0.5 font-mono text-[11px] text-muted">de {of}</span>
        </span>
      </span>
      <figcaption className="max-w-[9.5rem] text-center text-[12px] leading-snug text-muted">{label}</figcaption>
    </figure>
  );
}

/** Cambio contra el período anterior; verde o rojo según convenga (`good` null = ni bueno ni malo, como el peso). */
function Change({ value, unit, good, vs, digits = 0 }: { value: number | null; unit: string; good: "up" | "down" | null; vs: string; digits?: number }) {
  if (value === null) return <span className="text-[12px] text-muted">Sin datos para comparar</span>;
  if (value === 0) return <span className="text-[12px] text-muted">Igual que antes</span>;
  const up = value > 0;
  const tint = good === null ? "neutral" : up === (good === "up") ? "good" : "bad";
  const n = digits ? Math.abs(value).toLocaleString("es-UY", { minimumFractionDigits: digits, maximumFractionDigits: digits }) : nf.format(Math.abs(value));
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] text-muted">
      <span
        className={cx(
          "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11.5px] font-medium whitespace-nowrap",
          tint === "good" && "bg-[var(--st-done-bg)] text-[var(--st-done-fg)]",
          tint === "bad" && "bg-[var(--st-fail-bg)] text-[var(--st-fail-fg)]",
          tint === "neutral" && "bg-surface-2 text-fg",
        )}
      >
        {up ? <ArrowUpRight size={11} weight="bold" aria-hidden /> : <ArrowDownRight size={11} weight="bold" aria-hidden />}
        <span className="sr-only">{up ? "Subió" : "Bajó"} </span>
        {up ? "+" : "−"}
        {n}
        {unit}
      </span>
      {vs}
    </span>
  );
}

type Point = { key: string; label: string; tick: string | null; partialToday: boolean; v: Values };
type Series = { name: string; key: HealthKey; color: string };

/**
 * Un gráfico por medida, con un solo eje: barras (desde 0) o puntos sobre una
 * escala que no arranca en 0 (`range`: pulso mínimo y máximo unidos por una raya,
 * peso). Los días sin dato son huecos. Puntero y teclado muestran el valor arriba;
 * siempre con "Ver como tabla".
 */
function Chart({
  title,
  metric,
  goal,
  avg,
  points,
  isYear,
  series,
  kind = "bars",
  fmt,
  tickFmt,
  scale,
  refLine,
  barColor,
  legend,
  note,
}: {
  title: string;
  metric: keyof typeof METRIC;
  /** Meta: los días por debajo van con el color más suave. */
  goal?: number;
  /** Promedio del período: una línea fina con su valor. */
  avg?: number | null;
  points: Point[];
  isYear: boolean;
  series: Series[];
  kind?: "bars" | "range";
  fmt: (v: number) => string;
  tickFmt: (v: number) => string;
  /** Escala del eje (de los valores extremos); si no, de 0 a un tope redondo. */
  scale?: (max: number, min: number) => { lo: number; hi: number; ticks: number[] };
  refLine?: { value: number; label: string };
  barColor?: (v: number) => string;
  legend?: { name: string; color: string }[];
  note?: string;
}) {
  const [focus, setFocus] = useState<number | null>(null);
  const all = points.flatMap((p) => series.map((s) => p.v[s.key]).filter((v): v is number => v !== null));
  const max = Math.max(...all, refLine?.value ?? 0);
  const min = Math.min(...all);
  const sc = scale ? scale(max, min) : (() => {
    const hi = niceCeil(max);
    return { lo: 0, hi, ticks: [0, hi / 2] };
  })();
  const ticks = [...sc.ticks, sc.hi];
  const pct = (v: number) => Math.max(0, Math.min(100, ((v - sc.lo) / (sc.hi - sc.lo)) * 100));
  const withData = points.map((p, i) => ({ p, i })).filter(({ p }) => series.some((s) => p.v[s.key] !== null));
  const shownIdx = focus ?? withData.at(-1)?.i ?? null;
  const shown = shownIdx === null ? null : points[shownIdx];
  const textOf = (p: Point) => {
    const parts = series.map((s) => {
      const v = p.v[s.key];
      return `${series.length > 1 ? `${s.name.toLowerCase()} ` : ""}${v === null ? "–" : fmt(v)}`;
    });
    const empty = series.every((s) => p.v[s.key] === null);
    const partial = p.partialToday && series.some((s) => PARTIAL_TODAY.has(s.key));
    return `${p.label}: ${empty ? "sin datos" : parts.join(" · ")}${partial && !empty ? " (hoy, hasta ahora)" : ""}`;
  };
  const legendItems = legend ?? (series.length > 1 ? series.map((s) => ({ name: s.name, color: s.color })) : null);
  const M = METRIC[metric];
  const valueOf = (p: Point) => {
    if (series.every((s) => p.v[s.key] === null)) return "Sin datos";
    if (series.length > 1) return series.map((s) => (p.v[s.key] === null ? "–" : fmt(p.v[s.key]!).replace(/ lpm$/, ""))).join(" / ") + (metric === "hr" ? " lpm" : "");
    return fmt(p.v[series[0].key]!);
  };
  const whenOf = (p: Point) => {
    const partial = p.partialToday && series.some((s) => PARTIAL_TODAY.has(s.key)) && series.some((s) => p.v[s.key] !== null);
    return `${p.label}${partial ? " · hoy, hasta ahora" : ""}`;
  };
  // El promedio pegado a la línea de la meta no se dibuja: las dos se pisarían.
  const showAvg = avg !== null && avg !== undefined && kind === "bars" && (!refLine || Math.abs(pct(avg) - pct(refLine.value)) >= 8);

  return (
    <section id={METRIC[metric].id} aria-label={title} className="grid min-w-0 scroll-mt-20 content-start gap-3.5 rounded-[20px] border border-line bg-surface p-4 lg:p-5">
      <header className="flex items-start justify-between gap-3">
        <h2 className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight">
          <ToneSquare solid size={30} style={tone(M.color)} className="rounded-[9px]">
            <M.icon size={17} weight="fill" aria-hidden />
          </ToneSquare>
          {title}
        </h2>
        {/* El día señalado (el último con dato si no se señala ninguno), en grande. */}
        <p className="grid min-w-0 justify-items-end text-right" aria-live="polite">
          <span className="figure truncate text-[19px] leading-tight lg:text-[21px]">{shown ? valueOf(shown) : "–"}</span>
          <span className="truncate text-[12px] text-muted">{shown ? whenOf(shown) : ""}</span>
        </p>
      </header>

      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2">
        {/* Eje: los valores de las líneas de guía. */}
        <div aria-hidden className="relative h-36 w-9 font-mono text-[10.5px] text-muted lg:h-44">
          {/* Un valor del eje pegado a la línea de referencia no se escribe (se pisarían). */}
          {ticks.filter((t) => !refLine || Math.abs(pct(t) - pct(refLine.value)) >= 10).map((t) => (
            <span key={t} className="absolute right-0 translate-y-1/2 leading-none whitespace-nowrap" style={{ bottom: `${pct(t)}%` }}>
              {tickFmt(t)}
            </span>
          ))}
          {refLine && (
            <span className="absolute right-0 translate-y-1/2 bg-surface leading-none font-medium whitespace-nowrap text-fg" style={{ bottom: `${pct(refLine.value)}%` }}>
              {refLine.label}
            </span>
          )}
        </div>
        <div className="relative h-36 lg:h-44">
          {ticks.map((t) => (
            <span key={t} aria-hidden className="absolute inset-x-0 border-t border-line" style={{ bottom: `${pct(t)}%` }} />
          ))}
          <div
            className="absolute inset-0 flex items-stretch gap-[2px]"
            role="list"
            aria-label={title}
            // Un solo punto en el orden de Tab; las flechas recorren los días (o meses).
            onKeyDown={(e) => {
              const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : e.key === "Home" ? -Infinity : e.key === "End" ? Infinity : 0;
              if (!step) return;
              e.preventDefault();
              const from = focus ?? shownIdx ?? 0;
              const to = Math.max(0, Math.min(points.length - 1, Number.isFinite(step) ? from + step : step > 0 ? points.length - 1 : 0));
              (e.currentTarget.children[to] as HTMLElement | undefined)?.focus();
            }}
          >
            {points.map((p, i) => {
              const vals = series.map((s) => p.v[s.key]);
              const partial = p.partialToday && series.some((s) => PARTIAL_TODAY.has(s.key));
              const dim = focus !== null && focus !== i;
              return (
                <button
                  key={p.key}
                  type="button"
                  role="listitem"
                  tabIndex={i === (focus ?? shownIdx ?? 0) ? 0 : -1}
                  aria-label={textOf(p)}
                  onPointerEnter={() => setFocus(i)}
                  onPointerLeave={() => setFocus(null)}
                  onFocus={() => setFocus(i)}
                  onBlur={() => setFocus(null)}
                  className={cx("relative h-full min-w-0 flex-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]", focus === i && "bg-surface-2")}
                >
                  {kind === "bars"
                    ? vals[0] !== null && (
                        <span
                          className={cx("absolute inset-x-0 bottom-0 mx-auto max-w-5 rounded-t-[4px] transition-opacity", dim && "opacity-40")}
                          style={{
                            height: `${Math.max(1.5, pct(vals[0]))}%`,
                            background: partial
                              ? `color-mix(in oklab, ${barColor ? barColor(vals[0]) : series[0].color} 40%, var(--surface-2))`
                              : barColor
                                ? barColor(vals[0])
                                : goal !== undefined && vals[0] < goal
                                  ? soft(M.color, 42)
                                  : series[0].color,
                          }}
                        />
                      )
                    : (
                        <span className={cx("absolute inset-0 transition-opacity", dim && "opacity-45", partial && "opacity-50")}>
                          {vals.length > 1 && vals[0] !== null && vals[1] !== null && (
                            <span
                              className="absolute left-1/2 w-[2px] -translate-x-1/2 rounded-full bg-line-strong"
                              style={{ bottom: `${pct(Math.min(vals[0], vals[1]))}%`, height: `${Math.abs(pct(vals[1]) - pct(vals[0]))}%` }}
                            />
                          )}
                          {vals.map(
                            (v, k) =>
                              v !== null && (
                                <span
                                  key={k}
                                  className="absolute left-1/2 size-[7px] -translate-x-1/2 translate-y-1/2 rounded-full"
                                  style={{ bottom: `${pct(v)}%`, background: series[k].color }}
                                />
                              ),
                          )}
                        </span>
                      )}
                </button>
              );
            })}
          </div>
          {refLine && (
            <span aria-hidden className="pointer-events-none absolute inset-x-0 border-t border-dashed border-fg/50" style={{ bottom: `${pct(refLine.value)}%` }} />
          )}
          {showAvg && (
            <span aria-hidden className="pointer-events-none absolute inset-x-0 border-t-[1.5px] border-fg/70" style={{ bottom: `${pct(avg!)}%` }}>
              <span className="absolute right-0 bottom-0.5 rounded bg-surface/90 px-1 font-mono text-[10px] leading-tight text-fg">prom. {fmt(avg!)}</span>
            </span>
          )}
        </div>
        <span />
        <div aria-hidden className="mt-1 flex gap-[2px] font-mono text-[10.5px] text-muted">
          {points.map((p) => (
            <span key={p.key} className="flex min-w-0 flex-1 justify-center overflow-visible whitespace-nowrap">
              {p.tick ?? ""}
            </span>
          ))}
        </div>
      </div>

      {legendItems && (
        <ul className="flex flex-wrap gap-x-3.5 gap-y-1 text-[12px] text-muted">
          {legendItems.map((l) => (
            <li key={l.name} className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 rounded-full" style={{ background: l.color }} />
              {l.name}
            </li>
          ))}
        </ul>
      )}
      {note && <p className="text-[12px] leading-relaxed text-muted">{note}</p>}

      <details className="text-sm">
        <summary className="kicker inline-flex min-h-11 cursor-pointer items-center select-none hover:text-fg">Ver como tabla</summary>
        <div className="mt-1 max-h-72 overflow-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-1.5 font-normal">{isYear ? "Mes" : "Día"}</th>
                {series.map((s) => (
                  <th key={s.key} className="py-1.5 text-right font-normal">
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular">
              {[...withData].reverse().map(({ p }) => (
                <tr key={p.key} className="border-t border-line">
                  <td className="py-1">
                    {p.label}
                    {p.partialToday && series.some((s) => PARTIAL_TODAY.has(s.key)) ? " (hoy)" : ""}
                  </td>
                  {series.map((s) => {
                    const v = p.v[s.key];
                    return (
                      <td key={s.key} className="py-1 text-right">
                        {v === null ? "–" : fmt(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
