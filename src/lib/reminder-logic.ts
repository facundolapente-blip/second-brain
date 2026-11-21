/**
 * Avisos (notificaciones push): qué tipos hay, sus horas y el texto de cada uno.
 * Reglas puras, sin base ni imports (las prueba un script con node). Los datos los
 * junta `reminders.ts`; el envío, `push.ts`; los crons, `/api/cron/avisos`.
 */

export const REMINDER_KINDS = [
  "checkin",
  "prioritaria",
  "manana",
  "deadlines",
  "habitos",
  "escalones",
  "journal",
  "tarjetas",
  "presupuestos",
  "revision",
  "rueda",
  "respaldo",
] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

/**
 * Cómo va un aviso: prendido, hora, días de la semana (0 = domingo … 6 = sábado, como
 * `weekday` de dates.ts) y a qué aparatos (ids de `PushSubscription`; null = a todos).
 */
export type ReminderPref = { on: boolean; hour: number; days: number[]; devices: string[] | null };
export type ReminderPrefs = Record<ReminderKind, ReminderPref> & {
  /** Un aviso propio por hábito (id del hábito): "Leer · Todavía no lo marcaste hoy". */
  habits: Record<string, ReminderPref>;
  /** Recordatorios que escribe Facu ("Llamar a la abuela", los domingos a las 18). */
  custom: CustomReminder[];
};

/**
 * Un recordatorio propio: título, texto opcional y, como los demás, hora, días y aparatos.
 * Con `date` sale una sola vez ese día (los días no cuentan); sin `date`, los días elegidos.
 */
export type CustomReminder = ReminderPref & {
  id: string;
  title: string;
  body: string;
  date: string | null;
  /** Adónde lleva al tocarlo (los de "Notificar" de un bloque o una tarea van al Plan). */
  url?: string | null;
};
export const CUSTOM_MAX = 50;
export const CUSTOM_TITLE_MAX = 80;
export const CUSTOM_BODY_MAX = 300;

/** Días en el orden de la pantalla (lunes primero) con su letra. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
export const DAY_LETTER: Record<number, string> = { 0: "D", 1: "L", 2: "M", 3: "X", 4: "J", 5: "V", 6: "S" };
export const DAY_NAME: Record<number, string> = { 0: "domingo", 1: "lunes", 2: "martes", 3: "miércoles", 4: "jueves", 5: "viernes", 6: "sábado" };
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

/**
 * Horas que se pueden elegir (de Montevideo). Hay un cron diario por cada una
 * (vercel.json): el plan gratis de Vercel solo deja crons de una vez por día y los
 * corre en cualquier minuto de esa hora, así que la hora es la precisión que hay.
 */
export const REMINDER_HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 6 a 23

/** Si el cron de la hora elegida no corrió, los de las 2 horas siguientes lo mandan. */
export const CATCH_UP_HOURS = 2;

/** Grupo de la pantalla: el módulo del aviso (con su color). */
export type ReminderGroup = "inicio" | "habitos" | "journal" | "gastos" | "plan";
export const REMINDER_GROUPS: { id: ReminderGroup; label: string }[] = [
  { id: "inicio", label: "Inicio y herramientas" },
  { id: "habitos", label: "Hábitos" },
  { id: "journal", label: "Journal" },
  { id: "gastos", label: "Gastos" },
  { id: "plan", label: "Plan" },
];

export const REMINDER_INFO: Record<ReminderKind, { label: string; hint: string; group: ReminderGroup }> = {
  checkin: { label: "¿Cómo estás?", hint: "Si todavía no cargaste el ánimo de la mañana.", group: "inicio" },
  prioritaria: {
    label: "Tarea prioritaria",
    hint: "Si no elegiste la de hoy, te lo recuerda; si la elegiste y no la hiciste, te pregunta.",
    group: "inicio",
  },
  revision: { label: "Revisión semanal", hint: "Para mirar la semana y escribir la reflexión, si todavía no la escribiste.", group: "inicio" },
  rueda: { label: "Rueda de la vida", hint: "Cuando pasaron 9 meses de la última.", group: "inicio" },
  respaldo: { label: "Respaldo", hint: "Si el respaldo automático falló o hace mucho que no bajás una copia.", group: "inicio" },
  habitos: { label: "Hábitos sin marcar", hint: "Cuántos hábitos de hoy te faltan marcar.", group: "habitos" },
  escalones: { label: "Hábitos en construcción", hint: "Cuando podés subir al paso siguiente (una vez por paso).", group: "habitos" },
  journal: { label: "Escribir el journal", hint: "Si hoy todavía no escribiste nada.", group: "journal" },
  tarjetas: { label: "Tarjeta por vencer", hint: "El resumen sin pagar: 5, 3 y 1 día antes, el día que vence y si ya venció.", group: "gastos" },
  presupuestos: { label: "Presupuestos", hint: "Los que te pasaste o estás cerca del tope este mes.", group: "gastos" },
  manana: { label: "Plan del día", hint: "Los bloques de hoy con su hora.", group: "plan" },
  deadlines: { label: "Deadlines", hint: "Tareas abiertas que vencen mañana u hoy, y las vencidas.", group: "plan" },
};

