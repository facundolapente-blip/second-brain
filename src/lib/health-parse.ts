import { strFromU8, unzipSync } from "fflate";

/**
 * Lee exportaciones de apps de salud y devuelve pasos y sueño por día. Corre en el
 * navegador (los exports pesan decenas de MB): al servidor solo va el resumen.
 *
 * - Google Fit (Google Takeout, .zip): "Daily activity metrics.csv" (o su versión
 *   en español) para los pasos y las sesiones "SLEEP" de "All Sessions" (.json).
 * - Samsung Health ("Descargar datos personales", .zip o los .csv): step_daily_trend
 *   y sleep.
 * - Un CSV propio con columnas fecha + pasos (y opcional sueño, en horas o minutos).
 *
 * El sueño se anota en el día en que te despertaste.
 */

export type HealthDay = { date: string; steps?: number; sleepMin?: number };

const TZ = "America/Montevideo";
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const dayOf = (d: Date) => dayFmt.format(d);

/** CSV simple con comillas; separador , o ; según la cabecera. */
function parseCsv(text: string): string[][] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const sep = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  return lines.map((line) => {
    const out: string[] = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (q && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = !q;
      } else if (ch === sep && !q) {
        out.push(cur.trim());
        cur = "";
      } else cur += ch;
    }
    out.push(cur.trim());
    return out;
  });
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** "2026-10-01", "01/10/2026" o "1/10/26" → YYYY-MM-DD. */
function toIso(v: string): string | null {
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

/** Cantidad entera: "10.500", "10,500" y "10 500" son diez mil quinientos. */
const int = (v: string | undefined) => {
  if (v === undefined || v.trim() === "") return null;
  const s = v.trim();
  const n = Number(/^\d{1,3}([.,\s]\d{3})+$/.test(s) ? s.replace(/[.,\s]/g, "") : s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

const num = (v: string | undefined) => {
  if (v === undefined || v.trim() === "") return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

type Acc = Map<string, HealthDay>;
const put = (acc: Acc, date: string, patch: Partial<HealthDay>, add = false) => {
  const d = acc.get(date) ?? { date };
  if (patch.steps !== undefined) d.steps = add ? (d.steps ?? 0) + patch.steps : Math.max(d.steps ?? 0, patch.steps);
  if (patch.sleepMin !== undefined) d.sleepMin = (d.sleepMin ?? 0) + patch.sleepMin;
  acc.set(date, d);
};

/** CSV con columna de fecha y de pasos (Google Fit diario o uno propio). */
function readDailyCsv(rows: string[][], acc: Acc): boolean {
  if (rows.length < 2) return false;
  const head = rows[0].map(norm);
  const iDate = head.findIndex((h) => h === "date" || h === "fecha" || h === "dia" || h === "day");
  const iSteps = head.findIndex((h) => h === "step count" || h.includes("pasos") || h === "steps");
  const iSleep = head.findIndex((h) => h.includes("sueno") || h.includes("sleep") || h.includes("dormi"));
  if (iDate < 0 || (iSteps < 0 && iSleep < 0)) return false;
  for (const r of rows.slice(1)) {
    const date = toIso(r[iDate] ?? "");
    if (!date) continue;
    const steps = iSteps >= 0 ? int(r[iSteps]) : null;
    const sleep = iSleep >= 0 ? num(r[iSleep]) : null;
    if (steps !== null && steps >= 0) put(acc, date, { steps: Math.round(steps) });
    // Hasta 24 son horas; más, minutos.
    if (sleep !== null && sleep > 0) put(acc, date, { sleepMin: Math.round(sleep <= 24 ? sleep * 60 : sleep) });
  }
  return true;
}

/** Samsung Health: la primera línea es el nombre del tipo de dato, la segunda la cabecera. */
function readSamsung(name: string, text: string, acc: Acc): boolean {
  const rows = parseCsv(text);
  if (rows.length < 3) return false;
  const head = rows[1].map((h) => h.replace(/^com\.samsung\.(s)?health\.[a-z_]+\./, ""));
  const col = (k: string) => head.indexOf(k);
  if (/step_daily_trend/.test(name)) {
    const iDay = col("day_time");
    const iCount = col("count");
    const iSource = col("source_type");
    if (iDay < 0 || iCount < 0) return false;
    // Una fila por día y por fuente; -2 es "todas juntas". Si no está, la mayor.
    const best = new Map<string, { steps: number; combined: boolean }>();
    for (const r of rows.slice(2)) {
      const ms = Number(r[iDay]);
      const steps = num(r[iCount]);
      if (!Number.isFinite(ms) || steps === null) continue;
      const date = new Date(ms).toISOString().slice(0, 10);
      const combined = iSource >= 0 && r[iSource] === "-2";
      const prev = best.get(date);
      if (!prev || (combined && !prev.combined) || (combined === prev.combined && steps > prev.steps)) best.set(date, { steps, combined });
    }
    for (const [date, v] of best) put(acc, date, { steps: Math.round(v.steps) });
    return true;
  }
  if (/\.sleep\./.test(name) && !/stage|combined|raw|goal/.test(name)) {
    const iStart = col("start_time");
    const iEnd = col("end_time");
    const iOffset = col("time_offset");
    if (iStart < 0 || iEnd < 0) return false;
    for (const r of rows.slice(2)) {
      // Vienen en UTC ("2026-10-01 05:15:00.000"); el desfasaje solo importa para el día.
      const start = Date.parse(`${r[iStart]?.replace(" ", "T")}Z`);
      const end = Date.parse(`${r[iEnd]?.replace(" ", "T")}Z`);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
      const mins = Math.round((end - start) / 60000);
      if (mins < 30 || mins > 16 * 60) continue;
      const off = iOffset >= 0 ? r[iOffset]?.match(/UTC([+-])(\d{2})(\d{2})/) : null;
      const shift = off ? (off[1] === "-" ? -1 : 1) * (Number(off[2]) * 60 + Number(off[3])) * 60000 : null;
      const date = shift !== null ? new Date(end + shift).toISOString().slice(0, 10) : dayOf(new Date(end));
      put(acc, date, { sleepMin: mins }, true);
    }
    return true;
  }
  return false;
}

/** Google Fit: sesión de sueño en JSON. */
function readFitSession(text: string, acc: Acc) {
  try {
    const j = JSON.parse(text) as { fitnessActivity?: string; startTime?: string; endTime?: string };
    if (j.fitnessActivity !== "sleep" || !j.startTime || !j.endTime) return;
    const start = Date.parse(j.startTime);
    const end = Date.parse(j.endTime);
    const mins = Math.round((end - start) / 60000);
    if (mins >= 30 && mins <= 16 * 60) put(acc, dayOf(new Date(end)), { sleepMin: mins });
  } catch {
    // no es una sesión
  }
}

export type HealthParse = { days: HealthDay[]; source: string };

export async function parseHealthFile(file: File): Promise<HealthParse> {
  const acc: Acc = new Map();
  const sources = new Set<string>();
  const handle = (name: string, text: string) => {
    const base = name.split("/").pop() ?? name;
    if (/^com\.samsung\./.test(base)) {
      if (readSamsung(base, text, acc)) sources.add("Samsung Health");
    } else if (/\.json$/i.test(base)) {
      const before = acc.size;
      readFitSession(text, acc);
      if (acc.size !== before || /sleep/i.test(base)) sources.add("Google Fit");
    } else if (/\.csv$/i.test(base)) {
      if (readDailyCsv(parseCsv(text), acc)) sources.add(/fit|activity|actividad/i.test(name) ? "Google Fit" : "CSV");
    }
  };

  const buf = new Uint8Array(await file.arrayBuffer());
  if (/\.zip$/i.test(file.name)) {
    // Solo lo que sirve: el resto de un Takeout puede pesar cientos de MB.
    const files = unzipSync(buf, {
      filter: (f) =>
        (/\.csv$/i.test(f.name) && (/step_daily_trend|\.sleep\./.test(f.name) || /daily activity|actividad diaria|metricas|métricas/i.test(f.name) || !/\//.test(f.name))) ||
        (/\.json$/i.test(f.name) && /sleep/i.test(f.name)),
    });
    for (const [name, data] of Object.entries(files)) handle(name, strFromU8(data));
  } else {
    handle(file.name, strFromU8(buf));
  }
  const days = [...acc.values()]
    .filter((d) => (d.steps !== undefined && d.steps > 0) || (d.sleepMin !== undefined && d.sleepMin > 0))
    .sort((a, b) => a.date.localeCompare(b.date));
  return { days, source: [...sources].join(" + ") || "desconocido" };
}
