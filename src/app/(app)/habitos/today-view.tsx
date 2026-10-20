"use client";

import { useKeepHeight, useSlide, useTick } from "@/components/motion";
import { useOnNew } from "@/components/nav-add";
import { memo, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Medal, Plus } from "@phosphor-icons/react";
import { addDays, diffDays, formatLong, weekday } from "@/lib/dates";
import { dayProgress, WEEKDAY_SHORT, type PackedLogMap, showsOn } from "@/lib/habit-logic";
import type { CategoryDTO, HabitDTO } from "@/lib/habits";
import { PageHeader } from "@/components/page-header";
import { Button, cx } from "@/components/ui";
import { DaySheet, useHabitLogs, useHabitOrder, type DaySheetHandle } from "./habit-ui";
import { DayComplete, HabitDayRows, useJustCompleted, useStickyDay } from "./day-rows";
import { HabitForm, type HabitFormHandle } from "./habit-form";
import { HabitsTabs } from "./habits-nav";
import { TodayFacts, TodayPanel, todayStats } from "./today-panel";
import { TintedCard } from "@/components/tinted-card";
import { useSwipe } from "@/components/swipe";

const PAST = 30;
const FUTURE = 7;

export function TodayView({
  habits,
  logs: initialLogs,
  categories,
  today,
  manualOrder = false,
}: {
  habits: HabitDTO[];
  logs: PackedLogMap;
  categories: CategoryDTO[];
  today: string;
  /** Si se ordenó arrastrando alguna vez, Hoy y la Lista usan ese orden. */
  manualOrder?: boolean;
}) {
  const { logs, mark } = useHabitLogs(initialLogs);
  const [selected, setSelected] = useState(today);
  const form = useRef<HabitFormHandle>(null);
  const daySheet = useRef<DaySheetHandle>(null);
  useOnNew(() => form.current?.create());

  const days = useMemo(
    () => Array.from({ length: PAST + FUTURE + 1 }, (_, i) => addDays(today, i - PAST)),
    [today],
  );

  // Orden fijo (el arrastrado, o prioridad y nombre): al tildar, la fila no cambia de lugar.
  const { sorted, reorder } = useHabitOrder(habits, manualOrder);
  // Los que tocan hoy, y los que ya se vieron aunque al destildarlos dejen de tocar.
  const sticky = useStickyDay(selected, sorted.filter((h) => showsOn(h, logs[h.id] ?? {}, selected)).map((h) => h.id));
  const visible = sorted.filter((h) => sticky.has(h.id));
  // Otro día en la tira: la lista entra desde ese lado (al cargar, nada).
  const daySlide = useSlide(selected);
  // Un día con menos hábitos no achica la página (ver useKeepHeight).
  const [keepRef, keepStyle, keepHeight] = useKeepHeight<HTMLDivElement>();
  const pick = (d: string) => {
    if (d === selected || d < days[0] || d > days[days.length - 1]) return;
    keepHeight();
    setSelected(d);
  };
  // Deslizar de costado sobre la lista cambia de día: la lista no sigue al dedo (las
  // filas no se mueven solas); se corre la marca de la tira y entra con el mismo
  // deslizamiento que al tocar un día.
  // Estable para la tira memorizada (al tildar un hábito no se vuelve a dibujar).
  const pickRef = useRef(pick);
  useLayoutEffect(() => {
    pickRef.current = pick;
  });
  const onSelect = useCallback((d: string) => pickRef.current(d), []);
  const swipe = useSwipe({ onLeft: () => pick(addDays(selected, 1)), onRight: () => pick(addDays(selected, -1)) });
  // El avance del día y el momento "Día completo" van con el toque; el panel de la
  // compu (rachas y puntajes de todos) se pone al día un instante después, sin trabarlo.
  const progress = dayProgress(habits, logs, selected, today);
  const celebrate = useJustCompleted(progress.total > 0 && progress.done >= progress.total, selected);
  const deferredLogs = useDeferredValue(logs);
  // El formulario no depende de las marcas: no se vuelve a dibujar con cada toque.
  const formEl = useMemo(() => <HabitForm ref={form} categories={categories} today={today} />, [categories, today]);


  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const doneTick = useTick(progress.done);
  const pctTick = useTick(pct);
  // Rachas, puntaje y la semana: con las marcas diferidas (nunca en el render urgente).
  const stats = useMemo(() => todayStats(habits, deferredLogs, today), [habits, deferredLogs, today]);
  const left = progress.total - progress.done;
  const dayName = selected === today ? "Hoy" : relativeTitle(selected, today);

  return (
    <>
      <PageHeader
        title="Hábitos"
        kicker={formatLong(selected)}
        wide
        tabs={<HabitsTabs />}
        actions={
          <Button variant="accent" size="sm" className="max-lg:hidden" onClick={() => form.current?.create()}>
            <Plus size={16} weight="bold" /> Nuevo hábito
          </Button>
        }
      />

      <main className="mx-auto grid max-w-3xl gap-3.5 px-4 pt-1 lg:max-w-6xl lg:items-start lg:gap-6 lg:px-10 lg:pt-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid min-w-0 gap-3.5 lg:gap-5">
          {/* El avance del día (va con el toque: es una cuenta chica) y la tira de días. */}
          <TintedCard
            className="hh-sum"
            icon={Medal}
            title={
              <span className="hh-title">
                {dayName} <span aria-hidden className="opacity-50">·</span>{" "}
                <b key={doneTick.key} className={cx("figure", doneTick.className)}>
                  {progress.done}
                </b>
                <span className="hh-of">de {progress.total}</span>
              </span>
            }
            meta={
              progress.total === 0
                ? "Nada programado para este día"
                : left === 0
                  ? "Completaste todo lo del día"
                  : `${left === 1 ? "Falta 1" : `Faltan ${left}`} para cerrar el día`
            }
            action={
              <span key={pctTick.key} className={cx("hh-pct figure", pctTick.className)} aria-label={`${pct}% hecho`}>
                {pct}
                <small>%</small>
              </span>
            }
            progress={progress.total ? progress.done / progress.total : 0}
            headExtra={
              <>
                {habits.length > 0 && (
                  <div className="xl:hidden">
                    <TodayFacts stats={stats} />
                  </div>
                )}
                <DateStrip days={days} selected={selected} today={today} onSelect={onSelect} />
              </>
            }
          />

          <section aria-label="Hábitos del día" className="hh-list overflow-hidden rounded-[22px] border bg-surface">
            {visible.length > 0 && (
              <div className="flex items-baseline justify-between gap-3 px-4 pt-3.5 pb-1 lg:px-6 lg:pt-4">
                <span className="kicker">{selected === today ? "Para hoy" : `Para ${dayName.toLowerCase()}`}</span>
                <span className="font-mono text-[11.5px] text-muted tabular">
                  {visible.length} {visible.length === 1 ? "hábito" : "hábitos"}
                </span>
              </div>
            )}
            <div {...swipe} className="touch-pan-y">
              <div key={selected} ref={keepRef} style={keepStyle} className={cx("px-4 lg:px-6", daySlide)}>
                {habits.length === 0 ? (
                  <EmptyState onCreate={() => form.current?.create()} />
                ) : visible.length === 0 ? (
                  <p className="py-16 text-center text-[15px] text-muted">No hay hábitos para este día.</p>
                ) : (
                  <HabitDayRows
                    habits={visible}
                    logs={logs}
                    day={selected}
                    today={today}
                    mark={mark}
                    onOpen={(h) => daySheet.current?.show(h, selected)}
                    onReorder={reorder}
                    celebrate={celebrate}
                    rowClassName="bg-surface py-[7px] lg:py-4"
                  />
                )}
                {/* Cambiar de día no es "completar" (useJustCompleted mira el día elegido). */}
                {visible.length > 0 && <DayComplete {...progress} celebrate={celebrate} />}
              </div>
            </div>
          </section>
        </div>

        {habits.length > 0 && (
          <div className="hidden lg:block">
            <TodayPanel stats={stats} today={today} />
          </div>
        )}
      </main>

      {formEl}
      <DaySheet ref={daySheet} logs={logs} mark={mark} />
    </>
  );
}

