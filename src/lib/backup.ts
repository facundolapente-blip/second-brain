import "server-only";
import { gzipSync } from "node:zlib";
import { Prisma } from "@prisma/client";
import { del, get, list, put } from "@vercel/blob";
import { prisma } from "./prisma";

/**
 * Respaldo completo: todas las tablas menos las del login, en un JSON comprimido.
 * El automático corre todos los días a las 6 (cron de Vercel) y se guarda en un
 * almacén privado de Vercel Blob, fuera de la base: si la base se rompe, el
 * respaldo sigue ahí. Además conviene bajar una copia a la compu cada tanto
 * (Datos → Exportar → "Todo"): se registra y Inicio lo recuerda al mes.
 * Restaurar: `scripts/restaurar-respaldo.ts`.
 */

const SKIP = new Set<string>(["AuthUser", "AuthSession", "AuthAccount", "AuthVerification", "AuthRateLimit", "ActionReceipt", "PushSubscription"]);
/** Ajustes que son claves de otros servicios: no van en los respaldos (se vuelven a pegar). */
const SECRET_SETTINGS = new Set<string>(["reloj_intervals"]);
const PREFIX = "respaldos/";
/** Se guardan los últimos 30 y, de antes, el último de cada mes durante un año. */
const KEEP_DAILY = 30;
const KEEP_MONTHLY = 12;
const STATUS_KEY = "respaldo_estado";
const DOWNLOAD_KEY = "respaldo_descarga";

type Delegate = { findMany: () => Promise<unknown[]> };

export async function buildBackup(): Promise<Buffer> {
  const tablas: Record<string, unknown[]> = {};
  // De a una: en local la base admite una sola conexión.
  for (const name of Object.values(Prisma.ModelName)) {
    if (SKIP.has(name)) continue;
    const delegate = (prisma as unknown as Record<string, Delegate>)[name[0].toLowerCase() + name.slice(1)];
    const rows = await delegate.findMany();
    tablas[name] = name === "AppSetting" ? rows.filter((r) => !SECRET_SETTINGS.has((r as { key: string }).key)) : rows;
  }
  const data = { app: "second-brain", version: 2, exportado: new Date().toISOString(), tablas };
  return gzipSync(JSON.stringify(data));
}

/** Solo en producción: los datos de prueba de la compu no se mezclan con los reales. */
export function backupsEnabled() {
  return process.env.VERCEL_ENV === "production" && Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export type BackupInfo = { pathname: string; size: number; at: string; auto: boolean };
export type BackupStatus = { at: string; ok: boolean; error?: string } | null;

const isBackupPath = (p: string) => /^respaldos\/second-brain-[0-9TZ-]+-(auto|manual)\.json\.gz$/.test(p);

/** Hace un respaldo, lo sube y borra los que sobran. */
export async function saveBackup(auto: boolean): Promise<BackupInfo> {
  try {
    const body = await buildBackup();
    const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
    const pathname = `${PREFIX}second-brain-${stamp}Z-${auto ? "auto" : "manual"}.json.gz`;
    const res = await put(pathname, body, { access: "private", contentType: "application/gzip", addRandomSuffix: false });
    await prune();
    await setStatus({ at: new Date().toISOString(), ok: true });
    return { pathname: res.pathname, size: body.length, at: new Date().toISOString(), auto };
  } catch (e) {
    await setStatus({ at: new Date().toISOString(), ok: false, error: e instanceof Error ? e.message : String(e) }).catch(() => {});
    throw e;
  }
}

export async function listBackups(): Promise<BackupInfo[]> {
  if (!backupsEnabled()) return [];
  const { blobs } = await list({ prefix: PREFIX, limit: 100 });
  return blobs
    .filter((b) => isBackupPath(b.pathname))
    .map((b) => ({ pathname: b.pathname, size: b.size, at: b.uploadedAt.toISOString(), auto: b.pathname.includes("-auto.") }))
    .sort((a, b) => b.at.localeCompare(a.at));
}

async function prune() {
  const all = await listBackups(); // del más nuevo al más viejo
  const keep = new Set(all.slice(0, KEEP_DAILY).map((b) => b.pathname));
  const months = new Set<string>();
  for (const b of all.slice(KEEP_DAILY)) {
    const m = b.at.slice(0, 7);
    if (months.has(m) || months.size >= KEEP_MONTHLY) continue;
    months.add(m);
    keep.add(b.pathname);
  }
  const old = all.filter((b) => !keep.has(b.pathname)).map((b) => b.pathname);
  if (old.length) await del(old);
}

/** Se bajó una copia completa a un aparato (para el recordatorio de Inicio). */
export async function markDownloaded() {
  const value = JSON.stringify({ at: new Date().toISOString() });
  await prisma.appSetting
    .upsert({ where: { key: DOWNLOAD_KEY }, create: { key: DOWNLOAD_KEY, value }, update: { value } })
    .catch(() => {});
}

export async function lastDownload(): Promise<string | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: DOWNLOAD_KEY } });
  try {
    return row ? (JSON.parse(row.value) as { at: string }).at : null;
  } catch {
    return null;
  }
}

/** El archivo de un respaldo, para descargarlo (solo los de la carpeta de respaldos). */
export async function openBackup(pathname: string) {
  if (!isBackupPath(pathname)) return null;
  const r = await get(pathname, { access: "private" });
  return r?.statusCode === 200 ? r : null;
}

async function setStatus(s: NonNullable<BackupStatus>) {
  const value = JSON.stringify(s);
  await prisma.appSetting.upsert({ where: { key: STATUS_KEY }, create: { key: STATUS_KEY, value }, update: { value } });
}

export async function getBackupStatus(): Promise<BackupStatus> {
  const row = await prisma.appSetting.findUnique({ where: { key: STATUS_KEY } });
  if (!row) return null;
  try {
    return JSON.parse(row.value) as BackupStatus;
  } catch {
    return null;
  }
}

/**
 * Aviso para Inicio: si el respaldo diario falló o hace más de 2 días que no
 * corre, o si hace más de un mes que no se baja una copia a la compu.
 */
export async function backupWarning(): Promise<string | null> {
  if (!backupsEnabled()) return null;
  const s = await getBackupStatus();
  if (!s) return "Todavía no se guardó ningún respaldo.";
  if (!s.ok) return "El último respaldo automático falló.";
  if (Date.now() - Date.parse(s.at) > 2 * 86_400_000) return "Hace más de 2 días que no se guarda un respaldo.";
  const dl = await lastDownload();
  if (!dl || Date.now() - Date.parse(dl) > 31 * 86_400_000)
    return "Hace más de un mes que no bajás una copia de tus datos a la compu (por si algún día falla la nube).";
  return null;
}
