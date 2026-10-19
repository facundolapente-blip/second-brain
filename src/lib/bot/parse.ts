/**
 * Lectura de los mensajes del bot de WhatsApp (puro: sin base, se puede probar suelto).
 * Comandos: "tarea <título> [fecha]", "bloque <título> [día] [hora]", "nota <texto>",
 * "hoy", "ayuda" / "/start". Lo demás se prueba como carga rápida de Gastos.
 */
import { addDays, isISODate, weekday } from "../dates";
import { isTime, normalizeTime } from "../plan-logic";

export type BotCommand = "tarea" | "bloque" | "nota" | "hoy" | "ayuda" | null;

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const COMMANDS: Record<string, Exclude<BotCommand, null>> = {
  tarea: "tarea",
  bloque: "bloque",
  nota: "nota",
  hoy: "hoy",
  ayuda: "ayuda",
  help: "ayuda",
  start: "ayuda",
  comandos: "ayuda",
};

/** Primera palabra como comando ("tarea", "/tarea", "/start@MiBot"); el resto, tal cual. */
export function parseCommand(text: string): { cmd: BotCommand; rest: string } {
  const t = text.trim();
  const m = t.match(/^\/?([^\s@]+)(?:@\S+)?(?:\s+([\s\S]*))?$/);
  const key = m ? fold(m[1]) : "";
  const cmd = Object.hasOwn(COMMANDS, key) ? COMMANDS[key] : null;
  return cmd ? { cmd, rest: (m?.[2] ?? "").trim() } : { cmd: null, rest: t };
}

const WEEKDAYS: Record<string, number> = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };

/**
 * Un día escrito al final de una lista de palabras: "hoy", "mañana", "pasado mañana",
 * "ayer", "viernes" (hoy si es viernes; si no, el próximo), "25/10", "25/10/2026",
 * "2026-10-25". "el", "para", "para el" delante también se comen. Sin año, si la fecha
 * ya pasó es la del año que viene.
 */
export function dayAtEnd(words: string[], today: string): { date: string; used: number } | null {
  const f = words.map(fold);
  const n = f.length;
  let date: string | null = null;
  let used = 0;
  if (n >= 2 && f[n - 2] === "pasado" && f[n - 1] === "manana") [date, used] = [addDays(today, 2), 2];
  else if (n >= 1) {
    const w = f[n - 1].replace(/[.,;]+$/, "");
    if (w === "hoy") date = today;
    else if (w === "manana") date = addDays(today, 1);
    else if (w === "ayer") date = addDays(today, -1);
    else if (Object.hasOwn(WEEKDAYS, w)) date = addDays(today, (WEEKDAYS[w] - weekday(today) + 7) % 7);
    else if (/^d{4}-d{2}-d{2}$/.test(w) && isISODate(w)) date = w;
    else {
      const m = w.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2}|\d{4}))?$/);
      if (m) {
        const pad = (x: string) => x.padStart(2, "0");
        const year = m[3] ? (m[3].length === 2 ? `20${m[3]}` : m[3]) : today.slice(0, 4);
        let iso = `${year}-${pad(m[2])}-${pad(m[1])}`;
        if (!m[3] && iso < today) iso = `${Number(year) + 1}-${pad(m[2])}-${pad(m[1])}`;
        if (isISODate(iso)) date = iso;
      }
    }
    if (date) used = 1;
  }
  if (!date) return null;
  // "para el viernes", "el 25/10"
  let k = n - used;
  if (k > 0 && f[k - 1] === "el") k--;
  if (k > 0 && f[k - 1] === "para") k--;
  return { date, used: n - k };
}

/** "18", "18:30", "18hs", "18.30h" → "HH:MM"; `strong` si no es un número pelado. */
function timeOf(word: string): { time: string; strong: boolean } | null {
  const w = fold(word).replace(/(hs|h)$/, "");
  if (!w || !/^\d{1,2}(?:[:.]\d{2})?$/.test(w)) return null;
  const time = normalizeTime(w);
  if (!time || !isTime(time)) return null;
  return { time, strong: w !== fold(word) || /[:.]/.test(w) };
}

/**
 * Hora (o rango) al final: "18", "18:30-20:30", "18 a 20", "de 18 a 20", "a las 18".
 * `strong` = seguro que es una hora (con ":" o "hs", o un rango), no un número del título.
 */
