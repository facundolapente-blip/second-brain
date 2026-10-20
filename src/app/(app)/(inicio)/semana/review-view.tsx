"use client";

import Link from "next/link";
import { PeriodArrow, usePeriodNav } from "../period-nav";
import { CaretLeft, CaretRight, CheckCircle, NotePencil } from "@phosphor-icons/react";
import type { WeeklyReview } from "@/lib/review";
import { addDays, formatShort, startOfWeek, todayISO, weekday } from "@/lib/dates";
import { formatWeight } from "@/lib/checkin-logic";
import { moodInfo } from "@/lib/journal-logic";
import { HabitAvatar } from "@/lib/habit-icons";
import { FinanceIcon } from "@/lib/finance-icons";
import { tone } from "@/lib/palette";
import { moneyCents, dec1, moneyWhole } from "@/lib/format";
import { writeWeeklyReview } from "@/lib/offline/journal";
import { PageHeader } from "@/components/page-header";
import { cx, ToneSquare } from "@/components/ui";
import { MoodIcon } from "../../journal/journal-ui";
import { BodyMinis, Card, Delta, Kpi, Mini } from "../summary-ui";

const WD = ["D", "L", "M", "M", "J", "V", "S"];

const ARROW =
  "relative inline-flex size-9 items-center justify-center rounded-full text-muted transition-colors before:absolute before:-inset-1 before:content-[''] hover:bg-surface-2 hover:text-fg active:bg-ink/5";

function rangeLabel(monday: string, sunday: string) {
  const a = formatShort(monday);
  const b = formatShort(sunday);
  return a.split(" ")[1] === b.split(" ")[1] ? `${a.split(" ")[0]} al ${b}` : `${a} al ${b}`;
}

