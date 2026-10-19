import Link from "next/link";
import { ArrowSquareOut, Fire } from "@phosphor-icons/react/dist/ssr";
import { addDays, formatLong, startOfWeek } from "@/lib/dates";
import type { QuickStatsDTO } from "@/lib/journal";

const nf = new Intl.NumberFormat("es-UY");

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

