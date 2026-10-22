"use client";

import { PillSwitch } from "@/components/pill-switch";
import { usePendingActions } from "@/lib/offline/queue";
import { useSafeTransition } from "@/components/safe-action";
import { useEffect, useRef, useState } from "react";
import { BatteryHigh, Brain, CaretDown, Check, Fire, Footprints, Heartbeat, Minus, Moon, Path, Plus, Scales, Smiley, Waves } from "@phosphor-icons/react";
import { saveCheckin } from "@/lib/offline/checkin";
import {
  ENERGY_LABELS,
  formatSleep,
  parseWeight,
  STRESS_LABELS,
  WATCH_SLOTS,
  watchSlotsFor,
  watchValues,
  type CheckinDTO,
  type CheckinPatch,
  type WatchDay,
  type WatchSlot,
} from "@/lib/checkin-logic";
import { STEPS_GOAL, stressLevel } from "@/lib/health-logic";
import { MOODS } from "@/lib/journal-logic";
import { tone } from "@/lib/palette";
import { cx } from "@/components/ui";
import { useTick } from "@/components/motion";
import { TintedCard } from "@/components/tinted-card";
import { haptic } from "@/components/haptics";
import { HOLD_CLASS, useHoldRepeat } from "../habitos/hold-repeat";
import { MoodIcon } from "../journal/journal-ui";

/**
 * Check-in del día: ánimo, energía, estrés, sueño y peso en pocos toques.
 * Cada toque se guarda solo; se puede completar también el de ayer.
 */
