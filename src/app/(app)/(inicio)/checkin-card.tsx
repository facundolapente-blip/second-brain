"use client";

import { useRef, useState, useTransition } from "react";
import { BatteryHigh, Check, Minus, Moon, Plus, Scales, Smiley, Waves } from "@phosphor-icons/react";
import { saveCheckin } from "@/lib/checkin-actions";
import {
  ENERGY_LABELS,
  formatSleep,
  parseWeight,
  STRESS_LABELS,
  type CheckinDTO,
  type CheckinPatch,
} from "@/lib/checkin-logic";
import { MOODS } from "@/lib/journal-logic";
import { tone } from "@/lib/palette";
import { cx } from "@/components/ui";
import { MoodIcon } from "../journal/journal-ui";

/**
 * Check-in del día: ánimo, energía, estrés, sueño y peso en pocos toques.
 * Cada toque se guarda solo; se puede completar también el de ayer.
 */
export function CheckinCard({
  today,
  yesterday,
  lastWeightG,
}: {
  today: CheckinDTO;
  yesterday: CheckinDTO;
  lastWeightG: number | null;
}) {
  const [day, setDay] = useState<"today" | "yesterday">("today");
  const [data, setData] = useState({ today, yesterday });
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const cur = data[day];
  const filled = ["mood", "energy", "stress", "sleepMin", "weightG"].filter(
    (k) => cur[k as keyof CheckinDTO] !== null,
  ).length;

  function set(patch: CheckinPatch) {
    const key = day;
    setData((d) => ({ ...d, [key]: { ...d[key], ...patch } }));
    setSaved(false);
    start(async () => {
      await saveCheckin(data[key].date, patch);
      setSaved(true);
    });
  }

  return (
    <section
      aria-label="Check-in del día"
      style={{ "--i": 1 } as React.CSSProperties}
      className="rise grid gap-4 rounded-[20px] border border-line bg-surface p-4 lg:col-span-12 lg:p-5"
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span aria-hidden className="size-2 rounded-full bg-[var(--mod-inicio)]" />
        <h2 className="text-[15px] font-semibold tracking-tight">¿Cómo estás?</h2>
        <span className="tabular text-[12.5px] text-muted" aria-live="polite">
          {pending ? "Guardando…" : saved ? (
            <span className="inline-flex items-center gap-1">
              <Check size={12} weight="bold" aria-hidden /> Guardado
            </span>
          ) : (
            `${filled} de 5`
          )}
        </span>
        <div role="radiogroup" aria-label="Día" className="ml-auto inline-flex rounded-full bg-surface-2 p-1">
          {(["today", "yesterday"] as const).map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={day === d}
              onClick={() => setDay(d)}
              className={cx(
                "h-8 rounded-full px-3.5 text-[12.5px] font-medium transition-colors",
                day === d ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg",
              )}
            >
              {d === "today" ? "Hoy" : "Ayer"}
            </button>
          ))}
        </div>
      </header>

      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-[1.25fr_1fr_1fr_0.9fr_0.9fr]">
        <Row icon={<Smiley size={15} aria-hidden />} label="Ánimo" hint={MOODS.find((m) => m.value === cur.mood)?.label}>
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
                  onClick={() => set({ mood: on ? null : m.value })}
                  style={tone(m.color)}
                  className={cx(
                    "inline-flex h-11 items-center justify-center rounded-xl transition-[background-color,color,transform] duration-200 active:scale-95",
                    on ? "bg-tone text-tone-fg ring-2 ring-[var(--tone-solid)]" : "bg-surface-2 text-muted hover:text-fg",
                  )}
                >
                  <MoodIcon mood={m.value} size={22} weight={on ? "fill" : "regular"} />
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
    </section>
  );
}

function Row({ icon, label, hint, children }: { icon: React.ReactNode; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid content-start gap-2">
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
            onClick={() => onChange(value === v ? null : v)}
            className="flex h-11 items-end rounded-lg transition-transform active:scale-95"
          >
            <span
              className="w-full rounded-md transition-[background-color,height] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
              style={{ height: `${36 + i * 16}%`, background: on ? color : "var(--surface-3)" }}
            />
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

function Sleep({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  const step = (d: number) => onChange(Math.max(0, Math.min(16 * 60, (value ?? 7 * 60) + d)));
  return (
    <div className="flex h-11 items-center gap-1 rounded-xl bg-surface-2 p-1">
      <button
        type="button"
        aria-label="Media hora menos"
        onClick={() => step(-30)}
        className="inline-flex size-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-fg"
      >
        <Minus size={14} weight="bold" />
      </button>
      <button
        type="button"
        onClick={() => value === null && onChange(7 * 60)}
        className={cx("tabular flex-1 text-center text-[15px] font-semibold", value === null && "text-muted")}
      >
        {value === null ? "Cargar" : formatSleep(value)}
      </button>
      <button
        type="button"
        aria-label="Media hora más"
        onClick={() => step(30)}
        className="inline-flex size-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-fg"
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
