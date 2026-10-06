"use client";

import Link from "next/link";
import { useId, useOptimistic, useState, useTransition } from "react";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarCheck,
  ChartLineUp,
  Check,
  ClipboardText,
  Flame,
  Medal,
  NotePencil,
  Notebook,
  Wallet,
  type Icon,
} from "@phosphor-icons/react";
import type { Dashboard } from "@/lib/dashboard";
import { addDays, formatLong, formatMonth, formatShort, shiftMonth, weekday } from "@/lib/dates";
import { greeting } from "@/lib/journal-logic";
import { HabitIcon } from "@/lib/habit-icons";
import { FinanceIcon } from "@/lib/finance-icons";
import { tone } from "@/lib/palette";
import { money, moneyCents } from "@/lib/format";
import { daysLeftLabel, isFreeBlock, timeRange } from "@/lib/plan-logic";
import { setHabitLog } from "@/lib/habit-actions";
import { setBlockDone } from "@/lib/plan-actions";
import { writeOnDay } from "@/lib/journal-actions";
import { PageHeader } from "@/components/page-header";
import { cx, ToneSquare } from "@/components/ui";
import { CheckinCard } from "./checkin-card";
import { QuickAdd } from "../gastos/quick-add";
import { CategoryTag, PriorityTag } from "../plan/plan-ui";

const WD = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

/** "$ 1,2 k" para que entre en una celda chica. */
function compact(cents: number) {
  const v = cents / 100;
  if (v < 1000) return `$${Math.round(v)}`;
  return `$${(v / 1000).toLocaleString("es-UY", { maximumFractionDigits: v < 10000 ? 1 : 0 })}k`;
}

function pct(a: number, b: number) {
  return b === 0 ? 0 : Math.round((a / b) * 100);
}

export function InicioView({ d }: { d: Dashboard }) {
  const prevName = formatMonth(shiftMonth(d.gastos.month, -1)).split(" ")[0];
  const delta = d.gastos.spentPrevSame ? (d.gastos.spentMonth - d.gastos.spentPrevSame) / d.gastos.spentPrevSame : null;

  return (
    <>
      <PageHeader
        title={`${greeting(d.hour)}, Facu`}
        kicker={formatLong(d.today)}
        wide
        actions={
          <div className="flex gap-1.5">
            <HeaderLink href="/semana" label="Revisión semanal" icon={ClipboardText} highlight={weekday(d.today) === 0 || weekday(d.today) === 1} />
            <HeaderLink href="/analisis" label="Análisis" icon={ChartLineUp} />
          </div>
        }
      />
      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-4 px-4 pt-2 pb-16 lg:grid-cols-12 lg:gap-5 lg:px-10 lg:pt-4">
        {/* Resumen del día */}
        <section aria-label="Resumen" className="hero rise relative overflow-hidden rounded-[22px] p-5 lg:col-span-12 lg:p-7">
          <p className="hero-sub max-w-2xl text-[15px] leading-relaxed lg:text-[17px]">
            <Summary d={d} />
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2.5 lg:mt-7 lg:grid-cols-4 lg:gap-3">
            <Kpi
              href="/habitos"
              icon={Medal}
              color="var(--c-habitos)"
              label="Hábitos hoy"
              value={`${d.habits.doneToday}/${d.habits.dueToday}`}
              sub={d.habits.best ? `Mejor racha: ${d.habits.best.name} (${d.habits.best.streak})` : "Sin rachas en curso"}
            />
            <Kpi
              href="/journal"
              icon={Notebook}
              color="var(--c-journal)"
              label="Racha de journal"
              value={`${d.journal.streak} ${d.journal.streak === 1 ? "día" : "días"}`}
              sub={d.journal.wroteToday ? "Hoy ya escribiste" : "Hoy todavía no escribiste"}
            />
            <Kpi
              href="/gastos/informes"
              icon={Wallet}
              color="var(--c-gastos)"
              label={`Gastado en ${formatMonth(d.gastos.month).split(" ")[0]}`}
              value={moneyCents(d.gastos.spentMonth)}
              sub={
                delta === null
                  ? "Sin datos del mes anterior"
                  : `${delta > 0 ? "+" : "−"}${Math.abs(Math.round(delta * 100))}% vs. ${prevName} a esta altura`
              }
            />
            <Kpi
              href="/plan"
              icon={CalendarCheck}
              color="var(--c-plan)"
              label="Plan de la semana"
              value={`${d.plan.weekDone} de ${d.plan.weekTotal}`}
              sub={`${pct(d.plan.weekDone, d.plan.weekTotal)}% de los bloques hechos`}
            />
          </div>
        </section>

        <CheckinCard today={d.checkin.today} yesterday={d.checkin.yesterday} lastWeightG={d.checkin.lastWeightG} />
        <HabitsToday d={d} />
        <PlanToday d={d} />
        <WeekMix d={d} />
        <GastosCard d={d} delta={delta} prevName={prevName} />
        <JournalCard d={d} />
        <Constancia d={d} />
      </main>
    </>
  );
}