const pref = (on: boolean, hour: number, days: number[] = ALL_DAYS): ReminderPref => ({ on, hour, days, devices: null });

/** Los que ya existían arrancan prendidos; los nuevos, apagados (los prende Facu). */
export const DEFAULT_PREFS: Record<ReminderKind, ReminderPref> = {
  checkin: pref(false, 9),
  prioritaria: pref(false, 10),
  manana: pref(true, 8),
  deadlines: pref(true, 20),
  habitos: pref(true, 21),
  escalones: pref(true, 9),
  journal: pref(false, 22),
  tarjetas: pref(true, 10),
  presupuestos: pref(false, 19),
  revision: pref(false, 19, [0]),
  rueda: pref(false, 11, [6]),
  respaldo: pref(false, 12, [1]),
};
export const DEFAULT_HABIT_PREF: ReminderPref = pref(true, 20);

function normalizeOne(raw: unknown, def: ReminderPref): ReminderPref {
  const v = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const hour = Number(v.hour);
  const days = Array.isArray(v.days)
    ? [...new Set(v.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b)
    : [...def.days];
  const devices = Array.isArray(v.devices)
    ? [...new Set(v.devices.filter((d): d is string => typeof d === "string" && d.length > 0 && d.length <= 60))]
    : null;
  return {
    on: typeof v.on === "boolean" ? v.on : def.on,
    hour: REMINDER_HOURS.includes(hour) ? hour : def.hour,
    days,
    devices,
  };
}

/** Lo guardado (JSON de `AppSetting "avisos"`), completado y acotado. */
export function normalizePrefs(raw: unknown): ReminderPrefs {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = { habits: {} } as unknown as ReminderPrefs;
  for (const k of REMINDER_KINDS) out[k] = normalizeOne(src[k], DEFAULT_PREFS[k]);
  const habits = src.habits && typeof src.habits === "object" ? (src.habits as Record<string, unknown>) : {};
  for (const [id, v] of Object.entries(habits).slice(0, 200)) {
    if (/^[A-Za-z0-9_-]{1,40}$/.test(id)) out.habits[id] = normalizeOne(v, DEFAULT_HABIT_PREF);
  }
  out.custom = [];
  const seen = new Set<string>();
  for (const raw of Array.isArray(src.custom) ? src.custom.slice(0, CUSTOM_MAX) : []) {
    const c = normalizeCustom(raw);
    if (c && !seen.has(c.id)) {
      seen.add(c.id);
      out.custom.push(c);
    }
  }
  return out;
}

/** Un recordatorio propio válido (o null): sin título no hay recordatorio. */
export function normalizeCustom(raw: unknown): CustomReminder | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  const id = typeof v.id === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(v.id) ? v.id : null;
  const title = typeof v.title === "string" ? v.title.replace(/\s+/g, " ").trim().slice(0, CUSTOM_TITLE_MAX) : "";
  if (!id || !title) return null;
  const body = typeof v.body === "string" ? v.body.trim().slice(0, CUSTOM_BODY_MAX) : "";
  const date = typeof v.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.date) ? v.date : null;
  const url = typeof v.url === "string" && /^\/(?![/\\])/.test(v.url) && v.url.length <= 200 ? v.url : null;
  return { ...normalizeOne(v, DEFAULT_CUSTOM_PREF), id, title, body, date, url };
}
export const DEFAULT_CUSTOM_PREF: ReminderPref = { on: true, hour: 9, days: [0, 1, 2, 3, 4, 5, 6], devices: null };