export function CheckinCard({
  today,
  yesterday,
  lastWeightG,
  watch,
  className,
}: {
  today: CheckinDTO;
  yesterday: CheckinDTO;
  lastWeightG: number | null;
  /** Lo que mandó el reloj (solo para leer); no cuenta en "N de 5". */
  watch: { today: WatchDay | null; yesterday: WatchDay | null };
  className?: string;
}) {
  const [day, setDay] = useState<"today" | "yesterday">("today");
  const [data, setData] = useState({ today, yesterday });
  // Lo cargado sin conexión (todavía sin subir) se retoma al abrir.
  const queued = usePendingActions().filter((o) => o.name === "checkin.saveCheckin");
  const [restored, setRestored] = useState(false);
  if (queued.length && !restored) {
    // Ajuste de estado al dibujar (una vez): lo cargado sin conexión se suma a lo del servidor.
    setRestored(true);
    const next = { today: { ...data.today }, yesterday: { ...data.yesterday } };
    for (const o of queued) {
      const patch = o.args[1] as CheckinPatch;
      if (o.args[0] === next.today.date) next.today = { ...next.today, ...patch };
      if (o.args[0] === next.yesterday.date) next.yesterday = { ...next.yesterday, ...patch };
    }
    setData(next);
  }
  const [saved, setSaved] = useState(false);
  const [pending, start] = useSafeTransition();
  const cur = data[day];
  const filled = countFilled(cur);
  // Con el de hoy completo arranca plegado: una línea con lo cargado.
  const [open, setOpen] = useState(() => countFilled(today) < 5);
  // Hoy ↔ Ayer: fundido de los valores (solo tras tocar).
  const [daySwap, setDaySwap] = useState(false);
  // El ánimo elegido aparece con un golpe corto, solo tras tocarlo (al cargar, quieto).
  const [tappedMood, setTappedMood] = useState<number | null>(null);
  // "N de 5" → "Guardando…" → "Guardado": los tres ocupan el mismo lugar (el ancho del
  // más largo) y se cruzan con un fundido, así nada se corre (antes el selector Hoy/Ayer
  // bajaba de renglón y la tarjeta saltaba ~45 px).
  const statusKey = pending ? "saving" : saved ? "saved" : "count";
  const filledTick = useTick(filled);
  // Datos del reloj: los que vinieron hoy o ayer (fila fija al cambiar de día).
  const watchSlots = watchSlotsFor([watch.today, watch.yesterday]);
  const hasWatch = watchSlots.length > 0;
  const summary = [
    MOODS.find((m) => m.value === cur.mood)?.label,
    cur.energy ? `Energía ${ENERGY_LABELS[cur.energy - 1].toLowerCase()}` : null,
    cur.stress ? `Estrés ${STRESS_LABELS[cur.stress - 1].toLowerCase()}` : null,
    cur.sleepMin !== null ? formatSleep(cur.sleepMin) : null,
    cur.weightG !== null ? `${String(cur.weightG / 1000).replace(".", ",")} kg` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // Los toques seguidos (bajar el sueño de a media hora, cambiar de idea) se juntan
  // en un solo guardado por día: se ve al instante y se manda al rato de soltar.
  const batch = useRef<{ day: "today" | "yesterday"; patch: CheckinPatch; before: typeof data; timer?: ReturnType<typeof setTimeout> } | null>(null);
  function send() {
    const b = batch.current;
    if (!b) return;
    batch.current = null;
    clearTimeout(b.timer);
    start(
      async () => {
        await saveCheckin(data[b.day].date, b.patch);
        setSaved(true);
      },
      // Si no se guardó, vuelve a como estaba: no mostrar algo que no quedó.
      { onError: () => setData(b.before) },
    );
  }
  // Lo que quedó sin mandar se manda igual al salir de la página o al ocultarla.
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  });
  useEffect(() => {
    const flush = () => sendRef.current();
    const onHide = () => document.visibilityState === "hidden" && flush();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
      flush();
    };
  }, []);
  function set(patch: CheckinPatch) {
    const key = day;
    if (batch.current && batch.current.day !== key) send();
    const b = (batch.current ??= { day: key, patch: {}, before: data });
    b.patch = { ...b.patch, ...patch };
    clearTimeout(b.timer);
    b.timer = setTimeout(send, 700);
    setData((d) => ({ ...d, [key]: { ...d[key], ...patch } }));
    setSaved(false);
  }

  const status = (
    <span className="tabular grid" aria-live="polite">
      <StatusLine on={statusKey === "count"}>
        <span key={filledTick.key} className={filledTick.className}>
          {filled}
        </span>{" "}
        de 5<span className="hidden sm:inline"> · cada toque se guarda solo</span>
      </StatusLine>
      <StatusLine on={statusKey === "saving"}>Guardando…</StatusLine>
      <StatusLine on={statusKey === "saved"}>
        <Check size={12} weight="bold" aria-hidden className={statusKey === "saved" ? "check-draw" : undefined} /> Guardado
      </StatusLine>
    </span>
  );

  // Tarjeta con cabecera teñida (diseño 4): el título pliega y despliega, el estado de
  // guardado va como dato (siempre en el mismo lugar) y Hoy/Ayer como acción.
  return (
    <TintedCard
      tone="inicio"
      icon={Smiley}
      className={cx("ini-check", className)}
      bodyClassName={cx("pt-[18px]!", !open && !summary && !hasWatch && "hidden!")}
      title={
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="checkin-cuerpo"
          aria-label="¿Cómo estás? Check-in del día"
          className="-my-3 -ml-1 inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-lg px-1"
        >
          <span className="truncate">¿Cómo estás?</span>
          <CaretDown size={13} weight="bold" aria-hidden className={cx("shrink-0 opacity-70 transition-transform duration-200", !open && "-rotate-90")} />
        </button>
      }
      meta={status}
      action={
        <PillSwitch
          label="Día"
          className="shrink-0"
          track="bg-surface shadow-[0_0_0_1px_var(--head-line)]"
          thumb="bg-[var(--head-bg)]"
          on="text-[var(--head-fg)]"
          value={day}
          options={[
            { value: "today", label: "Hoy" },
            { value: "yesterday", label: "Ayer" },
          ]}
          onChange={(d) => {
            setDaySwap(true);
            setDay(d);
          }}
          item="h-8 px-3.5 text-[12.5px]"
        />
      }
    >
      {!open && summary && (
        <button type="button" onClick={() => setOpen(true)} className="reveal truncate text-left text-[13.5px] text-muted">
          {summary}
        </button>
      )}
      {/* Plegado y la fila del reloj juntos: el espacio entre los dos va dentro del plegado,
          así plegado no queda un hueco doble. */}
      <div className="grid">
      {/* Plegado con el alto animado (lo de abajo sube de a poco, no de golpe). */}
      <div className="fold" data-closed={!open || undefined}>
      <div
        id="checkin-cuerpo"
        key={day}
        className={cx("grid grid-cols-2 gap-x-[18px] gap-y-[18px]", hasWatch && "pb-4", daySwap && "swap")}
      >
        <Row icon={<Smiley size={15} aria-hidden />} label="Ánimo" hint={MOODS.find((m) => m.value === cur.mood)?.label} className="col-span-2">
          <div className="grid grid-cols-5 gap-1.5">
            {MOODS.map((m) => {
              const on = cur.mood === m.value;
              return (
                <button
                  key={m.value}
                  type="button"
                  aria-pressed={on}
                  aria-label={m.label}
                  title={m.label}
                  onClick={() => {
                    haptic("select");
                    setTappedMood(on ? null : m.value);
                    set({ mood: on ? null : m.value });
                  }}
                  style={tone(m.color)}
                  className={cx(
                    "inline-flex h-11 items-center justify-center rounded-xl transition-[background-color,color,transform] duration-200 active:scale-95",
                    on ? "bg-tone text-tone-fg ring-2 ring-[var(--tone-solid)]" : "bg-surface-2 text-muted hover:text-fg",
                  )}
                >
                  <span key={on ? "on" : "off"} className={cx("inline-flex", on && tappedMood === m.value && "mark-pop")}>
                    <MoodIcon mood={m.value} size={22} weight={on ? "fill" : "regular"} />
                  </span>
                </button>
              );
            })}
          </div>
        </Row>

        <Row icon={<BatteryHigh size={15} aria-hidden />} label="Energía" hint={cur.energy ? ENERGY_LABELS[cur.energy - 1] : undefined}>
          <Scale value={cur.energy} labels={ENERGY_LABELS} color="var(--c-habitos)" onChange={(v) => set({ energy: v })} />
        </Row>

        <Row icon={<Waves size={15} aria-hidden />} label="Estrés" hint={cur.stress ? STRESS_LABELS[cur.stress - 1] : undefined}>
          <Scale value={cur.stress} labels={STRESS_LABELS} color="var(--c-plan)" onChange={(v) => set({ stress: v })} />
        </Row>

        <Row icon={<Moon size={15} aria-hidden />} label="Sueño">
          <Sleep value={cur.sleepMin} onChange={(v) => set({ sleepMin: v })} />
        </Row>

        <Row icon={<Scales size={15} aria-hidden />} label="Peso">
          <Weight key={`${day}-${cur.weightG}`} value={cur.weightG} placeholderG={lastWeightG} onSave={(g) => set({ weightG: g })} />
        </Row>
      </div>
      </div>
      {hasWatch && <WatchStrip key={day} slots={watchSlots} watch={watch[day]} swap={daySwap} />}
      </div>
    </TintedCard>
  );
}