/** Acceso en la cabecera; el domingo y el lunes la revisión semanal se destaca. */
function HeaderLink({ href, label, icon: Ico, highlight }: { href: string; label: string; icon: Icon; highlight?: boolean }) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex h-10 items-center gap-2 rounded-full px-3 text-[13px] font-medium transition-colors",
        highlight ? "bg-ink text-on-ink hover:opacity-90" : "border border-line-strong text-muted hover:bg-surface-2 hover:text-fg",
      )}
    >
      <Ico size={16} aria-hidden />
      <span className="hidden sm:inline">{label}</span>
    </Link>
  );
}

function Summary({ d }: { d: Dashboard }) {
  const parts: string[] = [];
  const { doneToday, dueToday } = d.habits;
  const skipped = d.habits.skippedToday;
  if (dueToday) {
    parts.push(
      (doneToday === dueToday
        ? `Completaste ${dueToday === 1 ? "el hábito" : `los ${dueToday} hábitos`} de hoy`
        : `Llevás ${doneToday} de ${dueToday} ${dueToday === 1 ? "hábito" : "hábitos"} de hoy`) +
        (skipped ? ` (${skipped} salteados)` : ""),
    );
  } else if (skipped) {
    parts.push(`Hoy salteaste ${skipped === 1 ? "el único hábito" : `los ${skipped} hábitos`}`);
  }
  const pending = d.plan.today.filter((b) => !b.done && !isFreeBlock(b)).length;
  if (d.plan.today.length) parts.push(pending ? `te quedan ${pending} bloques en el plan` : "el plan de hoy está hecho");
  const weekSpent = d.week.reduce((n, w) => n + w.spentCents, 0);
  parts.push(`esta semana gastaste ${moneyCents(weekSpent)}`);
  const s = parts.join(", ").replace(/, ([^,]*)$/, " y $1");
  return (
    <>
      {s.charAt(0).toUpperCase() + s.slice(1)}.
      {!d.journal.wroteToday && " Todavía no escribiste en el journal."}
    </>
  );
}

function Kpi({
  href,
  icon: Ico,
  color,
  label,
  value,
  sub,
}: {
  href: string;
  icon: Icon;
  color: string;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <Link
      href={href}
      className="group grid content-start gap-2 rounded-2xl bg-white/10 p-3.5 ring-1 ring-white/10 transition-[background-color,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-white/15 active:scale-[0.98] lg:p-4"
    >
      <span className="flex items-center gap-2 text-[12px] font-medium opacity-85">
        <span className="inline-flex size-6 items-center justify-center rounded-full bg-white/90" style={{ color }}>
          <Ico size={14} weight="fill" aria-hidden />
        </span>
        <span className="truncate">{label}</span>
        <ArrowUpRight
          size={14}
          aria-hidden
          className="ml-auto shrink-0 opacity-0 transition-[opacity,transform] duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-80"
        />
      </span>
      <span className="figure text-[26px] lg:text-[32px]">{value}</span>
      <span className="hero-sub line-clamp-2 text-[12px] leading-snug">{sub}</span>
    </Link>
  );
}

