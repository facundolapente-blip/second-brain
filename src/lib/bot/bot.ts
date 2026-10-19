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
import { parseBlock, parseCommand, parseTask } from "./parse";

/**
 * Lo que hace el bot de WhatsApp con cada mensaje (ya validada la firma y el número en
 * `app/api/whatsapp/route.ts`). Devuelve el texto de la respuesta, en texto plano.
 */

export const HELP = [
  "Mandame cosas y entran a Second Brain:",
  "",
  "Gastos e ingresos (como la carga rápida):",
  "350 almuerzo itau",
  "+2450 disco santander ayer",
  "usd 20 nafta",
  "20x3 almuerzo",
  "",
  "Tarea del Plan (fecha opcional, queda como deadline):",
  "tarea llamar al banco viernes",
  "tarea pagar el alquiler 25/10",
  "",
  "Bloque de la semana (día y hora opcionales):",
  "bloque gym mañana 18",
  "bloque ORT jueves 18:30-20:30",
  "",
  "Nota en Valores (va a la sección Notas):",
  "nota primero lo importante",
  "",
  "hoy: resumen del día",
].join("\n");

const SHORT_HELP =
  "No te entendí. Probá con:\n350 almuerzo itau\ntarea llamar al banco viernes\nbloque gym mañana 18\nnota primero lo importante\nhoy\n\nayuda: todos los ejemplos";

const MAX_TEXT = 1000;

export async function handleBotMessage(raw: string): Promise<string> {
  const text = raw.trim();
  if (!text) return SHORT_HELP;
  if (text.length > MAX_TEXT) return `Es muy largo (máximo ${MAX_TEXT} caracteres).`;
  const { cmd, rest } = parseCommand(text);
  const today = todayISO();

  switch (cmd) {
    case "ayuda":
      return HELP;
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
