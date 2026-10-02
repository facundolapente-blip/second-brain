import Link from "next/link";
import { Fire, MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import { cookies } from "next/headers";
import { getAllTags, getEntries, getHome } from "@/lib/journal";
import { getUsuario } from "@/lib/session";
import { formatLong } from "@/lib/dates";
import { greeting, isMood, MEMORY_COOKIE, moodInfo, normalizeTag } from "@/lib/journal-logic";
import { EntryCard, JournalHeader } from "./journal-ui";
import { JournalTabs, WriteTodayButton } from "./journal-nav";
import { EmptyJournal, HomeActions, MemoryCard } from "./home-parts";

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

  const [home, { entries, hasMore }, tags, user, jar] = await Promise.all([
    getHome(),
    getEntries({ q, tag, mood, limit }),
    getAllTags(),
    getUsuario(),
    cookies(),
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
  more.set("n", String(limit + 120));

  const firstName = user?.name?.split(" ")[0] ?? "";
  let i = 0;

  return (
    <>
      <JournalHeader
        title="Journal"
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

      <main className="mx-auto grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-6 px-4 pt-3 lg:px-8 lg:pt-6">
        {!filtering && (
          <section className="rise grid gap-1.5 pt-1 lg:pt-0">
            <p className="font-serif text-[30px] leading-[1.1] tracking-[-0.015em] text-balance lg:text-[36px]">
              {greeting(home.hour)}
              {firstName && `, ${firstName}`}
            </p>
            <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-muted">
              <span className="first-letter:uppercase">{formatLong(home.today)}</span>
              {home.streak > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 py-0.5 pr-2.5 pl-2 text-[13px] text-fg">
                  <Fire size={14} weight="fill" className="text-[var(--p-orange-solid)]" aria-hidden />
                  <span className="tabular">{home.streak === 1 ? "1 día seguido" : `${home.streak} días seguidos`}</span>
                </span>
              )}
            </p>
          </section>
        )}

        {!filtering && home.memory && !memoryDismissed && <MemoryCard memory={home.memory} today={home.today} />}

        {filtering && (
          <FilterSummary count={entries.length} hasMore={hasMore} q={q} tag={tag} mood={mood} />
        )}

        {entries.length === 0 ? (
          filtering ? (
            <div className="grid justify-items-center gap-2 py-16 text-center">
              <span className="inline-flex size-11 items-center justify-center rounded-full bg-surface-2 text-muted">
                <MagnifyingGlass size={22} aria-hidden />
              </span>
              <p className="text-[15px] font-medium">No hay entradas que coincidan</p>
              <p className="max-w-[36ch] text-sm text-muted">Probá con otra palabra o sacá algún filtro. La búsqueda distingue tildes.</p>
            </div>
          ) : (
            <EmptyJournal />
          )
        ) : (
          <div className="grid gap-6">
            {years.map((g) => (
              <section key={g.year} className="grid gap-3">
                <h2 className="tabular z-10 -mx-4 bg-bg/90 px-4 py-1.5 text-[15px] font-semibold tracking-tight backdrop-blur-md max-lg:sticky max-lg:top-[calc(3.5rem+env(safe-area-inset-top))]">
                  {g.year}
                </h2>
                <div className="grid gap-3">
                  {g.items.map((e) => (
                    <EntryCard key={e.id} entry={e} index={i++} />
                  ))}
                </div>
              </section>
            ))}
            {hasMore && (
              <Link
                href={`/journal?${more}`}
                scroll={false}
                className="mx-auto inline-flex h-11 items-center rounded-md border border-line-strong px-5 text-sm font-medium transition-colors hover:bg-surface-2 active:scale-[0.98]"
              >
                Ver más entradas
              </Link>
            )}
          </div>
        )}
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
    <div className="flex items-center gap-3 rounded-[12px] bg-surface-2 px-4 py-3 text-sm">
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
