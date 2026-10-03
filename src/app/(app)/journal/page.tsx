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
          <section className="rise grid gap-3 pt-1 lg:pt-0">
            <p className="label-mono text-muted">{formatLong(home.today)}</p>
            <p className="font-serif text-[32px] leading-[1.05] tracking-[-0.02em] text-balance lg:text-[42px]">
              {greeting(home.hour)}
              {firstName && `, ${firstName}`}
            </p>
            {home.streak > 0 && (
              <p className="flex items-stretch self-start border border-line-strong bg-surface">
                <span className="flex items-center gap-1.5 border-r border-line-strong px-2.5">
                  <Fire size={15} weight="fill" className="text-accent" aria-hidden />
                  <span className="label-mono text-[10px] text-muted">Racha</span>
                </span>
                <span className="flex items-baseline gap-1.5 px-2.5 py-1.5">
                  <span className="tabular text-[17px] leading-none font-semibold">{home.streak}</span>
                  <span className="text-[13px] text-muted">{home.streak === 1 ? "día seguido" : "días seguidos"}</span>
                </span>
              </p>
            )}
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
              <section key={g.year} className="grid gap-2">
                <h2 className="z-10 -mx-4 flex items-baseline gap-3 bg-bg px-4 py-1.5 max-lg:sticky max-lg:top-[calc(3.5rem+1px+env(safe-area-inset-top))]">
                  <span className="tabular text-[22px] leading-none font-semibold tracking-tight">{g.year}</span>
                  <span aria-hidden className="h-px flex-1 self-center bg-line-strong" />
                </h2>
                <div className="grid divide-y divide-line border border-line-strong">
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
                className="label-mono mx-auto inline-flex h-11 items-center rounded-md border border-rule px-5 transition-colors hover:bg-surface-2 active:translate-y-px"
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
    <div className="flex items-center gap-3 border border-rule border-l-4 border-l-accent bg-surface px-4 py-3 text-sm">
      <span className="min-w-0 flex-1">
        <span className="font-medium">
          {count}
          {hasMore ? "+" : ""} {count === 1 ? "entrada" : "entradas"}
        </span>{" "}
        <span className="text-muted">{parts.join(", ")}</span>
      </span>
      <Link href="/journal" className="label-mono inline-flex h-11 shrink-0 items-center px-1 text-accent-fg">

        Limpiar
      </Link>
    </div>
  );
}