/**
 * Lo que midió el reloj ese día, solo para leer: siempre los mismos casilleros para Hoy y
 * Ayer (el que no vino va con "–"), en una grilla de 3 columnas en el celular, así al
 * cambiar de día nada se corre. Se ve también con la tarjeta plegada.
 */
function WatchStrip({ slots, watch, swap }: { slots: ReturnType<typeof watchSlotsFor>; watch: WatchDay | null; swap: boolean }) {
  const values = watchValues(watch);
  const shown = WATCH_SLOTS.filter((s) => slots.includes(s.id));
  return (
    <div className="grid gap-2 border-t border-line pt-3" aria-label="Datos del reloj" role="group">
      <div className={cx("relative", swap && "swap")}>
        {/* Un día sin nada del reloj ocupa lo mismo (los casilleros quedan invisibles) y lo dice. */}
        <dl
          aria-hidden={!watch || undefined}
          className={cx("grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))]", !watch && "invisible")}
        >
          {shown.map((s) => {
            // Cada medida con su color, como en Salud (el estrés, el de su nivel).
            const color = s.id === "stress" && watch?.stressScore != null ? stressLevel(watch.stressScore).tone : WATCH_LOOK[s.id].color;
            const Ico = WATCH_LOOK[s.id].icon;
            const steps = s.id === "steps" ? watch?.steps : null;
            return (
              <div
                key={s.id}
                style={{ ...tone(color), background: `color-mix(in oklab, var(--p-${color}-chip) 12%, var(--surface))` }}
                className={cx("grid min-w-0 content-start gap-1 rounded-xl px-3 py-2.5", s.id === "steps" && "col-span-2 sm:col-span-1")}
              >
                <dt className="flex items-center gap-1.5 text-[12px] font-medium text-fg">
                  <span className="chip-solid inline-flex size-6 shrink-0 items-center justify-center rounded-full">
                    <Ico size={13} weight="fill" aria-hidden />
                  </span>
                  {s.label}
                </dt>
                <dd className="truncate font-mono text-[18px] font-semibold text-fg tabular">{values[s.id] ?? "–"}</dd>
                {steps != null && (
                  // Los pasos con su meta del día (8.000, la misma de Salud).
                  <dd className="grid gap-1">
                    <span className="block h-1.5 overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--p-green-chip)_22%,var(--surface))]">
                      <span className="block h-full rounded-full bg-[var(--p-green-chip)]" style={{ width: `${Math.min(100, (steps / STEPS_GOAL) * 100)}%` }} />
                    </span>
                    <span className="text-[11.5px] text-muted">
                      {steps >= STEPS_GOAL ? "Meta de 8.000 cumplida" : `Faltan ${(STEPS_GOAL - steps).toLocaleString("es-UY")} para 8.000`}
                    </span>
                  </dd>
                )}
              </div>
            );
          })}
        </dl>
        {!watch && <p className="absolute inset-0 text-[12.5px] text-muted">Todavía no llegó nada del reloj para este día.</p>}
      </div>
    </div>
  );
}

