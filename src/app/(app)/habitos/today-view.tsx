"use client";

import { useKeepHeight, useSlide } from "@/components/motion";
import { useOnNew } from "@/components/nav-add";
import { memo, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Plus } from "@phosphor-icons/react";
import { addDays, diffDays, formatLong, weekday } from "@/lib/dates";
import { dayProgress, WEEKDAY_SHORT, type PackedLogMap, showsOn } from "@/lib/habit-logic";
import type { CategoryDTO, HabitDTO } from "@/lib/habits";
import { PageHeader } from "@/components/page-header";
import { Button, cx } from "@/components/ui";
import { DaySheet, useHabitLogs, useHabitOrder, type DaySheetHandle } from "./habit-ui";
import { DayComplete, HabitDayRows, useJustCompleted, useStickyDay } from "./day-rows";
import { HabitForm, type HabitFormHandle } from "./habit-form";
import { HabitsTabs } from "./habits-nav";
import { TodayPanel } from "./today-panel";
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


  return (
    <>
      <PageHeader
        title={selected === today ? "Hoy" : relativeTitle(selected, today)}
        kicker={formatLong(selected)}
        wide
        tabs={<HabitsTabs />}
        actions={
          <Button variant="accent" size="sm" className="max-lg:hidden" onClick={() => form.current?.create()}>
            <Plus size={16} weight="bold" /> Nuevo hábito
          </Button>
        }
      />

      <main className="mx-auto max-w-3xl lg:grid lg:max-w-6xl lg:items-start lg:gap-8 xl:grid-cols-[minmax(0,1fr)_340px] lg:px-10 lg:pt-6">
        <section className="min-w-0 lg:overflow-hidden lg:rounded-2xl lg:border lg:border-[var(--card-ring)] lg:bg-surface lg:shadow-[var(--card-shadow)]">
        <DateStrip
          days={days}
          selected={selected}
          today={today}
          onSelect={onSelect}
        />

        <div {...swipe} className="touch-pan-y">
        <div key={selected} ref={keepRef} style={keepStyle} className={cx("px-4 lg:px-6", daySlide)}>
          {habits.length === 0 ? (
            <EmptyState onCreate={() => form.current?.create()} />
          ) : visible.length === 0 ? (
            <p className="display py-20 text-center text-[22px] text-muted">No hay hábitos para este día.</p>
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
              className="border-b border-line lg:border-b-0"
              rowClassName="bg-bg py-1.5 lg:bg-surface lg:py-4"
            />
          )}
          {/* Cambiar de día no es "completar" (useJustCompleted mira el día elegido). */}
          {visible.length > 0 && <DayComplete {...progress} celebrate={celebrate} />}
        </div>
        </div>
        </section>

        {habits.length > 0 && (
          <div className="hidden lg:block">
            <TodayPanel habits={habits} logs={deferredLogs} selected={selected} today={today} />
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
    <div className="relative border-b border-line">
      <div
        ref={scroller}
        role="group"
        aria-label="Días"
        onKeyDown={onKeyDown}
        className="relative flex snap-x gap-1 overflow-x-auto px-3 pt-1 pb-3 [scrollbar-width:none] lg:px-5 lg:pt-4 [&::-webkit-scrollbar]:hidden"
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
                "relative flex h-[68px] w-[50px] shrink-0 snap-center flex-col items-center justify-center gap-1 rounded-[6px] transition-colors duration-200",
                active ? "bg-ink text-on-ink" : "text-fg hover:bg-surface-2",
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
              <span aria-hidden className="figure text-[23px]">
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
          "absolute top-[calc(50%-4px)] z-10 inline-flex h-8 -translate-y-1/2 items-center rounded-full bg-ink px-3.5 text-[12.5px] font-medium text-on-ink shadow-[0_4px_14px_-6px_rgba(0,0,0,0.45)] transition-[opacity,visibility] duration-[160ms] ease-out lg:top-[calc(50%+6px)]",
          todayOff === "left" ? "left-2" : "right-2",
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
    <div className="mt-8 grid justify-items-start gap-3 border-y border-line py-10">
      <p className="kicker">Hábitos</p>
      <h2 className="display text-[30px]">Todavía no hay hábitos</h2>
      <p className="max-w-[46ch] text-sm leading-relaxed text-muted">
        Creá el primero. Elegí la frecuencia (todos los días, algunos días o unas veces por semana) y marcalo acá cada día.
      </p>
      <Button variant="accent" onClick={onCreate}>
        <Plus size={16} weight="bold" /> Crear hábito
      </Button>
    </div>
  );
}