/** Si un recordatorio propio toca hoy a esta hora (con fecha: solo ese día). */
export function isCustomDue(c: CustomReminder, hourNow: number, dow: number, today: string): boolean {
  if (c.date) return c.on && c.date === today && hourNow >= c.hour && hourNow <= c.hour + CATCH_UP_HOURS;
  return isDue(c, hourNow, dow);
}

/** Uno de una sola vez que ya pasó (o salió hoy y la hora quedó atrás). */
export function customPast(c: CustomReminder, today: string): boolean {
  return !!c.date && c.date < today;
}

export function customMessage(c: CustomReminder): PushPayload {
  return { title: c.title, body: c.body || "Recordatorio", url: c.url || "/avisos", tag: `aviso-propio-${c.id}`.slice(0, 32) };
}

/** Si un aviso toca a esta hora y este día de la semana (con margen por si un cron falló). */
export function isDue(p: ReminderPref, hourNow: number, dow: number): boolean {
  return p.on && p.days.includes(dow) && hourNow >= p.hour && hourNow <= p.hour + CATCH_UP_HOURS;
}

/** Qué avisos tocan a esta hora: los activos de hoy cuya hora ya llegó. */
export function dueKinds(prefs: ReminderPrefs, hourNow: number, dow: number): ReminderKind[] {
  return REMINDER_KINDS.filter((k) => isDue(prefs[k], hourNow, dow));
}

/** Los ids de hábitos con aviso propio que tocan ahora. */
export function dueHabits(prefs: ReminderPrefs, hourNow: number, dow: number): string[] {
  return Object.entries(prefs.habits)
    .filter(([, p]) => isDue(p, hourNow, dow))
    .map(([id]) => id);
}

/** "Todos los días", "Lunes a viernes", "Fines de semana", "Solo los domingos", "L M X". */
export function daysText(days: number[]): string {
  const set = new Set(days);
  if (set.size === 7) return "Todos los días";
  if (set.size === 0) return "Ningún día";
  if (set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) return "Lunes a viernes";
  if (set.size === 2 && set.has(0) && set.has(6)) return "Fines de semana";
  if (set.size === 1) {
    const d = days[0];
    return `Solo los ${DAY_NAME[d]}${d === 0 || d === 6 ? "s" : ""}`;
  }
  return WEEK_ORDER.filter((d) => set.has(d))
    .map((d) => DAY_LETTER[d])
    .join(" ");
}

/** A qué aparatos va: los elegidos que siguen existiendo (null = a todos; ninguno vigente también). */
export function targetDevices(p: ReminderPref, existing: string[]): string[] | null {
  if (!p.devices) return null;
  const alive = p.devices.filter((d) => existing.includes(d));
  return alive.length ? alive : null;
}

export type PushPayload = { title: string; body: string; url: string; tag: string };

/** "A", "A y B", "A, B y C", "A, B, C y 2 más". */
export function listNames(names: string[], max = 3): string {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  if (clean.length <= max) {
    return clean.length <= 1 ? (clean[0] ?? "") : `${clean.slice(0, -1).join(", ")} y ${clean[clean.length - 1]}`;
  }
  return `${clean.slice(0, max).join(", ")} y ${clean.length - max} más`;
}

/**
 * Hábitos de hoy sin marcar (`open`: nombres, en el orden de la lista) de los que tocan (`total`).
 * `important`: los de "Nunca dos seguidos" que fallaron ayer (y siguen sin hacer): van primero,
 * con "Hoy importa: …".
 */
export function habitsMessage(open: string[], done: number, total: number, important: string[] = []): PushPayload | null {
  if (!open.length) return null;
  const n = open.length;
  const key = important.filter((x) => open.includes(x));
  const rest = open.filter((x) => !key.includes(x));
  const body = key.length
    ? `Hoy importa: ${listNames(key, 3)}${rest.length ? ` · también ${listNames(rest, 3)}` : ""} · llevás ${done} de ${total}`
    : `${listNames(open, 4)} · llevás ${done} de ${total}`;
  return {
    title: n === 1 ? "Te falta 1 hábito hoy" : `Te faltan ${n} hábitos hoy`,
    body,
    url: "/habitos",
    tag: "aviso-habitos",
  };
}