function Card({
  title,
  href,
  hrefLabel,
  color,
  className,
  children,
  i = 0,
}: {
  title: string;
  href?: string;
  hrefLabel?: string;
  color: string;
  className?: string;
  children: React.ReactNode;
  i?: number;
}) {
  return (
    <section
      aria-label={title}
      style={{ "--i": i } as React.CSSProperties}
      className={cx("rise grid min-w-0 content-start gap-4 rounded-[20px] border border-line bg-surface p-4 lg:p-5", className)}
    >
      <header className="flex items-center gap-2">
        <span aria-hidden className="size-2 rounded-full" style={{ background: color }} />
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        {href && (
          <Link
            href={href}
            className="ml-auto inline-flex min-h-9 items-center gap-1 rounded-full px-2.5 text-[13px] text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            {hrefLabel ?? "Ver todo"}
            <ArrowRight size={13} aria-hidden />
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}

// ─── Hábitos de hoy ─────────────────────────────────────────────────────────

type HabitToday = Dashboard["habits"]["today"][number];

function Ring({ value, total, color }: { value: number; total: number; color: string }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const p = total ? value / total : 0;
  return (
    <svg viewBox="0 0 64 64" className="size-16 -rotate-90" aria-hidden>
      <circle cx="32" cy="32" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="6" />
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${c * p} ${c}`}
        className="transition-[stroke-dasharray] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
      />
    </svg>
  );
}

function HabitsToday({ d }: { d: Dashboard }) {
  const [list, setDone] = useOptimistic(d.habits.today, (cur: HabitToday[], u: { id: string; done: boolean }) =>
    cur.map((h) => (h.id === u.id ? { ...h, state: u.done ? ("done" as const) : ("pending" as const) } : h)),
  );
  const [, start] = useTransition();
  const done = list.filter((h) => h.state === "done").length;
  const due = list.filter((h) => h.state !== "skipped").length;

  function toggle(h: HabitToday) {
    const next = h.state !== "done";
    start(async () => {
      setDone({ id: h.id, done: next });
      await setHabitLog(h.id, d.today, next ? "done" : null);
    });
  }

  return (
    <Card title="Hábitos de hoy" href="/habitos" color="var(--c-habitos)" className="lg:col-span-5" i={1}>
      <div className="flex items-center gap-4">
        <div className="relative">
          <Ring value={done} total={due} color="var(--c-habitos)" />
          <span className="figure absolute inset-0 flex items-center justify-center text-[15px]">{pct(done, due)}%</span>
        </div>
        <div className="grid gap-0.5">
          <p className="figure text-[28px]">
            {done}
            <span className="text-muted">/{due}</span>
          </p>
          <p className="text-[13px] text-muted">
            {due === 0 ? "Hoy no toca ninguno" : done === due ? "Día completo" : `Faltan ${due - done}`}
          </p>
        </div>
      </div>
      {list.length > 0 ? (
        <ul className="-mx-1 grid gap-0.5">
          {list.map((h) => {
            const isDone = h.state === "done";
            const content = (
              <>
                <ToneSquare size={32} style={tone(h.color)}>
                  <HabitIcon name={h.icon} size={17} weight="fill" aria-hidden />
                </ToneSquare>
                <span
                  className={cx(
                    "min-w-0 flex-1 truncate text-[14px]",
                    isDone && "text-muted line-through decoration-faint",
                    h.state === "skipped" && "text-muted",
                  )}
                >
                  {h.name}
                  {h.state === "skipped" && <span className="ml-2 text-[12px] text-[var(--st-skip-fg)]">Salteado</span>}
                </span>
                {h.streak > 1 && (
                  <span className="tabular inline-flex items-center gap-0.5 text-[12px] text-muted" title="Racha">
                    <Flame size={13} weight="fill" aria-hidden className="text-[var(--p-orange-solid)]" />
                    {h.streak}
                  </span>
                )}
                <span
                  aria-hidden
                  className={cx(
                    "inline-flex size-7 items-center justify-center rounded-full border-2 transition-colors duration-200",
                    isDone
                      ? "border-[var(--st-done-line)] bg-[var(--st-done-line)] text-white"
                      : h.state === "skipped"
                        ? "border-[var(--st-skip-line)] bg-[var(--st-skip-bg)]"
                        : "border-line-strong",
                  )}
                >
                  {isDone && <Check size={14} weight="bold" />}
                </span>
              </>
            );
            const cls =
              "flex min-h-12 w-full items-center gap-3 rounded-xl px-1.5 text-left transition-colors hover:bg-surface-2";
            return (
              <li key={h.id}>
                {h.quantity ? (
                  <Link href={`/habitos/${h.id}`} className={cls}>
                    {content}
                  </Link>
                ) : (
                  <button type="button" onClick={() => toggle(h)} aria-pressed={isDone} className={cls}>
                    {content}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[14px] text-muted">No hay hábitos para hoy.</p>
      )}
    </Card>
  );
}

// ─── Plan de hoy ────────────────────────────────────────────────────────────

type PlanBlock = Dashboard["plan"]["today"][number];

function PlanToday({ d }: { d: Dashboard }) {
  const [blocks, setDone] = useOptimistic(d.plan.today, (cur: PlanBlock[], u: { id: string; done: boolean }) =>
    cur.map((b) => (b.id === u.id ? { ...b, done: u.done } : b)),
  );
  const [, start] = useTransition();
  const real = blocks.filter((b) => !isFreeBlock(b));
  const doneN = real.filter((b) => b.done).length;

  return (
    <Card title="Plan de hoy" href="/plan" hrefLabel="Ver la semana" color="var(--c-plan)" className="lg:col-span-7" i={2}>
      {real.length > 0 && (
        <div className="grid gap-1.5">
          <div className="flex items-baseline justify-between text-[13px] text-muted">
            <span>
              <span className="figure text-[22px] text-fg">{doneN}</span> de {real.length} bloques hechos
            </span>
            <span className="tabular">{pct(doneN, real.length)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full rounded-full bg-[var(--c-plan)] transition-[width] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
              style={{ width: `${pct(doneN, real.length)}%` }}
            />
          </div>
        </div>
      )}
      {blocks.length > 0 ? (
        <ol className="relative grid gap-1 before:absolute before:top-3 before:bottom-3 before:left-[4.1rem] before:w-px before:bg-line">
          {blocks.map((b) => {
            const free = isFreeBlock(b);
            const range = timeRange(b);
            return (
              <li key={b.id}>
                <button
                  type="button"
                  disabled={free}
                  aria-pressed={b.done}
                  onClick={() =>
                    start(async () => {
                      setDone({ id: b.id, done: !b.done });
                      await setBlockDone(b.id, !b.done);
                    })
                  }
                  className={cx(
                    "relative flex min-h-11 w-full items-center gap-3 rounded-xl py-1 pr-2 text-left transition-colors hover:bg-surface-2 disabled:hover:bg-transparent",
                    free && "opacity-55",
                  )}
                >
                  <span className="tabular w-14 shrink-0 text-right font-mono text-[11.5px] text-muted">
                    {b.startTime ?? "Todo el día"}
                  </span>
                  <span
                    aria-hidden
                    className={cx(
                      "relative z-10 inline-flex size-[18px] shrink-0 items-center justify-center rounded-full border-2 bg-surface transition-colors",
                      b.done ? "border-[var(--c-plan)] bg-[var(--c-plan)] text-white" : "border-line-strong",
                    )}
                  >
                    {b.done && <Check size={10} weight="bold" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cx("block truncate text-[14px]", b.done && "text-muted line-through decoration-faint")}>
                      {b.title}
                    </span>
                    {(range || b.category) && (
                      <span className="flex items-center gap-1.5 text-[12px] text-muted">
                        {range && <span className="tabular">{range}</span>}
                        <CategoryTag category={b.category} />
                      </span>
                    )}
                  </span>
                  <PriorityTag n={b.priority} />
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="text-[14px] text-muted">
          Nada planificado para hoy.{" "}
          <Link href="/plan" className="text-fg underline decoration-line-strong underline-offset-4">
            Armar el día
          </Link>
        </p>
      )}
      {real.length < 3 && d.plan.upcoming.length > 0 && (
        <div className="grid gap-1.5 border-t border-line pt-3">
          <p className="kicker">Lo que viene esta semana</p>
          <ul className="grid gap-1">
            {d.plan.upcoming.map((b) => (
              <li key={b.id} className="flex min-h-9 items-center gap-2 text-[14px]">
                <span className="tabular w-20 shrink-0 text-[12px] text-muted">
                  {WD[weekday(b.date)]} {Number(b.date.slice(8))}
                  {b.startTime ? ` · ${b.startTime}` : ""}
                </span>
                <Link href={`/plan?semana=${b.date}`} className="min-w-0 truncate hover:underline">
                  {b.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {d.plan.dueTasks.length > 0 && (
        <div className="grid gap-1.5 border-t border-line pt-3">
          <p className="kicker">Deadlines cerca</p>
          <ul className="grid gap-1">
            {d.plan.dueTasks.map((t) => (
              <li key={t.id} className="flex min-h-9 items-center gap-2 text-[14px]">
                <span
                  className={cx(
                    "tabular w-20 shrink-0 rounded-full px-2 py-0.5 text-center text-[11.5px] font-medium",
                    t.left < 0
                      ? "bg-[var(--st-fail-bg)] text-[var(--st-fail-fg)]"
                      : t.left <= 1
                        ? "bg-[var(--st-skip-bg)] text-[var(--st-skip-fg)]"
                        : "bg-surface-2 text-muted",
                  )}
                >
                  {daysLeftLabel(t.left)}
                </span>
                <Link href="/plan#tareas" className="min-w-0 truncate hover:underline">
                  {t.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

// ─── La semana con los cuatro módulos ───────────────────────────────────────

function WeekMix({ d }: { d: Dashboard }) {
  const maxSpent = Math.max(1, ...d.week.map((w) => w.spentCents));
  const rows: { label: string; color: string; href: string; cell: (w: Dashboard["week"][number], future: boolean) => React.ReactNode; aria: (w: Dashboard["week"][number]) => string }[] = [
    {
      label: "Hábitos",
      color: "var(--c-habitos)",
      href: "/habitos",
      aria: (w) => (w.habitsDue ? `${w.habitsDone} de ${w.habitsDue} hábitos` : "sin hábitos"),
      cell: (w, future) => {
        if (future || !w.habitsDue) return <Dash />;
        const p = pct(w.habitsDone, w.habitsDue);
        return (
          <span className="grid w-full justify-items-center gap-1">
            <span
              className="flex size-10 items-center justify-center rounded-full text-[11px] font-semibold tabular"
              style={{
                background: `color-mix(in oklab, var(--c-habitos) ${Math.max(8, p)}%, var(--surface-2))`,
                color: p >= 55 ? "white" : "var(--text)",
              }}
            >
              {p}%
            </span>
          </span>
        );
      },
    },
    {
      label: "Journal",
      color: "var(--c-journal)",
      href: "/journal/calendario",
      aria: (w) => (w.wrote ? "escribiste" : "sin escribir"),
      cell: (w, future) =>
        future ? (
          <Dash />
        ) : (
          <span
            className={cx(
              "inline-flex size-6 items-center justify-center rounded-full",
              w.wrote ? "bg-[var(--c-journal)] text-white" : "border-2 border-dashed border-line-strong",
            )}
          >
            {w.wrote && <NotePencil size={12} weight="bold" aria-hidden />}
          </span>
        ),
    },
    {
      label: "Gastos",
      color: "var(--c-gastos)",
      href: "/gastos",
      aria: (w) => `gastaste ${moneyCents(w.spentCents)}`,
      cell: (w, future) =>
        future ? (
          <Dash />
        ) : (
          <span className="grid w-full justify-items-center gap-1">
            <span className="flex h-9 w-3 items-end overflow-hidden rounded-full bg-surface-2">
              <span
                className="w-full rounded-full bg-[var(--c-gastos)]"
                style={{ height: `${w.spentCents ? Math.max(8, (w.spentCents / maxSpent) * 100) : 0}%` }}
              />
            </span>
            <span className="tabular text-[10.5px] text-muted">{w.spentCents ? compact(w.spentCents) : "$0"}</span>
          </span>
        ),
    },
    {
      label: "Plan",
      color: "var(--c-plan)",
      href: "/plan",
      aria: (w) => (w.blocksTotal ? `${w.blocksDone} de ${w.blocksTotal} bloques` : "sin bloques"),
      cell: (w) =>
        w.blocksTotal ? (
          <span className="tabular text-[12.5px]">
            <span className="font-semibold">{w.blocksDone}</span>
            <span className="text-muted">/{w.blocksTotal}</span>
          </span>
        ) : (
          <Dash />
        ),
    },
  ];

  return (
    <Card title="Tu semana" color="var(--mod-inicio)" className="lg:col-span-12" i={3}>
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[18rem] table-fixed border-separate border-spacing-y-1 text-center">
          <caption className="sr-only">Hábitos, journal, gastos y plan por día de esta semana</caption>
          <thead>
            <tr>
              <th className="w-[4.25rem] lg:w-28" />
              {d.week.map((w) => {
                const isToday = w.date === d.today;
                return (
                  <th key={w.date} scope="col" className="pb-1 font-normal">
                    <span
                      className={cx(
                        "inline-grid min-w-9 justify-items-center rounded-xl px-1 py-1",
                        isToday && "bg-ink text-on-ink",
                      )}
                    >
                      <span className={cx("text-[11px]", isToday ? "opacity-80" : "text-muted")}>{WD[weekday(w.date)]}</span>
                      <span className="figure text-[15px]">{Number(w.date.slice(8))}</span>
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <th scope="row" className="text-left font-normal">
                  <Link href={r.href} className="inline-flex min-h-11 items-center gap-1.5 text-[13px] hover:underline">
                    <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: r.color }} />
                    {r.label}
                  </Link>
                </th>
                {d.week.map((w) => (
                  <td
                    key={w.date}
                    aria-label={`${formatShort(w.date)}: ${r.aria(w)}`}
                    className={cx("h-14 align-middle", w.date === d.today && "bg-[color-mix(in_oklab,var(--accent)_7%,transparent)]")}
                  >
                    <span className="flex items-center justify-center">{r.cell(w, w.date > d.today)}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Dash() {
  return <span aria-hidden className="h-0.5 w-3 rounded-full bg-line-strong" />;
}

// ─── Gastos ─────────────────────────────────────────────────────────────────

function GastosCard({ d, delta, prevName }: { d: Dashboard; delta: number | null; prevName: string }) {
  const g = d.gastos;
  const maxCat = Math.max(1, ...g.topCategories.map((c) => c.cents));
  const monthName = formatMonth(g.month).split(" ")[0];
  return (
    <Card title="Gastos del mes" href="/gastos/informes" hrefLabel="Informes" color="var(--c-gastos)" className="lg:col-span-7" i={4}>
      <QuickAdd accounts={g.quickAccounts} />
      {g.budgetAlerts.length > 0 && (
        <ul className="grid gap-1.5" aria-label="Avisos de presupuesto">
          {g.budgetAlerts.slice(0, 3).map((a) => (
            <li key={a.categoryId}>
              <Link
                href="/gastos/presupuestos"
                className={cx(
                  "flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] transition-opacity hover:opacity-85",
                  a.state === "over" ? "bg-[var(--st-fail-bg)] text-[var(--st-fail-fg)]" : "bg-[var(--st-skip-bg)] text-[var(--st-skip-fg)]",
                )}
              >
                <FinanceIcon name={a.icon} size={15} weight="fill" aria-hidden />
                <span className="min-w-0 flex-1 truncate">
                  <strong className="font-semibold">{a.name}</strong>:{" "}
                  {a.state === "over"
                    ? `te pasaste ${moneyCents(a.spentCents - a.amountCents, a.currency)}`
                    : a.state === "near"
                      ? `quedan ${moneyCents(a.amountCents - a.spentCents, a.currency)}`
                      : "vas más rápido que el mes"}
                </span>
                <span className="tabular shrink-0 opacity-80">
                  {Math.round((a.spentCents / a.amountCents) * 100)}%
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <div>
          <p className="kicker">Gastado en {monthName} (en pesos)</p>
          <p className="figure mt-1 text-[34px]">{moneyCents(g.spentMonth)}</p>
        </div>
        {delta !== null && (
          <p
            className={cx(
              "mb-1 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12.5px] font-medium",
              delta > 0 ? "bg-[var(--st-fail-bg)] text-[var(--st-fail-fg)]" : "bg-[var(--st-done-bg)] text-[var(--st-done-fg)]",
            )}
          >
            {delta > 0 ? <ArrowUpRight size={13} weight="bold" aria-hidden /> : <ArrowDownRight size={13} weight="bold" aria-hidden />}
            {Math.abs(Math.round(delta * 100))}% vs. {prevName} al mismo día
          </p>
        )}
        <div className="mb-1 ml-auto text-right text-[13px] text-muted">
          Ingresos <span className="tabular font-medium text-fg">{moneyCents(g.incomeMonth)}</span>
        </div>
      </div>
      <SpendChart cumThis={g.cumThis} cumPrev={g.cumPrev} monthName={monthName} prevName={prevName} />
      <div className="grid gap-5 border-t border-line pt-4 sm:grid-cols-[1.4fr_1fr]">
        <div className="grid content-start gap-2">
          <p className="kicker">En qué se fue</p>
          {g.topCategories.length === 0 && <p className="text-[14px] text-muted">Sin gastos este mes.</p>}
          <ul className="grid gap-2">
            {g.topCategories.map((c) => (
              <li key={c.id ?? "none"} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2.5 gap-y-1">
                <ToneSquare size={26} style={tone(c.color)}>
                  <FinanceIcon name={c.icon} size={14} weight="fill" aria-hidden />
                </ToneSquare>
                <span className="truncate text-[13.5px]">{c.name}</span>
                <span className="tabular text-[13px]">{moneyCents(c.cents)}</span>
                <span className="col-start-2 col-end-4 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${(c.cents / maxCat) * 100}%`, background: "var(--c-gastos)" }}
                  />
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="grid content-start gap-2">
          <p className="kicker">Saldo total</p>
          {Object.entries(g.balances)
            .sort(([a], [b]) => (a === "UYU" ? -1 : b === "UYU" ? 1 : a.localeCompare(b)))
            .map(([cur, cents]) => (
              <p key={cur} className={cx("figure text-[24px]", cents < 0 && "text-danger")}>
                {cents < 0 ? "−" : ""}
                {money(Math.abs(cents) / 100, cur)}
              </p>
            ))}
          {Object.keys(g.balances).length > 1 && (
            <p className="text-[12.5px] text-muted">
              Todo junto: <span className="tabular font-medium text-fg">{moneyCents(g.netWorth)}</span>
              {g.usdRate ? ` (US$ 1 = ${moneyCents(Math.round(g.usdRate * 100))})` : ""}
            </p>
          )}
          <Link href="/gastos/cuentas" className="text-[13px] text-muted hover:text-fg hover:underline">
            Ver cuentas
          </Link>
        </div>
      </div>
    </Card>
  );
}

/** Gasto acumulado del mes contra el mes anterior, día a día. */
function SpendChart({
  cumThis,
  cumPrev,
  monthName,
  prevName,
}: {
  cumThis: number[];
  cumPrev: number[];
  monthName: string;
  prevName: string;
}) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const W = 600;
  const H = 150;
  const days = Math.max(cumPrev.length, 31);
  const max = Math.max(1, ...cumThis, ...cumPrev);
  const x = (i: number) => (i / (days - 1)) * W;
  const y = (v: number) => H - 6 - (v / max) * (H - 18);
  const path = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const area = cumThis.length ? `${path(cumThis)}L${x(cumThis.length - 1)},${H}L0,${H}Z` : "";
  const last = cumThis.length - 1;
  const focus = hover ?? last;
  const readout =
    focus >= 0
      ? `Día ${focus + 1}: ${monthName} ${cumThis[focus] !== undefined ? moneyCents(cumThis[focus]) : "–"}, ${prevName} ${
          cumPrev[focus] !== undefined ? moneyCents(cumPrev[focus]) : "–"
        }`
      : "";

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left) / r.width) * (days - 1));
    setHover(Math.max(0, Math.min(days - 1, i)));
  }
  function onKey(e: React.KeyboardEvent) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setHover((h) => Math.max(0, Math.min(days - 1, (h ?? last) + (e.key === "ArrowRight" ? 1 : -1))));
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-4 rounded-full bg-[var(--c-gastos)]" />
          {monthName}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-4 rounded-full border-t-2 border-dashed border-faint" />
          {prevName}
        </span>
        <span className="tabular ml-auto" aria-live="polite">
          {readout}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-36 w-full touch-none overflow-visible outline-none focus-visible:rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]"
        role="img"
        aria-label={`Gasto acumulado de ${monthName} contra ${prevName}. Usá las flechas para recorrer los días.`}
        tabIndex={0}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        onKeyDown={onKey}
      >
        <defs>
          <linearGradient id={`${id}-g`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--c-gastos)" stopOpacity="0.28" />
            <stop offset="1" stopColor="var(--c-gastos)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.5, 1].map((f) => (
          <line key={f} x1="0" x2={W} y1={y(max * f)} y2={y(max * f)} stroke="var(--border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={path(cumPrev)} fill="none" stroke="var(--faint)" strokeWidth="1.5" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        {area && <path d={area} fill={`url(#${id}-g)`} />}
        <path d={path(cumThis)} fill="none" stroke="var(--c-gastos)" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {focus >= 0 && (
          <line x1={x(focus)} x2={x(focus)} y1="0" y2={H} stroke="var(--border-strong)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {/* Puntos como HTML para que no se deformen con el SVG estirado. */}
      <div className="relative -mt-[9.5rem] h-36 pointer-events-none" aria-hidden>
        {focus >= 0 && cumThis[focus] !== undefined && (
          <span
            className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-[var(--c-gastos)]"
            style={{ left: `${(x(focus) / W) * 100}%`, top: `${(y(cumThis[focus]) / H) * 100}%` }}
          />
        )}
        {focus >= 0 && cumPrev[focus] !== undefined && (
          <span
            className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-faint"
            style={{ left: `${(x(focus) / W) * 100}%`, top: `${(y(cumPrev[focus]) / H) * 100}%` }}
          />
        )}
      </div>
      <details className="text-sm">
        <summary className="kicker inline-flex min-h-11 cursor-pointer items-center select-none hover:text-fg">Ver como tabla</summary>
        <div className="mt-1 max-h-64 overflow-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-1.5 font-normal">Día</th>
                <th className="py-1.5 text-right font-normal first-letter:uppercase">{monthName}</th>
                <th className="py-1.5 text-right font-normal first-letter:uppercase">{prevName}</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {Array.from({ length: Math.max(cumThis.length, cumPrev.length) }, (_, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="py-1">{i + 1}</td>
                  <td className="py-1 text-right">{cumThis[i] !== undefined ? moneyCents(cumThis[i]) : ""}</td>
                  <td className="py-1 text-right">{cumPrev[i] !== undefined ? moneyCents(cumPrev[i]) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

// ─── Journal ────────────────────────────────────────────────────────────────

function JournalCard({ d }: { d: Dashboard }) {
  const j = d.journal;
  return (
    <Card title="Journal" href="/journal" hrefLabel="Entradas" color="var(--c-journal)" className="lg:col-span-5" i={5}>
      <div className="grid grid-cols-3 gap-2">
        <Stat value={j.streak} label={j.streak === 1 ? "día de racha" : "días de racha"} />
        <Stat value={j.monthWritten} label="días este mes" />
        <Stat value={j.total} label="días escritos" />
      </div>
      {j.last && (
        <Link
          href={`/journal/${j.last.id}`}
          className="group grid gap-1.5 rounded-2xl bg-surface-2 p-4 transition-colors hover:bg-surface-3"
        >
          <span className="kicker">
            Última entrada · {j.last.date === d.today ? "hoy" : formatShort(j.last.date)}
          </span>
          {j.last.title && <span className="font-semibold">{j.last.title}</span>}
          <span className="line-clamp-4 text-[14px] leading-relaxed text-muted">{j.last.excerpt}</span>
        </Link>
      )}
      <form action={writeOnDay.bind(null, undefined, false)}>
        <button
          type="submit"
          className="group inline-flex h-12 w-full items-center justify-between gap-2 rounded-full bg-ink pr-1.5 pl-5 text-[14px] font-medium text-on-ink transition-[opacity,transform] duration-200 hover:opacity-90 active:scale-[0.98]"
        >
          {j.wroteToday ? "Seguir escribiendo hoy" : "Escribir hoy"}
          <span className="inline-flex size-9 items-center justify-center rounded-full bg-white/15 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-0.5">
            <NotePencil size={17} aria-hidden />
          </span>
        </button>
      </form>
    </Card>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="grid gap-0.5 rounded-xl bg-surface-2 px-3 py-2.5">
      <span className="figure text-[24px]">{value}</span>
      <span className="text-[11.5px] leading-tight text-muted">{label}</span>
    </div>
  );
}

// ─── Constancia: hábitos y journal, últimas semanas ─────────────────────────

const RAMP_STEPS = [0, 22, 45, 70, 100];

function Constancia({ d }: { d: Dashboard }) {
  const habitByDay = new Map(d.habits.history.map((h) => [h.date, h]));
  const wrote = new Set(d.journal.days);
  const weeks = Math.ceil((daysBetween(d.heatFrom, d.today) + 1) / 7);
  const habitDays = d.habits.history.filter((h) => h.due > 0);
  const habitAvg = habitDays.length ? Math.round((habitDays.reduce((n, h) => n + h.done / h.due, 0) / habitDays.length) * 100) : 0;
  const wroteN = d.journal.days.length;

  return (
    <Card title="Constancia" color="var(--mod-inicio)" className="lg:col-span-12" i={6}>
      <p className="-mt-2 text-[13px] text-muted">Últimas {weeks} semanas. Cada cuadrito es un día.</p>
      <div className="grid gap-6 lg:grid-cols-2 lg:gap-10">
        <Heat
          title="Hábitos"
          summary={`${habitAvg}% de cumplimiento promedio`}
          color="var(--c-habitos)"
          from={d.heatFrom}
          today={d.today}
          level={(iso) => {
            const h = habitByDay.get(iso);
            if (!h || h.due === 0) return -1;
            const p = h.done / h.due;
            return p === 0 ? 0 : p < 0.34 ? 1 : p < 0.67 ? 2 : p < 1 ? 3 : 4;
          }}
          label={(iso) => {
            const h = habitByDay.get(iso);
            return h && h.due ? `${h.done} de ${h.due} hábitos (${pct(h.done, h.due)}%)` : "no tocaba ninguno";
          }}
          legend={["0%", "100%"]}
        />
        <Heat
          title="Journal"
          summary={`Escribiste ${wroteN} de ${daysBetween(d.heatFrom, d.today) + 1} días`}
          color="var(--c-journal)"
          from={d.heatFrom}
          today={d.today}
          level={(iso) => (wrote.has(iso) ? 4 : 0)}
          label={(iso) => (wrote.has(iso) ? "escribiste" : "sin escribir")}
          legend={["Sin escribir", "Escribiste"]}
          binary
        />
      </div>
      <details className="text-sm">
        <summary className="kicker inline-flex min-h-11 cursor-pointer items-center select-none hover:text-fg">Ver como tabla</summary>
        <div className="mt-1 max-h-64 overflow-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-1.5 font-normal">Semana del</th>
                <th className="py-1.5 text-right font-normal">Hábitos</th>
                <th className="py-1.5 text-right font-normal">Días escritos</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {Array.from({ length: weeks }, (_, w) => {
                const first = addDays(d.heatFrom, w * 7);
                const ds = Array.from({ length: 7 }, (_, i) => addDays(first, i)).filter((x) => x <= d.today);
                let done = 0;
                let due = 0;
                for (const x of ds) {
                  done += habitByDay.get(x)?.done ?? 0;
                  due += habitByDay.get(x)?.due ?? 0;
                }
                return { first, done, due, wrote: ds.filter((x) => wrote.has(x)).length, n: ds.length };
              })
                .reverse()
                .map((r) => (
                  <tr key={r.first} className="border-t border-line">
                    <td className="py-1">{formatShort(r.first)}</td>
                    <td className="py-1 text-right">{r.due ? `${pct(r.done, r.due)}%` : "–"}</td>
                    <td className="py-1 text-right">
                      {r.wrote} de {r.n}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </details>
    </Card>
  );
}

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

function Heat({
  title,
  summary,
  color,
  from,
  today,
  level,
  label,
  legend,
  binary,
}: {
  title: string;
  summary: string;
  color: string;
  from: string;
  today: string;
  /** -1 = no aplica, 0 a 4 = intensidad. */
  level: (iso: string) => number;
  label: (iso: string) => string;
  legend: [string, string];
  binary?: boolean;
}) {
  const [focus, setFocus] = useState<string | null>(null);
  const total = daysBetween(from, today) + 1;
  const cols = Math.ceil(total / 7);
  const bg = (l: number) =>
    l < 0 ? "transparent" : l === 0 ? "var(--surface-2)" : `color-mix(in oklab, ${color} ${RAMP_STEPS[l]}%, var(--surface-2))`;
  const days = Array.from({ length: cols * 7 }, (_, i) => addDays(from, i));

  return (
    <div className="grid content-start gap-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="flex items-center gap-1.5 text-[14px] font-semibold">
          <span aria-hidden className="size-2 rounded-full" style={{ background: color }} />
          {title}
        </h3>
        <p className="tabular min-h-5 text-[12.5px] text-muted" aria-live="polite">
          {focus ? `${formatShort(focus)}: ${label(focus)}` : summary}
        </p>
      </div>
      <div className="grid grid-cols-[1.75rem_1fr] gap-1.5">
        <div className="grid grid-rows-7 gap-[3px] text-[10px] text-muted" aria-hidden>
          {["L", "", "M", "", "V", "", "D"].map((l, i) => (
            <span key={i} className="flex items-center leading-none">
              {l}
            </span>
          ))}
        </div>
        <div
          className="grid grid-flow-col grid-rows-7 gap-[3px]"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          role="list"
          aria-label={`${title}: ${summary}`}
        >
          {days.map((iso) => {
            if (iso > today) return <span key={iso} aria-hidden className="aspect-square" />;
            const l = level(iso);
            return (
              <span
                key={iso}
                role="listitem"
                tabIndex={0}
                aria-label={`${formatShort(iso)}: ${label(iso)}`}
                onPointerEnter={() => setFocus(iso)}
                onPointerLeave={() => setFocus((f) => (f === iso ? null : f))}
                onFocus={() => setFocus(iso)}
                onBlur={() => setFocus((f) => (f === iso ? null : f))}
                className={cx(
                  "aspect-square rounded-[3px] outline-none transition-transform duration-150 hover:scale-125 focus-visible:scale-125 focus-visible:shadow-[0_0_0_2px_var(--text)] motion-reduce:hover:scale-100",
                  l < 0 && "border border-dashed border-line",
                  iso === today && "shadow-[0_0_0_1.5px_var(--text)]",
                )}
                style={{ background: bg(l) }}
              />
            );
          })}
        </div>
      </div>
      <div className="flex items-center justify-end gap-1.5 text-[11.5px] text-muted" aria-hidden>
        {legend[0]}
        {(binary ? [0, 4] : [0, 1, 2, 3, 4]).map((l) => (
          <span key={l} className="size-3 rounded-[3px]" style={{ background: bg(l) }} />
        ))}
        {legend[1]}
      </div>
    </div>
  );
}
