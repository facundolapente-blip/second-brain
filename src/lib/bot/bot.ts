import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "../prisma";
import { formatLong, toDbDate, todayISO } from "../dates";
import { moneyWhole } from "../format";
import { isFreeBlock, topSortKey } from "../plan-logic";
import { logActivity, trashAndDelete } from "../trash";
import { createQuickTransaction } from "../quick-add";
import { getDashboard } from "../dashboard";
import { appendValueNote, VALUES_KEY } from "../values";
import { guessCategory, isDeleteReply, isSkipMessage, quotedNoteText, looksLikeExpense, looksLikePrice, parseBlock, parseCheckin, parseCommand, parseJournal, parseTask, SKIP_REPLY } from "./parse";
import { cleanPatch, ENERGY_LABELS, formatSleep, formatWeight, STRESS_LABELS } from "../checkin-logic";
import { applyCheckin } from "../checkin-save";
import { MOODS } from "../journal-logic";
import { looksLikeSecret } from "../notes-logic";
import { attachPriceToLastShop, saveTextNote } from "./notes";
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
  "TT tarea del Plan (fecha y prioridad opcionales; la categoría la deduzco por tus tareas):",
  "TT llamar al banco viernes",
  "TT pagar el alquiler 25/10",
  "TT story HM 3 de noviembre prioridad 3",
  "",
  "JJ journal (se suma a la entrada de hoy; con ayer: a la de ayer):",
  "JJ hoy entrené y me sentí bien",
  "JJ ayer: cena con amigos",
  "",
  "CC check-in del día (todo opcional; con ayer adelante, el de ayer):",
  "CC animo 4 energia 3 estres 2 sueño 7:30 peso 82,4",
  "CC 4 3 2 (ánimo, energía y estrés, del 1 al 5)",
  "CC animo bien nota dormí poco",
  "CC solo: cómo va el de hoy",
  "",
  "Bloque de la semana (día y hora opcionales):",
  "bloque gym mañana 18",
  "bloque ORT jueves 18:30-20:30",
  "",
  "Nota en Valores (va a la sección Notas):",
  "nota primero lo importante",
  "",
  "hoy: resumen del día",
  "",
  "NO adelante (en mayúsculas): no se anota en ningún lado:",
  "NO esto es solo para mí",
  "",
  "Todo lo demás va a Notas y se cataloga solo:",
  "un link de YouTube, Instagram o TikTok → Videos",
  "un link de una tienda → Para comprar (si después mandás el precio, se le suma)",
  "cursos, música, otros links, ideas y textos → su sección",
  "fotos → Archivos",
  "audios → los paso a texto y van a su sección",
  "",
  "Respondé a un mensaje tuyo con un comando para moverlo de Notas:",
  "JJ (o JJ ayer) → al journal",
  "TT (o TT viernes p3) → tarea",
  "bloque mañana 18 → bloque de la semana",
  "nota → a Valores",
  "borrar → lo saca de Notas",
  "(Un renglón que empieza con un monto sigue siendo un gasto. Contraseñas y claves no se guardan.)",
].join("\n");

const SHORT_HELP =
  "No te entendí. Probá con:\nGG 350 almuerzo itau\nGG +2450 sueldo\nTT llamar al banco viernes\nJJ hoy fue un buen día\nCC animo 4 energia 3 sueño 7:30\nbloque gym mañana 18\nnota primero lo importante\nhoy\nNO adelante: no se anota\n\nayuda: todos los ejemplos";

const MAX_TEXT = 1000;
/** El journal acepta textos largos (WhatsApp manda hasta 4096 caracteres). */
const MAX_JOURNAL = 4096;

