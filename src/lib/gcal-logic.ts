/**
 * Google Calendar ↔ Plan (sin base, se prueba en tests/gcal-logic.test.ts).
 *
 * Lo que manda Facu (2026-10-30): los eventos de su calendario entran al Plan como
 * bloques comunes; lo creado en la app nunca va a Google; y si a un bloque que vino
 * de Google le cambia el día o la hora en el Plan, ese cambio sí va a Google.
 */
import { addDays, TZ } from "./dates";

/** Lo que importa de un evento de la API de Google Calendar (v3). */
export type GEvent = {
  id: string;
  status?: string;
  summary?: string;
  updated?: string;
  eventType?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
};

export type BlockTimes = { date: string; startTime: string | null; endTime: string | null };

const partsFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Un instante a día y hora de Montevideo: "2026-10-30" y "15:30". */
export function localParts(iso: string): { date: string; time: string } | null {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const p = Object.fromEntries(partsFmt.formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/**
 * Día y horario del bloque que corresponde a un evento. Todo el día → bloque sin
 * hora en el primer día. Con hora → hora de inicio y de fin (sin fin si termina otro día).
 */
export function eventTimes(ev: GEvent): BlockTimes | null {
  if (ev.start?.date) return { date: ev.start.date, startTime: null, endTime: null };
  if (!ev.start?.dateTime) return null;
  const s = localParts(ev.start.dateTime);
  if (!s) return null;
  const e = ev.end?.dateTime ? localParts(ev.end.dateTime) : null;
  const endTime = e && e.date === s.date && e.time > s.time ? e.time : null;
  return { date: s.date, startTime: s.time, endTime };
}

/** Eventos que no son cosas para hacer (el lugar de trabajo del día) o que se cancelaron. */
export function skipEvent(ev: GEvent): boolean {
  return ev.status === "cancelled" || ev.eventType === "workingLocation" || !ev.start;
}

export function eventTitle(ev: GEvent): string {
  return (ev.summary ?? "").trim().slice(0, 120) || "(Sin título)";
}

export type SyncStep = "create" | "update" | "skip";

/**
 * Qué hacer con un evento de Google:
 * - sin bloque: se crea, salvo que ya se haya traído antes (el bloque se borró en la app: no vuelve);
 * - con bloque: se actualiza solo si Google lo cambió después de lo último que se vio
 *   (así un cambio hecho en la app no se pisa con la versión vieja de Google).
 */
export function syncStep(ev: GEvent, block: { externalUpdated: string | null } | undefined, known: boolean): SyncStep {
  if (!block) return known ? "skip" : "create";
  if (!ev.updated) return "skip";
  if (!block.externalUpdated) return "update";
  return Date.parse(ev.updated) > Date.parse(block.externalUpdated) ? "update" : "skip";
}

const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
/** Uruguay no tiene horario de verano desde 2015: siempre UTC−3. */
const at = (date: string, time: string) => new Date(`${date}T${time}:00-03:00`);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

type GTime = { date?: string; dateTime?: string; timeZone?: string };

/**
 * El inicio y el fin que tiene que tener el evento para quedar como el bloque.
 * Lo que el bloque no dice se conserva del evento: un "todo el día" de 3 días
 * sigue durando 3 días; un evento con hora sin fin en el bloque conserva su duración (o 1 h).
 */
export function eventPatch(block: BlockTimes, ev: GEvent): { start: GTime; end: GTime } {
  if (!block.startTime) {
    const span = ev.start?.date && ev.end?.date ? Math.max(1, daysBetween(ev.start.date, ev.end.date)) : 1;
    return { start: { date: block.date }, end: { date: addDays(block.date, span) } };
  }
  const start = at(block.date, block.startTime);
  let endMs: number;
  if (block.endTime && mins(block.endTime) > mins(block.startTime)) endMs = at(block.date, block.endTime).getTime();
  else {
    const prev = ev.start?.dateTime && ev.end?.dateTime ? Date.parse(ev.end.dateTime) - Date.parse(ev.start.dateTime) : NaN;
    endMs = start.getTime() + (Number.isFinite(prev) && prev > 0 ? prev : 60 * 60_000);
  }
  const iso = (ms: number) => {
    const p = localParts(new Date(ms).toISOString())!;
    return `${p.date}T${p.time}:00`;
  };
  return {
    start: { dateTime: iso(start.getTime()), timeZone: TZ },
    end: { dateTime: iso(endMs), timeZone: TZ },
  };
}

/** ¿El evento ya está como el bloque? (así no se manda un cambio que no cambia nada). */
export function samePatch(ev: GEvent, patch: { start: GTime; end: GTime }): boolean {
  if (patch.start.date) return ev.start?.date === patch.start.date && ev.end?.date === patch.end.date;
  if (!ev.start?.dateTime || !ev.end?.dateTime) return false;
  const a = localParts(ev.start.dateTime);
  const b = localParts(ev.end.dateTime);
  return `${a?.date}T${a?.time}:00` === patch.start.dateTime && `${b?.date}T${b?.time}:00` === patch.end.dateTime;
}

/**
 * Eventos ya traídos (id → día), para no volver a crear lo que se borró en la app.
 * Se olvidan los de hace más de 60 días (ya no entran en lo que se pide a Google).
 */
export function pruneKnown(known: Record<string, string>, today: string): Record<string, string> {
  const limit = addDays(today, -60);
  return Object.fromEntries(Object.entries(known).filter(([, d]) => d >= limit));
}
