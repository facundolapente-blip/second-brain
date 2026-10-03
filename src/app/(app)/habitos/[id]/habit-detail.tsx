"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
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
import { archiveHabit, deleteHabit, mergeLastTrack, startNewTrack } from "@/lib/habit-actions";
import { addDays, formatLong, formatShort, monthBounds, shiftMonth, startOfWeek } from "@/lib/dates";
import {
  isDone,
  streakMilestones,
  trackStats,
  type DayState,
  type LogMap,
  type TrackStats,
  type TrackView,
} from "@/lib/habit-logic";
import { HabitIcon } from "@/lib/habit-icons";
import { tone } from "@/lib/palette";
import type { CategoryDTO, HabitDTO } from "@/lib/habits";
import { Button, cx, Segmented, ToneSquare } from "@/components/ui";
import {
  CalendarMonth,
  DaySheet,
  HabitBadge,
  monthName,
  PeriodNav,
  useHabitLogs,
  type DaySheetHandle,
} from "../habit-ui";
import { fromHabit, HabitFormBody } from "../habit-form";

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
  logs: LogMap;
  today: string;
  categories: CategoryDTO[];
  initialTab: DetailTab;
}) {
  const { logs: all, mark } = useHabitLogs({ [habit.id]: initialLogs });
  const logs = all[habit.id] ?? {};
  const [tab, setTab] = useState<DetailTab>(initialTab);
  const [view, setView] = useState<TrackView>("current");
  const stats = trackStats(habit, habit.tracks, logs, today, view);
  const daySheet = useRef<DaySheetHandle>(null);
  const openDay = (date: string) => daySheet.current?.show(habit, date);

  function changeTab(t: DetailTab) {
    setTab(t);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", t);
    window.history.replaceState(null, "", url);
  }

  return (
    <>
      <header className="frost-bg sticky top-0 z-20 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto max-w-3xl px-4 lg:px-8">
          <div className="flex h-16 items-center gap-3 lg:h-20">
            <Link
              href={habit.archived ? "/habitos/archivados" : "/habitos/lista"}
              aria-label="Volver a hábitos"
              className="-ml-1.5 inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-surface text-accent-fg shadow-[0_1px_3px_rgba(var(--shadow-tint),0.1)] transition-transform active:scale-90"
            >
              <CaretLeft size={22} weight="bold" />
            </Link>
            <h1 className="min-w-0 truncate text-[24px] leading-none font-black tracking-[-0.02em] lg:text-[28px]">{habit.name}</h1>
            <span className="ml-auto">
              <ToneSquare size={40} style={tone(habit.color)}>
                <HabitIcon name={habit.icon} size={22} weight="fill" />
              </ToneSquare>
            </span>
          </div>
          <div className="mb-3 grid grid-cols-3 rounded-full bg-surface-3/70 p-1" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => changeTab(t.id)}
                className={cx(
                  "relative h-10 rounded-full text-[14px] transition-colors",
                  tab === t.id ? "font-extrabold text-fg" : "font-semibold text-muted hover:text-fg",
                )}
              >
                {tab === t.id && (
                  <motion.span
                    layoutId="habit-detail-tab"
                    transition={{ type: "spring", stiffness: 500, damping: 38 }}
                    className="absolute inset-0 rounded-full bg-raised shadow-[0_1px_3px_rgba(var(--shadow-tint),0.14)]"
                  />
                )}
                <span className="relative">{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-3xl gap-3 px-3 pt-4 sm:px-4 lg:px-8">
        {tab !== "editar" && habit.tracks.length > 0 && (
          <TrackPicker habit={habit} view={view} onChange={setView} />
        )}
        {tab === "calendario" && (
          <CalendarTab habit={habit} logs={logs} stats={stats} today={today} openDay={openDay} />
        )}
        {tab === "estadisticas" && <StatsTab habit={habit} stats={stats} view={view} today={today} />}
        {tab === "editar" && (
          <>
            <EditTab habit={habit} categories={categories} onSaved={() => changeTab("calendario")} />
            <TracksPanel habit={habit} today={today} />
          </>
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
    <label className="rise flex items-center justify-between gap-3 rounded-card card px-4 py-2.5">
      <span className="text-[13px] text-muted">Mostrando</span>
      <select
        value={String(view)}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "current" || v === "all" ? v : Number(v));
        }}
        className="min-w-0 flex-1 truncate bg-transparent text-right text-sm font-semibold text-fg outline-none"
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
  const [pending, startTransition] = useTransition();
  return (
    <Panel icon={ArrowCounterClockwise} title="Pistas">
      <p className="text-[13px] leading-relaxed text-muted">
        Una pista nueva arranca la racha y el puntaje desde cero sin borrar nada. El historial anterior se sigue
        viendo eligiendo &quot;Todas las pistas&quot;.
      </p>
      <ul className="mt-3 grid gap-1 text-sm">
        <li className="flex justify-between gap-3 py-1">
          <span className="font-semibold">Actual</span>
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
          className="h-10 rounded-md border border-line-strong bg-surface px-3 text-sm"
        />
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => {
            if (!confirm("¿Empezar una pista nueva? La racha y el puntaje arrancan de cero desde esa fecha.")) return;
            setError(null);
            startTransition(async () => {
              const r = await startNewTrack(habit.id, date);
              if (!r.ok) setError(r.error);
            });
          }}
        >
          Empezar pista nueva
        </Button>
      </div>
      {habit.tracks.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          disabled={pending}
          onClick={() => {
            if (!confirm("¿Unir la pista actual con la anterior?")) return;
            setError(null);
            startTransition(async () => {
              const r = await mergeLastTrack(habit.id);
              if (!r.ok) setError(r.error);
            });
          }}
        >
          Unir con la pista anterior
        </Button>
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
    <section className={cx("rise rounded-card card p-4 sm:p-5", className)}>
      {title && (
        <h2 className="mb-4 flex items-center gap-2 text-[17px] font-extrabold tracking-tight">
          {Ico && <Ico size={19} className="text-accent" />}
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
    <span className="tabular inline-flex items-baseline gap-1.5 text-accent">
      <span className="text-4xl font-black tracking-tight">{value}</span>
      {unit && <span className="text-sm font-extrabold">{unit}</span>}
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
      <Panel>
        <CalendarMonth
          habit={habit}
          logs={logs}
          today={today}
          onTap={openDay}
          month={month}
          onMonthChange={setMonth}
          stateOf={stats.stateOf}
        />
        <p className="mt-4 text-xs leading-relaxed text-muted">
          Tocá un día para marcarlo o dejarle una nota. Los días con nota tienen un puntito.
        </p>
      </Panel>

      <Panel icon={LinkSimple} title="Racha">
        <BigNumber value={streak} unit={streakUnit(habit, streak)} />
      </Panel>

      <Panel icon={ChatText} title="Notas">
        {notes.length === 0 ? (
          <p className="text-sm text-muted">No hay notas para el mes.</p>
        ) : (
          <ul className="grid gap-1">
            {notes.map(([d, l]) => (
              <li key={d}>
                <button
                  type="button"
                  onClick={() => openDay(d)}
                  className="grid w-full gap-0.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-surface-2"
                >
                  <span className="text-[13px] font-semibold text-muted first-letter:uppercase">{formatLong(d)}</span>
                  <span className="text-sm leading-relaxed whitespace-pre-wrap">{l.n}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <Button variant="outline" size="sm" className="mt-3" onClick={() => openDay(today)}>
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
          <p className="max-w-[40ch] text-center text-[13px] text-muted">
            {view === "all"
              ? "Promedio de todas las pistas."
              : habit.frequency === "weekly"
                ? "Qué parte de la meta semanal cumpliste, semana a semana."
                : "Qué parte de los días cumpliste."}
          </p>
        </div>
      </Panel>

      <Panel icon={LinkSimple} title="Racha">
        <div className="grid grid-cols-2 divide-x divide-line text-center">
          <div className="grid gap-1">
            <span className="text-[13px] text-muted">Actual</span>
            <BigNumber value={streak} unit={streakUnit(habit, streak)} />
          </div>
          <div className="grid gap-1">
            <span className="text-[13px] text-muted">Mejor</span>
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
            <div key={label} className="flex items-center justify-between py-2.5">
              <dt className="text-sm">{label}</dt>
              <dd className="tabular text-[17px] font-black">{n}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <Panel>
        <MonthTimeline stateOf={stats.stateOf} today={today} />
      </Panel>

      <Panel>
        <DoneBars habit={habit} logs={logs} from={stats.from} today={today} />
      </Panel>

      <Panel icon={CheckCircle} title="Logrado / Fallido">
        <Donut achieved={periods.achieved} missed={periods.missed} labels={periodWords} />
      </Panel>

      <Panel icon={Medal} title="Desafío de racha">
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
  return (
    <div className="relative size-48">
      <svg viewBox="0 0 180 180" className="size-full rotate-[120deg]" aria-hidden>
        <circle
          cx="90"
          cy="90"
          r={r}
          fill="none"
          stroke="var(--surface-3)"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${arc} ${c}`}
        />
        <circle
          cx="90"
          cy="90"
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${(arc * value) / 100} ${c}`}
          className="transition-[stroke-dasharray] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
        />
      </svg>
      <span className="tabular absolute inset-0 flex items-center justify-center text-6xl font-black tracking-tight">
        {value}
      </span>
    </div>
  );
}

const MARKER: Record<string, { icon: React.ReactNode; cls: string } | undefined> = {
  done: { icon: <Check size={13} weight="bold" />, cls: "bg-[var(--st-done-bg)] text-[var(--st-done-line)]" },
  partial: { icon: <Check size={13} weight="bold" />, cls: "bg-[var(--st-done-bg)] text-[var(--st-done-line)] opacity-60" },
  failed: { icon: <X size={13} weight="bold" />, cls: "bg-[var(--st-fail-bg)] text-[var(--st-fail-line)]" },
  missed: { icon: <X size={13} weight="bold" />, cls: "bg-[var(--st-fail-bg)] text-[var(--st-fail-line)] opacity-60" },
  skipped: {
    icon: <ArrowBendUpRight size={13} weight="bold" />,
    cls: "bg-[var(--st-skip-bg)] text-[var(--st-skip-line)]",
  },
};

/** Línea del mes: un punto por día con la marca arriba. */
function MonthTimeline({ stateOf, today }: { stateOf: (iso: string) => DayState; today: string }) {
  const [month, setMonth] = useState(today.slice(0, 7));
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
        <div className="relative flex w-max">
          <span className="absolute inset-x-4 top-[38px] h-px bg-line-strong" />
          {days.map((d) => {
            const m = d <= today ? MARKER[stateOf(d)] : undefined;
            return (
              <div key={d} data-day={d} className="relative grid w-10 justify-items-center gap-2">
                <span className="flex h-7 items-end">
                  {m && (
                    <span className={cx("inline-flex size-6 items-center justify-center rounded-[7px]", m.cls)}>
                      {m.icon}
                    </span>
                  )}
                </span>
                <span className={cx("size-1.5 rounded-full", d === today ? "bg-accent" : "bg-faint")} />
                <span className={cx("tabular text-[12px]", d === today ? "font-semibold text-fg" : "text-muted")}>
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
      <div className="grid h-44 grid-flow-col items-end gap-1.5 border-b border-line-strong">
        {items.map((it) => (
          <div key={it.key} className="grid h-full grid-rows-[auto_1fr] justify-items-center gap-1">
            <span className="tabular text-[11px] font-semibold text-muted">{it.value === null ? "-" : it.value}</span>
            <div className="flex w-full items-end justify-center">
              <div
                className={cx(
                  "w-full max-w-6 rounded-t-[5px] bg-accent transition-[height] duration-500",
                  !it.current && "opacity-80",
                )}
                style={{ height: `${it.value ? Math.max(4, (it.value / max) * 100) : 0}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="-mt-3 grid grid-flow-col gap-1.5">
        {items.map((it) => (
          <span
            key={it.key}
            className={cx("text-center text-[11px]", it.current ? "font-semibold text-fg" : "text-muted")}
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
  return (
    <div className="grid items-center gap-6 sm:grid-cols-[auto_1fr]">
      <div className="relative mx-auto size-44">
        <svg viewBox="0 0 160 160" className="size-full -rotate-90" aria-hidden>
          <circle cx="80" cy="80" r={r} fill="none" stroke="var(--chart-muted)" strokeWidth="24" />
          <circle
            cx="80"
            cy="80"
            r={r}
            fill="none"
            stroke="var(--st-done-solid)"
            strokeWidth="24"
            strokeDasharray={`${part} ${c}`}
          />
        </svg>
        <span className="absolute inset-0 grid place-content-center text-center">
          <span className="tabular text-3xl font-black tracking-tight">
            {total === 0 ? "-" : `${Math.round((achieved / total) * 100)}%`}
          </span>
        </span>
      </div>
      <ul className="grid gap-2 text-sm">
        <li className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-[var(--st-done-solid)]" />
          {labels[0]}
          <span className="tabular ml-auto font-extrabold">{achieved}</span>
        </li>
        <li className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-[var(--chart-muted)]" />
          {labels[1]}
          <span className="tabular ml-auto font-extrabold">{missed}</span>
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
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {goals.map((g) => {
          const unlocked = best >= g;
          return (
            <div
              key={g}
              className={cx(
                "grid w-24 shrink-0 justify-items-center gap-2 rounded-[16px] px-2 py-3",
                unlocked ? "bg-accent-soft" : "bg-surface-2",
              )}
            >
              <span
                className={cx(
                  "relative inline-flex size-12 items-center justify-center rounded-full",
                  unlocked ? "bg-accent text-on-accent" : "bg-surface-3 text-faint",
                )}
              >
                {unlocked ? <Medal size={26} weight="fill" /> : <Lock size={20} weight="fill" />}
              </span>
              <span className={cx("text-center text-[12px]", unlocked ? "font-semibold text-accent-fg" : "text-muted")}>
                {g} {streakUnit(habit, g)}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-[13px] text-muted">
        {next
          ? `Próxima medalla: ${next} ${streakUnit(habit, next)} seguidas. Tu mejor racha es ${best}.`
          : "Desbloqueaste todas las medallas."}
      </p>
    </div>
  );
}

// ─── Editar ─────────────────────────────────────────────────────────────────

function EditTab({
  habit,
  categories,
  onSaved,
}: {
  habit: HabitDTO;
  categories: CategoryDTO[];
  onSaved: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Panel>
        <div className="mb-5 flex items-center gap-3">
          <HabitBadge habit={habit} />
        </div>
        <HabitFormBody initial={fromHabit(habit)} categories={categories} onSaved={onSaved} />
      </Panel>
      <Panel>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => startTransition(() => archiveHabit(habit.id, !habit.archived))}
          >
            {habit.archived ? <ArrowCounterClockwise size={16} /> : <Archive size={16} />}
            {habit.archived ? "Restaurar hábito" : "Archivar hábito"}
          </Button>
          <Button
            variant="danger"
            disabled={pending}
            onClick={() => {
              if (confirm(`¿Eliminar "${habit.name}" y todo su historial? No se puede deshacer.`)) {
                startTransition(async () => {
                  await deleteHabit(habit.id);
                  router.push("/habitos/lista");
                });
              }
            }}
          >
            <Trash size={16} /> Eliminar hábito
          </Button>
        </div>
      </Panel>
    </>
  );
}
