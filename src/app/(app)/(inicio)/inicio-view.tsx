"use client";

import { useSafeTransition } from "@/components/safe-action";
import { QuoteCard } from "./quote-card";
import type { ValueNote } from "@/lib/values";
import { HabitDayRows, useJustCompleted, useStickyDay } from "../habitos/day-rows";
import { DaySheet, useHabitLogs, useHabitOrder, type DaySheetHandle } from "../habitos/habit-ui";
import { dayProgress } from "@/lib/habit-logic";
import { showsOn } from "@/lib/habit-logic";
import Link from "next/link";
import { useEffect, useId, useOptimistic, useRef, useState, useSyncExternalStore } from "react";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarCheck,
  ChartLineUp,
  Check,
  ClipboardText,
  CreditCard,
  Medal,
  Note,
  NotePencil,
  Notebook,
  PiggyBank,
  PlayCircle,
  Plus,
  Wallet,
  WarningCircle,
  type Icon,
} from "@phosphor-icons/react";
import type { Dashboard } from "@/lib/dashboard";
import { addDays, dayOfInstant, formatLong, formatMonth, formatShort as formatShortRaw, shiftMonth, weekday } from "@/lib/dates";
import { greeting } from "@/lib/journal-logic";
import { FinanceIcon } from "@/lib/finance-icons";
import { tone } from "@/lib/palette";
import { dec1, money, moneyCents, shortNumber } from "@/lib/format";
import { daysLeftLabel, isFreeBlock, timeRange } from "@/lib/plan-logic";
import { setBlockDone } from "@/lib/offline/plan";
import { writeOnDay } from "@/lib/offline/journal";
import { MenuButton } from "@/components/shell";
import "./inicio.css";
import { cx, ToneSquare } from "@/components/ui";
import { useTick } from "@/components/motion";
import { StatTile, TintedCard } from "@/components/tinted-card";
import { CheckinCard } from "./checkin-card";
import { QuickAdd } from "../gastos/quick-add";
import { CategoryTag, PriorityTag } from "../plan/plan-ui";
import { noteDomain, noteHeading, relativeDay, sectionOf, type NoteDTO } from "@/lib/notes-logic";

export type NotesSummary = { latest: NoteDTO[]; laterVideos: number };

const WD = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

/** "$ 1,2 k" para que entre en una celda chica (un día con más reintegros que gastos, con "−"). */
function compact(cents: number) {
  const sign = cents < 0 ? "−" : "";
  const v = Math.abs(cents) / 100;
  if (v < 1000) return `${sign}${Math.round(v)}`;
  return `${sign}${shortNumber(v)}`;
}

/** "+12%", "−8%" o "Igual que" cuando no cambia (antes salía "−0%"). */
function deltaLabel(delta: number, rest: string) {
  const p = Math.round(delta * 100);
  if (p === 0) return `Igual que ${rest}`;
  return `${p > 0 ? "+" : "−"}${Math.abs(p)}% vs. ${rest}`;
}

/** "9 oct" guardado por día: la constancia lo pide para ~250 días en cada dibujo (al volver la página revalidada). */
const shortCache = new Map<string, string>();
function formatShort(iso: string) {
  let v = shortCache.get(iso);
  if (v === undefined) shortCache.set(iso, (v = formatShortRaw(iso)));
  return v;
}

function pct(a: number, b: number) {
  return b === 0 ? 0 : Math.round((a / b) * 100);
}

/** "octubre" de "2026-10". */
function monthName(month: string) {
  return formatMonth(month).split(" ")[0];
}

/** "19 al 25 de octubre" (o "29 sep al 5 oct" si cruza de mes). */
function rangeLabel(from: string, to: string) {
  if (from.slice(0, 7) === to.slice(0, 7)) return `${Number(from.slice(8))} al ${Number(to.slice(8))} de ${monthName(to.slice(0, 7))}`;
  return `${formatShort(from)} al ${formatShort(to)}`;
}

/** Meses de reserva (`getReserve`): saldo personal en pesos / gasto promedio de 3 meses. */
export type ReserveSummary = { months: number | null; prevMonths: number | null };

// ─── Avance de hábitos de hoy, compartido con la cifra de arriba ────────────
// La lista de hábitos tiene sus marcas optimistas; la cifra "Hábitos hoy" las sigue por
// este almacén chico, así un toque vuelve a dibujar la lista y la cifra, no todo Inicio.

type Progress = { done: number; total: number };
type ProgressStore = { get: () => Progress; set: (p: Progress) => void; subscribe: (f: () => void) => () => void };

function progressStore(initial: Progress): ProgressStore {
  let value = initial;
  const subs = new Set<() => void>();
  return {
    get: () => value,
    set: (p) => {
      if (p.done === value.done && p.total === value.total) return;
      value = p;
      subs.forEach((f) => f());
    },
    subscribe: (f) => {
      subs.add(f);
      return () => {
        subs.delete(f);
      };
    },
  };
}

