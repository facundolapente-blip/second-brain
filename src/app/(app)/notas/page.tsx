import { getNoteCounts, getNotes, getNoteTags } from "@/lib/notes";
import { isNoteSection } from "@/lib/notes-logic";
import { todayISO } from "@/lib/dates";
import { NotesView } from "./notes-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Notas" };

const PAGE = 60;

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

/**
 * Notas: videos, links, ideas y lo demás que antes iba al chat de WhatsApp con
 * uno mismo. Filtros en la dirección: ?seccion=, ?q=, ?etiqueta=, ?ver=despues
 * (videos sin ver) y ?n= (cuántas se ven).
 */
export default async function NotasPage({ searchParams }: PageProps<"/notas">) {
  const sp = await searchParams;
  const rawSection = one(sp.seccion);
  const section = isNoteSection(rawSection) ? rawSection : null;
  const q = one(sp.q).slice(0, 100);
  const tag = one(sp.etiqueta).slice(0, 40).toLowerCase();
  const later = section === "videos" && one(sp.ver) === "despues";
  const limit = Math.min(2000, Math.max(PAGE, Number(one(sp.n)) || PAGE));

  const [{ notes, nextCursor }, counts, tags] = await Promise.all([
    getNotes({ section, q, tag: tag || null, done: later ? false : null, limit }),
    getNoteCounts(),
    getNoteTags(),
  ]);

  return (
    <NotesView
      notes={notes}
      hasMore={!!nextCursor}
      counts={counts}
      tags={tags}
      filters={{ section, q, tag, later, limit }}
      today={todayISO()}
      openNew={one(sp.nuevo) === "1"}
    />
  );
}
