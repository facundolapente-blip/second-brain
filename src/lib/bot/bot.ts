import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "../prisma";
import { formatLong, toDbDate, todayISO } from "../dates";
import { moneyWhole } from "../format";
import { isFreeBlock, topSortKey } from "../plan-logic";
import { logActivity } from "../trash";
import { createQuickTransaction } from "../quick-add";
import { getDashboard } from "../dashboard";
import { appendValueNote, VALUES_KEY } from "../values";
import { parseBlock, parseCommand, parseJournal, parseTask } from "./parse";
import { appendToJournal } from "../journal-append";

/**
 * Lo que hace el bot de WhatsApp con cada mensaje (ya validada la firma y el número en
 * `app/api/whatsapp/route.ts`). Devuelve el texto de la respuesta, en texto plano.
 */

export const HELP = [
  "Mandame cosas y entran a Second Brain:",
  "",
  "GG gasto (como la carga rápida; con + adelante es un ingreso):",
  "GG 350 almuerzo itau",
  "GG +2450 sueldo santander",
  "GG usd 20 nafta",
  "GG 20x3 café ayer",
  "",
  "TT tarea del Plan (fecha opcional, queda como deadline):",
  "TT llamar al banco viernes",
  "TT pagar el alquiler 25/10",
  "",
  "JJ journal (se suma a la entrada de hoy; con ayer: a la de ayer):",
  "JJ hoy entrené y me sentí bien",
  "JJ ayer: cena con amigos",
  "",
  "Bloque de la semana (día y hora opcionales):",
  "bloque gym mañana 18",
  "bloque ORT jueves 18:30-20:30",
  "",
  "Nota en Valores (va a la sección Notas):",
  "nota primero lo importante",
  "",
  "hoy: resumen del día",
  "(Sin GG también entiende un gasto si empieza con el monto.)",
].join("\n");

const SHORT_HELP =
  "No te entendí. Probá con:\nGG 350 almuerzo itau\nGG +2450 sueldo\nTT llamar al banco viernes\nJJ hoy fue un buen día\nbloque gym mañana 18\nnota primero lo importante\nhoy\n\nayuda: todos los ejemplos";

const MAX_TEXT = 1000;
/** El journal acepta textos largos (WhatsApp manda hasta 4096 caracteres). */
const MAX_JOURNAL = 4096;

export async function handleBotMessage(raw: string): Promise<string> {
  const text = raw.trim();
  if (!text) return SHORT_HELP;
  const { cmd, rest } = parseCommand(text);
  if (text.length > (cmd === "diario" ? MAX_JOURNAL : MAX_TEXT)) return `Es muy largo (máximo ${cmd === "diario" ? MAX_JOURNAL : MAX_TEXT} caracteres).`;
  const today = todayISO();

  switch (cmd) {
    case "ayuda":
      return HELP;
    case "gasto": {
      if (!rest) return "Falta el gasto. Por ejemplo: GG 350 almuerzo (o GG +2450 sueldo para un ingreso)";
      const r = await createQuickTransaction(rest, undefined, "WhatsApp");
      return r.ok ? r.summary : `${r.error} Por ejemplo: GG 350 almuerzo`;
    }
    case "hoy":
      return await summary();
    case "tarea": {
      const p = parseTask(rest, today);
      if ("error" in p) return p.error;
      return await createTask(p.title, p.deadline, today);
    }
    case "bloque": {
      const p = parseBlock(rest, today);
      if ("error" in p) return p.error;
      return await createBlock(p, today);
    }
    case "nota":
      return await addNote(rest);
    case "diario": {
      const p = parseJournal(rest, today);
      if ("error" in p) return p.error;
      const r = await appendToJournal(p.date, p.text, "WhatsApp");
      const when = p.date === today ? "de hoy" : "de ayer";
      return `${r.created ? "Empecé la entrada" : "Sumado a la entrada"} ${when} del journal (${r.words} ${r.words === 1 ? "palabra" : "palabras"} en total).`;
    }
    default: {
      const r = await createQuickTransaction(text, undefined, "WhatsApp");
      if (r.ok) return r.summary;
      // Sin monto: no era un gasto.
      return /monto/.test(r.error) ? SHORT_HELP : r.error;
    }
  }
}

