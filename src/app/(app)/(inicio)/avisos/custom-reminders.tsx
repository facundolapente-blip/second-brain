"use client";

import { useRef, useState } from "react";
import { BellRinging, CalendarBlank, Plus } from "@phosphor-icons/react";
import { TintedCard } from "@/components/tinted-card";
import { Button, ConfirmButton, Field, Input, Sheet, cx, inputClass, type SheetHandle } from "@/components/ui";
import { PillSwitch } from "@/components/pill-switch";
import { DatePicker } from "@/components/date-picker";
import { addDays, formatLong } from "@/lib/dates";
import {
  CUSTOM_BODY_MAX,
  CUSTOM_MAX,
  CUSTOM_TITLE_MAX,
  DEFAULT_CUSTOM_PREF,
  REMINDER_HOURS,
  customPast,
  daysText,
  type CustomReminder,
} from "@/lib/reminder-logic";
import { DayPicker, DevicePicker, Switch, hh, type DeviceChoice } from "./reminder-rows";

const newId = () => (crypto.randomUUID?.() ?? `${Date.now()}${Math.random()}`).replace(/[^A-Za-z0-9]/g, "").slice(0, 20);

/** "Domingos a las 18:00", "Una vez · jueves 3 de diciembre · 09:00". */
function whenText(c: CustomReminder, today: string): string {
  if (c.date) return `Una vez · ${formatLong(c.date, today)} · ${hh(c.hour)}`;
  return `${daysText(c.days)} · ${hh(c.hour)}`;
}

/**
 * Recordatorios propios (Avisos): Facu escribe el texto y elige hora, días (o un día) y
 * aparatos. Se guardan con el resto de los avisos (`AppSetting "avisos"`, `custom`).
 */
