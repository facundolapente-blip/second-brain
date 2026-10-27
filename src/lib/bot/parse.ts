/**
 * Lectura de los mensajes del bot de WhatsApp (puro: sin base, se puede probar suelto).
 * Comandos: "gg <gasto>" (como la carga rápida; "+" adelante = ingreso), "tt|tarea <título> [fecha]", "bloque <título> [día] [hora]", "nota <texto>",
 * "jj|diario [ayer] <texto>", "cc [ayer] animo 4 energia 3 estres 2 sueño 7:30 peso 82,4 [nota …]",
 * "hoy", "ayuda" / "/start". Lo demás se prueba como carga rápida de Gastos.
 */
import { addDays, isISODate, weekday } from "../dates";
import { isTime, normalizeTime } from "../plan-logic";
import { parseWeight } from "../checkin-logic";

// El precio de una compra es una regla de Notas (también la usa el importador del chat).
export { looksLikePrice } from "../notes-logic";

export type BotCommand = "gasto" | "tarea" | "bloque" | "nota" | "diario" | "checkin" | "hoy" | "ayuda" | null;

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const COMMANDS: Record<string, Exclude<BotCommand, null>> = {
  // Atajos de Facu: GG gasto (o ingreso con "+"), TT tarea, JJ journal.
  gg: "gasto",
  gasto: "gasto",
  tt: "tarea",
  tarea: "tarea",
  bloque: "bloque",
  nota: "nota",
  diario: "diario",
  journal: "diario",
  jj: "diario",
  // CC check-in del día (también "checkin", "check-in" y "animo 4").
  cc: "checkin",
  checkin: "checkin",
  "check-in": "checkin",
  animo: "checkin",
  hoy: "hoy",
  ayuda: "ayuda",
  help: "ayuda",
  start: "ayuda",
  comandos: "ayuda",
};

/**
 * "NO" en mayúsculas al principio: el mensaje no se guarda en ningún lado (pedido de Facu,
 * 2026-10-27: hay cosas que manda al bot y no quiere en Notas). Solo en mayúsculas, así un
 * "no sé si…" normal sigue yendo a Notas. Vale "NO", "NO: …", "NO, …" o "NO …".
 */
export const SKIP_REPLY = "Listo, eso no lo anoté.";
export function isSkipMessage(text: string | null | undefined): boolean {
  return /^NO(?=$|[\s.,:;!¡?¿\-–—])/.test((text ?? "").trim());
}

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
    else if (/^\d{4}-\d{2}-\d{2}$/.test(w) && isISODate(w)) date = w;
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

/**
 * Día en cualquier lugar del mensaje ("domingo estadio", "estadio el domingo a la noche"):
 * el primero que aparece, con su "el" / "para el" delante. Devuelve las palabras sin el día
 * y dónde estaba (para aceptar una hora suelta justo después: "domingo 17 estadio").
 */
export function dayAnywhere(words: string[], today: string): { date: string; rest: string[]; at: number } | null {
  for (let i = 0; i < words.length; i++) {
    const d = dayAtEnd(words.slice(0, i + 1), today);
    if (!d) continue;
    const from = i + 1 - d.used;
    return { date: d.date, rest: [...words.slice(0, from), ...words.slice(i + 1)], at: from };
  }
  return null;
}

/**
 * Hora (o rango) en cualquier lugar: solo si es claramente una hora ("17hs", "18:30",
 * "18-20", "a las 18"), o un número suelto en la posición `bareAt` (justo después del día).
 */
export function timeAnywhere(words: string[], bareAt: number | null): { start: string; end: string | null; rest: string[] } | null {
  for (let i = 0; i < words.length; i++) {
    const t = timeAtEnd(words.slice(0, i + 1));
    if (!t) continue;
    const from = i + 1 - t.used;
    if (!t.strong && from !== bareAt) continue;
    return { start: t.start, end: t.end, rest: [...words.slice(0, from), ...words.slice(i + 1)] };
  }
  return null;
}