export async function handleBotMessage(raw: string, msgId: string | null = null): Promise<string> {
  const text = raw.trim();
  if (!text) return SHORT_HELP;
  // "NO …" en mayúsculas: no se anota en ningún lado.
  if (isSkipMessage(text)) return SKIP_REPLY;
  const { cmd, rest } = parseCommand(text);
  if (text.length > (cmd === "diario" || cmd === null ? MAX_JOURNAL : MAX_TEXT)) return `Es muy largo (máximo ${cmd === "diario" || cmd === null ? MAX_JOURNAL : MAX_TEXT} caracteres).`;
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
      return await createTask(p.title, p.deadline, today, p.priority);
    }
    case "bloque": {
      const p = parseBlock(rest, today);
      if ("error" in p) return p.error;
      return await createBlock(p, today);
    }
    case "nota":
      return await addNote(rest);
    case "checkin": {
      // "animo 4" sin CC: la palabra es parte de lo que se carga.
      const p = parseCheckin(/^\/?[áa]nimo\b/i.test(text) ? `animo ${rest}` : rest, today);
      if ("error" in p) return p.error;
      if ("show" in p) return await checkinStatus(p.show, today, false);
      const patch = cleanPatch(p.fields);
      if (p.note) {
        const had = await prisma.dailyCheckin.findUnique({ where: { date: toDbDate(p.date) }, select: { note: true } });
        Object.assign(patch, cleanPatch({ note: had?.note ? `${had.note} · ${p.note}` : p.note }));
      }
      await applyCheckin(p.date, patch);
      return await checkinStatus(p.date, today, true);
    }
    case "diario": {
      const p = parseJournal(rest, today);
      if ("error" in p) return p.error;
      const r = await appendToJournal(p.date, p.text, "WhatsApp");
      const when = p.date === today ? "de hoy" : "de ayer";
      return `${r.created ? "Empecé la entrada" : "Sumado a la entrada"} ${when} del journal (${r.words} ${r.words === 1 ? "palabra" : "palabras"} en total).`;
    }
    default: {
      // Sin comando: nunca guardar credenciales.
      if (looksLikeSecret(text)) return "Eso parece una contraseña o una clave: no la guardo. Mejor guardala en un gestor de contraseñas.";
      // "260 con envío" después de un link de tienda es su precio, no un gasto.
      if (looksLikePrice(text)) {
        const r = await attachPriceToLastShop(text);
        if (r) return r;
      }
      // Un renglón que empieza con un monto sigue siendo un gasto (como la carga rápida).
      if (looksLikeExpense(text)) {
        const r = await createQuickTransaction(text, undefined, "WhatsApp");
        if (r.ok) return r.summary;
      }
      // Todo lo demás va a Notas, a la sección que corresponda.
      return await saveTextNote(text, msgId);
    }
  }
}

/**
 * Responder en WhatsApp a un mensaje propio con un comando (pedido de Facu, 2026-11-08):
 * lo que ese mensaje guardó en Notas se pasa adonde diga el comando y sale de Notas
 * (a la papelera). JJ → journal (con "JJ ayer", a ayer), TT → tarea (lo de después de TT
 * es la fecha o la prioridad: "TT viernes p3"; el texto entero queda en las notas de la
 * tarea), GG → gasto, bloque → bloque ("bloque mañana 18"), nota → Valores, "borrar" o
 * "NO" → solo la saca de Notas. Devuelve null si el mensaje citado no es una nota o el
 * comando no aplica: entonces se trata como un mensaje común.
 */
export async function handleReplyCommand(raw: string, quotedId: string): Promise<string | null> {
  const text = raw.trim();
  const note = await prisma.note.findFirst({
    where: { externalId: quotedId.slice(0, 120) },
    select: { id: true, title: true, body: true, url: true, _count: { select: { attachments: true } } },
  });
  if (!note) {
    // "JJ" o "borrar" solos no tienen nada que hacer sin la nota citada.
    const { cmd, rest } = parseCommand(text);
    const bare = isDeleteReply(text) || (!rest && (cmd === "diario" || cmd === "tarea" || cmd === "gasto" || cmd === "bloque" || cmd === "nota"));
    return bare ? "Ese mensaje no está en Notas (puede que ya lo hayas movido o que haya sido un gasto o una tarea)." : null;
  }
  const { full, title } = quotedNoteText(note);
  const today = todayISO();
  const moved = async (answer: string) => {
    await trashAndDelete("note", note.id);
    revalidatePath("/notas");
    revalidatePath("/");
    return `${answer}\n(Lo saqué de Notas; está en la papelera por si acaso.)`;
  };

  if (isDeleteReply(text)) return (await trashAndDelete("note", note.id)) ? (revalidatePath("/notas"), "Listo, lo saqué de Notas (está en la papelera).") : "Ya no estaba en Notas.";
  const { cmd, rest } = parseCommand(text);
  switch (cmd) {
    case "diario": {
      if (!full) return "Ese mensaje no tiene texto para pasar al journal.";
      const p = parseJournal(rest ? `${rest}\n${full}` : full, today);
      if ("error" in p) return p.error;
      const r = await appendToJournal(p.date, p.text, "WhatsApp");
      // Las fotos de la nota pasan a la entrada.
      if (note._count.attachments) await prisma.attachment.updateMany({ where: { noteId: note.id }, data: { noteId: null, journalEntryId: r.id } });
      return await moved(`Pasado al journal ${p.date === today ? "de hoy" : "de ayer"}${note._count.attachments ? " (con las fotos)" : ""}.`);
    }
    case "tarea": {
      if (!title) return "Ese mensaje no tiene texto para una tarea.";
      const p = parseTask(`${title} ${rest}`.trim(), today);
      if ("error" in p) return p.error;
      return await moved(await createTask(p.title, p.deadline, today, p.priority, full !== title ? full : undefined));
    }
    case "gasto": {
      const r = await createQuickTransaction(`${title} ${rest}`.trim(), undefined, "WhatsApp");
      return r.ok ? await moved(r.summary) : `${r.error} Ese mensaje no parece un gasto.`;
    }
    case "bloque": {
      if (!title) return "Ese mensaje no tiene texto para un bloque.";
      const p = parseBlock(`${title} ${rest}`.trim(), today);
      if ("error" in p) return p.error;
      return await moved(await createBlock(p, today));
    }
    case "nota":
      if (!full) return "Ese mensaje no tiene texto para Valores.";
      return await moved(await addNote(full));
    default:
      return null;
  }
}