export function CustomReminders({
  items,
  onChange,
  devices,
  today,
}: {
  items: CustomReminder[];
  onChange: (next: CustomReminder[]) => void;
  devices: DeviceChoice[];
  today: string;
}) {
  const sheet = useRef<SheetHandle>(null);
  const [draft, setDraft] = useState<CustomReminder | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function open(c?: CustomReminder) {
    setIsNew(!c);
    setError(null);
    setDraft(c ? { ...c } : { ...DEFAULT_CUSTOM_PREF, id: newId(), title: "", body: "", date: null });
    sheet.current?.open();
  }
  function save() {
    if (!draft) return;
    const title = draft.title.replace(/\s+/g, " ").trim();
    if (!title) {
      setError("Escribile un título.");
      return;
    }
    const clean = { ...draft, title, body: draft.body.trim() };
    onChange(isNew ? [...items, clean] : items.map((c) => (c.id === clean.id ? clean : c)));
    sheet.current?.close();
  }
  const set = (patch: Partial<CustomReminder>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const on = items.filter((c) => c.on && !customPast(c, today)).length;
  const full = items.length >= CUSTOM_MAX;

  return (
    <TintedCard
      tone="inicio"
      icon={BellRinging}
      title="Mis recordatorios"
      meta={items.length ? `${on} de ${items.length} ${items.length === 1 ? "prendido" : "prendidos"}` : "Los que escribís vos"}
      action={
        <button type="button" className="tcard-pill press" onClick={() => open()} disabled={full}>
          <Plus size={14} weight="bold" aria-hidden />
          Nuevo
        </button>
      }
      bodyClassName="gap-0! p-0!"
    >
      {items.length === 0 ? (
        <div className="grid justify-items-start gap-3 px-4 py-4 lg:px-5">
          <p className="max-w-[56ch] text-[13.5px] leading-relaxed text-muted">
            Escribí lo que quieras que te avise: “Llamar a la abuela” los domingos a las 18, “Pagar la luz” el 10, “Tomar agua” todos los días a las 15.
          </p>
          <Button size="sm" onClick={() => open()}>
            <Plus size={15} aria-hidden />
            Crear un recordatorio
          </Button>
        </div>
      ) : (
        <ul className="grid divide-y divide-line">
          {items.map((c) => {
            const past = customPast(c, today);
            return (
              <li key={c.id} className="flex items-center gap-3 px-4 py-3 lg:px-5">
                <button type="button" onClick={() => open(c)} className="tap-tint grid min-w-0 flex-1 gap-0.5 rounded-lg text-left">
                  <span className={cx("truncate text-[15px] font-medium", past && "text-muted")}>{c.title}</span>
                  {c.body && <span className="truncate text-[13px] text-muted">{c.body}</span>}
                  <span className="flex items-center gap-1.5 font-mono text-[12.5px] text-muted">
                    {c.date && <CalendarBlank size={13} aria-hidden />}
                    {past ? "Ya pasó · " : ""}
                    {whenText(c, today)}
                  </span>
                </button>
                <Switch
                  id={`propio-${c.id}`}
                  checked={c.on && !past}
                  onChange={(v) => onChange(items.map((x) => (x.id === c.id ? { ...x, on: v, date: v && past ? null : x.date } : x)))}
                />
              </li>
            );
          })}
        </ul>
      )}

      <Sheet ref={sheet} title={isNew ? "Nuevo recordatorio" : "Editar recordatorio"}>
        {draft && (
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <Field label="Qué te recuerdo">
              <Input
                value={draft.title}
                maxLength={CUSTOM_TITLE_MAX}
                onChange={(e) => {
                  set({ title: e.target.value });
                  setError(null);
                }}
                placeholder="Llamar a la abuela"
                autoFocus={isNew}
              />
            </Field>
            <Field label="Texto (opcional)">
              <textarea
                lang="es"
                spellCheck
                rows={2}
                value={draft.body}
                maxLength={CUSTOM_BODY_MAX}
                onChange={(e) => set({ body: e.target.value })}
                placeholder="Lo que quieras ver en el aviso"
                className={cx(inputClass, "min-h-20 py-2.5")}
              />
            </Field>

            <div className="grid gap-3">
              <PillSwitch
                label="Cuándo"
                value={draft.date ? "una" : "repite"}
                options={[
                  { value: "repite", label: "Se repite" },
                  { value: "una", label: "Un día" },
                ]}
                onChange={(v) => set({ date: v === "una" ? (draft.date ?? addDays(today, 1)) : null })}
                className="w-fit"
              />
              <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                {draft.date ? (
                  <DatePicker
                    value={draft.date}
                    today={today}
                    clearable={false}
                    shortcuts={[
                      { label: "Hoy", date: today },
                      { label: "Mañana", date: addDays(today, 1) },
                      { label: "En una semana", date: addDays(today, 7) },
                    ]}
                    label="Día del recordatorio"
                    triggerClassName={cx(inputClass, "inline-flex h-10 w-auto items-center gap-2")}
                    onChange={(d) => d && set({ date: d })}
                  >
                    <CalendarBlank size={16} aria-hidden />
                    {formatLong(draft.date, today)}
                  </DatePicker>
                ) : (
                  <DayPicker days={draft.days} onChange={(days) => set({ days })} />
                )}
                <label className="flex items-center gap-2 text-[13.5px] whitespace-nowrap text-muted">
                  A las
                  <select
                    value={draft.hour}
                    onChange={(e) => set({ hour: Number(e.target.value) })}
                    className={cx(inputClass, "h-10 w-auto font-mono text-[16px] pointer-fine:text-[14px]")}
                  >
                    {REMINDER_HOURS.map((h) => (
                      <option key={h} value={h}>
                        {hh(h)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {devices.length > 1 && <DevicePicker value={draft.devices} devices={devices} onChange={(d) => set({ devices: d })} />}

            {error && <p className="text-[13px] text-[var(--st-fail-fg)]">{error}</p>}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button type="submit">{isNew ? "Crear" : "Guardar"}</Button>
              {!isNew && (
                <ConfirmButton
                  onConfirm={() => {
                    onChange(items.filter((c) => c.id !== draft.id));
                    sheet.current?.close();
                  }}
                >
                  Borrar
                </ConfirmButton>
              )}
            </div>
          </form>
        )}
      </Sheet>
    </TintedCard>
  );
}
