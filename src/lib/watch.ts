import "server-only";
import { prisma } from "./prisma";
import { addDays, fromDbDate, toDbDate, todayISO } from "./dates";
import { parseWellness, pruneSynced, watchPatch, type WatchSynced } from "./watch-logic";

/**
 * Reloj por intervals.icu (ver watch-logic.ts). La clave vive solo en la base
 * (`AppSetting "reloj_intervals"`) y nunca va al navegador: la pantalla ve el estado.
 */
const KEY = "reloj_intervals";
const API = "https://intervals.icu/api/v1/athlete/0/wellness";

type State = {
  apiKey: string;
  connectedAt: string;
  lastSync?: string;
  lastError?: string | null;
  /** Días que trajo la última sincronización con algún dato. */
  lastDays?: number;
  /** Último día con pasos que llegó del reloj. */
  lastDay?: string | null;
  synced?: WatchSynced;
};

export type WatchStatus =
  | { connected: false }
  | { connected: true; keyHint: string; connectedAt: string; lastSync: string | null; lastError: string | null; lastDay: string | null };

async function readState(): Promise<State | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  if (!row?.value) return null;
  try {
    const s = JSON.parse(row.value) as State;
    return typeof s.apiKey === "string" && s.apiKey ? s : null;
  } catch {
    return null;
  }
}

async function writeState(s: State) {
  const value = JSON.stringify(s);
  await prisma.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
}

/** Lo que muestra Datos (sin la clave: solo sus últimos 4 caracteres). */
export async function getWatchStatus(): Promise<WatchStatus> {
  const s = await readState();
  if (!s) return { connected: false };
  return { connected: true, keyHint: s.apiKey.slice(-4), connectedAt: s.connectedAt, lastSync: s.lastSync ?? null, lastError: s.lastError ?? null, lastDay: s.lastDay ?? null };
}

export class WatchError extends Error {}

/** Pide los datos diarios de un rango a intervals.icu (usuario "API_KEY", contraseña = la clave). */
export async function fetchWellness(apiKey: string, oldest: string, newest: string): Promise<unknown[]> {
  const url = `${API}?oldest=${oldest}&newest=${newest}&fields=id,steps,sleepSecs,weight`;
  let r: Response;
  try {
    r = await fetch(url, {
      headers: { authorization: `Basic ${Buffer.from(`API_KEY:${apiKey}`).toString("base64")}`, accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new WatchError("intervals.icu no contestó. Probá de nuevo en un rato.");
  }
  if (r.status === 401 || r.status === 403) throw new WatchError("intervals.icu no aceptó la clave. Copiala de nuevo desde Settings → Developer Settings.");
  if (!r.ok) throw new WatchError(`intervals.icu respondió con un error (${r.status}).`);
  const data = (await r.json()) as unknown;
  return Array.isArray(data) ? data : [];
}

/**
 * Trae los últimos `days` días y los guarda en el check-in (pasos siempre; sueño y peso
 * sin pisar lo cargado a mano, ver `watchPatch`). Sin reloj conectado no hace nada.
 */
export async function syncWatch({ days = 3, apiKey }: { days?: number; apiKey?: string } = {}): Promise<{ ok: true; days: number; changed: number } | { ok: false; error: string } | null> {
  const prev = await readState();
  const key = apiKey ?? prev?.apiKey;
  if (!key) return null;
  const today = todayISO();
  const oldest = addDays(today, -(Math.min(400, Math.max(1, days)) - 1));
  const state: State = prev && prev.apiKey === key ? { ...prev } : { apiKey: key, connectedAt: new Date().toISOString() };
  const synced: WatchSynced = { sleep: { ...(state.synced?.sleep ?? {}) }, weight: { ...(state.synced?.weight ?? {}) } };
  try {
    const parsed = parseWellness(await fetchWellness(key, oldest, today), today);
    const existing = await prisma.dailyCheckin.findMany({
      where: { date: { gte: toDbDate(oldest), lte: toDbDate(today) } },
      select: { date: true, steps: true, sleepMin: true, weightG: true },
    });
    const byDay = new Map(existing.map((c) => [fromDbDate(c.date), c]));
    let changed = 0;
    for (const day of parsed) {
      const patch = watchPatch(day, byDay.get(day.date), synced);
      if (patch.sleepMin !== undefined) synced.sleep[day.date] = patch.sleepMin;
      if (patch.weightG !== undefined) synced.weight[day.date] = patch.weightG;
      if (!Object.keys(patch).length) continue;
      const date = toDbDate(day.date);
      await prisma.dailyCheckin.upsert({ where: { date }, create: { date, ...patch }, update: patch });
      changed++;
    }
    const lastDay = [...parsed].reverse().find((d) => d.steps !== null)?.date ?? state.lastDay ?? null;
    const keepFrom = addDays(today, -400);
    await writeState({
      ...state,
      lastSync: new Date().toISOString(),
      lastError: null,
      lastDays: parsed.length,
      lastDay,
      synced: { sleep: pruneSynced(synced.sleep, keepFrom), weight: pruneSynced(synced.weight, keepFrom) },
    });
    return { ok: true, days: parsed.length, changed };
  } catch (e) {
    const error = e instanceof WatchError ? e.message : "No se pudo sincronizar el reloj.";
    // Solo se anota el error si el reloj ya estaba conectado (al conectar, la clave no se guarda si falla).
    if (prev && prev.apiKey === key) await writeState({ ...state, lastError: error });
    return { ok: false, error };
  }
}

export async function disconnectWatchState() {
  await prisma.appSetting.deleteMany({ where: { key: KEY } });
}

/** Al conectar: si la clave anda, se guarda y se trae el último año. */
export async function connectWatchKey(apiKey: string) {
  const first = await syncWatch({ days: 365, apiKey });
  return first;
}
