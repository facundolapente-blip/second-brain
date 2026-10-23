"use client";

import { useSlide, useSwap, useTick } from "@/components/motion";
import { useSafeTransition } from "@/components/safe-action";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowBendUpRight,
  ArrowCounterClockwise,
  CalendarBlank,
  CaretLeft,
  ChartBar,
  ChatText,
  Check,
  CheckCircle,
  LinkSimple,
  Lock,
  Medal,
  PencilSimple,
  Plus,
  Trash,
  Trophy,
  X,
  type Icon,
} from "@phosphor-icons/react";
import { archiveHabit, deleteHabit, mergeLastTrack, startNewTrack } from "@/lib/offline/habit";
import { addDays, formatLong, formatShort, monthBounds, shiftMonth, startOfWeek } from "@/lib/dates";
import {
  isDone,
  streakMilestones,
  trackStats,
  type DayState,
  type LogMap,
  type TrackStats,
  type TrackView,
  type PackedLogs,
} from "@/lib/habit-logic";
import { HabitAvatar } from "@/lib/habit-icons";
import type { CategoryDTO, HabitDTO } from "@/lib/habits";
import { Button, ConfirmButton, cx, Segmented } from "@/components/ui";
import { StatTile, TintedCard } from "@/components/tinted-card";
import {
  CalendarMonth,
  DaySheet,
  HabitBadge,
  monthName,
  PeriodNav,
  useHabitLogs,
  type DaySheetHandle,
} from "../habit-ui";
import { fromHabit, HabitFormBody, hasMarks } from "../habit-form";

export type DetailTab = "calendario" | "estadisticas" | "editar";

const TABS: { id: DetailTab; label: string }[] = [
  { id: "calendario", label: "Calendario" },
  { id: "estadisticas", label: "Estadísticas" },
  { id: "editar", label: "Editar" },
];

export function HabitDetail({
  habit,
  logs: initialLogs,
  today,
  categories,
  initialTab,
}: {
  habit: HabitDTO;
  logs: PackedLogs | null;
  today: string;
  categories: CategoryDTO[];
  initialTab: DetailTab;
}) {
  const packed = useMemo(() => ({ [habit.id]: initialLogs }), [habit.id, initialLogs]);
  const { logs: all, mark } = useHabitLogs(packed);
  const logs = all[habit.id] ?? {};
  const [tab, setTab] = useState<DetailTab>(initialTab);
  const [view, setView] = useState<TrackView>("current");
  const stats = trackStats(habit, habit.tracks, logs, today, view);
  const daySheet = useRef<DaySheetHandle>(null);
  const openDay = (date: string) => daySheet.current?.show(habit, date);

  const tabSwap = useSwap(tab);
  function changeTab(t: DetailTab) {
    setTab(t);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", t);
    window.history.replaceState(null, "", url);
  }

  return (
    <>
      <header className="sticky top-0 z-20 bg-bg/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto max-w-3xl px-2 lg:max-w-6xl lg:px-10">
          <div className="flex min-h-16 items-center gap-1 lg:min-h-24 lg:items-end lg:pb-3">
            <Link
              href={habit.archived ? "/habitos/archivados" : "/habitos/lista"}
              aria-label="Volver a hábitos"
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-[4px] text-fg hover:bg-surface-2"
            >
              <CaretLeft size={22} />
            </Link>
            <h1 className="display min-w-0 truncate pb-0.5 text-[26px] lg:text-[38px]">{habit.name}</h1>
            <span className="ml-auto pr-2">
              <HabitAvatar icon={habit.icon} color={habit.color} size={36} />
            </span>
          </div>
          <div className="grid grid-cols-3 border-b border-line lg:flex lg:gap-8 lg:px-3" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => changeTab(t.id)}
                className={cx(
                  "relative h-11 text-[14.5px] transition-colors",
                  tab === t.id ? "font-medium text-fg" : "text-muted hover:text-fg",
                )}
              >
                {t.label}
                <span
                  className={cx(
                    "absolute inset-x-[22%] -bottom-px h-[1.5px] bg-fg transition-opacity duration-200 lg:inset-x-0",
                    tab === t.id ? "opacity-100" : "opacity-0",
                  )}
                />
              </button>
            ))}
          </div>
        </div>
      </header>

      <main key={tab} className={cx("mx-auto grid max-w-3xl gap-3.5 px-4 pt-3 lg:max-w-6xl lg:gap-5 lg:px-10 lg:pt-6", tabSwap)}>
        {tab !== "editar" && habit.tracks.length > 0 && (
          <TrackPicker habit={habit} view={view} onChange={setView} />
        )}
        {tab === "calendario" && (
          <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-5">
            <CalendarTab habit={habit} logs={logs} stats={stats} today={today} openDay={openDay} />
          </div>
        )}
        {tab === "estadisticas" && (
          // Las cifras arriba; después dos columnas hasta 1280 px y tres desde ahí.
          <div className="grid gap-3.5 lg:grid-flow-row-dense lg:grid-cols-[repeat(2,minmax(0,1fr))] lg:gap-5 xl:grid-cols-[repeat(3,minmax(0,1fr))]">
            <StatsTab habit={habit} stats={stats} view={view} today={today} />
          </div>
        )}
        {tab === "editar" && (
          <div className="grid gap-3.5 lg:gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
            <EditTab
              habit={habit}
              categories={categories}
              today={today}
              hasHistory={hasMarks(logs, habit.startDate)}
              onSaved={() => changeTab("calendario")}
              aside={<TracksPanel habit={habit} today={today} />}
            />
          </div>
        )}
      </main>

      <DaySheet ref={daySheet} logs={all} mark={mark} />
    </>
  );
}

