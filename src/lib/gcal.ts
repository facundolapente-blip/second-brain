import "server-only";
import { prisma } from "./prisma";
import { addDays, fromDbDate, toDbDate, todayISO } from "./dates";
import { topSortKey } from "./plan-logic";
import { eventPatch, eventTimes, eventTitle, pruneKnown, samePatch, skipEvent, syncStep, type GEvent } from "./gcal-logic";

/**
 * Google Calendar → Plan (ver gcal-logic.ts). Facu conecta su cuenta una vez desde
 * Datos ("Conectar Google Calendar", `/api/google/conectar` → `/api/google/callback`):
 * el permiso de Google (OAuth, solo `calendar.events`) deja un refresh token que se
 * guarda en `AppSetting "google_calendar_token"` (fuera de los respaldos). Las claves
 * de cuenta de servicio no se pudieron usar: la organización de Google Cloud de Facu
 * las bloquea (política `iam.disableServiceAccountKeyCreation`, 2026-10-30).
 * - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: el cliente web de Google Cloud.
 * Estado en `AppSetting "google_calendar"` (última sincronización, error y los
 * eventos ya traídos, para que lo borrado en la app no vuelva).
 */
const KEY = "google_calendar";
export const GCAL_TOKEN_KEY = "google_calendar_token";
const SOURCE = "gcal";
const API = "https://www.googleapis.com/calendar/v3/calendars/primary";
export const GCAL_SCOPE = "https://www.googleapis.com/auth/calendar.events";
/** Lo que se pide: una semana para atrás y cuatro meses para adelante. */
const PAST_DAYS = 7;
const FUTURE_DAYS = 120;
/** Al abrir el Plan se sincroniza como mucho cada 5 minutos. */
const THROTTLE_MS = 5 * 60_000;

type State = { lastSync?: string; lastError?: string | null; known?: Record<string, string>; created?: number };

/** El cliente web de Google Cloud (variables de entorno). */
export function gcalClient(): { id: string; secret: string } | null {
  const id = process.env.GOOGLE_CLIENT_ID?.trim();
  const secret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  return id && secret ? { id, secret } : null;
}

async function readToken(): Promise<string | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: GCAL_TOKEN_KEY } });
  return row?.value || null;
}

export async function saveGcalToken(refreshToken: string) {
  await prisma.appSetting.upsert({ where: { key: GCAL_TOKEN_KEY }, create: { key: GCAL_TOKEN_KEY, value: refreshToken }, update: { value: refreshToken } });
  cachedToken = null;
}

export async function forgetGcal() {
  await prisma.appSetting.deleteMany({ where: { key: GCAL_TOKEN_KEY } });
  cachedToken = null;
}

/** Hay cliente y Facu ya conectó su cuenta. */
export async function gcalReady(): Promise<boolean> {
  return !!gcalClient() && !!(await readToken());
}

async function readState(): Promise<State> {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  try {
    return row?.value ? (JSON.parse(row.value) as State) : {};
  } catch {
    return {};
  }
}

async function writeState(s: State) {
  const value = JSON.stringify(s);
  await prisma.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
}

let cachedToken: { token: string; exp: number } | null = null;

/** Token de acceso (vale 1 h) a partir del refresh token guardado. */
async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.token;
  const client = gcalClient();
  const refresh = await readToken();
  if (!client || !refresh) throw new Error("Google Calendar no está conectado");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: client.id, client_secret: client.secret, refresh_token: refresh, grant_type: "refresh_token" }),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) {
    // invalid_grant: el permiso se revocó o venció (app de Google sin publicar: 7 días).
    throw new Error(r.status === 400 ? "Google ya no acepta el permiso: volvé a conectar Google Calendar en Datos" : `Google respondió ${r.status} al renovar el permiso`);
  }
  const j = (await r.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return j.access_token;
}

/** Cambia el código que devuelve Google al volver del permiso por el refresh token. */
export async function exchangeGcalCode(code: string, redirectUri: string): Promise<string> {
  const client = gcalClient();
  if (!client) throw new Error("Falta el cliente de Google");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: client.id, client_secret: client.secret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`Google respondió ${r.status}`);
  const j = (await r.json()) as { refresh_token?: string };
  if (!j.refresh_token) throw new Error("Google no devolvió el permiso para seguir conectado");
  return j.refresh_token;
}

