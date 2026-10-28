"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowDownRight, ArrowUpRight, BatteryHigh, Brain, CaretLeft, CaretRight, Fire, Footprints, Heartbeat, Moon, Path, Scales, Smiley, Trophy, Watch, Waves, type Icon } from "@phosphor-icons/react";
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
import { addDays, formatMonth, formatShort, monthBounds, shiftMonth, startOfWeek, todayISO, weekdayInitial } from "@/lib/dates";
import { ENERGY_LABELS, formatSleep, formatWeight, STRESS_LABELS } from "@/lib/checkin-logic";
import { MOODS } from "@/lib/journal-logic";
import { PillSwitch } from "@/components/pill-switch";
import { dec1, shortNumber } from "@/lib/format";
import { tone } from "@/lib/palette";
import { PageHeader } from "@/components/page-header";
import { cx, ToneSquare } from "@/components/ui";
import { StatTile, TintedCard } from "@/components/tinted-card";

const nf = new Intl.NumberFormat("es-UY", { maximumFractionDigits: 0 });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** "setiembre" (sin el año). */
const monthWord = (m: string) => formatMonth(m).split(" ")[0].toLowerCase();

const navClass =
  "relative inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors before:absolute before:-inset-1 before:content-[''] hover:bg-surface-2 hover:text-fg";

type Values = Record<HealthKey, number | null>;