// ─── Pistas ─────────────────────────────────────────────────────────────────

function trackLabel(from: string, to: string) {
  return `${formatShort(from)} ${from.slice(0, 4)} al ${formatShort(to)} ${to.slice(0, 4)}`;
}

/** Selector de pista, como el "Pista actual / Todas las pistas" de HabitNow. */
function TrackPicker({
  habit,
  view,
  onChange,
}: {
  habit: HabitDTO;
  view: TrackView;
  onChange: (v: TrackView) => void;
}) {
  return (
    <label className="flex min-h-12 items-center justify-between gap-3 rounded-full border border-line bg-surface px-4">
      <span className="kicker">Mostrando</span>
      <select
        value={String(view)}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "current" || v === "all" ? v : Number(v));
        }}
        className="min-w-0 flex-1 truncate bg-transparent text-right text-sm font-medium text-fg outline-none"
      >
        <option value="current">
          Pista actual (desde {formatShort(habit.startDate)} {habit.startDate.slice(0, 4)})
        </option>
        <option value="all">Todas las pistas</option>
        {habit.tracks
          .map((t, i) => ({ t, i }))
          .reverse()
          .map(({ t, i }) => (
            <option key={i} value={i}>
              Pista {i + 1}: {trackLabel(t.startDate, t.endDate)}
            </option>
          ))}
      </select>
    </label>
  );
}