export function timeAtEnd(words: string[]): { start: string; end: string | null; used: number; strong: boolean } | null {
  const f = words.map(fold);
  const n = f.length;
  if (!n) return null;
  let res: { start: string; end: string | null; used: number; strong: boolean } | null = null;
  const range = f[n - 1].split(/[-–]/);
  if (range.length === 2) {
    const a = timeOf(range[0]);
    const b = timeOf(range[1]);
    if (a && b) res = { start: a.time, end: b.time, used: 1, strong: true };
  }
  if (!res && n >= 3 && f[n - 2] === "a") {
    const a = timeOf(f[n - 3]);
    const b = timeOf(f[n - 1]);
    if (a && b) res = { start: a.time, end: b.time, used: 3, strong: true };
  }
  if (!res) {
    const a = timeOf(f[n - 1]);
    if (a) res = { start: a.time, end: null, used: 1, strong: a.strong };
  }
  if (!res) return null;
  // "de 18 a 20", "a las 18", "a la 1"
  let k = n - res.used;
  if (k >= 2 && f[k - 2] === "a" && (f[k - 1] === "las" || f[k - 1] === "la")) [k, res.strong] = [k - 2, true];
  else if (k >= 1 && f[k - 1] === "de" && res.end) k--;
  return { ...res, used: n - k };
}

const capital = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** "tarea llamar al banco viernes" → título "Llamar al banco", deadline el viernes. */
export function parseTask(rest: string, today: string): { title: string; deadline: string | null } | { error: string } {
  const words = rest.trim().split(/\s+/).filter(Boolean);
  const day = words.length > 1 ? dayAtEnd(words, today) : null;
  const title = capital(words.slice(0, words.length - (day?.used ?? 0)).join(" ").slice(0, 160).trim());
  if (!title) return { error: "Falta el nombre de la tarea. Por ejemplo: tarea llamar al banco viernes" };
  return { title, deadline: day?.date ?? null };
}

/**
 * "bloque gym mañana 18" / "bloque ORT jueves 18:30-20:30" / "bloque leer viernes".
 * Sin día es hoy; sin hora queda como pendiente del día. Un número suelto sin día
 * ("bloque capítulo 3") es parte del nombre, no una hora.
 */
export function parseBlock(
  rest: string,
  today: string,
): { title: string; date: string; startTime: string | null; endTime: string | null } | { error: string } {
  let words = rest.trim().split(/\s+/).filter(Boolean);
  let date: string | null = null;
  let time: ReturnType<typeof timeAtEnd> = null;
  // Primero "día hora" ("mañana 18"); si no, "hora día" ("18 mañana").
  const t1 = words.length > 1 ? timeAtEnd(words) : null;
  const d1 = t1 ? dayAtEnd(words.slice(0, words.length - t1.used), today) : null;
  if (t1 && d1 && words.length > t1.used + d1.used) {
    time = t1;
    date = d1.date;
    words = words.slice(0, words.length - t1.used - d1.used);
  } else if (t1 && t1.strong && !d1 && words.length > t1.used) {
    // Sin día pero con una hora clara ("gym 18:30", "gym 10-12"): hoy.
    time = t1;
    words = words.slice(0, words.length - t1.used);
  } else {
    const d2 = words.length > 1 ? dayAtEnd(words, today) : null;
    const rest2 = d2 ? words.slice(0, words.length - d2.used) : words;
    const t2 = rest2.length > 1 ? timeAtEnd(rest2) : null;
    if (d2) {
      date = d2.date;
      if (t2 && rest2.length > t2.used) {
        time = t2;
        words = rest2.slice(0, rest2.length - t2.used);
      } else words = rest2;
    }
  }
  const title = capital(words.join(" ").slice(0, 120).trim());
  if (!title) return { error: "Falta el nombre del bloque. Por ejemplo: bloque gym mañana 18" };
  const startTime = time?.start ?? null;
  const endTime = startTime && time?.end && time.end > startTime ? time.end : null;
  if (time?.end && !endTime) return { error: `La hora de fin (${time.end}) tiene que ser después de la de inicio (${startTime}).` };
  return { title, date: date ?? today, startTime, endTime };
}
