"use client";

import { useState } from "react";
import { CalendarCheck, House, Medal, Notebook, Wallet, type Icon } from "@phosphor-icons/react";
import { TintedCard } from "@/components/tinted-card";
import { cx, inputClass } from "@/components/ui";
import { HabitAvatar } from "@/lib/habit-icons";
import {
  DAY_LETTER,
  DAY_NAME,
  DEFAULT_HABIT_PREF,
  REMINDER_GROUPS,
  REMINDER_HOURS,
  REMINDER_INFO,
  REMINDER_KINDS,
  WEEK_ORDER,
  daysText,
  type PushPayload,
  type ReminderGroup,
  type ReminderKind,
  type ReminderPref,
  type ReminderPrefs,
} from "@/lib/reminder-logic";

export type DeviceChoice = { id: string; label: string; here: boolean };
export type HabitChoice = { id: string; name: string; icon: string; color: string };

const GROUP_ICON: Record<ReminderGroup, Icon> = { inicio: House, habitos: Medal, journal: Notebook, gastos: Wallet, plan: CalendarCheck };
export const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

/**
 * Qué avisos llegan (Avisos, Herramientas): una tarjeta por módulo con su color y, en
 * Hábitos, un aviso propio por hábito. Cada aviso prendido elige hora, días y aparatos.
 */
export function ReminderGroups({
  prefs,
  onChange,
  preview,
  habitPreview,
  habits,
  devices,
}: {
  prefs: ReminderPrefs;
  onChange: (next: ReminderPrefs) => void;
  preview: Record<ReminderKind, PushPayload | null>;
  habitPreview: Record<string, PushPayload | null>;
  habits: HabitChoice[];
  devices: DeviceChoice[];
}) {
  const setKind = (k: ReminderKind, patch: Partial<ReminderPref>) => onChange({ ...prefs, [k]: { ...prefs[k], ...patch } });
  const setHabit = (id: string, patch: Partial<ReminderPref>) =>
    onChange({ ...prefs, habits: { ...prefs.habits, [id]: { ...(prefs.habits[id] ?? DEFAULT_HABIT_PREF), ...patch } } });

  return (
    <>
      {REMINDER_GROUPS.map((g) => {
        const kinds = REMINDER_KINDS.filter((k) => REMINDER_INFO[k].group === g.id);
        const on = kinds.filter((k) => prefs[k].on).length;
        const habitOn = g.id === "habitos" ? habits.filter((h) => prefs.habits[h.id]?.on).length : 0;
        return (
          <TintedCard
            key={g.id}
            tone={g.id}
            icon={GROUP_ICON[g.id]}
            title={g.label}
            meta={`${on} de ${kinds.length} ${kinds.length === 1 ? "prendido" : "prendidos"}${habitOn ? ` · ${habitOn} por hábito` : ""}`}
            bodyClassName="gap-0! p-0!"
          >
            <ul className="grid divide-y divide-line">
              {kinds.map((k) => (
                <ReminderRow
                  key={k}
                  id={`aviso-${k}`}
                  title={REMINDER_INFO[k].label}
                  hint={REMINDER_INFO[k].hint}
                  pref={prefs[k]}
                  onChange={(patch) => setKind(k, patch)}
                  devices={devices}
                  preview={preview[k]}
                />
              ))}
            </ul>
            {g.id === "habitos" && habits.length > 0 && (
              <div className="border-t border-line">
                <div className="grid gap-0.5 px-4 pt-4 pb-2 lg:px-5">
                  <h3 className="font-mono text-[11px] tracking-[0.1em] text-muted uppercase">Por hábito</h3>
                  <p className="text-[13px] leading-relaxed text-muted">
                    Un aviso con el nombre del hábito a la hora que elijas, solo los días que toca y si todavía no lo marcaste.
                  </p>
                </div>
                <ul className="grid divide-y divide-line">
                  {habits.map((h) => (
                    <ReminderRow
                      key={h.id}
                      id={`aviso-habito-${h.id}`}
                      title={h.name}
                      lead={<HabitAvatar icon={h.icon} color={h.color} size={30} />}
                      pref={prefs.habits[h.id] ?? { ...DEFAULT_HABIT_PREF, on: false }}
                      onChange={(patch) => setHabit(h.id, patch)}
                      devices={devices}
                      preview={prefs.habits[h.id]?.on ? (habitPreview[h.id] ?? null) : undefined}
                      compact
                    />
                  ))}
                </ul>
              </div>
            )}
          </TintedCard>
        );
      })}
    </>
  );
}