/** Tareas abiertas con deadline; `left` = días que faltan (0 hoy, 1 mañana, negativo vencida). */
export function deadlinesMessage(tasks: { title: string; left: number }[]): PushPayload | null {
  const tomorrow = tasks.filter((t) => t.left === 1).map((t) => t.title);
  const today = tasks.filter((t) => t.left === 0).map((t) => t.title);
  const overdue = tasks
    .filter((t) => t.left < 0)
    .sort((a, b) => b.left - a.left)
    .map((t) => t.title);
  if (!tomorrow.length && !today.length && !overdue.length) return null;
  const count = (n: number, one: string, many: string) => (n === 1 ? one : many.replace("#", String(n)));
  const title = tomorrow.length
    ? count(tomorrow.length, "Vence mañana", "Vencen mañana # tareas")
    : today.length
      ? count(today.length, "Vence hoy", "Vencen hoy # tareas")
      : count(overdue.length, "1 tarea vencida", "# tareas vencidas");
  const parts: string[] = [];
  if (tomorrow.length) parts.push(`Mañana: ${listNames(tomorrow)}`);
  if (today.length) parts.push(`Hoy: ${listNames(today)}`);
  if (overdue.length) parts.push(`Vencidas: ${listNames(overdue)}`);
  return { title, body: parts.join(" · "), url: "/plan#tareas", tag: "aviso-deadlines" };
}

/** Días antes del vencimiento en que avisa la tarjeta (y todos los días si venció, hasta 10). */
export function cardShouldWarn(left: number): boolean {
  return left === 5 || left === 3 || left === 1 || left === 0 || (left < 0 && left >= -10);
}

function dueText(left: number): string {
  if (left > 1) return `vence en ${left} días`;
  if (left === 1) return "vence mañana";
  if (left === 0) return "vence hoy";
  if (left === -1) return "venció ayer";
  return `venció hace ${-left} días`;
}

/** Tarjetas con el último resumen sin pagar; `amount` ya formateado ("$ 12.345"). */
export function cardsMessage(cards: { name: string; amount: string; left: number }[]): PushPayload | null {
  const warn = cards.filter((c) => cardShouldWarn(c.left)).sort((a, b) => a.left - b.left);
  if (!warn.length) return null;
  const late = warn.some((c) => c.left < 0);
  return {
    title: late ? (warn.length === 1 ? "Tarjeta vencida" : "Tarjetas para pagar") : warn.length === 1 ? "Tarjeta por vencer" : "Tarjetas por vencer",
    body: warn.map((c) => `${c.name}: ${c.amount} ${dueText(c.left)}`).join(" · "),
    url: "/gastos/cuentas",
    tag: "aviso-tarjetas",
  };
}

/** Bloques de hoy que faltan (sin los "Libre"), ya ordenados como en el Plan. */
export function morningMessage(blocks: { title: string; startTime: string | null }[]): PushPayload | null {
  if (!blocks.length) return null;
  const timed = blocks.filter((b) => b.startTime).map((b) => `${b.title.trim()} ${b.startTime}`);
  const untimed = blocks.filter((b) => !b.startTime).map((b) => b.title);
  const parts: string[] = [];
  // "Gym 14:00, ORT 18:30" (con comas: se lee como agenda).
  if (timed.length) parts.push(timed.length <= 5 ? timed.join(", ") : `${timed.slice(0, 5).join(", ")} y ${timed.length - 5} más`);
  if (untimed.length) parts.push(timed.length ? `sin hora: ${listNames(untimed)}` : `Para hacer: ${listNames(untimed)}`);
  const n = blocks.length;
  return {
    title: n === 1 ? "Hoy: 1 cosa en el Plan" : `Hoy: ${n} cosas en el Plan`,
    body: parts.join(" · "),
    url: "/plan",
    tag: "aviso-manana",
  };
}

