import { JCard, JStat } from "./cards";
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

  const monthPct = daysInMonthSoFar ? stats.monthDays / daysInMonthSoFar : 0;

  return (
    <section aria-label="Resumen del journal" className="grid gap-4">
      <div className="grid grid-cols-3 gap-3">
        <JStat icon="calendar" label="Este mes" href="/journal/calendario" figure={stats.monthDays} sub={`de ${daysInMonthSoFar} días`}>
          <span
            className="tcard-bar mt-0!"
            role="progressbar"
            aria-label="Días escritos este mes"
            aria-valuemin={0}
            aria-valuemax={daysInMonthSoFar}
            aria-valuenow={stats.monthDays}
          >
            <span style={{ width: `${Math.round(monthPct * 100)}%` }} />
          </span>
        </JStat>
        <JStat
          icon="notebook"
          label="Entradas"
          href="/journal/estadisticas"
          figure={nf.format(stats.totalEntries)}
          sub={`${nf.format(stats.totalDays)} días`}
        />
        <JStat icon="fire" label="Mejor racha" figure={stats.best} unit={stats.best === 1 ? "día" : "días"} />
      </div>

      <JCard
        icon="chart"
        title="Últimas cinco semanas"
        meta={`${recentCount} ${recentCount === 1 ? "día escrito" : "días escritos"}`}
        action={{ href: "/journal/estadisticas", label: "Estadísticas" }}
      >
        <div className="grid grid-cols-[repeat(7,minmax(0,1fr))] gap-1.5" role="img" aria-label={`Escribiste ${recentCount} de los últimos 35 días`}>
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
        <div className="flex items-center gap-3 border-t border-line pt-3 text-[13px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-[3px] bg-accent" /> Escribiste
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-[3px] bg-surface-2 ring-1 ring-line" /> Sin entrada
          </span>
        </div>
      </JCard>
      <p className="px-1 text-[13px] text-muted">
        Elegí una entrada de la lista para leerla acá. Para escribir, abrila con Editar.
      </p>
    </section>
  );
}
