import Link from "next/link";
import { Fire, MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import { cookies } from "next/headers";
import { getAllTags, getEntries, getEntry, getHome, getQuickStats } from "@/lib/journal";
import { formatLong } from "@/lib/dates";
import { isMood, MEMORY_COOKIE, moodInfo, normalizeTag } from "@/lib/journal-logic";
import { EntryCard, JournalHeader } from "./journal-ui";
import { JournalTabs, WriteTodayButton } from "./journal-nav";
import { EmptyJournal, HomeActions, MemoryCard } from "./home-parts";
import { EntryReader, QuickStatsCard } from "./reader-panel";

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
  const limit = Math.min(2000, Math.max(60, Number(one(sp.n)) || 60));
  const filtering = !!(q || tag || mood);
  const ver = one(sp.ver).slice(0, 64);

  const [home, { entries, hasMore }, tags, jar, reading, quick] = await Promise.all([
    getHome(),
    getEntries({ q, tag, mood, limit }),
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
            <HomeActions q={q} tag={tag} mood={mood ?? null} tags={tags} />
            <span className="ml-2">
              <WriteTodayButton wroteToday={home.wroteToday} />
            </span>
          </>
        }
      />

      <main className="mx-auto max-w-3xl px-4 pt-3 lg:grid lg:max-w-6xl lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-10 lg:px-10 lg:pt-8">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8">
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

        {filtering && (
          <FilterSummary count={entries.length} hasMore={hasMore} q={q} tag={tag} mood={mood} />
        )}

        {entries.length === 0 ? (
          filtering ? (
            <div className="grid justify-items-center gap-2 py-16 text-center">
              <span className="inline-flex size-11 items-center justify-center rounded-full border border-line-strong text-muted">
                <MagnifyingGlass size={20} aria-hidden />
              </span>
              <p className="display text-[24px]">No hay entradas que coincidan</p>
              <p className="max-w-[36ch] text-sm text-muted">Probá con otra palabra o sacá algún filtro. La búsqueda no distingue tildes ni mayúsculas.</p>
            </div>
          ) : (
            <EmptyJournal />
          )
        ) : (
          <div className="grid gap-10">
            {years.map((g) => (
              <section key={g.year} className="grid">
                <h2 className="figure z-10 -mx-4 flex items-baseline gap-3 border-b border-fg/80 bg-bg/92 px-4 pt-2 pb-2 text-[30px] backdrop-blur-md max-lg:sticky max-lg:top-[calc(4rem+env(safe-area-inset-top))] lg:mx-0 lg:px-0 lg:text-[36px]">
                  {g.year}
                </h2>
                <div className="grid">
                  {g.items.map((e) => (
                    <EntryCard
                      key={e.id}
                      entry={e}
                      index={i++}
                      selectHref={withVer(e.id)}
                      selected={reading?.id === e.id}
                    />
                  ))}
                </div>
              </section>
            ))}
            {hasMore && (
              <Link
                href={`/journal?${more}`}
                scroll={false}
                className="mx-auto inline-flex h-11 items-center rounded-[4px] border border-line-strong px-5 text-sm font-medium transition-colors hover:bg-surface-2 active:scale-[0.98]"
              >
                Ver más entradas
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Panel de la computadora: la entrada elegida, o el recuerdo y un resumen. */}
      <div className="hidden lg:sticky lg:top-36 lg:grid lg:max-h-[calc(100dvh-10rem)] lg:gap-5 lg:overflow-y-auto lg:overscroll-contain lg:rounded-2xl lg:pb-2 lg:[scrollbar-width:thin]">
        {reading ? (
          <EntryReader key={reading.id} entry={reading} closeHref={closeHref} />
        ) : (
          <>
            {home.memory && !memoryDismissed && (
              <div className="rounded-2xl border border-line bg-surface px-6 pb-1 [&>section]:border-y-0">
                <MemoryCard memory={home.memory} today={home.today} />
              </div>
            )}
            <QuickStatsCard stats={quick} />
          </>
        )}
      </div>
      </main>
    </>
  );
}

function FilterSummary({
  count,
  hasMore,
  q,
  tag,
  mood,
}: {
  count: number;
  hasMore: boolean;
  q: string;
  tag: string;
  mood?: number;
}) {
  const parts: string[] = [];
  if (q) parts.push(`con "${q}"`);
  if (tag) parts.push(`#${tag}`);
  if (mood) parts.push(`ánimo ${moodInfo(mood)!.label.toLowerCase()}`);
  return (
    <div className="flex items-center gap-3 border-y border-line py-3 text-[15px]">
      <span className="min-w-0 flex-1">
        <span className="font-medium">
          {count}
          {hasMore ? "+" : ""} {count === 1 ? "entrada" : "entradas"}
        </span>{" "}
        <span className="text-muted">{parts.join(", ")}</span>
      </span>
      <Link href="/journal" className="shrink-0 font-medium text-accent-fg">
        Limpiar
      </Link>
    </div>
  );
}