/** Como `saveTask` al crear con lo de fábrica: Sin empezar, prioridad 1, arriba de todo. */
async function createTask(title: string, deadline: string | null, today: string): Promise<string> {
  const first = await prisma.planTask.aggregate({ _min: { order: true } });
  const created = await prisma.planTask.create({
    data: {
      title,
      status: "todo",
      priority: 1,
      deadline: deadline ? toDbDate(deadline) : null,
      order: (first._min.order ?? 0) - 1,
    },
  });
  await logActivity("created", "task", created.id, `${title} (WhatsApp)`);
  revalidatePath("/plan", "layout");
  revalidatePath("/");
  return `Tarea: ${title}${deadline ? ` · vence el ${formatLong(deadline, today)}` : ""}`;
}

/** Como `saveBlock` al crear: sin hora va arriba de todo en su día (`topSortKey`). */
async function createBlock(
  b: { title: string; date: string; startTime: string | null; endTime: string | null },
  today: string,
): Promise<string> {
  const date = toDbDate(b.date);
  let sortKey: number | null = null;
  if (!b.startTime) {
    const day = await prisma.planBlock.findMany({ where: { date }, select: { startTime: true, sortKey: true } });
    sortKey = topSortKey(day);
  }
  const created = await prisma.planBlock.create({
    data: { title: b.title, date, startTime: b.startTime, endTime: b.endTime, priority: 0, sortKey },
  });
  await logActivity("created", "block", created.id, `${b.title} (${b.date}) (WhatsApp)`);
  revalidatePath("/plan", "layout");
  revalidatePath("/");
  const hour = b.startTime ? ` · ${b.startTime}${b.endTime ? `–${b.endTime}` : ""}` : " · sin hora";
  const when = b.date === today ? "hoy" : formatLong(b.date, today);
  return `Bloque: ${b.title} · ${when}${hour}`;
}

/** Un renglón "- texto" al final de la sección "# Notas" de Valores (la crea si no está). */
async function addNote(rest: string): Promise<string> {
  const note = rest.replace(/\s+/g, " ").trim().slice(0, 500);
  if (!note) return "Falta la nota. Por ejemplo: nota primero lo importante";
  const row = await prisma.appSetting.findUnique({ where: { key: VALUES_KEY } });
  const value = appendValueNote(row?.value ?? "", note).slice(0, 50_000);
  await prisma.appSetting.upsert({ where: { key: VALUES_KEY }, create: { key: VALUES_KEY, value }, update: { value } });
  revalidatePath("/");
  revalidatePath("/valores");
  return `Nota agregada a Valores: ${note}`;
}

/** "hoy": hábitos, bloques de hoy y lo gastado en el mes (las mismas cifras que Inicio). */
async function summary(): Promise<string> {
  const d = await getDashboard();
  const lines = [`Hoy, ${formatLong(d.today, d.today)}`, ""];
  lines.push(
    d.habits.dueToday
      ? `Hábitos: ${d.habits.doneToday} de ${d.habits.dueToday} hechos${d.habits.doneToday >= d.habits.dueToday ? " (día completo)" : ""}`
      : "Hábitos: hoy no toca ninguno",
  );
  const blocks = d.plan.today.filter((b) => !isFreeBlock(b));
  if (blocks.length) {
    lines.push("", `Plan (${blocks.filter((b) => b.done).length} de ${blocks.length} hechos):`);
    for (const b of blocks.slice(0, 15)) {
      const hour = b.startTime ? `${b.startTime}${b.endTime ? `–${b.endTime}` : ""} ` : "";
      lines.push(`· ${hour}${b.title}${b.done ? " (hecho)" : ""}`);
    }
    if (blocks.length > 15) lines.push(`· y ${blocks.length - 15} más`);
  } else lines.push("", "Plan: nada para hoy");
  const month = new Intl.DateTimeFormat("es-UY", { month: "long", timeZone: "UTC" }).format(toDbDate(`${d.gastos.month}-01`));
  lines.push("", `Gastado en ${month.toLowerCase()}: ${moneyWhole(d.gastos.spentMonth)}`);
  return lines.join("\n");
}