/** Color e ícono de cada dato del reloj (los mismos que en Salud). */
const WATCH_LOOK: Record<WatchSlot, { color: string; icon: typeof Footprints }> = {
  steps: { color: "green", icon: Footprints },
  stress: { color: "blue", icon: Brain },
  pulse: { color: "red", icon: Heartbeat },
  distance: { color: "teal", icon: Path },
  kcal: { color: "orange", icon: Fire },
};

/** Un estado del renglón de guardado: todos en la misma celda, visible solo el actual. */
function StatusLine({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <span
      aria-hidden={!on}
      className={cx(
        "col-start-1 row-start-1 inline-flex items-center gap-1 whitespace-nowrap transition-opacity duration-[160ms] ease-out",
        !on && "opacity-0",
      )}
    >
      {children}
    </span>
  );
}

function countFilled(c: CheckinDTO) {
  return (["mood", "energy", "stress", "sleepMin", "weightG"] as const).filter((k) => c[k] !== null).length;
}

function Row({ icon, label, hint, children, className }: { icon: React.ReactNode; label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cx("grid min-w-0 content-start gap-2", className)}>
      <p className="flex items-center gap-1.5 text-[12.5px] text-muted">
        {icon}
        <span className="font-medium text-fg">{label}</span>
        {hint && <span className="truncate font-medium text-fg">· {hint}</span>}
      </p>
      {children}
    </div>
  );
}

/** Escala de 1 a 5 como barras que crecen, con los extremos escritos debajo. */
function Scale({
  value,
  labels,
  color,
  onChange,
}: {
  value: number | null;
  labels: string[];
  color: string;
  onChange: (v: number | null) => void;
}) {
  // Lo que se enciende se llena de abajo hacia arriba, una barra tras otra desde la que ya
  // estaba (y se vacía de la más alta hacia abajo): se lee que la escala sube o baja.
  const [last, setLast] = useState({ value, prev: value });
  if (last.value !== value) setLast({ value, prev: last.value });
  const prev = last.value !== value ? last.value : last.prev;
  return (
    <div className="grid gap-1">
    <div className="grid h-11 grid-cols-5 items-end gap-1.5">
      {labels.map((l, i) => {
        const v = i + 1;
        const on = value !== null && v <= value;
        return (
          <button
            key={l}
            type="button"
            aria-pressed={value === v}
            aria-label={`${v}: ${l}`}
            title={l}
            onClick={() => {
              haptic("select");
              onChange(value === v ? null : v);
            }}
            className="flex h-11 items-end rounded-lg transition-[scale] duration-[var(--dur-press)] active:scale-95"
          >
            <span className="relative w-full overflow-hidden rounded-md bg-surface-3" style={{ height: `${36 + i * 16}%` }}>
              <span
                aria-hidden
                className={cx(
                  "absolute inset-0 origin-bottom [transform:scaleY(var(--fill))] transition-[transform,opacity] duration-300 ease-[var(--ease-out)]",
                  "motion-reduce:[transform:none] motion-reduce:duration-[120ms]",
                  !on && "motion-reduce:opacity-0",
                )}
                style={
                  {
                    background: color,
                    "--fill": on ? 1 : 0,
                    transitionDelay: `${fillDelay(v, value, prev)}ms`,
                  } as React.CSSProperties
                }
              />
            </span>
          </button>
        );
      })}
    </div>
    <div aria-hidden className="flex justify-between text-[11px] text-muted">
      <span>{labels[0]}</span>
      <span>{labels[labels.length - 1]}</span>
    </div>
    </div>
  );
}