export function ReviewView({ r }: { r: WeeklyReview }) {
  const { now, before } = r;
  const habitsSorted = r.perHabit;
  const strong = habitsSorted.filter((h) => (h.pct ?? 0) >= 80);
  // En la semana en curso no entra lo que todavía se puede cumplir (lo decide `reinforce`).
  const weak = habitsSorted.filter((h) => h.reinforce);
  const maxSpent = Math.max(1, ...r.days.map((d) => d.spentCents));
  const hasFeel = r.days.some((d) => d.mood !== null || d.energy !== null || d.sleepMin !== null || d.steps !== null || d.stressWatch !== null);
  // Las flechas cambian el rótulo al toque y suman toques seguidos (ver usePeriodNav).
  const nav = usePeriodNav(r.monday);
  const thisMonday = r.isCurrent ? r.monday : startOfWeek(todayISO(), 1);
  const goWeek = (delta: number) => {
    const next = addDays(nav.shown, delta * 7);
    nav.go(next, `/semana?semana=${next}`);
  };

  return (
    <>
      <PageHeader
        title="Revisión semanal"
        kicker={`Semana del ${rangeLabel(nav.shown, addDays(nav.shown, 6))}`}
        wide
        actions={
          <>
            <PeriodArrow href={`/semana?semana=${addDays(nav.shown, -7)}`} onGo={() => goWeek(-1)} label="Semana anterior" className={ARROW}>
              <CaretLeft size={18} weight="bold" />
            </PeriodArrow>
            {nav.shown < thisMonday && (
              <PeriodArrow href={`/semana?semana=${addDays(nav.shown, 7)}`} onGo={() => goWeek(1)} label="Semana siguiente" className={ARROW}>
                <CaretRight size={18} weight="bold" />
              </PeriodArrow>
            )}
          </>
        }
      />
      <main {...nav.bodyProps} className="mx-auto grid max-w-6xl grid-cols-1 gap-4 px-4 pt-2 pb-16 xl:grid-cols-12 lg:gap-5 lg:px-10 lg:pt-4">
        <section aria-label="Resumen de la semana" className="hero rise rounded-[22px] p-5 xl:col-span-12 lg:p-7">
          <p className="hero-sub text-[13px]">{r.isCurrent ? "Semana en curso, hasta hoy · comparada con la anterior hasta el mismo día" : "Comparado con la semana anterior"}</p>
          <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-3">
            <Kpi label="Hábitos cumplidos" value={now.habitPct === null ? "–" : `${now.habitPct}%`}>
              <Delta now={now.habitPct} before={before.habitPct} unit="pts" />
            </Kpi>
            <Kpi label="Días escritos" value={`${now.wroteDays} de ${r.elapsed}`}>
              <Delta now={now.wroteDays} before={before.wroteDays} />
            </Kpi>
            <Kpi label="Gastado" value={moneyWhole(now.spentCents)}>
              <Delta now={now.spentCents} before={before.spentCents} goodUp={false} />
            </Kpi>
            <Kpi label="Bloques del plan" value={`${now.blocksDone} de ${now.blocksTotal}`}>
              <Delta now={now.blocksDone} before={before.blocksDone} />
            </Kpi>
          </div>
        </section>

        {/* Reflexión */}
        <section className="rise grid gap-3 rounded-[20px] border border-line bg-surface p-4 xl:col-span-12 lg:flex lg:items-center lg:p-5">
          <div className="grid gap-1 lg:flex-1">
            <h2 className="text-[15px] font-semibold">Tu reflexión</h2>
            <p className="text-[13.5px] text-muted">
              {r.review?.written
                ? "Ya la empezaste. Podés seguirla cuando quieras."
                : "Cuatro preguntas: qué salió bien, qué no, qué aprendiste y qué cambiás. Queda en el journal."}
            </p>
          </div>
          <form action={writeWeeklyReview.bind(null, r.monday)}>
            <button
              type="submit"
              disabled={r.isFuture}
              className="group inline-flex h-12 w-full items-center justify-between gap-3 rounded-full bg-ink pr-1.5 pl-5 text-[14px] font-medium text-on-ink transition-[opacity,transform] hover:opacity-90 active:scale-[0.98] disabled:opacity-50 lg:w-auto"
            >
              {r.review ? "Abrir la reflexión" : "Escribir la reflexión"}
              <span className="inline-flex size-9 items-center justify-center rounded-full bg-white/15 transition-transform duration-300 group-hover:translate-x-0.5">
                <NotePencil size={17} aria-hidden />
              </span>
            </button>
          </form>
        </section>

        {/* Hábitos */}
        <Card title="Hábitos" color="var(--c-habitos)" className="xl:col-span-7" href="/habitos">
          {habitsSorted.length === 0 ? (
            <p className="text-[14px] text-muted">Esta semana no tocaba ningún hábito.</p>
          ) : (
            <>
              {(strong.length > 0 || weak.length > 0) && (
                <p className="text-[13.5px] text-muted">
                  {strong.length > 0 && <>Firmes: {strong.map((h) => h.name).join(", ")}. </>}
                  {weak.length > 0 && <>Para reforzar: {weak.map((h) => h.name).join(", ")}.</>}
                </p>
              )}
              {/* En el celular el nombre va arriba y los siete días debajo (a lo ancho), así se lee entero. */}
              <div className="grid grid-cols-[repeat(7,minmax(0,1fr))_2.75rem] items-center gap-x-1.5 gap-y-1.5 text-[13.5px] sm:grid-cols-[minmax(0,1fr)_repeat(7,1.5rem)_3rem] sm:gap-y-2">
                <span className="hidden sm:block" />
                {r.days.map((d) => (
                  <span key={d.date} className="text-center font-mono text-[10.5px] text-muted">
                    {WD[weekday(d.date)]}
                  </span>
                ))}
                <span />
                {habitsSorted.map((h) => (
                  <HabitRow key={h.id} h={h} days={r.days} />
                ))}
              </div>
            </>
          )}
        </Card>

        {/* Cómo te sentiste */}
        <Card title="Cómo estuviste" color="var(--mod-inicio)" className="xl:col-span-5" href="/">
          {!hasFeel ? (
            <p className="text-[14px] leading-relaxed text-muted">
              Sin check-ins esta semana. Cargalo en Inicio (ánimo, energía, estrés, sueño y peso) y acá vas a ver cómo
              te fue.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-7 gap-1.5">
                {r.days.map((d) => {
                  const info = moodInfo(d.mood);
                  return (
                    <div key={d.date} className="grid justify-items-center gap-1">
                      <span
                        style={info ? tone(info.color) : undefined}
                        className={cx(
                          "inline-flex size-9 items-center justify-center rounded-full",
                          info ? "bg-tone text-tone-fg" : "border border-dashed border-line-strong text-faint",
                        )}
                        title={info?.label ?? "Sin ánimo"}
                      >
                        {info && <MoodIcon mood={d.mood} size={18} weight="fill" />}
                      </span>
                      <span className="font-mono text-[10.5px] text-muted">{WD[weekday(d.date)]}</span>
                    </div>
                  );
                })}
              </div>
              <dl className="grid grid-cols-2 gap-2">
                <Mini label="Ánimo promedio" value={now.mood === null ? "–" : dec1(now.mood)} sub={moodInfo(Math.round(now.mood ?? 0))?.label} />
                <Mini label="Energía" value={now.energy === null ? "–" : `${dec1(now.energy)} / 5`} />
                <Mini label="Estrés" value={now.stress === null ? "–" : `${dec1(now.stress)} / 5`} />
                {now.sleepMin === null ? <Mini label="Sueño promedio" value="–" /> : <BodyMinis now={now} before={before} show={["sleep"]} />}
                {/* Del reloj: los de la semana contra la anterior (en curso, hasta el mismo día). */}
                <BodyMinis now={now} before={before} show={["steps", "stressWatch"]} />
              </dl>
              {r.weight && (
                <p className="text-[13.5px] text-muted">
                  Peso: <span className="font-medium text-fg">{formatWeight(r.weight.last)}</span>
                  {r.weight.n > 1 &&
                    ` (${r.weight.last - r.weight.first > 0 ? "+" : "−"}${formatWeight(Math.abs(r.weight.last - r.weight.first))} en la semana)`}
                </p>
              )}
            </>
          )}
        </Card>

        {/* Gastos */}
        <Card title="Gastos" color="var(--c-gastos)" className="xl:col-span-7" href="/gastos">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-1">
            <p className="figure text-[30px]">{moneyWhole(now.spentCents)}</p>
            <p className="pb-1 text-[13px] text-muted">
              la semana anterior{r.isCurrent ? " a esta altura" : ""} {moneyWhole(before.spentCents)} · ingresos {moneyWhole(now.incomeCents)}
            </p>
          </div>
          <div className="grid h-28 grid-cols-7 items-end gap-2" role="img" aria-label="Gasto por día">
            {r.days.map((d) => (
              <div key={d.date} className="grid h-full grid-rows-[1fr_auto] justify-items-center gap-1">
                <div className="flex h-full w-full items-end">
                  <div
                    className="w-full rounded-t-md bg-[var(--c-gastos)]"
                    style={{ height: `${d.spentCents ? Math.max(4, (d.spentCents / maxSpent) * 100) : 0}%` }}
                    title={`${formatShort(d.date)}: ${moneyWhole(d.spentCents)}`}
                  />
                </div>
                <span className="font-mono text-[10.5px] text-muted">{WD[weekday(d.date)]}</span>
              </div>
            ))}
          </div>
          <div className="grid gap-4 border-t border-line pt-3 sm:grid-cols-2">
            <ul className="grid content-start gap-2">
              {r.topCategories.map((c) => (
                <li key={c.id ?? "none"} className="flex items-center gap-2.5 text-[13.5px]">
                  <ToneSquare size={26} style={tone(c.color)}>
                    <FinanceIcon name={c.icon} size={14} weight="fill" aria-hidden />
                  </ToneSquare>
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span className="tabular">{moneyWhole(c.cents)}</span>
                </li>
              ))}
              {r.topCategories.length === 0 && <li className="text-[13.5px] text-muted">Sin gastos en pesos.</li>}
            </ul>
            {r.biggest && (
              <div className="grid content-start gap-1 rounded-xl bg-surface-2 p-3">
                <p className="kicker">El gasto más grande</p>
                <p className="figure text-[22px]">{moneyCents(r.biggest.cents)}</p>
                <p className="text-[13px] text-muted">
                  {r.biggest.title ?? "Sin título"} · {formatShort(r.biggest.date)}
                </p>
              </div>
            )}
          </div>
        </Card>

        {/* Plan y journal */}
        <Card title="Plan y journal" color="var(--c-plan)" className="xl:col-span-5" href="/plan">
          <dl className="grid grid-cols-2 gap-2">
            <Mini
              label="Bloques hechos"
              value={now.blocksTotal ? `${Math.round((now.blocksDone / now.blocksTotal) * 100)}%` : "–"}
              sub={`${now.blocksDone} de ${now.blocksTotal}`}
            />
            <Mini label="Palabras escritas" value={now.words.toLocaleString("es-UY")} sub={now.wroteDays === 1 ? "1 día" : `${now.wroteDays} días`} />
          </dl>
          {r.tasksDone.length > 0 && (
            <div className="grid gap-1.5">
              <p className="kicker">Tareas terminadas</p>
              <ul className="grid gap-1">
                {r.tasksDone.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 text-[13.5px]">
                    <CheckCircle size={16} weight="fill" className="shrink-0 text-[var(--st-done-line)]" aria-hidden />
                    <span className="min-w-0 truncate">{t.title}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {r.tasksNext.length > 0 && (
            <div className="grid gap-1.5 border-t border-line pt-3">
              <p className="kicker">Deadlines de la semana que viene</p>
              <ul className="grid gap-1">
                {r.tasksNext.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 text-[13.5px]">
                    <span className="tabular w-14 shrink-0 text-[12px] text-muted">{formatShort(t.deadline)}</span>
                    <span className="min-w-0 truncate">{t.title}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Link
            href={`/plan?semana=${addDays(r.monday, 7)}`}
            className="text-[13px] text-muted underline decoration-line-strong underline-offset-4 hover:text-fg"
          >
            Planificar la semana que viene
          </Link>
        </Card>
      </main>
    </>
  );
}


function HabitRow({ h, days }: { h: WeeklyReview["perHabit"][number]; days: WeeklyReview["days"] }) {
  return (
    <>
      <span className="col-span-full mt-1.5 flex min-w-0 items-center gap-2 sm:col-span-1 sm:mt-0">
        <HabitAvatar icon={h.icon} color={h.color} size={26} />
        <span className="min-w-0 truncate" title={h.name}>{h.name}</span>
      </span>
      {days.map((d) => {
        const v = d.habit[h.id];
        // Toca y todavía se puede hacer (hoy, o un semanal con la semana en curso): sin rojo.
        const open = v === false && d.habitOpen.includes(h.id);
        return (
          <span
            key={d.date}
            title={`${formatShort(d.date)}: ${v === undefined ? "no tocaba" : v ? "hecho" : open ? "todavía se puede" : "no"}`}
            className={cx(
              "mx-auto size-5 rounded-full",
              v === true && "bg-[var(--st-done-line)]",
              v === false && !open && "bg-[var(--st-fail-bg)] ring-1 ring-[var(--st-fail-line)]/40",
              open && "border-2 border-dashed border-line-strong",
              v === undefined && "bg-surface-2",
            )}
          />
        );
      })}
      <span className="tabular text-right text-[12.5px] text-muted">
        {h.done}/{h.due}
      </span>
    </>
  );
}
