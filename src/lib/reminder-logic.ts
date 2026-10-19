/**
 * Avisos (notificaciones push): qué tipos hay, sus horas y el texto de cada uno.
 * Reglas puras, sin base ni imports (las prueba un script con node). Los datos los
 * junta `reminders.ts`; el envío, `push.ts`; los crons, `/api/cron/avisos`.
 */

export const REMINDER_KINDS = ["manana", "tarjetas", "deadlines", "habitos"] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];
export type ReminderPrefs = Record<ReminderKind, { on: boolean; hour: number }>;

/**
 * Horas que se pueden elegir (de Montevideo). Hay un cron diario por cada una
 * (vercel.json): el plan gratis de Vercel solo deja crons de una vez por día y los
 * corre en cualquier minuto de esa hora, así que la hora es la precisión que hay.
 */
export const REMINDER_HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 6 a 23

/** Si el cron de la hora elegida no corrió, los de las 2 horas siguientes lo mandan. */
export const CATCH_UP_HOURS = 2;

export const REMINDER_INFO: Record<ReminderKind, { label: string; hint: string }> = {
  manana: { label: "Plan del día", hint: "A la mañana, los bloques de hoy con su hora." },
  tarjetas: { label: "Tarjeta por vencer", hint: "El resumen sin pagar: 5, 3 y 1 día antes, el día que vence y si ya venció." },
  deadlines: { label: "Deadlines", hint: "Tareas abiertas que vencen mañana u hoy, y las vencidas." },
  habitos: { label: "Hábitos sin marcar", hint: "A la noche, cuántos hábitos de hoy te faltan marcar." },
};

export const DEFAULT_PREFS: ReminderPrefs = {
  manana: { on: true, hour: 8 },
  tarjetas: { on: true, hour: 10 },
  deadlines: { on: true, hour: 20 },
  habitos: { on: true, hour: 21 },
};

/** Lo guardado (JSON de `AppSetting "avisos"`), completado y acotado. */
export function normalizePrefs(raw: unknown): ReminderPrefs {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = {} as ReminderPrefs;
  for (const k of REMINDER_KINDS) {
    const v = src[k] && typeof src[k] === "object" ? (src[k] as Record<string, unknown>) : {};
    const hour = Number(v.hour);
    out[k] = {
      on: typeof v.on === "boolean" ? v.on : DEFAULT_PREFS[k].on,
      hour: REMINDER_HOURS.includes(hour) ? hour : DEFAULT_PREFS[k].hour,
    };
  }
  return out;
}

/** Qué avisos tocan a esta hora: los activos cuya hora ya llegó (con margen por si un cron falló). */
export function dueKinds(prefs: ReminderPrefs, hourNow: number): ReminderKind[] {
  return REMINDER_KINDS.filter((k) => prefs[k].on && hourNow >= prefs[k].hour && hourNow <= prefs[k].hour + CATCH_UP_HOURS);
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

/** Hábitos de hoy sin marcar (`open`: nombres, en el orden de la lista) de los que tocan (`total`). */
export function habitsMessage(open: string[], done: number, total: number): PushPayload | null {
  if (!open.length) return null;
  const n = open.length;
  return {
    title: n === 1 ? "Te falta 1 hábito hoy" : `Te faltan ${n} hábitos hoy`,
    body: `${listNames(open, 4)} · llevás ${done} de ${total}`,
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
