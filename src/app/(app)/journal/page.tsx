import Link from "next/link";
import { SwapOnChange } from "@/components/motion-wrap";
import { Fire } from "@phosphor-icons/react/dist/ssr";
import { JCard } from "./cards";
import { cookies } from "next/headers";
import { getAllTags, getEntries, getEntry, getHome, getQuickStats } from "@/lib/journal";
import { formatLong } from "@/lib/dates";
import { isMood, MEMORY_COOKIE, moodInfo, normalizeTag } from "@/lib/journal-logic";
import { EntryCard, JournalHeader } from "./journal-ui";
import { JournalTabs, WriteTodayButton } from "./journal-nav";
import { EmptyJournal, HomeActions, MemoryCard } from "./home-parts";
import { QuickStatsCard } from "./reader-panel";
import { ReaderSlot } from "./reader-slot";

export const metadata = { title: "Journal" };

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

export default async function JournalPage({ searchParams }: PageProps<"/journal">) {
  const sp = await searchParams;
  const q = one(sp.q).slice(0, 100);
  const tag = normalizeTag(one(sp.etiqueta));
  const moodN = Number(one(sp.animo));
  const mood = isMood(moodN) ? moodN : undefined;
  const starred = one(sp.favoritas) === "1";
  const limit = Math.min(2000, Math.max(60, Number(one(sp.n)) || 60));
  const filtering = !!(q || tag || mood || starred);
  const onlyStarred = starred && !q && !tag && !mood;
  const ver = one(sp.ver).slice(0, 64);

  const [home, { entries, hasMore, total, byYear }, tags, jar, reading, quick] = await Promise.all([
    getHome(),
    getEntries({ q, tag, mood, starred, limit }),
    getAllTags(),
    cookies(),
    ver ? getEntry(ver) : null,
    getQuickStats(),
  ]);
  const memoryDismissed = jar.get(MEMORY_COOKIE)?.value === home.today;

  // Agrupadas por año, de la más nueva a la más vieja.
  const years: { year: string; items: typeof entries }[] = [];
  for (const e of entries) {
    const y = e.date.slice(0, 4);
    if (years.at(-1)?.year !== y) years.push({ year: y, items: [] });
    years.at(-1)!.items.push(e);
  }

  const more = new URLSearchParams();
  if (q) more.set("q", q);
  if (tag) more.set("etiqueta", tag);
  if (mood) more.set("animo", String(mood));
  if (starred) more.set("favoritas", "1");
  // Lo mismo que se está viendo (búsqueda, filtros, cantidad), con o sin la entrada abierta en el panel.
  const base = new URLSearchParams(more);
  if (limit > 60) base.set("n", String(limit));
  const withVer = (id: string) => {
    const p = new URLSearchParams(base);
    p.set("ver", id);
    return `/journal?${p}`;
  };
  const closeHref = base.toString() ? `/journal?${base}` : "/journal";
  if (reading) more.set("ver", reading.id);
  more.set("n", String(limit + 120));

  let i = 0;

  return (
    <>
      <JournalHeader
        title="Journal"
        wide
        tabs={<JournalTabs />}
        actions={
          <>
            <HomeActions q={q} tag={tag} mood={mood ?? null} starred={starred} tags={tags} />
            <span className="ml-2">
              <WriteTodayButton wroteToday={home.wroteToday} />
            </span>
          </>
        }
      />

      <main className="mx-auto max-w-3xl px-4 pt-3 lg:grid lg:max-w-6xl lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-10 lg:px-10 lg:pt-8">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:gap-8">
        {!filtering && (
          <section className="rise grid gap-3 pt-1 lg:pt-0">
            <p className="kicker">{formatLong(home.today)}</p>
            <p className="display text-[38px] leading-[1.02] text-balance lg:text-[44px]">
              {/* El saludo ya está en Inicio: acá, una invitación a escribir. */}
              ¿Cómo estuvo tu día?
            </p>
            {home.streak > 0 && (
              <p className="inline-flex items-center gap-1.5 text-[14px] text-muted">
                <Fire size={15} weight="fill" className="text-[var(--p-orange-solid)]" aria-hidden />
                <span className="tabular">
                  {home.streak === 1 ? "1 día seguido escribiendo" : `${home.streak} días seguidos escribiendo`}
                </span>
              </p>
            )}
          </section>
        )}

        {!filtering && home.memory && !memoryDismissed && (
          <div className="lg:hidden">
            <MemoryCard memory={home.memory} today={home.today} />
          </div>
        )}

        {filtering && !(onlyStarred && entries.length === 0) && (
          <FilterSummary count={total} q={q} tag={tag} mood={mood} starred={starred} />
        )}

        {entries.length === 0 ? (
          onlyStarred ? (
            <JCard icon="star" title="Sin favoritas" meta="Todavía no marcaste ninguna" action={{ href: "/journal", label: "Ver todas" }}>
              <p className="max-w-[48ch] text-[14.5px] leading-relaxed text-muted">
                Abrí una entrada y tocá la estrella de arriba: va a aparecer acá.
              </p>
            </JCard>
          ) : filtering ? (
            <JCard icon="search" title="Sin resultados" meta="Ninguna entrada coincide" action={{ href: "/journal", label: "Limpiar" }}>
              <p className="max-w-[44ch] text-[14.5px] leading-relaxed text-muted">
                Probá con otra palabra o sacá algún filtro. La búsqueda no distingue tildes ni mayúsculas.
              </p>
            </JCard>
          ) : (
            <EmptyJournal />
          )
        ) : (
<SwapOnChange k={`${q}|${tag}|${mood}|${starred}`}>          <div className="grid gap-5 lg:gap-6">
            {/* Un año por tarjeta; en el celular la cabecera del año queda pegada arriba (journal.css). */}
            {years.map((g) => (
              <JCard
                key={g.year}
                className="jr-year"
                icon="notebook"
                title={g.year}
                meta={`${(byYear[g.year] ?? g.items.length).toLocaleString("es-UY")} ${(byYear[g.year] ?? g.items.length) === 1 ? "entrada" : "entradas"}`}
                bodyClassName="gap-0! py-1! lg:py-2!"
              >
                  {g.items.map((e) => (
                    <EntryCard
                      key={e.id}
                      entry={e}
                      index={i++}
                      selectHref={withVer(e.id)}
                      selected={reading?.id === e.id}
                    />
                  ))}
              </JCard>
            ))}
            {hasMore && (
              <Link
                href={`/journal?${more}`}
                scroll={false}
                className="mx-auto inline-flex h-11 items-center rounded-full border border-line-strong px-5 text-sm font-medium transition-[background-color,scale] duration-[var(--dur-quick)] hover:bg-surface-2"
              >
                Ver más entradas
              </Link>
            )}
          </div></SwapOnChange>
        )}
      </div>

      {/* Panel de la computadora: la entrada elegida, o el recuerdo y un resumen. */}
      {/* minmax(0,1fr) y min-w-0: un renglón que no se corta (la fecha del panel) no puede ensanchar la columna. */}
      {/* Pegado y con su propio scroll solo al leer una entrada; sin entrada elegida (recuerdo y cifras) va con
          la página: si no, en una pantalla baja las últimas semanas quedaban cortadas sin que se notara el scroll. */}
      <div
        className={
          reading
            ? "hidden min-w-0 lg:sticky lg:top-36 lg:grid lg:max-h-[calc(100dvh-10rem)] lg:grid-cols-[minmax(0,1fr)] lg:gap-5 lg:overflow-y-auto lg:overscroll-contain lg:rounded-2xl lg:pb-2 lg:[scrollbar-width:thin]"
            : "hidden min-w-0 lg:grid lg:grid-cols-[minmax(0,1fr)] lg:content-start lg:gap-5 lg:pb-2"
        }
      >
        {/* Al abrir otra entrada (o cerrar la lectura) el panel cambia con un fundido corto; al cargar, quieto. */}
        {/* Una entrada elegida se dibuja al toque con lo de la tarjeta y se completa al llegar. */}
        <ReaderSlot reading={reading} closeHref={closeHref}>
            <>
              {home.memory && !memoryDismissed && <MemoryCard memory={home.memory} today={home.today} />}
              <QuickStatsCard stats={quick} />
            </>
        </ReaderSlot>
      </div>
      </main>
    </>
  );
}

function FilterSummary({
  count,
  q,
  tag,
  mood,
  starred,
}: {
  count: number;
  q: string;
  tag: string;
  mood?: number;
  starred?: boolean;
}) {
  const parts: string[] = [];
  if (q) parts.push(`con "${q}"`);
  if (tag) parts.push(`#${tag}`);
  if (mood) parts.push(`ánimo ${moodInfo(mood)!.label.toLowerCase()}`);
  return (
    <div className="reveal flex items-center gap-3 rounded-full border bg-surface py-2 pr-2 pl-5 text-[15px]">
      <span className="min-w-0 flex-1">
        <span className="font-medium">
          {count.toLocaleString("es-UY")} {starred ? (count === 1 ? "favorita" : "favoritas") : count === 1 ? "entrada" : "entradas"}
        </span>{" "}
        <span className="text-muted">{parts.join(", ")}</span>
      </span>
      <Link href="/journal" className="inline-flex min-h-10 shrink-0 items-center rounded-full px-3 font-medium text-accent-fg hover:bg-surface-2">
        Limpiar
      </Link>
    </div>
  );
}
