"use client";

import { BellRinging } from "@phosphor-icons/react";
import type { ContextMenuItem } from "./context-menu";
import { notifyError, notifyInfo } from "./undo-toast";
import { addCustomReminder } from "@/lib/offline/push";
import { DEFAULT_CUSTOM_PREF } from "@/lib/reminder-logic";
import { TZ, todayISO } from "@/lib/dates";

const newId = () => (crypto.randomUUID?.() ?? `${Date.now()}${Math.random()}`).replace(/[^A-Za-z0-9]/g, "").slice(0, 20);

/** "Hoy a las 18:00", "el 3 dic a las 9:00". */
function whenText(date: string, hour: number, today: string): string {
  const h = `${String(hour).padStart(2, "0")}:00`;
  if (date === today) return `hoy a las ${h}`;
  const d = new Date(`${date}T12:00:00Z`);
  const label = new Intl.DateTimeFormat("es-UY", { day: "numeric", month: "short", timeZone: "UTC" }).format(d).replace(".", "");
  return `el ${label} a las ${h}`;
}

const nowHour = () => Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(new Date()));

/** Hora propuesta: una antes de la del bloque (los avisos salen en cualquier minuto de su hora). */
function suggestHour(start: string | null | undefined, date: string, today: string, nowHour: number): number {
  const clamp = (h: number) => Math.min(23, Math.max(6, h));
  if (start) return clamp(Number(start.slice(0, 2)) - 1);
  return date === today ? clamp(nowHour + 1) : 9;
}

/**
 * Ítem "Notificar" del clic derecho (bloques y tareas del Plan, Plan de hoy en Inicio):
 * crea un recordatorio propio de una sola vez que llega al celular y al reloj.
 */
function notifyMenuItem(o: { title: string; body: string; date: string; hour: number; today: string; url: string }): ContextMenuItem {
  return {
    label: "Notificar",
    icon: <BellRinging size={15} />,
    notify: {
      date: o.date < o.today ? o.today : o.date,
      hour: o.hour,
      today: o.today,
      onSave: (date, hour) => {
        addCustomReminder({ ...DEFAULT_CUSTOM_PREF, id: newId(), title: o.title, body: o.body, date, hour, url: o.url })
          .then(() => notifyInfo(`Te aviso ${whenText(date, hour, o.today)}`))
          .catch(() => notifyError("No se pudo guardar el aviso."));
      },
    },
  };
}

/** "Notificar" de un bloque del Plan: ese día, una hora antes de que empiece. */
export function notifyBlockItem(b: { title: string; date: string; startTime: string | null; endTime: string | null }): ContextMenuItem {
  const today = todayISO();
  const date = b.date < today ? today : b.date;
  const time = b.startTime ? ` · ${b.startTime}${b.endTime ? `–${b.endTime}` : ""}` : "";
  return notifyMenuItem({
    title: b.title,
    body: `Plan${time}`,
    date,
    hour: suggestHour(b.startTime, date, today, nowHour()),
    today,
    url: `/plan?semana=${date}`,
  });
}

/** "Notificar" de una tarea: el día del deadline (si ya pasó o no tiene, hoy). */
export function notifyTaskItem(t: { title: string; deadline: string | null }): ContextMenuItem {
  const today = todayISO();
  const date = t.deadline && t.deadline >= today ? t.deadline : today;
  return notifyMenuItem({
    title: t.title,
    body: t.deadline ? (t.deadline < today ? "Tarea vencida" : t.deadline === today ? "Tarea · vence hoy" : "Tarea · vence ese día") : "Tarea",
    date,
    hour: suggestHour(null, date, today, nowHour()),
    today,
    url: "/plan#tareas",
  });
}
