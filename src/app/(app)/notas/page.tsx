import { countUncategorized, getNoteCategories, getNoteCounts, getNotes, getNoteTags } from "@/lib/notes";
import { isNoteSection, normalizeCategory, NO_CATEGORY } from "@/lib/notes-logic";
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
 * uno mismo. Filtros en la dirección: ?seccion=, ?categoria= (o "sin"), ?q=, ?etiqueta=, ?ver=despues
 * (videos sin ver) y ?n= (cuántas se ven).
 */
export default async function NotasPage({ searchParams }: PageProps<"/notas">) {
  const sp = await searchParams;
  const rawSection = one(sp.seccion);
  const section = isNoteSection(rawSection) ? rawSection : null;
  const q = one(sp.q).slice(0, 100);
  const tag = one(sp.etiqueta).slice(0, 40).toLowerCase();
  const later = section === "videos" && one(sp.ver) === "despues";
  // La categoría es de una sección: sin sección no se filtra por categoría.
  const rawCategory = one(sp.categoria);
  const category = !section || !rawCategory ? "" : rawCategory.toLowerCase() === NO_CATEGORY ? NO_CATEGORY : (normalizeCategory(rawCategory) ?? "");
  const limit = Math.min(2000, Math.max(PAGE, Number(one(sp.n)) || PAGE));

  const [{ notes, nextCursor }, counts, tags, categories, uncategorized] = await Promise.all([
    getNotes({ section, q, tag: tag || null, category: category || null, done: later ? false : null, limit }),
    getNoteCounts(),
    getNoteTags(),
    getNoteCategories(),
    section ? countUncategorized(section) : 0,
  ]);

  return (
    <NotesView
      notes={notes}
      hasMore={!!nextCursor}
      counts={counts}
      tags={tags}
      categories={categories}
      uncategorized={uncategorized}
      filters={{ section, q, tag, category, later, limit }}
      today={todayISO()}
      openNew={one(sp.nuevo) === "1"}
    />
  );
}
