import "server-only";
import { gzipSync } from "node:zlib";
import { Prisma } from "@prisma/client";
import { del, get, list, put } from "@vercel/blob";
import { prisma } from "./prisma";

/**
 * Respaldo completo: todas las tablas menos las del login, en un JSON comprimido.
 * El automático corre los lunes (cron de Vercel) y se guarda en un almacén privado
 * de Vercel Blob, fuera de la base: si la base se rompe, el respaldo sigue ahí.
 */

const SKIP = new Set<string>(["AuthUser", "AuthSession", "AuthAccount", "AuthVerification", "AuthRateLimit"]);
const PREFIX = "respaldos/";
/** Cuántos se guardan (los más viejos se borran). */
const KEEP = 12;
const STATUS_KEY = "respaldo_estado";

type Delegate = { findMany: () => Promise<unknown[]> };

export async function buildBackup(): Promise<Buffer> {
  const tablas: Record<string, unknown[]> = {};
  // De a una: en local la base admite una sola conexión.
  for (const name of Object.values(Prisma.ModelName)) {
    if (SKIP.has(name)) continue;
    const delegate = (prisma as unknown as Record<string, Delegate>)[name[0].toLowerCase() + name.slice(1)];
    tablas[name] = await delegate.findMany();
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
  const all = await listBackups();
  const old = all.slice(KEEP).map((b) => b.pathname);
  if (old.length) await del(old);
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

/** Aviso para Inicio si el respaldo semanal falló o hace más de 8 días que no corre. */
export async function backupWarning(): Promise<string | null> {
  if (!backupsEnabled()) return null;
  const s = await getBackupStatus();
  if (!s) return "Todavía no se guardó ningún respaldo.";
  if (!s.ok) return "El último respaldo automático falló.";
  if (Date.now() - Date.parse(s.at) > 8 * 86_400_000) return "Hace más de una semana que no se guarda un respaldo.";
  return null;
}