/** Cómo quedó (o cómo va) el check-in de un día, con lo que falta. */
async function checkinStatus(date: string, today: string, saved: boolean): Promise<string> {
  const c = await prisma.dailyCheckin.findUnique({ where: { date: toDbDate(date) } });
  const when = date === today ? "de hoy" : "de ayer";
  const scale = (v: number | null | undefined, labels: string[]) => (v ? `${v} · ${labels[v - 1]}` : null);
  const rows: [string, string | null][] = [
    ["Ánimo", scale(c?.mood, MOODS.map((m) => m.label))],
    ["Energía", scale(c?.energy, ENERGY_LABELS)],
    ["Estrés", scale(c?.stress, STRESS_LABELS)],
    ["Sueño", c?.sleepMin ? formatSleep(c.sleepMin) : null],
    ["Peso", c?.weightG ? formatWeight(c.weightG) : null],
  ];
  const have = rows.filter(([, v]) => v);
  const missing = rows.filter(([, v]) => !v).map(([k]) => k.toLowerCase());
  if (!have.length && !c?.note)
    return `Todavía no cargaste el check-in ${when}. Por ejemplo: CC animo 4 energia 3 estres 2 sueño 7:30 peso 82,4`;
  return [
    saved ? `Listo, check-in ${when}:` : `Check-in ${when}:`,
    ...have.map(([k, v]) => `${k}: ${v}`),
    ...(c?.note ? [`Nota: ${c.note}`] : []),
    ...(missing.length ? ["", `Falta: ${missing.join(", ")}.`] : []),
  ].join("\n");
}

/** Como `saveTask` al crear con lo de fábrica: Sin empezar, prioridad 1, arriba de todo. */
/** Categorías del Plan y lo ya clasificado (tareas y bloques de los últimos meses), para `guessCategory`. */
async function planCategoryGuess(rawTitle: string) {
  const since = new Date(Date.now() - 365 * 86_400_000);
  const [categories, tasks, blocks] = await Promise.all([
    prisma.planCategory.findMany({ select: { id: true, name: true } }),
    prisma.planTask.findMany({ where: { categoryId: { not: null } }, select: { title: true, categoryId: true }, take: 2000, orderBy: { createdAt: "desc" } }),
    prisma.planBlock.findMany({ where: { categoryId: { not: null }, date: { gte: since } }, select: { title: true, categoryId: true }, take: 3000, orderBy: { date: "desc" } }),
  ]);
  const g = guessCategory(rawTitle, categories, [...tasks, ...blocks]);
  return { ...g, name: g.categoryId ? categories.find((c) => c.id === g.categoryId)?.name ?? null : null };
}

const PRIORITY_NAMES = ["", "baja", "media", "alta", "urgente"];

async function createTask(rawTitle: string, deadline: string | null, today: string, priority?: number, notes?: string): Promise<string> {
  const { categoryId, title, name } = await planCategoryGuess(rawTitle);
  const first = await prisma.planTask.aggregate({ _min: { order: true } });
  const created = await prisma.planTask.create({
    data: {
      title,
      categoryId,
      status: "todo",
      priority: priority ?? 1,
      deadline: deadline ? toDbDate(deadline) : null,
      notes: notes?.trim() ? notes.trim().slice(0, 5000) : null,
      order: (first._min.order ?? 0) - 1,
    },
  });
  await logActivity("created", "task", created.id, `${title} (WhatsApp)`);
  revalidatePath("/plan", "layout");
  revalidatePath("/");
  return `Tarea: ${title}${deadline ? ` · vence el ${formatLong(deadline, today)}` : ""}${priority ? ` · prioridad ${PRIORITY_NAMES[priority]}` : ""}${name ? ` · ${name}` : ""}`;
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
  // La categoría, razonada como en las tareas (lo ya clasificado con las mismas palabras).
  const guess = await planCategoryGuess(b.title);
  b = { ...b, title: guess.title };
  const created = await prisma.planBlock.create({
    data: { title: b.title, date, startTime: b.startTime, endTime: b.endTime, priority: 0, sortKey, categoryId: guess.categoryId },
  });
  await logActivity("created", "block", created.id, `${b.title} (${b.date}) (WhatsApp)`);
  revalidatePath("/plan", "layout");
  revalidatePath("/");
  const hour = b.startTime ? ` · ${b.startTime}${b.endTime ? `–${b.endTime}` : ""}` : " · sin hora";
  const when = b.date === today ? "hoy" : formatLong(b.date, today);
  return `Bloque: ${b.title} · ${when}${hour}${guess.name ? ` · ${guess.name}` : ""}`;
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