async function gfetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await accessToken();
  return fetch(`${API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...init.headers },
    signal: AbortSignal.timeout(10_000),
  });
}

async function listEvents(from: string, to: string): Promise<GEvent[]> {
  const out: GEvent[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < 10; i++) {
    const q = new URLSearchParams({
      singleEvents: "true",
      orderBy: "startTime",
      timeMin: `${from}T00:00:00-03:00`,
      timeMax: `${to}T23:59:59-03:00`,
      maxResults: "2500",
      showDeleted: "false",
      ...(pageToken ? { pageToken } : {}),
    });
    const r = await gfetch(`/events?${q}`);
    if (r.status === 403) throw new Error("Google no deja leer el calendario: volvé a conectar Google Calendar en Datos");
    if (!r.ok) throw new Error(`Google respondió ${r.status} al pedir los eventos`);
    const j = (await r.json()) as { items?: GEvent[]; nextPageToken?: string };
    out.push(...(j.items ?? []));
    pageToken = j.nextPageToken;
    if (!pageToken) break;
  }
  return out;
}

export type GcalStatus = { configured: boolean; connected: boolean; lastSync: string | null; lastError: string | null; created: number };

export async function getGcalStatus(): Promise<GcalStatus> {
  const s = await readState();
  return { configured: !!gcalClient(), connected: await gcalReady(), lastSync: s.lastSync ?? null, lastError: s.lastError ?? null, created: s.created ?? 0 };
}

/**
 * Trae los eventos: crea los bloques nuevos y actualiza los que Google cambió.
 * Nunca borra ni manda nada a Google. Sin `force`, no corre si se sincronizó hace
 * menos de 5 minutos. Nunca tira error: lo deja anotado en el estado.
 */
export async function syncGoogleCalendar(opts: { force?: boolean } = {}): Promise<{ created: number; updated: number } | null> {
  if (!(await gcalReady())) return null;
  const state = await readState();
  if (!opts.force && state.lastSync && Date.now() - Date.parse(state.lastSync) < THROTTLE_MS) return null;
  const today = todayISO();
  try {
    const events = (await listEvents(addDays(today, -PAST_DAYS), addDays(today, FUTURE_DAYS))).filter((e) => !skipEvent(e));
    const ids = events.map((e) => e.id);
    const blocks = await prisma.planBlock.findMany({
      where: { source: SOURCE, externalId: { in: ids } },
      select: { id: true, externalId: true, externalUpdated: true, title: true, date: true, startTime: true, endTime: true },
    });
    const byEvent = new Map(blocks.map((b) => [b.externalId!, b]));
    const known = pruneKnown(state.known ?? {}, today);
    let created = 0;
    let updated = 0;
    for (const ev of events) {
      const times = eventTimes(ev);
      if (!times) continue;
      const block = byEvent.get(ev.id);
      const step = syncStep(ev, block, ev.id in known);
      if (step === "create") {
        const date = toDbDate(times.date);
        const sortKey = times.startTime ? null : topSortKey(await prisma.planBlock.findMany({ where: { date }, select: { startTime: true, sortKey: true } }));
        await prisma.planBlock.create({
          data: { title: eventTitle(ev), date, startTime: times.startTime, endTime: times.endTime, sortKey, source: SOURCE, externalId: ev.id, externalUpdated: ev.updated ?? null },
        });
        created++;
      } else if (step === "update" && block) {
        const title = eventTitle(ev);
        const changed = title !== block.title || times.date !== fromDbDate(block.date) || times.startTime !== block.startTime || times.endTime !== block.endTime;
        await prisma.planBlock.update({
          where: { id: block.id },
          data: { externalUpdated: ev.updated ?? null, ...(changed ? { title, date: toDbDate(times.date), startTime: times.startTime, endTime: times.endTime } : {}) },
        });
        if (changed) updated++;
      }
      known[ev.id] = times.date;
    }
    await writeState({ lastSync: new Date().toISOString(), lastError: null, known, created: (state.created ?? 0) + created });
    return { created, updated };
  } catch (e) {
    await writeState({ ...state, lastSync: new Date().toISOString(), lastError: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

/**
 * Un bloque que vino de Google cambió de día u horario en la app: el evento se
 * mueve igual. Solo día y hora (el nombre, borrar o tildar no van a Google).
 * Nunca tira error; si falla, queda anotado y el bloque sigue con lo de la app.
 */
export async function pushBlockToGoogle(blockId: string): Promise<void> {
  if (!(await gcalReady())) return;
  try {
    const b = await prisma.planBlock.findUnique({ where: { id: blockId }, select: { source: true, externalId: true, date: true, startTime: true, endTime: true } });
    if (!b || b.source !== SOURCE || !b.externalId) return;
    const path = `/events/${encodeURIComponent(b.externalId)}`;
    const r = await gfetch(path);
    if (!r.ok) throw new Error(`Google respondió ${r.status} al buscar el evento`);
    const ev = (await r.json()) as GEvent;
    const patch = eventPatch({ date: fromDbDate(b.date), startTime: b.startTime, endTime: b.endTime }, ev);
    if (samePatch(ev, patch)) return;
    const p = await gfetch(path, { method: "PATCH", body: JSON.stringify(patch) });
    if (!p.ok) throw new Error(`Google respondió ${p.status} al mover el evento`);
    const saved = (await p.json()) as GEvent;
    // Lo que quedó en Google es la versión que ya se vio: la próxima sincronización no lo vuelve a traer.
    await prisma.planBlock.update({ where: { id: blockId }, data: { externalUpdated: saved.updated ?? null } });
  } catch (e) {
    const state = await readState();
    await writeState({ ...state, lastError: `No se pudo mover el evento en Google: ${e instanceof Error ? e.message : String(e)}` });
  }
}

/**
 * Para las páginas (Plan e Inicio): sincroniza si hace más de 5 minutos, pero no
 * hace esperar más de 3,5 s (lo que no llegó aparece en la próxima carga).
 */
export async function syncGoogleSoon(): Promise<void> {
  if (!gcalClient()) return;
  await Promise.race([syncGoogleCalendar().catch(() => null), new Promise((r) => setTimeout(r, 3500))]);
}
