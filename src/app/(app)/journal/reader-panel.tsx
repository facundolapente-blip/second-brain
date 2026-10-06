import Link from "next/link";
import { ArrowSquareOut, Fire, PencilSimple, X } from "@phosphor-icons/react/dist/ssr";
import { addDays, formatLong, startOfWeek } from "@/lib/dates";
import { moodInfo, wordCount } from "@/lib/journal-logic";
import type { EntryDTO, QuickStatsDTO } from "@/lib/journal";
import { MoodBadge } from "./journal-ui";

const nf = new Intl.NumberFormat("es-UY");

/**
 * Panel de lectura de la computadora: la entrada elegida en la lista, entera,
 * con medida de lectura cómoda. Para escribir se abre el editor.
 */
export function EntryReader({ entry, closeHref }: { entry: EntryDTO; closeHref: string }) {
  const words = wordCount(entry.body) + wordCount(entry.title ?? "");
  const paragraphs = entry.body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const mood = moodInfo(entry.mood);

  return (
    <article
      aria-label="Entrada elegida"
      className="rise rounded-2xl border border-line bg-surface"
    >
      <div className="flex items-center gap-2 border-b border-line py-2.5 pr-2.5 pl-7">
        <p className="kicker min-w-0 flex-1 truncate">
          {entry.title ? formatLong(entry.date) : entry.date.slice(0, 4)}
          <span aria-hidden> · </span>
          {words === 1 ? "1 palabra" : `${nf.format(words)} palabras`}
        </p>
        <Link
          href={`/journal/${entry.id}`}
          className="inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium text-fg transition-colors hover:bg-surface-2"
        >
          <PencilSimple size={15} aria-hidden /> Editar
        </Link>
        <Link
          href={closeHref}
          scroll={false}
          aria-label="Cerrar lectura"
          title="Cerrar lectura"
          className="relative inline-flex size-9 items-center justify-center rounded-full text-muted transition-colors before:absolute before:-inset-1 hover:bg-surface-2 hover:text-fg"
        >
          <X size={17} />
        </Link>
      </div>

      <div className="px-7 pt-7 pb-9 xl:px-10">
        <div className="mx-auto grid max-w-[64ch] gap-5">
          <div className="flex items-start gap-4">
            {/* La mayoría de las entradas no tiene título: entonces la fecha hace de título. */}
            <h2 className="display min-w-0 flex-1 text-[34px] leading-[1.08] text-pretty first-letter:uppercase">
              {entry.title || formatLong(entry.date)}
            </h2>
            {mood && <MoodBadge mood={entry.mood} size={40} />}
          </div>

          {paragraphs.length === 0 ? (
            <p className="text-[16px] text-muted">Esta entrada no tiene texto.</p>
          ) : (
            <div className="prose-serif grid gap-4 text-[17.5px] leading-[1.75] text-fg/90">
              {paragraphs.map((p, i) => (
                <p key={i} className="whitespace-pre-line">
                  {p}
                </p>
              ))}
            </div>
          )}

          {entry.tags.length > 0 && (
            <ul className="flex flex-wrap gap-1.5 pt-2" aria-label="Etiquetas">
              {entry.tags.map((t) => (
                <li key={t}>
                  <Link
                    href={`/journal?etiqueta=${encodeURIComponent(t)}`}
                    className="inline-flex h-8 items-center rounded-full bg-accent-soft px-3 text-[12.5px] font-medium text-accent-fg transition-opacity hover:opacity-80"
                  >
                    #{t}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </article>
  );
}

/**
 * Cuando no hay entrada elegida: cifras rápidas y las últimas cinco semanas,
 * un cuadrito por día (lleno si escribiste). La lista es la fuente; esto resume.
 */
export function QuickStatsCard({ stats }: { stats: QuickStatsDTO }) {
  const { today } = stats;
  const written = new Set(stats.recent);
  const lastMonday = startOfWeek(today, 1);
  const weeks = Array.from({ length: 5 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => addDays(lastMonday, -7 * (4 - w) + d)),
  );
  const daysInMonthSoFar = Number(today.slice(8));
  const recentCount = weeks.flat().filter((d) => d <= today && written.has(d)).length;

  return (
    <section aria-label="Resumen del journal" className="rise grid gap-4" style={{ "--i": 2 } as React.CSSProperties}>
      <div className="grid grid-cols-3 gap-3">
        <QuickStat label="Este mes" value={stats.monthDays} hint={`de ${daysInMonthSoFar} días`} />
        <QuickStat label="Entradas" value={nf.format(stats.totalEntries)} hint={`${nf.format(stats.totalDays)} días`} />
        <QuickStat
          label="Mejor racha"
          value={stats.best}
          hint={stats.best === 1 ? "día" : "días"}
          icon={<Fire size={14} weight="fill" className="text-[var(--p-orange-solid)]" aria-hidden />}
        />
      </div>

      <div className="rounded-2xl border border-line bg-surface px-6 pt-5 pb-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Últimas cinco semanas</h2>
          <span className="font-mono text-[12px] text-muted tabular">{recentCount} días escritos</span>
        </div>
        <div className="mt-4 grid grid-cols-[repeat(7,minmax(0,1fr))] gap-1.5" role="img" aria-label={`Escribiste ${recentCount} de los últimos 35 días`}>
          {["L", "M", "M", "J", "V", "S", "D"].map((l, i) => (
            <span key={i} aria-hidden className="pb-0.5 text-center font-mono text-[10.5px] text-muted">
              {l}
            </span>
          ))}
          {weeks.flat().map((d) => {
            const future = d > today;
            const on = written.has(d);
            return (
              <span
                key={d}
                title={future ? undefined : `${formatLong(d)}: ${on ? "escribiste" : "sin entrada"}`}
                className={
                  "grid aspect-[2] place-items-center rounded-[5px] font-mono text-[10.5px] tabular " +
                  (future
                    ? "border border-dashed border-line text-faint"
                    : on
                      ? "bg-accent text-on-accent"
                      : "bg-surface-2 text-muted") +
                  (d === today ? " ring-2 ring-fg ring-offset-2 ring-offset-surface" : "")
                }
              >
                {Number(d.slice(8))}
              </span>
            );
          })}
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-[13px]">
          <span className="flex items-center gap-3 text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 rounded-[3px] bg-accent" /> Escribiste
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 rounded-[3px] bg-surface-2 ring-1 ring-line" /> Sin entrada
            </span>
          </span>
          <Link href="/journal/estadisticas" className="inline-flex min-h-11 items-center gap-1 font-medium text-accent-fg hover:underline">
            Estadísticas <ArrowSquareOut size={14} aria-hidden />
          </Link>
        </div>
      </div>
      <p className="px-1 text-[13px] text-muted">
        Elegí una entrada de la lista para leerla acá. Para escribir, abrila con Editar.
      </p>
    </section>
  );
}

function QuickStat({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  hint: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="grid content-start gap-1 rounded-2xl border border-line bg-surface px-4 pt-3.5 pb-4">
      <span className="kicker flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      <span className="figure pt-1 text-[30px]">{value}</span>
      <span className="text-[12.5px] text-muted">{hint}</span>
    </div>
  );
}

