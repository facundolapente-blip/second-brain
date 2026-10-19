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
  CaretLeft,
  ChatText,
  Check,
  CheckCircle,
  LinkSimple,
  Lock,
  Medal,
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

      <main key={tab} className={cx("mx-auto grid max-w-3xl px-4 pt-2 lg:max-w-6xl lg:px-10 lg:pt-6", tabSwap)}>
        {tab !== "editar" && habit.tracks.length > 0 && (
          <TrackPicker habit={habit} view={view} onChange={setView} />
        )}
        {tab === "calendario" && (
          <div className="grid lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-start lg:gap-5">
            <CalendarTab habit={habit} logs={logs} stats={stats} today={today} openDay={openDay} />
          </div>
        )}
        {tab === "estadisticas" && (
          // Dos columnas hasta 1280 px (con tres, la racha y el anillo no entraban).
          <div className="grid lg:grid-flow-row-dense lg:grid-cols-[repeat(2,minmax(0,1fr))] lg:gap-5 xl:grid-cols-[repeat(3,minmax(0,1fr))]">
            <StatsTab habit={habit} stats={stats} view={view} today={today} />
          </div>
        )}
        {tab === "editar" && (
          <div className="grid lg:items-start lg:gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
            <EditTab habit={habit} categories={categories} today={today} hasHistory={hasMarks(logs, habit.startDate)} onSaved={() => changeTab("calendario")} />
            <TracksPanel habit={habit} today={today} />
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
    <label className="rise flex min-h-12 items-center justify-between gap-3 border-b border-line lg:mb-5 lg:rounded-xl lg:border lg:border-line lg:bg-surface-2 lg:px-4">
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
    <Panel icon={ArrowCounterClockwise} title="Pistas">
      <p className="max-w-[60ch] text-[14px] leading-relaxed text-muted">
        Una pista nueva arranca la racha y el puntaje desde cero sin borrar nada. El historial anterior se sigue
        viendo eligiendo &quot;Todas las pistas&quot;.
      </p>
      <ul className="mt-3 grid gap-1 text-sm">
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
      <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
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
          className="mt-2 h-9! px-3.5! text-[13px]!"
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
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </Panel>
  );
}

// ─── Piezas comunes ─────────────────────────────────────────────────────────

