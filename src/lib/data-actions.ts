"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "./prisma";
import { exigirSesion } from "./session";
import { importHabitNow } from "./importers/habitnow";
import { importMyDiary, linesFromDocx, linesFromPdf, linesFromText, parseEntries } from "./importers/mydiary";
import { importGastosCsv } from "./importers/gastos-csv";

export type ImportResult = { ok: true; message: string } | { ok: false; error: string } | null;

const MAX_BYTES = 4 * 1024 * 1024;

/**
 * Importa un backup subido desde la pantalla Datos. Nunca borra: HabitNow en
 * modo "update", My Diary solo agrega (o actualiza si es el .docx) y Gastos
 * sin duplicar.
 */
export async function importBackup(_prev: ImportResult, fd: FormData): Promise<ImportResult> {
  await exigirSesion();
  const kind = String(fd.get("tipo") ?? "");
  const file = fd.get("archivo");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Elegí un archivo." };
  if (file.size > MAX_BYTES) return { ok: false, error: "El archivo pesa más de 4 MB." };
  const ext = file.name.toLowerCase().split(".").pop() ?? "";

  try {
    let message: string;
    if (kind === "habitnow") {
      if (ext !== "hn") return { ok: false, error: "El backup de HabitNow es un archivo .hn." };
      message = await importHabitNow(prisma, await file.text(), "update");
    } else if (kind === "mydiary") {
      const buf = new Uint8Array(await file.arrayBuffer());
      let lines: string[];
      if (ext === "pdf") lines = await linesFromPdf(buf);
      else if (ext === "docx") lines = linesFromDocx(buf);
      else if (ext === "txt") lines = linesFromText(new TextDecoder().decode(buf));
      else return { ok: false, error: "My Diary exporta en .pdf o .docx." };
      message = await importMyDiary(prisma, parseEntries(lines), { updateExisting: ext === "docx" });
    } else if (kind === "gastos") {
      if (ext !== "csv") return { ok: false, error: "El export de gastos es un .csv." };
      message = await importGastosCsv(prisma, await file.text());
    } else {
      return { ok: false, error: "Tipo de backup desconocido." };
    }
    revalidatePath("/", "layout");
    return { ok: true, message };
  } catch (e) {
    console.error(e);
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo importar el archivo." };
  }
}