/** "Android · Chrome" a partir del user agent, para reconocer cada aparato en la lista. */
export function deviceLabel(ua: string | null | undefined): string {
  const s = ua ?? "";
  const os = /Android/i.test(s)
    ? "Android"
    : /iPhone/i.test(s)
      ? "iPhone"
      : /iPad/i.test(s)
        ? "iPad"
        : /Windows/i.test(s)
          ? "Windows"
          : /Mac OS X|Macintosh/i.test(s)
            ? "Mac"
            : /Linux/i.test(s)
              ? "Linux"
              : "Aparato";
  const browser = /SamsungBrowser/i.test(s)
    ? "Samsung Internet"
    : /Edg\//i.test(s)
      ? "Edge"
      : /Firefox|FxiOS/i.test(s)
        ? "Firefox"
        : /OPR\//i.test(s)
          ? "Opera"
          : /Chrome|CriOS/i.test(s)
            ? "Chrome"
            : /Safari/i.test(s)
              ? "Safari"
              : "";
  return browser ? `${os} · ${browser}` : os;
}

/**
 * Hábitos en construcción listos para subir: `weeks` = semanas seguidas cumplidas y
 * `next` = el paso al que puede subir ("4 días por semana").
 */
export function ladderMessage(items: { name: string; weeks: number; next: string }[]): PushPayload | null {
  if (!items.length) return null;
  if (items.length === 1) {
    const it = items[0];
    return {
      title: `${it.name}: ¿subís un paso?`,
      body: `Cumpliste ${it.weeks === 1 ? "1 semana" : `${it.weeks} semanas seguidas`}. ¿Pasás a ${it.next}?`,
      url: "/habitos",
      tag: "aviso-escalones",
    };
  }
  return {
    title: `${items.length} hábitos listos para subir un paso`,
    body: listNames(items.map((i) => i.name)),
    url: "/habitos",
    tag: "aviso-escalones",
  };
}

/** Aviso de un hábito propio (hoy toca y no está hecho); `left` = lo que falta en uno de cantidad. */
export function habitMessage(id: string, name: string, left: string | null): PushPayload {
  return {
    title: name,
    body: left ? `Te faltan ${left} hoy.` : "Todavía no lo marcaste hoy.",
    url: "/habitos",
    tag: `aviso-habito-${id}`.slice(0, 32),
  };
}

export function checkinMessage(): PushPayload {
  return { title: "¿Cómo estás?", body: "Cargá cómo arrancás el día: ánimo, energía y cómo dormiste.", url: "/", tag: "aviso-checkin" };
}

/** Tarea prioritaria: sin elegir (`title` null) o elegida y sin hacer. */
export function priorityMessage(title: string | null): PushPayload {
  return title
    ? { title: "¿Hiciste la tarea prioritaria?", body: title, url: "/", tag: "aviso-prioritaria" }
    : { title: "Elegí la tarea prioritaria", body: "Todavía no elegiste lo más importante de hoy.", url: "/", tag: "aviso-prioritaria" };
}

export function journalMessage(streak: number): PushPayload {
  return {
    title: "Hoy todavía no escribiste",
    body: streak > 1 ? `Llevás ${streak} días seguidos escribiendo.` : "Unas líneas sobre cómo te fue hoy.",
    url: "/journal/escribir",
    tag: "aviso-journal",
  };
}

/** Presupuestos pasados (`over`) o cerca del tope (`near`), con el texto del monto ya armado. */
export function budgetsMessage(items: { name: string; state: "over" | "near"; text: string }[]): PushPayload | null {
  if (!items.length) return null;
  const over = items.filter((i) => i.state === "over");
  const title = over.length
    ? over.length === 1
      ? `Te pasaste en ${over[0].name}`
      : `Te pasaste en ${over.length} presupuestos`
    : items.length === 1
      ? `Cerca del tope en ${items[0].name}`
      : `${items.length} presupuestos cerca del tope`;
  return { title, body: items.map((i) => `${i.name}: ${i.text}`).join(" · "), url: "/gastos/presupuestos", tag: "aviso-presupuestos" };
}

export function reviewMessage(): PushPayload {
  return { title: "Revisión semanal", body: "Mirá cómo te fue esta semana y escribí la reflexión.", url: "/semana", tag: "aviso-revision" };
}

export function wheelMessage(last: string): PushPayload {
  return { title: "Toca la rueda de la vida", body: `La última fue el ${last}: pasaron 9 meses.`, url: "/rueda", tag: "aviso-rueda" };
}

export function backupMessage(text: string): PushPayload {
  return { title: "Respaldo", body: text, url: "/datos", tag: "aviso-respaldo" };
}