function Panel({
  icon: Ico,
  title,
  children,
  className,
}: {
  icon?: Icon;
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cx(
        "rise min-w-0 border-b border-line py-7 last:border-b-0",
        // En la computadora cada panel es una tarjeta con el aro y la sombra del tema.
        "lg:rounded-2xl lg:border lg:border-[var(--card-ring)] lg:bg-surface lg:px-6 lg:py-6 lg:shadow-[var(--card-shadow)] lg:last:border-b",
        className,
      )}
    >
      {title && (
        <h2 className="kicker mb-5 flex items-center gap-2">
          {Ico && <Ico size={15} weight="bold" className="text-accent" aria-hidden />}
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

function streakUnit(habit: HabitDTO, n: number) {
  if (habit.frequency === "weekly") return n === 1 ? "semana" : "semanas";
  return n === 1 ? "día" : "días";
}

function BigNumber({ value, unit }: { value: number | string; unit?: string }) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2">
      <span className="figure text-[44px] xl:text-[52px]">{value}</span>
      {unit && <span className="display text-[20px] text-muted">{unit}</span>}
    </span>
  );
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

  return (
    <>
      <Panel className="xl:row-span-2">
        <CalendarMonth
          habit={habit}
          logs={logs}
          today={today}
          onTap={openDay}
          month={month}
          onMonthChange={setMonth}
          stateOf={stats.stateOf}
        />
        <p className="mt-5 text-[13px] leading-relaxed text-muted">
          Tocá un día para marcarlo o dejarle una nota. Los días con nota tienen un puntito.
        </p>
      </Panel>

      <Panel icon={LinkSimple} title="Racha">
        <BigNumber value={streak} unit={streakUnit(habit, streak)} />
      </Panel>

      <Panel icon={ChatText} title="Notas">
        {notes.length === 0 ? (
          <p className="display text-[19px] text-muted">No hay notas para el mes.</p>
        ) : (
          <ul className="-mx-2 grid divide-y divide-line">
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
        <Button variant="outline" size="sm" className="mt-4" onClick={() => openDay(today)}>
          Nota para hoy
        </Button>
      </Panel>
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
  const periodWords: [string, string] =
    habit.frequency === "weekly" ? ["Semanas logradas", "Semanas incompletas"] : ["Días logrados", "Días incompletos"];

  return (
    <>
      <Panel icon={Trophy} title="Puntaje del hábito">
        <div className="grid justify-items-center gap-3 py-2">
          <ScoreRing value={score} />
          <p className="max-w-[40ch] text-center text-[14px] text-muted">
            {view === "all"
              ? "Promedio de todas las pistas."
              : habit.frequency === "weekly"
                ? "Qué parte de la meta semanal cumpliste, semana a semana."
                : "Qué parte de los días cumpliste."}
          </p>
        </div>
      </Panel>

      <Panel icon={LinkSimple} title="Racha">
        <div className="grid grid-cols-2 divide-x divide-line">
          <div className="grid gap-1">
            <span className="kicker">Actual</span>
            <BigNumber value={streak} unit={streakUnit(habit, streak)} />
          </div>
          <div className="grid gap-1 pl-5">
            <span className="kicker">Mejor</span>
            <BigNumber value={best} unit={streakUnit(habit, best)} />
          </div>
        </div>
      </Panel>

      <Panel icon={CheckCircle} title="Veces logrado">
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

      <Panel className="lg:col-span-2 xl:col-span-3">
        <MonthTimeline stateOf={stats.stateOf} today={today} />
      </Panel>

      <Panel className="lg:col-span-2 xl:col-span-2">
        <DoneBars habit={habit} logs={logs} from={stats.from} today={today} />
      </Panel>

      <Panel icon={CheckCircle} title="Logrado / Fallido">
        <Donut achieved={periods.achieved} missed={periods.missed} labels={periodWords} />
      </Panel>

      <Panel icon={Medal} title="Desafío de racha" className="lg:col-span-2 xl:col-span-3">
        <StreakChallenge habit={habit} best={best} />
      </Panel>
    </>
  );
}

function ScoreRing({ value }: { value: number }) {
  // Arco de 300°, abierto abajo, como en HabitNow.
  const r = 70;
  const c = 2 * Math.PI * r;
  const arc = c * (300 / 360);
  // Al cambiar de pista, la cifra se corre hacia donde fue (el arco ya se anima solo).
  const tick = useTick(value);
  return (
    <div className="relative size-48">
      <svg viewBox="0 0 180 180" className="size-full rotate-[120deg]" aria-hidden>
        <circle
          cx="90"
          cy="90"
          r={r}
          fill="none"
          stroke="var(--border-strong)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={`${arc} ${c}`}
        />
        <circle
          cx="90"
          cy="90"
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${(arc * value) / 100} ${c}`}
          className="transition-[stroke-dasharray] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">
        <span key={tick.key} className={cx("figure text-[68px]", tick.className)}>
          {value}
        </span>
        <span className="display mt-5 text-[22px] text-muted">%</span>
      </span>
    </div>
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

  return (
    <div className="grid gap-5">
      <PeriodNav
        title={title}
        subtitle="Veces logrado"
        onPrev={onPrev}
        onNext={onNext}
        nextDisabled={nextDisabled}
      />
      <div className="grid h-44 grid-flow-col items-end gap-1.5 border-b border-line-strong bg-[linear-gradient(to_top,var(--border)_1px,transparent_1px)] bg-[length:100%_33.33%]">
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
      <div className="-mt-3 grid grid-flow-col gap-1.5">
        {items.map((it) => (
          <span
            key={it.key}
            className={cx("text-center font-mono text-[10.5px] uppercase", it.current ? "font-semibold text-fg" : "text-muted")}
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

function Donut({ achieved, missed, labels }: { achieved: number; missed: number; labels: [string, string] }) {
  const total = achieved + missed;
  const r = 60;
  const c = 2 * Math.PI * r;
  const part = total === 0 ? 0 : (achieved / total) * c;
  const gap = 4;
  return (
    <div className="grid items-center gap-6 sm:grid-cols-[auto_1fr] lg:grid-cols-1">
      <div className="relative mx-auto size-44">
        <svg viewBox="0 0 160 160" className="size-full -rotate-90" aria-hidden>
          {total === 0 && <circle cx="80" cy="80" r={r} fill="none" stroke="var(--border-strong)" strokeWidth="2" />}
          {/* Dos arcos con un corte de papel entre medio, en lugar de un trazo que los separe. */}
          {missed > 0 && (
            <circle
              cx="80"
              cy="80"
              r={r}
              fill="none"
              stroke="var(--p-orange-solid)"
              strokeWidth="14"
              strokeDasharray={`${Math.max(0, c - part - (achieved > 0 ? gap : 0))} ${c}`}
              strokeDashoffset={-(part + (achieved > 0 ? gap / 2 : 0))}
            />
          )}
          {achieved > 0 && (
            <circle
              cx="80"
              cy="80"
              r={r}
              fill="none"
              stroke="var(--st-done-line)"
              strokeWidth="14"
              strokeDasharray={`${Math.max(0, part - (missed > 0 ? gap : 0))} ${c}`}
              strokeDashoffset={missed > 0 ? -gap / 2 : 0}
            />
          )}
        </svg>
        <span className="absolute inset-0 grid place-content-center text-center">
          <span className="figure text-[34px]">
            {total === 0 ? "-" : `${Math.round((achieved / total) * 100)}%`}
          </span>
        </span>
      </div>
      <ul className="grid divide-y divide-line text-[15px]">
        <li className="flex items-center gap-2.5 py-2.5">
          <span className="size-2.5 rounded-full bg-[var(--st-done-line)]" />
          {labels[0]}
          <span className="figure ml-auto text-[22px]">{achieved}</span>
        </li>
        <li className="flex items-center gap-2.5 py-2.5">
          <span className="size-2.5 rounded-full bg-[var(--p-orange-solid)]" />
          {labels[1]}
          <span className="figure ml-auto text-[22px]">{missed}</span>
        </li>
      </ul>
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
}: {
  habit: HabitDTO;
  categories: CategoryDTO[];
  today: string;
  hasHistory: boolean;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useSafeTransition();
  return (
    <>
      <Panel className="lg:row-span-2">
        <div className="mb-5 flex items-center gap-3">
          <HabitBadge habit={habit} />
        </div>
        <HabitFormBody initial={fromHabit(habit)} categories={categories} today={today} hasHistory={hasHistory} onSaved={onSaved} />
      </Panel>
      <Panel>
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
    </>
  );
}
