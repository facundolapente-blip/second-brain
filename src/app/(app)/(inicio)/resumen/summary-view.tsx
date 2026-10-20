"use client";

import Link from "next/link";
import { PeriodArrow, usePeriodNav } from "../period-nav";
import {
  CaretLeft,
  CaretRight,
  CheckCircle,
  FilePdf,
} from "@phosphor-icons/react";
import type { MonthlySummary } from "@/lib/monthly";
import { formatMonth, formatShort, shiftMonth, todayISO, weekday } from "@/lib/dates";
import { formatWeight } from "@/lib/checkin-logic";
import { moodInfo } from "@/lib/journal-logic";
import { HabitAvatar } from "@/lib/habit-icons";
import { FinanceIcon } from "@/lib/finance-icons";
import { tone } from "@/lib/palette";
import { moneyCents, dec1, moneyWhole } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { cx, ToneSquare } from "@/components/ui";
import { MoodIcon } from "../../journal/journal-ui";
import { BodyMinis, Card, Delta, hasWatchData, Kpi, Mini } from "../summary-ui";
import { YearHeat } from "./year-heat";

const WD = ["L", "M", "X", "J", "V", "S", "D"];
const nf = new Intl.NumberFormat("es-UY");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Imprime (o guarda como PDF) siempre en tema claro. */
function printLight() {
  const html = document.documentElement;
  const prev = html.dataset.theme;
  html.dataset.theme = "claro";
  const restore = () => {
    if (prev) html.dataset.theme = prev;
    window.removeEventListener("afterprint", restore);
  };
  window.addEventListener("afterprint", restore);
  window.print();
}

const navClass =
  "relative inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors before:absolute before:-inset-1 before:content-[''] hover:bg-surface-2 hover:text-fg";

