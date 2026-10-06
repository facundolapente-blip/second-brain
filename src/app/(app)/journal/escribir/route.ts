import { writeOnDay } from "@/lib/journal-actions";

export const dynamic = "force-dynamic";

/** /journal/escribir: abre (o crea) la entrada de hoy. Para el atajo del ícono de la app. */
export async function GET() {
  // writeOnDay pide sesión y termina redirigiendo al editor.
  await writeOnDay();
  return new Response(null, { status: 204 });
}