/** "tarea llamar al banco viernes" → título "Llamar al banco", deadline el viernes. */
export function parseTask(rest: string, today: string): { title: string; deadline: string | null } | { error: string } {
  const words = rest.trim().split(/\s+/).filter(Boolean);
  const day = words.length > 1 ? dayAtEnd(words, today) : null;
  // Si no está al final, el día puede ir en cualquier lado ("TT viernes llamar al banco").
  const any = !day && words.length > 1 ? dayAnywhere(words, today) : null;
  const titleWords = any && any.rest.length ? any.rest : words.slice(0, words.length - (day?.used ?? 0));
  const title = capital(titleWords.join(" ").slice(0, 160).trim());
  if (!title) return { error: "Falta el nombre de la tarea. Por ejemplo: tarea llamar al banco viernes" };
  return { title, deadline: day?.date ?? (any && any.rest.length ? any.date : null) };
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
  // Segunda pasada: día y hora en cualquier lugar ("Domingo 17hs Estadio", "mañana 18 gym").
  if (!date && !time && words.length > 1) {
    const d = dayAnywhere(words, today);
    const base = d && d.rest.length ? d.rest : words;
    const t = timeAnywhere(base, d && d.rest.length ? d.at : null);
    if (d && d.rest.length) {
      date = d.date;
      words = d.rest;
    }
    if (t && t.rest.length) {
      time = { start: t.start, end: t.end, used: 0, strong: true };
      words = t.rest;
    }
  }
  const title = capital(words.join(" ").slice(0, 120).trim());
  if (!title) return { error: "Falta el nombre del bloque. Por ejemplo: bloque gym mañana 18" };
  const startTime = time?.start ?? null;
  const endTime = startTime && time?.end && time.end > startTime ? time.end : null;
  if (time?.end && !endTime) return { error: `La hora de fin (${time.end}) tiene que ser después de la de inicio (${startTime}).` };
  return { title, date: date ?? today, startTime, endTime };
}

/**
 * "jj <texto>": va a la entrada de hoy. Con "ayer:" o "ayer," adelante va a la de ayer.
 * Los saltos de línea se respetan.
 */
export function parseJournal(rest: string, today: string): { date: string; text: string } | { error: string } {
  // "ayer:", "ayer," o "ayer" solo en el primer renglón (lo demás abajo) van a ayer;
  // "ayer fui al cine" no (la palabra es parte del texto).
  const m = rest.match(/^(ayer|hoy)(?:\s*[:,.]|[ \t]*\r?\n)\s*/i);
  const date = m && fold(m[1]) === "ayer" ? addDays(today, -1) : today;
  const text = (m ? rest.slice(m[0].length) : rest).trim();
  if (!text) return { error: "Falta el texto. Por ejemplo: JJ hoy fue un buen día" };
  return { date, text };
}

/**
 * Sin GG, un mensaje es gasto solo si es un renglón que empieza con el monto
 * ("350 almuerzo", "+750 disco prex"). Una lista de varios renglones ("3 perfumes / 3 libros")
 * va a Notas.
 */
export function looksLikeExpense(text: string): boolean {
  const t = text.trim();
  if (!t || /\n/.test(t)) return false;
  // Y después del monto tiene que haber palabras: "+49 9286 9555-0" es un teléfono, no un ingreso.
  return /^[+-]?\s*(?:(?:u\$s|us\$|usd|\$)\s*)?\d/i.test(t) && /[a-záéíóúñ]{2,}/i.test(t.replace(/^[+-]?\s*(?:u\$s|us\$|usd|\$)/i, ""));
}

// ─── Check-in (CC) ──────────────────────────────────────────────────────────

export type CheckinFields = { mood?: number; energy?: number; stress?: number; sleepMin?: number; weightG?: number };

const CHECKIN_KEYS: [RegExp, keyof CheckinFields][] = [
  [/^(animo|humor|mood)$/, "mood"],
  [/^(energia|energ|pilas)$/, "energy"],
  [/^(estres|stress)$/, "stress"],
  [/^(sueno|suenio|dormi|durmi|sleep)$/, "sleepMin"],
  [/^(peso|pese|kilos)$/, "weightG"],
];

/** Las mismas palabras que la tarjeta de Inicio, de 1 a 5. */
const SCALE_WORDS: Record<"mood" | "energy" | "stress", [string, number][]> = {
  mood: [["muy mal", 1], ["muy bien", 5], ["mal", 2], ["normal", 3], ["maso", 3], ["bien", 4]],
  energy: [["sin pilas", 1], ["a full", 5], ["full", 5], ["baja", 2], ["normal", 3], ["buena", 4]],
  stress: [["nada", 1], ["poco", 2], ["algo", 3], ["bastante", 4], ["mucho", 5]],
};

function scaleOf(seg: string, key: "mood" | "energy" | "stress"): number | null {
  const d = seg.match(/^([1-5])(?:\s*\/\s*5)?\b/);
  if (d) return Number(d[1]);
  for (const [w, v] of SCALE_WORDS[key]) if (seg === w || seg.startsWith(w + " ")) return v;
  return null;
}