export function InicioView({
  d,
  notes,
  reserve,
  latestNotes,
}: {
  d: Dashboard;
  notes: ValueNote[];
  reserve: ReserveSummary;
  latestNotes: NotesSummary;
}) {
  const prevName = monthName(shiftMonth(d.gastos.month, -1));
  const delta = d.gastos.spentPrevSame ? (d.gastos.spentMonth - d.gastos.spentPrevSame) / d.gastos.spentPrevSame : null;
  const [habitProgress] = useState(() => progressStore({ done: d.habits.doneToday, total: d.habits.dueToday }));

  const title = `${greeting(d.hour)}, Facu`;
  const highlight = weekday(d.today) === 0 || weekday(d.today) === 1;

  return (
    <>
      <CompactBar title={title}>
        <div className="flex gap-1.5">
          <HeaderLink href="/semana" label="Revisión semanal" icon={ClipboardText} highlight={highlight} compact />
          <HeaderLink href="/analisis" label="Análisis" icon={ChartLineUp} compact />
        </div>
      </CompactBar>
      {/* Bento de 12 columnas (compu) o una columna (celular, con `order` para el orden del diseño). */}
      <main className="ini-bento mx-auto grid max-w-6xl grid-cols-1 gap-3.5 px-4 pt-[calc(env(safe-area-inset-top)+0.375rem)] pb-14 lg:grid-cols-12 lg:gap-5 lg:px-10 lg:pt-9 lg:pb-18">
        {d.backup && (
          <Link
            href="/datos"
            className="flex items-center gap-2.5 rounded-2xl bg-[var(--st-fail-bg)] px-4 py-3 text-[13.5px] text-[var(--st-fail-fg)] transition-opacity hover:opacity-85 max-lg:order-first lg:col-span-12"
          >
            <WarningCircle size={18} weight="fill" className="shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">{d.backup} Revisalo en Datos.</span>
          </Link>
        )}

        {/* Fila 1: saludo y nota del día. */}
        <div className="flex min-w-0 flex-col justify-center gap-1.5 pb-1 max-lg:order-1 lg:col-span-5 lg:gap-2.5 lg:px-1 lg:pt-1.5 lg:pb-2">
          <div className="flex items-center gap-2 max-lg:-ml-0.5">
            <MenuButton />
            <p className="kicker truncate">{formatLong(d.today)}</p>
          </div>
          <h1 className="display text-[32px] leading-[1.02] font-[750] tracking-[-0.04em] lg:text-[36px] xl:text-[44px]">{title}</h1>
          <p className="max-w-[30rem] text-[15px] leading-normal text-pretty text-muted lg:text-[16px]">
            <Summary d={d} />
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5 lg:mt-2">
            <HeaderLink href="/semana" label="Revisión semanal" icon={ClipboardText} highlight={highlight} />
            <HeaderLink href="/analisis" label="Análisis" icon={ChartLineUp} />
          </div>
        </div>
        <QuoteCard day={d.today} hour={d.hour} notes={notes} className="max-lg:order-2 lg:col-span-7" />

        {/* Fila 2: las cinco cifras. */}
        <section aria-label="Resumen" className="grid grid-cols-2 gap-2.5 max-lg:order-3 lg:col-span-12 lg:grid-cols-6 lg:gap-4 xl:grid-cols-5">
          <HabitStat d={d} store={habitProgress} />
          <JournalStat d={d} />
          <GastosStat d={d} delta={delta} prevName={prevName} />
          <PlanStat d={d} />
          <ReserveStat reserve={reserve} prevName={prevName} month={d.gastos.month} />
        </section>

        {/* Hábitos (7) junto a Plan y Notas (5, la última se estira hasta el alto de Hábitos). */}
        <HabitsToday d={d} store={habitProgress} />
        <div className="contents lg:col-span-6 lg:flex xl:col-span-5 lg:min-w-0 lg:flex-col lg:gap-5">
          <PlanToday d={d} />
          <NotesCard s={latestNotes} today={d.today} />
        </div>

        {/* key: al cambiar de día (el Shell refresca sin desmontar) arranca de nuevo con
            las fechas nuevas; lo pendiente se manda al desmontar, con su fecha vieja. */}
        <CheckinCard
          key={d.today}
          today={d.checkin.today}
          yesterday={d.checkin.yesterday}
          lastWeightG={d.checkin.lastWeightG}
          watch={d.checkin.watch}
          className="max-lg:order-6 lg:col-span-6 xl:col-span-7"
        />
        <JournalCard d={d} />
        <GastosCard d={d} delta={delta} prevName={prevName} />
        <WeekMix d={d} />
        <Constancia d={d} />
      </main>
    </>
  );
}

/**
 * Barra de un renglón que aparece arriba a los 40 px de bajar (el saludo grande
 * se va con la página). Alto 0 en el flujo: aparecer no corre nada.
 */
function CompactBar({ title, children }: { title: string; children: React.ReactNode }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let frame = 0;
    const check = () => {
      frame = 0;
      setOn(window.scrollY > 40);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);
  return (
    <div className="sticky top-0 z-30 h-0">
      <div
        className="inicio-compact absolute inset-x-0 top-0 border-b border-line bg-bg/90 pt-[env(safe-area-inset-top)] backdrop-blur-md"
        data-on={on || undefined}
        aria-hidden={!on}
        inert={!on}
      >
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 lg:px-10">
          <MenuButton />
          <p className="min-w-0 flex-1 truncate text-[17px] font-semibold tracking-[-0.01em]">{title}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

/** Acceso del saludo; el domingo y el lunes la revisión semanal se destaca. En la barra compacta, solo el ícono en el celular. */
function HeaderLink({ href, label, icon: Ico, highlight, compact }: { href: string; label: string; icon: Icon; highlight?: boolean; compact?: boolean }) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={cx(
        "press inline-flex h-10 items-center gap-2 rounded-full px-3.5 text-[13px] font-medium transition-colors",
        highlight ? "bg-ink text-on-ink hover:opacity-90" : "border border-line-strong bg-surface text-muted hover:bg-surface-2 hover:text-fg",
      )}
    >
      <Ico size={16} aria-hidden />
      <span className={compact ? "hidden sm:inline" : undefined}>{label}</span>
    </Link>
  );
}

function Summary({ d }: { d: Dashboard }) {
  const parts: React.ReactNode[] = [];
  const { doneToday, dueToday } = d.habits;
  const skipped = d.habits.skippedToday;
  const skippedText = skipped ? ` (${skipped} ${skipped === 1 ? "salteado" : "salteados"})` : "";
  if (dueToday) {
    parts.push(
      doneToday === dueToday ? (
        `Completaste ${dueToday === 1 ? "el hábito" : `los ${dueToday} hábitos`} de hoy${skippedText}`
      ) : (
        <>
          Llevás <b className="font-semibold text-fg">{`${doneToday} de ${dueToday}`}</b> {dueToday === 1 ? "hábito" : "hábitos"} de hoy{skippedText}
        </>
      ),
    );
  } else if (skipped) {
    parts.push(`Hoy salteaste ${skipped === 1 ? "el único hábito" : `los ${skipped} hábitos`}`);
  }
  const pending = d.plan.today.filter((b) => !b.done && !isFreeBlock(b)).length;
  if (d.plan.today.some((b) => !isFreeBlock(b)))
    parts.push(pending ? `te ${pending === 1 ? "queda 1 bloque" : `quedan ${pending} bloques`} en el plan` : "el plan de hoy está hecho");
  const weekSpent = d.week.reduce((n, w) => n + w.spentCents, 0);
  // Los reintegros restan: si superan a los gastos, decirlo (moneyCents no lleva signo).
  parts.push(
    weekSpent > 0
      ? `esta semana gastaste ${moneyCents(weekSpent)}`
      : weekSpent < 0
        ? `esta semana los reintegros superaron a los gastos por ${moneyCents(weekSpent)}`
        : "esta semana no gastaste nada",
  );
  // "A, B y C." con la primera letra en mayúscula.
  const first = parts[0];
  if (typeof first === "string") parts[0] = first.charAt(0).toUpperCase() + first.slice(1);
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {i === 0 ? "" : i === parts.length - 1 ? " y " : ", "}
          {p}
        </span>
      ))}
      .{!d.journal.wroteToday && " Todavía no escribiste en el journal."}
    </>
  );
}