/** Retraso de cada barra al cambiar la escala: en orden desde la que ya estaba (tope ~120 ms). */
function fillDelay(v: number, value: number | null, prev: number | null) {
  const now = value ?? 0;
  const before = prev ?? 0;
  if (now > before && v > before && v <= now) return Math.min(4, v - before - 1) * 35;
  if (now < before && v > now && v <= before) return Math.min(4, before - v) * 30;
  return 0;
}

function Sleep({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  // Bajar de media hora lo borra (vuelve a "Cargar"): "0 h" no es un dato.
  const step = (d: number) => {
    const next = Math.min(16 * 60, (value ?? 7 * 60) + d);
    onChange(value !== null && next < 30 ? null : Math.max(30, next));
  };
  // La cifra nueva entra desde abajo si subió y desde arriba si bajó.
  const tick = useTick(value ?? 0);
  // Mantener apretado + o − repite cada 120 ms (desde los 400 ms); se guarda una vez al
  // final, porque los toques seguidos se juntan en un solo guardado.
  const less = useHoldRepeat(() => step(-30));
  const more = useHoldRepeat(() => step(30));
  return (
    <div className="flex h-11 items-center gap-1 rounded-xl bg-surface-2 p-1">
      <button
        type="button"
        aria-label="Media hora menos"
        {...less}
        className={cx(HOLD_CLASS, "inline-flex size-9 items-center justify-center rounded-lg text-muted transition-[color,background-color,scale] duration-[var(--dur-quick)] hover:bg-surface hover:text-fg active:scale-90 motion-reduce:active:scale-100")}
      >
        <Minus size={14} weight="bold" />
      </button>
      <button
        type="button"
        onClick={() => value === null && onChange(7 * 60)}
        className={cx("tabular h-full flex-1 text-center text-[15px] font-semibold", value === null && "text-muted")}
      >
        <span key={tick.key} className={tick.className}>
          {value === null ? "Cargar" : formatSleep(value)}
        </span>
      </button>
      <button
        type="button"
        aria-label="Media hora más"
        {...more}
        className={cx(HOLD_CLASS, "inline-flex size-9 items-center justify-center rounded-lg text-muted transition-[color,background-color,scale] duration-[var(--dur-quick)] hover:bg-surface hover:text-fg active:scale-90 motion-reduce:active:scale-100")}
      >
        <Plus size={14} weight="bold" />
      </button>
    </div>
  );
}

function Weight({ value, placeholderG, onSave }: { value: number | null; placeholderG: number | null; onSave: (g: number | null) => void }) {
  const [text, setText] = useState(value === null ? "" : String(value / 1000).replace(".", ","));
  const [bad, setBad] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  function commit() {
    if (text.trim() === "") {
      if (value !== null) onSave(null);
      setBad(false);
      return;
    }
    const g = parseWeight(text);
    setBad(g === null);
    if (g !== null && g !== value) onSave(g);
  }
  return (
    <label className={cx("flex h-11 items-center gap-1 rounded-xl bg-surface-2 px-3", bad && "ring-2 ring-[var(--st-fail-line)]")}>
      <input
        ref={ref}
        inputMode="decimal"
        aria-label="Peso en kilos"
        value={text}
        placeholder={placeholderG ? String(placeholderG / 1000).replace(".", ",") : "Kilos"}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && ref.current?.blur()}
        className="tabular w-full min-w-0 bg-transparent text-[15px] font-semibold outline-none placeholder:font-normal placeholder:text-faint"
      />
      <span className="text-[13px] text-muted">kg</span>
    </label>
  );
}