function ReminderRow({
  id,
  title,
  hint,
  lead,
  pref,
  onChange,
  devices,
  preview,
  compact,
}: {
  id: string;
  title: string;
  hint?: string;
  lead?: React.ReactNode;
  pref: ReminderPref;
  onChange: (patch: Partial<ReminderPref>) => void;
  devices: DeviceChoice[];
  /** undefined = sin vista previa (un hábito recién prendido todavía no la tiene). */
  preview?: PushPayload | null;
  compact?: boolean;
}) {
  // Lo que se despliega entra con `reveal` solo después de tocar (nada se mueve al cargar).
  const [touched, setTouched] = useState(false);
  const summary = `${hh(pref.hour)} · ${daysText(pref.days)}`;
  return (
    <li className={cx("grid gap-3 px-4 lg:px-5", compact ? "py-3" : "py-4")}>
      <div className="flex items-center gap-3">
        {lead}
        <div className="grid min-w-0 flex-1 gap-0.5">
          <label htmlFor={id} className="text-[15px] font-medium">
            {title}
          </label>
          {pref.on ? (
            <p className="font-mono text-[12.5px] text-muted">{summary}</p>
          ) : (
            hint && <p className="text-[13px] leading-relaxed text-muted">{hint}</p>
          )}
        </div>
        <Switch
          id={id}
          checked={pref.on}
          onChange={(on) => {
            setTouched(true);
            onChange({ on });
          }}
        />
      </div>
      {pref.on && (
        <div className={cx("grid gap-3", touched && "reveal", !!lead && "lg:pl-[42px]")}>
          {hint && !compact && <p className="-mt-2 text-[13px] leading-relaxed text-muted">{hint}</p>}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <label className="flex items-center gap-2 text-[13.5px] whitespace-nowrap text-muted">
              A las
              <select
                value={pref.hour}
                onChange={(e) => onChange({ hour: Number(e.target.value) })}
                className={cx(inputClass, "h-10 w-auto font-mono text-[16px] pointer-fine:text-[14px]")}
              >
                {REMINDER_HOURS.map((h) => (
                  <option key={h} value={h}>
                    {hh(h)}
                  </option>
                ))}
              </select>
            </label>
            <DayPicker days={pref.days} onChange={(days) => onChange({ days })} />
          </div>
          {devices.length > 1 && <DevicePicker value={pref.devices} devices={devices} onChange={(d) => onChange({ devices: d })} />}
          {preview !== undefined && (
            <div className="rounded-xl bg-surface-2 p-3 text-[13px] leading-relaxed">
              <p className="font-mono text-[11px] tracking-[0.08em] text-muted uppercase">Si fuera ahora</p>
              {preview ? (
                <>
                  <p className="mt-1 font-medium text-fg">{preview.title}</p>
                  <p className="text-muted">{preview.body}</p>
                </>
              ) : (
                <p className="mt-1 text-muted">No habría nada para avisar.</p>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/** Los siete días (lunes primero), cada uno se prende y apaga; al menos uno queda. */
export function DayPicker({ days, onChange }: { days: number[]; onChange: (days: number[]) => void }) {
  const set = new Set(days);
  return (
    <div role="group" aria-label="Días de la semana" className="flex gap-1">
      {WEEK_ORDER.map((d) => {
        const on = set.has(d);
        return (
          <button
            key={d}
            type="button"
            aria-pressed={on}
            aria-label={DAY_NAME[d]}
            title={DAY_NAME[d]}
            onClick={() => {
              const next = on ? days.filter((x) => x !== d) : [...days, d];
              if (next.length) onChange(next.sort((a, b) => a - b));
            }}
            className={cx(
              "press grid size-9 place-items-center rounded-full font-mono text-[13px] transition-colors duration-[var(--dur-quick)]",
              on ? "bg-accent font-semibold text-on-accent" : "border border-line text-muted hover:bg-surface-2",
            )}
          >
            {DAY_LETTER[d]}
          </button>
        );
      })}
    </div>
  );
}

/** A qué aparatos va: "Todos" o los elegidos (si se sacan todos, vuelve a "Todos"). */
export function DevicePicker({
  value,
  devices,
  onChange,
}: {
  value: string[] | null;
  devices: DeviceChoice[];
  onChange: (v: string[] | null) => void;
}) {
  const chosen = new Set(value ?? []);
  const all = !value || !devices.some((d) => chosen.has(d.id));
  const chip = (active: boolean) =>
    cx(
      "press inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] transition-colors duration-[var(--dur-quick)]",
      active ? "bg-accent font-semibold text-on-accent" : "border border-line text-muted hover:bg-surface-2",
    );
  return (
    <div className="grid gap-1.5">
      <span className="text-[13.5px] text-muted">Llega a</span>
      <div role="group" aria-label="Aparatos" className="flex flex-wrap gap-1.5">
        <button type="button" aria-pressed={all} onClick={() => onChange(null)} className={chip(all)}>
          Todos
        </button>
        {devices.map((d) => {
          const on = !all && chosen.has(d.id);
          return (
            <button
              key={d.id}
              type="button"
              aria-pressed={on}
              onClick={() => {
                const base = all ? [] : [...chosen];
                const next = on ? base.filter((x) => x !== d.id) : [...base, d.id];
                onChange(next.length && next.length < devices.length ? next : null);
              }}
              className={chip(on)}
            >
              {d.label}
              {d.here && <span className={cx("text-[12px]", on ? "opacity-80" : "text-faint")}>· este</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Switch({ id, checked, onChange }: { id: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors before:absolute before:-inset-2 before:content-['']",
        checked ? "bg-accent" : "bg-faint",
      )}
    >
      <span
        aria-hidden
        className={cx(
          "inline-block size-5 rounded-full bg-surface shadow-sm transition-transform duration-150 motion-reduce:transition-none",
          checked ? "translate-x-6" : "translate-x-1",
        )}
      />
    </button>
  );
}