/** "sube 0,3 desde setiembre": contra el cierre del mes pasado. */
function reserveSub(r: ReserveSummary, prevName: string): string {
  if (r.months === null) return "Faltan gastos de los últimos 3 meses";
  if (r.prevMonths === null) return "Lo que durarían tus ahorros sin ingresos";
  const diff = Math.round((r.months - r.prevMonths) * 10) / 10;
  if (diff === 0) return `Igual que a fin de ${prevName}`;
  return `${diff > 0 ? "Sube" : "Baja"} ${dec1(Math.abs(diff))} desde ${prevName}`;
}

// ─── Las cinco cifras, con su gráfico chico ─────────────────────────────────

/** Segmentos: uno por hábito o bloque (con más de 24, una barra). */
function MiniSeg({ marks }: { marks: boolean[] }) {
  if (marks.length > 24) {
    const on = marks.filter(Boolean).length;
    return (
      <span className="ini-bar">
        <span style={{ width: `${(on / marks.length) * 100}%` }} />
      </span>
    );
  }
  return (
    <span className="tmini-seg" style={{ gridTemplateColumns: `repeat(${marks.length}, minmax(0, 1fr))` }}>
      {marks.map((m, i) => (
        <span key={i} data-on={m || undefined} />
      ))}
    </span>
  );
}

/** Dos barras para comparar (este mes contra el anterior). */
function MiniCmp({ rows }: { rows: { label: string; value: string; n: number; on?: boolean }[] }) {
  const max = Math.max(...rows.map((r) => Math.max(0, r.n)));
  return (
    <span className="ini-cmp">
      {rows.map((r) => (
        <span key={r.label} className="ini-cmp-row">
          <span>{r.label}</span>
          <span className="ini-track">
            <span data-on={r.on || undefined} style={{ width: `${max > 0 ? (Math.max(0, r.n) / max) * 100 : 0}%` }} />
          </span>
          <span className="ini-cmp-v">{r.value}</span>
        </span>
      ))}
    </span>
  );
}

function MiniCap({ left, right }: { left: string; right: string }) {
  return (
    <span className="tmini-cap">
      <span>{left}</span>
      <span>{right}</span>
    </span>
  );
}

function HabitStat({ d, store }: { d: Dashboard; store: ProgressStore }) {
  const { done, total } = useSyncExternalStore(store.subscribe, store.get, store.get);
  const tick = useTick(done);
  return (
    <StatTile
      tone="habitos"
      icon={Medal}
      label="Hábitos hoy"
      href="/habitos"
      className="lg:col-span-2 xl:col-span-1"
      figure={
        <span key={tick.key} className={tick.className}>
          {done}
        </span>
      }
      unit={`/${total}`}
      sub={d.habits.best ? `Mejor racha: ${d.habits.best.name} (${d.habits.best.streak})` : "Sin rachas en curso"}
    >
      {total > 0 ? (
        <span aria-hidden className="grid gap-1.5">
          <MiniSeg marks={Array.from({ length: total }, (_, i) => i < done)} />
          <MiniCap left={`${done} ${done === 1 ? "hecho" : "hechos"}`} right={done >= total ? "día completo" : `faltan ${total - done}`} />
        </span>
      ) : null}
    </StatTile>
  );
}

function JournalStat({ d }: { d: Dashboard }) {
  const j = d.journal;
  const wrote = new Set(j.days);
  const days = Array.from({ length: 14 }, (_, i) => addDays(d.today, i - 13));
  return (
    <StatTile
      tone="journal"
      icon={Notebook}
      label="Racha de journal"
      href="/journal"
      className="lg:col-span-2 xl:col-span-1"
      figure={j.streak}
      unit={j.streak === 1 ? "día" : "días"}
      sub={j.wroteToday ? "Hoy ya escribiste" : "Hoy todavía no escribiste"}
    >
      <span aria-hidden className="grid gap-1.5">
        <span className="ini-strip">
          {days.map((iso) => (
            <span key={iso} data-on={wrote.has(iso) || undefined} data-today={iso === d.today || undefined} />
          ))}
        </span>
        <MiniCap left={formatShort(days[0])} right="hoy" />
      </span>
    </StatTile>
  );
}

function GastosStat({ d, delta, prevName }: { d: Dashboard; delta: number | null; prevName: string }) {
  const g = d.gastos;
  const cur = monthName(g.month);
  return (
    <StatTile
      tone="gastos"
      icon={Wallet}
      label={`Gastado en ${cur}`}
      href="/gastos/informes"
      className="lg:col-span-2 xl:col-span-1"
      figure={moneyCents(g.spentMonth)}
      sub={delta === null ? "Sin datos del mes anterior" : deltaLabel(delta, `${prevName} a esta altura`)}
    >
      <span aria-hidden className="grid">
        <MiniCmp
          rows={[
            { label: cur.slice(0, 3), value: shortNumber(g.spentMonth / 100), n: g.spentMonth, on: true },
            { label: prevName.slice(0, 3), value: shortNumber(g.spentPrevSame / 100), n: g.spentPrevSame },
          ]}
        />
      </span>
    </StatTile>
  );
}

function PlanStat({ d }: { d: Dashboard }) {
  const p = d.plan;
  const blocks = p.weekBlocks;
  const dayLabel = (iso: string) => `${WD[weekday(iso)]} ${Number(iso.slice(8))}`;
  return (
    <StatTile
      tone="plan"
      icon={CalendarCheck}
      label="Plan de la semana"
      href="/plan"
      className="lg:col-span-3 xl:col-span-1"
      figure={p.weekTotal ? p.weekDone : "–"}
      unit={p.weekTotal ? `de ${p.weekTotal}` : undefined}
      sub={p.weekTotal ? `${pct(p.weekDone, p.weekTotal)}% de los bloques hechos` : "Sin bloques esta semana"}
    >
      {blocks.length > 0 ? (
        <span aria-hidden className="grid gap-1.5">
          <MiniSeg marks={blocks.map((b) => b.done)} />
          <MiniCap left={dayLabel(blocks[0].date)} right={dayLabel(blocks[blocks.length - 1].date)} />
        </span>
      ) : null}
    </StatTile>
  );
}