/** Color (de la paleta) e ícono de cada medida: se reconocen igual en las cifras y en los gráficos. */
const METRIC: Record<"steps" | "sleepMin" | "stress" | "hr" | "distanceM" | "activeKcal" | "weightG" | "mood" | "energy" | "feel", { color: string; icon: Icon; id: string }> = {
  mood: { color: "yellow", icon: Smiley, id: "animo" },
  energy: { color: "green", icon: BatteryHigh, id: "energia" },
  feel: { color: "pink", icon: Waves, id: "como-te-sentiste" },
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

/** La semana en curso también se dibuja entera (lunes a domingo). */
function withRestOfWeek(days: HealthDay[], monday: string): HealthDay[] {
  const out = [...days];
  for (let d = addDays(days.at(-1)?.date ?? monday, days.length ? 1 : 0); d <= addDays(monday, 6); d = addDays(d, 1)) out.push(emptyHealthDay(d));
  return out;
}

/** Escalas de 1 a 5 (ánimo, energía, estrés sentido): "3,4 · Normal". */
const pick5 = (labels: string[], v: number) => labels[Math.min(4, Math.max(0, Math.round(v) - 1))];
const scaleText = (labels: string[]) => (v: number) => `${dec1(v)} · ${pick5(labels, v)}`;
const MOOD_LABELS = MOODS.map((m) => m.label);
const moodTone = (v: number) => MOODS[Math.min(4, Math.max(0, Math.round(v) - 1))].color;
const fiveScale = () => ({ lo: 0, hi: 5, ticks: [0, 1, 2, 3, 4] });

type Kind = "week" | "month" | "year";
const kindOf = (k: string): Kind => (/^\d{4}$/.test(k) ? "year" : /^\d{4}-\d{2}$/.test(k) ? "month" : "week");
/** "26 oct – 1 nov" */
const weekLabel = (monday: string) => `${formatShort(monday)} – ${formatShort(addDays(monday, 6))}`;

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
  const isWeek = period.kind === "week";
  const key = period.key;
  const word = isYear ? "año" : isWeek ? "semana" : "mes";
  const prevName = isYear ? period.prevKey : isWeek ? "la semana anterior" : monthWord(period.prevKey);
  const vs = isWeek ? "vs semana anterior" : `vs ${prevName}`;

  // Flechas y "Mes/Año": el rótulo cambia al toque; varios toques se suman (usePeriodNav).
  const nav = usePeriodNav(key);
  const now = todayISO();
  const shownKind = kindOf(nav.shown);
  const shownCurrent = shownKind === "week" ? nav.shown >= startOfWeek(now) : nav.shown === now.slice(0, shownKind === "year" ? 4 : 7);
  const shift = (k: string, d: number) => {
    const kk = kindOf(k);
    return kk === "year" ? String(Number(k) + d) : kk === "month" ? shiftMonth(k, d) : addDays(k, 7 * d);
  };
  const hrefOf = (k: string) => {
    const kk = kindOf(k);
    return kk === "year" ? `/salud?anio=${k}` : kk === "month" ? `/salud?mes=${k}` : `/salud?semana=${k}`;
  };
  const goTo = (k: string) => nav.go(k, hrefOf(k));
  const shownWord = shownKind === "year" ? "año" : shownKind === "week" ? "semana" : "mes";
  // Al cambiar entre Semana, Mes y Año se queda en la misma época (el último día que se mira).
  const keyFor = (k: Kind) => (k === "year" ? period.to.slice(0, 4) : k === "month" ? period.to.slice(0, 7) : startOfWeek(period.to));
  const kindSwitch = (className: string) => (
    <PillSwitch<Kind>
      label="Período"
      className={className}
      value={shownKind}
      options={[
        { value: "week", label: "Semana" },
        { value: "month", label: "Mes" },
        { value: "year", label: "Año" },
      ]}
      onChange={(k) => goTo(keyFor(k))}
      item="h-8 px-3 text-[13px]"
    />
  );
  const kicker = shownKind === "year" ? nav.shown : shownKind === "week" ? `Semana del ${weekLabel(nav.shown)}` : cap(formatMonth(nav.shown));

  // Puntos de los gráficos: un día (vista del mes) o un mes (vista del año).
  const points: Point[] = isYear
    ? withRestOfYear(data.months, period.key).map((m) => ({ key: m.month, label: cap(formatMonth(m.month)), tick: formatMonth(m.month).charAt(0).toUpperCase(), partialToday: false, v: m }))
    : isWeek
      ? withRestOfWeek(data.days, period.key).map((d) => ({ key: d.date, label: formatShort(d.date), tick: weekdayInitial(d.date), partialToday: d.date === today, v: d }))
      : withRestOfMonth(data.days, period.key).map((d) => {
        const day = Number(d.date.slice(8));
        return { key: d.date, label: formatShort(d.date), tick: [1, 8, 15, 22, 29].includes(day) ? String(day) : null, partialToday: d.date === today, v: d };
      });
  const has = (k: HealthKey) => points.some((p) => p.v[k] !== null);
  // Los gráficos van de a dos: si son impares, el último ocupa todo el ancho (sin hueco al lado).
  const feelCharts = [has("mood") && "mood", has("energy") && "energy", has("feel") && "feel"].filter(Boolean);
  const hasFeel = feelCharts.length > 0;
  // Ánimo, energía y estrés sentido: si son impares, el último va a todo el ancho.
  const wideFeel = (k: keyof typeof METRIC) => (feelCharts.length % 2 === 1 && feelCharts.at(-1) === k ? "lg:col-span-2" : undefined);
  const charts = [
    has("steps") && "steps",
    has("sleepMin") && "sleepMin",
    has("stress") && "stress",
    (has("hrMin") || has("hrMax")) && "hr",
    has("distanceM") && "distanceM",
    has("activeKcal") && "activeKcal",
    has("weightG") && "weightG",
  ].filter(Boolean);
  const wide = (k: keyof typeof METRIC) => (charts.length % 2 === 1 && charts.at(-1) === k ? "lg:col-span-2" : undefined);

  const compare = period.isCurrent
    ? `${cap(word)} en curso: promedio por día con datos, comparado con ${prevName} hasta el mismo día.`
    : `Promedio por día con datos, comparado con ${prevName}.`;

  const stressLvl = s.stress.avg === null ? null : stressLevel(s.stress.avg);
  const withWeight = !!(s.weight.last || s.weight.prevLast);
  const weightChange = s.weight.last && s.weight.prevLast ? changeOf(s.weight.last.value / 1000, s.weight.prevLast.value / 1000, "diff", 1) : null;

  return (
    <>
      <PageHeader
        title="Salud"
        kicker={kicker}
        wide
        actions={
          <>
            {/* En el celular va en su propia fila (abajo): si no, tapa las flechas. */}
            {kindSwitch("mr-1 shrink-0 max-sm:hidden")}
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
        <div className="sm:hidden">{kindSwitch("w-full [&>*]:flex-1")}</div>
        {!data.hasData ? (
          <TintedCard
            icon={Watch}
            title={`${isWeek ? "Esta semana" : `Este ${word}`} no hay datos`}
            meta="Check-in y reloj"
            action={{ href: "/datos", label: "Datos" }}
            className="lg:col-span-2"
          >
            <p className="max-w-[56ch] text-[14px] leading-relaxed text-muted">
              El ánimo, la energía y el estrés salen del check-in de Inicio (¿Cómo estás?). Los pasos, el sueño, el estrés, el pulso, la distancia, las calorías y el peso llegan solos desde el reloj Huawei (por intervals.icu) o se importan de
              Google Fit o Samsung Health.
            </p>
            <Link href="/datos" className="inline-flex min-h-11 items-center self-start rounded-full bg-ink px-4 text-[13.5px] font-medium text-on-ink hover:opacity-90">
              Ir a Datos → Reloj Huawei
            </Link>
          </TintedCard>
        ) : (
          <>
            {hasFeel && (
              <section aria-label="Cómo te sentiste" className="grid gap-3 lg:col-span-2">
                <h2 className="text-[15px] font-semibold tracking-tight">Cómo te sentiste</h2>
                <p className="-mt-1.5 text-[13px] leading-relaxed text-muted">
                  Del check-in de Inicio, de 1 a 5. El ánimo es uno solo por día: el mismo que marcás en el journal. {compare}
                </p>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 lg:gap-3">
                  <Tile
                    metric="mood"
                    color={s.mood.avg === null ? undefined : moodTone(s.mood.avg)}
                    label="Ánimo"
                    value={s.mood.avg === null ? "–" : dec1(s.mood.avg)}
                    badge={s.mood.avg !== null && <span className="text-[12px] text-muted">{pick5(MOOD_LABELS, s.mood.avg)} · {s.mood.days} {s.mood.days === 1 ? "día" : "días"}</span>}
                    spark={points.map((p) => p.v.mood)}
                  >
                    <Change value={changeOf(s.mood.avg, s.mood.prevAvg, "diff", 1)} unit="" good="up" vs={vs} digits={1} />
                  </Tile>
                  <Tile
                    metric="energy"
                    label="Energía"
                    value={s.energy.avg === null ? "–" : dec1(s.energy.avg)}
                    badge={s.energy.avg !== null && <span className="text-[12px] text-muted">{pick5(ENERGY_LABELS, s.energy.avg)} · {s.energy.days} {s.energy.days === 1 ? "día" : "días"}</span>}
                    spark={points.map((p) => p.v.energy)}
                  >
                    <Change value={changeOf(s.energy.avg, s.energy.prevAvg, "diff", 1)} unit="" good="up" vs={vs} digits={1} />
                  </Tile>
                  <Tile
                    metric="feel"
                    label="Estrés"
                    value={s.feel.avg === null ? "–" : dec1(s.feel.avg)}
                    badge={s.feel.avg !== null && <span className="text-[12px] text-muted">{pick5(STRESS_LABELS, s.feel.avg)} · {s.feel.days} {s.feel.days === 1 ? "día" : "días"}</span>}
                    spark={points.map((p) => p.v.feel)}
                  >
                    <Change value={changeOf(s.feel.avg, s.feel.prevAvg, "diff", 1)} unit="" good="down" vs={vs} digits={1} />
                  </Tile>
                </div>
              </section>
            )}
            {has("mood") && (
              <Chart
                title="Ánimo"
                metric="mood"
                className={wideFeel("mood")}
                avg={s.mood.avg}
                points={points}
                isYear={isYear}
                series={[{ name: "Ánimo", key: "mood", color: chip(METRIC.mood.color) }]}
                fmt={scaleText(MOOD_LABELS)}
                tickFmt={(v) => String(v)}
                scale={fiveScale}
                barColor={(v) => chip(moodTone(v))}
                legend={MOODS.map((m) => ({ name: `${m.value} ${m.label}`, color: chip(m.color) }))}
                note={isYear ? "Promedio de cada mes." : "El del check-in o, si ese día no hay, el del journal."}
              />
            )}
            {has("energy") && (
              <Chart
                title="Energía"
                metric="energy"
                className={wideFeel("energy")}
                avg={s.energy.avg}
                points={points}
                isYear={isYear}
                series={[{ name: "Energía", key: "energy", color: chip(METRIC.energy.color) }]}
                fmt={scaleText(ENERGY_LABELS)}
                tickFmt={(v) => String(v)}
                scale={fiveScale}
                note={`1 sin pilas, 5 a full.${isYear ? " Promedio de cada mes." : ""}`}
              />
            )}
            {has("feel") && (
              <Chart
                title="Estrés que sentiste"
                metric="feel"
                className={wideFeel("feel")}
                avg={s.feel.avg}
                points={points}
                isYear={isYear}
                series={[{ name: "Estrés", key: "feel", color: chip(METRIC.feel.color) }]}
                fmt={scaleText(STRESS_LABELS)}
                tickFmt={(v) => String(v)}
                scale={fiveScale}
                note={`1 nada, 5 mucho.${isYear ? " Promedio de cada mes." : ""} El que mide el reloj va más abajo.`}
              />
            )}

            {data.hasWatch && <Hero days={data.days} today={today} word={word} />}

            {data.hasWatch && (
            <section aria-label="Del reloj, en números" className="grid gap-3 lg:col-span-2">
              {hasFeel && <h2 className="mt-2 text-[15px] font-semibold tracking-tight">Del reloj</h2>}
              <p className="text-[13px] leading-relaxed text-muted">
                {compare}
                {period.isCurrent && " Hoy no entra en los promedios de pasos, estrés, pulso, distancia y calorías: el día no terminó."}
              </p>
              {/* Con peso son 7: los pasos ocupan dos lugares (y el peso dos en tres columnas), así no queda ningún hueco. */}
              <div className={cx("grid grid-cols-2 gap-2.5 md:grid-cols-3 lg:gap-3", withWeight ? "lg:grid-cols-4" : "xl:grid-cols-6")}>
                <Tile className={withWeight ? "col-span-2" : undefined} metric="steps" label="Pasos" value={s.steps.avg === null ? "–" : nf.format(s.steps.avg)} spark={points.map((p) => p.v.steps)} goal={STEPS_GOAL}>
                  <Change value={changeOf(s.steps.avg, s.steps.prevAvg, "pct")} unit="%" good="up" vs={vs} />
                </Tile>
                <Tile metric="sleepMin" label="Sueño" value={sleepText(s.sleepMin.avg)} spark={points.map((p) => p.v.sleepMin)} goal={SLEEP_GOAL_MIN}>
                  <Change value={changeOf(s.sleepMin.avg, s.sleepMin.prevAvg, "pct")} unit="%" good="up" vs={vs} />
                </Tile>
                <Tile
                  metric="stress"
                  color={stressLvl?.tone}
                  label="Estrés del reloj"
                  value={s.stress.avg === null ? "–" : nf.format(s.stress.avg)}
                  badge={stressLvl && <span style={tone(stressLvl.tone)} className="chip-solid rounded-full px-2 py-0.5 text-[11.5px] font-medium">{stressLvl.label}</span>}
                  spark={points.map((p) => p.v.stress)}
                >
                  <Change value={changeOf(s.stress.avg, s.stress.prevAvg, "diff")} unit=" pts" good="down" vs={vs} />
                </Tile>
                <Tile
                  metric="hr"
                  label="Pulso"
                  value={s.hrMin.avg === null && s.hrMax.avg === null ? "–" : `${s.hrMin.avg === null ? "–" : nf.format(s.hrMin.avg)} / ${s.hrMax.avg === null ? "–" : nf.format(s.hrMax.avg)}`}
                  unit="lpm"
                  spark={points.map((p) => p.v.hrMin)}
                >
                  <Change value={changeOf(s.hrMin.avg, s.hrMin.prevAvg, "diff")} unit=" lpm" good="down" vs={`mín. ${vs}`} />
                </Tile>
                <Tile metric="distanceM" label="Distancia" value={kmText(s.distanceM.avg)} spark={points.map((p) => p.v.distanceM)}>
                  <Change value={changeOf(s.distanceM.avg, s.distanceM.prevAvg, "pct")} unit="%" good="up" vs={vs} />
                </Tile>
                <Tile
                  metric="activeKcal"
                  label="Calorías"
                  value={s.activeKcal.avg === null ? "–" : nf.format(s.activeKcal.avg)}
                  unit="kcal"
                  spark={points.map((p) => p.v.activeKcal)}
                >
                  <Change value={changeOf(s.activeKcal.avg, s.activeKcal.prevAvg, "pct")} unit="%" good="up" vs={vs} />
                </Tile>
                {withWeight && (
                  <Tile
                    className="md:col-span-2 lg:col-span-1"
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
            )}

            {has("steps") && (
              <Chart
                title="Pasos"
                metric="steps"
                className={wide("steps")}
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
                className={wide("sleepMin")}
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
                title="Estrés del reloj"
                metric="stress"
                className={wide("stress")}
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
                className={wide("hr")}
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
                className={wide("distanceM")}
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
                className={wide("activeKcal")}
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
                className={wide("weightG")}
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

/** Una cifra del período (tarjeta de cifra): el número grande, una tira con cómo fue el período en el color de la medida y el cambio. Lleva a su gráfico. */
function Tile({
  metric,
  color,
  label,
  value,
  unit,
  badge,
  spark,
  goal,
  className,
  children,
}: {
  metric: keyof typeof METRIC;
  /** Otro color que el de la medida (el estrés va con el de su nivel). */
  color?: string;
  label: string;
  value: string;
  unit?: string;
  badge?: React.ReactNode;
  spark: (number | null)[];
  goal?: number;
  className?: string;
  children?: React.ReactNode;
}) {
  const m = METRIC[metric];
  const c = color ?? m.color;
  const vals = spark.filter((v): v is number => v !== null);
  const hi = Math.max(...vals, goal ?? 0, 1);
  const lo = metric === "hr" || metric === "weightG" ? Math.min(...vals) * 0.9 : 0;
  return (
    <StatTile
      icon={m.icon}
      label={label}
      href={`#${m.id}`}
      figure={value}
      unit={unit}
      // "7 h 30 min" o "62 / 171" no entran a 32 px en media pantalla: la cifra va como antes (24/28).
      className={cx("[&_.tstat-fig]:text-[24px]! lg:[&_.tstat-fig]:text-[28px]!", className)}
      sub={
        <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
          {badge}
          {children}
        </span>
      }
    >
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
    </StatTile>
  );
}

/** Arriba de todo: cuántos días llegaste a las metas (anillos) y los récords del período. */
function Hero({ days, today, word }: { days: HealthDay[]; today: string; word: string }) {
  const inThe = word === "semana" ? "la semana" : `el ${word}`;
  const ofThe = word === "semana" ? "de la semana" : `del ${word}`;
  const h = healthHighlights(days, today);
  const when = (d: string) => formatShort(d);
  const records = [
    h.bestSteps && { metric: "steps" as const, label: "Día más activo", value: `${nf.format(h.bestSteps.value)} pasos`, date: when(h.bestSteps.date) },
    h.longestSleep && { metric: "sleepMin" as const, label: "Noche más larga", value: sleepText(h.longestSleep.value), date: when(h.longestSleep.date) },
    h.calmest && { metric: "stress" as const, label: "Día más tranquilo", value: `estrés ${nf.format(h.calmest.value)}`, date: when(h.calmest.date) },
    h.farthest && { metric: "distanceM" as const, label: "Más lejos", value: kmText(h.farthest.value), date: when(h.farthest.date) },
  ].filter(Boolean) as { metric: keyof typeof METRIC; label: string; value: string; date: string }[];
  if (!h.stepsGoal.of && !h.sleepGoal.of && !records.length) return null;
  const goals = h.stepsGoal.of > 0 || h.sleepGoal.of > 0;
  return (
    <TintedCard
      icon={Trophy}
      title={`Cómo te fue en ${inThe}`}
      meta={`Metas: ${nf.format(STEPS_GOAL)} pasos y 7 h de sueño`}
      className="lg:col-span-2"
      bodyClassName={cx(goals && records.length > 0 && "sm:grid! sm:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] sm:items-start sm:gap-7!")}
    >
      {goals && (
        <div className="grid content-start gap-4">
          {h.stepsGoal.of > 0 && <GoalBar metric="steps" hit={h.stepsGoal.hit} of={h.stepsGoal.of} label={`días con ${nf.format(STEPS_GOAL)} pasos`} />}
          {h.sleepGoal.of > 0 && <GoalBar metric="sleepMin" hit={h.sleepGoal.hit} of={h.sleepGoal.of} label="noches de 7 h o más" />}
        </div>
      )}
      {records.length > 0 && (
        <div className="grid min-w-0 gap-2.5">
          <h3 className="flex items-center gap-1.5 text-[13px] font-semibold tracking-tight">
            <Trophy size={15} weight="fill" className="text-[var(--p-yellow-chip)]" aria-hidden />
            Lo mejor {ofThe}
          </h3>
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
    </TintedCard>
  );
}

/** Cuántos días se llegó a la meta: "14 de 30 días con 8.000 pasos" y una barra fina con el color de la medida (sin anillos). */
function GoalBar({ metric, hit, of, label }: { metric: keyof typeof METRIC; hit: number; of: number; label: string }) {
  const M = METRIC[metric];
  const pct = of ? Math.round((hit / of) * 100) : 0;
  return (
    <div className="grid gap-2">
      <p className="flex items-center gap-2.5">
        <ToneSquare solid size={28} style={tone(M.color)} className="rounded-[8px]">
          <M.icon size={15} weight="fill" aria-hidden />
        </ToneSquare>
        <span className="min-w-0 text-[13.5px] leading-snug text-muted">
          <span className="figure text-[22px] text-fg">{hit}</span> de {of} {label}
        </span>
      </p>
      <span
        role="progressbar"
        aria-label={`${hit} de ${of} ${label}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="block h-2 overflow-hidden rounded-full"
        style={{ background: soft(M.color, 18) }}
      >
        <span className="bar-anim block h-full rounded-full" style={{ width: `${pct}%`, background: chip(M.color) }} />
      </span>
    </div>
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
        {unit === " pts" && Math.abs(value) === 1 ? " pt" : unit}
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
  className,
}: {
  className?: string;
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
    <TintedCard
      id={METRIC[metric].id}
      icon={M.icon}
      title={title}
      meta={avg !== null && avg !== undefined ? `prom. ${fmt(avg)}` : undefined}
      className={cx("scroll-mt-20", className)}
      bodyClassName="gap-3.5!"
      action={
        // El día señalado (el último con dato si no se señala ninguno), en grande.
        <p className="grid min-w-0 justify-items-end text-right" aria-live="polite">
          <span className="figure truncate text-[19px] leading-tight lg:text-[21px]">{shown ? valueOf(shown) : "–"}</span>
          <span className="truncate text-[12px]">{shown ? whenOf(shown) : ""}</span>
        </p>
      }
    >

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
    </TintedCard>
  );
}