function relativeTitle(iso: string, today: string) {
  const d = diffDays(iso, today);
  if (d === -1) return "Ayer";
  if (d === 1) return "Mañana";
  return `${WEEKDAY_SHORT[weekday(iso)]} ${Number(iso.slice(8))}`;
}

/** "jueves 9 de octubre" de cada día de la tira, calculado una vez. */
const longCache = new Map<string, string>();
function longLabel(d: string) {
  let v = longCache.get(d);
  if (v === undefined) longCache.set(d, (v = formatLong(d)));
  return v;
}

const DateStrip = memo(function DateStrip({
  days,
  selected,
  today,
  onSelect,
}: {
  days: string[];
  selected: string;
  today: string;
  onSelect: (d: string) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  // De qué lado quedó hoy cuando no se ve en la tira (para el chip "Hoy"); null = se ve.
  const [todayOff, setTodayOff] = useState<"left" | "right" | null>(null);
  useEffect(() => {
    // Centra el día elegido; la primera vez sin animación para no arrancar en otro lado.
    centerDay(scroller.current, selected, mounted.current);
    mounted.current = true;
  }, [selected]);
  useEffect(() => {
    const box = scroller.current;
    const el = box?.querySelector<HTMLElement>(`[data-day="${today}"]`);
    if (!box || !el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.intersectionRatio > 0.5) return setTodayOff(null);
        const root = e.rootBounds;
        setTodayOff(root && e.boundingClientRect.left < root.left ? "left" : "right");
      },
      { root: box, threshold: [0, 0.5, 1] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [today]);

  // Teclado: solo el día elegido entra con Tab; las flechas cambian de día.
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const i = days.indexOf(selected);
    const to =
      e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? days.length - 1 : null;
    if (to === null || to < 0 || to >= days.length) return;
    e.preventDefault();
    onSelect(days[to]);
    scroller.current?.querySelector<HTMLElement>(`[data-day="${days[to]}"]`)?.focus({ preventScroll: true });
  }

  return (
    <div className="relative mt-1.5">
      <div
        ref={scroller}
        role="group"
        aria-label="Días"
        onKeyDown={onKeyDown}
        className="relative -mr-3 -ml-3.5 flex snap-x scroll-px-3.5 gap-[5px] overflow-x-auto px-3.5 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {days.map((d) => {
          const active = d === selected;
          const isToday = d === today;
          return (
            <button
              key={d}
              data-day={d}
              type="button"
              onClick={() => onSelect(d)}
              tabIndex={active ? 0 : -1}
              aria-label={`${longLabel(d)}${isToday ? ", hoy" : ""}`}
              className={cx(
                "relative flex h-16 w-[46px] shrink-0 snap-center flex-col items-center justify-center gap-1 rounded-[10px] transition-colors duration-200 lg:w-[50px]",
                active ? "bg-ink text-on-ink" : "hh-day bg-surface text-fg hover:bg-surface-2",
              )}
              aria-pressed={active}
            >
              <span
                aria-hidden
                className={cx(
                  "font-mono text-[10.5px] font-medium tracking-[0.08em] uppercase",
                  active ? "text-on-ink/75" : "text-muted",
                )}
              >
                {WEEKDAY_SHORT[weekday(d)]}
              </span>
              <span aria-hidden className="figure text-[22px]">
                {Number(d.slice(8))}
              </span>
              {isToday && (
                <span
                  aria-hidden
                  className={cx("absolute bottom-1.5 size-1 rounded-full", active ? "bg-on-ink/80" : "bg-accent")}
                />
              )}
            </button>
          );
        })}
      </div>
      {/* Hoy quedó fuera de la tira al deslizarla: un chip para volver (fundido de 160 ms). */}
      <button
        type="button"
        tabIndex={todayOff ? 0 : -1}
        aria-hidden={!todayOff}
        onClick={() => {
          centerDay(scroller.current, today, true);
          onSelect(today);
        }}
        className={cx(
          "absolute top-1/2 z-10 inline-flex h-8 -translate-y-1/2 items-center rounded-full bg-ink px-3.5 text-[12.5px] font-medium text-on-ink shadow-[0_4px_14px_-6px_rgba(0,0,0,0.45)] transition-[opacity,visibility] duration-[160ms] ease-out",
          todayOff === "left" ? "left-0" : "right-0",
          todayOff ? "visible opacity-100" : "invisible opacity-0",
        )}
      >
        Hoy
      </button>
    </div>
  );
});

/** Centra un día en la tira. */
function centerDay(box: HTMLElement | null, d: string, smooth: boolean) {
  const el = box?.querySelector<HTMLElement>(`[data-day="${d}"]`);
  if (!box || !el) return;
  box.scrollTo({ left: el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2, behavior: smooth ? "smooth" : "instant" });
}


function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="grid justify-items-start gap-3 py-8 lg:py-10">
      <p className="kicker">Para empezar</p>
      <h2 className="display text-[26px]">Todavía no hay hábitos</h2>
      <p className="max-w-[46ch] text-sm leading-relaxed text-muted">
        Creá el primero. Elegí la frecuencia (todos los días, algunos días o unas veces por semana) y marcalo acá cada día.
      </p>
      <Button variant="accent" onClick={onCreate}>
        <Plus size={16} weight="bold" /> Crear hábito
      </Button>
    </div>
  );
}