function ReserveStat({ reserve, prevName, month }: { reserve: ReserveSummary; prevName: string; month: string }) {
  const { months, prevMonths } = reserve;
  const rows = [
    ...(prevMonths !== null ? [{ label: prevName.slice(0, 3), value: dec1(prevMonths), n: prevMonths }] : []),
    ...(months !== null ? [{ label: monthName(month).slice(0, 3), value: dec1(months), n: months, on: true }] : []),
  ];
  return (
    <StatTile
      tone="gastos"
      icon={PiggyBank}
      label="Reserva"
      href="/gastos/cuentas#reserva"
      className="max-lg:col-span-2 lg:col-span-3 xl:col-span-1"
      figure={months === null ? "–" : dec1(months)}
      unit={months === null ? undefined : months === 1 ? "mes" : "meses"}
      sub={reserveSub(reserve, prevName)}
    >
      {rows.length > 0 ? (
        <span aria-hidden className="grid">
          <MiniCmp rows={rows} />
        </span>
      ) : null}
    </StatTile>
  );
}

/** Cifra chica al pie de una tarjeta (rótulo, número grande y una línea). */
function FootStat({ label, value, unit, sub, size = "text-[28px]" }: { label: string; value: React.ReactNode; unit?: string; sub: string; size?: string }) {
  return (
    <div className="grid min-w-0 content-start gap-1 rounded-[14px] bg-surface-2 px-3.5 py-3 max-sm:px-2.5">
      <span className="kicker truncate">{label}</span>
      <span className={cx("figure font-[750] whitespace-nowrap", size)}>
        {value}
        {unit && <small className="ml-[3px] text-[0.42em] font-semibold tracking-[-0.01em] text-muted">{unit}</small>}
      </span>
      <span className="text-[12px] leading-snug text-muted max-sm:text-[11px]">{sub}</span>
    </div>
  );
}

// ─── Hábitos de hoy ─────────────────────────────────────────────────────────

/** La misma lista que Hoy en Hábitos: filas, orden, toques y hoja del día. */
function HabitsToday({ d, store }: { d: Dashboard; store: ProgressStore }) {
  const { logs, mark } = useHabitLogs(d.habits.packed);
  const { sorted, reorder } = useHabitOrder(d.habits.list, d.habits.manualOrder);
  const sticky = useStickyDay(d.today, sorted.filter((h) => showsOn(h, logs[h.id] ?? {}, d.today)).map((h) => h.id));
  const visible = sorted.filter((h) => sticky.has(h.id));
  const { done, total: due } = dayProgress(d.habits.list, logs, d.today, d.today);
  const complete = due > 0 && done >= due;
  const celebrate = useJustCompleted(complete, d.today);
  // La cifra de arriba sigue a las marcas de esta lista.
  useEffect(() => store.set({ done, total: due }), [store, done, due]);
  // La barra está en la cabecera: si al completar el día quedó fuera de la pantalla,
  // se llena (con su brillo) recién cuando vuelve a verse.
  const barRef = useRef<HTMLSpanElement>(null);
  const barSeen = useSeenWhile(barRef, celebrate);
  const barDone = celebrate && !barSeen ? Math.max(0, done - 1) : done;
  const daySheet = useRef<DaySheetHandle>(null);
  // Esta semana, hasta hoy (hoy con las marcas de la lista).
  const week = d.week.filter((w) => w.date <= d.today);
  const wDone = week.reduce((n, w) => n + (w.date === d.today ? done : w.habitsDone), 0);
  const wDue = week.reduce((n, w) => n + (w.date === d.today ? due : w.habitsDue), 0);

  return (
    <TintedCard
      tone="habitos"
      icon={Medal}
      title="Hábitos de hoy"
      meta={due === 0 ? "Hoy no toca ninguno" : complete ? `Día completo · ${due} de ${due}` : `${done} de ${due} · faltan ${due - done}`}
      action={{ href: "/habitos", label: "Ver todo" }}
      progress={due ? barDone / due : null}
      className={cx("max-lg:order-4 lg:col-span-6 xl:col-span-7", celebrate && barSeen && "ini-glow")}
      bodyClassName="ini-habits-body"
    >
      <span ref={barRef} aria-hidden className="block h-0" />
      {visible.length > 0 ? (
        <HabitDayRows
          habits={visible}
          logs={logs}
          day={d.today}
          today={d.today}
          mark={mark}
          onOpen={(h) => daySheet.current?.show(h, d.today)}
          onReorder={reorder}
          celebrate={celebrate}
          rowClassName="bg-surface py-1.5 lg:py-[9px]"
        />
      ) : (
        <p className="py-3 text-[14px] text-muted">No hay hábitos para hoy.</p>
      )}
      {/* Al pie, donde se tildó el último: "Día completo · N de N". Se abre con el alto
          animado (no empuja de golpe) y el chip entra con fundido y escala; al abrir la
          página ya completa, quieto. */}
      <div className="fold" data-closed={!complete || undefined} aria-live="polite">
        <div>
          {complete && (
            <p
              className={cx(
                "mt-3 flex w-fit items-center gap-2 rounded-full bg-[var(--st-done-bg)] py-1.5 pr-3.5 pl-1.5 text-[13.5px] font-medium text-[var(--st-done-fg)]",
                celebrate && "day-chip-in",
              )}
            >
              <span className="inline-flex size-6 items-center justify-center rounded-full bg-[var(--st-done-line)] text-white">
                <Check size={14} weight="bold" aria-hidden />
              </span>
              Día completo · {due} de {due}
            </p>
          )}
        </div>
      </div>
      {/* En la compu la tarjeta mide lo mismo que la columna de al lado: lo que sobra lo
          ocupa la semana día por día (se estira; sin lugar, queda en su alto mínimo). */}
      <WeekDays week={d.week} today={d.today} todayDone={done} todayDue={due} />
      <div className="grid grid-cols-2 gap-2.5 pt-4">
        <FootStat
          label="Esta semana"
          value={pct(wDone, wDue)}
          unit="%"
          sub={`cumplido · ${wDone} de ${wDue} ${week.length === 1 ? "hoy" : "desde el lunes"}`}
        />
        <FootStat
          label="Puntaje promedio"
          value={d.habits.avgScore ?? "–"}
          unit={d.habits.avgScore === null ? undefined : "%"}
          sub={`de tus ${d.habits.scoredCount} ${d.habits.scoredCount === 1 ? "hábito" : "hábitos"}`}
        />
      </div>
      <DaySheet ref={daySheet} logs={logs} mark={mark} />
    </TintedCard>
  );
}