/** "7:30", "7h30", "7 h 30", "7.30" (minutos), "7,5" (horas), "7", "7 horas", "450 min" → minutos. */
export function sleepOf(seg: string): number | null {
  const s = seg.replace(/\s+/g, " ").trim();
  let m = s.match(/^(\d{2,3}) ?(?:min|minutos)$/);
  if (m) return Number(m[1]) <= 16 * 60 ? Number(m[1]) : null;
  let h: number;
  let min = 0;
  m = s.match(/^(\d{1,2})[.,](\d)(?: ?(?:h|hs|horas?))?$/);
  if (m) {
    h = Number(m[1]);
    min = Number(m[2]) * 6;
  } else {
    m = s.match(/^(\d{1,2})(?: ?(?::|\.|h|hs|horas?) ?(\d{1,2})?)?(?: ?(?:min|m))?$/);
    if (!m) return null;
    h = Number(m[1]);
    min = m[2] ? Number(m[2]) : 0;
    if (min >= 60) return null;
  }
  const total = h * 60 + min;
  return total > 0 && total <= 16 * 60 ? total : null;
}

/**
 * "CC animo 4 energia 3 estres 2 sueño 7:30 peso 82,4", "CC 4 3 2" (ánimo, energía, estrés),
 * "CC ayer animo bien", "CC nota …". Sin nada: muestra cómo va el de hoy.
 */
export function parseCheckin(
  rest: string,
  today: string,
): { date: string; fields: CheckinFields; note: string | null } | { show: string } | { error: string } {
  let t = rest.trim();
  let date = today;
  const day = t.match(/^(ayer|hoy)\b\s*[:,.]?\s*/i);
  if (day) {
    if (fold(day[1]) === "ayer") date = addDays(today, -1);
    t = t.slice(day[0].length);
  }
  // La nota es lo último y va tal cual (con mayúsculas y tildes).
  let note: string | null = null;
  const n = t.match(/(?:^|\s)nota\s*[:=]?\s*([\s\S]+)$/i);
  if (n) {
    note = n[1].trim().slice(0, 500) || null;
    t = t.slice(0, n.index).trim();
  }
  if (!t && !note) return { show: date };

  const words = fold(t).replace(/[;=]/g, " ").replace(/:(?!\d)/g, " ").split(/\s+/).filter(Boolean);
  const fields: CheckinFields = {};
  const bad: string[] = [];
  const keyAt = (w: string) => CHECKIN_KEYS.find(([re]) => re.test(w))?.[1] ?? null;

  // Lo de antes de la primera palabra clave: "4 3 2" es ánimo, energía y estrés.
  let i = 0;
  const lead: string[] = [];
  while (i < words.length && !keyAt(words[i])) lead.push(words[i++]);
  if (lead.length) {
    if (lead.length <= 3 && lead.every((w) => /^[1-5]$/.test(w))) {
      const order: ("mood" | "energy" | "stress")[] = ["mood", "energy", "stress"];
      lead.forEach((w, k) => (fields[order[k]] = Number(w)));
    } else bad.push(lead.join(" "));
  }
  while (i < words.length) {
    const key = keyAt(words[i++])!;
    const seg: string[] = [];
    while (i < words.length && !keyAt(words[i])) seg.push(words[i++]);
    const s = seg.join(" ").replace(/^[,.]+|[,.]+$/g, "").trim();
    if (key === "sleepMin") {
      const v = sleepOf(s);
      if (v === null) bad.push(`sueño ${s}`.trim());
      else fields.sleepMin = v;
    } else if (key === "weightG") {
      const v = parseWeight(s.replace(/\s*(kg|kilos?)$/, ""));
      if (v === null) bad.push(`peso ${s}`.trim());
      else fields.weightG = v;
    } else {
      const v = scaleOf(s, key);
      if (v === null) bad.push(`${key === "mood" ? "ánimo" : key === "energy" ? "energía" : "estrés"} ${s}`.trim());
      else fields[key] = v;
    }
  }
  if (bad.length)
    return {
      error: `No entendí: ${bad.join(", ")}. Ánimo, energía y estrés van del 1 al 5; sueño como 7:30 o 7,5; peso como 82,4. Por ejemplo: CC animo 4 energia 3 sueño 7:30`,
    };
  if (!Object.keys(fields).length && !note) return { show: date };
  return { date, fields, note };
}
