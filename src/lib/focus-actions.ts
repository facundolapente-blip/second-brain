"use server";

/** Acciones del temporizador de enfoque (pomodoro). Ver `app/(app)/(inicio)/enfoque/`. */
import { revalidatePath } from "next/cache";
import { prisma } from "./prisma";
import { exigirSesion } from "./session";
import { logActivity, trashAndDelete } from "./trash";
import { toDbDate } from "./dates";
import { Prisma } from "@prisma/client";
import { pushConfigured, sendPush } from "./push";
import { cleanNote, FOCUS_PUSH_KEY, FOCUS_SETTINGS_KEY, normalizeFocusSettings, sessionDay, type FocusSettings } from "./focus-logic";

export type FocusSessionInput = {
  startedAt: number | string;
  endedAt: number | string;
  minutes: number;
  note?: string | null;
  taskId?: string | null;
  blockId?: string | null;
  title?: string | null;
};

const idOrNull = (v: unknown) => (typeof v === "string" && /^[\w-]{1,64}$/.test(v) && !v.startsWith("pendiente-") ? v : null);

/** Anota una sesión de enfoque terminada ("¿Qué hiciste?"). */
export async function saveFocusSession(input: FocusSessionInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await exigirSesion();
  const startedAt = new Date(input?.startedAt ?? NaN);
  const endedAt = new Date(input?.endedAt ?? NaN);
  if (isNaN(startedAt.getTime()) || isNaN(endedAt.getTime()) || endedAt < startedAt) return { ok: false, error: "La sesión no tiene un horario válido." };
  const minutes = Math.round(Number(input.minutes));
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 600) return { ok: false, error: "La sesión tiene que durar al menos un minuto." };
  const title = typeof input.title === "string" ? input.title.trim().slice(0, 200) || null : null;
  const row = await prisma.focusSession.create({
    data: {
      day: toDbDate(sessionDay(startedAt)),
      startedAt,
      endedAt,
      minutes,
      note: cleanNote(input.note),
      taskId: idOrNull(input.taskId),
      blockId: idOrNull(input.blockId),
      title,
    },
  });
  await logActivity("created", "focusSession", row.id, `${minutes} min de enfoque${title ? ` · ${title}` : ""}`);
  revalidatePath("/enfoque");
  return { ok: true, id: row.id };
}

/** Cambia "¿Qué hiciste?" de una sesión ya anotada. */
export async function updateFocusNote(id: string, note: string) {
  await exigirSesion();
  if (typeof id !== "string") return { ok: false as const };
  await prisma.focusSession.updateMany({ where: { id }, data: { note: cleanNote(note) } });
  revalidatePath("/enfoque");
  return { ok: true as const };
}

/** A la papelera (se deshace con el aviso de abajo). */
export async function deleteFocusSession(id: string) {
  await exigirSesion();
  if (typeof id !== "string") return;
  await trashAndDelete("focusSession", id);
  revalidatePath("/enfoque");
}

/** Los tiempos: enfoque, descanso corto, largo y cada cuántas sesiones el largo. */
export async function saveFocusSettings(raw: FocusSettings) {
  await exigirSesion();
  const value = JSON.stringify(normalizeFocusSettings(raw));
  await prisma.appSetting.upsert({ where: { key: FOCUS_SETTINGS_KEY }, create: { key: FOCUS_SETTINGS_KEY, value }, update: { value } });
  revalidatePath("/enfoque");
  return { ok: true as const };
}

/** El interruptor "Avisar al celular y al reloj" de Enfoque. */
export async function saveFocusPush(on: boolean) {
  await exigirSesion();
  const value = on === true ? "1" : "0";
  await prisma.appSetting.upsert({ where: { key: FOCUS_PUSH_KEY }, create: { key: FOCUS_PUSH_KEY, value }, update: { value } });
  revalidatePath("/enfoque");
  return { ok: true as const };
}

/**
 * Aviso a los aparatos (celular y, por él, el reloj) cuando termina una sesión o un descanso.
 * Lo pide el aparato donde corre el reloj; si hay dos pantallas abiertas, sale una sola vez
 * (recibo por la hora en que terminó).
 */
export async function sendFocusPush(endsAt: number, kind: "focus" | "break", title?: string | null) {
  await exigirSesion();
  if (!pushConfigured() || !Number.isFinite(endsAt)) return { ok: false as const };
  // Solo avisos de algo que terminó hace poco (no de una pantalla vieja que se volvió a abrir).
  if (Math.abs(Date.now() - endsAt) > 30 * 60_000) return { ok: false as const };
  try {
    await prisma.actionReceipt.create({ data: { id: `aviso-enfoque-${Math.round(endsAt)}`, name: "aviso.enfoque" } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: true as const };
    throw e;
  }
  const what = typeof title === "string" ? title.trim().slice(0, 120) : "";
  await sendPush(
    kind === "focus"
      ? { title: "Terminó la sesión de enfoque", body: what ? `${what} · anotá qué hiciste` : "Anotá qué hiciste y tomate un descanso.", url: "/enfoque", tag: "aviso-enfoque" }
      : { title: "Se terminó el descanso", body: "¿Otra sesión de enfoque?", url: "/enfoque", tag: "aviso-enfoque" },
  );
  return { ok: true as const };
}