/** La semana de lunes a domingo: una barra por día con lo hecho de lo que tocaba (solo en la compu). */
function WeekDays({ week, today, todayDone, todayDue }: { week: Dashboard["week"]; today: string; todayDone: number; todayDue: number }) {
  const letters = ["L", "M", "M", "J", "V", "S", "D"];
  return (
    <div className="mt-4 hidden min-h-[104px] flex-1 flex-col gap-2 rounded-[14px] bg-surface-2/60 p-3 lg:flex">
      <span className="kicker">Esta semana, día por día</span>
      <div className="grid min-h-0 flex-1 grid-cols-7 gap-2">
        {week.map((w, i) => {
          const isToday = w.date === today;
          const future = w.date > today;
          const done = isToday ? todayDone : w.habitsDone;
          const due = isToday ? todayDue : w.habitsDue;
          const share = due ? Math.min(1, done / due) : 0;
          return (
            <div key={w.date} className="grid min-h-0 grid-rows-[auto_minmax(24px,1fr)_auto] justify-items-center gap-1">
              <span className="font-mono text-[11px] text-muted tabular">{future || !due ? "" : `${done}/${due}`}</span>
              <span
                className={cx(
                  "relative block w-full max-w-9 overflow-hidden rounded-[8px]",
                  future ? "border border-dashed border-line-strong" : "bg-[color-mix(in_oklab,var(--c-habitos)_14%,var(--surface))]",
                )}
                title={future ? "Todavía no llegó" : due ? `${done} de ${due} hechos` : "No tocaba ninguno"}
              >
                {!future && share > 0 && (
                  <span
                    className="absolute inset-x-0 bottom-0 rounded-[8px] bg-[var(--c-habitos)]"
                    style={{ height: `${Math.max(6, share * 100)}%` }}
                  />
                )}
              </span>
              <span className={cx("text-[11.5px]", isToday ? "font-semibold text-fg" : "text-muted")}>{isToday ? "Hoy" : letters[i]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Si `active`, avisa la primera vez que el elemento se ve en la pantalla (debajo
 * del encabezado fijo). Vuelve a false cuando `active` deja de serlo.
 */
function useSeenWhile(ref: React.RefObject<HTMLElement | null>, active: boolean) {
  const [seen, setSeen] = useState(false);
  if (!active && seen) setSeen(false);
  useEffect(() => {
    const el = ref.current;
    if (!active || seen || !el) return;
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setSeen(true), {
      threshold: 0.6,
      rootMargin: "-72px 0px 0px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, active, seen]);
  return seen;
}

// ─── Plan de hoy ────────────────────────────────────────────────────────────

type PlanBlock = Dashboard["plan"]["today"][number];

function PlanToday({ d }: { d: Dashboard }) {
  const [blocks, setDone] = useOptimistic(d.plan.today, (cur: PlanBlock[], u: { id: string; done: boolean }) =>
    cur.map((b) => (b.id === u.id ? { ...b, done: u.done } : b)),
  );
  const [, start] = useSafeTransition();
  const real = blocks.filter((b) => !isFreeBlock(b));
  const doneN = real.filter((b) => b.done).length;
  const overdue = d.plan.overdue;
  const meta = [
    real.length ? `${doneN} de ${real.length} ${real.length === 1 ? "hecho" : "hechos"}` : "Nada para hoy",
    overdue ? `${overdue} ${overdue === 1 ? "vencido" : "vencidos"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // La tilde aparece con un golpe, solo tras tocarla.
  const [tappedBlock, setTappedBlock] = useState<string | null>(null);
  return (
    <TintedCard
      tone="plan"
      icon={CalendarCheck}
      title="Plan de hoy"
      meta={meta}
      action={{ href: "/plan", label: "Ver la semana" }}
      progress={real.length ? doneN / real.length : null}
      className="max-lg:order-5 lg:flex-none"
      bodyClassName="@container"
    >
      {blocks.length > 0 ? (
        <ol className="-mx-1 grid gap-0.5">
          {blocks.map((b) => {
            const free = isFreeBlock(b);
            const range = timeRange(b);
            return (
              <li key={b.id}>
                <button
                  type="button"
                  disabled={free}
                  aria-pressed={b.done}
                  onClick={() => {
                    setTappedBlock(b.id);
                    start(async () => {
                      setDone({ id: b.id, done: !b.done });
                      await setBlockDone(b.id, !b.done);
                    });
                  }}
                  className="tap-tint relative flex min-h-11 w-full items-center gap-3 rounded-xl px-1 py-1 text-left transition-colors duration-[80ms] hover:bg-surface-2 disabled:hover:bg-transparent"
                >
                  {/* "Libre" no se tilda (igual que en el Plan): sin círculo, con el mismo lugar para que el texto quede alineado. */}
                  {free ? (
                    <span aria-hidden className="size-[18px] shrink-0" />
                  ) : (
                  <span
                    aria-hidden
                    className={cx(
                      "inline-flex size-[18px] shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                      // El fondo va en cada caso: con bg-surface siempre puesto, el blanco tapaba el color de hecho.
                      b.done ? "border-[var(--c-plan)] bg-[var(--c-plan)] text-white" : "border-line-strong bg-surface",
                    )}
                  >
                    {b.done && <Check size={10} weight="bold" className={tappedBlock === b.id ? "mark-pop" : undefined} />}
                  </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className={cx("block truncate text-[14px] transition-colors duration-[var(--dur-state)]", b.done && "text-muted line-through decoration-faint")}>
                      {b.title}
                    </span>
                    <span className="flex items-center gap-1.5 text-[12px] text-fg/75">
                      <span className="tabular">{range ?? b.startTime ?? "Todo el día"}</span>
                      <CategoryTag category={b.category} />
                    </span>
                  </span>
                  <PriorityTag n={b.priority} />
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-2xl border-[1.5px] border-dashed border-line-strong bg-surface-2 py-3 pr-3 pl-3.5 @xs:grid-cols-[auto_minmax(0,1fr)_auto]">
          <span aria-hidden className="inline-flex size-9 items-center justify-center rounded-[11px] bg-surface text-[var(--head-fg)]">
            <CalendarCheck size={18} weight="fill" />
          </span>
          <span className="grid gap-px text-[14px]">
            <b className="font-semibold">Nada planificado para hoy.</b>
            <span className="text-[12.5px] text-muted">Tenés el {formatLong(d.today).split(",")[0]} libre.</span>
          </span>
          <Link
            href="/plan"
            className="press inline-flex h-[34px] items-center justify-center rounded-full bg-ink px-3.5 text-[13px] font-medium text-on-ink hover:opacity-90 @max-xs:col-span-2"
          >
            Armar el día
          </Link>
        </div>
      )}
      {real.length < 3 && d.plan.upcoming.length > 0 && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
          <p className="kicker">Lo que viene esta semana</p>
          <ul className="grid grid-cols-[minmax(0,1fr)] divide-y divide-line">
            {d.plan.upcoming.map((b) => (
              <li key={b.id} className="flex min-h-10 items-center gap-3 text-[14px]">
                <span className="inline-flex w-[5.75rem] shrink-0 items-baseline gap-1.5 font-mono text-[11.5px] tracking-[0.05em] text-muted uppercase">
                  <span>{WD[weekday(b.date)]}</span>
                  <b className="font-sans text-[17px] font-[650] tracking-[-0.02em] text-fg">{Number(b.date.slice(8))}</b>
                  {b.startTime && <span className="normal-case">{b.startTime}</span>}
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
        <div className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
          <p className="kicker">Deadlines cerca</p>
          <ul className="grid grid-cols-[minmax(0,1fr)] divide-y divide-line">
            {d.plan.dueTasks.map((t) => (
              <li key={t.id} className="flex items-center gap-3 text-[14px]">
                <span
                  className={cx(
                    "tabular w-[5.75rem] shrink-0 rounded-full px-2 py-0.5 text-center text-[11.5px] font-medium",
                    t.left < 0
                      ? "bg-[var(--st-fail-bg)] text-[var(--st-fail-fg)]"
                      : t.left <= 1
                        ? "bg-[var(--st-skip-bg)] text-[var(--st-skip-fg)]"
                        : "bg-surface-2 text-muted",
                  )}
                >
                  {daysLeftLabel(t.left)}
                </span>
                <Link href="/plan#tareas" className="flex min-h-10 min-w-0 flex-1 items-center truncate hover:underline">
                  {t.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </TintedCard>
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
                // Tope de intensidad: el número (en el color de texto) se lee en los dos temas.
                background: `color-mix(in oklab, var(--c-habitos) ${Math.round(8 + p * 0.37)}%, var(--surface-2))`,
                color: "var(--text)",
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
      aria: (w) => (w.spentCents < 0 ? `reintegros por ${moneyCents(w.spentCents)} más que gastos` : `gastaste ${moneyCents(w.spentCents)}`),
      cell: (w, future) =>
        future ? (
          <Dash />
        ) : (
          <span className="grid w-full justify-items-center gap-1">
            <span className="flex h-9 w-3 items-end overflow-hidden rounded-full bg-surface-2">
              <span
                className="w-full rounded-full bg-[var(--c-gastos)]"
                style={{ height: `${w.spentCents > 0 ? Math.max(8, (w.spentCents / maxSpent) * 100) : 0}%` }}
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
  const sum = (f: (w: Dashboard["week"][number]) => number) => d.week.filter((w) => w.date <= d.today).reduce((n, w) => n + f(w), 0);
  const spent = sum((w) => w.spentCents);

  return (
    <TintedCard
      tone="inicio"
      icon={ClipboardText}
      title="Tu semana"
      meta={rangeLabel(d.week[0].date, d.week[d.week.length - 1].date)}
      action={{ href: "/semana", label: "Revisión" }}
      className="max-lg:order-10 lg:col-span-12 xl:col-span-5"
    >
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[18rem] table-fixed border-separate border-spacing-y-1 text-center">
          <caption className="sr-only">Hábitos, journal, gastos y plan por día de esta semana</caption>
          <thead>
            <tr>
              <th className="w-[4.6rem]" />
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
      <div className="mt-auto grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        <WeekTotal value={`${sum((w) => w.habitsDone)}/${sum((w) => w.habitsDue)}`} label="hábitos" />
        <WeekTotal value={`${d.plan.weekDone}/${d.plan.weekTotal}`} label="plan" />
        <WeekTotal value={String(sum((w) => (w.wrote ? 1 : 0)))} label="días escritos" />
        <WeekTotal value={`${spent < 0 ? "−" : ""}${moneyCents(spent)}`} label="gastado" />
      </div>
    </TintedCard>
  );
}

function WeekTotal({ value, label }: { value: string; label: string }) {
  return (
    <span className="grid min-w-0 gap-0.5 rounded-xl bg-surface-2 px-2.5 py-2 text-[11.5px] text-muted">
      <b className="truncate font-mono text-[15px] font-semibold text-fg tabular">{value}</b>
      {label}
    </span>
  );
}

function Dash() {
  return <span aria-hidden className="h-0.5 w-3 rounded-full bg-line-strong" />;
}

// ─── Gastos ─────────────────────────────────────────────────────────────────

function GastosCard({ d, delta, prevName }: { d: Dashboard; delta: number | null; prevName: string }) {
  const g = d.gastos;
  const maxCat = Math.max(1, ...g.topCategories.map((c) => c.cents));
  const month = monthName(g.month);
  const monthCap = month.charAt(0).toUpperCase() + month.slice(1);
  const alerts = g.cardAlerts.length > 0 || g.budgetAlerts.length > 0;
  return (
    <TintedCard
      tone="gastos"
      icon={Wallet}
      title="Gastos del mes"
      meta={`${monthCap} · ${g.hasWork ? "cuentas personales, " : ""}en pesos`}
      action={{ href: "/gastos/informes", label: "Informes" }}
      className="ini-gastos max-lg:order-7 lg:col-span-12"
      bodyClassName="ini-gastos-body"
    >
      <div>
        {alerts && (
          <div className="grid gap-1.5">
            {g.cardAlerts.length > 0 && (
              <ul className="grid gap-1.5" aria-label="Tarjetas por vencer">
                {g.cardAlerts.map((c) => {
                  const late = c.due < d.today;
                  return (
                    <li key={c.accountId}>
                      <Link
                        href={`/gastos?nuevo=1&pagar=${c.accountId}&monto=${c.leftCents}`}
                        className={cx(
                          "tap-tint flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] transition-opacity hover:opacity-85",
                          late ? "bg-[var(--st-fail-bg)] text-[var(--st-fail-fg)]" : "bg-[var(--st-skip-bg)] text-[var(--st-skip-fg)]",
                        )}
                      >
                        <CreditCard size={15} weight="fill" aria-hidden />
                        <span className="min-w-0 flex-1 truncate">
                          <strong className="font-semibold">{c.name}</strong>: {late ? "venció" : c.due === d.today ? "vence hoy" : "vence"}{" "}
                          {c.due === d.today ? "" : `el ${formatShort(c.due)}`}
                        </span>
                        <span className="tabular shrink-0 font-medium">{moneyCents(c.leftCents, c.currency)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            {g.budgetAlerts.length > 0 && (
              <ul className="grid gap-1.5" aria-label="Avisos de presupuesto">
                {g.budgetAlerts.slice(0, 3).map((a) => (
                  <li key={a.categoryId}>
                    <Link
                      href="/gastos/presupuestos"
                      className={cx(
                        "tap-tint flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] transition-opacity hover:opacity-85",
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
                      <span className="tabular shrink-0 opacity-80">{Math.round((a.spentCents / a.amountCents) * 100)}%</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <p className="kicker">Gastado en {month} (en pesos)</p>
        <div className="flex flex-wrap items-center gap-3">
          <p className="figure text-[40px] font-[780] tracking-[-0.045em] lg:text-[48px]">
            {g.spentMonth < 0 ? "−" : ""}
            {moneyCents(g.spentMonth)}
          </p>
          {delta !== null && (
            <p
              className={cx(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12.5px] font-medium",
                Math.round(delta * 100) === 0
                  ? "bg-surface-2 text-muted"
                  : delta > 0
                    ? "bg-[var(--st-fail-bg)] text-[var(--st-fail-fg)]"
                    : "bg-[var(--st-done-bg)] text-[var(--st-done-fg)]",
              )}
            >
              {Math.round(delta * 100) === 0 ? null : delta > 0 ? (
                <ArrowUpRight size={13} weight="bold" aria-hidden />
              ) : (
                <ArrowDownRight size={13} weight="bold" aria-hidden />
              )}
              {Math.round(delta * 100) === 0 ? `Igual que ${prevName} al mismo día` : `${Math.abs(Math.round(delta * 100))}% vs. ${prevName} al mismo día`}
            </p>
          )}
        </div>
        <SpendChart cumThis={g.cumThis} cumPrev={g.cumPrev} monthName={month} prevName={prevName} />
      </div>
      <div>
        <p className="kicker">En qué se fue</p>
        {g.topCategories.length === 0 && <p className="text-[14px] text-muted">Sin gastos este mes.</p>}
        <ul className="grid gap-3">
          {g.topCategories.map((c) => (
            <li key={c.id ?? "none"} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2.5 gap-y-1">
              <ToneSquare size={26} style={tone(c.color)}>
                <FinanceIcon name={c.icon} size={14} weight="fill" aria-hidden />
              </ToneSquare>
              <span className="truncate text-[13.5px]">{c.name}</span>
              <span className="tabular text-[13px]">{moneyCents(c.cents)}</span>
              <span className="col-start-2 col-end-4 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <span className="block h-full rounded-full" style={{ width: `${(c.cents / maxCat) * 100}%`, background: "var(--c-gastos)" }} />
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-auto flex items-baseline justify-between gap-2 rounded-[14px] bg-[var(--head-bg)] px-3.5 py-3">
          <span className="kicker text-[var(--head-fg)]!">Ingresos de {month}</span>
          <span className="figure text-[22px] font-[750]">{moneyCents(g.incomeMonth)}</span>
        </div>
      </div>
      <div className="justify-between gap-4!">
        <div className="grid content-start gap-1.5">
          <p className="kicker">{g.hasWork ? "Saldo personal" : "Saldo total"}</p>
          {Object.entries(g.balances)
            .sort(([a], [b]) => (a === "UYU" ? -1 : b === "UYU" ? 1 : a.localeCompare(b)))
            .map(([cur, cents], i) => (
              <p key={cur} className={cx("figure font-[780] tracking-[-0.045em]", i === 0 ? "text-[30px]" : "text-[22px] text-muted", cents < 0 && "text-danger")}>
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
          <Link href="/gastos/cuentas" className="mt-0.5 inline-flex min-h-9 w-fit items-center gap-1 text-[13px] font-medium text-[var(--head-fg)] hover:underline">
            Ver cuentas <ArrowRight size={13} aria-hidden />
          </Link>
        </div>
        <div className="grid min-w-0 gap-2">
          <p className="kicker">Cargar un gasto</p>
          <QuickAdd accounts={g.quickAccounts} />
        </div>
      </div>
    </TintedCard>
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
    <TintedCard
      tone="journal"
      icon={Notebook}
      title="Journal"
      meta={j.last ? `Última entrada · ${j.last.date === d.today ? "hoy" : formatShort(j.last.date)}` : "Todavía no hay entradas"}
      action={{ href: "/journal", label: "Entradas" }}
      className="max-lg:order-8 lg:col-span-6 xl:col-span-5"
    >
      <div className="grid grid-cols-3">
        <JournalNum value={j.streak} label={j.streak === 1 ? "día de racha" : "días de racha"} />
        <JournalNum value={j.monthWritten} label={j.monthWritten === 1 ? "día este mes" : "días este mes"} />
        <JournalNum value={j.total} label={j.total === 1 ? "día escrito" : "días escritos"} />
      </div>
      {j.last && (
        <Link
          href={`/journal/${j.last.id}`}
          className="group grid gap-1.5 rounded-[6px_16px_16px_6px] border-l-[3px] border-[var(--head-chip)] bg-[var(--head-bg)] p-4 transition-[filter,scale] duration-[var(--dur-quick)] hover:brightness-[0.98] active:scale-[0.98] motion-reduce:active:scale-100"
        >
          <span className="kicker text-[var(--head-fg)]!">
            Última entrada · {j.last.date === d.today ? "hoy" : formatShort(j.last.date)}
          </span>
          {j.last.title && <span className="font-semibold">{j.last.title}</span>}
          <span className="line-clamp-4 text-[14px] leading-relaxed text-fg/85">{j.last.excerpt}</span>
        </Link>
      )}
      <form action={writeOnDay.bind(null, undefined, false)} className="mt-auto">
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
    </TintedCard>
  );
}

function JournalNum({ value, label }: { value: number; label: string }) {
  return (
    <div className="grid min-w-0 gap-1 border-l border-line px-3.5 first:border-l-0 first:pl-0">
      <span className="figure text-[32px] font-[780] tracking-[-0.045em]">{value.toLocaleString("es-UY")}</span>
      <span className="text-[12px] leading-tight text-muted">{label}</span>
    </div>
  );
}

// ─── Notas: las últimas y los videos para ver ───────────────────────────────

function NotesCard({ s, today }: { s: NotesSummary; today: string }) {
  return (
    <TintedCard
      tone="notas"
      icon={Note}
      title="Notas"
      meta={`${s.laterVideos} ${s.laterVideos === 1 ? "video" : "videos"} para ver`}
      action={{ href: "/notas", label: "Ver todas" }}
      className="max-lg:order-9 lg:flex-1"
      bodyClassName="gap-2.5!"
    >
      <Link
        href="/notas?seccion=videos&ver=despues"
        className="press flex items-center gap-3 rounded-2xl px-4 py-3 transition-[filter] hover:brightness-[0.98]"
        style={{ background: "var(--p-red-bg)" }}
      >
        <span style={tone("red")} className="chip-solid inline-flex size-9 shrink-0 items-center justify-center rounded-xl">
          <PlayCircle size={19} weight="fill" aria-hidden />
        </span>
        <span className="grid gap-0.5">
          <span className="figure text-[26px] leading-none font-[750]">{s.laterVideos}</span>
          <span className="text-[12.5px] text-fg/80">{s.laterVideos === 1 ? "video para ver" : "videos para ver"}</span>
        </span>
      </Link>
      {s.latest.length ? (
        <ul className="grid gap-0.5">
          {s.latest.map((n) => {
            const sec = sectionOf(n.section);
            return (
              <li key={n.id} className="min-w-0">
                <Link href={`/notas?seccion=${sec.id}`} className="tap-tint flex min-w-0 items-center gap-3 rounded-xl px-1 py-2 hover:bg-surface-2">
                  <span style={tone(sec.color)} className="chip-solid inline-flex size-8 shrink-0 items-center justify-center rounded-lg">
                    <sec.icon size={16} weight="fill" aria-hidden />
                  </span>
                  <span className="grid min-w-0 gap-0.5">
                    <span className="truncate text-[14px] font-medium">{noteHeading(n)}</span>
                    <span className="truncate text-[12px] text-muted">
                      {n.url ? `${noteDomain(n.url)} · ` : ""}
                      {relativeDay(dayOfInstant(new Date(n.createdAt)), today)}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <Link
          href="/notas?nuevo=1"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-line-strong px-4 text-[14px] text-fg transition-colors hover:bg-surface-2"
        >
          <Plus size={15} weight="bold" aria-hidden /> Guardar la primera nota
        </Link>
      )}
    </TintedCard>
  );
}

// ─── Constancia: hábitos y journal, últimas semanas ─────────────────────────

const RAMP_STEPS = [0, 22, 45, 70, 100];

function Constancia({ d }: { d: Dashboard }) {
  const habitByDay = new Map(d.habits.history.map((h) => [h.date, h]));
  const wrote = new Set(d.journal.days);
  const totalDays = daysBetween(d.heatFrom, d.today) + 1;
  const weeks = Math.ceil(totalDays / 7);
  // Hoy, sin terminar, no baja el promedio: entra solo si ya está completo.
  const habitDays = d.habits.history.filter((h) => h.due > 0 && (h.date < d.today || h.done >= h.due));
  const habitAvg = habitDays.length ? Math.round((habitDays.reduce((n, h) => n + h.done / h.due, 0) / habitDays.length) * 100) : 0;
  const wroteN = d.journal.days.length;
  const thisWeek = d.week.filter((w) => w.date <= d.today);
  const wDone = thisWeek.reduce((n, w) => n + w.habitsDone, 0);
  const wDue = thisWeek.reduce((n, w) => n + w.habitsDue, 0);

  return (
    <TintedCard
      tone="inicio"
      icon={CalendarCheck}
      title="Constancia"
      meta={`Últimas ${weeks} semanas · cada cuadrito es un día`}
      className="max-lg:order-11 lg:col-span-12 xl:col-span-7"
    >
      <div className="grid gap-6 sm:grid-cols-2 sm:gap-7">
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
          summary={`Escribiste ${wroteN} de ${totalDays} días`}
          color="var(--c-journal)"
          from={d.heatFrom}
          today={d.today}
          level={(iso) => (wrote.has(iso) ? 4 : 0)}
          label={(iso) => (wrote.has(iso) ? "escribiste" : "sin escribir")}
          legend={["Sin escribir", "Escribiste"]}
          binary
        />
      </div>
      <div className="mt-auto grid grid-cols-3 gap-1.5 sm:gap-2.5">
        <FootStat label="Hábitos" value={habitAvg} unit="%" sub="de cumplimiento promedio" size="text-[22px] sm:text-[26px]" />
        <FootStat label="Journal" value={wroteN} unit={`de ${totalDays}`} sub="días escritos" size="text-[22px] sm:text-[26px]" />
        <FootStat label="Esta semana" value={wDone} unit={`de ${wDue}`} sub="hábitos hechos" size="text-[22px] sm:text-[26px]" />
      </div>
      <details className="-mt-2 text-sm">
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
    </TintedCard>
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
          {["L", "M", "X", "J", "V", "S", "D"].map((l, i) => (
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