export function SummaryView({ s }: { s: MonthlySummary }) {
  const { now, before } = s;
  const isYear = s.period.kind === "year";
  const key = s.period.key;
  const word = isYear ? "año" : "mes";
  const prevKey = isYear ? String(Number(key) - 1) : shiftMonth(key, -1);
  // Para los links a Gastos y al Journal: el último mes del período.
  const lastMonth = s.to.slice(0, 7);
  const totalDays = s.days.length;
  const compare = s.isCurrent
    ? `${isYear ? "Año" : "Mes"} en curso, comparado con el anterior hasta el mismo día`
    : `Comparado con ${isYear ? prevKey : formatMonth(prevKey)}`;
  const maxCat = Math.max(1, ...s.topCategories.map((c) => c.cents));
  const offset = (weekday(s.from) + 6) % 7;
  const net = now.incomeCents - now.spentCents;
  // Flechas y "Mes/Año": el rótulo cambia al toque; varios toques se suman (usePeriodNav).
  const nav = usePeriodNav(key);
  const shownYear = /^\d{4}$/.test(nav.shown);
  const shownCurrent = nav.shown === todayISO().slice(0, shownYear ? 4 : 7);
  const shift = (k: string, d: number) => (/^\d{4}$/.test(k) ? String(Number(k) + d) : shiftMonth(k, d));
  const hrefOf = (k: string) => (/^\d{4}$/.test(k) ? `/resumen?anio=${k}` : `/resumen?mes=${k}`);
  const goTo = (k: string) => nav.go(k, hrefOf(k));
  const shownWord = shownYear ? "año" : "mes";
  const toggleKey = shownYear ? (nav.shown === key ? lastMonth : `${nav.shown}-12` > todayISO().slice(0, 7) ? todayISO().slice(0, 7) : `${nav.shown}-12`) : nav.shown.slice(0, 4);

  return (
    <>
      <PageHeader
        title={shownYear ? "Tu año" : "Resumen del mes"}
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
              {/* En el celular, corto: si no, el botón se partía en renglones y el título se cortaba. */}
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
            <button
              type="button"
              onClick={printLight}
              aria-label="Descargar PDF"
              title="Descargar PDF"
              className="ml-1 inline-flex size-10 shrink-0 items-center justify-center gap-2 rounded-full bg-ink text-[13.5px] font-medium whitespace-nowrap text-on-ink transition-[opacity,transform] hover:opacity-90 active:scale-[0.98] sm:ml-1.5 sm:w-auto sm:px-4"
            >
              <FilePdf size={17} aria-hidden />
              <span className="hidden sm:inline">Descargar PDF</span>
            </button>
          </>
        }
      />
      <main {...nav.bodyProps} className="mx-auto grid max-w-6xl grid-cols-1 gap-4 px-4 pt-2 pb-16 lg:grid-cols-12 lg:gap-5 lg:px-10 lg:pt-4 print:grid-cols-2 print:gap-3 print:p-0">
        <section
          aria-label="El mes en números"
          className="hero rise rounded-[22px] p-5 lg:col-span-12 lg:p-7 print:col-span-2 print:break-inside-avoid"
        >
          <p className="hero-sub text-[13px]">{compare}</p>
          <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-3 print:grid-cols-4">
            <Kpi
              label="Hábitos cumplidos"
              value={now.habitPct === null ? "–" : `${now.habitPct}%`}
            >
              <Delta now={now.habitPct} before={before.habitPct} unit="pts" />
            </Kpi>
            <Kpi
              label="Días escritos"
              value={`${now.wroteDays} de ${totalDays}`}
            >
              <Delta now={now.wroteDays} before={before.wroteDays} />
            </Kpi>
            <Kpi label="Gastado" value={moneyWhole(now.spentCents)}>
              <Delta
                now={now.spentCents}
                before={before.spentCents}
                goodUp={false}
              />
            </Kpi>
            <Kpi
              label="Bloques del plan"
              value={`${now.blocksDone} de ${now.blocksTotal}`}
            >
              <Delta now={now.blocksDone} before={before.blocksDone} />
            </Kpi>
          </div>
        </section>

        {isYear && <YearHeat year={key} days={s.days} today={s.today} />}
        {isYear && <MonthTable rows={s.byMonth} />}

        {/* Calendario del mes */}
        {!isYear && (
          <Card
            title="El mes de un vistazo"
            color="var(--mod-inicio)"
            className="lg:col-span-12 print:col-span-2 print:break-inside-avoid"
          >
            <div className="grid grid-cols-7 gap-1.5 lg:gap-2">
              {WD.map((w, i) => (
                <span key={i} aria-hidden className="kicker text-center">
                  {w}
                </span>
              ))}
              {Array.from({ length: offset }, (_, i) => (
                <span key={`x${i}`} />
              ))}
              {s.days.map((d) => {
                const pct = d.habitsDue ? d.habitsDone / d.habitsDue : null;
                const info = moodInfo(d.mood);
                return (
                  <div
                    key={d.date}
                    title={`${formatShort(d.date)}${pct !== null ? ` · hábitos ${Math.round(pct * 100)}%` : ""}${info ? ` · ${info.label}` : ""}${d.wrote ? " · escribiste" : ""}`}
                    className={cx(
                      "relative grid h-14 grid-rows-[auto_1fr] rounded-xl p-1.5 lg:h-20 lg:p-2",
                      pct === null && "bg-surface-2",
                      "text-fg",
                    )}
                    style={
                      pct !== null
                        ? {
                            // Tope de intensidad: el número (en el color de texto) se lee en los dos temas.
                            background: `color-mix(in oklab, var(--c-habitos) ${Math.round(10 + pct * 38)}%, var(--surface-2))`,
                          }
                        : undefined
                    }
                  >
                    <span className="font-mono text-[11px] tabular lg:text-[12.5px]">
                      {Number(d.date.slice(8))}
                    </span>
                    {d.wrote && (
                      <span
                        aria-hidden
                        className="absolute top-2 right-2 size-1.5 rounded-full bg-[var(--c-journal)] ring-2 ring-white/70"
                      />
                    )}
                    {info && (
                      <span
                        style={tone(info.color)}
                        className="inline-flex size-6 items-center justify-center self-end justify-self-end rounded-full bg-tone text-tone-fg lg:size-7"
                      >
                        <MoodIcon mood={d.mood} size={14} weight="fill" />
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-[12.5px] text-muted">
              Más verde, más hábitos cumplidos ese día · la cara es el ánimo ·
              el punto violeta, que escribiste en el journal.
            </p>
            <details className="group print:hidden">
              <summary className="cursor-pointer text-[13px] text-muted hover:text-fg">
                Ver como tabla
              </summary>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-[13px] tabular">
                  <thead className="text-left text-[12px] text-muted">
                    <tr>
                      <th className="py-1.5 pr-3 font-medium">Día</th>
                      <th className="py-1.5 pr-3 font-medium">Hábitos</th>
                      <th className="py-1.5 pr-3 font-medium">Ánimo</th>
                      <th className="py-1.5 pr-3 font-medium">Palabras</th>
                      <th className="py-1.5 pr-3 text-right font-medium">
                        Gastado
                      </th>
                      <th className="py-1.5 text-right font-medium">Bloques</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {s.days.map((d) => (
                      <tr key={d.date}>
                        <td className="py-1.5 pr-3">{formatShort(d.date)}</td>
                        <td className="py-1.5 pr-3">
                          {d.habitsDue
                            ? `${d.habitsDone} de ${d.habitsDue}`
                            : "–"}
                        </td>
                        <td className="py-1.5 pr-3">
                          {moodInfo(d.mood)?.label ?? "–"}
                        </td>
                        <td className="py-1.5 pr-3">
                          {d.words ? nf.format(d.words) : "–"}
                        </td>
                        <td className="py-1.5 pr-3 text-right">
                          {d.spentCents ? moneyWhole(d.spentCents) : "–"}
                        </td>
                        <td className="py-1.5 text-right">
                          {d.blocksTotal
                            ? `${d.blocksDone} de ${d.blocksTotal}`
                            : "–"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </Card>
        )}

        {/* Hábitos */}
        <Card
          title="Hábitos"
          color="var(--c-habitos)"
          href="/habitos"
          className="lg:col-span-7 print:col-span-1 print:break-inside-avoid"
        >
          {s.perHabit.length === 0 ? (
            <p className="text-[14px] text-muted">
              Este {word} no tocaba ningún hábito.
            </p>
          ) : (
            <>
              <p className="text-[13.5px] text-muted">
                {s.perfectDays > 0 ? (
                  <>
                    <span className="font-medium text-fg">
                      {s.perfectDays}{" "}
                      {s.perfectDays === 1 ? "día perfecto" : "días perfectos"}
                    </span>{" "}
                    (todos los hábitos que tocaban, hechos).
                  </>
                ) : (
                  "Ningún día con todos los hábitos hechos."
                )}
              </p>
              <ul className="grid gap-2.5">
                {s.perHabit.map((h) => (
                  <li
                    key={h.id}
                    className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1"
                  >
                    <HabitAvatar icon={h.icon} color={h.color} size={26} />
                    <span className="truncate text-[13.5px]">{h.name}</span>
                    <span className="font-mono text-[12px] text-muted tabular">
                      {h.done}/{h.due} ·{" "}
                      <span className="text-fg">{h.pct}%</span>
                    </span>
                    <span className="col-span-2 col-start-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <span
                        className="block h-full rounded-full bg-[var(--c-habitos)]"
                        style={{ width: `${h.pct ?? 0}%` }}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        {/* Cómo estuviste */}
        <Card
          title="Cómo estuviste"
          color="var(--mod-inicio)"
          href="/analisis"
          className="lg:col-span-5 print:col-span-1 print:break-inside-avoid"
        >
          {s.checkins === 0 && now.mood === null && now.sleepMin === null && !hasWatchData(now) ? (
            <p className="text-[14px] leading-relaxed text-muted">
              Sin check-ins este {word}. Se cargan en Inicio.
            </p>
          ) : (
            <>
              {(now.mood !== null || now.energy !== null || now.stress !== null || now.sleepMin !== null) && (
                <dl className="grid grid-cols-2 gap-2">
                  <Mini
                    label="Ánimo promedio"
                    value={now.mood === null ? "–" : dec1(now.mood)}
                    sub={moodInfo(Math.round(now.mood ?? 0))?.label}
                  />
                  <Mini
                    label="Energía"
                    value={
                      now.energy === null ? "–" : `${dec1(now.energy)} / 5`
                    }
                  />
                  <Mini
                    label="Estrés"
                    value={
                      now.stress === null ? "–" : `${dec1(now.stress)} / 5`
                    }
                  />
                  {now.sleepMin === null ? (
                    <Mini label="Sueño promedio" value="–" />
                  ) : (
                    <BodyMinis now={now} before={before} show={["sleep"]} />
                  )}
                </dl>
              )}
              {hasWatchData(now) && (
                <div className="grid gap-2">
                  <p className="kicker">Del reloj</p>
                  <dl className="grid grid-cols-2 gap-2">
                    <BodyMinis now={now} before={before} show={["steps", "stressWatch", "hrMin", "distance", "kcal"]} />
                  </dl>
                </div>
              )}
              <p className="text-[13.5px] text-muted">
                {s.checkins} {s.checkins === 1 ? "check-in" : "check-ins"} en el{" "}
                {word}
                {s.weight && (
                  <>
                    {" · "}peso{" "}
                    <span className="font-medium text-fg">
                      {formatWeight(s.weight.last)}
                    </span>
                    {s.weight.n > 1 &&
                      s.weight.last !== s.weight.first &&
                      ` (${s.weight.last > s.weight.first ? "+" : "−"}${formatWeight(Math.abs(s.weight.last - s.weight.first))})`}
                  </>
                )}
              </p>
            </>
          )}
        </Card>

        {/* Gastos */}
        <Card
          title="Gastos"
          color="var(--c-gastos)"
          href={`/gastos/informes?mes=${lastMonth}`}
          className="lg:col-span-7 print:col-span-1 print:break-inside-avoid"
        >
          <dl className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-3 print:grid-cols-3">
            <Mini label="Gastado" value={moneyWhole(now.spentCents)} />
            <Mini label="Ingresos" value={moneyWhole(now.incomeCents)} />
            <Mini
              label="Neto"
              value={`${net < 0 ? "−" : "+"}${moneyWhole(Math.abs(net))}`}
            />
          </dl>
          {s.topCategories.length === 0 ? (
            <p className="text-[13.5px] text-muted">Sin gastos este {word}.</p>
          ) : (
            <ul className="grid gap-2.5">
              {s.topCategories.map((c) => (
                <li
                  key={c.id ?? "none"}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1 text-[13.5px]"
                >
                  <ToneSquare size={26} style={tone(c.color)}>
                    <FinanceIcon
                      name={c.icon}
                      size={14}
                      weight="fill"
                      aria-hidden
                    />
                  </ToneSquare>
                  <span className="truncate">{c.name}</span>
                  <span className="tabular">{moneyWhole(c.cents)}</span>
                  <span className="col-span-2 col-start-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <span
                      className="block h-full rounded-full bg-[var(--c-gastos)]"
                      style={{ width: `${(c.cents / maxCat) * 100}%` }}
                    />
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="grid gap-2 border-t border-line pt-3 text-[13.5px] text-muted">
            {s.biggest && (
              <p>
                El gasto más grande:{" "}
                <span className="font-medium text-fg">
                  {moneyCents(s.biggest.cents)}
                </span>{" "}
                en {s.biggest.title ?? "sin título"} (
                {formatShort(s.biggest.date)}).
              </p>
            )}
            {s.budgets.total > 0 && (
              <p>
                Presupuestos:{" "}
                {s.budgets.over.length === 0 ? (
                  <span className="font-medium text-fg">
                    los {s.budgets.total} dentro del tope.
                  </span>
                ) : (
                  <>
                    te pasaste en{" "}
                    <span className="font-medium text-fg">
                      {s.budgets.over.join(", ")}
                    </span>{" "}
                    ({s.budgets.over.length} de {s.budgets.total}).
                  </>
                )}
              </p>
            )}
            <p className="text-[12px]">
              Los dólares, pasados a pesos con la cotización de hoy.
            </p>
          </div>
        </Card>

        {/* Journal */}
        <Card
          title="Journal"
          color="var(--c-journal)"
          href={`/journal/calendario?mes=${lastMonth}`}
          className="lg:col-span-5 print:col-span-1 print:break-inside-avoid"
        >
          <dl className="grid grid-cols-2 gap-2">
            <Mini
              label="Entradas"
              value={nf.format(s.journal.entries)}
              sub={`${now.wroteDays} de ${totalDays} ${totalDays === 1 ? "día" : "días"}`}
            />
            <Mini
              label="Palabras"
              value={nf.format(now.words)}
              sub={
                now.wroteDays
                  ? `${nf.format(Math.round(now.words / now.wroteDays))} por día escrito`
                  : undefined
              }
            />
          </dl>
          {s.journal.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {s.journal.tags.map(([t, n]) => (
                <span
                  key={t}
                  className="rounded-full bg-surface-2 px-2.5 py-1 text-[12.5px]"
                >
                  #{t} <span className="text-muted tabular">{n}</span>
                </span>
              ))}
            </div>
          )}
          {s.journal.longest && (
            <Link
              href={`/journal/${s.journal.longest.id}`}
              className="grid gap-0.5 rounded-xl bg-surface-2 p-3 transition-[background-color,scale] duration-[var(--dur-quick)] hover:bg-surface-3 active:scale-[0.98] motion-reduce:active:scale-100"
            >
              <span className="kicker">La entrada más larga</span>
              <span className="truncate text-[14px] font-medium">
                {s.journal.longest.title ?? "Sin título"}
              </span>
              <span className="text-[12.5px] text-muted">
                {formatShort(s.journal.longest.date)} ·{" "}
                {nf.format(s.journal.longest.words)} {s.journal.longest.words === 1 ? "palabra" : "palabras"}
              </span>
            </Link>
          )}
        </Card>

        {/* Plan */}
        <Card
          title="Plan"
          color="var(--c-plan)"
          href="/plan"
          className="lg:col-span-12 print:col-span-2 print:break-inside-avoid"
        >
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Mini
              label="Bloques hechos"
              value={
                now.blocksTotal
                  ? `${Math.round((now.blocksDone / now.blocksTotal) * 100)}%`
                  : "–"
              }
              sub={`${now.blocksDone} de ${now.blocksTotal}`}
            />
            <Mini
              label="Tareas terminadas"
              value={String(s.tasksDone.length)}
            />
          </dl>
          {s.tasksDone.length > 0 && (
            <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-3">
              {s.tasksDone.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center gap-2 text-[13.5px]"
                >
                  <CheckCircle
                    size={16}
                    weight="fill"
                    className="shrink-0 text-[var(--st-done-line)]"
                    aria-hidden
                  />
                  <span className="min-w-0 truncate">{t.title}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </main>
    </>
  );
}

/** "Mes a mes" del resumen anual: una fila por mes con barras chicas. */
function MonthTable({ rows }: { rows: MonthlySummary["byMonth"] }) {
  const maxSpent = Math.max(1, ...rows.map((r) => r.spentCents));
  return (
    <Card
      title="Mes a mes"
      color="var(--mod-inicio)"
      className="lg:col-span-12 print:col-span-2 print:break-inside-avoid"
    >
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[34rem] text-[13px] tabular">
          <thead className="text-left text-[11.5px] text-muted">
            <tr>
              <th className="py-1.5 pr-3 font-medium">Mes</th>
              <th className="py-1.5 pr-3 font-medium">Hábitos</th>
              <th className="py-1.5 pr-3 font-medium">Escritos</th>
              <th className="py-1.5 pr-3 font-medium">Ánimo</th>
              <th className="py-1.5 pr-3 font-medium">Gastado</th>
              <th className="py-1.5 text-right font-medium">Ingresos</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.month}>
                <td className="py-2 pr-3 font-medium">
                  {cap(formatMonth(r.month).split(" ")[0])}
                </td>
                <td className="py-2 pr-3">
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 w-14 overflow-hidden rounded-full bg-surface-2">
                      <span
                        className="block h-full rounded-full bg-[var(--c-habitos)]"
                        style={{ width: `${r.habitPct ?? 0}%` }}
                      />
                    </span>
                    {r.habitPct === null ? "–" : `${r.habitPct}%`}
                  </span>
                </td>
                <td className="py-2 pr-3">
                  {r.wroteDays}/{r.days}
                </td>
                <td className="py-2 pr-3">
                  {r.mood === null ? "–" : dec1(r.mood)}
                </td>
                <td className="py-2 pr-3">
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 w-14 overflow-hidden rounded-full bg-surface-2">
                      <span
                        className="block h-full rounded-full bg-[var(--c-gastos)]"
                        style={{ width: `${(r.spentCents / maxSpent) * 100}%` }}
                      />
                    </span>
                    {moneyWhole(r.spentCents)}
                  </span>
                </td>
                <td className="py-2 text-right">{moneyWhole(r.incomeCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[12px] text-muted">
        Gastos e ingresos en pesos (los dólares, con la cotización de hoy).
        Ánimo de 1 a 5.
      </p>
    </Card>
  );
}