function TracksPanel({ habit, today }: { habit: HabitDTO; today: string }) {
  const [date, setDate] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useSafeTransition();
  return (
    <Panel icon={ArrowCounterClockwise} title="Pistas" meta={habit.tracks.length ? `${habit.tracks.length + 1} pistas` : "Una sola pista"}>
      <p className="max-w-[60ch] text-[14px] leading-relaxed text-muted">
        Una pista nueva arranca la racha y el puntaje desde cero sin borrar nada. El historial anterior se sigue
        viendo eligiendo &quot;Todas las pistas&quot;.
      </p>
      <ul className="grid gap-1 text-sm">
        <li className="flex justify-between gap-3 py-1">
          <span className="font-medium">Actual</span>
          <span className="tabular text-muted">
            desde {formatShort(habit.startDate)} {habit.startDate.slice(0, 4)}
          </span>
        </li>
        {habit.tracks
          .map((t, i) => ({ t, i }))
          .reverse()
          .map(({ t, i }) => (
            <li key={i} className="flex justify-between gap-3 py-1">
              <span>Pista {i + 1}</span>
              <span className="tabular text-muted">{trackLabel(t.startDate, t.endDate)}</span>
            </li>
          ))}
      </ul>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <input
          type="date"
          value={date}
          max={today}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Inicio de la pista nueva"
          className="h-11 rounded-[4px] border border-line-strong bg-surface px-3 text-sm"
        />
        <ConfirmButton
          disabled={pending}
          className="border border-line-strong"
          confirmLabel="Tocá de nuevo: racha y puntaje arrancan de cero"
          onConfirm={() => {
            setError(null);
            startTransition(async () => {
              const r = await startNewTrack(habit.id, date);
              if (!r.ok) setError(r.error);
            });
          }}
        >
          Empezar pista nueva
        </ConfirmButton>
      </div>
      {habit.tracks.length > 0 && (
        <ConfirmButton
          className="h-9! justify-self-start px-3.5! text-[13px]!"
          disabled={pending}
          confirmLabel="Tocá de nuevo para unirlas"
          onConfirm={() => {
            setError(null);
            startTransition(async () => {
              const r = await mergeLastTrack(habit.id);
              if (!r.ok) setError(r.error);
            });
          }}
        >
          Unir con la pista anterior
        </ConfirmButton>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </Panel>
  );
}

// ─── Piezas comunes ─────────────────────────────────────────────────────────

/** Sección del detalle: tarjeta con cabecera teñida del verde de Hábitos. */
function Panel({
  icon,
  title,
  meta,
  action,
  children,
  className,
  bodyClassName,
}: {
  icon: Icon;
  title: string;
  meta?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <TintedCard icon={icon} title={title} meta={meta} action={action} className={className} bodyClassName={bodyClassName}>
      {children}
    </TintedCard>
  );
}

function streakUnit(habit: HabitDTO, n: number) {
  if (habit.frequency === "weekly") return n === 1 ? "semana" : "semanas";
  return n === 1 ? "día" : "días";
}

// ─── Calendario ─────────────────────────────────────────────────────────────

function CalendarTab({
  habit,
  logs,
  stats,
  today,
  openDay,
}: {
  habit: HabitDTO;
  logs: LogMap;
  stats: TrackStats;
  today: string;
  openDay: (date: string) => void;
}) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const streak = stats.streak;
  const notes = Object.entries(logs)
    .filter(([d, l]) => d.startsWith(month) && l.n)
    .sort(([a], [b]) => b.localeCompare(a));
  // Cuántas veces se logró en el mes que se mira (para la cabecera).
  const { from, to } = monthBounds(month);
  let doneInMonth = 0;
  for (let d = from; d <= to && d <= today; d = addDays(d, 1)) if (stats.stateOf(d) === "done") doneInMonth++;

  return (
    <>
      <Panel
        icon={CalendarBlank}
        title="Calendario"
        meta={`${doneInMonth} ${doneInMonth === 1 ? "vez logrado" : "veces logrado"} en ${monthName(month).toLowerCase()}`}
      >
        <CalendarMonth
          habit={habit}
          logs={logs}
          today={today}
          onTap={openDay}
          month={month}
          onMonthChange={setMonth}
          stateOf={stats.stateOf}
        />
        <p className="text-[13px] leading-relaxed text-muted">
          Tocá un día para marcarlo o dejarle una nota. Los días con nota tienen un puntito.
        </p>
      </Panel>

      {/* Columna de al lado: la racha y las notas, que se estiran hasta el pie del calendario. */}
      <div className="grid content-start gap-3.5 lg:grid-rows-[auto_1fr] lg:content-stretch lg:gap-5">
        <StatTile
          icon={LinkSimple}
          label="Racha actual"
          figure={streak}
          unit={streakUnit(habit, streak)}
          sub={`Mejor: ${stats.best} ${streakUnit(habit, stats.best)}`}
        />

        <Panel
          icon={ChatText}
          title="Notas"
          meta={notes.length ? `${notes.length} en ${monthName(month).toLowerCase()}` : undefined}
          action={
            <button type="button" className="tcard-pill press" onClick={() => openDay(today)}>
              <Plus size={13} weight="bold" aria-hidden /> Nota para hoy
            </button>
          }
        >
          {notes.length === 0 ? (
            <p className="text-[14.5px] leading-relaxed text-muted">No hay notas en {monthName(month).toLowerCase()}. Tocá un día del calendario para dejarle una.</p>
          ) : (
            <ul className="-mx-2 -my-2 grid divide-y divide-line">
              {notes.map(([d, l]) => (
                <li key={d}>
                  <button
                    type="button"
                    onClick={() => openDay(d)}
                    className="grid w-full gap-1 rounded-[4px] px-2 py-3 text-left transition-colors hover:bg-surface-2"
                  >
                    <span className="kicker">{formatLong(d)}</span>
                    <span className="prose-serif text-[17px] leading-relaxed whitespace-pre-wrap">{l.n}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}

// ─── Estadísticas ───────────────────────────────────────────────────────────

function StatsTab({
  habit,
  stats,
  view,
  today,
}: {
  habit: HabitDTO;
  stats: TrackStats;
  view: TrackView;
  today: string;
}) {
  const { score, streak, best, counts, periods, logs } = stats;
  const periodsTotal = periods.achieved + periods.missed;
  // Al cambiar de pista, la cifra se corre hacia donde fue.
  const scoreTick = useTick(score);
  const periodWords: [string, string] =
    habit.frequency === "weekly" ? ["Semanas logradas", "Semanas incompletas"] : ["Días logrados", "Días incompletos"];

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:col-span-2 lg:grid-cols-4 lg:gap-4 xl:col-span-3">
        <StatTile
          icon={Trophy}
          label="Puntaje"
          figure={
            <span key={scoreTick.key} className={cx("inline-block", scoreTick.className)}>
              {score}
            </span>
          }
          unit="%"
          sub={
            view === "all"
              ? "Promedio de todas las pistas"
              : habit.frequency === "weekly"
                ? "De la meta semanal, semana a semana"
                : "De los días que tocaban"
          }
        >
          <MiniBar value={score / 100} label="Puntaje del hábito" />
        </StatTile>
        <StatTile
          icon={LinkSimple}
          label="Racha actual"
          figure={streak}
          unit={streakUnit(habit, streak)}
          sub={best > streak ? `Faltan ${best - streak} para tu mejor` : streak > 0 ? "Es tu mejor racha" : "Marcá hoy para empezar"}
        >
          <MiniBar value={best ? streak / best : 0} label="Racha actual contra la mejor" />
        </StatTile>
        <StatTile
          icon={Medal}
          label="Mejor racha"
          figure={best}
          unit={streakUnit(habit, best)}
          sub={`${counts.total} ${counts.total === 1 ? "vez logrado" : "veces logrado"} en total`}
        />
        <StatTile
          icon={CheckCircle}
          label="Logrado"
          figure={periodsTotal === 0 ? "–" : Math.round((periods.achieved / periodsTotal) * 100)}
          unit={periodsTotal === 0 ? undefined : "%"}
          sub={`${periods.achieved} de ${periodsTotal} ${habit.frequency === "weekly" ? "semanas" : "días"}`}
        >
          <AchievedBar achieved={periods.achieved} missed={periods.missed} labels={periodWords} />
        </StatTile>
      </div>

      <Panel icon={CheckCircle} title="Veces logrado" bodyClassName="py-2!">
        <dl className="divide-y divide-line">
          {[
            ["Esta semana", counts.week],
            ["Este mes", counts.month],
            ["Este año", counts.year],
            ["Total", counts.total],
          ].map(([label, n]) => (
            <div key={label} className="flex items-baseline justify-between py-3">
              <dt className="text-[15px]">{label}</dt>
              <dd className="figure text-[24px]">{n}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <Panel icon={ChartBar} title="Por período" meta="Veces logrado" className="xl:col-span-2">
        <DoneBars habit={habit} logs={logs} from={stats.from} today={today} />
      </Panel>

      <Panel icon={CalendarBlank} title="Línea del mes" meta="Un punto por día" className="lg:col-span-2 xl:col-span-3">
        <MonthTimeline stateOf={stats.stateOf} today={today} />
      </Panel>

      <Panel icon={Medal} title="Desafío de racha" meta={`Mejor racha: ${best} ${streakUnit(habit, best)}`} className="lg:col-span-2 xl:col-span-3">
        <StreakChallenge habit={habit} best={best} />
      </Panel>
    </>
  );
}

/** Barra fina de las cifras (en lugar del anillo de antes). */
function MiniBar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <span className="tcard-bar mt-0!" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <span style={{ width: `${pct}%` }} />
    </span>
  );
}

const MARKER: Record<string, { icon: React.ReactNode; cls: string } | undefined> = {
  done: { icon: <Check size={13} weight="bold" />, cls: "border-[var(--st-done-line)] bg-[var(--st-done-bg)] text-[var(--st-done-fg)]" },
  partial: { icon: <Check size={13} weight="bold" />, cls: "border-dashed border-[var(--st-done-line)] bg-[var(--st-done-bg)] text-[var(--st-done-fg)]" },
  failed: { icon: <X size={13} weight="bold" />, cls: "border-[var(--st-fail-line)] bg-[var(--st-fail-bg)] text-[var(--st-fail-fg)]" },
  missed: { icon: <X size={13} weight="bold" />, cls: "border-transparent bg-[var(--st-fail-bg)] text-[var(--st-fail-fg)]" },
  unmarked: { icon: null, cls: "border-transparent bg-[var(--st-skip-bg)] text-[var(--st-skip-fg)]" },
  skipped: {
    icon: <ArrowBendUpRight size={13} weight="bold" />,
    cls: "border-[var(--st-skip-line)] bg-[var(--st-skip-bg)] text-[var(--st-skip-fg)]",
  },
};

/** Línea del mes: un punto por día con la marca arriba (desde 640 px entran los 31 días). */
function MonthTimeline({ stateOf, today }: { stateOf: (iso: string) => DayState; today: string }) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const monthSlide = useSlide(month);
  const scroller = useRef<HTMLDivElement>(null);
  const { from, to } = monthBounds(month);
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);

  useEffect(() => {
    const box = scroller.current;
    const el = box?.querySelector<HTMLElement>(`[data-day="${today}"]`);
    if (box) box.scrollLeft = el ? el.offsetLeft - box.clientWidth / 2 : 0;
  }, [month, today]);

  return (
    <div className="grid gap-5">
      <PeriodNav
        title={monthName(month)}
        subtitle={month.slice(0, 4)}
        onPrev={() => setMonth(shiftMonth(month, -1))}
        onNext={() => setMonth(shiftMonth(month, 1))}
        nextDisabled={month >= today.slice(0, 7)}
      />
      <div
        ref={scroller}
        className="relative overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {/* En el celular se desliza (un día por cada 40 px); desde 640 px entran los 31 días en el ancho. */}
        <div key={month} className={cx("relative flex w-max sm:w-full", monthSlide)}>
          <span className="absolute inset-x-4 top-[39px] h-px bg-line-strong" />
          {days.map((d) => {
            const m = d <= today ? MARKER[stateOf(d)] : undefined;
            return (
              <div key={d} data-day={d} className="relative grid w-10 justify-items-center gap-2 sm:w-auto sm:min-w-0 sm:flex-1">
                <span className="flex h-7 items-end">
                  {m && (
                    <span className={cx("inline-flex size-6 items-center justify-center rounded-full border sm:size-5 xl:size-6 sm:[&_svg]:size-[11px] xl:[&_svg]:size-[13px]", m.cls)}>
                      {m.icon}
                    </span>
                  )}
                </span>
                <span className={cx("size-1.5 rounded-full", d === today ? "bg-accent" : "bg-faint")} />
                <span className={cx("font-mono tabular text-[11px]", d === today ? "font-semibold text-fg" : "text-muted")}>
                  {Number(d.slice(8))}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

type BarMode = "week" | "month" | "year";

function DoneBars({ habit, logs, from, today }: { habit: HabitDTO; logs: LogMap; from: string; today: string }) {
  const [mode, setMode] = useState<BarMode>("month");
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [weekOffset, setWeekOffset] = useState(0);
  const doneDays = Object.entries(logs)
    .filter(([, l]) => isDone(habit, l))
    .map(([d]) => d);

  let items: { key: string; label: string; value: number | null; current: boolean }[] = [];
  let title = "";
  let onPrev = () => {};
  let onNext = () => {};
  let nextDisabled = true;

  if (mode === "month") {
    title = String(year);
    const thisMonth = today.slice(0, 7);
    items = Array.from({ length: 12 }, (_, i) => {
      const m = `${year}-${String(i + 1).padStart(2, "0")}`;
      return {
        key: m,
        label: monthName(m).slice(0, 3),
        value: m > thisMonth || m < from.slice(0, 7) ? null : doneDays.filter((d) => d.startsWith(m)).length,
        current: m === thisMonth,
      };
    });
    onPrev = () => setYear(year - 1);
    onNext = () => setYear(year + 1);
    nextDisabled = year >= Number(today.slice(0, 4));
  } else if (mode === "week") {
    const lastMonday = addDays(startOfWeek(today, habit.weekStart), -7 * 12 * weekOffset);
    const mondays = Array.from({ length: 12 }, (_, i) => addDays(lastMonday, -7 * (11 - i)));
    title = `${shortDate(mondays[0])} al ${shortDate(addDays(mondays[11], 6))}`;
    items = mondays.map((mon) => ({
      key: mon,
      label: String(Number(mon.slice(8))),
      value: doneDays.filter((d) => d >= mon && d <= addDays(mon, 6)).length,
      current: mon === startOfWeek(today, habit.weekStart),
    }));
    onPrev = () => setWeekOffset(weekOffset + 1);
    onNext = () => setWeekOffset(weekOffset - 1);
    nextDisabled = weekOffset === 0;
  } else {
    title = "Por año";
    const first = Number(from.slice(0, 4));
    const last = Number(today.slice(0, 4));
    for (let y = Math.max(first, last - 7); y <= last; y++) {
      items.push({
        key: String(y),
        label: String(y),
        value: doneDays.filter((d) => d.startsWith(String(y))).length,
        current: y === last,
      });
    }
  }

  const max = Math.max(1, ...items.map((i) => i.value ?? 0));
  // Las barras y los rótulos comparten las mismas columnas (iguales entre sí): con columnas
  // automáticas cada fila las medía por su contenido y en el celular quedaban corridas.
  const cols = { gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` };

  return (
    <div className="grid gap-5">
      <PeriodNav
        title={title}
        subtitle="Veces logrado"
        onPrev={onPrev}
        onNext={onNext}
        nextDisabled={nextDisabled}
      />
      <div style={cols} className="grid h-44 items-end gap-1 border-b sm:gap-1.5 border-line-strong bg-[linear-gradient(to_top,var(--border)_1px,transparent_1px)] bg-[length:100%_33.33%]">
        {items.map((it, i) => (
          <div key={i} className="grid h-full grid-rows-[auto_1fr] justify-items-center gap-1">
            <span className={cx("font-mono tabular text-[10.5px]", it.current ? "font-semibold text-fg" : "text-muted")}>
              {it.value === null ? "" : it.value}
            </span>
            {/* Barra de alto fijo que sube o baja corriéndose (transform, no el alto): al cambiar
                de año o de vista, cada barra pasa a su valor nuevo sin recalcular el layout. */}
            <div className="flex w-full justify-center overflow-hidden">
              <div
                className={cx(
                  "h-full w-full max-w-6 rounded-t-[4px] transition-transform duration-500 ease-[var(--ease-out)] motion-reduce:transition-none",
                  it.current ? "bg-accent" : "bg-accent/55",
                )}
                style={{ transform: `translateY(${100 - (it.value ? Math.max(4, (it.value / max) * 100) : 0)}%)` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div style={cols} className="-mt-3 grid gap-1 sm:gap-1.5">
        {items.map((it) => (
          <span
            key={it.key}
            className={cx("overflow-hidden text-center font-mono text-[10px] uppercase sm:text-[10.5px]", it.current ? "font-semibold text-fg" : "text-muted")}
          >
            {it.label}
          </span>
        ))}
      </div>
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: "week", label: "Semana" },
          { value: "month", label: "Mes" },
          { value: "year", label: "Año" },
        ]}
      />
    </div>
  );
}

function shortDate(iso: string) {
  return `${Number(iso.slice(8))}/${Number(iso.slice(5, 7))}`;
}

/** Logrado contra incompleto en una barra partida (antes una dona), con los dos colores de siempre. */
function AchievedBar({ achieved, missed, labels }: { achieved: number; missed: number; labels: [string, string] }) {
  const total = achieved + missed;
  return (
    <div className="grid gap-1.5">
      <div
        className="flex h-[7px] gap-[3px] overflow-hidden rounded-full bg-surface-3"
        role="img"
        aria-label={`${labels[0]}: ${achieved}. ${labels[1]}: ${missed}.`}
      >
        {achieved > 0 && <span className="rounded-full bg-[var(--st-done-line)]" style={{ flex: achieved }} />}
        {missed > 0 && <span className="rounded-full bg-[var(--p-orange-solid)]" style={{ flex: missed }} />}
        {total === 0 && <span className="flex-1" />}
      </div>
      <div className="tmini-cap" aria-hidden>
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-full bg-[var(--st-done-line)]" /> {achieved}
        </span>
        <span className="inline-flex items-center gap-1">
          {missed} <span className="size-2 rounded-full bg-[var(--p-orange-solid)]" />
        </span>
      </div>
    </div>
  );
}

function StreakChallenge({ habit, best }: { habit: HabitDTO; best: number }) {
  const goals = streakMilestones(habit);
  const next = goals.find((g) => g > best);
  return (
    <div className="grid gap-3">
      {/* En el celular se desliza; desde 640 px las medallas se reparten el ancho (entran todas). */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:overflow-visible [&::-webkit-scrollbar]:hidden">
        {goals.map((g) => {
          const unlocked = best >= g;
          return (
            <div
              key={g}
              className={cx(
                "grid w-20 shrink-0 justify-items-center gap-2 py-1 sm:w-auto sm:min-w-0 sm:flex-1 sm:shrink",
              )}
            >
              <span
                className={cx(
                  "relative inline-flex size-12 items-center justify-center rounded-full border",
                  unlocked ? "border-accent bg-accent-soft text-accent-fg" : "border-dashed border-line-strong text-faint",
                )}
              >
                {unlocked ? <Medal size={24} weight="fill" /> : <Lock size={18} />}
              </span>
              <span className={cx("text-center font-mono text-[11px]", unlocked ? "font-semibold text-fg" : "text-muted")}>
                {g} {streakUnit(habit, g)}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-[14px] text-muted">
        {next
          ? `Próxima medalla: ${next} ${streakUnit(habit, next)} ${(habit.frequency === "weekly" ? "seguida" : "seguido") + (next === 1 ? "" : "s")}. Tu mejor racha es ${best} ${streakUnit(habit, best)}.`
          : "Desbloqueaste todas las medallas."}
      </p>
    </div>
  );
}

// ─── Editar ─────────────────────────────────────────────────────────────────

function EditTab({
  habit,
  categories,
  today,
  hasHistory,
  onSaved,
  aside,
}: {
  habit: HabitDTO;
  categories: CategoryDTO[];
  today: string;
  hasHistory: boolean;
  onSaved: () => void;
  /** Lo que va debajo de archivar/eliminar (las pistas). */
  aside?: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useSafeTransition();
  return (
    <>
      <Panel icon={PencilSimple} title="Editar">
        <div className="flex items-center gap-3">
          <HabitBadge habit={habit} />
        </div>
        <HabitFormBody initial={fromHabit(habit)} categories={categories} today={today} hasHistory={hasHistory} onSaved={onSaved} />
      </Panel>
      <div className="grid content-start gap-3.5 lg:gap-5 xl:grid-rows-[auto_1fr] xl:content-stretch">
        <Panel icon={Archive} title={habit.archived ? "Restaurar o eliminar" : "Archivar o eliminar"}>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => startTransition(() => archiveHabit(habit.id, !habit.archived))}
            >
              {habit.archived ? <ArrowCounterClockwise size={16} /> : <Archive size={16} />}
              {habit.archived ? "Restaurar hábito" : "Archivar hábito"}
            </Button>
            <ConfirmButton
              undo={`"${habit.name}" borrado`}
              disabled={pending}
              confirmLabel="Tocá de nuevo: se borra con su historial"
              onConfirm={() =>
                startTransition(async () => {
                  await deleteHabit(habit.id);
                  router.push("/habitos/lista");
                })
              }
            >
              <Trash size={16} /> Eliminar hábito
            </ConfirmButton>
          </div>
        </Panel>
        {aside}
      </div>
    </>
  );
}
